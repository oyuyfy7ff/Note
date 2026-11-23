/* Mini Colony — game logic, input and render loop.
 * All sprites are drawn through window.Art (see CONTRACT.md); this file only
 * draws text, hp/progress bars and floating numbers itself.
 */
(() => {
'use strict';

// ============================================================
// 1. Constants & tuning
// ============================================================
const W = 12, H = 14;
const TICK_MS = 250;              // 4 ticks / sec at x1
const DAY = 480;                  // ticks per day (= 2 min at x1)
const NIGHT_START = 0.62;         // phase at which colonists go to sleep
const EAT_EVERY = 160;            // ticks between meals (3 meals / day)
const FARM_GROW = 120;            // ticks for a farm to yield
const FARM_YIELD = 2;
const BUSH_REGROW = 200;
const TOWER_RANGE = 3.5;
const TOWER_COOLDOWN = 6;
const BASE_CAP = 4;
const SAVE_KEY = 'mini-colony-save-v1';
const SAVE_VERSION = 1;
const CAMP = { x: 6, y: 7 };
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const OBJ_FOR = { food: 'bush', wood: 'tree', stone: 'rock' };
const RES_FOR = { bush: 'food', tree: 'wood', rock: 'stone' };
const RES_LABEL = { food: 'อาหาร', wood: 'ไม้', stone: 'หิน' };
const BUILD = {
  hut:   { name: 'บ้าน',   cost: { wood: 10 },           work: 24 },
  tower: { name: 'หอคอย', cost: { wood: 4, stone: 12 }, work: 32 },
  farm:  { name: 'ฟาร์ม',  cost: { wood: 6 },            work: 16 },
};
const PRIO_LABEL = { food: 'อาหาร', wood: 'ไม้', stone: 'หิน', build: 'ก่อสร้าง' };
const PRIO_ICON = { food: 'food', wood: 'wood', stone: 'stone', build: 'hut' };
const TRAITS = {
  'ขยัน': 'ทำงานเร็ว เก็บของได้เพิ่ม +1',
  'ขี้เกียจ': 'ทำงานและเดินช้ากว่าคนอื่น',
  'แข็งแรง': 'เลือดมากกว่า และสู้เก่ง',
  'ตะกละ': 'กินอาหารมากเป็นสองเท่า',
};
const TRAIT_LIST = Object.keys(TRAITS);
const JOB_LABEL = {
  food: 'เก็บอาหาร', wood: 'ตัดไม้', stone: 'ขุดหิน', build: 'ก่อสร้าง',
  deposit: 'ขนของไปกองไฟ', sleep: 'นอนหลับ', fight: 'ต่อสู้', idle: 'ว่างงาน',
};
const NAMES = ['มะลิ', 'ต้น', 'ฟ้า', 'บอย', 'น้ำ', 'ไผ่', 'ข้าว', 'เมฆ', 'ฝน', 'ดาว',
  'แก้ว', 'ส้ม', 'ปลา', 'หมอก', 'ทราย', 'ภู', 'เตย', 'จันทร์', 'โอ๊ต', 'มิ้นท์'];

// ============================================================
// 2. Small helpers
// ============================================================
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const idx = (x, y) => y * W + x;
const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const adj4 = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by) === 1;
const tileAt = (x, y) => S.tiles[idx(x, y)];

// ============================================================
// 3. Art bridge — guards every call so a missing/broken art.js
//    never stops the game; failures are recorded for debugging.
// ============================================================
const artErrors = {};
function noteArtError(name, err) {
  if (!artErrors[name]) {
    artErrors[name] = String((err && err.message) || err);
    console.warn('[colony] Art.' + name + ' failed:', err);
  }
}
const FALLBACK = {
  drawGround(ctx, px, py, s, v) { ctx.fillStyle = ['#3d5a40', '#42614a', '#3a5640', '#456548'][v & 3]; ctx.fillRect(px, py, s, s); },
  drawObject(ctx, type, px, py, s) { ctx.fillStyle = '#888'; ctx.fillRect(px + s * 0.2, py + s * 0.2, s * 0.6, s * 0.6); },
  drawColonist(ctx, c, px, py, s) { ctx.fillStyle = '#ffd7a8'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.3, 0, 7); ctx.fill(); },
  drawEnemy(ctx, k, px, py, s) { ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.3, 0, 7); ctx.fill(); },
  drawHighlight(ctx, px, py, s, k) { ctx.strokeStyle = k === 'build-bad' ? '#e5645a' : '#f2c14e'; ctx.lineWidth = 2; ctx.strokeRect(px + 1, py + 1, s - 2, s - 2); },
  drawParticle() {},
  drawSky() {},
  icon() { return ''; },
  init() {},
};
function art(name, ...args) {
  const A = window.Art;
  const f = A && A[name];
  if (typeof f !== 'function') {
    noteArtError(name, 'missing');
    return FALLBACK[name] ? FALLBACK[name](...args) : undefined;
  }
  try { return f.apply(A, args); } catch (e) {
    noteArtError(name, e);
    return FALLBACK[name] ? FALLBACK[name](...args) : undefined;
  }
}
const PAL_DEFAULT = { text: '#ffffff', textShadow: 'rgba(0,0,0,.75)', good: '#6fcf97', bad: '#e5645a', warn: '#f2c14e', gold: '#f2c14e', night: '#0b1030' };
function pal() { return Object.assign({}, PAL_DEFAULT, (window.Art && window.Art.palette) || {}); }
let PAL = pal();
const iconCache = {};
function icon(name) {
  if (!(name in iconCache)) {
    const u = art('icon', name);
    iconCache[name] = typeof u === 'string' ? u : '';
  }
  return iconCache[name];
}
function setImg(img, name) {
  const u = icon(name);
  if (u) { if (img.getAttribute('src') !== u) img.src = u; img.style.visibility = ''; }
  else img.style.visibility = 'hidden';
}

// ============================================================
// 4. State creation, save & load
// ============================================================
let S = null;                    // the whole saved game state
const FX = { parts: [], floats: [] }; // visual-only, not saved

function newGameState() {
  const tiles = [];
  for (let i = 0; i < W * H; i++) tiles.push({ g: rnd(0, 3), o: null, t: 0, bp: null });
  S = {
    v: SAVE_VERSION, tick: 0, day: 1, tiles, col: [], enemies: [],
    res: { food: 15, wood: 8, stone: 0 },
    prio: ['food', 'wood', 'stone', 'build'],
    speed: 1, lastSpeed: 1,
    morale: 55, moraleMod: 0,
    nextEvent: DAY * 2 + rnd(40, 160),   // two calm days
    weather: 'clear', weatherEnd: 0,
    respawn: [], log: [], nextId: 1, over: false, raid: false,
    hungerDay: 0, deaths: 0,
  };
  tileAt(CAMP.x, CAMP.y).o = 'campfire';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (cheb(x, y, CAMP.x, CAMP.y) <= 2) continue;
    const r = Math.random();
    tileAt(x, y).o = r < 0.12 ? 'tree' : r < 0.19 ? 'rock' : r < 0.27 ? 'bush' : null;
  }
  for (const type of ['tree', 'rock', 'bush']) {
    let n = S.tiles.filter(t => t.o === type).length;
    while (n++ < 5) { const p = randomFreeTile(); if (p) tileAt(p.x, p.y).o = type; }
  }
  const traits = TRAIT_LIST.slice().sort(() => Math.random() - 0.5);
  const spots = [[CAMP.x - 1, CAMP.y], [CAMP.x + 1, CAMP.y], [CAMP.x, CAMP.y + 1]];
  spots.forEach((p, i) => S.col.push(makeColonist(p[0], p[1], traits[i])));
  addLog('ยานตกแล้ว! รอดมา 3 คน เริ่มสร้างอาณานิคมกันเถอะ', 'info', 'pop');
}

