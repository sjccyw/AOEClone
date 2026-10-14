import * as THREE from 'three';
import { CELL } from './data.js';

const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts }));
  return matCache.get(key);
}
const C = {
  wall: 0xe3d3ad, wallDark: 0xc9b58a, roof: 0x3d4250, roofDark: 0x2c3040, red: 0x8f2323, wood: 0x7a5230, woodDark: 0x5a3a1c,
  stone: 0x8f8f8a, stoneDark: 0x6c6c68, skin: 0xe6c3a0, straw: 0xc9a84c, iron: 0x6f7378, bronze: 0x9c7a3a, horse: 0x6e4a2a, horse2: 0x3a2a1a,
  leaf: 0x3f7f2b, leaf2: 0x2f6a22, trunk: 0x5d3f24, berry: 0x9a2f5a, gold: 0xe0b020,
};
export const COLORS = C;

function box(w, h, d, color, x = 0, y = 0, z = 0, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z); m.castShadow = shadow; m.receiveShadow = true; return m;
}
function cyl(rt, rb, h, color, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(color));
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m;
}
// 中式屋頂：四角攢尖 / 歇山樣式（以四邊錐體加寬簷）
function roof(w, d, h, y, color = C.roof) {
  const g = new THREE.Group();
  const r = Math.max(w, d) / 2 * Math.SQRT2;
  const top = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), mat(color));
  top.rotation.y = Math.PI / 4; top.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
  top.position.y = y + h / 2; top.castShadow = true; top.receiveShadow = true;
  g.add(top);
  // 簷
  const eave = new THREE.Mesh(new THREE.ConeGeometry(r * 1.22, h * 0.28, 4), mat(color === C.roof ? C.roofDark : color));
  eave.rotation.y = Math.PI / 4; eave.scale.copy(top.scale); eave.position.y = y + h * 0.14 - 0.05; eave.castShadow = true;
  g.add(eave);
  // 脊
  const ridge = box(w * 0.5, 0.18, 0.18, C.roofDark, 0, y + h + 0.05, 0);
  g.add(ridge);
  return g;
}
function pillars(w, d, h, y, n = 2, color = C.red) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / (n - 1)) * i;
    g.add(cyl(0.12, 0.12, h, color, x, y + h / 2, d / 2));
    g.add(cyl(0.12, 0.12, h, color, x, y + h / 2, -d / 2));
  }
  return g;
}
function flag(x, y, z, teamColor) {
  const g = new THREE.Group();
  g.add(cyl(0.05, 0.05, 3, C.woodDark, x, y + 1.5, z));
  const f = box(1.0, 0.6, 0.04, teamColor, x + 0.55, y + 2.6, z, false);
  f.name = 'flag'; g.add(f);
  return g;
}

