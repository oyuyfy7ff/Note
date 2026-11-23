/* Mini Colony v2 — landscape RimWorld-like colony sim.
 * Game logic, input, camera and render loop. All sprites go through window.Art
 * (CONTRACT.md v2); this file only draws text, bars and floating numbers itself.
 */
(() => {
'use strict';

// ============================================================
// 1. Constants & tuning
// ============================================================
const W = 48, H = 32, N = W * H;
const TICK_MS = 250;              // 4 ticks/sec at 1x
const DAY = 720;                  // ticks per day (3 min at 1x)
const NIGHT = 0.62;               // phase where night starts (0 = dawn)
const SAVE_KEY = 'mini-colony-v2';
const SAVE_VERSION = 2;
const STACK_MAX = 75, CARRY = 25;
const ZMIN = 16, ZMAX = 64;
const DIR4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // N E S W (mask bits 1,2,4,8)

const GROUND = ['grass', 'soil', 'rich', 'sand', 'gravel'];
const FERT = [1, 1, 1.4, 0.6, 0.5];
const WORK_TYPES = ['build', 'grow', 'mine', 'chop', 'haul', 'cook'];
const WORK_LABEL = { build: 'ก่อสร้าง', grow: 'ปลูก', mine: 'ขุด', chop: 'ตัดไม้', haul: 'ขนของ', cook: 'ทำอาหาร' };
const ITEM_LABEL = { wood: 'ไม้', stone: 'หิน', berries: 'เบอร์รี่', rice: 'ข้าว', meal: 'อาหารปรุง' };
const ITEM_KINDS = ['meal', 'rice', 'berries', 'wood', 'stone'];
const RAW_FOOD = ['rice', 'berries'];
const FOOD_VALUE = { meal: 0.9, rice: 0.3, berries: 0.3 };
const BUILD = {
  wall_wood:  { name: 'กำแพงไม้', cost: { wood: 5 }, work: 20, obj: 'wall', mat: 'wood', hp: 40, drag: true },
  wall_stone: { name: 'กำแพงหิน', cost: { stone: 5 }, work: 35, obj: 'wall', mat: 'stone', hp: 90, drag: true },
  door_wood:  { name: 'ประตูไม้', cost: { wood: 8 }, work: 25, obj: 'door', mat: 'wood', hp: 35 },
  bed:        { name: 'เตียง', cost: { wood: 15 }, work: 30, obj: 'bed' },
  turret:     { name: 'ป้อมปืน', cost: { wood: 10, stone: 25 }, work: 60, obj: 'turret', hp: 60 },
  campfire:   { name: 'กองไฟ', cost: { wood: 15 }, work: 15, obj: 'campfire' },
  torch:      { name: 'คบเพลิง', cost: { wood: 4 }, work: 8, obj: 'torch' },
};
const OBJ_NAME = {
  tree: 'ต้นไม้', rock: 'หินก้อนใหญ่', bush: 'พุ่มเบอร์รี่', bush_empty: 'พุ่มเบอร์รี่ (ยังไม่ออกผล)', campfire: 'กองไฟ',
  bed: 'เตียง', turret: 'ป้อมปืน', torch: 'คบเพลิง',
};
const BLOCKING = { rock: 1, wall: 1, turret: 1, campfire: 1 };
const PLAYER_BUILT = { wall: 1, door: 1, bed: 1, turret: 1, campfire: 1, torch: 1 };
const TOOLS = {
  architect: ['wall_wood', 'wall_stone', 'door_wood', 'bed', 'turret', 'campfire', 'torch'],
  orders: ['chop', 'mine', 'harvest', 'deconstruct', 'cancel', 'draft', 'undraft'],
  zones: ['zone_grow', 'zone_stockpile', 'zone_remove'],
};
const TOOL_NAME = {
  chop: 'ตัดไม้', mine: 'ขุด', harvest: 'เก็บเกี่ยว', deconstruct: 'รื้อถอน', cancel: 'ยกเลิก',
  draft: 'เกณฑ์ทุกคน', undraft: 'ปลดทุกคน',
  zone_grow: 'พื้นที่ปลูก', zone_stockpile: 'คลังเก็บ', zone_remove: 'ลบโซน',
};
const INSTANT_TOOLS = { draft: 1, undraft: 1 };
const TRAITS = {
  'ขยัน': 'ทำงานเร็วกว่าคนอื่น',
  'ขี้เกียจ': 'ทำงานและเดินช้ากว่าคนอื่น',
  'แข็งแรง': 'เลือดมากกว่า และยิงแรงกว่า',
  'ตะกละ': 'หิวเร็วกว่าคนอื่น',
};
const TRAIT_LIST = Object.keys(TRAITS);
const NAMES = ['มะลิ', 'ต้น', 'ฟ้า', 'บอย', 'น้ำ', 'ไผ่', 'ข้าวหอม', 'เมฆ', 'ฝน', 'ดาว', 'แก้ว', 'ส้ม', 'ปลา', 'หมอก',
  'ทราย', 'ภู', 'เตย', 'จันทร์', 'โอ๊ต', 'มิ้นท์', 'ก้อง', 'นนท์', 'พลอย', 'เพชร'];
const SEASONS = ['ฤดูร้อน', 'ฤดูฝน', 'ฤดูหนาว'];

// ============================================================
// 2. Helpers
// ============================================================
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const idx = (x, y) => y * W + x;
const ix = (i) => i % W;
const iy = (i) => (i / W) | 0;
const inB = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));
const manh = (ax, ay, bx, by) => Math.abs(ax - bx) + Math.abs(ay - by);

// ============================================================
// 3. Art bridge (guarded; failures recorded once)
// ============================================================
const artErrors = {};
function noteArtError(name, err) {
  if (!artErrors[name]) { artErrors[name] = String((err && err.message) || err); console.warn('[colony] Art.' + name + ' failed:', err); }
}
const FB_COL = { grass: '#4d6b3c', soil: '#6b5436', rich: '#3f3222', sand: '#b59d6a', gravel: '#77756c' };
const FALLBACK = {
  init() {},
  drawGround(ctx, kind, px, py, s) { ctx.fillStyle = FB_COL[kind] || '#4d6b3c'; ctx.fillRect(px, py, s + 0.5, s + 0.5); },
  drawMountain(ctx, px, py, s) { ctx.fillStyle = '#5b5650'; ctx.fillRect(px, py, s + 0.5, s + 0.5); },
  drawObject(ctx, type, px, py, s) { ctx.fillStyle = type === 'tree' ? '#2f5d2a' : '#8a7d6a'; ctx.fillRect(px + s * 0.2, py + s * 0.2, s * 0.6, s * 0.6); },
  drawWall(ctx, m, px, py, s) { ctx.fillStyle = m === 'stone' ? '#7d7a74' : '#7a5a36'; ctx.fillRect(px, py, s, s); },
  drawDoor(ctx, m, px, py, s) { ctx.fillStyle = '#9a7443'; ctx.fillRect(px + s * 0.1, py + s * 0.1, s * 0.8, s * 0.8); },
  drawCrop(ctx, k, px, py, s, g) { ctx.fillStyle = '#9bc45a'; ctx.fillRect(px + s * 0.3, py + s * (0.8 - g * 0.5), s * 0.4, s * g * 0.5); },
  drawZone(ctx, k, px, py, s) { ctx.fillStyle = k === 'grow' ? 'rgba(90,200,90,.18)' : 'rgba(120,150,220,.18)'; ctx.fillRect(px, py, s, s); },
  drawItem(ctx, k, px, py, s) { ctx.fillStyle = '#c9a86a'; ctx.fillRect(px + s * 0.3, py + s * 0.4, s * 0.4, s * 0.3); },
  drawBlueprint(ctx, t, px, py, s) { ctx.strokeStyle = '#6fb5ff'; ctx.strokeRect(px + 2, py + 2, s - 4, s - 4); },
  drawDesignation(ctx, k, px, py, s) { ctx.fillStyle = '#ffd34d'; ctx.fillRect(px + s * 0.4, py + s * 0.05, s * 0.2, s * 0.2); },
  drawColonist(ctx, c, px, py, s) { ctx.fillStyle = '#f0c89a'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.3, 0, 7); ctx.fill(); },
  drawEnemy(ctx, k, px, py, s) { ctx.fillStyle = '#c33'; ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.3, 0, 7); ctx.fill(); },
  drawProjectile(ctx, p) { ctx.fillStyle = '#ffe08a'; ctx.fillRect(p.x - 1, p.y - 1, 3, 3); },
  drawSelection(ctx, px, py, w, h) { ctx.strokeStyle = '#fff'; ctx.strokeRect(px, py, w, h); },
  drawDragRect(ctx, x, y, w, h) { ctx.strokeStyle = '#fff'; ctx.strokeRect(x, y, w, h); },
  drawHighlight(ctx, px, py, s, k) { ctx.strokeStyle = k === 'build-bad' ? '#e5645a' : '#f2c14e'; ctx.strokeRect(px + 1, py + 1, s - 2, s - 2); },
  drawParticle() {},
  drawSky() {},
  icon() { return ''; },
  portrait() { return ''; },
};
function art(name, a, b, c, d, e, f, g, h) {
  const A = window.Art;
  const fn = A && A[name];
  if (typeof fn !== 'function') {
    noteArtError(name, 'missing');
    return FALLBACK[name] ? FALLBACK[name](a, b, c, d, e, f, g, h) : undefined;
  }
  try { return fn.call(A, a, b, c, d, e, f, g, h); } catch (err) {
    noteArtError(name, err);
    return FALLBACK[name] ? FALLBACK[name](a, b, c, d, e, f, g, h) : undefined;
  }
}
const PAL_DEFAULT = { text: '#f4ead8', textShadow: 'rgba(0,0,0,.8)', good: '#7fcf7a', bad: '#e5645a', warn: '#f2c14e',
  gold: '#f0cb6a', night: '#0b1030', outline: '#1d140c', panel: '#2a2118', muted: '#a89a84', hostile: '#e0503c',
  select: '#f0cb6a', draft: '#e8a33c' };
let PAL = PAL_DEFAULT;
function refreshPalette() { PAL = Object.assign({}, PAL_DEFAULT, (window.Art && window.Art.palette) || {}); }
const iconCache = {};
function icon(name) {
  if (!(name in iconCache)) { const u = art('icon', name); iconCache[name] = typeof u === 'string' ? u : ''; }
  return iconCache[name];
}
const portraitCache = {};
function portrait(look) {
  if (!(look in portraitCache)) { const u = art('portrait', look); portraitCache[look] = typeof u === 'string' ? u : ''; }
  return portraitCache[look];
}
function setImg(img, url) {
  if (url) { if (img.getAttribute('src') !== url) img.src = url; img.style.visibility = ''; }
  else img.style.visibility = 'hidden';
}
function overflowOf(type) {
  const o = window.Art && window.Art.overflow;
  return (o && typeof o[type] === 'number') ? o[type] : 0;
}

// ============================================================
// 4. State: creation, save, load
// ============================================================
let S = null;
const FX = { parts: [], floats: [] };   // visual only

function emptyMap() {
  const m = { g: [], gv: [], mt: [], o: [], z: [], cr: [], it: [], d: [], bp: [] };
  for (let i = 0; i < N; i++) {
    m.g.push(0); m.gv.push(rnd(0, 3)); m.mt.push(0); m.o.push(null); m.z.push(0);
    m.cr.push(null); m.it.push(null); m.d.push(null); m.bp.push(null);
  }
  return m;
}

function genMap(m) {
  // ground blobs
  const blob = (kind, count, rmin, rmax) => {
    for (let k = 0; k < count; k++) {
      const cx = rnd(0, W - 1), cy = rnd(0, H - 1), r = rnd(rmin, rmax);
      for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
        if (!inB(x, y)) continue;
        const d = Math.hypot(x - cx, y - cy) + Math.random() * 1.5;
        if (d <= r) m.g[idx(x, y)] = kind;
      }
    }
  };
  blob(1, 7, 2, 5); blob(3, 4, 2, 4); blob(2, 4, 2, 3);
  // mountain mass on one side
  const east = Math.random() < 0.5;
  const p1 = Math.random() * 6, p2 = Math.random() * 6;
  for (let y = 0; y < H; y++) {
    const edge = Math.round(10 + 2.5 * Math.sin(y * 0.33 + p1) + 1.6 * Math.sin(y * 0.9 + p2));
    for (let k = 0; k < edge; k++) {
      const x = east ? W - 1 - k : k;
      m.mt[idx(x, y)] = 1;
      m.g[idx(x, y)] = 4;
    }
    for (let k = edge; k < edge + 2; k++) { const x = east ? W - 1 - k : k; if (inB(x, y)) m.g[idx(x, y)] = 4; }
  }
  const start = { x: east ? 17 : W - 18, y: (H / 2) | 0 };
  // vegetation and boulders
  for (let i = 0; i < N; i++) {
    if (m.mt[i]) continue;
    const x = ix(i), y = iy(i);
    if (cheb(x, y, start.x, start.y) <= 5) continue;
    const r = Math.random(), gk = m.g[i];
    if (gk === 4) { if (r < 0.08) m.o[i] = { type: 'rock', v: rnd(0, 3) }; continue; }
    if (gk === 3) { if (r < 0.02) m.o[i] = { type: 'rock', v: rnd(0, 3) }; continue; }
    if (r < 0.10) m.o[i] = { type: 'tree', v: rnd(0, 3) };
    else if (r < 0.125) m.o[i] = { type: 'bush', v: rnd(0, 3) };
    else if (r < 0.14) m.o[i] = { type: 'rock', v: rnd(0, 3) };
  }
  return start;
}

function newGameState() {
  S = {
    v: SAVE_VERSION, tick: 0, day: 1, m: emptyMap(), col: [], en: [], proj: [],
    speed: 1, lastSpeed: 1, morale: 60, moraleMod: 0,
    nextEvent: DAY * 2 + rnd(60, 240), weather: 'clear', weatherEnd: 0,
    log: [], nextId: 1, over: false, raid: false, treeTarget: 0, start: null, cam: null, starveDay: 0,
  };
  const start = genMap(S.m);
  S.start = start;
  S.treeTarget = S.m.o.filter(o => o && o.type === 'tree').length;
  // campfire and a starting stockpile with supplies
  S.m.o[idx(start.x, start.y)] = { type: 'campfire' };
  for (let y = start.y - 4; y <= start.y - 2; y++) for (let x = start.x - 2; x <= start.x + 2; x++) S.m.z[idx(x, y)] = 2;
  placeItem('wood', 75, idx(start.x - 2, start.y - 3));
  placeItem('wood', 45, idx(start.x - 1, start.y - 3));
  placeItem('meal', 12, idx(start.x, start.y - 3));
  placeItem('rice', 30, idx(start.x + 1, start.y - 3));
  placeItem('stone', 20, idx(start.x + 2, start.y - 3));
  const traits = TRAIT_LIST.slice().sort(() => Math.random() - 0.5);
  [[-1, 1], [1, 1], [0, 2]].forEach((d, k) => S.col.push(makeColonist(start.x + d[0], start.y + d[1], traits[k])));
  S.cam = null;
  addLog('ยานตกแล้ว! ผู้รอดชีวิต 3 คนต้องสร้างอาณานิคมใหม่ในดินแดนนี้', 'info', 'pop');
}

