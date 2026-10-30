import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { valuesAt } from '../../core/results';
import { designStrength } from '../../sections/materials';
import { useStore } from '../../state/store';
import { useFmt, useResults } from '../hooks';
import { buildBeamMesh, fieldValue, type HeatField } from './beamMesh';
import { buildLatticeGroup } from './latticeMesh';
import { analyzeLattice, latticeOf, latticeView } from '../../core/lattice';
import { MEMBER_SAMPLES } from '../../core/frame2d';

export interface Beam3DProps {
  field: HeatField;
  sectionScale: number;
  deformed: boolean;
  /** increment to reset the camera */
  resetKey: number;
  onRange: (r: { min: number; max: number; diverging: boolean }) => void;
}

interface Scene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  beam: THREE.Mesh | null;
  extras: THREE.Group;
  /** lattice members for picking */
  pick: THREE.Object3D[];
  cursor: THREE.Mesh;
  render: () => void;
}

/** Interactive 3D view of the beam with a heat map (three.js, loaded on demand). */
export default function Beam3D({ field, sectionScale, deformed, resetKey, onRange }: Beam3DProps) {
  const fmt = useFmt();
  const { an, vr, checks } = useResults();
  const view = useStore((s) => s.view);
  const theme = useStore((s) => s.theme);
  const cursorX = useStore((s) => s.cursorX);
  const setCursor = useStore((s) => s.setCursor);
  const host = useRef<HTMLDivElement>(null);
  const sc = useRef<Scene | null>(null);
  const [failed, setFailed] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);

  // lattice girder: member values of the displayed result (N, σ) or the utilisation η
  const lat = useMemo(() => {
    if (!an.ok || !latticeOf(an.model)) return null;
    const la = analyzeLattice(an);
    if (!la || la.error) return null;
    const r = latticeView(an, la, view);
    if (!r) return null;
    const S = MEMBER_SAMPLES;
    const etas = checks?.peri.find((p) => p.method === 'lattice')?.lattice?.members.map((m) => m.eta) ?? [];
    const N = la.model.members.map((_, k) => (Math.abs(r.Nmax[k]) >= Math.abs(r.Nmin[k]) ? r.Nmax[k] : r.Nmin[k]));
    const sig = la.model.members.map((m, k) => {
      let best = 0;
      for (let s = 0; s < S; s++)
        for (const n of [r.Nmax[k], r.Nmin[k]])
          for (const M of [r.Mmax[k * S + s], r.Mmin[k * S + s]])
            for (const sg of [1, -1]) {
              const v = n / m.sec.A + (sg * Math.abs(M)) / m.sec.Wel;
              if (Math.abs(v) > Math.abs(best)) best = v;
            }
      return best;
    });
    const values = field === 'eta' ? etas : field === 'sigma' ? sig : N;
    const m = Math.max(1e-9, ...values.map(Math.abs));
    const range = field === 'eta' ? { min: 0, max: Math.max(1, m), diverging: false } : { min: -m, max: m, diverging: true };
    return { la, values, range, N, etas };
  }, [an, view, checks, field]);

  const mesh = useMemo(() => (an.ok && vr && !lat ? buildBeamMesh(an, vr, { field, sectionScale, deformed }) : null), [an, vr, field, sectionScale, deformed, lat]);

  // lattice girder instead of the beam
  useEffect(() => {
    const s = sc.current;
    if (!s || !lat) return;
    if (s.beam) {
      s.scene.remove(s.beam);
      s.beam.geometry.dispose();
      s.beam = null;
    }
    s.extras.clear();
    const lm = lat.la.model;
    const { group, pick } = buildLatticeGroup(lm, { values: lat.values, range: lat.range, scale: sectionScale, supports: lat.la.supports.map((p) => p.x) });
    s.extras.add(group);
    s.pick = pick;
    onRange(lat.range);
    const L = an.model.L;
    const grid = new THREE.GridHelper(L * 1.3, 26, theme === 'dark' ? 0x334155 : 0xcbd5e1, theme === 'dark' ? 0x1e293b : 0xe2e8f0);
    grid.position.set(L / 2, -lm.h / 2 - 0.62, 0);
    s.extras.add(grid);
    s.cursor.scale.set(0.4, lm.h * 1.6, 1);
    s.render();
  }, [lat, an, theme, onRange, sectionScale]);

  // create renderer once
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
    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(1, 2.5, 2);
    scene.add(sun);
    const back = new THREE.DirectionalLight(0xffffff, 0.6);
    back.position.set(-1, -0.5, -2);
    scene.add(back);
    const extras = new THREE.Group();
    scene.add(extras);
    const cursor = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }),
    );
    cursor.rotation.y = Math.PI / 2;
    cursor.visible = false;
    scene.add(cursor);
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);
    sc.current = { renderer, scene, camera, controls, beam: null, extras, pick: [], cursor, render };
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
      renderer.dispose();
      renderer.domElement.remove();
      sc.current = null;
    };
  }, []);

  // (re)build the beam
  useEffect(() => {
    const s = sc.current;
    if (!s || !mesh) return;
    s.pick = [];
    if (s.beam) {
      s.scene.remove(s.beam);
      s.beam.geometry.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mesh.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(mesh.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
    geo.computeVertexNormals();
    const beam = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    s.scene.add(beam);
    s.beam = beam;
    onRange(mesh.range);

    // supports, hinges and ground grid
    s.extras.clear();
    const L = an.model.L;
    const h = Math.max(mesh.height, 1e-3);
    const size = Math.min(Math.max(h * 0.45, L / 70), L / 25);
    const bottom = -h / 2 - 0.02 * h;
    const supMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
    for (const sp of an.model.supports) {
      let obj: THREE.Mesh;
      if (sp.type === 'fixed') {
        obj = new THREE.Mesh(new THREE.BoxGeometry(size * 0.25, size * 2.2, Math.max(mesh.width, size) * 1.6), supMat);
        obj.position.set(sp.x <= 1e-9 ? -size * 0.125 : sp.x >= L - 1e-9 ? L + size * 0.125 : sp.x, 0, 0);
      } else if (sp.type === 'spring') {
        obj = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.12, size * 0.12, size, 12), new THREE.MeshLambertMaterial({ color: 0xea580c }));
        obj.position.set(sp.x, bottom - size / 2, 0);
      } else {
        obj = new THREE.Mesh(new THREE.ConeGeometry(size * 0.6, size, 4), supMat);
        obj.position.set(sp.x, bottom - size / 2, 0);
        if (sp.type === 'roller') {
          const roll = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.15, size * 0.15, size * 1.2, 16), supMat);
          roll.rotation.x = Math.PI / 2;
          roll.position.set(sp.x, bottom - size * 1.18, 0);
          s.extras.add(roll);
        }
      }
      s.extras.add(obj);
    }
    for (const hg of an.model.hinges) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.12, h * 0.12, Math.max(mesh.width, h) * 1.3, 20), new THREE.MeshLambertMaterial({ color: 0x334155 }));
      pin.rotation.x = Math.PI / 2;
      pin.position.set(hg.x, 0, 0);
      s.extras.add(pin);
    }
    const grid = new THREE.GridHelper(L * 1.3, 26, theme === 'dark' ? 0x334155 : 0xcbd5e1, theme === 'dark' ? 0x1e293b : 0xe2e8f0);
    grid.position.set(L / 2, bottom - size * 1.4, 0);
    s.extras.add(grid);
    s.cursor.scale.set(Math.max(mesh.width, h) * 1.8, h * 1.8, 1);
    s.render();
  }, [mesh, an, theme, onRange]);

  // camera framing (initially and on reset / new beam length)
  const L = an.model.L;
  useEffect(() => {
    const s = sc.current;
    if (!s) return;
    // fit the whole beam horizontally: distance from the horizontal field of view
    const aspect = s.camera.aspect || 2;
    const halfH = Math.atan(Math.tan(((s.camera.fov / 2) * Math.PI) / 180) * aspect);
    const dist = (L * 0.62) / Math.tan(halfH);
    const dir = new THREE.Vector3(-0.32, 0.3, 1).normalize();
    s.controls.target.set(L / 2, 0, 0);
    s.camera.position.set(L / 2 + dir.x * dist, dir.y * dist, dir.z * dist);
    s.camera.near = L / 1000;
    s.camera.far = L * 50;
    s.camera.updateProjectionMatrix();
    s.controls.update();
    s.render();
  }, [L, resetKey]);

  // synchronous cursor with the diagrams
  useEffect(() => {
    const s = sc.current;
    if (!s) return;
    s.cursor.visible = cursorX !== null;
    if (cursorX !== null) s.cursor.position.set(cursorX, 0, 0);
    s.render();
  }, [cursorX]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = sc.current;
    if (!s || e.buttons) return;
    const r = s.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, s.camera);
    if (lat) {
      const hit = ray.intersectObjects(s.pick)[0];
      if (!hit) {
        setTip(null);
        return;
      }
      const k = hit.object.userData.member as number;
      const m = lat.la.model.members[k];
      setCursor(Math.min(Math.max(hit.point.x, 0), an.model.L));
      setTip({
        x: e.clientX - r.left,
        y: e.clientY - r.top,
        text: `${fmt.t(`kpi.lattice.${m.role}`)} ${m.sec.name} · N = ${fmt.q(lat.N[k], 'force')}${lat.etas[k] !== undefined ? ` · η = ${fmt.num(lat.etas[k] * 100, 1)} %` : ''}`,
      });
      return;
    }
    if (!s.beam || !vr || !mesh) return;
    const hit = ray.intersectObject(s.beam)[0];
    if (!hit) {
      setTip(null);
      return;
    }
    const x = Math.min(Math.max(hit.point.x, 0), an.model.L);
    setCursor(x);
    const v = valuesAt(an, vr, x);
    const pick = (a: number, b?: number) => (b !== undefined && Math.abs(b) > Math.abs(a) ? b : a);
    const N = pick(v.left.N, v.leftMin?.N);
    const V = pick(v.left.V, v.leftMin?.V);
    const M = pick(v.left.M, v.leftMin?.M);
    const w = pick(v.left.w, v.leftMin?.w);
    const ei = an.mesh!.elements.findIndex((el) => x >= el.x1 - 1e-12 && x <= el.x2 + 1e-12);
    const el = an.mesh!.elements[Math.max(0, ei)];
    const zRel = -(hit.point.y + w * mesh.deformFactor) / mesh.sectionScale;
    const val = fieldValue(field, N, V, M, w, zRel, el.section, designStrength(el.material));
    const text =
      field === 'sigma'
        ? `σ = ${fmt.q(val, 'stress')}  ·  z = ${fmt.q(zRel, 'sectionDim', 0)}`
        : field === 'eta'
          ? `η = ${fmt.num(val * 100, 1)} %  ·  z = ${fmt.q(zRel, 'sectionDim', 0)}`
          : field === 'M'
            ? `M = ${fmt.q(val, 'moment')}`
            : field === 'V'
              ? `${fmt.t('sym.V')} = ${fmt.q(val, 'force')}`
              : `w = ${fmt.q(val, 'deflection')}`;
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text: `x = ${fmt.q(x, 'length')}  ·  ${text}` });
  };

  if (failed) return <p className="p-6 text-center text-sm text-slate-500">{fmt.t('view3d.noWebgl')}</p>;
  return (
    <div
      ref={host}
      className="relative h-[380px] w-full cursor-grab overflow-hidden active:cursor-grabbing"
      data-testid="beam-3d"
      dir="ltr"
      onPointerMove={onMove}
      onPointerLeave={() => {
        setTip(null);
        setCursor(null);
      }}
    >
      {tip && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded bg-slate-900/90 px-2 py-1 text-xs text-white shadow num"
          style={{ left: Math.min(tip.x + 12, (host.current?.clientWidth ?? 600) - 260), top: tip.y + 12 }}
          data-testid="beam-3d-tip"
        >
          {tip.text}
        </div>
      )}
    </div>
  );
}