export function buildingMesh(type, teamColor, size) {
  const g = new THREE.Group();
  const W = size * CELL; // 世界寬度
  const base = box(W - 0.2, 0.6, W - 0.2, C.stoneDark, 0, 0.1, 0); // 基座（稍微下沉）
  g.add(base);
  switch (type) {
    case 'towncenter': {
      g.add(box(W * 0.7, 2.4, W * 0.55, C.wall, 0, 1.6, 0));
      g.add(pillars(W * 0.7, W * 0.55, 2.4, 0.4, 5));
      g.add(roof(W * 0.78, W * 0.62, 1.4, 2.8));
      g.add(box(W * 0.45, 1.6, W * 0.35, C.wall, 0, 4.6, 0));
      g.add(roof(W * 0.55, W * 0.45, 1.3, 5.4));
      g.add(box(W * 0.25, 1.2, 0.6, C.red, 0, 1.0, W * 0.3)); // 門
      g.add(flag(W * 0.38, 0.4, W * 0.38, teamColor));
      g.add(flag(-W * 0.38, 0.4, W * 0.38, teamColor));
      break;
    }
    case 'house': {
      g.add(box(W * 0.7, 1.4, W * 0.6, C.wall, 0, 1.1, 0));
      g.add(roof(W * 0.82, W * 0.72, 1.0, 1.8, C.straw));
      g.add(box(0.5, 0.8, 0.1, C.woodDark, 0, 0.8, W * 0.3));
      break;
    }
    case 'granary': {
      g.add(cyl(W * 0.33, W * 0.36, 2.0, C.straw, 0, 1.4, 0, 8));
      g.add(cyl(0.1, W * 0.45, 1.0, C.roofDark, 0, 2.9, 0, 8));
      g.add(box(0.6, 0.6, 0.6, C.wood, W * 0.35, 0.7, W * 0.3));
      break;
    }
    case 'lumber': {
      g.add(box(W * 0.6, 0.2, W * 0.5, C.woodDark, 0, 1.9, 0));
      g.add(pillars(W * 0.55, W * 0.45, 1.6, 0.4, 2, C.wood));
      g.add(roof(W * 0.75, W * 0.65, 0.7, 2.0, C.straw));
      for (let i = 0; i < 3; i++) g.add((() => { const l = cyl(0.22, 0.22, W * 0.5, C.trunk, -W * 0.3 + i * 0.5, 0.62, -W * 0.3); l.rotation.z = Math.PI / 2; return l; })());
      g.add(box(0.3, 0.9, 0.3, C.wood, W * 0.3, 0.85, W * 0.25));
      break;
    }
    case 'mine': {
      g.add(box(W * 0.6, 1.2, W * 0.5, C.stone, 0, 1.0, 0));
      g.add(roof(W * 0.75, W * 0.65, 0.7, 1.6, C.wood));
      g.add(box(0.7, 0.5, 0.6, C.stoneDark, W * 0.3, 0.65, W * 0.3));
      g.add(box(0.4, 0.4, 0.4, C.gold, -W * 0.3, 0.6, W * 0.32));
      break;
    }
    case 'farm': {
      base.scale.y = 0.4; base.position.y = 0.05;
      const soil = box(W - 0.4, 0.3, W - 0.4, 0x6b4a2b, 0, 0.3, 0);
      g.add(soil);
      const rows = size * 3;
      for (let i = 0; i < rows; i++) g.add(box(W - 0.8, 0.35, 0.3, 0x5fa03a, 0, 0.6, -W / 2 + 0.5 + (W - 1) * i / (rows - 1)));
      break;
    }
    case 'barracks': {
      g.add(box(W * 0.8, 2.0, W * 0.6, C.wall, 0, 1.4, 0));
      g.add(pillars(W * 0.8, W * 0.6, 2.0, 0.4, 4));
      g.add(roof(W * 0.9, W * 0.7, 1.2, 2.4));
      g.add(box(W * 0.3, 1.2, 0.5, C.red, 0, 1.0, W * 0.3));
      g.add(flag(W * 0.4, 0.4, W * 0.4, teamColor));
      // 兵器架
      g.add(box(1.4, 0.1, 0.1, C.wood, -W * 0.3, 1.2, W * 0.42));
      for (let i = 0; i < 4; i++) g.add(box(0.06, 1.3, 0.06, C.iron, -W * 0.3 - 0.5 + i * 0.33, 0.9, W * 0.42));
      break;
    }
    case 'archery': {
      g.add(box(W * 0.7, 1.8, W * 0.5, C.wall, 0, 1.3, -W * 0.1));
      g.add(roof(W * 0.8, W * 0.6, 1.1, 2.2));
      g.add(flag(-W * 0.4, 0.4, W * 0.4, teamColor));
      // 箭靶
      const t = cyl(0.6, 0.6, 0.1, 0xf0e0c0, W * 0.3, 1.1, W * 0.38); t.rotation.x = Math.PI / 2; g.add(t);
      const t2 = cyl(0.3, 0.3, 0.12, C.red, W * 0.3, 1.1, W * 0.38); t2.rotation.x = Math.PI / 2; g.add(t2);
      g.add(box(0.1, 1.2, 0.1, C.wood, W * 0.3, 0.6, W * 0.38));
      break;
    }
    case 'stable': {
      g.add(box(W * 0.85, 1.6, W * 0.45, C.wood, 0, 1.2, -W * 0.15));
      g.add(roof(W * 0.95, W * 0.6, 0.9, 2.0, C.straw));
      // 圍欄
      for (let i = 0; i < 5; i++) g.add(box(0.1, 0.8, 0.1, C.woodDark, -W * 0.4 + i * W * 0.2, 0.8, W * 0.4));
      g.add(box(W * 0.85, 0.08, 0.08, C.woodDark, 0, 1.0, W * 0.4));
      g.add(flag(W * 0.42, 0.4, -W * 0.4, teamColor));
      break;
    }
    case 'siege': {
      g.add(box(W * 0.8, 1.6, W * 0.6, C.wood, 0, 1.2, 0));
      g.add(roof(W * 0.9, W * 0.7, 1.0, 2.0, C.roof));
      g.add(box(0.15, 3.0, 0.15, C.woodDark, W * 0.35, 1.9, W * 0.35));
      g.add((() => { const b = box(2.0, 0.12, 0.12, C.woodDark, W * 0.35 - 0.9, 3.4, W * 0.35); b.rotation.z = 0.3; return b; })());
      break;
    }
    case 'academy': {
      g.add(box(W * 0.75, 2.2, W * 0.55, C.wall, 0, 1.5, -W * 0.05));
      g.add(pillars(W * 0.75, W * 0.55, 2.2, 0.4, 4));
      g.add(roof(W * 0.85, W * 0.65, 1.1, 2.6));
      g.add(box(W * 0.4, 1.3, W * 0.3, C.wall, 0, 4.0, -W * 0.05));
      g.add(roof(W * 0.5, W * 0.4, 1.0, 4.6));
      // 牌坊
      g.add(cyl(0.12, 0.12, 2.6, C.red, -W * 0.25, 1.7, W * 0.42));
      g.add(cyl(0.12, 0.12, 2.6, C.red, W * 0.25, 1.7, W * 0.42));
      g.add(box(W * 0.6, 0.25, 0.3, C.roofDark, 0, 3.0, W * 0.42));
      break;
    }
    case 'market': {
      g.add(box(W * 0.5, 1.4, W * 0.4, C.wall, 0, 1.1, -W * 0.15));
      g.add(roof(W * 0.6, W * 0.5, 0.8, 1.8));
      const cols = [0xc8402a, 0x2a70c8, 0xd4a017];
      for (let i = 0; i < 3; i++) {
        const x = -W * 0.3 + i * W * 0.3;
        g.add(box(1.2, 0.5, 0.8, C.wood, x, 0.75, W * 0.3));
        g.add(box(1.5, 0.08, 1.1, cols[i], x, 1.8, W * 0.3, false));
        g.add(box(0.06, 1.3, 0.06, C.woodDark, x - 0.65, 1.15, W * 0.3 + 0.45));
        g.add(box(0.06, 1.3, 0.06, C.woodDark, x + 0.65, 1.15, W * 0.3 + 0.45));
      }
      break;
    }
    case 'tower': {
      g.add(box(1.6, 3.4, 1.6, C.stone, 0, 2.0, 0));
      g.add(box(1.9, 0.5, 1.9, C.stoneDark, 0, 3.9, 0));
      g.add(box(1.4, 1.0, 1.4, C.wall, 0, 4.6, 0));
      g.add(roof(1.9, 1.9, 0.9, 5.1));
      g.add(flag(0.6, 5.0, 0.6, teamColor));
      break;
    }
    case 'wall': {
      base.visible = false;
      g.add(box(CELL, 2.2, CELL, C.stone, 0, 1.1, 0));
      g.add(box(CELL, 0.5, 0.5, C.stoneDark, 0, 2.5, 0.75));
      g.add(box(CELL, 0.5, 0.5, C.stoneDark, 0, 2.5, -0.75));
      break;
    }
  }
  return g;
}