function makeColonist(x, y, trait) {
  const used = new Set(S.col.map(c => c.name));
  const free = NAMES.filter(n => !used.has(n));
  const maxHp = trait === 'แข็งแรง' ? 28 : 20;
  const prio = {};
  for (const w of WORK_TYPES) prio[w] = 3;
  return {
    id: S.nextId++, name: free.length ? pick(free) : 'ผู้มาใหม่', trait, look: rnd(0, 7),
    hp: maxHp, maxHp, food: 0.8 + Math.random() * 0.2, rest: 0.8 + Math.random() * 0.2,
    x, y, fx: x, fy: y, st: 0, sl: 1, dir: 1, state: 'idle', job: null, carry: null, prio,
    drafted: false, downed: false, dead: false, deadAt: 0, bed: -1, atkCool: 0, ground: false,
    lastProg: 0, nextPlan: 0, target: null, moveTo: -1,
  };
}

function saveGame() {
  if (!S || S.over) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}
function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const o = JSON.parse(raw);
    if (!o || o.v !== SAVE_VERSION || o.over || !o.m || !Array.isArray(o.col) || !Array.isArray(o.en)) return false;
    for (const k of ['g', 'gv', 'mt', 'o', 'z', 'cr', 'it', 'd', 'bp']) if (!Array.isArray(o.m[k]) || o.m[k].length !== N) return false;
    if (!Array.isArray(o.proj)) o.proj = [];
    S = o;
    return true;
  } catch (e) { return false; }
}

// ============================================================
// 5. Map queries
// ============================================================
const alive = () => S.col.filter(c => !c.dead);
const phase = (t) => (((t % DAY) + DAY) % DAY) / DAY;
const isNight = () => phase(S.tick) >= NIGHT;
function passable(i, enemy) {
  const m = S.m;
  if (m.mt[i]) return false;
  const o = m.o[i];
  if (o && (BLOCKING[o.type] || (enemy && o.type === 'door'))) return false;
  return true;
}
function ghostPassable(i) {                // enemies planning to smash through structures
  const m = S.m;
  if (m.mt[i]) return false;
  const o = m.o[i];
  return !(o && (o.type === 'rock' || o.type === 'campfire'));
}
function blocksSight(i) {
  const m = S.m;
  if (m.mt[i]) return true;
  const o = m.o[i];
  return !!(o && (o.type === 'wall' || (o.type === 'door' && (o.open || 0) < 0.5)));
}
function los(ax, ay, bx, by) {
  let x = ax, y = ay;
  const dx = Math.abs(bx - ax), dy = -Math.abs(by - ay), sx = ax < bx ? 1 : -1, sy = ay < by ? 1 : -1;
  let err = dx + dy;
  while (!(x === bx && y === by)) {
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
    if (x === bx && y === by) break;
    if (blocksSight(idx(x, y))) return false;
  }
  return true;
}
function unitAt(i) {
  const x = ix(i), y = iy(i);
  return S.col.some(c => !c.dead && c.x === x && c.y === y) || S.en.some(e => e.x === x && e.y === y);
}
function maskOf(i, pred) {
  const x = ix(i), y = iy(i);
  let m = 0;
  for (let k = 0; k < 4; k++) {
    const nx = x + DIR4[k][0], ny = y + DIR4[k][1];
    if (inB(nx, ny) && pred(idx(nx, ny))) m |= 1 << k;
  }
  return m;
}
const isMtn = (i) => !!S.m.mt[i];
const isWallish = (i) => { const o = S.m.o[i]; return !!(o && (o.type === 'wall' || o.type === 'door')); };
const isWallishBp = (i) => { const b = S.m.bp[i]; return isWallish(i) || !!(b && (b.type.startsWith('wall') || b.type === 'door_wood')); };

// Stockpile resource counts (RimWorld-style readout)
function countStock() {
  const r = { meal: 0, rice: 0, berries: 0, wood: 0, stone: 0 };
  const m = S.m;
  for (let i = 0; i < N; i++) { const it = m.it[i]; if (it && m.z[i] === 2) r[it.kind] += it.n; }
  return r;
}
function countAllFood() {
  let n = 0;
  for (const it of S.m.it) if (it && FOOD_VALUE[it.kind]) n += it.kind === 'meal' ? it.n : it.n / 3;
  return n;
}
function countItems(kind) { let n = 0; for (const it of S.m.it) if (it && it.kind === kind) n += it.n; return n; }

// ============================================================
// 6. Pathfinding (shared buffers; BFS on a 48x32 4-neighbour grid)
// ============================================================
const bDist = new Int16Array(N), bPrev = new Int32Array(N), bQ = new Int32Array(N);
// mode: 0 colonist, 1 enemy, 2 enemy ghost (through structures)
function bfsFrom(start, mode, maxDist, goalFn) {
  bDist.fill(-1);
  bDist[start] = 0; bPrev[start] = -1;
  let h = 0, t = 0;
  bQ[t++] = start;
  while (h < t) {
    const cur = bQ[h++];
    if (goalFn && goalFn(cur)) return cur;
    const d = bDist[cur];
    if (maxDist && d >= maxDist) continue;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DIR4[k][0], ny = cy + DIR4[k][1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (bDist[n] !== -1) continue;
      if (mode === 2 ? !ghostPassable(n) : !passable(n, mode === 1)) continue;
      bDist[n] = d + 1; bPrev[n] = cur; bQ[t++] = n;
    }
  }
  return -1;
}
function pathTo(goal) {
  if (goal < 0 || bDist[goal] < 0) return null;
  const p = [];
  for (let c = goal; bPrev[c] !== -1; c = bPrev[c]) p.push(c);
  p.reverse();
  return p;
}
// best tile from which to work on tile i (after bfsFrom); allowOn = may stand on it
function standFor(i, allowOn) {
  let best = -1, bd = 1e9;
  if (allowOn && bDist[i] >= 0) { best = i; bd = bDist[i]; }
  const x = ix(i), y = iy(i);
  for (let k = 0; k < 4; k++) {
    const nx = x + DIR4[k][0], ny = y + DIR4[k][1];
    if (!inB(nx, ny)) continue;
    const n = idx(nx, ny);
    if (bDist[n] >= 0 && bDist[n] + 1 < bd) { bd = bDist[n] + 1; best = n; }
  }
  return best < 0 ? null : { stand: best, cost: bd };
}

// Item placement with its own BFS buffers (safe to call between other path queries)
const pVisit = new Uint8Array(N), pQ = new Int32Array(N);
function placeItem(kind, n, at) {
  if (n <= 0) return;
  const m = S.m;
  pVisit.fill(0);
  let h = 0, t = 0;
  pQ[t++] = at; pVisit[at] = 1;
  while (h < t && n > 0) {
    const cur = pQ[h++];
    const it = m.it[cur];
    const okTile = !m.mt[cur] && !(m.o[cur] && BLOCKING[m.o[cur].type]);
    if (okTile) {
      if (!it) { const k = Math.min(n, STACK_MAX); m.it[cur] = { kind, n: k }; n -= k; }
      else if (it.kind === kind && it.n < STACK_MAX) { const k = Math.min(n, STACK_MAX - it.n); it.n += k; n -= k; }
    }
    const cx = cur % W, cy = (cur / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = cx + DIR4[k][0], ny = cy + DIR4[k][1];
      if (!inB(nx, ny)) continue;
      const nb = idx(nx, ny);
      if (pVisit[nb] || m.mt[nb]) continue;
      pVisit[nb] = 1; pQ[t++] = nb;
    }
  }
}
function takeItem(i, want) {
  const it = S.m.it[i];
  if (!it) return 0;
  const k = Math.min(it.n, want);
  it.n -= k;
  if (it.n <= 0) S.m.it[i] = null;
  return k;
}

// ============================================================
// 7. Log, letters, toast, FX
// ============================================================
let logDirty = true;
function addLog(text, kind, ic) {
  S.log.unshift({ text, kind: kind || 'info', icon: ic || null, day: S.day });
  if (S.log.length > 40) S.log.length = 40;
  logDirty = true;
}
const letters = [];
function letter(title, body, ic, kind) {
  addLog(title + ': ' + body, kind || 'event', ic);
  letters.push({ title, body });
  showNextLetter();
}
function floatText(text, x, y, color) {
  if (FX.floats.length > 60) FX.floats.shift();
  FX.floats.push({ text, x: x + 0.5, y: y + 0.1, life: 1100, maxLife: 1100, color: color || PAL.text });
}
function spawnPart(kind, x, y, n) {
  for (let k = 0; k < (n || 1); k++) {
    if (FX.parts.length > 300) FX.parts.shift();
    const p = { kind, x, y, vx: 0, vy: 0, g: 0, life: 600, maxLife: 600 };
    switch (kind) {
      case 'chip': p.vx = (Math.random() - 0.5) * 3; p.vy = -2 - Math.random() * 1.5; p.g = 9; p.life = 500; break;
      case 'leaf': p.vx = (Math.random() - 0.5) * 1.5; p.vy = -0.8; p.g = 1.5; p.life = 900; break;
      case 'spark': p.vx = (Math.random() - 0.5) * 3; p.vy = (Math.random() - 0.5) * 3; p.life = 300; break;
      case 'dust': p.vx = (Math.random() - 0.5) * 0.8; p.vy = -0.4; p.life = 500; break;
      case 'smoke': p.vx = (Math.random() - 0.5) * 0.3; p.vy = -0.7; p.life = 1600; break;
      case 'blood': p.vx = (Math.random() - 0.5) * 2; p.vy = -1.2; p.g = 7; p.life = 450; break;
    }
    p.maxLife = p.life;
    FX.parts.push(p);
  }
}

// ============================================================
// 8. Movement
// ============================================================
const moving = (e) => S.tick < e.st + e.sl;
function stepTo(e, n, len) {
  const nx = ix(n), ny = iy(n);
  e.fx = e.x; e.fy = e.y; e.x = nx; e.y = ny; e.st = S.tick; e.sl = len;
  if (nx !== e.fx) e.dir = nx > e.fx ? 1 : -1;
  const o = S.m.o[n];
  if (o && o.type === 'door') o.openUntil = S.tick + len + 3;
}
function face(e, tx) { if (tx !== e.x) e.dir = tx > e.x ? 1 : -1; }
function lerpPos(e, rt, out) {
  const k = clamp((rt - e.st) / (e.sl || 1), 0, 1);
  out.x = e.fx + (e.x - e.fx) * k; out.y = e.fy + (e.y - e.fy) * k;
  return out;
}
function moveLen(c, n) {
  let l = c.trait === 'ขี้เกียจ' ? 3 : 2;
  if (c.carry && c.carry.n > 15) l += 0;   // keep it simple
  const o = S.m.o[n];
  if (o && (o.type === 'door' || o.type === 'tree')) l += 1;
  return l;
}
// Walk along job.path toward goal; returns 'arrived' | 'moving' | 'fail'
function follow(c, j, goal) {
  const cur = idx(c.x, c.y);
  if (cur === goal) return 'arrived';
  if (!j.path || !j.path.length || !passable(j.path[0], false)) {
    bfsFrom(cur, 0, 0, (i) => i === goal);
    j.path = pathTo(goal);
    if (!j.path) return 'fail';
    if (!j.path.length) return 'arrived';
  }
  const n = j.path.shift();
  stepTo(c, n, moveLen(c, n));
  c.state = 'walk';
  c.lastProg = S.tick;
  return 'moving';
}

