import { RES_KEYS, BUILDINGS, UNITS, TECHS, AGES, MAX_POP, CELL } from './data.js';

// 敵國 AI：採集、建設、訓練、進攻
export class AI {
  constructor(game, player, diff) {
    this.g = game; this.p = player; this.diff = diff;
    this.timer = 0; this.nextAttack = diff.firstAttack; this.wave = 0; this.attackSize = Math.round(8 * diff.armyMul);
    this.lastDefend = -99;
    const pref = { qin: ['ge', 'sword', 'chariot', 'cavalry'], chu: ['chariot', 'ge', 'archer', 'sword'], qi: ['archer', 'crossbow', 'sword', 'cavalry'], yan: ['archer', 'crossbow', 'ge', 'chariot'],
      zhao: ['chariot', 'cavalry', 'ge', 'crossbow'], wei: ['ge', 'sword', 'crossbow', 'chariot'], han: ['archer', 'crossbow', 'ge', 'cavalry'] };
    this.pref = pref[player.faction] || ['ge', 'archer', 'chariot', 'sword'];
  }
  get tc() { return this.g.buildings.find(b => b.owner === this.p.id && b.type === 'towncenter' && !b.dead); }
  mine(kind) { return (kind === 'unit' ? this.g.units : this.g.buildings).filter(e => e.owner === this.p.id && !e.dead); }
  count(type) { return this.g.buildings.filter(b => b.owner === this.p.id && !b.dead && b.type === type).length; }
  update(dt) {
    this.timer += dt;
    if (this.timer < 1.0) return; this.timer = 0;
    if (!this.p.alive) return;
    const g = this.g, p = this.p;
    g.updatePop(p);
    const vill = g.units.filter(u => u.owner === p.id && !u.dead && u.cls === 'villager');
    const army = g.units.filter(u => u.owner === p.id && !u.dead && u.isMilitary);
    this.assignVillagers(vill);
    this.manageBuildings(vill);
    this.manageTraining(vill, army);
    this.manageResearch();
    this.manageMarket();
    this.manageArmy(army);
  }
  home() { const tc = this.tc; if (tc) return { x: tc.x, z: tc.z }; const b = this.mine('building')[0]; return b ? { x: b.x, z: b.z } : this.g.starts[1]; }
  // ----- 經濟 -----
  desiredRatio() {
    const p = this.p, r = p.res;
    const w = { food: 4, wood: 3.5, gold: 1.5, stone: 1 };
    if (p.age >= 2) { w.gold = 3; w.stone = 1.5; }
    for (const k of RES_KEYS) { if (r[k] < 100) w[k] *= 1.8; if (r[k] > 900) w[k] *= 0.4; }
    if (this.saving && p.age < AGES.length) { const cost = AGES[p.age].cost; for (const k of RES_KEYS) if (cost[k] && r[k] < cost[k]) w[k] *= 3; }
    return w;
  }
  assignVillagers(vill) {
    const g = this.g; const home = this.home();
    const w = this.desiredRatio();
    const counts = { food: 0, wood: 0, stone: 0, gold: 0 };
    for (const v of vill) if (v.gatherNode) counts[v.gatherNode.res]++;
    const busyBuilding = vill.filter(v => v.state === 'build').length;
    // 定期重新分配：把過多的採集者釋放出來
    this.rebalanceT = (this.rebalanceT || 0) + 1;
    if (this.rebalanceT % 12 === 0 && vill.length >= 6) {
      const sum = RES_KEYS.reduce((a, k) => a + w[k], 0); const total = vill.length;
      let worst = null, wd = 0.12;
      for (const k of RES_KEYS) { const diff = counts[k] / total - w[k] / sum; if (diff > wd) { wd = diff; worst = k; } }
      if (worst) { const over = vill.filter(v => v.gatherNode && v.gatherNode.res === worst && v.state === 'gather').slice(0, 2); for (const v of over) { g.stopUnit(v); counts[worst]--; } }
    }
    this.needFarm = false;
    for (const v of vill) {
      if (v.state !== 'idle') continue;
      // 先看附近未完成建築
      const nb = g.findUnfinishedNear(v, 60);
      if (nb && busyBuilding < 3 && nb.builders < 2) { v.state = 'build'; v.buildTarget = nb; g.requestPathTo(v, nb); continue; }
      // 選擇最缺的資源
      const total = vill.length || 1;
      let best = null, bs = -1e9;
      for (const k of RES_KEYS) { const s = w[k] - counts[k] / total * 10; if (s > bs) { bs = s; best = k; } }
      let node = this.findNode(best, home);
      if (!node && best === 'food') this.needFarm = true;
      if (!node) { for (const k of RES_KEYS) { node = this.findNode(k, home); if (node) { best = k; break; } } }
      if (node) { g.setGather(v, node); counts[best]++; }
    }
  }
  findNode(res, home) {
    const g = this.g; const drops = g.buildings.filter(b => b.owner === this.p.id && b.built && !b.dead && b.data.dropoff && b.data.dropoff.includes(res));
    let best = null, bd = 1e9;
    const nearDrop = (x, z) => { let d = 1e9; for (const b of drops) d = Math.min(d, Math.hypot(b.x - x, b.z - z)); return d; };
    for (const n of g.resources) if (!n.dead && n.res === res && n.amount > 0) { const d = Math.hypot(n.x - home.x, n.z - home.z); if (d > 70) continue; const score = d + nearDrop(n.x, n.z) * 0.6; if (score < bd) { bd = score; best = n; } }
    if (res === 'food') {
      for (const f of g.buildings) if (f.owner === this.p.id && f.type === 'farm' && f.built && !f.dead && (!f.worker || f.worker.dead || f.worker.gatherNode !== f)) { const d = Math.hypot(f.x - home.x, f.z - home.z) * 0.5; if (d < bd) { bd = d; best = f; } }
    }
    return best;
  }
  // ----- 建設 -----
  findSpot(type, near, minR = 2, maxR = 22) {
    const g = this.g, t = g.terrain; const size = BUILDINGS[type].size;
    const c = t.toCell(near.x, near.z);
    for (let r = minR; r <= maxR; r++) {
      const cand = [];
      for (let dz = -r; dz <= r; dz += 1) for (let dx = -r; dx <= r; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = c.cx + dx - Math.floor(size / 2), cz = c.cz + dz - Math.floor(size / 2);
        if (t.areaFree(cx - 1, cz - 1, size + 2)) cand.push({ cx, cz });
      }
      if (cand.length) return cand[Math.floor(g.rng() * cand.length)];
    }
    return null;
  }
  build(type, near, vill, minR, maxR) {
    const g = this.g, p = this.p;
    if (!g.canAfford(p, g.buildingCost(p, type))) return false;
    const spot = this.findSpot(type, near, minR, maxR); if (!spot) return false;
    const builders = vill.filter(v => v.state !== 'build').sort((a, b) => Math.hypot(a.x - near.x, a.z - near.z) - Math.hypot(b.x - near.x, b.z - near.z)).slice(0, type === 'towncenter' ? 3 : 1);
    if (!builders.length) return false;
    return !!g.tryBuild(p, type, spot.cx, spot.cz, builders);
  }
  manageBuildings(vill) {
    const g = this.g, p = this.p; const home = this.home();
    if (!vill.length) return;
    const pending = g.buildings.filter(b => b.owner === p.id && !b.built && !b.dead).length;
    if (pending >= 2) return;
    if (!this.tc) { if (this.build('towncenter', home, vill, 1, 20)) return; }
    // 人口
    if (p.popCap - p.popUsed <= 4 && p.popCap < MAX_POP && this.count('house') < 28) { if (this.build('house', home, vill, 4, 16)) return; }
    const needs = [];
    const farmTarget = p.age === 1 ? 6 : p.age === 2 ? 9 : 12;
    if (this.saving && this.count('granary') && this.count('barracks')) { if (this.count('farm') < farmTarget + 2) this.build('farm', this.nearDrop('food', home), vill, 1, 20); return; }
    if (this.count('granary') < 1) needs.push(['granary', this.nearRes('food', home)]);
    if (this.count('lumber') < 1) needs.push(['lumber', this.nearRes('wood', home)]);
    if (this.count('barracks') < 1) needs.push(['barracks', home]);
    if (this.count('mine') < 1) needs.push(['mine', this.nearRes('gold', home) || this.nearRes('stone', home)]);
    if (this.needFarm && this.count('farm') < 16) needs.unshift(['farm', this.nearDrop('food', home)]);
    if (this.count('farm') < farmTarget && g.time > 60) needs.push(['farm', this.nearDrop('food', home)]);
    if (this.count('archery') < 1 && g.time > 120) needs.push(['archery', home]);
    if (this.count('stable') < 1 && g.time > 200) needs.push(['stable', home]);
    if (p.age >= 2) {
      if (this.count('academy') < 1) needs.push(['academy', home]);
      if (this.count('market') < 1) needs.push(['market', home]);
      if (this.count('tower') < 3 && g.time > 400) needs.push(['tower', home]);
      if (this.count('siege') < 1 && g.time > 500) needs.push(['siege', home]);
      if (this.count('barracks') < 2 && g.time > 600) needs.push(['barracks', home]);
    }
    if (this.count('lumber') < 2 && g.time > 300) needs.push(['lumber', this.nearRes('wood', home)]);
    for (const [type, near] of needs) { if (near && this.build(type, near, vill, type === 'farm' ? 1 : 3, type === 'tower' ? 14 : 20)) return; }
  }
  nearRes(res, home) { const n = this.findNode(res, home); return n ? { x: n.x, z: n.z } : null; }
  nearDrop(res, home) { const d = this.g.buildings.filter(b => b.owner === this.p.id && b.built && !b.dead && b.data.dropoff && b.data.dropoff.includes(res)); return d.length ? { x: d[0].x, z: d[0].z } : home; }
  // ----- 訓練 -----
  manageTraining(vill, army) {
    const g = this.g, p = this.p;
    const villTarget = p.age === 1 ? 16 : p.age === 2 ? 24 : 30;
    const tc = this.tc;
    if (tc && vill.length + this.queued('villager') < villTarget && tc.queue.length < 2) g.trainUnit(tc, 'villager');
    // 時代進階（條件達成時優先儲蓄資源）
    this.saving = false;
    if (tc && !g.isQueued(p, 'age') && p.age < AGES.length && (p.age === 1 ? g.time > 240 : g.time > 600)) {
      const a = AGES[p.age];
      const reqOk = a.req.every(k => g.buildings.some(b => b.owner === p.id && b.type === k && b.built));
      if (reqOk) { if (g.canAfford(p, a.cost)) { g.ageUp(tc); return; } this.saving = g.time - (this.lastWave || 0) > 60; }
    }
    if (this.saving) return;
    // 軍隊
    const want = Math.min(60, 10 + this.wave * 4 + (p.age - 1) * 8);
    if (army.length + this.queuedMilitary() >= want) return;
    const prodB = g.buildings.filter(b => b.owner === p.id && b.built && !b.dead && b.data.trains && b.type !== 'towncenter' && b.queue.length < 2);
    for (const b of prodB) {
      const options = b.data.trains.filter(k => (UNITS[k].age || 1) <= p.age && (b.type !== 'siege' || this.wave >= 1));
      if (!options.length) continue;
      const ranked = options.sort((a, c) => this.pref.indexOf(a) - this.pref.indexOf(c));
      let pick = ranked[0];
      if (b.type === 'siege') pick = p.age >= 3 && g.rng() < 0.4 ? 'catapult' : 'ram';
      else if (ranked.length > 1 && g.rng() < 0.35) pick = ranked[1];
      if (g.canAfford(p, g.unitCost(p, pick))) g.trainUnit(b, pick);
    }
  }
  queued(type) { let n = 0; for (const b of this.g.buildings) if (b.owner === this.p.id) for (const q of b.queue) if (q.kind === 'unit' && q.key === type) n++; return n; }
  queuedMilitary() { let n = 0; for (const b of this.g.buildings) if (b.owner === this.p.id) for (const q of b.queue) if (q.kind === 'unit' && q.key !== 'villager') n++; return n; }
  manageResearch() {
    const g = this.g, p = this.p;
    const ac = g.buildings.find(b => b.owner === p.id && b.type === 'academy' && b.built && !b.dead);
    if (!ac || ac.queue.length) return;
    const order = ['irontools', p.fdata.mods.freeTech, 'shangyang', 'hanbow', 'hufu', 'mohist', 'ironweapon', 'sunzi'].filter(Boolean);
    for (const k of order) { const c = g.techCost(p, k); if (!p.techs.has(k) && TECHS[k].age <= p.age && g.canAfford(p, c) && p.res.food > (c.food || 0) + 120) { g.researchTech(ac, k); return; } }
  }
  manageMarket() {
    const g = this.g, p = this.p;
    if (!g.buildings.some(b => b.owner === p.id && b.type === 'market' && b.built && !b.dead)) return;
    for (const r of ['wood', 'stone']) if (p.res[r] > 900 && p.res.gold < 800) g.marketTrade(p, r, false);
    if (p.res.food < 200 && p.res.gold > 400) g.marketTrade(p, 'food', true);
    if (p.res.wood < 150 && p.res.gold > 500) g.marketTrade(p, 'wood', true);
  }
  // ----- 軍事 -----
  manageArmy(army) {
    const g = this.g, p = this.p; const home = this.home();
    // 防守
    if (g.time - p.lastAttackedAt < 8 && p.lastAttackedPos && g.time - this.lastDefend > 10) {
      const pos = p.lastAttackedPos;
      if (Math.hypot(pos.x - home.x, pos.z - home.z) < 60) {
        this.lastDefend = g.time;
        const defenders = army.filter(u => u.state === 'idle' || (u.state === 'move'));
        if (defenders.length) g.commandMove(defenders, pos.x, pos.z, true);
      }
    }
    // 進攻
    if (g.time >= this.nextAttack) {
      const idle = army.filter(u => u.state === 'idle' || u.state === 'move');
      if (idle.length >= this.attackSize) {
        const target = this.pickTarget(home);
        if (target) {
          g.commandMove(idle, target.x, target.z, true);
          this.wave++; this.nextAttack = g.time + this.diff.attackInterval; this.attackSize = Math.round((8 + this.wave * 3) * this.diff.armyMul);
          this.lastWave = g.time;
          g.message(`斥候回報：${p.fdata.full}大軍正在逼近！`, 'warn');
        }
      } else this.nextAttack = g.time + 30;
    }
    // 讓閒置軍隊集結於都城前
    const idleFar = army.filter(u => u.state === 'idle' && Math.hypot(u.x - home.x, u.z - home.z) > 55 && (!this.lastWave || g.time - this.lastWave > 150));
    if (idleFar.length) g.commandMove(idleFar, home.x + 8, home.z + 8, true);
  }
  pickTarget(home) {
    const g = this.g; const enemyB = g.buildings.filter(b => b.owner === 0 && !b.dead && b.type !== 'wall');
    if (!enemyB.length) { const u = g.units.find(u => u.owner === 0 && !u.dead); return u ? { x: u.x, z: u.z } : null; }
    enemyB.sort((a, b) => Math.hypot(a.x - home.x, a.z - home.z) - Math.hypot(b.x - home.x, b.z - home.z));
    const tc = enemyB.find(b => b.type === 'towncenter');
    const pick = this.wave % 2 === 1 && tc ? tc : enemyB[0];
    return { x: pick.x, z: pick.z };
  }
}
