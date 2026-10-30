/**
 * 3D model of a lattice girder: chords, diagonals, verticals as tubes / rectangular hollow sections
 * in their real dimensions (optionally exaggerated), coloured per member; scaffold standards with
 * couplers (ULA / ULS) or ledger heads (ULS Flex) at the supports.
 *
 * Coordinates: X = girder axis, Y = up (centre of the girder at 0), Z = width.
 */
import * as THREE from 'three';
import type { LatticeModel } from '../../sections/lattice';
import { heatColor, type HeatRange } from './heat';

export interface LatticeMeshOptions {
  /** value per member and colour range */
  values: number[];
  range: HeatRange;
  /** exaggeration of the member dimensions */
  scale: number;
  /** x of the supports (standards) */
  supports: number[];
}

const STD_D = 0.0483;

export function buildLatticeGroup(lm: LatticeModel, o: LatticeMeshOptions): { group: THREE.Group; pick: THREE.Object3D[] } {
  const g = new THREE.Group();
  const pick: THREE.Object3D[] = [];
  const y0 = -lm.h / 2;
  const P = (x: number, z: number) => new THREE.Vector3(x, y0 + z, 0);
  lm.members.forEach((m, k) => {
    const a = P(lm.nodes[m.i].x, lm.nodes[m.i].z);
    const b = P(lm.nodes[m.j].x, lm.nodes[m.j].z);
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-9) return;
    const sec = m.sec;
    const geo = sec.tube ? new THREE.CylinderGeometry((sec.h / 2) * o.scale, (sec.h / 2) * o.scale, len, 14) : new THREE.BoxGeometry(sec.b * o.scale, len, sec.h * o.scale);
    const c = heatColor(o.values[k] ?? 0, o.range);
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(c[0], c[1], c[2]) }));
    mesh.position.copy(a).addScaledVector(dir, 0.5);
    // cylinder / box axis = local Y → member direction; in-plane height of the RHS stays in the girder plane
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    mesh.quaternion.copy(q);
    mesh.userData = { member: k };
    g.add(mesh);
    pick.push(mesh);
  });
  // standards and bearings
  const stdMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.85 });
  const coupMat = new THREE.MeshLambertMaterial({ color: lm.bearing === 'head' ? 0x0ea5e9 : 0xf59e0b });
  const chordD = Math.max(...lm.members.filter((m) => m.role === 'top').map((m) => m.sec.b), STD_D);
  for (const x of o.supports) {
    // couplers: standard beside the girder; ULS Flex: in the plane (ledger heads, connectors)
    const z = lm.bearing === 'head' ? 0 : -(chordD / 2 + STD_D / 2) * o.scale;
    const hStd = lm.h + 1.2;
    const std = new THREE.Mesh(new THREE.CylinderGeometry((STD_D / 2) * o.scale, (STD_D / 2) * o.scale, hStd, 14), stdMat);
    std.position.set(x, 0, z);
    g.add(std);
    for (const zc of [0, lm.h]) {
      const s = 0.07 * o.scale;
      const cp = new THREE.Mesh(new THREE.BoxGeometry(s, s, s + Math.abs(z)), coupMat);
      cp.position.set(x, y0 + zc, z / 2);
      g.add(cp);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.15 * o.scale, 0.01 * o.scale, 0.15 * o.scale), stdMat);
    plate.position.set(x, -hStd / 2, z);
    g.add(plate);
  }
  return { group: g, pick };
}