// ============================================================
// 9. Colonist AI — needs, work scanning, job execution
// ============================================================
function workSpeed(c) {
  let s = c.trait === 'ขยัน' ? 1.4 : c.trait === 'ขี้เกียจ' ? 0.7 : 1;
  if (S.morale < 25) s *= 0.75;
  if (c.rest <= 0.05) s *= 0.6;
  return s;
}
function reservedSet(except) {
  const r = new Set();
  for (const c of S.col) if (c !== except && !c.dead && c.job && c.job.res) for (const i of c.job.res) r.add(i);
  return r;
}
function incomingTo(bpI, kind) {
  let n = 0;
  for (const c of S.col) {
    const j = c.job;
    if (j && j.t === 'supply' && j.bp === bpI && j.kind === kind) n += j.amt;
  }
  return n;
}
function bpRemaining(i, kind) {
  const b = S.m.bp[i];
  const need = BUILD[b.type].cost[kind] || 0;
  return need - (b.have[kind] || 0);
}
function bpReady(b) {
  const cost = BUILD[b.type].cost;
  for (const k in cost) if ((b.have[k] || 0) < cost[k]) return false;
  return true;
}
function stockpileCellFor(kind, res) {
  // assumes bfsFrom already run from the hauler's position
  const m = S.m;
  let best = -1, bd = 1e9;
  for (let i = 0; i < N; i++) {
    if (m.z[i] !== 2 || bDist[i] < 0 || res.has(i)) continue;
    if (!passable(i, false) || m.bp[i]) continue;
    const it = m.it[i];
    if (it && (it.kind !== kind || it.n >= STACK_MAX)) continue;
    const d = bDist[i] - (it ? 0.5 : 0);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
function stockpileHasRoom() {
  const m = S.m;
  const room = {};
  for (let i = 0; i < N; i++) {
    if (m.z[i] !== 2 || !passable(i, false)) continue;
    const it = m.it[i];
    if (!it) return null;              // an empty cell accepts anything
    if (it.n < STACK_MAX) room[it.kind] = true;
  }
  return room;
}

// Scan for the best job for colonist c. Returns a job or null. Leaves bfs buffers from c's position.
function findWork(c) {
  const m = S.m;
  const start = idx(c.x, c.y);
  bfsFrom(start, 0, 0, null);
  const res = reservedSet(c);
  const night = isNight();
  // lazily computed nearest unreserved reachable item per kind
  const nearestItem = {};
  const itemNear = (kind, minN) => {
    const key = kind + (minN || 0);
    if (key in nearestItem) return nearestItem[key];
    let best = -1, bd = 1e9;
    for (let i = 0; i < N; i++) {
      const it = m.it[i];
      if (!it || it.kind !== kind || bDist[i] < 0 || res.has(i) || (minN && it.n < minN)) continue;
      if (bDist[i] < bd) { bd = bDist[i]; best = i; }
    }
    return (nearestItem[key] = best);
  };
  const scan = {
    build() {
      let best = null;
      for (let i = 0; i < N; i++) {
        const b = m.bp[i];
        if (b && !res.has(i)) {
          if (bpReady(b)) {
            const blocking = BLOCKING[BUILD[b.type].obj] || BUILD[b.type].obj === 'door';
            const s = standFor(i, !blocking);
            if (s && (!best || s.cost < best.cost)) best = { t: 'work', kind: 'build', tgt: i, stand: s.stand, cost: s.cost, res: [i] };
          } else {
            const cost = BUILD[b.type].cost;
            for (const k in cost) {
              const need = bpRemaining(i, k) - incomingTo(i, k);
              if (need <= 0) continue;
              const it = itemNear(k);
              if (it < 0) continue;
              const s = standFor(i, true);
              if (!s) continue;
              const cst = bDist[it] + s.cost * 0.25;
              if (!best || cst < best.cost) best = { t: 'supply', kind: k, item: it, bp: i, amt: Math.min(need, CARRY), stage: 0, cost: cst, res: [it] };
            }
          }
        } else if (m.d[i] === 'deconstruct' && m.o[i] && !res.has(i)) {
          const s = standFor(i, !BLOCKING[m.o[i].type]);
          if (s && (!best || s.cost < best.cost)) best = { t: 'work', kind: 'decon', tgt: i, stand: s.stand, cost: s.cost, res: [i] };
        }
      }
      return best;
    },
    grow() {
      let best = null;
      for (let i = 0; i < N; i++) {
        if (res.has(i)) continue;
        let kind = null;
        const cr = m.cr[i], o = m.o[i];
        if (cr && cr.g >= 1) kind = 'harvestCrop';
        else if (m.d[i] === 'harvest' && o && o.type === 'bush') kind = 'harvest';
        else if (!night && m.z[i] === 1 && !cr && !o && !m.it[i] && !m.bp[i] && !m.mt[i]) kind = 'sow';
        if (!kind) continue;
        const d = bDist[i];
        if (d < 0) continue;
        if (!best || d < best.cost) best = { t: 'work', kind, tgt: i, stand: i, cost: d, res: [i] };
      }
      return best;
    },
    mine() {
      let best = null;
      for (let i = 0; i < N; i++) {
        if (m.d[i] !== 'mine' || res.has(i)) continue;
        if (!m.mt[i] && !(m.o[i] && m.o[i].type === 'rock')) continue;
        const s = standFor(i, false);
        if (s && (!best || s.cost < best.cost)) best = { t: 'work', kind: 'mine', tgt: i, stand: s.stand, cost: s.cost, res: [i] };
      }
      return best;
    },
    chop() {
      let best = null;
      for (let i = 0; i < N; i++) {
        if (m.d[i] !== 'chop' || res.has(i) || !m.o[i] || m.o[i].type !== 'tree') continue;
        const s = standFor(i, true);
        if (s && (!best || s.cost < best.cost)) best = { t: 'work', kind: 'chop', tgt: i, stand: s.stand, cost: s.cost, res: [i] };
      }
      return best;
    },
    haul() {
      const room = stockpileHasRoom();
      if (room && !Object.keys(room).length) return null;
      let best = null;
      for (let i = 0; i < N; i++) {
        const it = m.it[i];
        if (!it || m.z[i] === 2 || bDist[i] < 0 || res.has(i)) continue;
        if (room && !room[it.kind]) continue;
        if (!best || bDist[i] < best.cost) best = { t: 'haul', item: i, stage: 0, dest: -1, cost: bDist[i], res: [i] };
      }
      return best;
    },
    cook() {
      const target = Math.max(6, alive().length * 3);
      if (countItems('meal') >= target) return null;
      let fire = -1, fd = 1e9;
      for (let i = 0; i < N; i++) {
        const o = m.o[i];
        if (!o || o.type !== 'campfire' || res.has(i)) continue;
        const s = standFor(i, false);
        if (s && s.cost < fd) { fd = s.cost; fire = i; }
      }
      if (fire < 0) return null;
      let it = -1;
      for (const k of RAW_FOOD) { const t = itemNear(k, 2); if (t >= 0 && (it < 0 || bDist[t] < bDist[it])) it = t; }
      if (it < 0) return null;
      return { t: 'cook', item: it, fire, stage: 0, prog: 0, cost: bDist[it], res: [it, fire] };
    },
  };
  for (let p = 1; p <= 4; p++) {
    let best = null;
    for (const wt of WORK_TYPES) {
      if (c.prio[wt] !== p) continue;
      const j = scan[wt]();
      if (j && (!best || j.cost < best.cost)) best = j;
    }
    if (best) return best;
  }
  return null;
}

function hostilesNear(c, r) {
  for (const e of S.en) if (!e.flee && cheb(e.x, e.y, c.x, c.y) <= r) return true;
  return false;
}
function planFlee(c) {
  const start = idx(c.x, c.y);
  bfsFrom(start, 0, 14, null);
  let best = -1, bs = -1e9;
  for (let i = 0; i < N; i++) {
    if (bDist[i] < 0) continue;
    const x = ix(i), y = iy(i);
    let md = 1e9;
    for (const e of S.en) if (!e.flee) md = Math.min(md, manh(x, y, e.x, e.y));
    const score = Math.min(md, 18) * 2 - bDist[i] * 0.3;
    if (score > bs) { bs = score; best = i; }
  }
  return { t: 'flee', dest: best, path: best >= 0 ? pathTo(best) : [], until: S.tick + 16 };
}
function planEat(c) {
  bfsFrom(idx(c.x, c.y), 0, 0, null);
  let best = -1, bd = 1e9;
  for (let i = 0; i < N; i++) {
    const it = S.m.it[i];
    if (!it || !FOOD_VALUE[it.kind] || bDist[i] < 0) continue;
    const d = bDist[i] - (it.kind === 'meal' ? 25 : 0);   // strongly prefer meals
    if (d < bd) { bd = d; best = i; }
  }
  return best < 0 ? null : { t: 'eat', item: best, stage: 0, prog: 0, path: pathTo(best), res: [] };
}
function planSleep(c) {
  const b = c.bed >= 0 ? S.m.o[c.bed] : null;
  if (b && b.type === 'bed') {
    bfsFrom(idx(c.x, c.y), 0, 0, (i) => i === c.bed);
    const p = pathTo(c.bed);
    if (p) return { t: 'sleep', dest: c.bed, path: p, stage: 0, res: [] };
  }
  return { t: 'sleep', dest: idx(c.x, c.y), path: [], stage: 0, res: [] };
}
function planWander(c) {
  const opts = [];
  for (const [dx, dy] of DIR4) {
    const x = c.x + dx, y = c.y + dy;
    if (inB(x, y) && passable(idx(x, y), false)) opts.push(idx(x, y));
  }
  return { t: 'wander', until: S.tick + rnd(6, 12), step: opts.length && Math.random() < 0.6 ? pick(opts) : -1, res: [] };
}
function assignBeds() {
  const beds = [];
  for (let i = 0; i < N; i++) { const o = S.m.o[i]; if (o && o.type === 'bed') beds.push(i); }
  const owners = new Map();
  for (const c of S.col) {
    if (c.dead || c.bed < 0) { c.bed = -1; continue; }
    const o = S.m.o[c.bed];
    if (!o || o.type !== 'bed' || owners.has(c.bed)) c.bed = -1; else owners.set(c.bed, c.id);
  }
  for (const c of S.col) {
    if (c.dead || c.bed >= 0) continue;
    const free = beds.find(b => !owners.has(b));
    if (free === undefined) break;
    c.bed = free; owners.set(free, c.id);
  }
  for (const b of beds) S.m.o[b].owner = owners.has(b) ? owners.get(b) : -1;
}

function updateColonist(c) {
  if (c.atkCool > 0) c.atkCool--;
  // needs
  const drain = c.trait === 'ตะกละ' ? 1.6 : 1;
  c.food = Math.max(0, c.food - drain * (c.downed ? 0.4 : 1) / (DAY * 0.8));
  if (c.state === 'sleep') c.rest = Math.min(1, c.rest + (c.ground ? 0.75 : 1) / (DAY * 0.3));
  else c.rest = Math.max(0, c.rest - 1 / (DAY * 1.0));
  if (c.food <= 0 && S.tick % 60 === 0) {
    hurtColonist(c, 1, 'อดอาหาร', true);
    if (S.starveDay !== S.day) { S.starveDay = S.day; addLog(c.name + ' กำลังอดอาหาร!', 'bad', 'food'); }
  }
  if (c.dead) return;
  // healing
  if (c.hp < c.maxHp && c.food > 0) {
    const every = c.downed ? (S.en.some(e => !e.flee) ? 0 : 30) : (c.state === 'sleep' ? 40 : 120);
    if (every && S.tick % every === 0) c.hp = Math.min(c.maxHp, c.hp + 1);
  }
  if (c.downed) {
    c.state = 'downed'; c.job = null; c.carry = null;
    if (c.hp >= c.maxHp * 0.5) { c.downed = false; addLog(c.name + ' ฟื้นคืนสติแล้ว', 'good', 'pop'); }
    return;
  }
  if (moving(c)) return;
  // drafted: obey orders, shoot enemies in range
  if (c.drafted) {
    if (c.job && c.job.t === 'eat') { runJob(c); return; }
    if (c.food < 0.12 && !hostilesNear(c, 6) && countAllFood() > 0) { c.job = planEat(c); if (c.job) { runJob(c); return; } }
    runDrafted(c); return;
  }
  // flee from nearby hostiles
  if (hostilesNear(c, 8)) {
    if (c.carry) dropCarry(c);
    if (!c.job || c.job.t !== 'flee' || S.tick >= c.job.until || !c.job.path || !c.job.path.length) c.job = planFlee(c);
  } else if (c.job && c.job.t === 'flee' && !hostilesNear(c, 12)) c.job = null;

  if (!c.job || c.job.t === 'wander') {
    const night = isNight();
    if (c.food < (night ? 0.5 : 0.3) && countAllFood() > 0) c.job = planEat(c) || c.job;
    if ((!c.job || c.job.t === 'wander') && ((night && c.rest < 0.9) || c.rest < 0.15)) c.job = planSleep(c);
    if ((!c.job || c.job.t === 'wander') && S.tick >= c.nextPlan) {
      const j = findWork(c);
      if (j) {
        if (j.t === 'work') { bfsFrom(idx(c.x, c.y), 0, 0, (i) => i === j.stand); j.path = pathTo(j.stand); j.prog = 0; }
        else if (j.t === 'haul' || j.t === 'supply' || j.t === 'cook') j.path = pathTo(j.item);
        c.job = j;
      } else { c.nextPlan = S.tick + 8; if (!c.job) c.job = planWander(c); }
    }
    if (!c.job) c.job = planWander(c);
  }
  runJob(c);
}

function dropCarry(c) {
  if (!c.carry) return;
  placeItem(c.carry.kind, c.carry.n, idx(c.x, c.y));
  c.carry = null;
}
function endJob(c) {
  c.job = null;
  if (c.state !== 'sleep') c.state = 'idle';
}

function runJob(c) {
  const j = c.job;
  const m = S.m;
  switch (j.t) {
    case 'wander': {
      c.state = 'idle';
      c.lastProg = S.tick;
      if (j.step >= 0 && passable(j.step, false)) { stepTo(c, j.step, moveLen(c, j.step) + 1); c.state = 'walk'; j.step = -1; }
      if (S.tick >= j.until) c.job = null;
      return;
    }
    case 'flee': {
      if (j.path && j.path.length) {
        const n = j.path.shift();
        if (passable(n, false)) { stepTo(c, n, moveLen(c, n)); c.state = 'walk'; } else j.path = [];
      } else c.state = 'idle';
      c.lastProg = S.tick;
      return;
    }
    case 'sleep': {
      if (j.stage === 0) {
        const r = follow(c, j, j.dest);
        if (r === 'fail') { j.dest = idx(c.x, c.y); }
        if (r !== 'arrived' && r !== 'fail') return;
        j.stage = 1;
        c.ground = !(m.o[j.dest] && m.o[j.dest].type === 'bed' && idx(c.x, c.y) === j.dest);
      }
      c.state = 'sleep'; c.lastProg = S.tick;
      if (c.food < 0.08 && countAllFood() > 0) { c.state = 'idle'; c.job = planEat(c); return; }
      if (c.rest >= 1 || (!isNight() && c.rest >= 0.5)) {
        if (c.ground) { S.moraleMod -= 2; }
        c.state = 'idle'; c.job = null;
      }
      return;
    }
    case 'eat': {
      if (j.stage === 0) {
        const it = m.it[j.item];
        if (!it || !FOOD_VALUE[it.kind]) { endJob(c); return; }
        const r = follow(c, j, j.item);
        if (r === 'fail') { endJob(c); return; }
        if (r !== 'arrived') return;
        j.kind = it.kind; takeItem(j.item, 1); j.stage = 1;
        c.carry = { kind: j.kind, n: 1 };
      }
      c.state = 'eat'; c.lastProg = S.tick;
      if (++j.prog >= 8) {
        c.food = Math.min(1, c.food + FOOD_VALUE[j.kind]);
        c.carry = null;
        if (j.kind !== 'meal') S.moraleMod -= 0.3;
        endJob(c);
      }
      return;
    }
    case 'work': return runWork(c, j);
    case 'haul': {
      if (j.stage === 0) {
        if (!m.it[j.item] || m.z[j.item] === 2) { endJob(c); return; }
        const r = follow(c, j, j.item);
        if (r === 'fail') { endJob(c); return; }
        if (r !== 'arrived') return;
        const kind = m.it[j.item].kind;
        c.carry = { kind, n: takeItem(j.item, CARRY) };
        bfsFrom(idx(c.x, c.y), 0, 0, null);
        j.dest = stockpileCellFor(kind, reservedSet(c));
        if (j.dest < 0) { dropCarry(c); endJob(c); return; }
        j.path = pathTo(j.dest); j.res = [j.dest]; j.stage = 1;
      }
      if (!c.carry) { endJob(c); return; }
      const r = follow(c, j, j.dest);
      if (r === 'fail') { dropCarry(c); endJob(c); return; }
      if (r !== 'arrived') return;
      const it = m.it[j.dest];
      if (!it) { m.it[j.dest] = { kind: c.carry.kind, n: c.carry.n }; c.carry = null; }
      else if (it.kind === c.carry.kind) {
        const k = Math.min(c.carry.n, STACK_MAX - it.n); it.n += k; c.carry.n -= k;
        if (c.carry.n <= 0) c.carry = null;
      }
      if (c.carry) dropCarry(c);
      endJob(c);
      return;
    }
    case 'supply': {
      const b = m.bp[j.bp];
      if (j.stage === 0) {
        if (!b) { endJob(c); return; }
        const it = m.it[j.item];
        if (!it || it.kind !== j.kind) { endJob(c); return; }
        const r = follow(c, j, j.item);
        if (r === 'fail') { endJob(c); return; }
        if (r !== 'arrived') return;
        const need = bpRemaining(j.bp, j.kind);
        if (need <= 0) { endJob(c); return; }
        c.carry = { kind: j.kind, n: takeItem(j.item, Math.min(need, CARRY)) };
        j.amt = c.carry.n;
        const allowOn = !(BLOCKING[BUILD[b.type].obj] || BUILD[b.type].obj === 'door');
        bfsFrom(idx(c.x, c.y), 0, 0, null);
        const s = standFor(j.bp, allowOn) || standFor(j.bp, true);
        if (!s) { dropCarry(c); endJob(c); return; }
        j.stand = s.stand; j.path = pathTo(s.stand); j.res = []; j.stage = 1;
      }
      if (!c.carry) { endJob(c); return; }
      if (!b) { dropCarry(c); endJob(c); return; }
      const r = follow(c, j, j.stand);
      if (r === 'fail') { dropCarry(c); endJob(c); return; }
      if (r !== 'arrived') return;
      const give = Math.min(c.carry.n, bpRemaining(j.bp, j.kind));
      b.have[j.kind] = (b.have[j.kind] || 0) + give;
      c.carry.n -= give;
      if (c.carry.n > 0) dropCarry(c); else c.carry = null;
      c.lastProg = S.tick;
      endJob(c);
      return;
    }
    case 'cook': {
      if (j.stage === 0) {
        const it = m.it[j.item];
        if (!it || !FOOD_VALUE[it.kind] || it.kind === 'meal' || !m.o[j.fire] || m.o[j.fire].type !== 'campfire') { endJob(c); return; }
        const r = follow(c, j, j.item);
        if (r === 'fail') { endJob(c); return; }
        if (r !== 'arrived') return;
        let n = Math.min(it.n, 6); n -= n % 2;
        if (n < 2) { endJob(c); return; }
        c.carry = { kind: it.kind, n: takeItem(j.item, n) };
        bfsFrom(idx(c.x, c.y), 0, 0, null);
        const s = standFor(j.fire, false);
        if (!s) { dropCarry(c); endJob(c); return; }
        j.stand = s.stand; j.path = pathTo(s.stand); j.res = [j.fire]; j.stage = 1;
      }
      if (j.stage === 1) {
        if (!m.o[j.fire] || m.o[j.fire].type !== 'campfire') { dropCarry(c); endJob(c); return; }
        const r = follow(c, j, j.stand);
        if (r === 'fail') { dropCarry(c); endJob(c); return; }
        if (r !== 'arrived') return;
        j.stage = 2; j.prog = 0;
      }
      face(c, ix(j.fire));
      c.state = 'work'; c.lastProg = S.tick;
      j.prog += workSpeed(c);
      if (S.tick % 3 === 0) spawnPart('smoke', ix(j.fire) + 0.5, iy(j.fire) + 0.2, 1);
      const meals = (c.carry ? c.carry.n : 0) / 2;
      if (j.prog >= 10 * Math.max(1, meals)) {
        c.carry = null;
        placeItem('meal', meals, idx(c.x, c.y));
        floatText('+' + meals + ' อาหารปรุง', c.x, c.y, PAL.good);
        endJob(c);
      }
      return;
    }
  }
}

function runWork(c, j) {
  const m = S.m;
  const i = j.tgt;
  // validate target
  let valid = false;
  switch (j.kind) {
    case 'chop': valid = m.d[i] === 'chop' && m.o[i] && m.o[i].type === 'tree'; break;
    case 'mine': valid = m.d[i] === 'mine' && (m.mt[i] || (m.o[i] && m.o[i].type === 'rock')); break;
    case 'harvest': valid = m.d[i] === 'harvest' && m.o[i] && m.o[i].type === 'bush'; break;
    case 'harvestCrop': valid = !!(m.cr[i] && m.cr[i].g >= 1); break;
    case 'sow': valid = m.z[i] === 1 && !m.cr[i] && !m.o[i] && !m.it[i] && !m.bp[i]; break;
    case 'build': valid = !!(m.bp[i] && bpReady(m.bp[i])); break;
    case 'decon': valid = m.d[i] === 'deconstruct' && !!m.o[i]; break;
  }
  if (!valid) { endJob(c); return; }
  if (j.stage !== 1) {
    const r = follow(c, j, j.stand);
    if (r === 'fail') { endJob(c); c.nextPlan = S.tick + 4; return; }
    if (r !== 'arrived') return;
    j.stage = 1;
  }
  face(c, ix(i));
  c.state = 'work';
  c.lastProg = S.tick;
  j.prog += workSpeed(c);
  const x = ix(i), y = iy(i);
  const need = { chop: 24, mine: m.mt[i] ? 40 : 30, harvest: 8, harvestCrop: 10, sow: 8, decon: 15,
    build: m.bp[i] ? BUILD[m.bp[i].type].work : 1 }[j.kind];
  if (S.tick % 2 === 0) {
    if (j.kind === 'mine') spawnPart('chip', x + 0.5, y + 0.5, 2);
    else if (j.kind === 'chop') { spawnPart('chip', x + 0.5, y + 0.6, 1); spawnPart('leaf', x + 0.5, y, 1); }
    else if (j.kind === 'harvest' || j.kind === 'harvestCrop' || j.kind === 'sow') spawnPart('leaf', x + 0.5, y + 0.5, 1);
    else spawnPart('dust', x + 0.5, y + 0.8, 1);
  }
  if (j.prog < need) return;
  switch (j.kind) {
    case 'chop': m.o[i] = null; m.d[i] = null; placeItem('wood', 10, i); break;
    case 'mine':
      if (m.mt[i]) { m.mt[i] = 0; m.g[i] = 4; placeItem('stone', 6, i); }
      else { m.o[i] = null; placeItem('stone', 8, i); }
      m.d[i] = null; spawnPart('dust', x + 0.5, y + 0.6, 5);
      break;
    case 'harvest': m.o[i] = { type: 'bush_empty', v: m.o[i].v || 0, t: DAY * 2 }; m.d[i] = null; placeItem('berries', 5, i); break;
    case 'harvestCrop': m.cr[i] = null; placeItem('rice', 6, i); break;
    case 'sow': m.cr[i] = { kind: 'rice', g: 0 }; break;
    case 'decon': {
      const o = m.o[i];
      const key = o.type === 'wall' ? 'wall_' + o.mat : o.type === 'door' ? 'door_wood' : o.type;
      const b = BUILD[key];
      m.o[i] = null; m.d[i] = null;
      if (b) for (const k in b.cost) placeItem(k, Math.floor(b.cost[k] / 2), i);
      spawnPart('dust', x + 0.5, y + 0.6, 5);
      if (o.type === 'bed') assignBeds();
      break;
    }
    case 'build': {
      const b = m.bp[i];
      const def = BUILD[b.type];
      const o = { type: def.obj };
      if (def.mat) o.mat = def.mat;
      if (def.hp) o.hp = def.hp;
      if (def.obj === 'bed') { o.dir = 2; o.owner = -1; }
      if (def.obj === 'turret') o.cd = 0;
      if (def.obj === 'door') o.open = 0;
      m.bp[i] = null; m.o[i] = o; m.cr[i] = null;
      if (BLOCKING[def.obj]) {
        const it = m.it[i];
        if (it) { m.it[i] = null; placeItem(it.kind, it.n, i); }
        pushUnitsOff(i);
      }
      spawnPart('dust', x + 0.5, y + 0.7, 6);
      if (def.obj === 'bed') assignBeds();
      break;
    }
  }
  endJob(c);
}

function pushUnitsOff(i) {
  const x = ix(i), y = iy(i);
  for (const u of [...S.col, ...S.en]) {
    if (u.x !== x || u.y !== y || u.dead) continue;
    for (const [dx, dy] of DIR4) {
      const nx = x + dx, ny = y + dy;
      if (inB(nx, ny) && passable(idx(nx, ny), false)) { u.x = u.fx = nx; u.y = u.fy = ny; u.job = null; break; }
    }
  }
}

// ============================================================
// 10. Combat: drafted colonists, enemies, turrets, projectiles
// ============================================================
function nearestEnemyInRange(x, y, range) {
  let best = null, bd = 1e9;
  for (const e of S.en) {
    const d = Math.hypot(e.x - x, e.y - y);
    if (d <= range && d < bd && los(x, y, e.x, e.y)) { bd = d; best = e; }
  }
  return best;
}
function fire(fromX, fromY, tk, tid, toX, toY, dmg, hitChance) {
  const dist = Math.hypot(toX - fromX, toY - fromY);
  S.proj.push({ fx: fromX, fy: fromY, tx: toX, ty: toY, t0: S.tick, t1: S.tick + Math.max(1, Math.ceil(dist / 6)),
    tk, tid, dmg, hit: Math.random() < hitChance });
}
function runDrafted(c) {
  c.job = null;
  if (c.carry) dropCarry(c);
  let tgt = c.target ? S.en.find(e => e.id === c.target) : null;
  if (!tgt) c.target = null;
  const inRange = (e) => Math.hypot(e.x - c.x, e.y - c.y) <= 6 && los(c.x, c.y, e.x, e.y);
  const shootAt = tgt ? (inRange(tgt) ? tgt : null) : (c.moveTo < 0 ? nearestEnemyInRange(c.x, c.y, 6) : null);
  if (shootAt) {
    face(c, shootAt.x);
    c.state = 'shoot';
    c.lastProg = S.tick;
    c.moveTo = -1; c.mpath = null;
    if (c.atkCool <= 0) { fire(c.x, c.y, 'e', shootAt.id, shootAt.x, shootAt.y, c.trait === 'แข็งแรง' ? 5 : 4, 0.75); c.atkCool = 6; }
    return;
  }
  if (tgt && (c.moveTo < 0 || S.tick >= (c.chaseAt || 0))) {
    const g = bfsFrom(idx(c.x, c.y), 0, 0, (i) => cheb(ix(i), iy(i), tgt.x, tgt.y) <= 4 && los(ix(i), iy(i), tgt.x, tgt.y));
    c.moveTo = g; c.mpath = pathTo(g); c.chaseAt = S.tick + 8;
  }
  if (c.moveTo >= 0) {
    if (idx(c.x, c.y) === c.moveTo) { c.moveTo = -1; c.mpath = null; c.state = 'idle'; c.lastProg = S.tick; return; }
    if (!c.mpath || !c.mpath.length || !passable(c.mpath[0], false)) {
      bfsFrom(idx(c.x, c.y), 0, 0, (i) => i === c.moveTo);
      c.mpath = pathTo(c.moveTo);
      if (!c.mpath || !c.mpath.length) { c.moveTo = -1; c.state = 'idle'; return; }
    }
    const n = c.mpath.shift();
    stepTo(c, n, moveLen(c, n));
    c.state = 'walk';
    c.lastProg = S.tick;
    return;
  }
  c.state = 'idle';
  c.lastProg = S.tick;
}

function hurtColonist(c, dmg, cause, silent) {
  if (c.dead) return;
  c.hp -= dmg;
  if (!silent) { floatText('-' + dmg, c.x, c.y - 0.4, PAL.bad); spawnPart('blood', c.x + 0.5, c.y + 0.5, 3); }
  if (c.hp <= 0) {
    c.hp = 0; c.dead = true; c.downed = false; c.state = 'dead'; c.deadAt = S.tick; c.job = null; c.drafted = false;
    if (c.carry) dropCarry(c);
    S.moraleMod -= 15;
    addLog(c.name + ' เสียชีวิต (' + cause + ')', 'bad', 'alert');
    toast(c.name + ' เสียชีวิต');
    assignBeds();
  } else if (!c.downed && c.hp <= c.maxHp * 0.2) {
    c.downed = true; c.drafted = false; c.job = null;
    if (c.carry) dropCarry(c);
    addLog(c.name + ' หมดสติ (' + cause + ')', 'bad', 'alert');
  }
}

function spawnEnemy(kind, x, y) {
  const hp = kind === 'raider' ? 10 + Math.floor(S.day * 0.8) : 16 + Math.floor(S.day / 2);
  const e = { id: S.nextId++, kind, x, y, fx: x, fy: y, st: S.tick, sl: 1, dir: x < W / 2 ? 1 : -1,
    hp, maxHp: hp, atkCool: rnd(0, 6), flee: false, path: [], repathAt: 0, ghost: false, tgt: null,
    spawned: S.tick, state: 'walk' };
  S.en.push(e);
  return e;
}
function edgeCells() {
  const sides = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  for (const side of sides) {
    const out = [];
    const len = side < 2 ? W : H;
    for (let k = 0; k < len; k++) {
      const p = side === 0 ? [k, 0] : side === 1 ? [k, H - 1] : side === 2 ? [0, k] : [W - 1, k];
      if (passable(idx(p[0], p[1]), true)) out.push(p);
    }
    if (out.length >= 3) return out;
  }
  return [[0, 0]];
}
function hitEnemy(e, dmg) {
  e.hp -= dmg;
  floatText('-' + dmg, e.x, e.y - 0.4, PAL.warn);
  spawnPart('blood', e.x + 0.5, e.y + 0.5, 3);
  if (e.hp <= 0) {
    addLog(e.kind === 'boar' ? 'จัดการหมูป่าคลั่งได้แล้ว' : 'กำจัดโจรได้หนึ่งคน', 'good', e.kind === 'boar' ? 'boar' : 'raid');
    if (e.kind === 'raider' && ++S.raidKilled * 2 >= (S.raidSize || 1) && S.en.some(o => o.kind === 'raider' && o.hp > 0 && !o.flee)) {
      for (const o of S.en) if (o.kind === 'raider') o.flee = true;
      addLog('โจรเสียขวัญและกำลังหนี!', 'good', 'raid');
    }
    return;
  }
  if (e.hp < e.maxHp * 0.25 && (e.kind === 'boar' || Math.random() < 0.5)) e.flee = true;
}
function enemyTarget(e) {
  let best = null, bd = 1e9;
  for (const c of S.col) {
    if (c.dead || c.downed) continue;
    const d = manh(c.x, c.y, e.x, e.y);
    if (d < bd) { bd = d; best = { k: 'c', id: c.id, x: c.x, y: c.y }; }
  }
  if (!best && e.kind === 'raider') {
    for (let i = 0; i < N; i++) {
      const o = S.m.o[i];
      if (o && o.type === 'turret') { const d = manh(ix(i), iy(i), e.x, e.y); if (d < bd) { bd = d; best = { k: 's', id: i, x: ix(i), y: iy(i) }; } }
    }
  }
  if (!best) {
    for (const c of S.col) {
      if (c.dead) continue;
      const d = manh(c.x, c.y, e.x, e.y);
      if (d < bd) { bd = d; best = { k: 'c', id: c.id, x: c.x, y: c.y }; }
    }
  }
  return best;
}
function damageStructure(i, dmg) {
  const o = S.m.o[i];
  if (!o) return;
  o.hp = (o.hp || 30) - dmg;
  spawnPart('chip', ix(i) + 0.5, iy(i) + 0.5, 3);
  if (o.hp <= 0) {
    S.m.o[i] = null;
    spawnPart('dust', ix(i) + 0.5, iy(i) + 0.6, 6);
    addLog((o.type === 'turret' ? 'ป้อมปืน' : o.type === 'door' ? 'ประตู' : 'กำแพง') + 'ถูกทำลาย', 'bad', 'alert');
  }
}
function updateEnemy(e) {
  if (e.atkCool > 0) e.atkCool--;
  if (moving(e)) return;
  const raidTime = S.tick - e.spawned;
  if (!e.flee && e.kind === 'raider' && raidTime > DAY * 0.6) e.flee = true;
  const atEdge = e.x === 0 || e.y === 0 || e.x === W - 1 || e.y === H - 1;
  if (e.flee) {
    if (atEdge) { e.gone = true; return; }
    e.state = 'walk';
    if (!e.path.length || S.tick >= e.repathAt) {
      const goal = bfsFrom(idx(e.x, e.y), 1, 0, (i) => { const x = ix(i), y = iy(i); return x === 0 || y === 0 || x === W - 1 || y === H - 1; });
      e.path = pathTo(goal) || [];
      if (!e.path.length) { const g2 = bfsFrom(idx(e.x, e.y), 2, 0, (i) => { const x = ix(i), y = iy(i); return x === 0 || y === 0 || x === W - 1 || y === H - 1; }); e.path = pathTo(g2) || []; }
      e.repathAt = S.tick + 12;
    }
    if (e.path.length) { const n = e.path[0]; if (passable(n, true)) { e.path.shift(); stepTo(e, n, e.kind === 'boar' ? 2 : 3); } else { damageStructure(n, 4); e.atkCool = 8; } }
    return;
  }
  if (!e.tgt || S.tick % 8 === 0) e.tgt = enemyTarget(e);
  const t = e.tgt;
  if (!t) { e.flee = true; return; }
  // refresh target position
  if (t.k === 'c') { const c = S.col.find(c => c.id === t.id && !c.dead); if (!c) { e.tgt = null; return; } t.x = c.x; t.y = c.y; }
  else if (!S.m.o[t.id] || S.m.o[t.id].type !== 'turret') { e.tgt = null; return; }
  const d = Math.hypot(t.x - e.x, t.y - e.y);
  if (e.kind === 'raider' && d <= 5 && los(e.x, e.y, t.x, t.y)) {
    face(e, t.x); e.state = 'shoot';
    if (e.atkCool <= 0) { fire(e.x, e.y, t.k, t.id, t.x, t.y, 2 + Math.floor(S.day / 8), 0.5); e.atkCool = 9; }
    return;
  }
  if (e.kind === 'boar' && cheb(t.x, t.y, e.x, e.y) <= 1) {
    face(e, t.x); e.state = 'fight';
    if (e.atkCool <= 0) {
      const c = S.col.find(c => c.id === t.id);
      if (c) hurtColonist(c, 3, 'ถูกหมูป่าขวิด');
      e.atkCool = 6;
    }
    return;
  }
  // move toward target
  e.state = 'walk';
  if (!e.path.length || S.tick >= e.repathAt) {
    const goalFn = (i) => cheb(ix(i), iy(i), t.x, t.y) <= 1;
    let g = bfsFrom(idx(e.x, e.y), 1, 0, goalFn);
    e.ghost = false;
    if (g < 0) { g = bfsFrom(idx(e.x, e.y), 2, 0, goalFn); e.ghost = true; }
    e.path = pathTo(g) || [];
    e.repathAt = S.tick + 10;
  }
  if (e.path.length) {
    const n = e.path[0];
    if (passable(n, true)) { e.path.shift(); stepTo(e, n, e.kind === 'boar' ? 2 : 3); }
    else if (S.m.o[n] && !S.m.mt[n]) {
      face(e, ix(n)); e.state = 'fight';
      if (e.atkCool <= 0) { damageStructure(n, 4); e.atkCool = 8; }
    } else e.path = [];
  }
}
function updateTurrets() {
  if (!S.en.length) return;
  const m = S.m;
  for (let i = 0; i < N; i++) {
    const o = m.o[i];
    if (!o || o.type !== 'turret') continue;
    if (o.cd > 0) { o.cd--; continue; }
    const e = nearestEnemyInRange(ix(i), iy(i), 7);
    if (e) { fire(ix(i), iy(i) - 0.3, 'e', e.id, e.x, e.y, 4, 0.75); o.cd = 7; }
  }
}
function updateProjectiles() {
  for (const p of S.proj) {
    if (S.tick < p.t1) continue;
    p.done = true;
    if (!p.hit) continue;
    if (p.tk === 'e') { const e = S.en.find(e => e.id === p.tid); if (e && e.hp > 0) hitEnemy(e, p.dmg); }
    else if (p.tk === 'c') { const c = S.col.find(c => c.id === p.tid); if (c && !c.dead) hurtColonist(c, p.dmg, 'ถูกโจรยิง'); }
    else if (p.tk === 's') damageStructure(p.tid, p.dmg);
  }
  S.proj = S.proj.filter(p => !p.done);
}

// ============================================================
// 11. Storyteller
// ============================================================
const EVENTS = ['raid', 'boar', 'storm', 'gift', 'wanderer'];
function rollEvent() {
  const r = Math.random();
  if (r < 0.32) return 'raid';
  if (r < 0.47) return 'boar';
  if (r < 0.65) return 'storm';
  if (r < 0.82) return 'gift';
  return alive().length < 10 ? 'wanderer' : 'gift';
}
function colonyCenter() {
  for (let i = 0; i < N; i++) { const o = S.m.o[i]; if (o && o.type === 'campfire') return { x: ix(i), y: iy(i) }; }
  return S.start;
}
function fireEvent(kind) {
  switch (kind) {
    case 'raid': {
      const n = Math.min(8, 1 + Math.floor((S.day - 1) / 4) + (Math.random() < 0.4 ? 1 : 0));
      S.raidSize = n; S.raidKilled = 0;
      const edge = edgeCells();
      const s0 = rnd(0, Math.max(0, edge.length - n));
      for (let k = 0; k < n; k++) { const p = edge[(s0 + k) % edge.length]; spawnEnemy('raider', p[0], p[1]); }
      S.raid = true;
      letter('โจรบุก!', 'กลุ่มโจร ' + n + ' คนกำลังบุกเข้ามา! แตะชาวอาณานิคมแล้วกด "เกณฑ์" เพื่อสู้ ป้อมปืนจะยิงอัตโนมัติ', 'raid', 'bad');
      break;
    }
    case 'boar': {
      const p = pick(edgeCells());
      spawnEnemy('boar', p[0], p[1]);
      letter('หมูป่าคลั่ง!', 'หมูป่าคลั่งตัวหนึ่งกำลังพุ่งเข้าโจมตีชาวอาณานิคม เกณฑ์คนไปยิงมันซะ', 'boar', 'bad');
      break;
    }
    case 'storm': {
      S.weather = 'storm';
      S.weatherEnd = S.tick + Math.floor(DAY * 0.3);
      S.moraleMod -= 8;
      let hurt = 0;
      for (const cr of S.m.cr) if (cr && Math.random() < 0.4) { cr.g *= 0.6; hurt++; }
      letter('พายุเข้า', 'พายุฝนกระหน่ำ ขวัญกำลังใจลดลง' + (hurt ? ' และพืชผล ' + hurt + ' ช่องเสียหาย' : ''), 'storm', 'warn');
      break;
    }
    case 'gift': {
      const c = colonyCenter();
      const f = rnd(8, 14), w = rnd(25, 45), s = rnd(0, 20);
      const i = idx(clamp(c.x + rnd(-3, 3), 1, W - 2), clamp(c.y + rnd(2, 4), 1, H - 2));
      placeItem('meal', f, i); placeItem('wood', w, i); if (s) placeItem('stone', s, i);
      spawnPart('dust', ix(i) + 0.5, iy(i) + 0.5, 10);
      letter('ของขวัญจากพ่อค้า', 'พ่อค้าผ่านมาทิ้งเสบียงไว้ให้: อาหารปรุง ' + f + ', ไม้ ' + w + (s ? ', หิน ' + s : ''), 'gift', 'good');
      S.moraleMod += 6;
      break;
    }
    case 'wanderer': {
      const p = pick(edgeCells());
      const col = makeColonist(p[0], p[1], pick(TRAIT_LIST));
      S.col.push(col);
      assignBeds();
      letter('ผู้มาเยือน', col.name + ' (' + col.trait + ') เดินทางมาขอเข้าร่วมอาณานิคม', 'wanderer', 'good');
      S.moraleMod += 4;
      break;
    }
  }
}

// ============================================================
// 12. Simulation tick
// ============================================================
function updateWorld() {
  const m = S.m;
  const night = isNight();
  for (let i = 0; i < N; i++) {
    const o = m.o[i];
    if (o) {
      if (o.type === 'bush_empty') { if (--o.t <= 0) { m.o[i] = { type: 'bush', v: o.v || 0 }; } }
      else if (o.type === 'door') {
        const open = S.tick < (o.openUntil || 0) ? 1 : 0;
        o.open = open;
      }
    }
    const cr = m.cr[i];
    if (cr && cr.g < 1) cr.g = Math.min(1, cr.g + FERT[m.g[i]] * (night ? 0.4 : 1) / (DAY * 2.2));
  }
  if (S.tick % 90 === 0) {
    let trees = 0;
    for (const o of m.o) if (o && o.type === 'tree') trees++;
    if (trees < S.treeTarget * 0.85) {
      const i = rnd(0, N - 1);
      if (!m.mt[i] && !m.o[i] && !m.it[i] && !m.bp[i] && !m.z[i] && m.g[i] <= 1 && !unitAt(i)) m.o[i] = { type: 'tree', v: rnd(0, 3) };
    }
  }
}
function updateMorale() {
  const pop = Math.max(1, alive().length);
  const food = countAllFood();
  const foodTerm = food <= 0 ? -20 : food < pop ? -8 : food >= pop * 4 ? 8 : 0;
  const bedless = alive().filter(c => c.bed < 0).length;
  const bedTerm = bedless ? -4 * bedless : 6;
  const target = clamp(50 + foodTerm + bedTerm + S.moraleMod - (S.weather === 'storm' ? 5 : 0), 0, 100);
  S.morale = clamp(S.morale + clamp(target - S.morale, -0.25, 0.25), 0, 100);
  if (S.tick % 24 === 0 && S.moraleMod !== 0) S.moraleMod -= Math.sign(S.moraleMod) * Math.min(1, Math.abs(S.moraleMod));
  S.moraleMod = clamp(S.moraleMod, -60, 40);
}
function tick() {
  if (S.over) return;
  S.tick++;
  if (S.tick % DAY === 0) { S.day++; addLog('เริ่มวันที่ ' + S.day, 'info', 'day'); }
  if (S.tick % 30 === 0) assignBeds();
  updateWorld();
  if (S.tick >= S.nextEvent) {
    fireEvent(rollEvent());
    S.nextEvent = S.tick + rnd(Math.floor(DAY * 0.75), Math.floor(DAY * 1.3));
  }
  if (S.weather === 'storm' && S.tick >= S.weatherEnd) { S.weather = 'clear'; addLog('พายุสงบลงแล้ว', 'info', 'storm'); }
  for (const c of S.col) if (!c.dead) updateColonist(c);
  for (const e of S.en) if (e.hp > 0 && !e.gone) updateEnemy(e);
  updateTurrets();
  updateProjectiles();
  const fled = S.en.filter(e => e.gone).length;
  if (fled) addLog(fled > 1 ? 'ศัตรู ' + fled + ' ตัวหนีออกไปแล้ว' : 'ศัตรูหนีออกไปแล้ว', 'info', 'raid');
  const had = S.en.length;
  S.en = S.en.filter(e => e.hp > 0 && !e.gone);
  if (had && S.raid && !S.en.some(e => e.kind === 'raider')) {
    S.raid = false; S.moraleMod += 5;
    addLog('การบุกของโจรจบลงแล้ว', 'good', 'raid');
  }
  // raiders lose heart when half are gone
  S.col = S.col.filter(c => !c.dead || S.tick - c.deadAt < DAY / 2);
  updateMorale();
  if (!alive().length) gameOver();
}
function gameOver() {
  S.over = true;
  addLog('ชาวอาณานิคมทุกคนเสียชีวิต อาณานิคมล่มสลาย', 'bad', 'alert');
  clearSave();
  ui.dirty = true;
}

// ============================================================
// 13. Camera & rendering
// ============================================================
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const view = { w: 0, h: 0, dpr: 1, T: 32, artT: 0 };
const cam = { x: 0, y: 0, z: 32 };
let alpha = 0;

function fit() {
  const vv = window.visualViewport;
  view.w = Math.round((vv && vv.width) || window.innerWidth);
  view.h = Math.round((vv && vv.height) || window.innerHeight);
  view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.style.width = view.w + 'px';
  canvas.style.height = view.h + 'px';
  canvas.width = Math.round(view.w * view.dpr);
  canvas.height = Math.round(view.h * view.dpr);
  clampCam();
}
function tileSize() { return clamp(2 * Math.round(cam.z / 2), ZMIN, ZMAX); }
function clampCam() {
  cam.z = clamp(cam.z, ZMIN, ZMAX);
  const T = tileSize();
  const vw = view.w / T, vh = view.h / T, margin = 2;
  cam.x = W + 2 * margin <= vw ? (W - vw) / 2 : clamp(cam.x, -margin, W + margin - vw);
  cam.y = H + 2 * margin <= vh ? (H - vh) / 2 : clamp(cam.y, -margin, H + margin - vh);
}
function centerOn(x, y) {
  const T = tileSize();
  cam.x = x + 0.5 - view.w / T / 2;
  cam.y = y + 0.5 - view.h / T / 2;
  clampCam();
}
function zoomAt(sx, sy, z) {
  const T0 = tileSize();
  const wx = cam.x + sx / T0, wy = cam.y + sy / T0;
  cam.z = clamp(z, ZMIN, ZMAX);
  const T = tileSize();
  cam.x = wx - sx / T; cam.y = wy - sy / T;
  clampCam();
}
const screenToTile = (sx, sy) => { const T = tileSize(); return { fx: cam.x + sx / T, fy: cam.y + sy / T }; };

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

const rowBuckets = Array.from({ length: H + 1 }, () => []);
const tmpPos = { x: 0, y: 0 };
const tmpProj = { x: 0, y: 0, dx: 0, dy: 0 };
const tmpPart = { kind: '', x: 0, y: 0, life: 0, maxLife: 0 };
const bedOpts = { variant: 0, dir: 2 };
let maxOver = 1;

function render(now, dtSim) {
  const T = tileSize();
  if (T !== view.artT) { view.artT = T; art('init', T); }
  const d = view.dpr;
  ctx.setTransform(d, 0, 0, d, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = PAL.outline || '#1d140c';
  ctx.fillRect(0, 0, view.w, view.h);
  const ox = -cam.x * T, oy = -cam.y * T;
  const x0 = Math.max(0, Math.floor(cam.x)), x1 = Math.min(W - 1, Math.ceil(cam.x + view.w / T));
  const y0 = Math.max(0, Math.floor(cam.y)), y1 = Math.min(H - 1, Math.ceil(cam.y + view.h / T));
  const y1o = Math.min(H - 1, y1 + Math.ceil(maxOver) + 1);
  const m = S.m;
  const rt = S.tick + alpha;
  const px = (x) => Math.round(ox + x * T), py = (y) => Math.round(oy + y * T);

  // ground
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    if (!m.mt[i]) art('drawGround', ctx, GROUND[m.g[i]], px(x), py(y), T, m.gv[i]);
  }
  // zones, crops, items
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    const z = m.z[i];
    if (z) art('drawZone', ctx, z === 1 ? 'grow' : 'stockpile', px(x), py(y), T, maskOf(i, (n) => m.z[n] === z));
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    const cr = m.cr[i];
    if (cr) art('drawCrop', ctx, cr.kind, px(x), py(y), T, cr.g, now);
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    const it = m.it[i];
    if (it) art('drawItem', ctx, it.kind, px(x), py(y), T, it.n);
  }
  // units bucketed by row
  for (const b of rowBuckets) b.length = 0;
  for (const c of S.col) { lerpPos(c, rt, tmpPos); c._px = tmpPos.x; c._py = tmpPos.y; rowBuckets[clamp(Math.round(tmpPos.y), 0, H - 1)].push(c); }
  for (const e of S.en) { lerpPos(e, rt, tmpPos); e._px = tmpPos.x; e._py = tmpPos.y; rowBuckets[clamp(Math.round(tmpPos.y), 0, H - 1)].push(e); }
  // mountain / walls / objects / units, row by row
  for (let y = y0; y <= y1o; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (m.mt[i]) { art('drawMountain', ctx, px(x), py(y), T, maskOf(i, isMtn), m.gv[i]); continue; }
      const o = m.o[i];
      if (!o) continue;
      if (o.type === 'wall') art('drawWall', ctx, o.mat, px(x), py(y), T, maskOf(i, isWallish));
      else if (o.type === 'door') {
        o.vis = (o.vis || 0) + ((o.open || 0) - (o.vis || 0)) * 0.25;
        const vert = !!(isWallish(idx(x, y - 1 < 0 ? 0 : y - 1)) && y > 0) && !!(y < H - 1 && isWallish(idx(x, y + 1)));
        art('drawDoor', ctx, o.mat || 'wood', px(x), py(y), T, o.vis, vert);
      } else {
        bedOpts.variant = o.v || 0; bedOpts.dir = o.dir || 0;
        art('drawObject', ctx, o.type, px(x), py(y), T, now, bedOpts);
      }
    }
    const row = rowBuckets[y];
    if (row.length > 1) row.sort((a, b) => a._py - b._py);
    for (const u of row) {
      const ux = Math.round(ox + u._px * T), uy = Math.round(oy + u._py * T);
      if (ux < -T * 2 || uy < -T * 2 || ux > view.w + T || uy > view.h + T * 2) continue;
      if (u.kind) art('drawEnemy', ctx, u.kind, ux, uy, T, now, u.dir, u.state);
      else {
        const v = u._v || (u._v = { state: 'idle', dir: 1, look: 0, carrying: null, selected: false, drafted: false, name: '', trait: '', hp: 0, maxHp: 0 });
        v.state = u.dead ? 'dead' : u.downed ? 'downed' : u.state; v.dir = u.dir; v.look = u.look;
        v.carrying = u.carry ? u.carry.kind : null; v.selected = sel.kind === 'col' && sel.id === u.id;
        v.drafted = u.drafted; v.name = u.name; v.trait = u.trait; v.hp = u.hp; v.maxHp = u.maxHp;
        art('drawColonist', ctx, v, ux, uy, T, now);
      }
    }
  }
  // designations & blueprints
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * W + x;
    const b = m.bp[i];
    if (b) art('drawBlueprint', ctx, b.type, px(x), py(y), T, bpProgress(b), maskOf(i, isWallishBp));
    const dz = m.d[i];
    if (dz) art('drawDesignation', ctx, dz, px(x), py(y), T);
  }
  // projectiles
  for (const p of S.proj) {
    const k = clamp((rt - p.t0) / Math.max(1, p.t1 - p.t0), 0, 1);
    const wx = p.fx + (p.tx - p.fx) * k + 0.5, wy = p.fy + (p.ty - p.fy) * k + 0.4;
    const len = Math.hypot(p.tx - p.fx, p.ty - p.fy) || 1;
    tmpProj.x = ox + wx * T; tmpProj.y = oy + wy * T; tmpProj.dx = (p.tx - p.fx) / len; tmpProj.dy = (p.ty - p.fy) / len;
    art('drawProjectile', ctx, tmpProj);
  }
  // particles
  const dts = dtSim / 1000;
  ui.smokeAcc = (ui.smokeAcc || 0) + dtSim;
  if (ui.smokeAcc > 500) {
    ui.smokeAcc = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const o = m.o[y * W + x]; if (o && o.type === 'campfire') spawnPart('smoke', x + 0.5, y + 0.1, 1); }
  }
  let w = 0;
  for (let k = 0; k < FX.parts.length; k++) {
    const p = FX.parts[k];
    p.life -= dtSim; p.vy += p.g * dts; p.x += p.vx * dts; p.y += p.vy * dts;
    if (p.life > 0) FX.parts[w++] = p;
  }
  FX.parts.length = w;
  for (const p of FX.parts) {
    tmpPart.kind = p.kind; tmpPart.x = ox + p.x * T; tmpPart.y = oy + p.y * T; tmpPart.life = p.life; tmpPart.maxLife = p.maxLife;
    art('drawParticle', ctx, tmpPart);
  }
  // selection, drag rect, highlights
  drawOverlayMarks(T, ox, oy, now);
  // sky (screen space)
  ctx.setTransform(d, 0, 0, d, 0, 0);
  art('drawSky', ctx, view.w, view.h, phase(rt), S.weather, now);
  // text layer
  const fs = clamp(Math.round(T * 0.3), 10, 14);
  for (const c of S.col) {
    if (c.dead) continue;
    const ux = ox + c._px * T, uy = oy + c._py * T;
    if (ux < -T || ux > view.w + T || uy < -T || uy > view.h + T) continue;
    if (T >= 24) drawLabel(c.name, ux + T / 2, uy + T + fs * 0.4, c.drafted ? PAL.draft : (sel.kind === 'col' && sel.id === c.id ? PAL.select : PAL.text), fs);
    if (c.downed) drawLabel('หมดสติ', ux + T / 2, uy - fs * 0.6, PAL.bad, fs);
    if (c.hp < c.maxHp) drawBar(ux + T * 0.15, uy - 3, T * 0.7, c.hp / c.maxHp, c.hp / c.maxHp < 0.35 ? PAL.bad : PAL.good);
    if (c.job && c.job.t === 'work' && c.state === 'work') {
      const need = workNeed(c.job);
      if (need > 12) drawBar(ux + T * 0.15, uy + T + 1, T * 0.7, c.job.prog / need, PAL.gold);
    }
  }
  for (const e of S.en) {
    if (e.hp >= e.maxHp) continue;
    const ux = ox + e._px * T, uy = oy + e._py * T;
    drawBar(ux + T * 0.15, uy - 3, T * 0.7, e.hp / e.maxHp, PAL.hostile || PAL.bad);
  }
  for (const f of FX.floats) { f.life -= dtSim; f.y -= 0.8 * dts; }
  let wf = 0;
  for (const f of FX.floats) if (f.life > 0) FX.floats[wf++] = f;
  FX.floats.length = wf;
  for (const f of FX.floats) {
    ctx.globalAlpha = clamp(f.life / f.maxLife * 1.5, 0, 1);
    drawLabel(f.text, ox + f.x * T, oy + f.y * T, f.color, fs);
  }
  ctx.globalAlpha = 1;
}
function bpProgress(b) {
  const cost = BUILD[b.type].cost;
  let need = 0, have = 0;
  for (const k in cost) { need += cost[k]; have += Math.min(cost[k], b.have[k] || 0); }
  return clamp(0.5 * (have / need) + 0.5 * ((b.prog || 0) / BUILD[b.type].work), 0, 1);
}
function workNeed(j) {
  const m = S.m;
  return { chop: 24, mine: m.mt[j.tgt] ? 40 : 30, harvest: 8, harvestCrop: 10, sow: 8, decon: 15,
    build: m.bp[j.tgt] ? BUILD[m.bp[j.tgt].type].work : 1 }[j.kind] || 1;
}
function drawOverlayMarks(T, ox, oy, now) {
  // selection brackets
  if (sel.kind === 'col' || sel.kind === 'en') {
    const u = sel.kind === 'col' ? S.col.find(c => c.id === sel.id) : S.en.find(e => e.id === sel.id);
    if (u) {
      art('drawSelection', ctx, ox + u._px * T, oy + u._py * T, T, T);
      if (sel.kind === 'col') {
        if (u.drafted && u.moveTo >= 0) art('drawHighlight', ctx, ox + ix(u.moveTo) * T, oy + iy(u.moveTo) * T, T, 'move');
        const j = u.job;
        const ti = j ? (j.t === 'work' ? j.tgt : j.t === 'haul' || j.t === 'supply' || j.t === 'cook' || j.t === 'eat' ? (j.stage === 0 ? j.item : (j.dest >= 0 ? j.dest : j.stand)) : -1) : -1;
        if (ti >= 0 && ti !== undefined) art('drawHighlight', ctx, ox + ix(ti) * T, oy + iy(ti) * T, T, 'target');
        if (u.target) { const e = S.en.find(e => e.id === u.target); if (e) art('drawHighlight', ctx, ox + e._px * T, oy + e._py * T, T, 'target'); }
      }
    }
  } else if (sel.kind === 'tile') {
    art('drawSelection', ctx, ox + ix(sel.i) * T, oy + iy(sel.i) * T, T, T);
  }
  // tool drag rectangle / hover
  if (ui.tool) {
    let r = null;
    if (gest && gest.mode === 'rect' && gest.a && gest.b) r = rectOf(gest.a, gest.b);
    else if (ui.hover) r = { x0: ui.hover.x, y0: ui.hover.y, x1: ui.hover.x, y1: ui.hover.y };
    if (r) {
      const grp = toolGroup(ui.tool);
      if (grp === 'architect') {
        for (const i of buildTiles(ui.tool, r)) {
          art('drawHighlight', ctx, ox + ix(i) * T, oy + iy(i) * T, T, canPlace(ui.tool, i) ? 'build-ok' : 'build-bad');
        }
      }
      const kind = grp === 'zones' ? 'zone' : grp === 'architect' ? 'build' : ui.tool === 'cancel' ? 'cancel' : 'designate';
      art('drawDragRect', ctx, ox + r.x0 * T, oy + r.y0 * T, (r.x1 - r.x0 + 1) * T, (r.y1 - r.y0 + 1) * T, kind);
    }
  }
}

