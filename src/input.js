import * as THREE from 'three';
import { CELL, BUILDINGS } from './data.js';
import { buildingMesh, ghostMaterial, applyMaterialRecursive } from './meshes.js';

export class Input {
  constructor(game, renderer, camera, canvas) {
    this.g = game; this.renderer = renderer; this.camera = camera; this.canvas = canvas;
    const s = game.starts[0];
    this.cam = { x: s.x, z: s.z, yaw: 0, pitch: 0.95, dist: 60 };
    this.keys = new Set(); this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2, inside: false }; this.ndc = new THREE.Vector2();
    this.ray = new THREE.Raycaster();
    this.selected = []; this.groups = new Map();
    this.buildType = null; this.ghost = null; this.ghostCell = null; this.ghostOk = false;
    this.pendingAttackMove = false; this.drag = null; this.midDrag = null;
    this.onSelectionChange = () => {}; this.onHotkey = () => false; this.onToggleHelp = () => {}; this.onTogglePause = () => {};
    this.edgeScroll = true; this.lastClick = { t: 0, id: -1 };
    this.bind();
  }
  bind() {
    const c = this.canvas;
    window.addEventListener('keydown', e => this.keyDown(e));
    window.addEventListener('keyup', e => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('mousedown', e => this.mouseDown(e));
    window.addEventListener('mousemove', e => this.mouseMove(e));
    window.addEventListener('mouseup', e => this.mouseUp(e));
    c.addEventListener('wheel', e => { e.preventDefault(); this.cam.dist = Math.max(18, Math.min(140, this.cam.dist * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    document.addEventListener('mouseenter', () => { this.mouse.inside = true; });
    c.addEventListener('dblclick', e => this.doubleClick(e));
  }
  // ---------- 鍵盤 ----------
  keyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    this.keys.add(e.code);
    if (e.code === 'Escape') { if (this.buildType) this.cancelBuild(); else if (this.pendingAttackMove) this.pendingAttackMove = false; else this.select([]); return; }
    if (e.code === 'F1') { e.preventDefault(); this.onToggleHelp(); return; }
    if (e.code === 'Space') { e.preventDefault(); this.onTogglePause(); return; }
    if (e.code === 'KeyH') { const tc = this.g.buildings.find(b => b.owner === 0 && b.type === 'towncenter'); if (tc) { this.jumpTo(tc.x, tc.z); if (!e.shiftKey) this.select([tc]); } return; }
    if (e.code === 'Period') { const idle = this.g.idleVillagers(0); if (idle.length) { const i = (this.idleCycle = ((this.idleCycle || 0) + 1) % idle.length); this.select([idle[i]]); this.jumpTo(idle[i].x, idle[i].z); } return; }
    if (e.code === 'Delete') { for (const s of [...this.selected]) if (s.owner === 0) this.g.deleteEntity(s); this.select([]); return; }
    if (/^Digit[1-9]$/.test(e.code)) {
      const n = e.code[5];
      if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.groups.set(n, [...this.selected]); for (const s of this.selected) s.group = n; }
      else { const grp = (this.groups.get(n) || []).filter(x => !x.dead); if (grp.length) { this.select(grp); if (this.lastGroupKey === n && performance.now() - this.lastGroupT < 400) this.jumpTo(grp[0].x, grp[0].z); this.lastGroupKey = n; this.lastGroupT = performance.now(); } }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
    if (this.onHotkey(key)) { e.preventDefault(); this.keys.delete(e.code); }
  }
  // ---------- 相機 ----------
  jumpTo(x, z) { this.cam.x = x; this.cam.z = z; }
  update(dt) {
    const c = this.cam; const k = this.keys;
    const sp = (c.dist * 0.9 + 10) * dt;
    const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = -fz, rz = fx;
    let mx = 0, mz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) { mx += fx; mz += fz; }
    if (k.has('KeyS') || k.has('ArrowDown')) { mx -= fx; mz -= fz; }
    if (k.has('KeyA') || k.has('ArrowLeft')) { mx -= rx; mz -= rz; }
    if (k.has('KeyD') || k.has('ArrowRight')) { mx += rx; mz += rz; }
    if (k.has('KeyQ')) c.yaw += dt * 1.6;
    if (k.has('KeyE')) c.yaw -= dt * 1.6;
    if (this.edgeScroll && this.mouse.inside && document.hasFocus() && !this.drag) {
      const m = this.mouse, W = window.innerWidth, H = window.innerHeight, E = 14;
      if (m.x < E) { mx -= rx; mz -= rz; } if (m.x > W - E) { mx += rx; mz += rz; }
      if (m.y < E) { mx += fx; mz += fz; } if (m.y > H - E) { mx -= fx; mz -= fz; }
    }
    c.x += mx * sp; c.z += mz * sp;
    const lim = this.g.size / 2 - 6; c.x = Math.max(-lim, Math.min(lim, c.x)); c.z = Math.max(-lim, Math.min(lim, c.z));
    const ty = this.g.worldY(c.x, c.z);
    const cp = Math.cos(c.pitch), spp = Math.sin(c.pitch);
    this.camera.position.set(c.x + Math.sin(c.yaw) * cp * c.dist, ty + spp * c.dist, c.z + Math.cos(c.yaw) * cp * c.dist);
    this.camera.lookAt(c.x, ty, c.z);
    const sun = this.g.sun; sun.position.set(c.x + 60, ty + 110, c.z + 40); sun.target.position.set(c.x, ty, c.z);
    if (this.buildType) this.updateGhost();
    this.selected = this.selected.filter(s => !s.dead);
  }
  // ---------- 滑鼠 ----------
  setNdc(e) { this.ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); }
  pick(e) {
    this.setNdc(e); this.ray.setFromCamera(this.ndc, this.camera);
    const g = this.g; const objs = [];
    for (const u of g.units) if (!u.dead) objs.push(u.mesh);
    for (const b of g.buildings) if (!b.dead) objs.push(b.mesh);
    for (const r of g.resources) if (!r.dead && r.mesh) objs.push(r.mesh);
    objs.push(g.trees.trunk, g.trees.leaf, g.terrain.mesh);
    const hits = this.ray.intersectObjects(objs, true);
    let ground = null, entity = null;
    for (const h of hits) {
      if (h.object === g.terrain.mesh) { if (!ground) ground = h.point; continue; }
      if (h.object.isInstancedMesh) { const n = h.object.userData.nodes[h.instanceId]; if (n && !n.dead) { if (!entity) entity = n; } continue; }
      let o = h.object; while (o && !o.userData.entity) o = o.parent;
      if (o && o.userData.entity && !o.userData.entity.dead) { if (!entity) entity = o.userData.entity; }
      if (entity && ground) break;
    }
    if (!ground) { // 與 y=0 平面相交
      const t = -this.ray.ray.origin.y / this.ray.ray.direction.y; if (t > 0) ground = this.ray.ray.at(t, new THREE.Vector3());
    }
    return { ground, entity };
  }
  mouseDown(e) {
    if (e.button === 1) { this.midDrag = { x: e.clientX, y: e.clientY }; e.preventDefault(); return; }
    if (e.button === 0) {
      if (this.buildType) { this.placeBuild(e); return; }
      if (this.pendingAttackMove) { const { ground, entity } = this.pick(e); const mil = this.ownUnits().filter(u => u.isMilitary); if (entity && this.g.enemyOf({ owner: 0 }, entity)) this.g.commandTarget(mil, entity); else if (ground) this.g.commandMove(mil, ground.x, ground.z, true); this.pendingAttackMove = false; this.g.onEvent('cmd'); return; }
      this.drag = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY, shift: e.shiftKey, active: false };
      return;
    }
    if (e.button === 2) { this.rightClick(e); }
  }
  mouseMove(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true;
    if (this.midDrag) { this.cam.yaw -= (e.clientX - this.midDrag.x) * 0.006; this.cam.pitch = Math.max(0.5, Math.min(1.4, this.cam.pitch + (e.clientY - this.midDrag.y) * 0.004)); this.midDrag = { x: e.clientX, y: e.clientY }; }
    if (this.drag) { this.drag.x1 = e.clientX; this.drag.y1 = e.clientY; if (Math.abs(this.drag.x1 - this.drag.x0) + Math.abs(this.drag.y1 - this.drag.y0) > 6) this.drag.active = true; this.updateSelBox(); }
  }
  mouseUp(e) {
    if (e.button === 1) { this.midDrag = null; return; }
    if (e.button === 0 && this.drag) {
      const d = this.drag; this.drag = null; this.updateSelBox();
      if (d.active) this.boxSelect(d); else this.leftClick(e, d.shift);
    }
  }
  updateSelBox() {
    const el = document.getElementById('selbox'); const d = this.drag;
    if (!d || !d.active) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.style.left = Math.min(d.x0, d.x1) + 'px'; el.style.top = Math.min(d.y0, d.y1) + 'px';
    el.style.width = Math.abs(d.x1 - d.x0) + 'px'; el.style.height = Math.abs(d.y1 - d.y0) + 'px';
  }
  screenPos(e) { const v = new THREE.Vector3(e.x, this.g.worldY(e.x, e.z) + 0.8, e.z).project(this.camera); return { x: (v.x + 1) / 2 * window.innerWidth, y: (1 - v.y) / 2 * window.innerHeight, z: v.z }; }
  boxSelect(d) {
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    const inBox = e => { const p = this.screenPos(e); return p.z < 1 && p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1; };
    let picked = this.g.units.filter(u => u.owner === 0 && !u.dead && inBox(u));
    if (picked.some(u => u.isMilitary)) picked = picked.filter(u => u.isMilitary);
    if (!picked.length) picked = this.g.buildings.filter(b => b.owner === 0 && !b.dead && inBox(b)).slice(0, 1);
    if (d.shift) this.select([...new Set([...this.selected, ...picked])]); else this.select(picked);
  }
  leftClick(e, shift) {
    const { entity } = this.pick(e);
    if (!entity) { if (!shift) this.select([]); return; }
    if (shift) { if (this.selected.includes(entity)) this.select(this.selected.filter(s => s !== entity)); else if (entity.owner === 0 && this.selected.every(s => s.owner === 0 && s.kind === entity.kind)) this.select([...this.selected, entity]); else this.select([entity]); }
    else this.select([entity]);
  }
  doubleClick(e) {
    const { entity } = this.pick(e);
    if (!entity || entity.owner !== 0 || entity.kind !== 'unit') return;
    const same = this.g.units.filter(u => u.owner === 0 && !u.dead && u.type === entity.type && Math.hypot(u.x - entity.x, u.z - entity.z) < 35 && this.screenPos(u).z < 1);
    this.select(same);
  }
  rightClick(e) {
    if (this.buildType) { this.cancelBuild(); return; }
    if (this.pendingAttackMove) { this.pendingAttackMove = false; return; }
    const { ground, entity } = this.pick(e);
    const units = this.ownUnits();
    if (units.length) {
      if (entity) { this.g.commandTarget(units, entity); this.g.onEvent('cmd'); this.flash(entity.x, entity.z, this.g.enemyOf({ owner: 0 }, entity) ? 0xff4040 : 0x60ff60); return; }
      if (ground) { this.g.commandMove(units, ground.x, ground.z, false); this.g.onEvent('cmd'); this.flash(ground.x, ground.z, 0x60ff60); }
      return;
    }
    const b = this.selected.filter(s => s.kind === 'building' && s.owner === 0 && s.data.trains);
    if (b.length && ground) { for (const bb of b) { bb.rally = { x: ground.x, z: ground.z, target: entity && entity.owner !== 1 ? entity : null }; } this.flash(ground.x, ground.z, 0xffe060); }
  }
  flash(x, z, color) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.9, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(x, this.g.worldY(x, z) + 0.15, z); this.g.scene.add(ring);
    const t0 = performance.now(); const anim = () => { const k = (performance.now() - t0) / 500; if (k >= 1) { this.g.scene.remove(ring); return; } ring.scale.setScalar(1 + k); ring.material.opacity = 1 - k; requestAnimationFrame(anim); }; anim();
  }
  ownUnits() { return this.selected.filter(s => s.kind === 'unit' && s.owner === 0 && !s.dead); }
  select(list) {
    for (const s of this.selected) s.selected = false;
    this.selected = list.filter(s => !s.dead);
    for (const s of this.selected) s.selected = true;
    if (this.selected.length && this.selected[0].owner === 0) this.g.onEvent('select');
    this.onSelectionChange();
  }
  // ---------- 建造 ----------
  startBuild(type) {
    this.cancelBuild(); this.pendingAttackMove = false;
    this.buildType = type;
    const bd = BUILDINGS[type];
    this.ghost = buildingMesh(type, this.g.players[0].color, bd.size);
    this.ghostMats = { ok: ghostMaterial(true), bad: ghostMaterial(false) };
    applyMaterialRecursive(this.ghost, this.ghostMats.ok);
    this.g.scene.add(this.ghost);
    this.updateGhost();
  }
  cancelBuild() { if (this.ghost) this.g.scene.remove(this.ghost); this.ghost = null; this.buildType = null; this.onSelectionChange(); }
  updateGhost() {
    const bd = BUILDINGS[this.buildType]; const t = this.g.terrain;
    this.setNdc({ clientX: this.mouse.x, clientY: this.mouse.y }); this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObject(t.mesh); let p = hit.length ? hit[0].point : null;
    if (!p) { const tt = -this.ray.ray.origin.y / this.ray.ray.direction.y; if (tt > 0) p = this.ray.ray.at(tt, new THREE.Vector3()); }
    if (!p) { this.ghost.visible = false; return; }
    const cc = t.toCell(p.x, p.z); const cx = cc.cx - Math.floor(bd.size / 2), cz = cc.cz - Math.floor(bd.size / 2);
    this.ghostCell = { cx, cz }; const c = t.cellCenter(cx, cz);
    const x = c.x + (bd.size - 1) * CELL / 2, z = c.z + (bd.size - 1) * CELL / 2;
    this.ghost.visible = true; this.ghost.position.set(x, this.g.worldY(x, z) - 0.3, z);
    this.ghostOk = t.areaFree(cx, cz, bd.size) && t.inBounds(cx, cz) && t.inBounds(cx + bd.size - 1, cz + bd.size - 1);
    applyMaterialRecursive(this.ghost, this.ghostOk ? this.ghostMats.ok : this.ghostMats.bad);
  }
  placeBuild(e) {
    this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.updateGhost();
    if (!this.ghostOk) { this.g.message('此處無法建造', 'warn'); return; }
    const builders = this.ownUnits().filter(u => u.cls === 'villager');
    const b = this.g.tryBuild(this.g.players[0], this.buildType, this.ghostCell.cx, this.ghostCell.cz, builders);
    if (b) { this.g.onEvent('cmd'); if (!BUILDINGS[this.buildType].repeat && !e.shiftKey) this.cancelBuild(); else this.updateGhost(); }
  }
}
