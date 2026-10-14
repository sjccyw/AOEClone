import * as THREE from 'three';
import { CELL } from './data.js';

// 簡易可重現的亂數
export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function makeNoise(seed) {
  const rng = makeRng(seed);
  const perm = new Uint8Array(512);
  const p = []; for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = (h, x, y) => { switch (h & 3) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; default: return -x - y; } };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  return function noise2(x, y) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const A = perm[X] + Y, B = perm[X + 1] + Y;
    const n00 = grad(perm[A], x, y), n10 = grad(perm[B], x - 1, y), n01 = grad(perm[A + 1], x, y - 1), n11 = grad(perm[B + 1], x - 1, y - 1);
    const lx0 = n00 + u * (n10 - n00), lx1 = n01 + u * (n11 - n01);
    return lx0 + v * (lx1 - lx0); // 約 -1..1
  };
}

export const WATER_LEVEL = -1.4;

export class Terrain {
  constructor(seed, size, flatSpots) {
    this.size = size;
    this.half = size / 2;
    this.cells = Math.round(size / CELL);
    this.noise = makeNoise(seed);
    this.noise2 = makeNoise(seed * 7 + 13);
    this.flatSpots = flatSpots; // [{x,z,r}]
    this.heightCache = new Float32Array((this.cells + 1) * (this.cells + 1));
    this.buildMesh();
    // 阻擋格：0 可走，1 水，2 建築，3 資源
    this.blocked = new Uint8Array(this.cells * this.cells);
    for (let cz = 0; cz < this.cells; cz++) for (let cx = 0; cx < this.cells; cx++) {
      const { x, z } = this.cellCenter(cx, cz);
      if (this.height(x, z) < WATER_LEVEL + 0.25) this.blocked[cz * this.cells + cx] = 1;
    }
  }
  rawHeight(x, z) {
    const n = this.noise(x * 0.025, z * 0.025) * 1.0 + this.noise2(x * 0.06, z * 0.06) * 0.45 + this.noise(x * 0.13 + 50, z * 0.13 + 50) * 0.15;
    let h = n * 4.2;
    // 平緩起始地
    for (const s of this.flatSpots) {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d < s.r) { const t = Math.min(1, Math.max(0, (d - s.r * 0.55) / (s.r * 0.45))); const tt = t * t * (3 - 2 * t); h = 0.6 * (1 - tt) + h * tt; }
    }
    // 地圖邊緣稍微抬高
    const edge = Math.max(Math.abs(x), Math.abs(z)) / this.half;
    if (edge > 0.9) h += (edge - 0.9) * 25;
    return h;
  }
  // 以頂點網格雙線性插值（確保單位貼地）
  height(x, z) {
    const gx = (x + this.half) / CELL, gz = (z + this.half) / CELL;
    const x0 = Math.max(0, Math.min(this.cells - 1, Math.floor(gx))), z0 = Math.max(0, Math.min(this.cells - 1, Math.floor(gz)));
    const fx = Math.max(0, Math.min(1, gx - x0)), fz = Math.max(0, Math.min(1, gz - z0));
    const w = this.cells + 1;
    const h00 = this.heightCache[z0 * w + x0], h10 = this.heightCache[z0 * w + x0 + 1], h01 = this.heightCache[(z0 + 1) * w + x0], h11 = this.heightCache[(z0 + 1) * w + x0 + 1];
    return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
  }
  buildMesh() {
    const n = this.cells, w = n + 1;
    const geo = new THREE.PlaneGeometry(this.size, this.size, n, n);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.rawHeight(x, z);
      pos.setY(i, h);
      const ix = Math.round((x + this.half) / CELL), iz = Math.round((z + this.half) / CELL);
      this.heightCache[iz * w + ix] = h;
      // 顏色
      const v = this.noise2(x * 0.09 + 300, z * 0.09 + 300) * 0.5 + 0.5;
      if (h < WATER_LEVEL + 0.5) c.setHex(0xc8b377).lerp(new THREE.Color(0xb3a060), v);
      else if (h > 3.2) c.setHex(0x8a8b7a).lerp(new THREE.Color(0x6a6c5c), v);
      else { c.setHex(0x6e9b3a).lerp(new THREE.Color(0x4f7f2b), v); if (h > 2.0) c.lerp(new THREE.Color(0x8a9a4a), Math.min(1, (h - 2) / 1.2)); }
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';
    const wgeo = new THREE.PlaneGeometry(this.size, this.size);
    wgeo.rotateX(-Math.PI / 2);
    this.water = new THREE.Mesh(wgeo, new THREE.MeshLambertMaterial({ color: 0x2f6fc4, transparent: true, opacity: 0.8 }));
    this.water.position.y = WATER_LEVEL;
    this.water.name = 'water';
  }
  // 格座標轉換
  toCell(x, z) { return { cx: Math.floor((x + this.half) / CELL), cz: Math.floor((z + this.half) / CELL) }; }
  cellCenter(cx, cz) { return { x: (cx + 0.5) * CELL - this.half, z: (cz + 0.5) * CELL - this.half }; }
  inBounds(cx, cz) { return cx >= 0 && cz >= 0 && cx < this.cells && cz < this.cells; }
  isBlocked(cx, cz) { return !this.inBounds(cx, cz) || this.blocked[cz * this.cells + cx] !== 0; }
  isBlockedWorld(x, z) { const { cx, cz } = this.toCell(x, z); return this.isBlocked(cx, cz); }
  setBlocked(cx, cz, v) { if (this.inBounds(cx, cz)) this.blocked[cz * this.cells + cx] = v; }
  // 區域是否可建造
  areaFree(cx, cz, size) {
    for (let z = cz; z < cz + size; z++) for (let x = cx; x < cx + size; x++) if (this.isBlocked(x, z)) return false;
    return true;
  }
  setArea(cx, cz, size, v) { for (let z = cz; z < cz + size; z++) for (let x = cx; x < cx + size; x++) this.setBlocked(x, z, v); }
  // 找最近的可走格
  nearestFree(cx, cz, maxR = 12) {
    if (!this.isBlocked(cx, cz)) return { cx, cz };
    for (let r = 1; r <= maxR; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (!this.isBlocked(cx + dx, cz + dz)) return { cx: cx + dx, cz: cz + dz };
      }
    }
    return null;
  }
  // 直線可視性（避開阻擋格）
  lineClear(x0, z0, x1, z1) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / (CELL * 0.4));
    for (let i = 0; i <= steps; i++) { const t = i / steps; if (this.isBlockedWorld(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t)) return false; }
    return true;
  }
}