// ============================================================
// 14. Selection, tools, input
// ============================================================
const sel = { kind: null, id: 0, i: -1 };
const ui = { tool: null, tab: null, hover: null, dirty: true, toastTimer: 0, newConfirmUntil: 0, colKey: '', workKey: '', letterTimer: 0 };
let gest = null;
const pointers = new Map();

function toolGroup(t) { for (const g in TOOLS) if (TOOLS[g].includes(t)) return g; return null; }
function rectOf(a, b) { return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) }; }
function rectTiles(r) {
  const out = [];
  for (let y = Math.max(0, r.y0); y <= Math.min(H - 1, r.y1); y++) for (let x = Math.max(0, r.x0); x <= Math.min(W - 1, r.x1); x++) out.push(idx(x, y));
  return out;
}
function buildTiles(type, r) {
  if (!BUILD[type].drag) return inB(r.x0, r.y0) ? [idx(r.x0, r.y0)] : [];
  if (r.x1 - r.x0 >= 1 && r.y1 - r.y0 >= 1) {
    return rectTiles(r).filter(i => { const x = ix(i), y = iy(i); return x === r.x0 || x === r.x1 || y === r.y0 || y === r.y1; });
  }
  return rectTiles(r);
}
function canPlace(type, i) {
  const m = S.m;
  if (m.mt[i] || m.o[i] || m.bp[i]) return false;
  if (S.en.some(e => idx(e.x, e.y) === i)) return false;
  return true;
}
function applyTool(tool, r) {
  const m = S.m;
  const grp = toolGroup(tool);
  let n = 0;
  if (grp === 'architect') {
    for (const i of buildTiles(tool, r)) {
      if (!canPlace(tool, i)) continue;
      m.bp[i] = { type: tool, have: {}, prog: 0 };
      m.d[i] = null;
      n++;
    }
    if (!n) toast('วางตรงนี้ไม่ได้');
  } else {
    for (const i of rectTiles(r)) {
      const o = m.o[i];
      switch (tool) {
        case 'chop': if (o && o.type === 'tree') { m.d[i] = 'chop'; n++; } break;
        case 'mine': if (m.mt[i] || (o && o.type === 'rock')) { m.d[i] = 'mine'; n++; } break;
        case 'harvest': if (o && o.type === 'bush') { m.d[i] = 'harvest'; n++; } break;
        case 'deconstruct': if (o && PLAYER_BUILT[o.type]) { m.d[i] = 'deconstruct'; n++; } break;
        case 'cancel':
          if (m.d[i]) { m.d[i] = null; n++; }
          if (m.bp[i]) { const b = m.bp[i]; m.bp[i] = null; for (const k in b.have) placeItem(k, b.have[k], i); n++; }
          break;
        case 'zone_grow': if (!m.mt[i] && !(o && BLOCKING[o.type])) { m.z[i] = 1; n++; } break;
        case 'zone_stockpile': if (!m.mt[i] && !(o && BLOCKING[o.type])) { m.z[i] = 2; n++; } break;
        case 'zone_remove': if (m.z[i]) { m.z[i] = 0; n++; } break;
      }
    }
  }
  ui.dirty = true;
  return n;
}
function setTool(t) {
  if (t && INSTANT_TOOLS[t]) {
    for (const c of alive()) if (!c.downed) setDraft(c, t === 'draft');
    toast(t === 'draft' ? 'เกณฑ์ทุกคนแล้ว' : 'ปลดทุกคนแล้ว');
    return;
  }
  ui.tool = ui.tool === t ? null : t;
  ui.hover = null;
  if (ui.tool) { closeTabs(); sel.kind = null; toast(BUILD[t] && !BUILD[t].drag ? 'แตะช่องบนแผนที่เพื่อวาง' : 'ลากกรอบบนแผนที่ (สองนิ้วเพื่อเลื่อนกล้อง)'); }
  ui.dirty = true;
}
function setDraft(c, on) {
  if (c.dead || c.downed) return;
  c.drafted = on;
  c.moveTo = -1; c.mpath = null; c.target = null;
  if (on) { if (c.carry) dropCarry(c); c.job = null; c.state = 'idle'; }
  ui.dirty = true;
}
function unitNear(fx, fy) {
  let best = null, bd = 0.75;
  for (const c of S.col) {
    if (c.dead) continue;
    const d = Math.hypot((c._px ?? c.x) + 0.5 - fx, (c._py ?? c.y) + 0.5 - fy);
    if (d < bd) { bd = d; best = { kind: 'col', id: c.id }; }
  }
  for (const e of S.en) {
    const d = Math.hypot((e._px ?? e.x) + 0.5 - fx, (e._py ?? e.y) + 0.5 - fy);
    if (d < bd) { bd = d; best = { kind: 'en', id: e.id }; }
  }
  return best;
}
function onTap(sx, sy) {
  if (S.over) return;
  const { fx, fy } = screenToTile(sx, sy);
  const x = Math.floor(fx), y = Math.floor(fy);
  if (ui.tool) { if (inB(x, y)) applyTool(ui.tool, { x0: x, y0: y, x1: x, y1: y }); return; }
  const u = unitNear(fx, fy);
  const selCol = sel.kind === 'col' ? S.col.find(c => c.id === sel.id && !c.dead) : null;
  if (selCol && selCol.drafted && (!u || u.kind === 'en')) {
    if (u && u.kind === 'en') { selCol.target = u.id; selCol.moveTo = -1; toast('สั่งโจมตีเป้าหมาย'); return; }
    if (inB(x, y) && passable(idx(x, y), false)) { orderMove(selCol, idx(x, y)); return; }
  }
  if (u) { sel.kind = u.kind; sel.id = u.id; closeTabs(); ui.dirty = true; return; }
  if (inB(x, y)) {
    const i = idx(x, y), m = S.m;
    if (m.mt[i] || m.o[i] || m.it[i] || m.bp[i] || m.cr[i] || m.z[i]) { sel.kind = 'tile'; sel.i = i; closeTabs(); ui.dirty = true; return; }
  }
  sel.kind = null; ui.dirty = true;
}
function orderMove(c, i) {
  c.target = null; c.moveTo = i; c.mpath = null;
  spawnPart('dust', ix(i) + 0.5, iy(i) + 0.7, 3);
}

