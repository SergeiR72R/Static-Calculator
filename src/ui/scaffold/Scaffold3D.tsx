import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { ScaffoldStructure } from '../../scaffold/structure';
import { KIND_COLOR } from '../../scaffold/catalog';
import { useStore } from '../../state/store';
import { useFmt } from '../hooks';

export interface Scaffold3DProps {
  st: ScaffoldStructure;
  /** colour of the parts of a girder by its result */
  girderColor: Record<string, string>;
  selected: string[];
  /** parts moved by the snapping (marked) */
  moved: string[];
  resetKey: number;
  onPick: (partId: string | null) => void;
  /** hover text of a part */
  describe: (partId: string) => string;
}

interface Scene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  content: THREE.Group;
  /** pickable meshes with the part id per instance */
  pick: { mesh: THREE.InstancedMesh; ids: string[] }[];
  render: () => void;
}

const SEL = '#f59e0b';
const MOVED = '#e11d48';

/** drawing (x, y, z up) → three.js (x, y up, z towards the viewer) */
const toThree = (p: number[], c: number[]) => new THREE.Vector3(p[0] - c[0], p[2] - c[2], -(p[1] - c[1]));

/** Interactive 3D view of the scaffold: system lines as tubes, decks as plates, rosettes. */
export default function Scaffold3D({ st, girderColor, selected, moved, resetKey, onPick, describe }: Scaffold3DProps) {
  const fmt = useFmt();
  const theme = useStore((s) => s.theme);
  const host = useRef<HTMLDivElement>(null);
  const sc = useRef<Scene | null>(null);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  // renderer once
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.01, 10000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(1, 2.5, 2);
    scene.add(sun);
    const back = new THREE.DirectionalLight(0xffffff, 0.5);
    back.position.set(-1, -0.5, -2);
    scene.add(back);
    const content = new THREE.Group();
    scene.add(content);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    sc.current = { renderer, scene, camera, controls, content, pick: [], render };
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      controls.dispose();
      renderer.forceContextLoss();
      renderer.dispose();
      renderer.domElement.remove();
      sc.current = null;
    };
  }, []);

  const center = [(st.min[0] + st.max[0]) / 2, (st.min[1] + st.max[1]) / 2, st.min[2]];

  // geometry
  useEffect(() => {
    const s = sc.current;
    if (!s) return;
    for (const c of [...s.content.children]) {
      s.content.remove(c);
      c.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
    }
    s.pick = [];
    const sel = new Set(selected);
    const mov = new Set(moved);
    const partGirder = new Map<string, string>();
    for (const g of st.girders) for (const id of g.parts) partGirder.set(id, g.key);
    const colorOf = (id: string, kind: keyof typeof KIND_COLOR) => {
      if (sel.has(id)) return SEL;
      const g = partGirder.get(id);
      if (g && girderColor[g]) return girderColor[g];
      if (mov.has(id)) return MOVED;
      return KIND_COLOR[kind];
    };

    // tubes
    const segs: { a: THREE.Vector3; b: THREE.Vector3; r: number; color: string; id: string }[] = [];
    const decks: { min: THREE.Vector3; max: THREE.Vector3; color: string; id: string }[] = [];
    const ros: { p: THREE.Vector3; id: string }[] = [];
    for (const w of st.parts) {
      const color = colorOf(w.part.id, w.cls.kind);
      if (w.cls.kind === 'deck') {
        decks.push({ min: toThree(w.min, center), max: toThree(w.max, center), color, id: w.part.id });
        continue;
      }
      for (const [a, b] of w.lines) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        if (len < 1e-4) continue;
        const r = w.cls.kind.startsWith('flex') || w.cls.kind === 'girder' ? (len > 0.6 ? 0.026 : 0.016) : 0.024;
        segs.push({ a: toThree(a, center), b: toThree(b, center), r, color, id: w.part.id });
      }
      // rosettes only on standards (circles of other parts' line blocks, e.g. the ULS Flex connector, are no nodes)
      if (w.cls.kind === 'standard' || w.cls.kind === 'base') for (const p of w.rosettes) ros.push({ p: toThree(p, center), id: w.part.id });
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();
    if (segs.length) {
      const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), segs.length);
      segs.forEach((g, i) => {
        const d = new THREE.Vector3().subVectors(g.b, g.a);
        const l = d.length();
        q.setFromUnitVectors(up, d.normalize());
        m4.compose(new THREE.Vector3().addVectors(g.a, g.b).multiplyScalar(0.5), q, new THREE.Vector3(g.r, l, g.r));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.set(g.color));
      });
      mesh.computeBoundingSphere();
      s.content.add(mesh);
      s.pick.push({ mesh, ids: segs.map((g) => g.id) });
    }
    if (decks.length) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ transparent: true, opacity: 0.55 }), decks.length);
      decks.forEach((d, i) => {
        const size = new THREE.Vector3(Math.abs(d.max.x - d.min.x) || 0.01, 0.02, Math.abs(d.max.z - d.min.z) || 0.01);
        m4.compose(new THREE.Vector3((d.min.x + d.max.x) / 2, d.min.y, (d.min.z + d.max.z) / 2), new THREE.Quaternion(), size);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.set(d.color));
      });
      mesh.computeBoundingSphere();
      s.content.add(mesh);
      s.pick.push({ mesh, ids: decks.map((d) => d.id) });
    }
    if (ros.length) {
      const geo = new THREE.CylinderGeometry(0.06, 0.06, 0.012, 12);
      const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x0f766e }), ros.length);
      ros.forEach((r, i) => {
        m4.makeTranslation(r.p.x, r.p.y, r.p.z);
        mesh.setMatrixAt(i, m4);
      });
      s.content.add(mesh);
    }
    // girder labels (T1, T2, …) above the middle of the top chord
    for (const g of st.girders) {
      const cv = document.createElement('canvas');
      cv.width = 128;
      cv.height = 64;
      const ctx = cv.getContext('2d');
      if (!ctx) continue;
      ctx.fillStyle = girderColor[g.key] ?? '#0d9488';
      ctx.beginPath();
      ctx.roundRect(4, 8, 120, 48, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(g.key, 64, 33);
      const tex = new THREE.CanvasTexture(cv);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      const mid = [g.origin[0] + (g.u[0] * g.L) / 2, g.origin[1] + (g.u[1] * g.L) / 2, g.zTop + 0.35];
      spr.position.copy(toThree(mid, center));
      spr.scale.set(0.5, 0.25, 1);
      spr.renderOrder = 10;
      s.content.add(spr);
    }
    // ground grid
    const span = Math.max(st.max[0] - st.min[0], st.max[1] - st.min[1], 2) * 1.4;
    const grid = new THREE.GridHelper(Math.ceil(span), Math.ceil(span), theme === 'dark' ? 0x334155 : 0xcbd5e1, theme === 'dark' ? 0x1e293b : 0xe2e8f0);
    grid.position.set(0, -0.002, 0);
    s.content.add(grid);
    s.render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, girderColor, selected, moved, theme]);

  // camera
  useEffect(() => {
    const s = sc.current;
    if (!s) return;
    const size = new THREE.Vector3(st.max[0] - st.min[0], st.max[2] - st.min[2], st.max[1] - st.min[1]);
    const r = Math.max(size.length() / 2, 1);
    const target = new THREE.Vector3(0, size.y / 2, 0);
    const dist = r / Math.sin(((s.camera.fov / 2) * Math.PI) / 180) / Math.min(1, s.camera.aspect || 1) * 0.85;
    const dir = new THREE.Vector3(-0.55, 0.45, 1).normalize();
    s.controls.target.copy(target);
    s.camera.position.copy(target).addScaledVector(dir, dist);
    s.camera.near = r / 200;
    s.camera.far = r * 100;
    s.camera.updateProjectionMatrix();
    s.controls.update();
    s.render();
     
  }, [st.min, st.max, resetKey]);

  const hit = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = sc.current;
    if (!s) return null;
    const r = s.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, s.camera);
    const hs = ray.intersectObjects(s.pick.map((p) => p.mesh), false);
    const h = hs[0];
    if (!h || h.instanceId === undefined) return { id: null, x: e.clientX - r.left, y: e.clientY - r.top };
    const p = s.pick.find((x) => x.mesh === h.object)!;
    return { id: p.ids[h.instanceId], x: e.clientX - r.left, y: e.clientY - r.top };
  };

  if (failed) return <p className="p-6 text-center text-sm text-slate-500">{fmt.t('view3d.noWebgl')}</p>;
  return (
    <div
      ref={host}
      className="relative h-[460px] w-full cursor-grab overflow-hidden active:cursor-grabbing lg:h-[540px]"
      data-testid="scaffold-3d"
      dir="ltr"
      onPointerMove={(e) => {
        if (e.buttons) return;
        const h = hit(e);
        setTip(h?.id ? { x: h.x, y: h.y, text: describe(h.id) } : null);
      }}
      onPointerDown={(e) => (down.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => {
        const d = down.current;
        down.current = null;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
        onPick(hit(e)?.id ?? null);
      }}
      onPointerLeave={() => setTip(null)}
    >
      {tip && (
        <div
          className="pointer-events-none absolute z-10 max-w-[320px] rounded bg-slate-900/90 px-2 py-1 text-xs text-white shadow"
          style={{ left: Math.min(tip.x + 12, (host.current?.clientWidth ?? 600) - 330), top: tip.y + 12 }}
          data-testid="scaffold-3d-tip"
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