// 單位模型
function humanoid(tunic, teamColor) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.7, 0.3, tunic, 0, 0.85, 0));
  const belt = box(0.52, 0.12, 0.32, teamColor, 0, 0.62, 0, false); g.add(belt);
  g.add(box(0.18, 0.5, 0.18, 0x3a2a1a, -0.14, 0.25, 0));
  g.add(box(0.18, 0.5, 0.18, 0x3a2a1a, 0.14, 0.25, 0));
  g.add(box(0.3, 0.3, 0.3, C.skin, 0, 1.35, 0));
  return g;
}
function horse(color) {
  const g = new THREE.Group();
  g.add(box(1.4, 0.6, 0.5, color, 0, 0.85, 0));
  g.add(box(0.35, 0.6, 0.3, color, 0.75, 1.3, 0));
  g.add(box(0.4, 0.3, 0.26, color, 0.95, 1.6, 0));
  for (const [x, z] of [[-0.5, -0.15], [-0.5, 0.15], [0.5, -0.15], [0.5, 0.15]]) g.add(box(0.15, 0.6, 0.15, C.horse2, x, 0.3, z));
  g.add(box(0.1, 0.5, 0.1, C.horse2, -0.75, 0.9, 0));
  return g;
}
export function unitMesh(type, teamColor) {
  const g = new THREE.Group();
  const tc = teamColor;
  switch (type) {
    case 'villager': {
      g.add(humanoid(0xd8c8a0, tc));
      const hat = cyl(0.05, 0.4, 0.15, C.straw, 0, 1.55, 0, 8); g.add(hat);
      const carry = box(0.3, 0.3, 0.3, C.straw, 0.35, 0.9, 0); carry.name = 'carry'; carry.visible = false; g.add(carry);
      const tool = box(0.06, 0.9, 0.06, C.wood, -0.35, 0.9, 0); g.add(tool);
      break;
    }
    case 'ge': {
      g.add(humanoid(0x8a6a3a, tc));
      g.add(box(0.5, 0.35, 0.34, C.bronze, 0, 0.95, 0));
      g.add(cyl(0.2, 0.2, 0.3, C.bronze, 0, 1.45, 0, 6));
      const pole = box(0.06, 1.9, 0.06, C.wood, 0.35, 1.0, 0.1); g.add(pole);
      g.add(box(0.4, 0.08, 0.06, C.bronze, 0.5, 1.9, 0.1));
      break;
    }
    case 'sword': {
      g.add(humanoid(0x6a4a2a, tc));
      g.add(box(0.54, 0.6, 0.36, C.iron, 0, 0.9, 0));
      g.add(cyl(0.2, 0.2, 0.3, C.iron, 0, 1.45, 0, 6));
      const sw = box(0.06, 0.9, 0.03, 0xd0d4d8, 0.4, 1.0, 0.1); g.add(sw);
      g.add(box(0.5, 0.6, 0.06, tc, -0.4, 0.9, 0.1));
      break;
    }
    case 'archer': case 'crossbow': {
      g.add(humanoid(type === 'archer' ? 0x5a7a3a : 0x4a5a6a, tc));
      g.add(cyl(0.2, 0.22, 0.2, C.wood, 0, 1.4, 0, 6));
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 4, 10, Math.PI), mat(C.woodDark)); bow.position.set(0.4, 1.0, 0.1); bow.rotation.y = Math.PI / 2; g.add(bow);
      if (type === 'crossbow') g.add(box(0.06, 0.06, 0.8, C.wood, 0.4, 1.0, 0.3));
      g.add(cyl(0.1, 0.1, 0.6, C.wood, -0.1, 1.0, -0.25, 6));
      break;
    }
    case 'chariot': {
      const h1 = horse(C.horse); h1.position.set(0.9, 0, -0.35); g.add(h1);
      const h2 = horse(0x8a6a4a); h2.position.set(0.9, 0, 0.35); g.add(h2);
      g.add(box(1.2, 0.15, 1.2, C.wood, -0.8, 0.6, 0));
      g.add(box(0.1, 0.6, 1.2, C.wood, -1.35, 0.95, 0));
      g.add(box(1.2, 0.5, 0.1, tc, -0.8, 0.9, 0.6));
      g.add(box(1.2, 0.5, 0.1, tc, -0.8, 0.9, -0.6));
      const w1 = cyl(0.5, 0.5, 0.1, C.woodDark, -0.8, 0.5, 0.7); w1.rotation.x = Math.PI / 2; g.add(w1);
      const w2 = cyl(0.5, 0.5, 0.1, C.woodDark, -0.8, 0.5, -0.7); w2.rotation.x = Math.PI / 2; g.add(w2);
      g.add(box(2.0, 0.08, 0.08, C.wood, 0.0, 0.65, 0));
      const rider = humanoid(0x8a6a3a, tc); rider.position.set(-0.8, 0.6, 0); rider.scale.setScalar(0.85); g.add(rider);
      g.add(box(0.06, 1.6, 0.06, C.wood, -0.5, 1.6, 0.25));
      break;
    }
    case 'cavalry': {
      g.add(horse(C.horse));
      const rider = humanoid(0x4a3a2a, tc); rider.position.set(0, 0.95, 0); rider.scale.setScalar(0.85); g.add(rider);
      g.add(cyl(0.18, 0.18, 0.28, C.iron, 0, 2.1, 0, 6));
      g.add(box(0.05, 1.8, 0.05, C.wood, 0.35, 1.7, 0.2));
      g.add(box(0.5, 0.6, 0.05, tc, -0.1, 1.6, 0.35));
      break;
    }
    case 'ram': {
      g.add(box(2.2, 0.3, 1.2, C.woodDark, 0, 0.6, 0));
      g.add(box(2.0, 1.0, 1.0, C.wood, 0, 1.2, 0));
      g.add(roof(2.4, 1.4, 0.6, 1.7, C.straw));
      const log = cyl(0.2, 0.2, 3.0, C.trunk, 0.4, 0.95, 0); log.rotation.z = Math.PI / 2; g.add(log);
      for (const [x, z] of [[-0.8, 0.65], [0.8, 0.65], [-0.8, -0.65], [0.8, -0.65]]) { const w = cyl(0.35, 0.35, 0.12, C.woodDark, x, 0.35, z); w.rotation.x = Math.PI / 2; g.add(w); }
      break;
    }
    case 'catapult': {
      g.add(box(2.0, 0.3, 1.4, C.woodDark, 0, 0.5, 0));
      for (const [x, z] of [[-0.7, 0.75], [0.7, 0.75], [-0.7, -0.75], [0.7, -0.75]]) { const w = cyl(0.35, 0.35, 0.12, C.woodDark, x, 0.35, z); w.rotation.x = Math.PI / 2; g.add(w); }
      g.add(box(0.15, 1.2, 0.15, C.wood, 0.3, 1.1, 0.5));
      g.add(box(0.15, 1.2, 0.15, C.wood, 0.3, 1.1, -0.5));
      const arm = box(2.2, 0.12, 0.12, C.wood, -0.3, 1.6, 0); arm.rotation.z = 0.5; arm.name = 'arm'; g.add(arm);
      g.add(box(0.35, 0.35, 0.35, C.stoneDark, -1.3, 2.1, 0));
      break;
    }
  }
  return g;
}