function localXY(ev) { const r = canvas.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; }
function tileOfScreen(p) { const t = screenToTile(p.x, p.y); return { x: clamp(Math.floor(t.fx), 0, W - 1), y: clamp(Math.floor(t.fy), 0, H - 1) }; }

canvas.style.touchAction = 'none';
canvas.addEventListener('pointerdown', ev => {
  ev.preventDefault();
  try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
  const p = localXY(ev);
  pointers.set(ev.pointerId, p);
  if (pointers.size === 1) {
    gest = { mode: 'pending', sx: p.x, sy: p.y, lx: p.x, ly: p.y, t0: performance.now(), mouse: ev.pointerType === 'mouse' };
    if (gest.mouse && ev.button !== 0) gest.mode = 'pan';
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    gest = { mode: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: cam.z, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
  }
}, { passive: false });
canvas.addEventListener('pointermove', ev => {
  const p = localXY(ev);
  if (!pointers.has(ev.pointerId)) {
    if (ev.pointerType === 'mouse' && ui.tool) { ui.hover = tileOfScreen(p); }
    return;
  }
  ev.preventDefault();
  pointers.set(ev.pointerId, p);
  if (!gest) return;
  if (gest.mode === 'pinch' && pointers.size >= 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    zoomAt(mx, my, gest.z0 * d / gest.d0);
    const T = tileSize();
    cam.x -= (mx - gest.mx) / T; cam.y -= (my - gest.my) / T;
    gest.mx = mx; gest.my = my;
    clampCam();
    return;
  }
  if (gest.mode === 'pending') {
    const moved = Math.hypot(p.x - gest.sx, p.y - gest.sy);
    if (moved > (gest.mouse ? 5 : 10)) {
      const dragTool = ui.tool && (toolGroup(ui.tool) !== 'architect' || BUILD[ui.tool].drag);
      gest.mode = dragTool ? 'rect' : 'pan';
      if (gest.mode === 'rect') gest.a = tileOfScreen({ x: gest.sx, y: gest.sy });
    }
  }
  if (gest.mode === 'pan') {
    const T = tileSize();
    cam.x -= (p.x - gest.lx) / T; cam.y -= (p.y - gest.ly) / T;
    clampCam();
  } else if (gest.mode === 'rect') gest.b = tileOfScreen(p);
  gest.lx = p.x; gest.ly = p.y;
}, { passive: false });
function endPointer(ev, cancelled) {
  if (!pointers.has(ev.pointerId)) return;
  const p = localXY(ev);
  pointers.delete(ev.pointerId);
  if (!gest) return;
  if (gest.mode === 'pinch') { gest = pointers.size ? { mode: 'done' } : null; return; }
  if (!cancelled) {
    if (gest.mode === 'pending') onTap(p.x, p.y);
    else if (gest.mode === 'rect' && gest.a) {
      gest.b = tileOfScreen(p);
      applyTool(ui.tool, rectOf(gest.a, gest.b));
    }
  }
  if (!pointers.size) gest = null;
  if (ev.pointerType !== 'mouse') ui.hover = null;
  ui.dirty = true;
}
canvas.addEventListener('pointerup', ev => endPointer(ev, false));
canvas.addEventListener('pointercancel', ev => endPointer(ev, true));
canvas.addEventListener('pointerleave', ev => { if (ev.pointerType === 'mouse') ui.hover = null; });
canvas.addEventListener('contextmenu', ev => ev.preventDefault());
canvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  const p = localXY(ev);
  zoomAt(p.x, p.y, cam.z * (ev.deltaY < 0 ? 1.15 : 1 / 1.15));
}, { passive: false });
document.addEventListener('gesturestart', ev => ev.preventDefault());
document.addEventListener('touchmove', ev => { if (ev.target === canvas) ev.preventDefault(); }, { passive: false });
window.addEventListener('keydown', ev => {
  const T = tileSize(), step = 3;
  switch (ev.key) {
    case 'Escape': ui.tool = null; sel.kind = null; closeTabs(); ui.dirty = true; break;
    case ' ': setSpeed(0); ev.preventDefault(); break;
    case '1': case '2': case '3': setSpeed(+ev.key); break;
    case 'ArrowLeft': case 'a': cam.x -= step; clampCam(); break;
    case 'ArrowRight': case 'd': cam.x += step; clampCam(); break;
    case 'ArrowUp': case 'w': cam.y -= step; clampCam(); break;
    case 'ArrowDown': case 's': cam.y += step; clampCam(); break;
  }
  void T;
});