function makeColonist(x, y, trait) {
  const used = new Set(S.col.map(c => c.name));
  const free = NAMES.filter(n => !used.has(n));
  const maxHp = trait === 'แข็งแรง' ? 14 : 10;
  return {
    id: S.nextId++, name: free.length ? pick(free) : 'ผู้มาใหม่', trait,
    hp: maxHp, maxHp, look: rnd(0, 7),
    x, y, fx: x, fy: y, st: 0, sl: 1, dir: Math.random() < 0.5 ? -1 : 1,
    state: 'idle', job: null, carrying: null, carryAmt: 0,
    hunger: rnd(0, 60), atkCool: 0, deadAt: 0,
  };
}

function saveGame() {
  if (!S || S.over) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}
function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o || o.v !== SAVE_VERSION || o.over || !Array.isArray(o.tiles) || o.tiles.length !== W * H ||
        !Array.isArray(o.col) || !Array.isArray(o.enemies) || !o.res || !Array.isArray(o.prio)) return false;
    S = o;
    return true;
  } catch (e) { return false; }
}

// ============================================================
// 5. Queries
// ============================================================
const alive = () => S.col.filter(c => c.hp > 0);
const popCap = () => BASE_CAP + countObj('hut') * 2;
function countObj(type) { let n = 0; for (const t of S.tiles) if (t.o === type) n++; return n; }
const phase = (tk) => ((tk % DAY) + DAY) % DAY / DAY;
const isNight = () => phase(S.tick) >= NIGHT_START;
function walkable(x, y) { if (!inB(x, y)) return false; const t = tileAt(x, y); return !t.o && !t.bp; }
function hasEntity(x, y) {
  return S.col.some(c => c.hp > 0 && c.x === x && c.y === y) || S.enemies.some(e => e.x === x && e.y === y);
}
function randomFreeTile() {
  const free = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (walkable(x, y) && cheb(x, y, CAMP.x, CAMP.y) > 1 && !hasEntity(x, y)) free.push({ x, y });
  }
  return free.length ? pick(free) : null;
}
function canAfford(cost) { return Object.keys(cost).every(k => S.res[k] >= cost[k]); }
function canPlace(type, x, y) {
  if (!inB(x, y)) return 'นอกแผนที่';
  const t = tileAt(x, y);
  if (t.o || t.bp) return 'ช่องนี้มีของอยู่แล้ว';
  if (cheb(x, y, CAMP.x, CAMP.y) <= 1) return 'ใกล้กองไฟเกินไป';
  if (S.enemies.some(e => e.x === x && e.y === y)) return 'มีศัตรูอยู่';
  if (!canAfford(BUILD[type].cost)) return 'ทรัพยากรไม่พอ';
  return '';
}
const enemyById = (id) => S.enemies.find(e => e.id === id && e.hp > 0);

// BFS over the grid. goal(x,y) → true when standing on (x,y) is good enough.
// Returns { x, y, path:[tileIndex...] } (path excludes the start) or null.
function bfs(sx, sy, goal, ghost) {
  const prev = new Int16Array(W * H).fill(-2);
  const s = idx(sx, sy);
  prev[s] = -1;
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], cx = cur % W, cy = (cur / W) | 0;
    if (goal(cx, cy)) {
      const path = [];
      for (let p = cur; p !== s; p = prev[p]) path.push(p);
      path.reverse();
      return { x: cx, y: cy, path };
    }
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!inB(nx, ny)) continue;
      const ni = idx(nx, ny);
      if (prev[ni] !== -2) continue;
      if (!(ghost ? !(nx === CAMP.x && ny === CAMP.y) : walkable(nx, ny))) continue;
      prev[ni] = cur;
      q.push(ni);
    }
  }
  return null;
}
// Path to a tile 4-adjacent to the nearest tile satisfying pred(x,y).
function pathToAdjacent(e, pred, ghost) {
  let target = null;
  const r = bfs(e.x, e.y, (x, y) => {
    for (const [dx, dy] of DIRS) {
      const tx = x + dx, ty = y + dy;
      if (inB(tx, ty) && pred(tx, ty)) { target = { x: tx, y: ty }; return true; }
    }
    return false;
  }, ghost);
  return r ? { tx: target.x, ty: target.y, path: r.path } : null;
}

// ============================================================
// 6. Log, toast, floating text, particles
// ============================================================
let logDirty = true;
function addLog(text, kind, ic) {
  S.log.unshift({ text, kind: kind || 'info', icon: ic || null, day: S.day });
  if (S.log.length > 30) S.log.length = 30;
  logDirty = true;
}
function floatText(text, x, y, color) {
  FX.floats.push({ text, x: x + 0.5, y: y + 0.2, life: 1200, maxLife: 1200, color: color || PAL.text });
}
function spawnPart(kind, x, y, n) {
  for (let i = 0; i < (n || 1); i++) {
    if (FX.parts.length > 400) FX.parts.shift();
    const p = { kind, x, y, vx: 0, vy: 0, g: 0, life: 600, maxLife: 600 };
    switch (kind) {
      case 'chip': p.vx = (Math.random() - 0.5) * 3; p.vy = -2 - Math.random() * 1.5; p.g = 9; p.life = 500; break;
      case 'leaf': p.vx = (Math.random() - 0.5) * 1.5; p.vy = -0.8; p.g = 1.5; p.life = 900; break;
      case 'spark': p.vx = (Math.random() - 0.5) * 3; p.vy = (Math.random() - 0.5) * 3; p.life = 300; break;
      case 'dust': p.vx = (Math.random() - 0.5) * 0.8; p.vy = -0.4; p.life = 500; break;
      case 'smoke': p.vx = (Math.random() - 0.5) * 0.3; p.vy = -0.7; p.life = 1600; break;
      case 'rain': p.vx = -1.5; p.vy = 14; p.life = 700; break;
    }
    p.maxLife = p.life;
    FX.parts.push(p);
  }
}
function sparkLine(ax, ay, bx, by) {
  for (let i = 1; i <= 5; i++) {
    const k = i / 5;
    spawnPart('spark', ax + 0.5 + (bx - ax) * k, ay + 0.3 + (by - ay) * k, 1);
  }
}