export function resourceMesh(type) {
  const g = new THREE.Group();
  switch (type) {
    case 'berry': {
      const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 0), mat(C.leaf2)); bush.position.y = 0.6; bush.scale.y = 0.75; bush.castShadow = true; g.add(bush);
      for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.12, 5, 4), mat(C.berry)); b.position.set(Math.cos(i * 1.3) * 0.6, 0.7 + Math.sin(i * 2.1) * 0.3, Math.sin(i * 1.3) * 0.6); g.add(b); }
      break;
    }
    case 'stone': {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), mat(C.stone)); r.position.y = 0.5; r.scale.y = 0.65; r.castShadow = true; g.add(r);
      const r2 = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), mat(C.stoneDark)); r2.position.set(0.9, 0.3, 0.6); r2.castShadow = true; g.add(r2);
      break;
    }
    case 'gold': {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 0), mat(C.stoneDark)); r.position.y = 0.5; r.scale.y = 0.65; r.castShadow = true; g.add(r);
      for (let i = 0; i < 4; i++) { const n = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat(C.gold)); n.position.set(Math.cos(i * 1.7) * 0.8, 0.6 + (i % 2) * 0.4, Math.sin(i * 1.7) * 0.8); g.add(n); }
      break;
    }
  }
  return g;
}