// ============================================================
// 15. DOM UI
// ============================================================
const $ = (id) => document.getElementById(id);
const el = {
  resources: $('resources'), bar: $('colonist-bar'), clock: $('clock'), speed: $('speed'), alerts: $('alerts'),
  inspect: $('inspect'), iTitle: $('inspect-title'), iBody: $('inspect-body'), iActions: $('inspect-actions'),
  toast: $('toast'), tabs: $('tabs'), log: $('log'), work: $('work-table'), letter: $('letter-overlay'),
  lTitle: $('letter-title'), lBody: $('letter-body'), newBtn: $('btn-new'),
};
function setText(node, v) { v = String(v); if (node && node.textContent !== v) node.textContent = v; }
function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function mkImg(cls, url) { const i = mk('img', cls); i.alt = ''; setImg(i, url); return i; }

function toast(text) {
  if (!el.toast) return;
  el.toast.textContent = text;
  el.toast.classList.add('is-visible');
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(() => el.toast.classList.remove('is-visible'), 2400);
}
function showNextLetter() {
  if (!el.letter || el.letter.classList.contains('is-visible') || !letters.length) return;
  const l = letters.shift();
  setText(el.lTitle, l.title); setText(el.lBody, l.body);
  el.letter.classList.add('is-visible');
  clearTimeout(ui.letterTimer);
  ui.letterTimer = setTimeout(closeLetter, 12000);
}
function closeLetter() {
  el.letter.classList.remove('is-visible');
  clearTimeout(ui.letterTimer);
  setTimeout(showNextLetter, 150);
}

