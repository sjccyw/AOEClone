import * as THREE from 'three';
import { RES_KEYS, RES_NAMES, RES_ICONS, AGES, BUILDINGS, UNITS, TECHS, BUILD_ORDER, MARKET, costText, CELL } from './data.js';
import { WATER_LEVEL } from './world.js';

const $ = id => document.getElementById(id);

export class UI {
  constructor(game, input) {
    this.g = game; this.input = input;
    this.hotkeys = {}; this.t = 0; this.mmT = 0; this.cmdT = 0; this.cmdKey = '';
    this.els = { food: $('res-food'), wood: $('res-wood'), stone: $('res-stone'), gold: $('res-gold'), pop: $('res-pop'), age: $('age-label'), faction: $('faction-label'), time: $('time-label'),
      idle: $('idle-btn'), idleCount: $('idle-count'), msgs: $('messages'), selEmpty: $('sel-empty'), selInfo: $('sel-info'), selName: $('sel-name'), hpFill: $('sel-hpfill'), hpText: $('sel-hptext'),
      stats: $('sel-stats'), progress: $('sel-progress'), multi: $('sel-multi'), cmd: $('cmd-panel'), tooltip: $('tooltip'), minimap: $('minimap') };
    this.els.faction.textContent = game.players[0].fdata.full;
    this.els.faction.style.color = game.players[0].fdata.css;
    input.onSelectionChange = () => { this.cmdKey = ''; this.refreshCommands(); this.refreshSelection(); };
    input.onHotkey = key => { const fn = this.hotkeys[key]; if (fn) { fn(); return true; } return false; };
    game.onMessage = (text, cls) => this.message(text, cls);
    this.els.idle.addEventListener('click', () => { const idle = game.idleVillagers(0); if (idle.length) { input.select([idle[0]]); input.jumpTo(idle[0].x, idle[0].z); } });
    this.buildMinimapBase();
    const mm = this.els.minimap;
    const mmPos = e => { const r = mm.getBoundingClientRect(); const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height; return { x: (u - 0.5) * game.size, z: (v - 0.5) * game.size }; };
    mm.addEventListener('mousedown', e => { e.preventDefault(); const p = mmPos(e); if (e.button === 0) { input.jumpTo(p.x, p.z); this.mmDrag = true; } else if (e.button === 2) { const u = input.ownUnits(); if (u.length) { game.commandMove(u, p.x, p.z, false); game.onEvent('cmd'); } } });
    mm.addEventListener('mousemove', e => { if (this.mmDrag && e.buttons & 1) { const p = mmPos(e); input.jumpTo(p.x, p.z); } });
    window.addEventListener('mouseup', () => { this.mmDrag = false; });
    mm.addEventListener('contextmenu', e => e.preventDefault());
  }
  message(text, cls = '') {
    const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; this.els.msgs.appendChild(d);
    while (this.els.msgs.children.length > 6) this.els.msgs.removeChild(this.els.msgs.firstChild);
    setTimeout(() => d.remove(), 6000);
  }
  fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
  update(dt) {
    this.t += dt; this.mmT += dt; this.cmdT += dt;
    if (this.t >= 0.1) { this.t = 0; this.updateTop(); this.refreshSelection(); }
    if (this.cmdT >= 0.5) { this.cmdT = 0; this.refreshCommands(true); }
    if (this.mmT >= 0.25) { this.mmT = 0; this.drawMinimap(); }
  }
  updateTop() {
    const p = this.g.players[0];
    for (const k of RES_KEYS) { const el = this.els[k]; el.querySelector('.val').textContent = Math.floor(p.res[k]); el.classList.toggle('low', p.res[k] < 50); }
    this.g.updatePop(p);
    this.els.pop.querySelector('.val').textContent = `${p.popUsed}/${p.popCap}`; this.els.pop.classList.toggle('low', p.popUsed >= p.popCap);
    this.els.age.textContent = AGES[p.age - 1].name;
    this.els.time.textContent = this.fmtTime(this.g.time);
    const idle = this.g.idleVillagers(0).length; this.els.idleCount.textContent = idle; this.els.idle.classList.toggle('has-idle', idle > 0);
  }
  // ---------- 選取面板 ----------
  stateText(u) {
    const m = { idle: '閒置', move: '移動中', attackmove: '攻擊移動', attack: '攻擊中', gather: '採集中', return: '運送資源', build: '建造中' };
    let s = m[u.state] || u.state;
    if (u.carry.amt > 0) s += `（${RES_ICONS[u.carry.res]} ${Math.floor(u.carry.amt)}）`;
    if (u.state === 'gather' && u.gatherNode) s += ` ${RES_NAMES[u.gatherNode.res]}`;
    return s;
  }
  refreshSelection() {
    const sel = this.input.selected; const e = this.els;
    if (!sel.length) { e.selEmpty.classList.remove('hidden'); e.selInfo.classList.add('hidden'); return; }
    e.selEmpty.classList.add('hidden'); e.selInfo.classList.remove('hidden');
    const s = sel[0]; const own = s.owner === 0 ? '' : s.owner === 1 ? `（${this.g.players[1].fdata.full}）` : '';
    if (sel.length === 1) {
      e.multi.innerHTML = '';
      if (s.kind === 'resource') { e.selName.textContent = s.name; e.hpFill.style.width = '100%'; e.hpText.textContent = ''; e.stats.innerHTML = `剩餘${RES_NAMES[s.res]}：${Math.floor(s.amount)}`; e.progress.innerHTML = ''; return; }
      e.selName.textContent = s.data.name + own;
      const frac = Math.max(0, s.hp / s.maxHp); e.hpFill.style.width = (frac * 100) + '%'; e.hpText.textContent = `${Math.ceil(s.hp)} / ${s.maxHp}`;
      if (s.kind === 'unit') {
        e.stats.innerHTML = `攻擊 ${s.atk}　護甲 ${s.armor}　${s.isRanged ? '射程 ' + s.range : '近戰'}　速度 ${s.speed.toFixed(1)}<br>${this.stateText(s)}${s.group ? `　編隊 ${s.group}` : ''}`;
        e.progress.innerHTML = '';
      } else {
        let st = s.built ? (s.data.desc || '') : `建造中 ${Math.floor(s.progress * 100)}%`;
        if (s.type === 'farm' && s.built) st = s.worker && !s.worker.dead && s.worker.gatherNode === s ? '耕作中' : '無人耕作（以農民右鍵點擊農田）';
        if (s.atk) st += `<br>攻擊 ${s.atk}　射程 ${s.range}`;
        if (s.data.trains && s.owner === 0) st += `<br><span style="color:#8a7a60">右鍵地面可設定集結點</span>`;
        e.stats.innerHTML = st;
        if (s.owner === 0 && s.queue.length) {
          let html = '';
          s.queue.forEach((q, i) => {
            const name = q.kind === 'unit' ? UNITS[q.key].name : q.kind === 'tech' ? TECHS[q.key].name : `進入${AGES[q.key - 1].name}`;
            html += `<div class="qitem" data-i="${i}" style="cursor:pointer" title="點擊取消">${i === 0 ? '▶' : '•'} ${name}${i === 0 ? ` ${Math.floor(q.t / q.total * 100)}%` : ''}${i === 0 ? `<div class="pbar"><div style="width:${q.t / q.total * 100}%"></div></div>` : ''}</div>`;
          });
          e.progress.innerHTML = html;
          e.progress.querySelectorAll('.qitem').forEach(el => el.addEventListener('click', () => { this.g.cancelQueue(s, +el.dataset.i); this.refreshSelection(); }));
        } else e.progress.innerHTML = '';
      }
    } else {
      e.selName.textContent = `已選取 ${sel.length} 個單位`;
      const hp = sel.reduce((a, b) => a + b.hp, 0), max = sel.reduce((a, b) => a + b.maxHp, 0);
      e.hpFill.style.width = (hp / max * 100) + '%'; e.hpText.textContent = `${Math.ceil(hp)} / ${max}`;
      const counts = {}; for (const x of sel) counts[x.data.name] = (counts[x.data.name] || 0) + 1;
      e.stats.innerHTML = Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('　'); e.progress.innerHTML = '';
      if (e.multi.dataset.key !== sel.map(x => x.id).join(',')) {
        e.multi.dataset.key = sel.map(x => x.id).join(','); e.multi.innerHTML = '';
        sel.slice(0, 24).forEach(x => { const d = document.createElement('div'); d.className = 'mini-unit'; d.innerHTML = `${x.data.icon}<div class="mhp"><div style="width:${x.hp / x.maxHp * 100}%"></div></div>`; d.title = x.data.name; d.addEventListener('click', () => this.input.select([x])); e.multi.appendChild(d); });
      }
    }
  }
  // ---------- 指令面板 ----------
  btn(spec) {
    const b = document.createElement('button'); b.className = 'cmd-btn' + (spec.danger ? ' danger' : '') + (spec.active ? ' active' : '');
    b.innerHTML = `<span class="cico">${spec.icon}</span><span class="ctitle">${spec.title}</span>${spec.cost ? `<span class="ccost">${spec.cost}</span>` : ''}${spec.hotkey ? `<span class="hk">${spec.hotkey}</span>` : ''}`;
    b.disabled = !!spec.disabled;
    b.addEventListener('click', () => { if (!b.disabled) { spec.action(); this.cmdKey = ''; this.refreshCommands(); } });
    b.addEventListener('mouseenter', () => this.showTooltip(b, spec)); b.addEventListener('mouseleave', () => this.els.tooltip.classList.add('hidden'));
    if (spec.hotkey && !spec.disabled) this.hotkeys[spec.hotkey] = spec.action;
    return b;
  }
  showTooltip(b, spec) {
    const t = this.els.tooltip; t.innerHTML = `<div class="tt-title">${spec.title}${spec.hotkey ? ` [${spec.hotkey}]` : ''}</div>${spec.cost ? `<div class="tt-cost">${spec.cost}</div>` : ''}<div class="tt-desc">${spec.desc || ''}</div>`;
    t.classList.remove('hidden'); const r = b.getBoundingClientRect(); t.style.left = Math.min(window.innerWidth - 300, r.left) + 'px'; t.style.top = (r.top - t.offsetHeight - 8) + 'px';
  }
  refreshCommands(periodic = false) {
    const g = this.g, p = g.players[0], inp = this.input; const sel = inp.selected.filter(s => s.owner === 0);
    const specs = [];
    const key = sel.map(s => s.id).join(',') + '|' + p.age + '|' + [...p.techs].join(',') + '|' + (inp.buildType || '') + '|' + inp.pendingAttackMove;
    if (periodic && key === this.cmdKey) { // 只更新可負擔狀態
      this.els.cmd.querySelectorAll('.cmd-btn').forEach(b => { if (b._cost) b.disabled = b._locked || !g.canAfford(p, b._cost); });
      return;
    }
    this.cmdKey = key; this.hotkeys = {};
    const units = sel.filter(s => s.kind === 'unit'); const vill = units.filter(u => u.cls === 'villager'); const mil = units.filter(u => u.isMilitary);
    const blds = sel.filter(s => s.kind === 'building');
    if (vill.length) {
      for (const type of BUILD_ORDER) {
        const bd = BUILDINGS[type]; const locked = p.age < (bd.age || 1); const cost = g.buildingCost(p, type);
        specs.push({ icon: bd.icon, title: bd.name, cost: costText(cost), hotkey: bd.hotkey, desc: bd.desc + (locked ? `<br><span style="color:#f88">需要${AGES[bd.age - 1].name}</span>` : ''), disabled: locked || !g.canAfford(p, cost), _cost: cost, _locked: locked, active: inp.buildType === type, action: () => inp.startBuild(type) });
      }
    }
    if (mil.length) {
      specs.push({ icon: '⚔️', title: '攻擊移動', hotkey: 'A', desc: '移動至目標位置，沿途攻擊遇到的敵人。', active: inp.pendingAttackMove, action: () => { inp.pendingAttackMove = !inp.pendingAttackMove; inp.cancelBuild(); } });
    }
    if (units.length) specs.push({ icon: '✋', title: '停止', hotkey: 'S', desc: '停止目前動作。', action: () => { for (const u of units) g.stopUnit(u); } });
    if (blds.length) {
      const b = blds[0]; const same = blds.filter(x => x.type === b.type && x.built);
      const pickB = () => same.slice().sort((a, c) => a.queue.length - c.queue.length)[0];
      if (b.built && b.data.trains) for (const ut of b.data.trains) {
        const ud = UNITS[ut]; const locked = p.age < (ud.age || 1); const cost = g.unitCost(p, ut);
        specs.push({ icon: ud.icon, title: ud.name, cost: costText(cost), hotkey: ud.hotkey, desc: `${ud.desc}<br>耐久 ${ud.hp}　攻擊 ${ud.atk}　護甲 ${ud.armor}${ud.range >= 1 ? '　射程 ' + ud.range : ''}　訓練 ${Math.round(g.trainTime(p, ut))} 秒` + (locked ? `<br><span style="color:#f88">需要${AGES[ud.age - 1].name}</span>` : ''), disabled: locked || !g.canAfford(p, cost), _cost: cost, _locked: locked, action: () => g.trainUnit(pickB(), ut) });
      }
      if (b.built && b.type === 'towncenter') {
        if (p.age < AGES.length) { const a = AGES[p.age]; const r = g.ageUpReady(p); specs.push({ icon: '⏫', title: `進入${a.name}`, cost: costText(a.cost), hotkey: 'U', desc: `${a.desc}<br>需要：${a.req.map(k => BUILDINGS[k].name).join('、')}` + (r.ok ? '' : `<br><span style="color:#f88">${r.reason}</span>`), disabled: !r.ok, action: () => g.ageUp(b) }); }
      }
      if (b.built && b.data.techs) for (const tk of b.data.techs) {
        if (p.techs.has(tk) || g.isQueued(p, 'tech', tk)) continue;
        const td = TECHS[tk]; const locked = p.age < td.age; const cost = g.techCost(p, tk);
        specs.push({ icon: td.icon, title: td.name, cost: costText(cost) || '免費', desc: td.desc + `<br>研究 ${td.time} 秒` + (locked ? `<br><span style="color:#f88">需要${AGES[td.age - 1].name}</span>` : ''), disabled: locked || !g.canAfford(p, cost), _cost: cost, _locked: locked, action: () => g.researchTech(b, tk) });
      }
      if (b.built && b.data.market) {
        for (const r of ['food', 'wood', 'stone']) {
          specs.push({ icon: RES_ICONS[r], title: `買${RES_NAMES[r]}`, cost: `🪙${MARKET.buyCost} → ${RES_ICONS[r]}${MARKET.buyAmount}`, desc: `以 ${MARKET.buyCost} 黃金購買 ${MARKET.buyAmount} ${RES_NAMES[r]}。`, disabled: p.res.gold < MARKET.buyCost, _cost: { gold: MARKET.buyCost }, action: () => g.marketTrade(p, r, true) });
          specs.push({ icon: RES_ICONS[r], title: `賣${RES_NAMES[r]}`, cost: `${RES_ICONS[r]}${MARKET.sellAmount} → 🪙${MARKET.sellGain}`, desc: `出售 ${MARKET.sellAmount} ${RES_NAMES[r]} 換取 ${MARKET.sellGain} 黃金。`, disabled: p.res[r] < MARKET.sellAmount, _cost: { [r]: MARKET.sellAmount }, action: () => g.marketTrade(p, r, false) });
        }
      }
    }
    if (sel.length) specs.push({ icon: '🗑️', title: '刪除', hotkey: 'Delete', danger: true, desc: '刪除所選單位或建築。', action: () => { for (const s of sel) g.deleteEntity(s); inp.select([]); } });
    const panel = this.els.cmd; panel.innerHTML = '';
    for (const s of specs) { const b = this.btn(s); b._cost = s._cost; b._locked = s._locked; panel.appendChild(b); }
  }
  // ---------- 小地圖 ----------
  buildMinimapBase() {
    const g = this.g, N = 220; const c = document.createElement('canvas'); c.width = N; c.height = N; const ctx = c.getContext('2d');
    const img = ctx.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N - 0.5) * g.size, z = (j / N - 0.5) * g.size; const h = g.terrain.height(x, z);
      let r, gg, b;
      if (h < WATER_LEVEL + 0.25) { r = 40; gg = 90; b = 180; } else if (h < WATER_LEVEL + 0.6) { r = 190; gg = 170; b = 110; } else if (h > 3.2) { r = 120; gg = 120; b = 105; } else { const k = Math.min(1, Math.max(0, (h + 1) / 4)); r = 70 + k * 50; gg = 130 + k * 20; b = 45; }
      const o = (j * N + i) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0); this.mmBase = c;
  }
  drawMinimap() {
    const g = this.g, mm = this.els.minimap, ctx = mm.getContext('2d'), N = mm.width; const k = N / g.size;
    ctx.drawImage(this.mmBase, 0, 0);
    const px = (x, z) => [(x + g.size / 2) * k, (z + g.size / 2) * k];
    ctx.fillStyle = '#1e4d1a'; for (const r of g.resources) if (!r.dead && r.type === 'tree') { const [x, y] = px(r.x, r.z); ctx.fillRect(x - 1, y - 1, 2, 2); }
    for (const r of g.resources) if (!r.dead && r.type !== 'tree') { ctx.fillStyle = r.type === 'gold' ? '#ffd040' : r.type === 'stone' ? '#c8c8c8' : '#e04080'; const [x, y] = px(r.x, r.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    for (const b of g.buildings) if (!b.dead) { ctx.fillStyle = g.players[b.owner].fdata.css; const [x, y] = px(b.x, b.z); const s = Math.max(3, b.size * CELL * k); ctx.fillRect(x - s / 2, y - s / 2, s, s); }
    for (const u of g.units) if (!u.dead) { ctx.fillStyle = u.owner === 0 ? '#ffffff' : '#ff3030'; const [x, y] = px(u.x, u.z); ctx.fillRect(x - 1.5, y - 1.5, 3, 3); }
    // 視野框
    const cam = this.input.camera; const ray = new THREE.Raycaster(); const pts = [];
    for (const [nx, ny] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) { ray.setFromCamera(new THREE.Vector2(nx, ny), cam); const t = -ray.ray.origin.y / ray.ray.direction.y; const p = t > 0 && t < 600 ? ray.ray.at(t, new THREE.Vector3()) : ray.ray.at(600, new THREE.Vector3()); pts.push(px(p.x, p.z)); }
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.stroke();
  }
  showEnd(win) {
    const g = this.g, p = g.players[0], e = g.players[1];
    $('end-title').textContent = win ? '勝利！' : '敗北';
    $('end-title').className = win ? '' : 'lose';
    $('end-text').innerHTML = win ? `${p.fdata.full}掃平${e.fdata.full}，威震諸侯，天下歸一。<br>用時 ${this.fmtTime(g.time)}　殲敵 ${p.kills}　損失 ${p.losses}` : `${p.fdata.full}宗廟傾覆，社稷淪亡，為${e.fdata.full}所滅。<br>用時 ${this.fmtTime(g.time)}　殲敵 ${p.kills}　損失 ${p.losses}`;
    $('endscreen').classList.remove('hidden');
  }
}