// 樹木使用 InstancedMesh 以提升效能
export function makeTreeInstances(count) {
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 1.6, 6); trunkGeo.translate(0, 0.8, 0);
  const leafGeo = new THREE.ConeGeometry(1.3, 3.2, 6); leafGeo.translate(0, 2.9, 0);
  const trunk = new THREE.InstancedMesh(trunkGeo, mat(C.trunk), count);
  const leaf = new THREE.InstancedMesh(leafGeo, mat(C.leaf), count);
  trunk.castShadow = true; leaf.castShadow = true; leaf.receiveShadow = true;
  trunk.instanceMatrix.setUsage(THREE.DynamicDrawUsage); leaf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  return { trunk, leaf };
}

export function selectionRing(radius, color = 0xffffff) {
  const geo = new THREE.RingGeometry(radius, radius + 0.3, 32);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }));
  m.position.y = 0.08; m.renderOrder = 2;
  return m;
}

export function hpBarSprite() {
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 8;
  const tex = new THREE.CanvasTexture(canvas);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.0, 0.25, 1); sp.renderOrder = 5;
  sp.userData.canvas = canvas; sp.userData.tex = tex; sp.userData.last = -1;
  return sp;
}
export function updateHpBar(sp, frac) {
  const q = Math.round(frac * 32);
  if (q === sp.userData.last) return; sp.userData.last = q;
  const ctx = sp.userData.canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 8); ctx.fillStyle = '#300'; ctx.fillRect(0, 0, 64, 8);
  ctx.fillStyle = frac > 0.5 ? '#4c4' : frac > 0.25 ? '#dc3' : '#d33'; ctx.fillRect(1, 1, 62 * frac, 6);
  sp.userData.tex.needsUpdate = true;
}

export function ghostMaterial(ok) {
  return new THREE.MeshLambertMaterial({ color: ok ? 0x60e060 : 0xe05050, transparent: true, opacity: 0.5, depthWrite: false });
}
export function applyMaterialRecursive(obj, m) {
  obj.traverse(o => { if (o.isMesh) { o.material = m; o.castShadow = false; } });
}
export function arrowMesh() {
  const g = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), mat(0x3a2a1a));
  return g;
}
export function rockMesh() {
  return new THREE.Mesh(new THREE.DodecahedronGeometry(0.35, 0), mat(C.stoneDark));
}