function buildToolPanels() {
  document.querySelectorAll('.panel-grid[data-group]').forEach(grid => {
    const g = grid.dataset.group;
    grid.textContent = '';
    for (const t of TOOLS[g]) {
      const b = mk('button', 'tool');
      b.dataset.tool = t;
      b.appendChild(mkImg('', icon(t)));
      b.appendChild(mk('span', 'tool-name', BUILD[t] ? BUILD[t].name : TOOL_NAME[t]));
      if (BUILD[t]) b.appendChild(mk('span', 'tool-cost', Object.keys(BUILD[t].cost).map(k => ITEM_LABEL[k] + ' ' + BUILD[t].cost[k]).join(' ')));
      grid.appendChild(b);
    }
  });
}
function openTab(t) {
  ui.tab = ui.tab === t ? null : t;
  if (ui.tab) { ui.tool = null; }
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('is-visible', p.dataset.tab === ui.tab));
  el.tabs.querySelectorAll('.tab').forEach(b => b.classList.toggle('is-active', b.dataset.tab === ui.tab));
  if (ui.tab === 'work') ui.workKey = '';
  logDirty = true;
  ui.dirty = true;
}
function closeTabs() { if (ui.tab) openTab(ui.tab); }
function setSpeed(s) {
  if (s === 0) {
    if (S.speed === 0) S.speed = S.lastSpeed || 1;
    else { S.lastSpeed = S.speed; S.speed = 0; }
  } else { S.speed = s; S.lastSpeed = s; }
  ui.dirty = true;
}

function renderResources() {
  const st = countStock();
  const rows = [
    ['meal', st.meal], ['rice', st.rice], ['berries', st.berries], ['wood', st.wood], ['stone', st.stone],
    ['morale', Math.round(S.morale) + '%'],
  ];
  if (el.resources.children.length !== rows.length) {
    el.resources.textContent = '';
    for (const [k] of rows) {
      const r = mk('div', 'res-row'); r.dataset.res = k;
      r.title = k === 'morale' ? 'ขวัญกำลังใจ' : ITEM_LABEL[k];
      r.appendChild(mkImg('res-icon', icon(k)));
      r.appendChild(mk('span', 'res-value', ''));
      el.resources.appendChild(r);
    }
  }
  rows.forEach(([k, v], n) => setText(el.resources.children[n].lastChild, v));
}
function renderColonistBar() {
  const list = alive();
  const key = list.map(c => c.id).join(',');
  if (key !== ui.colKey) {
    ui.colKey = key;
    el.bar.textContent = '';
    for (const c of list) {
      const card = mk('button', 'colonist-card');
      card.dataset.id = c.id;
      card.appendChild(mkImg('portrait', portrait(c.look)));
      const bm = mk('div', 'bar-mini'); bm.appendChild(mk('div', 'bar-fill')); card.appendChild(bm);
      card.appendChild(mk('span', 'name', c.name));
      el.bar.appendChild(card);
    }
  }
  for (const card of el.bar.children) {
    const c = S.col.find(c => c.id === +card.dataset.id);
    if (!c) continue;
    card.classList.toggle('is-selected', sel.kind === 'col' && sel.id === c.id);
    card.classList.toggle('is-drafted', !!c.drafted);
    card.classList.toggle('is-down', !!c.downed);
    const f = card.querySelector('.bar-fill');
    const w = Math.round(c.hp / c.maxHp * 100) + '%';
    if (f.style.width !== w) f.style.width = w;
  }
}
function renderClock() {
  const ph = phase(S.tick);
  const hour = (Math.floor(ph * 24) + 6) % 24;
  setText(el.clock, 'วันที่ ' + S.day + ' · ' + String(hour).padStart(2, '0') + ':00 · ' + SEASONS[Math.floor((S.day - 1) / 7) % 3] + (S.weather === 'storm' ? ' · พายุ' : ''));
  el.speed.querySelectorAll('.btn-speed').forEach(b => b.classList.toggle('is-active', +b.dataset.speed === S.speed));
}
function computeAlerts() {
  const out = [];
  const pop = alive();
  const raiders = S.en.filter(e => e.kind === 'raider').length, boars = S.en.filter(e => e.kind === 'boar').length;
  if (raiders) out.push({ kind: 'bad', icon: 'raid', text: 'โจรบุก (' + raiders + ')', focus: S.en.find(e => e.kind === 'raider') });
  if (boars) out.push({ kind: 'bad', icon: 'boar', text: 'หมูป่าคลั่ง', focus: S.en.find(e => e.kind === 'boar') });
  const down = pop.filter(c => c.downed);
  if (down.length) out.push({ kind: 'bad', icon: 'alert', text: 'หมดสติ: ' + down.map(c => c.name).join(', '), focus: down[0] });
  const food = countAllFood();
  if (food < pop.length * 2) out.push({ kind: food <= 0 ? 'bad' : 'warn', icon: 'food', text: food <= 0 ? 'ไม่มีอาหาร!' : 'อาหารเหลือน้อย' });
  const starving = pop.filter(c => c.food <= 0);
  if (starving.length) out.push({ kind: 'bad', icon: 'food', text: 'อดอาหาร: ' + starving.map(c => c.name).join(', '), focus: starving[0] });
  const bedless = pop.filter(c => c.bed < 0).length;
  if (bedless) out.push({ kind: 'warn', icon: 'bed', text: 'ไม่มีเตียง ' + bedless + ' คน' });
  if (!S.m.z.includes(2)) out.push({ kind: 'warn', icon: 'zone_stockpile', text: 'ยังไม่มีคลังเก็บ' });
  if (!S.m.z.includes(1) && S.day >= 2) out.push({ kind: 'info', icon: 'zone_grow', text: 'ควรสร้างพื้นที่ปลูก' });
  if (S.morale < 25) out.push({ kind: 'warn', icon: 'morale', text: 'ขวัญกำลังใจต่ำ' });
  return out.slice(0, 5);
}
function renderAlerts() {
  const list = computeAlerts();
  ui.alertList = list;
  const key = list.map(a => a.kind + a.text).join('|');
  if (key === ui.alertKey) return;
  ui.alertKey = key;
  el.alerts.textContent = '';
  list.forEach((a, n) => {
    const d = mk('button', 'alert');
    d.dataset.kind = a.kind; d.dataset.n = n;
    d.appendChild(mkImg('', icon(a.icon)));
    d.appendChild(mk('span', null, a.text));
    el.alerts.appendChild(d);
  });
}
function needRow(label, frac) {
  const r = mk('div', 'need-row');
  r.appendChild(mk('span', null, label));
  const b = mk('div', 'need-bar');
  const f = mk('div', 'need-fill');
  f.style.width = Math.round(clamp(frac, 0, 1) * 100) + '%';
  f.dataset.level = frac < 0.25 ? 'low' : frac < 0.6 ? 'mid' : 'high';
  b.appendChild(f); r.appendChild(b);
  return r;
}
function actBtn(text, ic, fn) {
  const b = mk('button', 'btn');
  if (ic) b.appendChild(mkImg('', icon(ic)));
  b.appendChild(mk('span', null, text));
  b.addEventListener('click', fn);
  return b;
}
function jobText(c) {
  if (c.dead) return 'เสียชีวิต';
  if (c.downed) return 'หมดสติ';
  if (c.drafted) return c.state === 'shoot' ? 'กำลังยิงศัตรู' : 'ถูกเกณฑ์ (รอคำสั่ง)';
  const j = c.job;
  if (!j) return 'ว่าง';
  switch (j.t) {
    case 'work': return { chop: 'ตัดต้นไม้', mine: 'ขุดหิน', harvest: 'เก็บเบอร์รี่', harvestCrop: 'เก็บเกี่ยวข้าว', sow: 'หว่านข้าว', decon: 'รื้อถอน', build: 'ก่อสร้าง' }[j.kind];
    case 'haul': return 'ขนของไปคลัง';
    case 'supply': return 'ขนวัสดุไปที่ก่อสร้าง';
    case 'cook': return 'ทำอาหาร';
    case 'eat': return 'กินอาหาร';
    case 'sleep': return c.ground ? 'นอนบนพื้น' : 'นอนหลับ';
    case 'flee': return 'หนีศัตรู!';
    default: return 'เดินเล่น';
  }
}
function inspectKey() {
  if (ui.tool) return 'tool:' + ui.tool;
  if (sel.kind === 'col') { const c = S.col.find(c => c.id === sel.id); return c ? ['c', c.id, c.hp, Math.round(c.food * 20), Math.round(c.rest * 20), jobText(c), c.drafted, c.bed, c.carry && c.carry.n].join(':') : 'x'; }
  if (sel.kind === 'en') { const e = S.en.find(e => e.id === sel.id); return e ? 'e:' + e.id + ':' + e.hp : 'x'; }
  if (sel.kind === 'tile') { const m = S.m, i = sel.i; return ['t', i, m.mt[i], JSON.stringify(m.o[i]), JSON.stringify(m.it[i]), JSON.stringify(m.bp[i]), m.cr[i] ? Math.round(m.cr[i].g * 100) : -1, m.z[i], m.d[i]].join(':'); }
  return '';
}
function renderInspect() {
  const key = inspectKey();
  if (key === ui.inspectKey) return;
  ui.inspectKey = key;
  const show = !!key && key !== 'x';
  if (key === 'x') sel.kind = null;
  el.inspect.classList.toggle('is-visible', show);
  if (!show) return;
  el.iBody.textContent = ''; el.iActions.textContent = '';
  const body = el.iBody, acts = el.iActions;
  const close = () => { sel.kind = null; ui.tool = null; ui.dirty = true; };
  if (ui.tool) {
    const t = ui.tool;
    setText(el.iTitle, 'เครื่องมือ: ' + (BUILD[t] ? BUILD[t].name : TOOL_NAME[t]));
    body.appendChild(mk('div', null, BUILD[t] && !BUILD[t].drag ? 'แตะช่องบนแผนที่เพื่อวาง' : 'ลากกรอบบนแผนที่ · ใช้สองนิ้วเพื่อเลื่อน/ซูม'));
    if (BUILD[t]) body.appendChild(mk('div', null, 'ราคา: ' + Object.keys(BUILD[t].cost).map(k => ITEM_LABEL[k] + ' ' + BUILD[t].cost[k]).join(', ')));
    acts.appendChild(actBtn('เลิกใช้', 'close', () => setTool(ui.tool)));
    return;
  }
  if (sel.kind === 'col') {
    const c = S.col.find(c => c.id === sel.id);
    setText(el.iTitle, c.name + ' · ' + c.trait);
    body.appendChild(mk('div', null, TRAITS[c.trait]));
    body.appendChild(needRow('สุขภาพ', c.hp / c.maxHp));
    body.appendChild(needRow('อาหาร', c.food));
    body.appendChild(needRow('พักผ่อน', c.rest));
    body.appendChild(mk('div', null, 'ตอนนี้: ' + jobText(c) + (c.carry ? ' · ถือ' + ITEM_LABEL[c.carry.kind] + ' ' + c.carry.n : '')));
    body.appendChild(mk('div', null, c.bed >= 0 ? 'มีเตียงของตัวเอง' : 'ยังไม่มีเตียง'));
    if (!c.dead && !c.downed) acts.appendChild(actBtn(c.drafted ? 'ปลดเกณฑ์' : 'เกณฑ์', c.drafted ? 'undraft' : 'draft', () => { setDraft(c, !c.drafted); }));
    acts.appendChild(actBtn('ปิด', 'close', close));
    return;
  }
  if (sel.kind === 'en') {
    const e = S.en.find(e => e.id === sel.id);
    setText(el.iTitle, e.kind === 'boar' ? 'หมูป่าคลั่ง' : 'โจร');
    body.appendChild(needRow('สุขภาพ', e.hp / e.maxHp));
    body.appendChild(mk('div', null, e.flee ? 'กำลังหนี' : 'ศัตรู — เกณฑ์คนไปสู้!'));
    acts.appendChild(actBtn('ปิด', 'close', close));
    return;
  }
  const m = S.m, i = sel.i, o = m.o[i];
  let title = 'พื้นดิน';
  if (m.mt[i]) title = 'ภูเขาหิน';
  else if (o) title = o.type === 'wall' ? (o.mat === 'stone' ? 'กำแพงหิน' : 'กำแพงไม้') : o.type === 'door' ? 'ประตูไม้' : OBJ_NAME[o.type] || o.type;
  else if (m.bp[i]) title = 'แบบก่อสร้าง: ' + BUILD[m.bp[i].type].name;
  else if (m.cr[i]) title = 'ต้นข้าว';
  else if (m.it[i]) title = ITEM_LABEL[m.it[i].kind] + ' x' + m.it[i].n;
  else if (m.z[i]) title = m.z[i] === 1 ? 'พื้นที่ปลูก' : 'คลังเก็บ';
  setText(el.iTitle, title);
  if (o && o.hp) body.appendChild(needRow('ความทนทาน', o.hp / ((BUILD[o.type === 'wall' ? 'wall_' + o.mat : o.type === 'door' ? 'door_wood' : o.type] || {}).hp || o.hp)));
  if (o && o.type === 'bed') { const ow = S.col.find(c => c.id === o.owner); body.appendChild(mk('div', null, 'เจ้าของ: ' + (ow ? ow.name : '-'))); }
  if (m.bp[i]) {
    const b = m.bp[i], cost = BUILD[b.type].cost;
    body.appendChild(mk('div', null, 'วัสดุ: ' + Object.keys(cost).map(k => ITEM_LABEL[k] + ' ' + (b.have[k] || 0) + '/' + cost[k]).join(', ')));
    body.appendChild(needRow('ความคืบหน้า', bpProgress(b)));
  }
  if (m.cr[i]) body.appendChild(needRow('การเติบโต', m.cr[i].g));
  if (m.it[i] && title !== ITEM_LABEL[m.it[i].kind] + ' x' + m.it[i].n) body.appendChild(mk('div', null, 'มี' + ITEM_LABEL[m.it[i].kind] + ' ' + m.it[i].n + ' วางอยู่'));
  if (m.z[i]) body.appendChild(mk('div', null, m.z[i] === 1 ? 'โซน: พื้นที่ปลูก (ข้าว)' : 'โซน: คลังเก็บ'));
  if (m.d[i]) body.appendChild(mk('div', null, 'คำสั่ง: ' + TOOL_NAME[m.d[i]]));
  const one = (tool) => () => { applyTool(tool, { x0: ix(i), y0: iy(i), x1: ix(i), y1: iy(i) }); ui.inspectKey = ''; };
  if (!m.d[i]) {
    if (o && o.type === 'tree') acts.appendChild(actBtn('ตัดไม้', 'chop', one('chop')));
    if (m.mt[i] || (o && o.type === 'rock')) acts.appendChild(actBtn('ขุด', 'mine', one('mine')));
    if (o && o.type === 'bush') acts.appendChild(actBtn('เก็บเกี่ยว', 'harvest', one('harvest')));
    if (o && PLAYER_BUILT[o.type]) acts.appendChild(actBtn('รื้อถอน', 'deconstruct', one('deconstruct')));
  }
  if (m.d[i] || m.bp[i]) acts.appendChild(actBtn('ยกเลิก', 'cancel', one('cancel')));
  acts.appendChild(actBtn('ปิด', 'close', close));
}
function renderWorkTable() {
  const list = alive();
  const key = list.map(c => c.id + ':' + WORK_TYPES.map(w => c.prio[w]).join('')).join('|');
  if (key === ui.workKey) return;
  ui.workKey = key;
  const t = el.work;
  t.textContent = '';
  const hr = mk('tr');
  hr.appendChild(mk('th', null, 'ชื่อ'));
  for (const w of WORK_TYPES) hr.appendChild(mk('th', null, WORK_LABEL[w]));
  t.appendChild(hr);
  for (const c of list) {
    const tr = mk('tr');
    tr.appendChild(mk('td', null, c.name));
    for (const w of WORK_TYPES) {
      const td = mk('td');
      const b = mk('button', 'prio', c.prio[w] ? String(c.prio[w]) : '');
      b.dataset.p = c.prio[w]; b.dataset.id = c.id; b.dataset.work = w;
      td.appendChild(b); tr.appendChild(td);
    }
    t.appendChild(tr);
  }
}
function renderLog() {
  if (!logDirty || ui.tab !== 'info') return;
  logDirty = false;
  el.log.textContent = '';
  setText($('info-title'), 'ข้อมูลอาณานิคม — วันที่ ' + S.day + ' · ประชากร ' + alive().length + ' · ขวัญ ' + Math.round(S.morale) + '%');
  for (const l of S.log) {
    const d = mk('div', 'log-item');
    d.dataset.kind = l.kind;
    if (l.icon) d.appendChild(mkImg('log-icon', icon(l.icon)));
    d.appendChild(mk('span', null, 'วัน ' + l.day + ' · ' + l.text));
    el.log.appendChild(d);
  }
}
function renderToolStates() {
  document.querySelectorAll('.tool[data-tool]').forEach(b => b.classList.toggle('is-active', b.dataset.tool === ui.tool));
}
function renderUI() {
  renderResources(); renderColonistBar(); renderClock(); renderAlerts(); renderInspect();
  if (ui.tab === 'work') renderWorkTable();
  renderLog(); renderToolStates();
  const nb = el.newBtn;
  setText(nb, performance.now() < ui.newConfirmUntil ? 'แตะอีกครั้งเพื่อยืนยัน' : 'เกมใหม่');
  if (S.over && !ui.overShown) {
    ui.overShown = true;
    letters.length = 0;
    el.letter.classList.remove('is-visible');
    letters.push({ title: 'อาณานิคมล่มสลาย', body: 'ชาวอาณานิคมทุกคนเสียชีวิต อยู่รอดได้ ' + S.day + ' วัน — กดปุ่มเพื่อเริ่มเกมใหม่', over: true });
    showNextLetter();
    setText($('letter-ok'), 'เริ่มเกมใหม่');
  }
}