// ============================================================
// 7. Movement
// ============================================================
const moving = (e) => S.tick < e.st + e.sl;
function stepTo(e, nx, ny, len) {
  e.fx = e.x; e.fy = e.y; e.x = nx; e.y = ny; e.st = S.tick; e.sl = len;
  if (nx !== e.fx) e.dir = nx > e.fx ? 1 : -1;
  if (Math.random() < 0.15) spawnPart('dust', e.fx + 0.5, e.fy + 0.9, 1);
}
function face(e, tx) { if (tx !== e.x) e.dir = tx > e.x ? 1 : -1; }
function lerpPos(e, rt) {
  const k = clamp((rt - e.st) / (e.sl || 1), 0, 1);
  return { x: e.fx + (e.x - e.fx) * k, y: e.fy + (e.y - e.fy) * k };
}

// ============================================================
// 8. Colonist AI
// ============================================================
const moveLen = (c) => (c.trait === 'ขี้เกียจ' ? 3 : 2);
function workTicks(c) {
  const base = c.trait === 'ขยัน' ? 4 : c.trait === 'ขี้เกียจ' ? 9 : 6;
  return Math.ceil(base * (S.morale < 30 ? 1.5 : 1));
}
function buildRate(c) {
  const base = c.trait === 'ขยัน' ? 1.5 : c.trait === 'ขี้เกียจ' ? 0.7 : 1;
  return base * (S.morale < 30 ? 0.66 : 1);
}