// A* 尋路（二元堆）
class Heap {
  constructor() { this.a = []; }
  push(n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; } }
  pop() { const a = this.a; const top = a[0]; const last = a.pop(); if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m; } } return top; }
  get size() { return this.a.length; }
}

export function findPath(terrain, sx, sz, tx, tz, maxNodes = 20000) {
  const n = terrain.cells;
  let s = terrain.toCell(sx, sz), t = terrain.toCell(tx, tz);
  const sf = terrain.nearestFree(s.cx, s.cz, 6); if (sf) s = sf;
  const tf = terrain.nearestFree(t.cx, t.cz, 10); if (tf) t = tf; else return null;
  if (s.cx === t.cx && s.cz === t.cz) return [{ x: tx, z: tz }];
  const g = new Float32Array(n * n).fill(Infinity);
  const parent = new Int32Array(n * n).fill(-1);
  const closed = new Uint8Array(n * n);
  const h = (cx, cz) => { const dx = Math.abs(cx - t.cx), dz = Math.abs(cz - t.cz); return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz); };
  const heap = new Heap();
  const si = s.cz * n + s.cx; g[si] = 0; heap.push({ i: si, f: h(s.cx, s.cz) });
  let best = si, bestH = h(s.cx, s.cz), expanded = 0, found = false;
  while (heap.size) {
    const cur = heap.pop(); const i = cur.i;
    if (closed[i]) continue; closed[i] = 1; expanded++;
    const cx = i % n, cz = (i / n) | 0;
    if (cx === t.cx && cz === t.cz) { best = i; found = true; break; }
    const hh = h(cx, cz); if (hh < bestH) { bestH = hh; best = i; }
    if (expanded > maxNodes) break;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (terrain.isBlocked(nx, nz)) continue;
      if (dx && dz && (terrain.isBlocked(cx + dx, cz) || terrain.isBlocked(cx, cz + dz))) continue; // 不切角
      const ni = nz * n + nx; if (closed[ni]) continue;
      const ng = g[i] + ((dx && dz) ? Math.SQRT2 : 1);
      if (ng < g[ni]) { g[ni] = ng; parent[ni] = i; heap.push({ i: ni, f: ng + h(nx, nz) }); }
    }
  }
  // 回溯
  const cells = []; let i = best; while (i !== -1) { cells.push(i); i = parent[i]; }
  cells.reverse();
  const pts = cells.map(ci => terrain.cellCenter(ci % n, (ci / n) | 0));
  if (found) pts[pts.length - 1] = { x: tx, z: tz };
  // 拉直路徑
  const out = []; let a = 0; const startPt = { x: sx, z: sz };
  let cur = startPt;
  while (a < pts.length) {
    let b = pts.length - 1;
    while (b > a && !terrain.lineClear(cur.x, cur.z, pts[b].x, pts[b].z)) b--;
    cur = pts[b]; out.push(cur); a = b + 1;
  }
  out.partial = !found;
  return out;
}