// UI events
el.tabs.addEventListener('click', ev => { const b = ev.target.closest('.tab'); if (b) openTab(b.dataset.tab); });
document.querySelectorAll('.panel-grid[data-group]').forEach(g => g.addEventListener('click', ev => {
  const b = ev.target.closest('.tool'); if (b && !b.disabled) setTool(b.dataset.tool);
}));
el.speed.addEventListener('click', ev => { const b = ev.target.closest('.btn-speed'); if (b) setSpeed(+b.dataset.speed); });
el.bar.addEventListener('click', ev => {
  const b = ev.target.closest('.colonist-card'); if (!b) return;
  const c = S.col.find(c => c.id === +b.dataset.id); if (!c) return;
  if (sel.kind === 'col' && sel.id === c.id) centerOn(c.x, c.y);
  sel.kind = 'col'; sel.id = c.id; ui.tool = null; closeTabs(); ui.dirty = true;
});
el.bar.addEventListener('dblclick', ev => {
  const b = ev.target.closest('.colonist-card'); if (!b) return;
  const c = S.col.find(c => c.id === +b.dataset.id); if (c) setDraft(c, !c.drafted);
});
el.alerts.addEventListener('click', ev => {
  const b = ev.target.closest('.alert'); if (!b) return;
  const a = (ui.alertList || [])[+b.dataset.n];
  if (a && a.focus) { centerOn(a.focus.x, a.focus.y); if (a.focus.name) { sel.kind = 'col'; sel.id = a.focus.id; } else if (a.focus.kind) { sel.kind = 'en'; sel.id = a.focus.id; } }
  else if (a && a.icon === 'bed') { openTab('architect'); }
  else if (a && (a.icon === 'zone_stockpile' || a.icon === 'zone_grow')) openTab('zones');
  ui.dirty = true;
});
el.work.addEventListener('click', ev => {
  const b = ev.target.closest('.prio'); if (!b) return;
  const c = S.col.find(c => c.id === +b.dataset.id); if (!c) return;
  const w = b.dataset.work, p = c.prio[w];
  c.prio[w] = p === 0 ? 1 : p >= 4 ? 0 : p + 1;
  if (c.job && c.job.t !== 'sleep' && c.job.t !== 'eat' && c.job.t !== 'flee') { if (c.carry) dropCarry(c); c.job = null; }
  c.nextPlan = 0;
  ui.dirty = true;
});
$('letter-ok').addEventListener('click', () => {
  if (S.over) { restart(); return; }
  closeLetter();
});
$('btn-save').addEventListener('click', () => { saveGame(); toast('บันทึกเกมแล้ว'); });
// Fullscreen: explicit button in the menu, plus one automatic attempt on the first touch.
function goFullscreen(quiet) {
  const d = document, root = d.documentElement;
  if (d.fullscreenElement || d.webkitFullscreenElement) {
    try { (d.exitFullscreen || d.webkitExitFullscreen).call(d); } catch (e) { /* ignore */ }
    return;
  }
  const req = root.requestFullscreen || root.webkitRequestFullscreen;
  const fail = () => { if (!quiet) toast('เบราว์เซอร์นี้ไม่อนุญาตให้เต็มจอ'); };
  if (!req) { fail(); return; }
  try {
    const p = req.call(root, { navigationUI: 'hide' });
    const lock = () => { try { const o = screen.orientation; if (o && o.lock) o.lock('landscape').catch(() => {}); } catch (e) { /* ignore */ } };
    if (p && p.then) p.then(lock, fail); else lock();
  } catch (e) { fail(); }
}
$('btn-full').addEventListener('click', () => { goFullscreen(false); closeTabs(); });
let triedAutoFull = false;
canvas.addEventListener('pointerup', () => {
  if (triedAutoFull || matchMedia('(pointer: fine)').matches) return;
  triedAutoFull = true;
  goFullscreen(true);
});
const onFsChange = () => setTimeout(fit, 120);
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
$('btn-center').addEventListener('click', () => { const c = colonyCenter(); centerOn(c.x, c.y); closeTabs(); });
el.newBtn.addEventListener('click', () => {
  const now = performance.now();
  if (now < ui.newConfirmUntil) { ui.newConfirmUntil = 0; restart(); }
  else { ui.newConfirmUntil = now + 3000; toast('แตะ "เกมใหม่" อีกครั้งเพื่อยืนยัน'); }
  ui.dirty = true;
});

// ============================================================
// 16. Main loop & lifecycle
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
    while (acc >= tms && n < 8) { tick(); acc -= tms; n++; }
    if (n >= 8) acc = 0;
    alpha = clamp(acc / tms, 0, 1);
    dtSim = dt * S.speed;
  }
  S.cam = { x: cam.x, y: cam.y, z: cam.z };
  render(now, dtSim);
  if (now - lastUI > 150 || (ui.dirty && now - lastUI > 50)) { renderUI(); lastUI = now; ui.dirty = false; }
  if (now - lastSave > 10000) { saveGame(); lastSave = now; }
  requestAnimationFrame(frame);
}
function applyCamFromState() {
  if (S.cam && isFinite(S.cam.x)) { cam.x = S.cam.x; cam.y = S.cam.y; cam.z = S.cam.z || 32; clampCam(); }
  else { cam.z = view.h < 420 ? 28 : 32; centerOn(S.start.x, S.start.y); }
}
function restart() {
  clearSave();
  FX.parts.length = 0; FX.floats.length = 0; letters.length = 0;
  el.letter.classList.remove('is-visible');
  setText($('letter-ok'), 'รับทราบ');
  sel.kind = null; ui.tool = null; ui.colKey = ''; ui.workKey = ''; ui.inspectKey = null; ui.alertKey = null; ui.overShown = false;
  acc = 0; alpha = 0;
  closeTabs();
  newGameState();
  applyCamFromState();
  assignBeds();
  logDirty = true; ui.dirty = true;
  saveGame();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });
window.addEventListener('pagehide', saveGame);
let resizeTimer = 0;
const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fit, 60); };
window.addEventListener('resize', onResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);

// ============================================================
// 17. Debug / test hook
// ============================================================
window.__colony = {
  get state() { return S; },
  get cam() { return { x: cam.x, y: cam.y, z: cam.z, T: tileSize() }; },
  artErrors,
  ticks(n) { for (let k = 0; k < n && !S.over; k++) tick(); ui.dirty = true; },
  forceEvent(kind) { if (EVENTS.includes(kind)) fireEvent(kind); ui.dirty = true; },
  save: saveGame,
  reload() { const ok = loadGame(); if (ok) { applyCamFromState(); ui.colKey = ''; ui.workKey = ''; logDirty = true; ui.dirty = true; } return ok; },
  restart,
  designate(kind, x0, y0, x1, y1) { return applyTool(kind, rectOf({ x: x0, y: y0 }, { x: x1 ?? x0, y: y1 ?? y0 })); },
  zone(kind, x0, y0, x1, y1) { return applyTool('zone_' + kind, rectOf({ x: x0, y: y0 }, { x: x1 ?? x0, y: y1 ?? y0 })); },
  build(type, x0, y0, x1, y1) { return applyTool(type, rectOf({ x: x0, y: y0 }, { x: x1 ?? x0, y: y1 ?? y0 })); },
  draft(id, on) { const c = S.col.find(c => c.id === id); if (c) setDraft(c, on !== false); return !!c; },
  move(id, x, y) { const c = S.col.find(c => c.id === id); if (c && c.drafted) orderMove(c, idx(x, y)); },
  select(id) { sel.kind = 'col'; sel.id = id; ui.dirty = true; },
  centerOn,
  tileToClient(x, y) { const T = tileSize(), r = canvas.getBoundingClientRect(); return { x: r.left + (x + 0.5 - cam.x) * T, y: r.top + (y + 0.5 - cam.y) * T }; },
  clientToTile(cx, cy) { const r = canvas.getBoundingClientRect(), t = screenToTile(cx - r.left, cy - r.top); return { x: Math.floor(t.fx), y: Math.floor(t.fy) }; },
  // colonists that have not made progress for a while although they are free to act
  stuck(limit) {
    return S.col.filter(c => !c.dead && !c.downed && !c.drafted && S.tick - c.lastProg > (limit || 120)).map(c => c.name + ':' + (c.job ? c.job.t + '/' + (c.job.kind || '') : 'none'));
  },
  // colonists idling (wandering) although a job exists for them
  idleWithWork() {
    const out = [];
    for (const c of S.col) {
      if (c.dead || c.downed || c.drafted || (c.job && c.job.t !== 'wander')) continue;
      if (S.tick < c.nextPlan) continue;
      const j = findWork(c);
      if (j) out.push(c.name + ':' + j.t + '/' + (j.kind || ''));
    }
    return out;
  },
  findWork(id) { const c = S.col.find(c => c.id === id); return c ? findWork(c) : null; },
};

// ============================================================
// 18. Boot
// ============================================================
refreshPalette();
if (window.Art && window.Art.overflow) maxOver = Math.max(1, ...Object.values(window.Art.overflow).filter(v => typeof v === 'number'));
if (!loadGame()) newGameState();
fit();
applyCamFromState();
assignBeds();
document.querySelectorAll('img[data-icon]').forEach(img => setImg(img, icon(img.dataset.icon)));
buildToolPanels();
renderUI();
requestAnimationFrame(frame);
})();
