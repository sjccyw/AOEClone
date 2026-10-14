import * as THREE from 'three';
import { FACTIONS, FACTION_KEYS } from './data.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Sfx } from './sfx.js';

const $ = id => document.getElementById(id);
let chosen = 'qin';
const sfx = new Sfx();

function buildMenu() {
  const list = $('faction-list');
  for (const k of FACTION_KEYS) {
    const f = FACTIONS[k]; const d = document.createElement('div'); d.className = 'faction-card' + (k === chosen ? ' active' : '');
    d.innerHTML = `<div class="fname"><span class="swatch" style="background:${f.css}"></span>${f.name}</div><div class="fdesc">${f.desc}</div><div class="fbonus">${f.bonus}</div>`;
    d.addEventListener('click', () => { chosen = k; list.querySelectorAll('.faction-card').forEach(c => c.classList.remove('active')); d.classList.add('active'); });
    list.appendChild(d);
  }
  $('start-btn').addEventListener('click', () => { sfx.ensure(); start(); });
  $('help-btn').addEventListener('click', () => $('help').classList.remove('hidden'));
  $('help-close').addEventListener('click', () => { $('help').classList.add('hidden'); if (app) app.setPaused(false); });
  $('restart-btn').addEventListener('click', () => location.reload());
}

let app = null;
function start() {
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  const canvas = $('game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 1, 800);
  const game = new Game({ faction: chosen, difficulty: $('difficulty').value, mapSize: $('mapsize').value });
  const input = new Input(game, renderer, camera, canvas);
  const ui = new UI(game, input);
  game.onEvent = ev => sfx.play(ev);
  game.onEnd = win => { sfx.play(win ? 'win' : 'lose'); setTimeout(() => ui.showEnd(win), 800); };
  const speeds = [1, 1.5, 2];
  let si = 0;
  app = {
    setPaused(v) { game.paused = v; $('pause-btn').textContent = v ? '繼續' : '暫停'; },
    toggleSpeed() { si = (si + 1) % speeds.length; game.speed = speeds[si]; $('speed-btn').textContent = `速度 ×${speeds[si]}`; },
  };
  $('pause-btn').addEventListener('click', () => app.setPaused(!game.paused));
  $('speed-btn').addEventListener('click', () => app.toggleSpeed());
  $('menu-btn').addEventListener('click', () => { $('help').classList.remove('hidden'); app.setPaused(true); });
  input.onTogglePause = () => app.setPaused(!game.paused);
  input.onToggleHelp = () => { const h = $('help'); const open = h.classList.contains('hidden'); h.classList.toggle('hidden', !open); app.setPaused(open); };
  window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });
  ui.message(`${game.players[0].fdata.full}立國。敵國：${game.players[1].fdata.full}。以農民採集資源，壯大國力！`, 'good');
  ui.message('提示：按 F1 查看操作說明，按 H 回到都城。');
  const tc = game.buildings.find(b => b.owner === 0 && b.type === 'towncenter'); if (tc) input.select([tc]);
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    game.update(dt); input.update(dt); ui.update(dt);
    renderer.render(game.scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__game = game; window.__input = input;
}
buildMenu();
