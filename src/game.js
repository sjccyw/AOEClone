import * as THREE from 'three';
import { RES_KEYS, RES_NAMES, CELL, MAX_POP, AGES, FACTIONS, BUILDINGS, UNITS, TECHS, RESOURCE_NODES, GATHER_RATE, CARRY_CAP, MARKET, DIFFICULTY, MAP_SIZES } from './data.js';
import { Terrain, findPath, makeRng } from './world.js';
import { buildingMesh, unitMesh, resourceMesh, makeTreeInstances, selectionRing, hpBarSprite, updateHpBar, arrowMesh, rockMesh, mat } from './meshes.js';
import { AI } from './ai.js';

let nextId = 1;
const _m4 = new THREE.Matrix4();

export class Entity {
  constructor(kind, type, owner, x, z) {
    this.id = nextId++; this.kind = kind; this.type = type; this.owner = owner; this.x = x; this.z = z;
    this.hp = 1; this.maxHp = 1; this.radius = 0.5; this.mesh = null; this.dead = false; this.selected = false; this.ring = null; this.hpbar = null;
  }
  get name() { return this.data ? this.data.name : (RESOURCE_NODES[this.type] ? RESOURCE_NODES[this.type].name : this.type); }
}

export class Unit extends Entity {
  constructor(type, owner, x, z) {
    super('unit', type, owner, x, z);
    this.data = UNITS[type]; this.cls = this.data.cls;
    this.radius = this.cls === 'cavalry' || this.cls === 'siege' ? 0.9 : 0.45;
    this.state = 'idle'; this.path = null; this.pathIdx = 0; this.dest = null; this.target = null; this.attackMove = false; this.amDest = null;
    this.carry = { res: null, amt: 0 }; this.gatherNode = null; this.buildTarget = null; this.cooldown = 0; this.acquireTimer = Math.random() * 0.5;
    this.pathGoal = null; this.repathTimer = 0; this.stuck = 0; this.lastX = x; this.lastZ = z; this.facing = 0; this.bob = Math.random() * 6;
    this.group = 0; this.needPath = false; this.walkT = 0;
  }
  get isMilitary() { return this.cls !== 'villager'; }
  get isRanged() { return this.range >= 1; }
}

export class Building extends Entity {
  constructor(type, owner, cx, cz) {
    super('building', type, owner, 0, 0);
    this.data = BUILDINGS[type]; this.size = this.data.size; this.cx = cx; this.cz = cz;
    this.halfW = this.size * CELL / 2; this.radius = this.halfW;
    this.built = false; this.progress = 0; this.queue = []; this.rally = null; this.cooldown = 0; this.builders = 0;
    if (this.data.resource) { this.res = this.data.resource; this.amount = Infinity; this.worker = null; }
  }
}

export class ResourceNode extends Entity {
  constructor(type, x, z) {
    super('resource', type, -1, x, z);
    const d = RESOURCE_NODES[type]; this.res = d.res; this.amount = d.amount; this.radius = d.radius; this.inst = -1;
  }
}

export class Game {
  constructor(opts) {
    this.opts = opts;
    this.seed = opts.seed || (Math.random() * 1e9) | 0;
    this.rng = makeRng(this.seed);
    this.size = MAP_SIZES[opts.mapSize] || 200;
    this.diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.time = 0; this.speed = 1; this.paused = false; this.over = false;
    this.units = []; this.buildings = []; this.resources = []; this.projectiles = []; this.dying = []; this.rubble = [];
    this.pathBudget = 0;
    this.onMessage = () => {}; this.onEnd = () => {}; this.onEvent = () => {};
    this.attackAlerts = new Map();

    const d = this.size * 0.33;
    this.starts = [{ x: -d, z: d }, { x: d, z: -d }];
    this.setupScene();
    this.terrain = new Terrain(this.seed, this.size, this.starts.map(s => ({ x: s.x, z: s.z, r: 34 })));
    this.scene.add(this.terrain.mesh, this.terrain.water);
    this.carveCorridor();

    // 玩家
    const aiKeys = Object.keys(FACTIONS).filter(k => k !== opts.faction);
    const aiFaction = aiKeys[Math.floor(this.rng() * aiKeys.length)];
    this.players = [this.makePlayer(0, opts.faction, false), this.makePlayer(1, aiFaction, true)];
    this.players[1].ai = new AI(this, this.players[1], this.diff);

    this.populateMap();
    for (let i = 0; i < 2; i++) this.setupStart(this.players[i], this.starts[i]);
  }