function planWork(c) {
  const reserved = new Set();
  for (const o of S.col) if (o !== c && o.hp > 0 && o.job && OBJ_FOR[o.job.kind]) reserved.add(idx(o.job.tx, o.job.ty));
  for (const k of S.prio) {
    let r;
    if (k === 'build') r = pathToAdjacent(c, (x, y) => !!tileAt(x, y).bp);
    else r = pathToAdjacent(c, (x, y) => tileAt(x, y).o === OBJ_FOR[k] && !reserved.has(idx(x, y)));
    if (r) return { kind: k, tx: r.tx, ty: r.ty, path: r.path, work: 0 };
  }
  return { kind: 'idle', until: S.tick + rnd(6, 14) };
}
function planSleep(c) {
  const r = pathToAdjacent(c, (x, y) => tileAt(x, y).o === 'hut') ||
            pathToAdjacent(c, (x, y) => tileAt(x, y).o === 'campfire');
  return r ? { kind: 'sleep', tx: r.tx, ty: r.ty, path: r.path } : { kind: 'idle', until: S.tick + 8 };
}
function nearestEnemy(c) {
  let best = null, bd = 1e9;
  for (const e of S.enemies) {
    if (e.hp <= 0 || e.flee) continue;
    const d = Math.abs(e.x - c.x) + Math.abs(e.y - c.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function targetValid(j) {
  if (!inB(j.tx, j.ty)) return false;
  const t = tileAt(j.tx, j.ty);
  switch (j.kind) {
    case 'food': case 'wood': case 'stone': return t.o === OBJ_FOR[j.kind];
    case 'build': return !!t.bp;
    case 'deposit': return t.o === 'campfire';
    case 'sleep': return t.o === 'hut' || t.o === 'campfire';
  }
  return false;
}

function updateColonist(c) {
  if (c.atkCool > 0) c.atkCool--;
  if (moving(c)) return;
  const foe = c.hp > c.maxHp * 0.3 ? nearestEnemy(c) : null;
  if (foe) {
    if (!c.job || c.job.kind !== 'fight' || !enemyById(c.job.eid) || enemyById(c.job.eid).flee) {
      c.job = { kind: 'fight', eid: foe.id, path: [], repathAt: 0 };
    }
  } else {
    if (c.job && c.job.kind === 'fight') c.job = null;
    if (c.carrying) { if (!c.job || c.job.kind !== 'deposit') c.job = { kind: 'deposit', tx: CAMP.x, ty: CAMP.y, path: null }; }
    else if (isNight()) { if (!c.job || c.job.kind !== 'sleep') c.job = planSleep(c); }
    else if (c.job && c.job.kind === 'sleep') c.job = null;
    if (!c.job) c.job = planWork(c);
  }
  runJob(c);
}

function runJob(c) {
  const j = c.job;
  if (j.kind === 'fight') return runFight(c, j);
  if (j.kind === 'idle') {
    c.state = 'idle';
    if (S.tick >= j.until) {
      c.job = null;
      // wander one step, drifting toward the campfire
      const opts = DIRS.map(([dx, dy]) => [c.x + dx, c.y + dy]).filter(([x, y]) => walkable(x, y) && cheb(x, y, CAMP.x, CAMP.y) <= 3);
      if (opts.length && Math.random() < 0.7) { const [x, y] = pick(opts); stepTo(c, x, y, moveLen(c) + 1); c.state = 'walk'; }
    }
    return;
  }
  if (!targetValid(j)) { c.job = null; c.state = 'idle'; return; }
  if (adj4(c.x, c.y, j.tx, j.ty)) return act(c, j);
  let next = j.path && j.path.length ? j.path[0] : -1;
  if (next < 0 || !walkable(next % W, (next / W) | 0)) {
    const r = pathToAdjacent(c, (x, y) => x === j.tx && y === j.ty);
    if (!r) { c.job = { kind: 'idle', until: S.tick + 6 }; c.state = 'idle'; return; }
    j.path = r.path;
    if (!j.path.length) return act(c, j);
    next = j.path[0];
  }
  j.path.shift();
  stepTo(c, next % W, (next / W) | 0, moveLen(c));
  c.state = 'walk';
}

function act(c, j) {
  face(c, j.tx);
  const t = tileAt(j.tx, j.ty);
  switch (j.kind) {
    case 'food': case 'wood': case 'stone': {
      c.state = 'work';
      j.work = (j.work || 0) + 1;
      if (j.work % 2 === 0) {
        if (t.o === 'rock') spawnPart('chip', j.tx + 0.5, j.ty + 0.5, 2);
        else if (t.o === 'tree') { spawnPart('chip', j.tx + 0.5, j.ty + 0.6, 1); spawnPart('leaf', j.tx + 0.5, j.ty + 0.1, 1); }
        else spawnPart('leaf', j.tx + 0.5, j.ty + 0.5, 2);
      }
      if (j.work >= workTicks(c)) {
        const res = RES_FOR[t.o];
        c.carrying = res;
        c.carryAmt = 3 + (c.trait === 'ขยัน' ? 1 : 0);
        if (t.o === 'bush') { t.o = 'bush_empty'; t.t = BUSH_REGROW + rnd(0, 80); }
        else { S.respawn.push({ type: t.o, at: S.tick + rnd(120, 320) }); t.o = null; }
        c.job = null;
      }
      return;
    }
    case 'build': {
      c.state = 'work';
      t.bp.prog += buildRate(c);
      if (S.tick % 2 === 0) spawnPart('dust', j.tx + 0.5, j.ty + 0.8, 1);
      if (t.bp.prog >= t.bp.need) {
        const type = t.bp.type;
        t.o = type; t.bp = null; t.t = 0;
        spawnPart('dust', j.tx + 0.5, j.ty + 0.7, 6);
        addLog('สร้าง' + BUILD[type].name + 'เสร็จแล้ว' + (type === 'hut' ? ' ขวัญดีขึ้น รับคนได้เพิ่ม' : ''), 'good', type);
        c.job = null;
      }
      return;
    }
    case 'deposit': {
      if (c.carrying) {
        S.res[c.carrying] += c.carryAmt;
        floatText('+' + c.carryAmt + ' ' + RES_LABEL[c.carrying], CAMP.x, CAMP.y, PAL.good);
        spawnPart('dust', CAMP.x + 0.5, CAMP.y + 0.8, 2);
      }
      c.carrying = null; c.carryAmt = 0; c.job = null; c.state = 'idle';
      return;
    }
    case 'sleep': {
      c.state = 'sleep';
      if (S.tick % 40 === 0 && c.hp < c.maxHp && S.res.food > 0) c.hp = Math.min(c.maxHp, c.hp + 1);
      return;
    }
  }
}

function runFight(c, j) {
  const e = enemyById(j.eid);
  if (!e) { c.job = null; c.state = 'idle'; return; }
  c.state = 'fight';
  if (cheb(c.x, c.y, e.x, e.y) <= 1) {
    face(c, e.x);
    if (c.atkCool <= 0) {
      hitEnemy(e, c.trait === 'แข็งแรง' ? 3 : 2);
      c.atkCool = 4;
    }
    return;
  }
  if (!j.path || !j.path.length || S.tick >= j.repathAt) {
    const r = bfs(c.x, c.y, (x, y) => cheb(x, y, e.x, e.y) <= 1);
    j.path = r ? r.path : [];
    j.repathAt = S.tick + 4;
  }
  if (j.path.length) {
    const n = j.path.shift();
    if (walkable(n % W, (n / W) | 0)) stepTo(c, n % W, (n / W) | 0, 2);
    else j.path = [];
  }
}

function hurtColonist(c, dmg, cause) {
  if (c.hp <= 0) return;
  c.hp -= dmg;
  floatText('-' + dmg, c.x, c.y - 0.3, PAL.bad);
  if (c.hp <= 0) {
    c.hp = 0; c.state = 'dead'; c.deadAt = S.tick; c.job = null; c.carrying = null;
    S.moraleMod -= 15; S.deaths++;
    addLog(c.name + ' เสียชีวิต (' + cause + ')', 'bad');
    toast(c.name + ' เสียชีวิต');
  }
}

// ============================================================
// 9. Enemies (raiders & boars) and towers
// ============================================================
function spawnEnemy(kind, x, y) {
  const hp = kind === 'raider' ? 6 + S.day : 6;
  const e = { id: S.nextId++, kind, x, y, fx: x, fy: y, st: S.tick, sl: 1, dir: x < W / 2 ? 1 : -1,
    hp, maxHp: hp, atkCool: 0, flee: false, angry: kind === 'raider', path: [], repathAt: 0, ghost: false };
  S.enemies.push(e);
  return e;
}
function edgeTiles() {
  const side = rnd(0, 3), out = [];
  for (let i = 0; i < (side < 2 ? W : H); i++) {
    const p = side === 0 ? [i, 0] : side === 1 ? [i, H - 1] : side === 2 ? [0, i] : [W - 1, i];
    out.push(p);
  }
  const free = out.filter(([x, y]) => walkable(x, y));
  return free.length ? free : out;
}
function hitEnemy(e, dmg) {
  e.hp -= dmg;
  floatText('-' + dmg, e.x, e.y - 0.3, PAL.warn);
  spawnPart('spark', e.x + 0.5, e.y + 0.5, 3);
  if (e.kind === 'boar') { e.angry = true; if (e.hp <= e.maxHp / 2) e.flee = true; }
  else if (e.hp <= e.maxHp * 0.3) e.flee = true;
  if (e.hp <= 0) {
    if (e.kind === 'boar') {
      S.res.food += 5; floatText('+5 อาหาร', e.x, e.y, PAL.good);
      addLog('ล่าหมูป่าได้ ได้อาหาร +5', 'good', 'boar');
    } else addLog('กำจัดโจรได้หนึ่งคน', 'good', 'raid');
    spawnPart('dust', e.x + 0.5, e.y + 0.7, 5);
  }
}
function updateEnemy(e) {
  if (e.atkCool > 0) e.atkCool--;
  if (moving(e)) return;
  // fight back when adjacent to a colonist
  if (e.angry && !e.flee) {
    const t = alive().filter(c => cheb(c.x, c.y, e.x, e.y) <= 1)
      .sort((a, b) => (b.state === 'fight') - (a.state === 'fight'))[0];
    if (t) {
      face(e, t.x);
      if (e.atkCool <= 0) {
        const dmg = e.kind === 'raider' ? rnd(1, 2) + Math.floor(S.day / 5) : 1;
        hurtColonist(t, dmg, e.kind === 'raider' ? 'ถูกโจรทำร้าย' : 'ถูกหมูป่าขวิด');
        e.atkCool = e.kind === 'raider' ? 5 : 6;
      }
      return;
    }
  }
  const atEdge = e.x === 0 || e.y === 0 || e.x === W - 1 || e.y === H - 1;
  if (e.flee && atEdge) { e.gone = true; return; }
  if (!e.flee && adj4(e.x, e.y, CAMP.x, CAMP.y)) { steal(e); e.flee = true; e.path = []; return; }
  if (!e.path.length || S.tick >= e.repathAt) {
    const goal = e.flee ? (x, y) => x === 0 || y === 0 || x === W - 1 || y === H - 1
                        : (x, y) => adj4(x, y, CAMP.x, CAMP.y);
    let r = bfs(e.x, e.y, goal, false);
    e.ghost = false;
    if (!r) { r = bfs(e.x, e.y, goal, true); e.ghost = true; }
    e.path = r ? r.path : [];
    e.repathAt = S.tick + 6;
  }
  if (e.path.length) {
    const n = e.path[0], nx = n % W, ny = (n / W) | 0;
    if (e.ghost || walkable(nx, ny)) {
      e.path.shift();
      stepTo(e, nx, ny, e.kind === 'boar' ? 2 : 3);
    } else e.path = [];
  }
}
function steal(e) {
  if (e.kind === 'boar') {
    const n = Math.min(S.res.food, rnd(3, 6));
    S.res.food -= n;
    if (n) floatText('-' + n + ' อาหาร', CAMP.x, CAMP.y, PAL.bad);
    addLog('หมูป่าขโมยอาหารไป ' + n, 'bad', 'boar');
    S.moraleMod -= 3;
    return;
  }
  const amt = 2 + Math.floor(S.day / 2);
  const parts = [];
  for (const k of ['food', 'wood', 'stone']) {
    const n = Math.min(S.res[k], amt);
    if (n) { S.res[k] -= n; parts.push(RES_LABEL[k] + ' ' + n); }
  }
  if (parts.length) floatText('ถูกปล้น!', CAMP.x, CAMP.y, PAL.bad);
  addLog('โจรปล้นกองเสบียง: ' + (parts.join(', ') || 'ไม่ได้อะไรเลย'), 'bad', 'raid');
  S.moraleMod -= 6;
}
function updateTowers() {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tileAt(x, y);
    if (t.o !== 'tower') continue;
    if (t.t > 0) { t.t--; continue; }
    let best = null, bd = TOWER_RANGE + 0.01;
    for (const e of S.enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - x, e.y - y);
      if (d < bd) { bd = d; best = e; }
    }
    if (best) {
      sparkLine(x, y, best.x, best.y);
      hitEnemy(best, 2 + Math.floor(S.day / 4));
      t.t = TOWER_COOLDOWN;
    }
  }
}

// ============================================================
// 10. Storyteller events
// ============================================================
const EVENTS = ['raid', 'boar', 'storm', 'gift'];
function rollEvent() {
  const r = Math.random();
  return r < 0.4 ? 'raid' : r < 0.65 ? 'boar' : r < 0.85 ? 'storm' : 'gift';
}
function fireEvent(kind) {
  switch (kind) {
    case 'raid': {
      const n = Math.min(7, 1 + Math.floor((S.day - 1) / 3) + (Math.random() < 0.4 ? 1 : 0));
      const edge = edgeTiles();
      const start = rnd(0, Math.max(0, edge.length - n));
      for (let i = 0; i < n; i++) { const p = edge[(start + i) % edge.length]; spawnEnemy('raider', p[0], p[1]); }
      S.raid = true;
      addLog('โจรบุก! ' + n + ' คน กำลังมุ่งหน้ามาที่กองไฟ', 'event', 'raid');
      toast('โจรบุก!');
      break;
    }
    case 'boar': {
      const p = pick(edgeTiles());
      spawnEnemy('boar', p[0], p[1]);
      addLog('หมูป่าโผล่มา จะมาขโมยอาหาร!', 'event', 'boar');
      toast('หมูป่าบุก!');
      break;
    }
    case 'storm': {
      S.weather = 'storm';
      S.weatherEnd = S.tick + Math.floor(DAY * 0.35);
      S.moraleMod -= 8;
      let msg = 'พายุเข้า! ขวัญกำลังใจลดลง';
      const farms = S.tiles.filter(t => t.o === 'farm');
      if (farms.length && Math.random() < 0.6) { pick(farms).t = 0; msg += ' และพืชผลในฟาร์มเสียหาย'; }
      addLog(msg, 'event', 'storm');
      toast('พายุเข้า!');
      break;
    }
    case 'gift': {
      const f = rnd(6, 10), w = rnd(4, 8), s = rnd(0, 4);
      S.res.food += f; S.res.wood += w; S.res.stone += s;
      S.moraleMod += 6;
      floatText('ของขวัญ!', CAMP.x, CAMP.y, PAL.gold);
      addLog('พ่อค้าผ่านมาแจกของ: อาหาร +' + f + ', ไม้ +' + w + (s ? ', หิน +' + s : ''), 'good', 'gift');
      toast('พ่อค้าแจกของ!');
      break;
    }
  }
}

// ============================================================
// 11. Simulation tick
// ============================================================
function onDawn() {
  S.day++;
  for (const c of alive()) if (S.res.food > 0) c.hp = Math.min(c.maxHp, c.hp + 2);
  addLog('เริ่มวันที่ ' + S.day, 'info', 'day');
  const pop = alive().length;
  if (S.morale >= 55 && S.res.food >= 8 && pop < popCap()) {
    const spots = DIRS.map(([dx, dy]) => [CAMP.x + dx, CAMP.y + dy]).filter(([x, y]) => walkable(x, y));
    const p = spots.length ? pick(spots) : [CAMP.x, CAMP.y + 1];
    const c = makeColonist(p[0], p[1], pick(TRAIT_LIST));
    S.col.push(c);
    addLog(c.name + ' (' + c.trait + ') เดินทางมาร่วมอาณานิคม', 'good', 'pop');
    toast(c.name + ' มาร่วมอาณานิคม!');
  }
}

function updateTiles() {
  for (const t of S.tiles) {
    if (t.o === 'bush_empty') { if (--t.t <= 0) { t.o = 'bush'; t.t = 0; } }
    else if (t.o === 'farm') {
      t.t++;
      if (t.t >= FARM_GROW) {
        t.t = 0;
        S.res.food += FARM_YIELD;
        const i = S.tiles.indexOf(t);
        floatText('+' + FARM_YIELD + ' อาหาร', i % W, (i / W) | 0, PAL.good);
      }
    }
  }
  for (let i = S.respawn.length - 1; i >= 0; i--) {
    const r = S.respawn[i];
    if (S.tick < r.at) continue;
    const p = randomFreeTile();
    if (p) tileAt(p.x, p.y).o = r.type;
    S.respawn.splice(i, 1);
  }
}

function updateFood() {
  for (const c of alive()) {
    if (++c.hunger < EAT_EVERY) continue;
    c.hunger = 0;
    const need = c.trait === 'ตะกละ' ? 2 : 1;
    if (S.res.food >= need) { S.res.food -= need; continue; }
    S.res.food = 0;
    S.moraleMod -= 3;
    if (S.hungerDay !== S.day) {
      S.hungerDay = S.day;
      addLog('อาหารหมด! ทุกคนเริ่มหิวโหย', 'bad', 'food');
      toast('อาหารหมด!');
    }
    hurtColonist(c, 2, 'อดอาหาร');
  }
}

function updateMorale() {
  const pop = Math.max(1, alive().length);
  const food = S.res.food;
  const foodTerm = food === 0 ? -20 : food < pop ? -8 : food >= pop * 3 ? 10 : 0;
  const target = clamp(45 + Math.min(countObj('hut') * 6, 24) + foodTerm + S.moraleMod - (S.weather === 'storm' ? 5 : 0), 0, 100);
  S.morale = clamp(S.morale + clamp(target - S.morale, -0.5, 0.5), 0, 100);
  if (S.tick % 24 === 0 && S.moraleMod !== 0) S.moraleMod -= Math.sign(S.moraleMod);
  S.moraleMod = clamp(S.moraleMod, -60, 40);
}

function tick() {
  if (S.over) return;
  S.tick++;
  if (S.tick % DAY === 0) onDawn();
  updateTiles();
  updateFood();
  if (S.tick >= S.nextEvent) {
    fireEvent(rollEvent());
    S.nextEvent = S.tick + rnd(Math.floor(DAY * 0.7), Math.floor(DAY * 1.2));
  }
  if (S.weather === 'storm' && S.tick >= S.weatherEnd) {
    S.weather = 'clear';
    addLog('พายุสงบลงแล้ว', 'info', 'storm');
  }
  for (const c of S.col) if (c.hp > 0) updateColonist(c);
  for (const e of S.enemies) if (e.hp > 0 && !e.gone) updateEnemy(e);
  updateTowers();
  // clean up enemies
  const before = S.enemies.length;
  for (const e of S.enemies) if (e.gone && e.kind === 'raider') addLog('โจรหนีออกไปแล้ว', 'info', 'raid');
  for (const e of S.enemies) if (e.gone && e.kind === 'boar') addLog('หมูป่าวิ่งหนีไปแล้ว', 'info', 'boar');
  S.enemies = S.enemies.filter(e => e.hp > 0 && !e.gone);
  if (before && S.raid && !S.enemies.some(e => e.kind === 'raider')) {
    S.raid = false; S.moraleMod += 4;
    addLog('การบุกของโจรจบลงแล้ว', 'good', 'tower');
  }
  // remove old corpses
  S.col = S.col.filter(c => c.hp > 0 || S.tick - c.deadAt < DAY / 2);
  updateMorale();
  if (!alive().length) gameOver();
}

function gameOver() {
  S.over = true;
  addLog('ทุกคนเสียชีวิต อาณานิคมล่มสลาย', 'bad');
  clearSave();
  ui.dirty = true;
}

// ============================================================
// 12. Rendering
// ============================================================
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const view = { T: 32, dpr: 1, ground: null };
let alpha = 0;           // fraction of the current tick elapsed (for interpolation)

function fit() {
  const stage = canvas.parentElement;
  const cs = getComputedStyle(stage);
  const pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) +
              (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  let avail = stage.getBoundingClientRect().width - pad;
  if (!(avail > 0)) avail = window.innerWidth - 24;
  avail = Math.min(avail, 480, window.innerWidth);
  view.T = Math.max(16, Math.floor(avail / W));
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cw = view.T * W, ch = view.T * H;
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  canvas.width = Math.round(cw * view.dpr);
  canvas.height = Math.round(ch * view.dpr);
  art('init', view.T);
  PAL = pal();
  buildGround();
}
function buildGround() {
  const T = view.T, d = view.dpr;
  const g = document.createElement('canvas');
  g.width = Math.round(T * W * d); g.height = Math.round(T * H * d);
  const gx = g.getContext('2d');
  gx.setTransform(d, 0, 0, d, 0, 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) art('drawGround', gx, x * T, y * T, T, tileAt(x, y).g & 3);
  view.ground = g;
}

function drawLabel(text, cx, cy, color, size) {
  ctx.font = '600 ' + size + 'px system-ui, "Noto Sans Thai", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.lineJoin = 'round';
  ctx.strokeStyle = PAL.textShadow; ctx.strokeText(text, cx, cy);
  ctx.fillStyle = color; ctx.fillText(text, cx, cy);
}
function drawBar(x, y, w, frac, color) {
  ctx.fillStyle = PAL.textShadow; ctx.fillRect(x - 1, y - 1, w + 2, 5);
  ctx.fillStyle = color; ctx.fillRect(x, y, w * clamp(frac, 0, 1), 3);
}

function render(now, dtSim) {
  const T = view.T;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.clearRect(0, 0, W * T, H * T);
  if (view.ground) ctx.drawImage(view.ground, 0, 0, W * T, H * T);
  const rt = S.tick + alpha;

  // entities bucketed per row so taller sprites overlap correctly
  const rows = Array.from({ length: H }, () => []);
  const ents = [];
  for (const c of S.col) {
    const p = lerpPos(c, rt);
    const en = { c, p };
    ents.push(en);
    rows[clamp(Math.round(p.y), 0, H - 1)].push(en);
  }
  for (const e of S.enemies) {
    const p = lerpPos(e, rt);
    const en = { e, p };
    ents.push(en);
    rows[clamp(Math.round(p.y), 0, H - 1)].push(en);
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = tileAt(x, y);
      if (t.o) { ctx.save(); art('drawObject', ctx, t.o, x * T, y * T, T, now); ctx.restore(); }
      else if (t.bp) {
        ctx.save(); ctx.globalAlpha = 0.45; art('drawObject', ctx, t.bp.type, x * T, y * T, T, now); ctx.restore();
      }
    }
    rows[y].sort((a, b) => a.p.y - b.p.y);
    for (const en of rows[y]) {
      ctx.save();
      if (en.c) {
        const c = en.c;
        art('drawColonist', ctx, {
          name: c.name, trait: c.trait, hp: c.hp, maxHp: c.maxHp, state: c.hp > 0 ? c.state : 'dead',
          dir: c.dir, look: c.look, carrying: c.carrying, selected: ui.selected === c.id,
        }, en.p.x * T, en.p.y * T, T, now);
      } else art('drawEnemy', ctx, en.e.kind, en.p.x * T, en.p.y * T, T, now, en.e.dir);
      ctx.restore();
    }
  }

  // particles
  const dts = dtSim / 1000;
  if (S.weather === 'storm' && dtSim > 0) {
    const n = Math.ceil(dtSim / 16) * 3;
    for (let i = 0; i < n; i++) spawnPart('rain', Math.random() * (W + 2), -0.5 + Math.random() * 2, 1);
  }
  ui.smokeAcc = (ui.smokeAcc || 0) + dtSim;
  if (ui.smokeAcc > 450) { ui.smokeAcc = 0; spawnPart('smoke', CAMP.x + 0.5, CAMP.y + 0.2, 1); }
  for (const p of FX.parts) {
    p.life -= dtSim; p.vy += p.g * dts; p.x += p.vx * dts; p.y += p.vy * dts;
  }
  FX.parts = FX.parts.filter(p => p.life > 0);
  for (const p of FX.parts) {
    ctx.save();
    art('drawParticle', ctx, { kind: p.kind, x: p.x * T, y: p.y * T, life: p.life, maxLife: p.maxLife });
    ctx.restore();
  }

  // sky (day/night + weather) is the last world layer
  ctx.save();
  art('drawSky', ctx, W * T, H * T, phase(rt), S.weather, now);
  ctx.restore();

  // UI layer on top: highlights, labels, bars, floating numbers
  if (ui.build) {
    const h = ui.hover || ui.preview;
    if (h) {
      const ok = !canPlace(ui.build, h.x, h.y);
      ctx.save(); art('drawHighlight', ctx, h.x * T, h.y * T, T, ok ? 'build-ok' : 'build-bad'); ctx.restore();
      if (ok) { ctx.save(); ctx.globalAlpha = 0.5; art('drawObject', ctx, ui.build, h.x * T, h.y * T, T, now); ctx.restore(); }
    }
  }
  const sel = S.col.find(c => c.id === ui.selected && c.hp > 0);
  if (sel && sel.job) {
    let tx = sel.job.tx, ty = sel.job.ty;
    if (sel.job.kind === 'fight') { const e = enemyById(sel.job.eid); if (e) { tx = e.x; ty = e.y; } }
    if (tx !== undefined && inB(tx, ty)) { ctx.save(); art('drawHighlight', ctx, tx * T, ty * T, T, 'target'); ctx.restore(); }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = tileAt(x, y);
    if (t.bp) drawBar(x * T + T * 0.15, y * T + T - 6, T * 0.7, t.bp.prog / t.bp.need, PAL.gold);
  }
  const fs = Math.max(9, Math.round(T * 0.3));
  for (const en of ents) {
    const px = en.p.x * T, py = en.p.y * T;
    if (en.c) {
      const c = en.c;
      if (c.hp <= 0) continue;
      drawLabel(c.name, px + T / 2, py + T + fs * 0.35, ui.selected === c.id ? PAL.gold : PAL.text, fs);
      if (c.hp < c.maxHp || ui.selected === c.id) drawBar(px + T * 0.15, py - 2, T * 0.7, c.hp / c.maxHp, c.hp / c.maxHp < 0.35 ? PAL.bad : PAL.good);
    } else if (en.e.hp < en.e.maxHp) {
      drawBar(px + T * 0.15, py - 2, T * 0.7, en.e.hp / en.e.maxHp, PAL.bad);
    }
  }
  for (const f of FX.floats) { f.life -= dtSim; f.y -= 0.8 * dts; }
  FX.floats = FX.floats.filter(f => f.life > 0);
  for (const f of FX.floats) {
    ctx.globalAlpha = clamp(f.life / f.maxLife * 1.5, 0, 1);
    drawLabel(f.text, f.x * T, f.y * T, f.color, fs + 1);
  }
  ctx.globalAlpha = 1;
}