  // ---------- 初始化 ----------
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xbcd6ea);
    this.scene.fog = new THREE.Fog(0xbcd6ea, 120, 320);
    this.scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6a3a, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
    sun.position.set(60, 110, 40); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.near = 10; sc.far = 400; sc.left = -90; sc.right = 90; sc.top = 90; sc.bottom = -90;
    sun.shadow.bias = -0.0015;
    this.sun = sun; this.scene.add(sun); this.scene.add(sun.target);
  }
  makePlayer(id, faction, isAI) {
    return { id, faction, fdata: FACTIONS[faction], res: { food: 250, wood: 250, stone: 100, gold: 100 }, age: 1, techs: new Set(), popCap: 0, popUsed: 0,
      color: FACTIONS[faction].color, isAI, alive: true, kills: 0, losses: 0, lastAttackedAt: -999, lastAttackedPos: null };
  }
  carveCorridor() {
    // 確保兩起始點間可通行：沿直線把水填平
    const t = this.terrain, a = this.starts[0], b = this.starts[1];
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / CELL);
    for (let i = 0; i <= steps; i++) {
      const x = a.x + (b.x - a.x) * i / steps, z = a.z + (b.z - a.z) * i / steps;
      const { cx, cz } = t.toCell(x, z);
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) if (t.inBounds(cx + dx, cz + dz) && t.blocked[(cz + dz) * t.cells + cx + dx] === 1) t.blocked[(cz + dz) * t.cells + cx + dx] = 0;
    }
  }
  populateMap() {
    const t = this.terrain, rng = this.rng, half = this.size / 2 - 8;
    const treeSpots = [];
    const occupied = (x, z) => t.isBlockedWorld(x, z);
    const nearStart = (x, z, r) => this.starts.some(s => Math.hypot(s.x - x, s.z - z) < r);
    const tryTree = (x, z) => {
      if (Math.abs(x) > half || Math.abs(z) > half) return;
      if (occupied(x, z) || nearStart(x, z, 13)) return;
      const { cx, cz } = t.toCell(x, z); const c = t.cellCenter(cx, cz);
      if (t.height(c.x, c.z) > 3.4) return;
      t.setBlocked(cx, cz, 3); treeSpots.push({ x: c.x + (rng() - 0.5) * 0.6, z: c.z + (rng() - 0.5) * 0.6, cx, cz });
    };
    // 森林叢
    const clumps = Math.round((this.size / 200) ** 2 * 26);
    for (let i = 0; i < clumps; i++) {
      const cx = (rng() * 2 - 1) * half, cz = (rng() * 2 - 1) * half;
      if (nearStart(cx, cz, 30)) { i--; continue; }
      const n = 18 + Math.floor(rng() * 40), r = 7 + rng() * 7;
      for (let k = 0; k < n; k++) { const a = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * r; tryTree(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr); }
    }
    // 起始點附近資源
    for (const s of this.starts) {
      const baseA = Math.atan2(-s.z, -s.x); // 朝地圖中心
      // 森林（側邊）
      for (const side of [1, -1]) {
        const a = baseA + side * 1.9; const fx = s.x + Math.cos(a) * 24, fz = s.z + Math.sin(a) * 24;
        for (let k = 0; k < 42; k++) { const aa = rng() * Math.PI * 2, rr = Math.sqrt(rng()) * 8.5; tryTree(fx + Math.cos(aa) * rr, fz + Math.sin(aa) * rr); }
      }
      // 漿果
      const ba = baseA + 0.5; const bx = s.x + Math.cos(ba) * 14, bz = s.z + Math.sin(ba) * 14;
      for (let k = 0; k < 6; k++) this.addResource('berry', bx + Math.cos(k * 1.05) * 2.6, bz + Math.sin(k * 1.05) * 2.6);
      // 石礦、金礦
      const sa = baseA - 0.7; for (let k = 0; k < 3; k++) this.addResource('stone', s.x + Math.cos(sa) * 20 + k * 3.2 - 3.2, s.z + Math.sin(sa) * 20 + (k % 2) * 2.5);
      const ga = baseA + Math.PI + 0.3; for (let k = 0; k < 4; k++) this.addResource('gold', s.x + Math.cos(ga) * 19 + (k % 2) * 3.2, s.z + Math.sin(ga) * 19 + Math.floor(k / 2) * 3.2);
    }
    // 中央與散落資源
    const extra = Math.round((this.size / 200) ** 2 * 6);
    for (let i = 0; i < extra; i++) {
      const x = (rng() * 2 - 1) * half * 0.8, z = (rng() * 2 - 1) * half * 0.8;
      if (nearStart(x, z, 40)) { i--; continue; }
      const type = rng() < 0.5 ? 'gold' : 'stone';
      for (let k = 0; k < 3; k++) this.addResource(type, x + k * 3.2, z + (k % 2) * 3);
      if (rng() < 0.6) for (let k = 0; k < 4; k++) this.addResource('berry', x + 8 + Math.cos(k * 1.5) * 2.5, z + Math.sin(k * 1.5) * 2.5);
    }
    // 樹木實例
    const inst = makeTreeInstances(Math.max(1, treeSpots.length));
    this.trees = inst; this.scene.add(inst.trunk, inst.leaf);
    treeSpots.forEach((s, i) => {
      const node = new ResourceNode('tree', s.x, s.z); node.inst = i; node.cx = s.cx; node.cz = s.cz;
      const sc = 0.8 + rng() * 0.5;
      _m4.compose(new THREE.Vector3(s.x, t.height(s.x, s.z) - 0.1, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28), new THREE.Vector3(sc, sc, sc));
      inst.trunk.setMatrixAt(i, _m4); inst.leaf.setMatrixAt(i, _m4);
      this.resources.push(node);
    });
    inst.trunk.instanceMatrix.needsUpdate = true; inst.leaf.instanceMatrix.needsUpdate = true;
    inst.trunk.userData.nodes = this.resources.filter(r => r.type === 'tree');
    inst.leaf.userData.nodes = inst.trunk.userData.nodes;
  }
  addResource(type, x, z) {
    const t = this.terrain; const { cx, cz } = t.toCell(x, z);
    if (t.isBlocked(cx, cz)) return null;
    const c = t.cellCenter(cx, cz);
    const node = new ResourceNode(type, c.x, c.z); node.cx = cx; node.cz = cz;
    t.setBlocked(cx, cz, 3);
    node.mesh = resourceMesh(type); node.mesh.position.set(c.x, t.height(c.x, c.z), c.z); node.mesh.rotation.y = this.rng() * 6.28;
    node.mesh.userData.entity = node; this.scene.add(node.mesh);
    this.resources.push(node);
    return node;
  }
  setupStart(player, s) {
    const t = this.terrain; const { cx, cz } = t.toCell(s.x, s.z);
    const tc = this.placeBuilding(player, 'towncenter', cx - 2, cz - 2, true);
    tc.built = true; tc.progress = 1; this.refreshBuildingMesh(tc);
    for (let i = 0; i < 3; i++) this.spawnUnit(player, 'villager', s.x - 6 + i * 2.5, s.z + 7);
    if (!player.isAI) { const u = this.spawnUnit(player, 'ge', s.x + 6, s.z + 7); }
    else this.spawnUnit(player, 'ge', s.x + 6, s.z + 7);
    this.updatePop(player);
  }

  // ---------- 工具 ----------
  message(text, cls) { this.onMessage(text, cls); }
  enemyOf(a, b) { return a.owner !== b.owner && a.owner >= 0 && b.owner >= 0; }
  edgeDist(from, to) {
    if (to.kind === 'building') { const hw = to.halfW; const dx = Math.max(Math.abs(from.x - to.x) - hw, 0), dz = Math.max(Math.abs(from.z - to.z) - hw, 0); return Math.hypot(dx, dz) - from.radius; }
    return Math.hypot(from.x - to.x, from.z - to.z) - from.radius - to.radius;
  }
  approachPoint(from, to) {
    if (to.kind !== 'building') return { x: to.x, z: to.z };
    const hw = to.halfW + CELL * 0.6;
    const x = Math.max(to.x - hw, Math.min(to.x + hw, from.x)), z = Math.max(to.z - hw, Math.min(to.z + hw, from.z));
    if (Math.abs(x - from.x) < 0.01 && Math.abs(z - from.z) < 0.01) return { x, z }; // 已在範圍內
    // 推到邊界上
    const dx = x - to.x, dz = z - to.z;
    if (Math.abs(dx) < hw && Math.abs(dz) < hw) { if (Math.abs(dx) > Math.abs(dz)) return { x: to.x + Math.sign(dx || 1) * hw, z }; return { x, z: to.z + Math.sign(dz || 1) * hw }; }
    return { x, z };
  }
  canAfford(p, cost) { return RES_KEYS.every(k => (p.res[k] || 0) >= (cost[k] || 0)); }
  pay(p, cost, sign = -1) { for (const k of RES_KEYS) if (cost[k]) p.res[k] += sign * cost[k]; }
  missingText(p, cost) { return RES_KEYS.filter(k => (cost[k] || 0) > p.res[k]).map(k => RES_NAMES[k]).join('、'); }
  unitCost(p, type) { const c = { ...UNITS[type].cost }; if (type === 'chariot' && p.fdata.mods.chariotCost) for (const k in c) c[k] = Math.round(c[k] * p.fdata.mods.chariotCost); return c; }
  buildingCost(p, type) { const c = { ...BUILDINGS[type].cost }; if (type === 'tower' && p.fdata.mods.towerCost) for (const k in c) c[k] = Math.round(c[k] * p.fdata.mods.towerCost); return c; }
  techCost(p, key) { if (p.fdata.mods.freeTech === key) return {}; const c = { ...TECHS[key].cost }; if (p.fdata.mods.techCost) for (const k in c) c[k] = Math.round(c[k] * p.fdata.mods.techCost); return c; }
  trainTime(p, type) { let t = UNITS[type].time; if (UNITS[type].cls === 'infantry' && p.fdata.mods.infantryTrain) t /= p.fdata.mods.infantryTrain; if (type === 'villager' && p.techs.has('shangyang')) t *= 0.7; return t; }
  gatherRate(p, res, farm) {
    let r = farm ? GATHER_RATE.farm : GATHER_RATE[res];
    if (p.techs.has('irontools')) r *= 1.2;
    if (farm && p.techs.has('shangyang')) r *= 1.3;
    if (res === 'wood' && p.fdata.mods.gatherWood) r *= p.fdata.mods.gatherWood;
    if (res === 'gold' && p.fdata.mods.gatherGold) r *= p.fdata.mods.gatherGold;
    if (p.isAI) r *= this.diff.gather;
    return r;
  }
  computeStats(p, u) {
    const d = u.data, m = p.fdata.mods, T = p.techs;
    let hp = d.hp, atk = d.atk, armor = d.armor, range = d.range, speed = d.speed;
    if (u.cls === 'infantry' && m.infantryAtk) atk *= m.infantryAtk;
    if (u.type === 'sword' && m.swordHp) hp *= m.swordHp;
    if (u.cls === 'cavalry' && m.cavalryHp) hp *= m.cavalryHp;
    if (u.cls === 'archer' && m.archerRange) range += m.archerRange;
    if (u.type === 'crossbow' && m.crossbowAtk) atk *= m.crossbowAtk;
    if (u.cls === 'cavalry' && T.has('hufu')) { atk += 3; speed *= 1.15; }
    if (u.cls === 'archer' && T.has('hanbow')) atk += 3;
    if (d.range < 1 && u.cls !== 'villager' && T.has('ironweapon')) { atk += 3; armor += 1; }
    if (u.cls !== 'villager' && T.has('sunzi')) atk *= 1.15;
    return { hp: Math.round(hp), atk: Math.round(atk * 10) / 10, armor, range, speed };
  }
  applyStats(u) {
    const p = this.players[u.owner]; const s = this.computeStats(p, u);
    const frac = u.maxHp ? u.hp / u.maxHp : 1;
    u.maxHp = s.hp; u.hp = Math.min(s.hp, Math.max(1, Math.round(frac * s.hp))); u.atk = s.atk; u.armor = s.armor; u.range = s.range; u.speed = s.speed;
  }
  applyBuildingStats(b) {
    const p = this.players[b.owner]; let hp = b.data.hp; if (p.techs.has('mohist')) hp = Math.round(hp * 1.25);
    const frac = b.maxHp ? b.hp / b.maxHp : 1; b.maxHp = hp; b.hp = Math.min(hp, Math.max(1, Math.round(frac * hp)));
    b.range = (b.data.range || 0) + (p.techs.has('mohist') ? 2 : 0); b.atk = b.data.atk || 0;
  }
  refreshAllStats(p) {
    for (const u of this.units) if (u.owner === p.id) this.applyStats(u);
    for (const b of this.buildings) if (b.owner === p.id) this.applyBuildingStats(b);
  }
  updatePop(p) {
    let cap = 0; for (const b of this.buildings) if (b.owner === p.id && b.built && b.data.pop) cap += b.data.pop;
    p.popCap = Math.min(MAX_POP, cap);
    let used = 0; for (const u of this.units) if (u.owner === p.id) used++;
    for (const b of this.buildings) if (b.owner === p.id) for (const q of b.queue) if (q.kind === 'unit') used++;
    p.popUsed = used;
  }
  worldY(x, z) { return this.terrain.height(x, z); }

  // ---------- 生成 ----------
  spawnUnit(p, type, x, z) {
    const u = new Unit(type, p.id, x, z);
    this.applyStats(u); u.hp = u.maxHp;
    u.mesh = unitMesh(type, p.color); u.mesh.userData.entity = u; u.mesh.position.set(x, this.worldY(x, z), z);
    u.ring = selectionRing(u.radius + 0.3, p.id === 0 ? 0xffffff : 0xff6060); u.ring.visible = false; u.mesh.add(u.ring);
    this.scene.add(u.mesh); this.units.push(u);
    return u;
  }
  placeBuilding(p, type, cx, cz, instant = false) {
    const b = new Building(type, p.id, cx, cz);
    const c = this.terrain.cellCenter(cx, cz);
    b.x = c.x + (b.size - 1) * CELL / 2; b.z = c.z + (b.size - 1) * CELL / 2;
    this.terrain.setArea(cx, cz, b.size, 2);
    this.applyBuildingStats(b); b.hp = instant ? b.maxHp : Math.max(1, Math.round(b.maxHp * 0.1));
    b.mesh = new THREE.Group(); b.mesh.position.set(b.x, this.worldY(b.x, b.z) - 0.3, b.z); b.mesh.userData.entity = b;
    b.ring = selectionRing(b.halfW * 1.1, p.id === 0 ? 0xffffff : 0xff6060); b.ring.visible = false; b.ring.position.y = 0.4; b.mesh.add(b.ring);
    this.scene.add(b.mesh); this.buildings.push(b);
    this.refreshBuildingMesh(b);
    if (b.data.resource) { b.radius = b.halfW; }
    // 把站在建築內的單位推出去
    for (const u of this.units) if (Math.abs(u.x - b.x) < b.halfW + u.radius && Math.abs(u.z - b.z) < b.halfW + u.radius) this.pushOut(u, b);
    return b;
  }
  pushOut(u, b) {
    const { cx, cz } = this.terrain.toCell(u.x, u.z);
    const f = this.terrain.nearestFree(cx, cz, 8); if (f) { const c = this.terrain.cellCenter(f.cx, f.cz); u.x = c.x; u.z = c.z; }
  }
  refreshBuildingMesh(b) {
    const p = this.players[b.owner];
    while (b.mesh.children.length > 1) b.mesh.remove(b.mesh.children[b.mesh.children.length - 1]);
    const body = buildingMesh(b.type, p.color, b.size);
    if (!b.built) {
      const s = 0.15 + 0.85 * b.progress; body.scale.y = s;
      body.traverse(o => { if (o.isMesh) o.material = mat(0xb08a5a, { transparent: true, opacity: 0.75 }); });
      // 鷹架
      const sc = new THREE.Group(); const w = b.halfW;
      for (const [x, z] of [[-w, -w], [w, -w], [-w, w], [w, w]]) { const pole = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.5, 0.12), mat(0x7a5230)); pole.position.set(x, 1.75, z); sc.add(pole); }
      body.add(sc);
    }
    body.name = 'body'; b.mesh.add(body);
  }

  // ---------- 指令 ----------
  stopUnit(u) { u.state = 'idle'; u.path = null; u.target = null; u.dest = null; u.attackMove = false; u.amDest = null; u.buildTarget = null; if (u.gatherNode && u.gatherNode.worker === u) u.gatherNode.worker = null; u.gatherNode = null; }
  commandMove(units, x, z, attackMove = false) {
    if (!units.length) return;
    const t = this.terrain; const n = units.length;
    let cxm = 0, czm = 0; for (const u of units) { cxm += u.x; czm += u.z; } cxm /= n; czm /= n;
    const ang = Math.atan2(z - czm, x - cxm);
    const cols = Math.ceil(Math.sqrt(n)); const big = units.some(u => u.radius > 0.6); const sp = big ? 2.4 : 1.5;
    const sorted = [...units].sort((a, b) => (a.cls === b.cls ? 0 : a.cls === 'archer' ? 1 : -1));
    sorted.forEach((u, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const ox = -(r) * sp, oz = (c - (cols - 1) / 2) * sp;
      const dx = Math.cos(ang) * ox - Math.sin(ang) * oz, dz = Math.sin(ang) * ox + Math.cos(ang) * oz;
      let gx = x + dx, gz = z + dz;
      if (t.isBlockedWorld(gx, gz)) { const cc = t.toCell(gx, gz); const f = t.nearestFree(cc.cx, cc.cz, 6); if (f) { const c2 = t.cellCenter(f.cx, f.cz); gx = c2.x; gz = c2.z; } }
      this.stopUnit(u);
      u.state = attackMove && u.isMilitary ? 'attackmove' : 'move'; u.dest = { x: gx, z: gz }; u.amDest = attackMove ? { x: gx, z: gz } : null; u.attackMove = attackMove && u.isMilitary;
      this.requestPath(u, gx, gz);
    });
  }
  commandTarget(units, target) {
    for (const u of units) {
      if (target.kind === 'resource' || (target.kind === 'building' && target.data.resource && target.owner === u.owner && target.built)) {
        if (u.cls === 'villager') this.setGather(u, target); else this.commandMove([u], target.x, target.z);
      } else if (target.kind === 'building' && target.owner === u.owner) {
        if (u.cls === 'villager' && (!target.built || target.hp < target.maxHp)) { this.stopUnit(u); u.state = 'build'; u.buildTarget = target; this.requestPathTo(u, target); }
        else this.commandMove([u], target.x + (u.x - target.x) * 0.1, target.z + (u.z - target.z) * 0.1);
      } else if (this.enemyOf(u, target)) {
        this.setAttack(u, target);
      } else this.commandMove([u], target.x, target.z);
    }
  }
  setAttack(u, target) { this.stopUnit(u); u.state = 'attack'; u.target = target; u.repathTimer = 0; this.requestPathTo(u, target); }
  setGather(u, node) {
    this.stopUnit(u);
    if (node.kind === 'building') { // 農田
      if (node.worker && node.worker !== u && !node.worker.dead && node.worker.gatherNode === node) {
        const alt = this.findFarm(u, node); if (alt) node = alt; else { this.message('農田已有農民耕作', 'warn'); u.state = 'idle'; return; }
      }
      node.worker = u;
    }
    if (u.carry.amt > 0 && u.carry.res !== node.res) u.carry = { res: null, amt: 0 };
    u.state = 'gather'; u.gatherNode = node; this.requestPathTo(u, node);
  }
  findFarm(u, exclude) {
    let best = null, bd = 1e9;
    for (const b of this.buildings) if (b.owner === u.owner && b.type === 'farm' && b.built && b !== exclude && (!b.worker || b.worker.dead || b.worker.gatherNode !== b)) { const d = Math.hypot(b.x - u.x, b.z - u.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  requestPath(u, x, z) { u.needPath = true; u.pathGoal = { x, z }; }
  requestPathTo(u, target) { const p = this.approachPoint(u, target); this.requestPath(u, p.x, p.z); }
  tryBuild(p, type, cx, cz, builders) {
    const bd = BUILDINGS[type];
    if (p.age < (bd.age || 1)) { this.message(`需要進入${AGES[bd.age - 1].name}`, 'warn'); return null; }
    const cost = this.buildingCost(p, type);
    if (!this.canAfford(p, cost)) { if (!p.isAI) this.message(`資源不足：${this.missingText(p, cost)}`, 'warn'); return null; }
    if (!this.terrain.areaFree(cx, cz, bd.size)) { if (!p.isAI) this.message('此處無法建造', 'warn'); return null; }
    this.pay(p, cost);
    const b = this.placeBuilding(p, type, cx, cz);
    for (const u of builders || []) if (u.cls === 'villager' && !u.dead) { this.stopUnit(u); u.state = 'build'; u.buildTarget = b; this.requestPathTo(u, b); }
    return b;
  }
  trainUnit(b, type) {
    const p = this.players[b.owner]; const ud = UNITS[type];
    if (!b.built) return false;
    if (p.age < (ud.age || 1)) { this.message(`需要進入${AGES[ud.age - 1].name}`, 'warn'); return false; }
    if (b.queue.length >= 8) { this.message('佇列已滿', 'warn'); return false; }
    this.updatePop(p);
    if (p.popUsed + 1 > p.popCap) { if (!p.isAI) this.message('人口已達上限，請建造民居', 'warn'); return false; }
    const cost = this.unitCost(p, type);
    if (!this.canAfford(p, cost)) { if (!p.isAI) this.message(`資源不足：${this.missingText(p, cost)}`, 'warn'); return false; }
    this.pay(p, cost);
    b.queue.push({ kind: 'unit', key: type, t: 0, total: this.trainTime(p, type), cost });
    this.updatePop(p);
    return true;
  }
  researchTech(b, key) {
    const p = this.players[b.owner]; const td = TECHS[key];
    if (p.techs.has(key) || this.isQueued(p, 'tech', key)) return false;
    if (p.age < td.age) { this.message(`需要進入${AGES[td.age - 1].name}`, 'warn'); return false; }
    const cost = this.techCost(p, key);
    if (!this.canAfford(p, cost)) { if (!p.isAI) this.message(`資源不足：${this.missingText(p, cost)}`, 'warn'); return false; }
    this.pay(p, cost);
    b.queue.push({ kind: 'tech', key, t: 0, total: td.time, cost });
    return true;
  }
  isQueued(p, kind, key) { for (const b of this.buildings) if (b.owner === p.id) for (const q of b.queue) if (q.kind === kind && (!key || q.key === key)) return true; return false; }
  ageUpReady(p) {
    if (p.age >= AGES.length) return { ok: false, reason: '已達最終時代' };
    const a = AGES[p.age];
    const missing = a.req.filter(k => !this.buildings.some(b => b.owner === p.id && b.type === k && b.built));
    if (missing.length) return { ok: false, reason: `需要建造：${missing.map(k => BUILDINGS[k].name).join('、')}` };
    if (!this.canAfford(p, a.cost)) return { ok: false, reason: `資源不足：${this.missingText(p, a.cost)}` };
    if (this.isQueued(p, 'age')) return { ok: false, reason: '研究中' };
    return { ok: true };
  }
  ageUp(b) {
    const p = this.players[b.owner]; const r = this.ageUpReady(p);
    if (!r.ok) { if (!p.isAI) this.message(r.reason, 'warn'); return false; }
    const a = AGES[p.age]; this.pay(p, a.cost);
    b.queue.push({ kind: 'age', key: p.age + 1, t: 0, total: 70, cost: a.cost });
    return true;
  }
  cancelQueue(b, idx) { const q = b.queue[idx]; if (!q) return; this.pay(this.players[b.owner], q.cost, 1); b.queue.splice(idx, 1); this.updatePop(this.players[b.owner]); }
  marketTrade(p, res, buy) {
    if (buy) { if (p.res.gold < MARKET.buyCost) { this.message('黃金不足', 'warn'); return; } p.res.gold -= MARKET.buyCost; p.res[res] += MARKET.buyAmount; }
    else { if (p.res[res] < MARKET.sellAmount) { this.message(`${RES_NAMES[res]}不足`, 'warn'); return; } p.res[res] -= MARKET.sellAmount; p.res.gold += MARKET.sellGain; }
  }
  deleteEntity(e) { if (e.kind === 'unit') this.killUnit(e, null); else if (e.kind === 'building') this.destroyBuilding(e, null); }
  setRally(b, x, z) { b.rally = { x, z }; }

  // ---------- 更新 ----------
  update(dt) {
    if (this.paused || this.over) return;
    dt = Math.min(dt, 0.1) * this.speed;
    this.time += dt;
    this.pathBudget = 14;
    for (const u of this.units) this.updateUnit(u, dt);
    for (const b of this.buildings) this.updateBuilding(b, dt);
    this.updateProjectiles(dt);
    this.separate();
    for (const u of this.units) this.updateUnitVisual(u, dt);
    this.updateDying(dt);
    this.players[1].ai.update(dt);
    this.cleanup();
    if (this.time > 5) this.checkEnd();
  }
  updateUnit(u, dt) {
    if (u.dead) return;
    u.cooldown = Math.max(0, u.cooldown - dt);
    if (u.needPath && this.pathBudget > 0) {
      this.pathBudget--; u.needPath = false;
      u.path = findPath(this.terrain, u.x, u.z, u.pathGoal.x, u.pathGoal.z); u.pathIdx = 0; u.stuck = 0;
    }
    switch (u.state) {
      case 'idle': {
        if (u.isMilitary) { u.acquireTimer -= dt; if (u.acquireTimer <= 0) { u.acquireTimer = 0.5; const e = this.findEnemyNear(u, u.isRanged ? u.range + 3 : 9); if (e) { this.setAttack(u, e); } } }
        else if (u.gatherNode) { this.setGather(u, u.gatherNode); }
        break;
      }
      case 'move': {
        if (this.followPath(u, dt)) { if (this.retryPartial(u)) break; u.state = 'idle'; u.path = null; }
        break;
      }
      case 'attackmove': {
        u.acquireTimer -= dt;
        if (u.acquireTimer <= 0) { u.acquireTimer = 0.4; const e = this.findEnemyNear(u, u.isRanged ? u.range + 3 : 9); if (e) { const am = u.amDest; this.setAttack(u, e); u.amDest = am; u.attackMove = true; break; } }
        if (this.followPath(u, dt)) { if (this.retryPartial(u)) break; u.state = 'idle'; u.path = null; }
        break;
      }
      case 'attack': {
        const t = u.target;
        if (!t || t.dead) {
          if (u.attackMove && u.amDest) { const d = u.amDest; this.stopUnit(u); u.state = 'attackmove'; u.amDest = d; u.attackMove = true; u.dest = d; this.requestPath(u, d.x, d.z); }
          else { const am = u.attackMove; this.stopUnit(u); if (am) u.acquireTimer = 0; }
          break;
        }
        const d = this.edgeDist(u, t);
        const inRange = d <= u.range + 0.25 && (!u.data.minRange || d >= u.data.minRange);
        if (inRange) {
          u.path = null; u.facing = Math.atan2(t.x - u.x, t.z - u.z);
          if (u.cooldown <= 0) { this.performAttack(u, t); u.cooldown = u.data.cd; }
        } else {
          u.repathTimer -= dt;
          const goalMoved = !u.pathGoal || Math.hypot(u.pathGoal.x - t.x, u.pathGoal.z - t.z) > (t.kind === 'building' ? 1e9 : 2.5);
          if (!u.path && !u.needPath) this.requestPathTo(u, t);
          else if (u.repathTimer <= 0 && goalMoved) { u.repathTimer = 1.0; this.requestPathTo(u, t); }
          if (u.path && this.followPath(u, dt)) { u.path = null; if (u.repathTimer <= 0) { u.repathTimer = 0.6; this.requestPathTo(u, t); } }
          if (u.cooldown <= 0 && u.isRanged && d <= u.range + 1.5 && t.kind === 'unit') { /* 稍微等待靠近 */ }
        }
        break;
      }
      case 'gather': {
        const n = u.gatherNode;
        if (!n || n.dead || n.amount <= 0) {
          const alt = n ? this.findResourceNear(u, n.res, n.x, n.z, 22) : null;
          if (alt) { this.setGather(u, alt); } else if (u.carry.amt > 0) { u.state = 'return'; u.gatherNode = null; this.goDropoff(u); } else { const res = n ? n.res : null; this.stopUnit(u); if (res && u.owner === 0) this.message(`附近的${RES_NAMES[res]}已採盡`, 'warn'); }
          break;
        }
        const d = this.edgeDist(u, n);
        if (d <= 0.9) {
          u.path = null; u.facing = Math.atan2(n.x - u.x, n.z - u.z);
          const p = this.players[u.owner]; const rate = this.gatherRate(p, n.res, n.kind === 'building');
          const take = Math.min(rate * dt, n.amount, CARRY_CAP - u.carry.amt);
          u.carry.res = n.res; u.carry.amt += take; n.amount -= take;
          u.gatherAnim = (u.gatherAnim || 0) + dt;
          if (n.amount <= 0) this.depleteNode(n);
          if (u.carry.amt >= CARRY_CAP - 1e-6) { u.state = 'return'; this.goDropoff(u); }
        } else {
          if (!u.path && !u.needPath) this.requestPathTo(u, n);
          if (u.path && this.followPath(u, dt)) { u.path = null; if (this.edgeDist(u, n) > 0.9) this.requestPathTo(u, n); }
        }
        break;
      }
      case 'return': {
        const b = u.dropoff;
        if (!b || b.dead) { this.goDropoff(u); if (!u.dropoff) { this.stopUnit(u); } break; }
        const d = this.edgeDist(u, b);
        if (d <= 1.2) {
          const p = this.players[u.owner]; p.res[u.carry.res] += Math.round(u.carry.amt); u.carry = { res: null, amt: 0 }; u.path = null;
          if (u.gatherNode && !u.gatherNode.dead && u.gatherNode.amount > 0) { u.state = 'gather'; this.requestPathTo(u, u.gatherNode); }
          else { const alt = u.gatherNode ? this.findResourceNear(u, u.gatherNode.res, u.gatherNode.x, u.gatherNode.z, 22) : null; if (alt) this.setGather(u, alt); else this.stopUnit(u); }
        } else {
          if (!u.path && !u.needPath) this.requestPathTo(u, b);
          if (u.path && this.followPath(u, dt)) { u.path = null; if (this.edgeDist(u, b) > 1.2) this.requestPathTo(u, b); }
        }
        break;
      }
      case 'build': {
        const b = u.buildTarget;
        if (!b || b.dead || (b.built && b.hp >= b.maxHp)) {
          // 尋找附近其他未完成建築
          const nb = b && !b.dead ? this.findUnfinishedNear(u, 14) : null;
          if (nb) { u.buildTarget = nb; u.path = null; this.requestPathTo(u, nb); } else this.stopUnit(u);
          break;
        }
        const d = this.edgeDist(u, b);
        if (d <= 1.2) {
          u.path = null; u.facing = Math.atan2(b.x - u.x, b.z - u.z); u.gatherAnim = (u.gatherAnim || 0) + dt;
          b.builders++;
          if (!b.built) {
            const rate = 1 / b.data.time; const mult = b.builders === 1 ? 1 : 1 + (b.builders - 1) * 0.6;
            b.progress += rate * dt * (mult / b.builders);
            b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.9 * rate * dt * (mult / b.builders));
            if (b.progress >= 1) { this.completeBuilding(b); }
            else if (Math.floor(b.progress * 8) !== Math.floor((b.progress - rate * dt) * 8)) this.refreshBuildingMesh(b);
          } else { b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.08 * dt); }
        } else {
          if (!u.path && !u.needPath) this.requestPathTo(u, b);
          if (u.path && this.followPath(u, dt)) { u.path = null; if (this.edgeDist(u, b) > 1.2) this.requestPathTo(u, b); }
        }
        break;
      }
    }
  }
  completeBuilding(b) {
    b.built = true; b.progress = 1; b.hp = b.maxHp; this.refreshBuildingMesh(b);
    const p = this.players[b.owner]; this.updatePop(p);
    if (b.owner === 0) { this.message(`${b.data.name}建造完成`, 'good'); this.onEvent('build'); }
    if (b.type === 'farm') { for (const u of this.units) if (u.owner === b.owner && u.buildTarget === b && u.cls === 'villager') { this.setGather(u, b); break; } }
  }
  findUnfinishedNear(u, r) {
    let best = null, bd = r;
    for (const b of this.buildings) if (b.owner === u.owner && !b.dead && !b.built) { const d = Math.hypot(b.x - u.x, b.z - u.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  goDropoff(u) {
    let best = null, bd = 1e9;
    for (const b of this.buildings) if (b.owner === u.owner && b.built && !b.dead && b.data.dropoff && b.data.dropoff.includes(u.carry.res)) { const d = Math.hypot(b.x - u.x, b.z - u.z); if (d < bd) { bd = d; best = b; } }
    u.dropoff = best; u.path = null;
    if (best) this.requestPathTo(u, best); else if (u.owner === 0) this.message('沒有可存放資源的建築', 'warn');
  }
  findResourceNear(u, res, x, z, r) {
    let best = null, bd = r;
    for (const n of this.resources) if (!n.dead && n.res === res && n.amount > 0) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    if (!best && res === 'food') best = this.findFarm(u, null);
    return best;
  }
  depleteNode(n) {
    n.dead = true; n.amount = 0; this.terrain.setBlocked(n.cx, n.cz, 0);
    if (n.type === 'tree') { _m4.makeScale(0, 0, 0); this.trees.trunk.setMatrixAt(n.inst, _m4); this.trees.leaf.setMatrixAt(n.inst, _m4); this.trees.trunk.instanceMatrix.needsUpdate = true; this.trees.leaf.instanceMatrix.needsUpdate = true; }
    else if (n.mesh) { this.scene.remove(n.mesh); }
  }
  findEnemyNear(u, r) {
    let best = null, bd = r;
    for (const e of this.units) if (!e.dead && this.enemyOf(u, e)) { const d = this.edgeDist(u, e); if (d < bd) { bd = d; best = e; } }
    if (best) return best;
    // 建築：優先軍事與防禦建築，其次一般建築，最後農田與城牆
    let bs = 1e9;
    for (const e of this.buildings) if (!e.dead && this.enemyOf(u, e)) {
      const d = this.edgeDist(u, e); if (d > r * 0.8) continue;
      const pri = e.data.atk || e.data.trains ? 0 : (e.type === 'farm' || e.type === 'wall') ? 30 : 10;
      const sc = d + pri; if (sc < bs) { bs = sc; best = e; }
    }
    return best;
  }
  retryPartial(u) {
    if (u.path && u.path.partial && u.dest && (u.partialRetries || 0) < 4 && Math.hypot(u.dest.x - u.x, u.dest.z - u.z) > 3) { u.partialRetries = (u.partialRetries || 0) + 1; this.requestPath(u, u.dest.x, u.dest.z); return true; }
    u.partialRetries = 0; return false;
  }
  followPath(u, dt) {
    if (!u.path) return false;
    if (u.pathIdx >= u.path.length) return true;
    const wp = u.path[u.pathIdx];
    const dx = wp.x - u.x, dz = wp.z - u.z; const dist = Math.hypot(dx, dz);
    const step = u.speed * dt;
    if (dist <= step + 0.05) { u.x = wp.x; u.z = wp.z; u.pathIdx++; return u.pathIdx >= u.path.length; }
    const nx = u.x + dx / dist * step, nz = u.z + dz / dist * step;
    u.facing = Math.atan2(dx, dz);
    if (!this.terrain.isBlockedWorld(nx, nz)) { u.x = nx; u.z = nz; }
    else if (!this.terrain.isBlockedWorld(nx, u.z)) u.x = nx;
    else if (!this.terrain.isBlockedWorld(u.x, nz)) u.z = nz;
    else { u.stuck += dt; if (u.stuck > 0.4) { u.stuck = 0; const last = u.path[u.path.length - 1]; this.requestPath(u, last.x, last.z); } }
    u.walkT += dt;
    return false;
  }
  separate() {
    const n = this.units.length;
    for (let i = 0; i < n; i++) {
      const a = this.units[i]; if (a.dead) continue;
      for (let j = i + 1; j < n; j++) {
        const b = this.units[j]; if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z; const md = a.radius + b.radius;
        if (Math.abs(dx) > md || Math.abs(dz) > md) continue;
        const d2 = dx * dx + dz * dz; if (d2 >= md * md || d2 < 1e-6) { if (d2 < 1e-6) { a.x += 0.05; b.x -= 0.05; } continue; }
        const d = Math.sqrt(d2); const push = (md - d) * 0.5;
        const ax = dx / d * push, az = dz / d * push;
        const aMoving = a.state !== 'idle' && a.state !== 'gather' && a.state !== 'build', bMoving = b.state !== 'idle' && b.state !== 'gather' && b.state !== 'build';
        const wa = aMoving && !bMoving ? 0.3 : (!aMoving && bMoving ? 1.0 : 0.6), wb = 1.3 - wa;
        const nax = a.x - ax * wa, naz = a.z - az * wa, nbx = b.x + ax * wb, nbz = b.z + az * wb;
        if (!this.terrain.isBlockedWorld(nax, naz)) { a.x = nax; a.z = naz; }
        if (!this.terrain.isBlockedWorld(nbx, nbz)) { b.x = nbx; b.z = nbz; }
      }
    }
  }
  performAttack(u, t) {
    if (u.isRanged) {
      this.spawnProjectile(u, t, u.cls === 'siege' ? 'stone' : 'arrow');
      u.attackAnim = 0.3;
    } else {
      this.applyDamage(t, this.calcDamage(u, t), u); u.attackAnim = 0.35;
      if (u.owner === 0 || t.owner === 0) this.onEvent('hit');
    }
  }
  calcDamage(att, t) {
    let dmg = att.atk;
    const bonus = att.data.bonus || {};
    if (t.kind === 'building') { dmg *= bonus.building || (att.isRanged && att.cls !== 'siege' ? 0.35 : 1); dmg -= (t.type === 'wall' || t.type === 'tower') ? 4 : 2; }
    else { dmg *= bonus[t.cls] || 1; dmg -= t.armor; }
    return Math.max(1, dmg);
  }
  towerDamage(b, t) { let d = b.atk; if (t.kind === 'building') d *= 0.3; else d -= t.armor; return Math.max(1, d); }
  applyDamage(t, dmg, attacker) {
    if (t.dead) return;
    t.hp -= dmg;
    const p = this.players[t.owner];
    if (attacker) {
      p.lastAttackedAt = this.time; p.lastAttackedPos = { x: t.x, z: t.z };
      if (t.owner === 0) { const key = t.kind === 'building' ? 'b' : 'u'; const last = this.attackAlerts.get(key) || -99; if (this.time - last > 12) { this.attackAlerts.set(key, this.time); this.message(t.kind === 'building' ? `我們的${t.data.name}遭到攻擊！` : '我們的部隊遭到攻擊！', 'warn'); this.onEvent('alert'); } }
      // 反擊
      if (t.kind === 'unit' && attacker.kind === 'unit' && t.isMilitary && (t.state === 'idle' || t.state === 'move') && !t.attackMove) this.setAttack(t, attacker);
      if (t.kind === 'unit' && t.cls === 'villager' && attacker.kind === 'unit' && t.state !== 'flee') {
        // 農民逃向都城
        const tc = this.buildings.find(b => b.owner === t.owner && b.type === 'towncenter' && b.built && !b.dead);
        if (tc && Math.hypot(tc.x - t.x, tc.z - t.z) > 10) { const g = t.gatherNode; this.stopUnit(t); t.state = 'move'; t.gatherNode = g; this.requestPath(t, tc.x + 5, tc.z + 5); }
      }
    }
    if (t.hp <= 0) { if (t.kind === 'unit') this.killUnit(t, attacker); else this.destroyBuilding(t, attacker); }
  }
  killUnit(u, attacker) {
    u.dead = true; u.hp = 0;
    if (u.gatherNode && u.gatherNode.worker === u) u.gatherNode.worker = null;
    const p = this.players[u.owner]; p.losses++; if (attacker && attacker.owner >= 0 && attacker.owner !== u.owner) this.players[attacker.owner].kills++;
    this.dying.push({ mesh: u.mesh, t: 0 });
    if (u.ring) u.ring.visible = false;
    if (u.hpbar) u.hpbar.visible = false;
    this.onEvent('death', u);
  }
  destroyBuilding(b, attacker) {
    b.dead = true; b.hp = 0;
    this.terrain.setArea(b.cx, b.cz, b.size, 0);
    for (const q of b.queue) this.pay(this.players[b.owner], q.cost, 1); b.queue = [];
    this.scene.remove(b.mesh);
    const r = new THREE.Mesh(new THREE.BoxGeometry(b.halfW * 1.8, 0.5, b.halfW * 1.8), new THREE.MeshLambertMaterial({ color: 0x4a3a2a, transparent: true, opacity: 1 }));
    r.position.set(b.x, this.worldY(b.x, b.z) + 0.1, b.z); this.scene.add(r); this.rubble.push({ mesh: r, t: 0 });
    for (let i = 0; i < 5; i++) { const rk = rockMesh(); rk.position.set(b.x + (this.rng() - 0.5) * b.halfW * 1.6, this.worldY(b.x, b.z) + 0.4, b.z + (this.rng() - 0.5) * b.halfW * 1.6); r.add(rk); rk.position.sub(r.position); }
    if (b.owner === 0) this.message(`我們的${b.data.name}被摧毀了！`, 'warn');
    else if (attacker && attacker.owner === 0) this.message(`摧毀了敵方的${b.data.name}`, 'good');
    this.updatePop(this.players[b.owner]);
    this.onEvent('destroy', b);
  }
  spawnProjectile(from, target, type) {
    const mesh = type === 'stone' ? new THREE.Mesh(new THREE.DodecahedronGeometry(0.3, 0), mat(0x55554f)) : arrowMesh();
    const y0 = this.worldY(from.x, from.z) + (from.kind === 'building' ? from.halfW * 1.5 + 2 : 1.2);
    const pr = { mesh, x: from.x, y: y0, z: from.z, sx: from.x, sz: from.z, sy: y0, tx: target.x, tz: target.z, ty: this.worldY(target.x, target.z) + 0.8, t: 0, dur: 0, type, dmg: 0, from, target, splash: from.data && from.data.splash };
    const dist = Math.hypot(pr.tx - pr.sx, pr.tz - pr.sz); pr.dur = Math.max(0.15, dist / (type === 'stone' ? 14 : 28));
    pr.dmg = from.kind === 'building' ? this.towerDamage(from, target) : this.calcDamage(from, target);
    this.scene.add(mesh); this.projectiles.push(pr);
  }
  updateProjectiles(dt) {
    for (const pr of this.projectiles) {
      pr.t += dt; const k = Math.min(1, pr.t / pr.dur);
      const arc = Math.sin(k * Math.PI) * (pr.type === 'stone' ? 6 : 2.2);
      const x = pr.sx + (pr.tx - pr.sx) * k, z = pr.sz + (pr.tz - pr.sz) * k, y = pr.sy + (pr.ty - pr.sy) * k + arc;
      pr.mesh.lookAt(x, y, z); pr.mesh.position.set(x, y, z);
      if (k >= 1) {
        pr.done = true; this.scene.remove(pr.mesh);
        if (pr.splash) {
          for (const e of [...this.units, ...this.buildings]) if (!e.dead && e.owner !== pr.from.owner && e.owner >= 0) { const d = e.kind === 'building' ? Math.max(0, Math.hypot(e.x - pr.tx, e.z - pr.tz) - e.halfW) : Math.hypot(e.x - pr.tx, e.z - pr.tz); if (d <= pr.splash) this.applyDamage(e, pr.from.dead ? pr.dmg : this.calcDamage(pr.from, e), pr.from); }
        } else if (!pr.target.dead) {
          const miss = pr.target.kind === 'unit' && Math.hypot(pr.target.x - pr.tx, pr.target.z - pr.tz) > 1.6;
          if (!miss) { this.applyDamage(pr.target, pr.dmg, pr.from); if (pr.target.owner === 0 || pr.from.owner === 0) this.onEvent('hit'); }
        }
      }
    }
    this.projectiles = this.projectiles.filter(p => !p.done);
  }
  updateBuilding(b, dt) {
    if (b.dead) return;
    b.builders = 0;
    if (!b.built) return;
    if (b.queue.length) {
      const q = b.queue[0]; q.t += dt;
      if (q.t >= q.total) {
        b.queue.shift();
        const p = this.players[b.owner];
        if (q.kind === 'unit') {
          const sp = this.spawnPoint(b); const u = this.spawnUnit(p, q.key, sp.x, sp.z);
          if (b.rally) { if (b.rally.target && !b.rally.target.dead) this.commandTarget([u], b.rally.target); else this.commandMove([u], b.rally.x, b.rally.z); }
          else if (q.key === 'villager') { const n = this.findResourceNear(u, 'food', u.x, u.z, 30) || this.findResourceNear(u, 'wood', u.x, u.z, 30); if (n && p.isAI) this.setGather(u, n); }
          this.updatePop(p); if (b.owner === 0) this.onEvent('train');
        } else if (q.kind === 'tech') { p.techs.add(q.key); this.refreshAllStats(p); if (b.owner === 0) this.message(`研究完成：${TECHS[q.key].name}`, 'good'); }
        else if (q.kind === 'age') { p.age = q.key; this.refreshAllStats(p); this.message(`${p.fdata.full}進入了${AGES[p.age - 1].name}`, b.owner === 0 ? 'good' : ''); if (b.owner === 0) this.onEvent('age'); }
      }
    }
    if (b.atk && b.range) {
      b.cooldown -= dt;
      if (b.cooldown <= 0) {
        b.cooldown = 1.6;
        let best = null, bd = b.range;
        for (const e of this.units) if (!e.dead && this.enemyOf(b, e)) { const d = this.edgeDist(e, b); if (d < bd) { bd = d; best = e; } }
        if (best) this.spawnProjectile(b, best, 'arrow');
      }
    }
  }
  spawnPoint(b) {
    const t = this.terrain; const r = Math.ceil(b.size / 2) + 1;
    const cc = t.toCell(b.x, b.z);
    const f = t.nearestFree(cc.cx, cc.cz + b.size, 10) || t.nearestFree(cc.cx, cc.cz, 12);
    if (f) { const c = t.cellCenter(f.cx, f.cz); return { x: c.x + (this.rng() - 0.5), z: c.z + (this.rng() - 0.5) }; }
    return { x: b.x, z: b.z + b.halfW + r };
  }
  updateUnitVisual(u, dt) {
    if (u.dead) return;
    const m = u.mesh; m.position.set(u.x, this.worldY(u.x, u.z), u.z);
    // 轉向
    let diff = u.facing - m.rotation.y; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    m.rotation.y += diff * Math.min(1, dt * 12);
    const moving = u.path && u.pathIdx < u.path.length;
    const body = m.children[0];
    if (moving && body) { body.position.y = Math.abs(Math.sin(u.walkT * 9)) * 0.12; body.rotation.z = Math.sin(u.walkT * 9) * 0.05; }
    else if (body) { body.position.y = 0; body.rotation.z = 0; }
    if (u.attackAnim > 0) { u.attackAnim -= dt; m.position.add(new THREE.Vector3(Math.sin(u.facing), 0, Math.cos(u.facing)).multiplyScalar(Math.sin(u.attackAnim / 0.35 * Math.PI) * 0.35)); }
    if (u.gatherAnim && (u.state === 'gather' || u.state === 'build')) { m.rotation.x = Math.sin(u.gatherAnim * 6) * 0.12; } else m.rotation.x = 0;
    if (u.cls === 'villager') { const c = m.getObjectByName('carry'); if (c) { c.visible = u.carry.amt > 0; c.material = mat(u.carry.res === 'wood' ? 0x7a5230 : u.carry.res === 'food' ? 0x9a2f5a : u.carry.res === 'gold' ? 0xe0b020 : 0x8f8f8a); } }
    // 血條
    const show = u.hp < u.maxHp || u.selected;
    if (show) { if (!u.hpbar) { u.hpbar = hpBarSprite(); m.add(u.hpbar); } u.hpbar.position.y = u.cls === 'cavalry' || u.cls === 'siege' ? 2.6 : 2.0; u.hpbar.visible = true; updateHpBar(u.hpbar, Math.max(0, u.hp / u.maxHp)); }
    else if (u.hpbar) u.hpbar.visible = false;
    if (u.ring) u.ring.visible = u.selected;
  }
  updateBuildingVisual(b) {
    const show = (b.hp < b.maxHp && b.built) || b.selected || !b.built;
    if (show) { if (!b.hpbar) { b.hpbar = hpBarSprite(); b.hpbar.scale.set(b.halfW * 1.6, b.halfW * 0.2, 1); b.mesh.add(b.hpbar); } b.hpbar.position.y = b.halfW * 1.3 + 2.5; b.hpbar.visible = true; updateHpBar(b.hpbar, b.built ? Math.max(0, b.hp / b.maxHp) : b.progress); }
    else if (b.hpbar) b.hpbar.visible = false;
    if (b.ring) b.ring.visible = b.selected;
  }
  updateDying(dt) {
    for (const d of this.dying) { d.t += dt; d.mesh.rotation.x = -Math.min(1, d.t / 0.4) * Math.PI / 2; d.mesh.position.y -= dt * 0.6; if (d.t > 2.5) { this.scene.remove(d.mesh); d.done = true; } }
    this.dying = this.dying.filter(d => !d.done);
    for (const r of this.rubble) { r.t += dt; if (r.t > 20) { r.mesh.material.opacity = Math.max(0, 1 - (r.t - 20) / 5); if (r.t > 25) { this.scene.remove(r.mesh); r.done = true; } } }
    this.rubble = this.rubble.filter(r => !r.done);
  }
  cleanup() {
    if (this.units.some(u => u.dead)) this.units = this.units.filter(u => !u.dead);
    if (this.buildings.some(b => b.dead)) { this.buildings = this.buildings.filter(b => !b.dead); for (const p of this.players) this.updatePop(p); }
    for (const b of this.buildings) this.updateBuildingVisual(b);
  }
  checkEnd() {
    for (const p of this.players) {
      const hasBuilding = this.buildings.some(b => b.owner === p.id && !b.dead && b.type !== 'wall' && b.type !== 'farm');
      const hasVillager = this.units.some(u => u.owner === p.id && !u.dead && u.cls === 'villager');
      if (!hasBuilding && !hasVillager) p.alive = false;
    }
    if (!this.players[0].alive) { this.over = true; this.onEnd(false); }
    else if (!this.players[1].alive) { this.over = true; this.onEnd(true); }
  }
  idleVillagers(owner = 0) { return this.units.filter(u => u.owner === owner && !u.dead && u.cls === 'villager' && u.state === 'idle'); }
}