// ============================================================
// 13. DOM UI
// ============================================================
const $ = (id) => document.getElementById(id);
const ui = {
  build: null, preview: null, hover: null, pointerDown: false,
  selected: null, dirty: true, prioKey: '', toastTimer: 0, newConfirmUntil: 0,
};
const el = {
  day: $('v-day'), food: $('v-food'), wood: $('v-wood'), stone: $('v-stone'), pop: $('v-pop'), morale: $('v-morale'),
  moraleFill: $('morale-fill'), prio: $('prio-panel'), build: $('build-panel'), speed: $('speed-panel'),
  log: $('log'), toast: $('toast'), info: $('info-overlay'), over: $('over-overlay'), overText: $('over-text'),
  newBtn: $('btn-new'), pauseBtn: $('btn-pause'),
};
function setText(node, v) { v = String(v); if (node && node.textContent !== v) node.textContent = v; }

function toast(text) {
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.classList.add('is-visible');
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

function applyIcons() {
  document.querySelectorAll('img[data-icon]').forEach(img => setImg(img, img.dataset.icon));
}

function renderPrio() {
  const key = S.prio.join(',');
  if (key === ui.prioKey) return;
  ui.prioKey = key;
  el.prio.textContent = '';
  S.prio.forEach((k, i) => {
    const b = document.createElement('button');
    b.className = 'btn' + (i === 0 ? ' is-active' : '');
    b.dataset.prio = k;
    const img = document.createElement('img');
    img.className = 'btn-icon'; img.alt = '';
    setImg(img, PRIO_ICON[k]);
    const t = document.createElement('span'); t.className = 'btn-text'; t.textContent = PRIO_LABEL[k];
    const n = document.createElement('span'); n.className = 'btn-cost'; n.textContent = 'อันดับ ' + (i + 1);
    b.append(img, t, n);
    el.prio.appendChild(b);
  });
}

function renderLog() {
  if (!logDirty) return;
  logDirty = false;
  el.log.textContent = '';
  for (const l of S.log) {
    const d = document.createElement('div');
    d.className = 'log-item';
    d.dataset.kind = l.kind;
    if (l.icon) { const img = document.createElement('img'); img.className = 'log-icon'; img.alt = ''; setImg(img, l.icon); d.appendChild(img); }
    const s = document.createElement('span');
    s.textContent = 'วัน ' + l.day + ' · ' + l.text;
    d.appendChild(s);
    el.log.appendChild(d);
  }
}

function renderHUD() {
  const pop = alive().length;
  setText(el.day, S.day);
  setText(el.food, S.res.food);
  setText(el.wood, S.res.wood);
  setText(el.stone, S.res.stone);
  setText(el.pop, pop + '/' + popCap());
  const m = Math.round(S.morale);
  setText(el.morale, m);
  const w = m + '%';
  if (el.moraleFill.style.width !== w) el.moraleFill.style.width = w;
  const lvl = m < 30 ? 'low' : m < 60 ? 'mid' : 'high';
  if (el.moraleFill.dataset.level !== lvl) el.moraleFill.dataset.level = lvl;
  renderPrio();
  if (ui.build && !canAfford(BUILD[ui.build].cost)) setBuild(null);
  el.build.querySelectorAll('[data-build]').forEach(b => {
    const k = b.dataset.build;
    b.disabled = !canAfford(BUILD[k].cost) || S.over;
    b.classList.toggle('is-active', ui.build === k);
  });
  el.speed.querySelectorAll('[data-speed]').forEach(b => {
    const s = +b.dataset.speed;
    b.classList.toggle('is-active', s === S.speed);
  });
  const pi = el.pauseBtn.querySelector('img'), pt = el.pauseBtn.querySelector('.btn-text');
  if (pi) setImg(pi, S.speed === 0 ? 'play' : 'pause');
  if (pt) setText(pt, S.speed === 0 ? 'เล่น' : 'หยุด');
  const nt = el.newBtn.querySelector('.btn-text');
  setText(nt, performance.now() < ui.newConfirmUntil ? 'แน่ใจ?' : 'เกมใหม่');
  renderLog();
  renderInfo();
  const showOver = !!S.over;
  if (el.over.classList.contains('is-visible') !== showOver) {
    el.over.classList.toggle('is-visible', showOver);
    setText(el.overText, 'อาณานิคมอยู่รอดได้ ' + S.day + ' วัน');
  }
}

function renderInfo() {
  if (!el.info.classList.contains('is-visible')) return;
  const c = S.col.find(c => c.id === ui.selected);
  if (!c) { closeInfo(); return; }
  setText($('info-name'), c.name);
  setText($('info-trait'), c.trait);
  setText($('info-trait-desc'), TRAITS[c.trait] || '');
  setText($('info-hp'), c.hp + ' / ' + c.maxHp);
  setText($('info-job'), c.hp <= 0 ? 'เสียชีวิต' : c.job ? JOB_LABEL[c.job.kind] || '-' : 'ว่างงาน');
  setText($('info-carry'), c.carrying ? RES_LABEL[c.carrying] + ' ' + c.carryAmt : '-');
}
function openInfo(c) { ui.selected = c.id; el.info.classList.add('is-visible'); renderInfo(); }
function closeInfo() { el.info.classList.remove('is-visible'); ui.selected = null; }

function setBuild(type) {
  ui.build = type; ui.preview = null; ui.hover = null;
  ui.dirty = true;
}
function setSpeed(s) {
  if (s === 0) {
    if (S.speed === 0) S.speed = S.lastSpeed || 1;
    else { S.lastSpeed = S.speed; S.speed = 0; }
  } else { S.speed = s; S.lastSpeed = s; }
  ui.dirty = true;
}

// ============================================================
// 14. Input
// ============================================================
function pointerTile(ev) {
  const r = canvas.getBoundingClientRect();
  const fx = (ev.clientX - r.left) / r.width * W, fy = (ev.clientY - r.top) / r.height * H;
  return { fx, fy, x: Math.floor(fx), y: Math.floor(fy) };
}
function onTap(p) {
  if (S.over || !inB(p.x, p.y)) return;
  if (ui.build) {
    if (ui.preview && ui.preview.x === p.x && ui.preview.y === p.y) {
      const why = canPlace(ui.build, p.x, p.y);
      if (why) { toast(why); return; }
      const b = BUILD[ui.build];
      for (const k in b.cost) S.res[k] -= b.cost[k];
      tileAt(p.x, p.y).bp = { type: ui.build, prog: 0, need: b.work };
      addLog('วางแบบ' + b.name + 'แล้ว รอคนมาสร้าง', 'info', ui.build);
      setBuild(null);
    } else ui.preview = { x: p.x, y: p.y };
    return;
  }
  // pick a colonist near the tap point (uses interpolated positions)
  let best = null, bd = 0.85;
  for (const c of S.col) {
    if (c.hp <= 0) continue;
    const q = lerpPos(c, S.tick + alpha);
    const d = Math.hypot(q.x + 0.5 - p.fx, q.y + 0.5 - p.fy);
    if (d < bd) { bd = d; best = c; }
  }
  if (best) openInfo(best); else ui.selected = null;
}

canvas.style.touchAction = 'manipulation';
canvas.addEventListener('pointerdown', ev => {
  ui.pointerDown = true;
  if (ui.build) { const p = pointerTile(ev); ui.hover = { x: p.x, y: p.y }; }
});
canvas.addEventListener('pointermove', ev => {
  if (ui.build && (ui.pointerDown || ev.pointerType === 'mouse')) { const p = pointerTile(ev); ui.hover = inB(p.x, p.y) ? { x: p.x, y: p.y } : null; }
});
canvas.addEventListener('pointerup', ev => {
  ui.pointerDown = false;
  onTap(pointerTile(ev));
  if (ev.pointerType !== 'mouse') ui.hover = null;
  ui.dirty = true;
});
canvas.addEventListener('pointercancel', () => { ui.pointerDown = false; ui.hover = null; });
canvas.addEventListener('pointerleave', () => { if (!ui.pointerDown) ui.hover = null; });

el.prio.addEventListener('click', ev => {
  const b = ev.target.closest('[data-prio]');
  if (!b) return;
  const k = b.dataset.prio;
  S.prio = [k, ...S.prio.filter(p => p !== k)];
  for (const c of S.col) if (c.job && (OBJ_FOR[c.job.kind] || c.job.kind === 'build' || c.job.kind === 'idle')) c.job = null;
  ui.dirty = true;
});
el.build.addEventListener('click', ev => {
  const b = ev.target.closest('[data-build]');
  if (!b || b.disabled || S.over) return;
  const k = b.dataset.build;
  if (ui.build === k) setBuild(null);
  else { setBuild(k); closeInfo(); toast('แตะช่องว่างเพื่อเล็ง แล้วแตะซ้ำเพื่อวาง' + BUILD[k].name); }
});
el.speed.addEventListener('click', ev => {
  const b = ev.target.closest('[data-speed]');
  if (b) setSpeed(+b.dataset.speed);
});
el.newBtn.addEventListener('click', () => {
  const now = performance.now();
  if (now < ui.newConfirmUntil) { ui.newConfirmUntil = 0; restart(); }
  else { ui.newConfirmUntil = now + 3000; toast('แตะ "แน่ใจ?" อีกครั้งเพื่อเริ่มเกมใหม่'); }
  ui.dirty = true;
});
$('info-close').addEventListener('click', closeInfo);
el.info.addEventListener('click', ev => { if (ev.target === el.info) closeInfo(); });
$('over-restart').addEventListener('click', restart);
window.addEventListener('keydown', ev => {
  if (ev.key === 'Escape') { setBuild(null); closeInfo(); }
  if (ev.key === ' ') { setSpeed(0); ev.preventDefault(); }
});

// ============================================================
// 15. Main loop, lifecycle
// ============================================================
let last = 0, acc = 0, lastUI = 0, lastSave = 0;

function frame(now) {
  const dt = Math.min(now - (last || now), 250);
  last = now;
  let dtSim = 0;
  if (!S.over && S.speed > 0) {
    const tms = TICK_MS / S.speed;
    acc += dt;
    let n = 0;
    while (acc >= tms && n < 12) { tick(); acc -= tms; n++; ui.dirty = true; }
    if (n >= 12) acc = 0;
    alpha = clamp(acc / tms, 0, 1);
    dtSim = dt * S.speed;
  }
  render(now, dtSim);
  if (ui.dirty || now - lastUI > 500) { if (now - lastUI > 100) { renderHUD(); lastUI = now; ui.dirty = false; } }
  if (now - lastSave > 5000) { saveGame(); lastSave = now; }
  requestAnimationFrame(frame);
}

function restart() {
  clearSave();
  FX.parts = []; FX.floats = [];
  ui.prioKey = ''; ui.selected = null; acc = 0; alpha = 0;
  setBuild(null);
  closeInfo();
  newGameState();
  buildGround();
  logDirty = true;
  ui.dirty = true;
  renderHUD();
  saveGame();
}

document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });
window.addEventListener('pagehide', saveGame);
let resizeTimer = 0;
window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fit, 80); });

// Debug / test hook (used by automated tests; harmless for players)
window.__colony = {
  get state() { return S; },
  get tileSize() { return view.T; },
  artErrors,
  ticks(n) { for (let i = 0; i < n && !S.over; i++) tick(); ui.dirty = true; },
  forceEvent(kind) { if (EVENTS.includes(kind)) fireEvent(kind); ui.dirty = true; },
  save: saveGame,
  reload() { const ok = loadGame(); if (ok) { logDirty = true; ui.prioKey = ''; buildGround(); ui.dirty = true; } return ok; },
  restart,
  tileClientPos(x, y) { const r = canvas.getBoundingClientRect(); return { x: r.left + (x + 0.5) * r.width / W, y: r.top + (y + 0.5) * r.height / H }; },
};

// boot
if (!loadGame()) newGameState();
fit();
applyIcons();
renderHUD();
requestAnimationFrame(frame);
})();
