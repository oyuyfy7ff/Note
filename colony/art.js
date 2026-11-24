/* Mini Colony v2 — art.js (visual agent)
 * Procedural Canvas 2D art in a RimWorld-like painted style:
 * muted earthy palette, thick dark outlines, flat shading with a lit top face
 * and darker front face, soft drop shadows cast down-right (light from top-left).
 * Painters work in a 32-unit tile space and are scaled to any tile size.
 * Static sprites are cached per device-pixel "bucket" (size x current transform scale),
 * so zooming never thrashes the cache and sprites stay crisp at every zoom level.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- palette
  var C = {
    out: '#1d1813',
    leaf: '#566f36', leafHi: '#6d8644', leafLo: '#3f5428', pine: '#3f5a36', pineHi: '#527046',
    bark: '#5b4430', barkLo: '#43311f', barkHi: '#77593c',
    stoneTop: '#a29d90', stoneHi: '#b7b2a4', stoneFront: '#757064', stoneLo: '#5a564c',
    berry: '#b8413e', berryHi: '#e07a68',
    plank: '#8f6c44', plankLo: '#6e5233', plankHi: '#a8845a',
    cloth: '#d9cdb3', door: '#3a2a1c',
    flame: ['#fff1b8', '#ffc85a', '#f08a2e', '#c4481f'],
    hostile: '#d0503c',
    bpFill: 'rgba(70,140,235,0.30)', bpLine: 'rgba(160,210,255,0.95)', bpHatch: 'rgba(160,210,255,0.35)'
  };

  var PALETTE = {
    text: '#efe4cf', textShadow: 'rgba(14,10,6,0.9)', good: '#9cc26a', bad: '#e0644e',
    warn: '#e8b84a', gold: '#f0cb6a', night: '#1c2340', outline: C.out,
    panel: 'rgba(26,24,21,0.84)', muted: '#a8997f', hostile: C.hostile, select: '#f4efe2', draft: '#e8903a'
  };

  var LW = 1.6;     // outline width (32 units = 1 tile)
  var TAU = Math.PI * 2;
  var RAISE = 10;   // wall height in units (cap drawn this far above the tile)
  var MRAISE = 8;   // mountain height in units

  // tiles drawn above the tile top
  var OVER = {
    tree: 0.85, rock: 0.15, bush: 0.1, bush_empty: 0.05, campfire: 0.15, bed: 0.05, turret: 0.1, torch: 0.3,
    wall: RAISE / 32, door: RAISE / 32, mountain: MRAISE / 32, crop: 0.25, item: 0.05, unit: 0.15
  };

  // ---------------------------------------------------------------- helpers
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y) {
    var h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
  function frac(x) { return x - Math.floor(x); }
  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function getDpr() { return clamp(window.devicePixelRatio || 1, 1, 3); }
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    var r = Math.round(lerp(x[0], y[0], t)), g = Math.round(lerp(x[1], y[1], t)), bl = Math.round(lerp(x[2], y[2], t));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function dark(c, t) { return mix(c, '#1a140e', t); }

  function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU); }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.01, r), 0, TAU); }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function poly(g, pts) {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
  }
  function fill(g, c) { g.fillStyle = c; g.fill(); }
  function stroke(g, c, w) { g.strokeStyle = c || C.out; g.lineWidth = w || LW; g.stroke(); }
  function fs(g, f, w) { fill(g, f); stroke(g, C.out, w); }
  function lump(g, cx, cy, rx, ry, n, seed, jit) {
    var r = rng(seed), pts = [], i;
    for (i = 0; i < n; i++) {
      var a = i / n * TAU + 0.3, k = 1 - jit * r();
      pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
    }
    function mid(i) { var p = pts[i], q = pts[(i + 1) % n]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; }
    g.beginPath();
    var s = mid(n - 1); g.moveTo(s[0], s[1]);
    for (i = 0; i < n; i++) { var e = mid(i); g.quadraticCurveTo(pts[i][0], pts[i][1], e[0], e[1]); }
    g.closePath();
  }
  function limb(g, x1, y1, x2, y2, w, col) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.strokeStyle = C.out; g.lineWidth = w + LW * 2; g.stroke();
    g.strokeStyle = col; g.lineWidth = w; g.stroke();
  }
  function line(g, x1, y1, x2, y2, col, w) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokeStyle = col; g.lineWidth = w; g.stroke();
  }
  function shadowBlob(g, x, y, rx, ry, a) {
    g.save();
    g.fillStyle = 'rgba(18,14,8,' + ((a || 0.3) * 0.55) + ')';
    ell(g, x, y, rx + 1.2, ry + 0.9); g.fill();
    g.fillStyle = 'rgba(18,14,8,' + (a || 0.3) + ')';
    ell(g, x, y, rx, ry); g.fill();
    g.restore();
  }
  function tileSpace(ctx, px, py, size) {
    ctx.save(); ctx.translate(px, py); ctx.scale(size / 32, size / 32);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  }

  // ---------------------------------------------------------------- sprite cache
  // Bucket = device pixels per tile, quantized to steps of 2^(1/4), rounded up.
  var buckets = {}, bucketOrder = [];
  var scaleMemo = { ctx: null, a: 1, b: 0, s: 1 };
  function devScale(ctx) {
    if (ctx && ctx.getTransform) {
      var m = ctx.getTransform();
      if (scaleMemo.ctx === ctx && scaleMemo.a === m.a && scaleMemo.b === m.b) return scaleMemo.s;
      var s = Math.sqrt(m.a * m.a + m.b * m.b) || 1;
      scaleMemo = { ctx: ctx, a: m.a, b: m.b, s: s };
      return s;
    }
    return getDpr();
  }
  function bucketOf(devPx) {
    var b = Math.pow(2, Math.ceil(Math.log(Math.max(8, devPx)) / Math.LN2 * 4 - 1e-6) / 4);
    return Math.min(384, Math.round(b * 100) / 100);
  }
  function bucketCache(b) {
    var c = buckets[b];
    if (!c) {
      c = buckets[b] = {};
      bucketOrder.push(b);
      if (bucketOrder.length > 5) delete buckets[bucketOrder.shift()];
    } else if (bucketOrder[bucketOrder.length - 1] !== b) {
      bucketOrder.splice(bucketOrder.indexOf(b), 1); bucketOrder.push(b);
    }
    return c;
  }
  // spec: { over, padR, padB, padL } in tiles
  function renderSprite(bpx, spec, painter, a1, a2) {
    var over = spec.over || 0, padR = spec.padR || 0, padB = spec.padB || 0, padL = spec.padL || 0;
    var W = Math.ceil(bpx * (1 + padR + padL)), H = Math.ceil(bpx * (1 + over + padB));
    var c = mk(W, H), g = c.getContext('2d');
    g.scale(W / (32 * (1 + padR + padL)), H / (32 * (1 + over + padB)));
    g.translate(padL * 32, over * 32);
    g.lineJoin = 'round'; g.lineCap = 'round';
    painter(g, a1, a2);
    return c;
  }
  function drawSprite(ctx, key, px, py, size, spec, painter, a1, a2) {
    var b = bucketOf(size * devScale(ctx));
    var cache = bucketCache(b), c = cache[key];
    if (!c) c = cache[key] = renderSprite(b, spec, painter, a1, a2);
    var over = spec.over || 0, padL = spec.padL || 0;
    ctx.drawImage(c, px - padL * size, py - over * size, size * (1 + (spec.padR || 0) + padL), size * (1 + over + (spec.padB || 0)));
  }

  // ---------------------------------------------------------------- ground
  var GROUND = {
    grass: { base: ['#7b7c46', '#787a43', '#7e7e49', '#7a7944'], dk: 'rgba(80,78,40,0.16)', lt: 'rgba(150,140,80,0.12)',
      sp: ['rgba(60,62,30,0.22)', 'rgba(150,146,92,0.2)', 'rgba(110,90,60,0.22)'], tufts: 5, peb: 0 },
    soil: { base: ['#7c6646', '#79634a', '#806a49', '#776143'], dk: 'rgba(60,44,28,0.2)', lt: 'rgba(170,140,100,0.13)',
      sp: ['rgba(50,36,22,0.25)', 'rgba(170,146,110,0.2)', 'rgba(100,96,60,0.2)'], tufts: 1, peb: 2 },
    rich: { base: ['#4e3e2c', '#4b3b2a', '#52412e', '#4c3c2b'], dk: 'rgba(25,18,10,0.25)', lt: 'rgba(120,96,66,0.15)',
      sp: ['rgba(20,14,8,0.3)', 'rgba(120,100,70,0.22)', 'rgba(90,100,50,0.2)'], tufts: 1, peb: 0 },
    sand: { base: ['#bfa979', '#bca676', '#c3ad7e', '#bba574'], dk: 'rgba(140,110,60,0.18)', lt: 'rgba(240,225,180,0.16)',
      sp: ['rgba(140,110,70,0.25)', 'rgba(245,232,190,0.25)', 'rgba(160,140,100,0.2)'], tufts: 0, peb: 1, ripples: true },
    gravel: { base: ['#878174', '#847e71', '#8a8477', '#827c70'], dk: 'rgba(60,56,48,0.2)', lt: 'rgba(190,184,170,0.14)',
      sp: ['rgba(50,46,40,0.3)', 'rgba(200,194,180,0.25)', 'rgba(110,100,86,0.25)'], tufts: 0, peb: 9 }
  };
  function paintGround(g, kind, v) {
    var K = GROUND[kind] || GROUND.grass;
    var r = rng(9173 + v * 7919 + kind.length * 131), i;
    g.fillStyle = K.base[v]; g.fillRect(0, 0, 32, 32);
    for (i = 0; i < 5; i++) {
      g.fillStyle = r() < 0.5 ? K.dk : K.lt;
      lump(g, 6 + r() * 20, 6 + r() * 20, 4 + r() * 6, 3 + r() * 5, 7, (r() * 1e6) | 0, 0.35); g.fill();
    }
    for (i = 0; i < 70; i++) {
      var k = r();
      g.fillStyle = k < 0.45 ? K.sp[0] : k < 0.8 ? K.sp[1] : K.sp[2];
      g.fillRect(r() * 31, r() * 31, 0.9 + r() * 0.9, 0.9 + r() * 0.7);
    }
    if (K.ripples) {
      g.strokeStyle = 'rgba(150,120,70,0.28)'; g.lineWidth = 0.8;
      for (i = 0; i < 3; i++) {
        var y = 6 + i * 9 + r() * 3;
        g.beginPath(); g.moveTo(3 + r() * 4, y); g.quadraticCurveTo(16, y - 2.5, 27 + r() * 3, y + 0.5); g.stroke();
      }
    }
    var tufts = K.tufts + (kind === 'grass' && v === 2 ? 4 : 0);
    g.lineWidth = 0.9; g.lineCap = 'round';
    for (i = 0; i < tufts; i++) {
      var x = 3 + r() * 26, ty = 4 + r() * 25;
      g.strokeStyle = r() < 0.5 ? '#5c6234' : '#66693a';
      g.beginPath();
      g.moveTo(x, ty); g.lineTo(x - 1.2, ty - 2.6);
      g.moveTo(x + 0.4, ty); g.lineTo(x + 0.6, ty - 3.1);
      g.moveTo(x + 0.8, ty); g.lineTo(x + 2, ty - 2.3);
      g.stroke();
    }
    if (kind === 'grass' && v === 1) {
      for (i = 0; i < 3; i++) {
        var fx = 5 + r() * 22, fy = 5 + r() * 22;
        g.fillStyle = ['#d8cc9a', '#c9a24a', '#b9a3b8'][i % 3];
        g.fillRect(fx, fy, 1.4, 1.4);
        g.fillStyle = 'rgba(40,36,20,0.35)'; g.fillRect(fx + 0.6, fy + 1.4, 1, 0.6);
      }
    }
    var peb = K.peb + (kind === 'grass' && v === 3 ? 4 : 0) + (v === 3 ? 1 : 0);
    if (kind === 'grass' && v === 3) {
      g.fillStyle = 'rgba(112,92,62,0.4)';
      lump(g, 10 + r() * 12, 10 + r() * 12, 7, 5, 8, 4242, 0.35); g.fill();
    }
    for (i = 0; i < peb; i++) {
      var sx = 4 + r() * 24, sy = 4 + r() * 24, pr = kind === 'gravel' ? 0.8 + r() * 1.2 : 1;
      g.fillStyle = 'rgba(30,24,16,0.35)'; ell(g, sx + 0.4, sy + 0.5, pr * 1.1, pr * 0.7); g.fill();
      g.fillStyle = r() < 0.5 ? '#958e7e' : '#a8a292'; ell(g, sx, sy, pr, pr * 0.7); g.fill();
    }
  }

  // ---------------------------------------------------------------- mountain
  // edge path: straight on connected sides, jagged on exposed ones
  function jagEdge(g, x1, y1, x2, y2, exposed, r, inward) {
    if (exposed) {
      for (var i = 1; i < 4; i++) {
        var t = i / 4, j = (0.6 + r() * 2.2);
        g.lineTo(lerp(x1, x2, t) + inward[0] * j, lerp(y1, y2, t) + inward[1] * j);
      }
    }
    g.lineTo(x2, y2);
  }
  function paintMountain(g, mask, v) {
    var N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    var top = N ? -MRAISE : -MRAISE + 1.2, capB = S ? 32 : 32 - MRAISE - 5;
    var r = rng(5000 + mask * 37 + v * 1013);
    // shadows cast onto ground (outside the tile: right & below)
    g.fillStyle = 'rgba(18,14,8,0.32)';
    if (!S) g.fillRect(W ? 0 : 2.5, 32, 32 - (W ? 0 : 2.5) + (E ? 0 : 3.5), 3.5);
    if (!E) g.fillRect(32, N ? 0 : top + 4, 3.5, (S ? 32 : 35.5) - (N ? 0 : top + 4));
    // cap outline path
    var cut = 3;
    function capPath() {
      var rr2 = rng(7000 + mask * 13 + v * 71);
      var x0 = W ? -3 : 0.8, x1 = E ? 35 : 31.2, y0 = N ? top - 3 : top + 0.8, y1 = S ? 35 : capB;
      var tl = !N && !W ? cut : 0, tr = !N && !E ? cut : 0;
      g.beginPath();
      g.moveTo(x0, y0 + tl);
      if (tl) g.lineTo(x0 + tl, y0);
      jagEdge(g, x0 + tl, y0, x1 - tr, y0, !N, rr2, [0, 1]);
      if (tr) g.lineTo(x1, y0 + tr);
      jagEdge(g, x1, y0 + tr, x1, y1, !E, rr2, [-1, 0]);
      g.lineTo(x0, y1);
      jagEdge(g, x0, y1, x0, y0 + tl, !W, rr2, [1, 0]);
      g.closePath();
    }
    function tileClip() { g.beginPath(); g.rect(0, top, 32, (S ? 32 : capB) - top); g.clip(); }
    // front face
    if (!S) {
      g.save(); g.beginPath(); g.rect(0, capB - 3, 32, 36 - capB); g.clip();
      var fx0 = W ? -3 : 0.8, fx1 = E ? 35 : 31.2;
      g.beginPath(); g.moveTo(fx0, capB - 2); g.lineTo(fx1, capB - 2); g.lineTo(fx1, 31.2);
      var rf = rng(8000 + mask + v * 7);
      for (var i = 3; i >= 1; i--) g.lineTo(lerp(fx0, fx1, i / 4), 31.2 + (rf() - 0.3) * 1.2);
      g.lineTo(fx0, 31.2); g.closePath();
      fill(g, '#5e574c');
      g.save(); g.clip();
      g.fillStyle = 'rgba(255,240,220,0.16)'; g.fillRect(0, capB - 2, 32, 3);
      g.strokeStyle = 'rgba(25,20,14,0.5)'; g.lineWidth = 0.8;
      for (var k = 0; k < 5; k++) {
        var cx = 2 + r() * 28; g.beginPath(); g.moveTo(cx, capB); g.lineTo(cx + (r() - 0.5) * 3, capB + 4 + r() * 6); g.stroke();
      }
      g.strokeStyle = 'rgba(25,20,14,0.3)';
      g.beginPath(); g.moveTo(0, capB + 5 + r() * 2); g.lineTo(32, capB + 5 + r() * 2); g.stroke();
      g.fillStyle = 'rgba(15,10,6,0.25)'; g.fillRect(0, 28, 32, 4);
      g.restore();
      stroke(g);
      g.restore();
    }
    // cap (rock top)
    g.save(); tileClip();
    capPath(); fill(g, '#4c4842');
    g.save(); capPath(); g.clip();
    for (var j = 0; j < 6; j++) {
      g.fillStyle = r() < 0.5 ? 'rgba(20,18,14,0.25)' : 'rgba(150,144,128,0.16)';
      lump(g, r() * 32, top + r() * (capB - top), 4 + r() * 5, 3 + r() * 4, 7, (r() * 1e5) | 0, 0.3); g.fill();
    }
    for (j = 0; j < 40; j++) {
      g.fillStyle = r() < 0.5 ? 'rgba(30,26,20,0.3)' : 'rgba(210,204,190,0.2)';
      g.fillRect(r() * 32, top + r() * (capB - top), 0.9 + r(), 0.8);
    }
    g.strokeStyle = 'rgba(30,26,20,0.45)'; g.lineWidth = 0.8;
    for (j = 0; j < 2; j++) {
      if (r() < 0.6) continue;
      var sx = 4 + r() * 24, sy = top + 3 + r() * (capB - top - 6);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 2 + r() * 3, sy + 1 + r() * 2); g.lineTo(sx + 4 + r() * 3, sy - 1 + r() * 2); g.stroke();
    }
    // lit rims (top-left), darker right rim
    if (!N) { g.fillStyle = 'rgba(230,222,200,0.28)'; g.fillRect(0, top, 32, 3); }
    if (!W) { g.fillStyle = 'rgba(230,222,200,0.16)'; g.fillRect(0, top, 2.4, capB - top); }
    if (!E) { g.fillStyle = 'rgba(15,10,6,0.22)'; g.fillRect(29.4, top, 2.6, capB - top); }
    g.restore();
    // outline (connected sides lie outside the tile clip, so only exposed edges show)
    g.save(); capPath(); g.clip();
    g.strokeStyle = C.out; g.lineWidth = LW * 2;
    capPath(); g.stroke();
    g.restore();
    g.restore();
    if (!S) { g.strokeStyle = C.out; g.lineWidth = 1; g.beginPath(); g.moveTo(W ? 0 : 0.8, capB); g.lineTo(E ? 32 : 31.2, capB); g.stroke(); }
  }

  // ---------------------------------------------------------------- walls & doors
  var WALL = {
    wood: { cap: '#a07a50', capHi: '#b8936a', face: '#6e5233', line: '#56402a', faceLine: '#4e3a24' },
    stone: { cap: '#a8a294', capHi: '#beb8aa', face: '#6e695e', line: '#848072', faceLine: '#504c44' }
  };
  function paintWall(g, mat, mask) {
    var M = WALL[mat] || WALL.wood;
    var N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    var top = -RAISE, capB = S ? 32 : 32 - RAISE, x0 = W ? 0 : 0.8, x1 = E ? 32 : 31.2, y0 = N ? top : top + 0.8;
    // shadows (outside tile)
    g.fillStyle = 'rgba(18,14,8,0.32)';
    if (!S) g.fillRect(W ? 0 : 2.5, 32, 32 - (W ? 0 : 2.5) + (E ? 0 : 3.5), 3.5);
    if (!E) g.fillRect(32, N ? 0 : top + 4, 3.5, (S ? 32 : 35.5) - (N ? 0 : top + 4));
    // cap
    g.fillStyle = M.cap; g.fillRect(x0, y0, x1 - x0, capB - y0);
    g.save(); g.beginPath(); g.rect(x0, y0, x1 - x0, capB - y0); g.clip();
    var y, x, row;
    if (mat === 'stone') {
      g.strokeStyle = M.line; g.lineWidth = 0.8;
      for (y = -10, row = 0; y < 34; y += 8, row++) {
        line(g, 0, y, 32, y, M.line, 0.8);
        for (x = (row % 2) * 8 + 4; x < 32; x += 16) line(g, x, y, x, y + 8, M.line, 0.8);
      }
      g.fillStyle = 'rgba(255,250,235,0.08)';
      for (y = -10, row = 0; y < 34; y += 8, row++) g.fillRect(0, y + 0.8, 32, 1.4);
    } else {
      for (y = -10, row = 0; y < 34; y += 4, row++) {
        line(g, 0, y, 32, y, M.line, 0.7);
        x = (row * 11) % 24 + 4; line(g, x, y, x, y + 4, M.line, 0.7);
      }
      g.fillStyle = 'rgba(255,240,210,0.07)';
      for (y = -10; y < 34; y += 8) g.fillRect(0, y + 0.6, 32, 1.2);
    }
    if (!N) { g.fillStyle = M.capHi; g.fillRect(0, y0, 32, 1.8); }
    if (!W) { g.fillStyle = 'rgba(255,245,225,0.18)'; g.fillRect(x0, y0, 1.8, capB - y0); }
    if (!E) { g.fillStyle = 'rgba(15,10,6,0.2)'; g.fillRect(x1 - 2.2, y0, 2.2, capB - y0); }
    g.restore();
    // face
    if (!S) {
      g.fillStyle = M.face; g.fillRect(x0, capB, x1 - x0, 31.2 - capB);
      g.save(); g.beginPath(); g.rect(x0, capB, x1 - x0, 31.2 - capB); g.clip();
      if (mat === 'stone') {
        for (y = capB, row = 0; y < 32; y += 3.4, row++) {
          line(g, 0, y, 32, y, M.faceLine, 0.7);
          for (x = (row % 2) * 3 + 2; x < 32; x += 6) line(g, x, y, x, y + 3.4, M.faceLine, 0.7);
        }
      } else {
        for (x = 2; x < 32; x += 4) line(g, x, capB, x, 32, M.faceLine, 0.7);
        line(g, 0, capB + 4.5, 32, capB + 4.5, 'rgba(30,20,10,0.35)', 0.8);
      }
      g.fillStyle = 'rgba(15,10,6,0.25)'; g.fillRect(0, 28.5, 32, 4);
      g.fillStyle = 'rgba(15,10,6,0.25)'; g.fillRect(0, capB, 32, 1.2);
      g.restore();
    }
    // outlines on exposed edges
    g.strokeStyle = C.out; g.lineWidth = LW; g.beginPath();
    if (!N) { g.moveTo(x0, y0); g.lineTo(x1, y0); }
    if (!W) { g.moveTo(x0, y0); g.lineTo(x0, S ? 32 : 31.2); }
    if (!E) { g.moveTo(x1, y0); g.lineTo(x1, S ? 32 : 31.2); }
    if (!S) { g.moveTo(x0, 31.2); g.lineTo(x1, 31.2); }
    g.stroke();
    if (!S) line(g, x0, capB, x1, capB, C.out, 1);
  }

  function paintDoor(g, mat, open, vertical) {
    var M = WALL[mat] || WALL.wood, top = -RAISE, o = clamp(open || 0, 0, 1);
    if (!vertical) {
      // walls to E/W: posts at both sides, sliding leaves on the face
      g.fillStyle = 'rgba(18,14,8,0.3)'; g.fillRect(4, 32, 28, 3.2);
      // opening (dark floor + lintel)
      g.fillStyle = 'rgba(20,14,8,0.35)'; g.fillRect(4, top + 4, 24, 36 - RAISE);
      var lw = 12 * (1 - o);
      if (lw > 0.3) {
        g.beginPath(); g.rect(4, top + 4, lw, 31.2 - (top + 4)); fs(g, M.face, 1.2);
        g.beginPath(); g.rect(28 - lw, top + 4, lw, 31.2 - (top + 4)); fs(g, M.face, 1.2);
        g.save(); g.beginPath(); g.rect(4, top + 4, lw, 28); g.rect(28 - lw, top + 4, lw, 28); g.clip();
        for (var x = 6; x < 28; x += 3) line(g, x, top + 4, x, 32, M.faceLine, 0.6);
        g.fillStyle = 'rgba(255,240,210,0.12)'; g.fillRect(4, top + 4, 24, 2);
        g.restore();
        g.fillStyle = '#c9a25a'; g.fillRect(4 + lw - 2, 12, 1.2, 2.4); g.fillRect(28 - lw + 0.8, 12, 1.2, 2.4);
      }
      // lintel
      g.beginPath(); g.rect(2, top + 0.8, 28, 3.4); fs(g, M.cap, 1.2);
      // posts
      g.beginPath(); g.rect(0.8, top + 0.8, 4, 31.2 - top - 0.8); fs(g, M.cap, 1.2);
      g.beginPath(); g.rect(27.2, top + 0.8, 4, 31.2 - top - 0.8); fs(g, M.cap, 1.2);
      g.fillStyle = M.face; g.fillRect(1.6, 26, 2.6, 4.6); g.fillRect(28, 26, 2.6, 4.6);
      g.fillStyle = 'rgba(18,14,8,0.3)'; g.fillRect(31.2, top + 4, 3, 30);
    } else {
      // walls to N/S: door slab seen from above, leaves slide N/S
      g.fillStyle = 'rgba(18,14,8,0.28)'; g.fillRect(20.5, 0, 3, 32);
      g.fillStyle = 'rgba(20,14,8,0.22)'; g.fillRect(11, 0, 10, 32);
      var span = (28 - (top + 4)) / 2, L = span * (1 - o);
      function leaf(y1, y2) {
        if (y2 - y1 < 0.3) return;
        g.beginPath(); g.rect(11.5, y1, 9, y2 - y1); fs(g, M.cap, 1.2);
        g.save(); g.beginPath(); g.rect(11.5, y1, 9, y2 - y1); g.clip();
        for (var yy = Math.floor(y1 / 3) * 3; yy < y2; yy += 3) line(g, 11.5, yy, 20.5, yy, M.line, 0.6);
        g.fillStyle = 'rgba(255,245,225,0.18)'; g.fillRect(11.5, y1, 1.6, y2 - y1);
        g.restore();
        g.beginPath(); g.rect(11.5, Math.max(y1, y2 - 3), 9, Math.min(3, y2 - y1)); fs(g, M.face, 1);
      }
      leaf(top + 4, top + 4 + L);
      leaf(28 - L, 28);
      // end posts (connect to walls)
      g.beginPath(); g.rect(9.5, top + 0.8, 13, 4); fs(g, M.cap, 1.2);
      g.beginPath(); g.rect(9.5, 27.2, 13, 4); fs(g, M.face, 1.2);
    }
  }

  // ---------------------------------------------------------------- objects
  function paintTreeBase(g) {
    g.save();
    g.fillStyle = 'rgba(18,14,8,0.16)';
    lump(g, 20.5, 25.5, 11, 5.2, 9, 77, 0.2); g.fill();
    g.fillStyle = 'rgba(18,14,8,0.22)';
    lump(g, 20, 26, 8.5, 4, 9, 78, 0.2); g.fill();
    g.restore();
    g.beginPath();
    g.moveTo(13.6, 12); g.lineTo(18.4, 12);
    g.lineTo(18.8, 25.5); g.quadraticCurveTo(21, 28, 21.2, 28.2);
    g.lineTo(10.8, 28.2); g.quadraticCurveTo(13, 28, 13.2, 25.5);
    g.closePath(); fs(g, C.bark);
    g.fillStyle = C.barkHi; g.fillRect(14.4, 14, 1.4, 11);
    line(g, 17, 16, 17.2, 22, C.barkLo, 0.8);
  }
  function paintTreeCanopy(g, v) {
    if (v === 1) {
      var tiers = [[16, -23, 6, 2], [16, -13, 9.5, 5], [16, -2, 12, 13]];
      for (var i = 0; i < tiers.length; i++) {
        var t = tiers[i];
        g.beginPath();
        g.moveTo(t[0], t[1]);
        g.quadraticCurveTo(t[0] + t[2] * 0.6, t[3] - 6, t[0] + t[2], t[3] + 2);
        g.quadraticCurveTo(t[0], t[3] + 5, t[0] - t[2], t[3] + 2);
        g.quadraticCurveTo(t[0] - t[2] * 0.6, t[3] - 6, t[0], t[1]);
        g.closePath();
        fs(g, C.pine);
        g.save(); g.clip();
        g.fillStyle = C.pineHi;
        g.beginPath(); g.moveTo(t[0], t[1]); g.lineTo(t[0] - t[2], t[3] + 3); g.lineTo(t[0] - t[2] * 0.2, t[3] + 3); g.closePath(); g.fill();
        g.fillStyle = 'rgba(20,30,15,0.3)'; g.fillRect(t[0] - t[2], t[3] + 0.5, t[2] * 2, 4);
        g.restore();
      }
      return;
    }
    var blobs = [[16, -8, 11, 9, 1], [9, 0, 7.5, 6.5, 2], [23, 0, 7.5, 6.5, 3], [16, 3, 9, 6, 4], [12, -14, 6, 5, 5], [21, -13, 6, 5, 6]];
    var b, k;
    g.lineWidth = LW * 2; g.strokeStyle = C.out;
    for (k = 0; k < blobs.length; k++) { b = blobs[k]; lump(g, b[0], b[1], b[2], b[3], 9, b[4] * 31, 0.12); g.stroke(); }
    g.fillStyle = C.leaf;
    for (k = 0; k < blobs.length; k++) { b = blobs[k]; lump(g, b[0], b[1], b[2], b[3], 9, b[4] * 31, 0.12); g.fill(); }
    g.save();
    g.beginPath();
    for (k = 0; k < blobs.length; k++) { b = blobs[k]; g.moveTo(b[0] + b[2] * 0.95, b[1]); g.ellipse(b[0], b[1], b[2] * 0.95, b[3] * 0.95, 0, 0, TAU); }
    g.clip();
    g.fillStyle = C.leafLo; g.fillRect(0, 2, 32, 12);
    g.fillStyle = 'rgba(40,58,26,0.5)'; ell(g, 22, -3, 7, 6); g.fill();
    g.fillStyle = C.leafHi;
    ell(g, 12, -13, 5, 3.5); g.fill(); ell(g, 8, -2, 4, 3); g.fill(); ell(g, 16, -6, 4.5, 3); g.fill();
    g.fillStyle = 'rgba(200,200,130,0.25)';
    ell(g, 11, -15, 2.4, 1.5); g.fill(); ell(g, 7, -3, 2, 1.2); g.fill();
    g.restore();
  }

  function boulder(g, cx, by, w, top, front, seed) {
    g.fillStyle = 'rgba(18,14,8,0.3)';
    lump(g, cx + 2.6, by + 0.2, w * 0.55, 2.8, 8, seed + 5, 0.2); g.fill();
    lump(g, cx, by - front * 0.5 - top * 0.25, w * 0.5, front * 0.5 + top * 0.35, 9, seed, 0.18);
    fs(g, C.stoneFront);
    g.save(); g.clip();
    g.fillStyle = C.stoneTop;
    lump(g, cx - 0.6, by - front - top * 0.25, w * 0.47, top * 0.62, 8, seed + 1, 0.15); g.fill();
    g.fillStyle = C.stoneHi;
    ell(g, cx - w * 0.16, by - front - top * 0.45, w * 0.18, top * 0.22); g.fill();
    g.fillStyle = C.stoneLo; g.fillRect(cx - w, by - 2.2, w * 2, 3);
    g.restore();
    lump(g, cx, by - front * 0.5 - top * 0.25, w * 0.5, front * 0.5 + top * 0.35, 9, seed, 0.18);
    stroke(g);
    g.strokeStyle = 'rgba(30,26,20,0.55)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(cx + w * 0.12, by - front - top * 0.4); g.lineTo(cx + w * 0.02, by - front * 0.6); g.lineTo(cx + w * 0.14, by - front * 0.3); g.stroke();
  }
  function paintRock(g, v) {
    if (v === 1) {
      boulder(g, 11, 27.5, 14, 8, 8, 301);
      boulder(g, 22, 29, 13, 7, 7, 302);
      boulder(g, 17, 21, 11, 6, 6, 303);
    } else {
      boulder(g, 14.5, 28, 22, 12, 11, 101);
      boulder(g, 25.5, 29.5, 9, 5, 4, 102);
    }
  }

  function paintBush(g, empty) {
    g.fillStyle = 'rgba(18,14,8,0.28)';
    lump(g, 18.5, 27.5, 11, 3.6, 9, 55, 0.2); g.fill();
    var base = empty ? '#6b7038' : C.leaf, lo = empty ? '#535a2c' : C.leafLo, hi = empty ? '#7f8446' : C.leafHi;
    var rx = empty ? 10 : 11.5, ry = empty ? 7.5 : 9, cy = empty ? 21 : 19.5;
    lump(g, 16, cy, rx, ry, 10, empty ? 902 : 901, 0.16); fs(g, base);
    g.save(); g.clip();
    g.fillStyle = lo; g.fillRect(0, cy + ry * 0.35, 32, 12);
    g.fillStyle = hi; ell(g, 12, cy - ry * 0.45, rx * 0.45, ry * 0.3); g.fill(); ell(g, 20, cy - ry * 0.2, rx * 0.3, ry * 0.25); g.fill();
    g.restore();
    lump(g, 16, cy, rx, ry, 10, empty ? 902 : 901, 0.16); stroke(g);
    if (!empty) {
      var berries = [[10.5, 17], [15, 14.5], [20.5, 16.5], [13, 22], [19, 22.5], [23.5, 20.5], [8.5, 21.5]];
      for (var i = 0; i < berries.length; i++) {
        var b = berries[i];
        circ(g, b[0], b[1], 1.75); g.fillStyle = C.berry; g.fill(); g.strokeStyle = C.out; g.lineWidth = 0.9; g.stroke();
        g.fillStyle = C.berryHi; g.fillRect(b[0] - 0.9, b[1] - 0.9, 0.8, 0.8);
      }
    } else {
      g.strokeStyle = '#4a3a24'; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(11, 18); g.lineTo(9, 15.5); g.moveTo(21, 17.5); g.lineTo(23, 15); g.moveTo(16, 16); g.lineTo(16.5, 13.5); g.stroke();
    }
  }

  function paintCampfireBase(g) {
    g.fillStyle = 'rgba(18,14,8,0.3)'; ell(g, 18, 25.8, 11, 4); g.fill();
    ell(g, 16, 23, 9.5, 5); g.fillStyle = '#4a4036'; g.fill();
    ell(g, 16, 23, 6, 3.2); g.fillStyle = '#2e2620'; g.fill();
    limb(g, 9.5, 25.2, 21, 20.5, 2.6, C.bark);
    limb(g, 22.5, 25.2, 11, 20.5, 2.6, C.barkHi);
    g.fillStyle = '#c89a5a'; circ(g, 22.5, 25.2, 1.1); g.fill();
    var n = 11;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU;
      var x = 16 + Math.cos(a) * 10, y = 23 + Math.sin(a) * 5.4;
      lump(g, x, y, 2.2, 1.7, 6, 700 + i, 0.2);
      fs(g, Math.sin(a) > 0 ? C.stoneFront : C.stoneTop, 1.1);
      g.fillStyle = 'rgba(255,245,220,0.25)'; g.fillRect(x - 1, y - 1.2, 1.2, 0.7);
    }
  }
  function flame(g, x, y, w, h, col, sway) {
    g.beginPath();
    g.moveTo(x - w, y);
    g.quadraticCurveTo(x - w, y - h * 0.55, x + sway, y - h);
    g.quadraticCurveTo(x + w, y - h * 0.5, x + w, y);
    g.quadraticCurveTo(x, y + w * 0.6, x - w, y);
    g.closePath(); g.fillStyle = col; g.fill();
  }
  function glow(g, x, y, r, a) {
    var gr = g.createRadialGradient(x, y, 1, x, y, r);
    gr.addColorStop(0, 'rgba(255,170,70,' + a + ')'); gr.addColorStop(1, 'rgba(255,140,50,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function drawFlames(g, t, x, y, k) {
    var f1 = Math.sin(t / 90) * 0.8 + Math.sin(t / 37) * 0.4, f2 = Math.sin(t / 70 + 2) * 0.7;
    k = k || 1;
    flame(g, x, y, 5.2 * k, (13 + f1) * k, C.flame[3], f2 * k);
    g.strokeStyle = C.out; g.lineWidth = 1.2; g.stroke();
    flame(g, x, y, 4 * k, (10.5 + f2) * k, C.flame[2], f1 * 0.8 * k);
    flame(g, x + 0.4 * k, y, 2.6 * k, (7.5 + f1 * 0.6) * k, C.flame[1], -f2 * 0.5 * k);
    flame(g, x + 0.2 * k, y, 1.3 * k, 4.2 * k, C.flame[0], 0);
  }
  function drawCampfireLive(g, t) {
    glow(g, 16, 18, 15, 0.35);
    drawFlames(g, t, 16, 23, 1);
    for (var i = 0; i < 3; i++) {
      var k = ((t / 900 + i / 3) % 1);
      g.fillStyle = 'rgba(255,200,90,' + (1 - k).toFixed(2) + ')';
      g.fillRect(16 + Math.sin(i * 2.1 + t / 300) * 3, 16 - k * 14, 0.9, 0.9);
    }
  }

  function paintBed(g, dir) {
    var d = ((dir | 0) % 4 + 4) % 4, vert = d === 0 || d === 2;
    var x, y, w, h;
    if (vert) { x = 6; y = 1; w = 20; h = 27; } else { x = 1; y = 6; w = 30; h = 19; }
    // shadow
    g.fillStyle = 'rgba(18,14,8,0.3)'; rr(g, x + 2.5, y + 3, w, h + 3, 2); g.fill();
    // frame face (thickness)
    rr(g, x, y + h - 1, w, 4.2, 1.2); fs(g, C.plankLo);
    // frame top
    rr(g, x, y, w, h, 2); fs(g, C.plank);
    // mattress
    var mx = x + 2, my = y + 2, mw = w - 4, mh = h - 4;
    rr(g, mx, my, mw, mh, 1.6); fs(g, C.cloth, 1.1);
    // pillow & blanket
    var px, py, pw, ph, bx, by, bw, bh;
    if (d === 0) { px = mx + 2; py = my + 1.5; pw = mw - 4; ph = 5; bx = mx; by = my + 9; bw = mw; bh = mh - 9; }
    else if (d === 2) { px = mx + 2; py = my + mh - 6.5; pw = mw - 4; ph = 5; bx = mx; by = my; bw = mw; bh = mh - 9; }
    else if (d === 1) { px = mx + mw - 6.5; py = my + 2; pw = 5; ph = mh - 4; bx = mx; by = my; bw = mw - 9; bh = mh; }
    else { px = mx + 1.5; py = my + 2; pw = 5; ph = mh - 4; bx = mx + 9; by = my; bw = mw - 9; bh = mh; }
    rr(g, px, py, pw, ph, 2); fs(g, '#efe6d2', 1);
    rr(g, bx, by, bw, bh, 1.6); fs(g, '#5a7890', 1.1);
    g.save(); rr(g, bx, by, bw, bh, 1.6); g.clip();
    g.fillStyle = 'rgba(255,250,235,0.25)';
    if (vert) g.fillRect(bx, d === 0 ? by : by + bh - 2.4, bw, 2.4); else g.fillRect(d === 1 ? bx + bw - 2.4 : bx, by, 2.4, bh);
    g.fillStyle = 'rgba(15,20,30,0.25)'; g.fillRect(bx, by + bh - 2.5, bw, 2.5);
    g.restore();
    // headboard
    if (d === 0) { rr(g, x - 0.5, y - 1.5, w + 1, 3.5, 1); fs(g, C.plankHi); }
    if (d === 2) { rr(g, x - 0.5, y + h - 2, w + 1, 3.5, 1); fs(g, C.plankHi); }
    if (d === 1) { rr(g, x + w - 2, y - 0.5, 3.5, h + 1, 1); fs(g, C.plankHi); }
    if (d === 3) { rr(g, x - 1.5, y - 0.5, 3.5, h + 1, 1); fs(g, C.plankHi); }
  }

  function paintTurretBase(g) {
    g.fillStyle = 'rgba(18,14,8,0.32)'; rr(g, 8, 18, 23, 13, 2); g.fill();
    rr(g, 5, 24, 22, 5.5, 1.2); fs(g, '#55524a');
    rr(g, 5, 15, 22, 11, 1.6); fs(g, '#8a867a');
    g.fillStyle = 'rgba(255,250,235,0.18)'; g.fillRect(6, 16, 20, 1.6);
    g.fillStyle = '#3e3c36';
    [[7.5, 17.5], [24.5, 17.5], [7.5, 23.5], [24.5, 23.5]].forEach(function (p) { circ(g, p[0], p[1], 0.9); g.fill(); });
    rr(g, 13, 10, 6, 10, 1); fs(g, '#4a4740');
  }
  function drawTurretHead(g, ang) {
    g.save(); g.translate(16, 10);
    g.fillStyle = 'rgba(18,14,8,0.25)'; ell(g, 2.5, 3.5, 7, 4); g.fill();
    g.rotate(ang);
    limb(g, 2, 0, 13, 0, 2.4, '#3a3a36');
    g.fillStyle = '#2a2a26'; g.fillRect(11.5, -1.8, 2.5, 3.6);
    rr(g, -6, -5, 11, 10, 3); fs(g, '#7a8664');
    g.fillStyle = 'rgba(255,250,220,0.22)'; g.fillRect(-4.5, -4, 8, 2);
    g.fillStyle = '#c84a32'; circ(g, -1.5, 0, 1.1); g.fill();
    g.restore();
  }

  function paintTorchBase(g) {
    g.fillStyle = 'rgba(18,14,8,0.3)'; ell(g, 19, 29.5, 4.5, 1.6); g.fill();
    g.beginPath(); g.moveTo(16, 29.5); g.lineTo(21, 27); g.strokeStyle = 'rgba(18,14,8,0.25)'; g.lineWidth = 2; g.stroke();
    lump(g, 16, 29, 4, 2, 6, 31, 0.2); fs(g, C.stoneFront, 1.1);
    limb(g, 16, 29, 16, 5, 2.2, C.bark);
    poly(g, [12.5, 3, 19.5, 3, 18, 7, 14, 7]); fs(g, '#5a5650', 1.1);
  }
  function drawTorchLive(g, t) {
    glow(g, 16, -1, 16, 0.32);
    drawFlames(g, t * 1.3 + 400, 16, 3.5, 0.55);
  }

  // ---------------------------------------------------------------- crops
  function paintCrop(g, kind, stage) {
    var s = stage / 4;
    if (kind === 'berry') {
      var rx = 3 + stage * 2.1, ry = 2.6 + stage * 1.7, cy = 27 - ry;
      g.fillStyle = 'rgba(18,14,8,0.28)'; ell(g, 18, 28.5, rx + 1.5, 2); g.fill();
      if (stage === 0) {
        limb(g, 16, 28, 16, 24, 0.8, '#6d8644');
        ell(g, 14.5, 24, 1.8, 1); fs(g, C.leafHi, 0.9); ell(g, 17.5, 23.5, 1.8, 1); fs(g, C.leafHi, 0.9);
        return;
      }
      lump(g, 16, cy, rx, ry, 9, 600 + stage, 0.15); fs(g, C.leaf);
      g.save(); g.clip(); g.fillStyle = C.leafLo; g.fillRect(0, cy + ry * 0.3, 32, 12);
      g.fillStyle = C.leafHi; ell(g, 14, cy - ry * 0.4, rx * 0.4, ry * 0.3); g.fill(); g.restore();
      lump(g, 16, cy, rx, ry, 9, 600 + stage, 0.15); stroke(g);
      if (stage >= 3) {
        var pts = [[-0.5, -0.3], [0.3, -0.5], [0.5, 0.1], [-0.3, 0.3], [0.05, 0.05]];
        for (var i = 0; i < pts.length; i++) {
          var bx = 16 + pts[i][0] * rx * 1.3, by = cy + pts[i][1] * ry * 1.3;
          circ(g, bx, by, stage === 4 ? 1.6 : 1.1);
          fs(g, stage === 4 ? C.berry : '#a8b060', 0.8);
        }
      }
      return;
    }
    // rice: clump of blades, golden panicles when ripe
    var h = 4 + stage * 4.5, n = 3 + stage * 2;
    g.fillStyle = 'rgba(18,14,8,0.28)'; ell(g, 18, 28.6, 3 + stage * 1.8, 1.8); g.fill();
    var green = stage === 4 ? '#8a8a42' : '#6e8a40', dk = stage === 4 ? '#6a6a30' : '#4f6a30';
    for (var j = 0; j < n; j++) {
      var a = (j / (n - 1 || 1) - 0.5) * 1.5, bx2 = 16 + (j - n / 2) * 0.6;
      var tx = bx2 + Math.sin(a) * h * 0.8, ty = 28 - Math.cos(a) * h;
      g.beginPath(); g.moveTo(bx2, 28); g.quadraticCurveTo(bx2 + Math.sin(a) * h * 0.2, 28 - h * 0.6, tx, ty);
      g.strokeStyle = C.out; g.lineWidth = 2.6; g.stroke();
      g.strokeStyle = j % 2 ? green : dk; g.lineWidth = 1.2; g.stroke();
      if (stage === 4 && j % 2 === 0) {
        g.save(); g.translate(tx, ty); g.rotate(a + 0.6);
        ell(g, 0, 2, 1.3, 3); fs(g, '#d8b85a', 0.9);
        g.restore();
      }
    }
  }

  // ---------------------------------------------------------------- items
  function paintItem(g, kind, x, y, s, noShadow) {
    g.save(); g.translate(x, y); if (s && s !== 1) g.scale(s, s);
    if (!noShadow) { g.fillStyle = 'rgba(18,14,8,0.3)'; ell(g, 1.2, 3.6, 5.2, 1.4); g.fill(); }
    var i;
    if (kind === 'food') {
      poly(g, [-5, -0.8, 5, -0.8, 4, 3.6, -4, 3.6]); fs(g, '#a87c44', 1.2);
      line(g, -4.4, 1.4, 4.4, 1.4, '#7a5530', 0.6);
      var b = [[-2.6, -1.6, 1.9], [0.6, -2.6, 2], [3, -1.4, 1.7]];
      for (i = 0; i < b.length; i++) {
        circ(g, b[i][0], b[i][1], b[i][2]); fs(g, C.berry, 1);
        g.fillStyle = C.berryHi; g.fillRect(b[i][0] - 1, b[i][1] - 1, 0.8, 0.8);
      }
      g.fillStyle = '#6d8644'; ell(g, -0.5, -4.4, 1.6, 0.8); g.fill();
    } else if (kind === 'berries') {
      var bb = [[-3, 1.4], [0, 1.8], [3, 1.3], [-1.5, -1], [1.6, -0.9], [0, -3.2]];
      for (i = 0; i < bb.length; i++) {
        circ(g, bb[i][0], bb[i][1], 1.9); fs(g, C.berry, 1);
        g.fillStyle = C.berryHi; g.fillRect(bb[i][0] - 1, bb[i][1] - 1, 0.8, 0.8);
      }
      g.fillStyle = '#6d8644'; ell(g, 1.6, -4.6, 1.8, 0.8); g.fill();
    } else if (kind === 'rice') {
      // grain sack
      g.beginPath();
      g.moveTo(-4.6, 3.6); g.quadraticCurveTo(-6, -1, -3, -3.4); g.lineTo(-1.6, -5);
      g.lineTo(1.6, -5); g.lineTo(3, -3.4); g.quadraticCurveTo(6, -1, 4.6, 3.6); g.closePath();
      fs(g, '#cdb98c', 1.2);
      line(g, -2.6, -3.4, 2.6, -3.4, '#8a6a3a', 1);
      g.fillStyle = 'rgba(80,60,30,0.25)'; g.fillRect(1.5, -2, 3, 5.2);
      g.fillStyle = '#f2ead2';
      [[-2, 0.5], [0, 1.6], [1.6, -0.4], [-0.6, -1.4], [-2.4, 2.4], [1.2, 2.6]].forEach(function (p) { ell(g, p[0], p[1], 0.8, 0.45); g.fill(); });
    } else if (kind === 'meal') {
      // bowl with stew
      ell(g, 0, -0.4, 5.4, 2.2); fs(g, '#9a5a2e', 1.1);
      g.beginPath(); g.moveTo(-5.4, -0.4); g.quadraticCurveTo(-5, 4.2, 0, 4.2); g.quadraticCurveTo(5, 4.2, 5.4, -0.4); g.closePath();
      fs(g, '#8a6a4a', 1.2);
      g.fillStyle = 'rgba(255,240,210,0.2)'; g.fillRect(-4, 0.6, 2, 2);
      ell(g, 0, -0.6, 4.4, 1.5); g.fillStyle = '#b4682e'; g.fill();
      g.fillStyle = '#e8c070'; g.fillRect(-2, -1.2, 1.2, 0.8); g.fillRect(1, -0.9, 1.2, 0.8);
      g.fillStyle = '#6d8644'; g.fillRect(-0.4, -1.4, 1, 0.7);
      g.strokeStyle = 'rgba(240,235,225,0.5)'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(-1, -3); g.quadraticCurveTo(-2, -4.5, -1, -6); g.moveTo(1.6, -3); g.quadraticCurveTo(0.6, -4.5, 1.6, -6); g.stroke();
    } else if (kind === 'wood') {
      rr(g, -5.5, -0.6, 11, 3.6, 1.8); fs(g, C.bark, 1.2);
      rr(g, -4.5, -3.6, 10, 3.4, 1.7); fs(g, C.barkHi, 1.2);
      ell(g, 4.4, 1.2, 1.3, 1.7); fs(g, '#d6ad74', 0.9);
      ell(g, 5, -1.9, 1.2, 1.6); fs(g, '#d6ad74', 0.9);
      g.fillStyle = '#a07a48'; g.fillRect(4.2, 0.9, 0.5, 0.5); g.fillRect(4.8, -2.2, 0.5, 0.5);
    } else {
      lump(g, 0, 0.8, 5.4, 3.6, 7, 4711, 0.2); fs(g, C.stoneFront, 1.2);
      g.save(); lump(g, 0, 0.8, 5.4, 3.6, 7, 4711, 0.2); g.clip();
      g.fillStyle = C.stoneTop; ell(g, -0.6, -1.4, 4.4, 2.4); g.fill();
      g.fillStyle = C.stoneHi; ell(g, -1.8, -1.9, 1.6, 0.8); g.fill();
      g.restore();
      lump(g, 0, 0.8, 5.4, 3.6, 7, 4711, 0.2); stroke(g, C.out, 1.2);
    }
    g.restore();
  }
  function paintStack(g, kind, big) {
    if (kind === 'wood') {
      g.fillStyle = 'rgba(18,14,8,0.3)'; rr(g, 6.5, 22, 23, 7.5, 3); g.fill();
      var rows = big ? [[22.5, 0], [19, 1.5], [15.5, 0.5]] : [[22.5, 0], [19, 1.5]];
      for (var i = 0; i < rows.length; i++) {
        var y = rows[i][0], o = rows[i][1];
        rr(g, 5 + o, y, 20, 4.4, 2.2); fs(g, i % 2 ? C.barkHi : C.bark, 1.2);
        ell(g, 24.5 + o, y + 2.2, 1.6, 2.1); fs(g, '#d6ad74', 0.9);
        g.fillStyle = '#a07a48'; g.fillRect(24.2 + o, y + 1.9, 0.6, 0.6);
      }
    } else if (kind === 'stone') {
      paintItem(g, 'stone', 13, 23, 1.5);
      if (big) paintItem(g, 'stone', 20.5, 22, 1.25);
    } else {
      paintItem(g, kind, 15.5, 21.5, 1.55);
      if (big) paintItem(g, kind, 21.5, 18.5, 1.15);
    }
  }

  // ---------------------------------------------------------------- pawns
  var LOOKS = [
    { skin: '#e8c4a0', hair: '#3b2a1e', shirt: '#5a7890', pants: '#3e4450', style: 0 },
    { skin: '#d8a880', hair: '#a4552a', shirt: '#b08e48', pants: '#5a4632', style: 1 },
    { skin: '#a8724c', hair: '#1f1a18', shirt: '#9a4a3e', pants: '#3a3e44', style: 2 },
    { skin: '#e8c4a0', hair: '#d2b26a', shirt: '#647e48', pants: '#4a3c30', style: 3 },
    { skin: '#7e5034', hair: '#2a1e1a', shirt: '#cdbf9e', pants: '#4b5638', style: 0 },
    { skin: '#d8a880', hair: '#9a968e', shirt: '#6e5a8a', pants: '#3c3a44', style: 1 },
    { skin: '#a8724c', hair: '#5a3420', shirt: '#3f7a74', pants: '#3a3030', style: 3 },
    { skin: '#efcfb2', hair: '#8e3a26', shirt: '#8a6440', pants: '#2f3a4a', style: 2 }
  ];
  var BAND = ['#a8432f', '#c6a24a', '#6a5a8a', '#3f6a5a', '#b05a4a', '#a8432f', '#c6a24a', '#5a7890'];
  var RAIDER = { skin: '#c49272', hair: '#241a16', shirt: '#5e2a22', pants: '#2a2428', style: 'hood', hood: '#3a2d30', mask: '#9c2f26' };

  function faceMarks(g, cx, cy, mood, blink, angryCol) {
    g.fillStyle = '#2a1e16'; g.strokeStyle = '#2a1e16'; g.lineWidth = 0.8;
    if (mood === 'dead') {
      g.beginPath();
      g.moveTo(cx + 1.6, cy - 0.4); g.lineTo(cx + 3.2, cy + 1.2); g.moveTo(cx + 3.2, cy - 0.4); g.lineTo(cx + 1.6, cy + 1.2);
      g.moveTo(cx + 4.4, cy - 0.4); g.lineTo(cx + 6, cy + 1.2); g.moveTo(cx + 6, cy - 0.4); g.lineTo(cx + 4.4, cy + 1.2);
      g.stroke();
    } else if (blink || mood === 'sleep') {
      g.beginPath(); g.moveTo(cx + 1.7, cy + 0.6); g.lineTo(cx + 3.1, cy + 0.6); g.moveTo(cx + 4.5, cy + 0.6); g.lineTo(cx + 5.8, cy + 0.6); g.stroke();
    } else {
      if (angryCol) g.fillStyle = angryCol;
      g.fillRect(cx + 1.9, cy - 0.5, 1.2, 1.7); g.fillRect(cx + 4.7, cy - 0.5, 1.1, 1.7);
      if (mood === 'fight') {
        g.beginPath(); g.moveTo(cx + 1.4, cy - 2.2); g.lineTo(cx + 3.4, cy - 1.2); g.moveTo(cx + 6.4, cy - 2.2); g.lineTo(cx + 4.6, cy - 1.3);
        g.strokeStyle = '#2a1e16'; g.stroke();
      }
    }
  }
  // view: 'side' (facing right) | 'front' (facing viewer, aim S) | 'back' (facing away, aim N)
  function headAt(g, L, cx, cy, r, mood, blink, look, view) {
    view = view || 'side';
    if (L.style === 1) {
      if (view === 'side') { rr(g, cx - r - 0.6, cy - 2, r * 1.15, r + 4.5, 3); fs(g, L.hair); }
      else if (view === 'front') { rr(g, cx - r - 0.8, cy - 2, r * 2 + 1.6, r + 3.5, 3); fs(g, L.hair); }
    }
    circ(g, cx, cy, r); fs(g, L.skin);
    if (L.style === 'hood') {
      if (view === 'back') { circ(g, cx, cy, r + 0.9); fs(g, L.hood); return; }
      g.beginPath();
      if (view === 'front') {
        g.arc(cx, cy, r + 0.9, Math.PI * 0.15, Math.PI * 0.85, true);
        g.quadraticCurveTo(cx - r * 0.6, cy - r * 0.6, cx, cy - r * 0.62);
        g.quadraticCurveTo(cx + r * 0.6, cy - r * 0.6, cx + (r + 0.9) * Math.cos(0.15 * Math.PI), cy + (r + 0.9) * Math.sin(0.15 * Math.PI));
      } else {
        g.arc(cx, cy, r + 0.9, -1.2, 1.35, true);
        g.quadraticCurveTo(cx - 1.5, cy + 0.5, cx + 2.6, cy - r - 0.2);
      }
      g.closePath(); fs(g, L.hood);
      g.save(); circ(g, cx, cy, r - 0.2); g.clip();
      g.fillStyle = L.mask;
      if (view === 'front') g.fillRect(cx - r, cy + 0.6, r * 2, r); else g.fillRect(cx - 1, cy + 0.6, r + 2, r);
      g.restore();
      line(g, view === 'front' ? cx - r * 0.85 : cx - 0.6, cy + 0.6, cx + r * (view === 'front' ? 0.85 : 1), cy + 0.6, C.out, 0.9);
      circ(g, cx, cy, r); stroke(g);
      var ex = view === 'front' ? cx - 4.2 : cx;
      faceMarks(g, ex, cy - 1.6, mood === 'ok' ? 'fight' : mood, false, mood === 'dead' || mood === 'sleep' ? null : '#ffd860');
      return;
    }
    if (view === 'back') {
      circ(g, cx, cy, r + 0.5); fs(g, L.hair);
      g.fillStyle = 'rgba(255,240,210,0.16)'; ell(g, cx - r * 0.25, cy - r * 0.55, r * 0.45, r * 0.22); g.fill();
      line(g, cx, cy - r * 0.9, cx + 0.6, cy + r * 0.3, 'rgba(20,14,8,0.3)', 0.8);
      if (L.style === 2) { circ(g, cx, cy - r * 0.35, 2.8); fs(g, L.hair); }
      if (L.style === 3) { limb(g, cx - r, cy - r * 0.15, cx + r, cy - r * 0.15, 1.4, BAND[look & 7]); limb(g, cx, cy - r * 0.1, cx + 1.5, cy + r * 0.7, 1, BAND[look & 7]); }
      if (L.style === 1) { rr(g, cx - r * 0.9, cy, r * 1.8, r * 0.9, 2.5); fs(g, L.hair); }
      return;
    }
    g.beginPath();
    if (view === 'front') {
      g.arc(cx, cy, r + 0.5, Math.PI * 0.93, Math.PI * 2.07);
      g.lineTo(cx + r * 0.62, cy - r * 0.3);
      g.lineTo(cx + r * 0.32, cy - r * 0.5);
      g.lineTo(cx + r * 0.05, cy - r * 0.25);
      g.lineTo(cx - r * 0.25, cy - r * 0.5);
      g.lineTo(cx - r * 0.55, cy - r * 0.28);
      g.lineTo(cx - r * 0.9, cy + r * 0.2);
    } else {
      g.arc(cx, cy, r + 0.5, Math.PI * 0.86, Math.PI * 1.93);
      g.lineTo(cx + r * 0.62, cy - r * 0.42);
      g.lineTo(cx + r * 0.28, cy - r * 0.2);
      g.lineTo(cx - r * 0.05, cy - r * 0.45);
      g.lineTo(cx - r * 0.35, cy - r * 0.15);
      g.lineTo(cx - r * 0.55, cy + r * 0.25);
      g.lineTo(cx - r * 0.85, cy + r * 0.6);
    }
    g.closePath(); fs(g, L.hair);
    g.fillStyle = 'rgba(255,240,210,0.18)'; ell(g, cx - r * 0.3, cy - r * 0.7, r * 0.35, r * 0.16); g.fill();
    if (L.style === 2) { circ(g, view === 'front' ? cx : cx - r * 0.55, cy - r - 0.8, 2.6); fs(g, L.hair); }
    if (L.style === 3) {
      if (view === 'front') limb(g, cx - r + 0.2, cy - r * 0.5, cx + r - 0.2, cy - r * 0.5, 1.4, BAND[look & 7]);
      else {
        limb(g, cx - r + 0.3, cy - r * 0.3, cx + r * 0.75, cy - r * 0.62, 1.4, BAND[look & 7]);
        limb(g, cx - r + 0.3, cy - r * 0.3, cx - r - 2.2, cy + 1.6, 1, BAND[look & 7]);
      }
    }
    if (view === 'front') {
      faceMarks(g, cx - 4.2, cy, mood, blink);
      if (mood !== 'dead') { g.fillStyle = 'rgba(200,90,70,0.3)'; g.fillRect(cx - 4.6, cy + 2.1, 1.6, 1); g.fillRect(cx + 3, cy + 2.1, 1.6, 1); }
    } else {
      faceMarks(g, cx, cy, mood, blink);
      if (mood !== 'dead') { g.fillStyle = 'rgba(200,90,70,0.3)'; g.fillRect(cx + 4.6, cy + 2.1, 1.8, 1); }
    }
  }
  function torsoPath(g, x, y) {
    g.beginPath();
    g.moveTo(x - 5.2, y - 9);
    g.quadraticCurveTo(x - 6.4, y - 1, x - 5.4, y + 1.2);
    g.quadraticCurveTo(x, y + 3.2, x + 5.4, y + 1.2);
    g.quadraticCurveTo(x + 6.4, y - 1, x + 5.2, y - 9);
    g.quadraticCurveTo(x, y - 11.2, x - 5.2, y - 9);
    g.closePath();
  }
  function torso(g, L, x, y) {
    torsoPath(g, x, y); fs(g, L.shirt);
    g.save(); g.clip();
    g.fillStyle = L.pants; g.fillRect(x - 7, y - 1.3, 14, 5);
    g.fillStyle = 'rgba(20,14,8,0.22)'; g.fillRect(x + 2.6, y - 11, 5, 15);
    g.fillStyle = 'rgba(255,240,210,0.16)'; g.fillRect(x - 5, y - 10, 2.2, 9);
    g.restore();
    line(g, x - 5.6, y - 1.3, x + 5.6, y - 1.3, C.out, 0.8);
    torsoPath(g, x, y); stroke(g);
  }
  function hand(g, L, x, y) { circ(g, x, y, 1.55); fs(g, L.skin, 1.1); }

  function tool(g, kind, hx, hy, ang) {
    var dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx, ex, ey;
    if (kind === 'pick') {
      limb(g, hx - dx * 2, hy - dy * 2, hx + dx * 8, hy + dy * 8, 1.3, '#7a5a38');
      ex = hx + dx * 8; ey = hy + dy * 8;
      g.beginPath(); g.moveTo(ex - nx * 4 - dx, ey - ny * 4 - dy); g.quadraticCurveTo(ex + dx * 1.5, ey + dy * 1.5, ex + nx * 4 - dx, ey + ny * 4 - dy);
      g.strokeStyle = C.out; g.lineWidth = 1.8 + LW * 1.6; g.stroke();
      g.strokeStyle = '#a7a59c'; g.lineWidth = 1.8; g.stroke();
    } else if (kind === 'axe') {
      limb(g, hx - dx * 2, hy - dy * 2, hx + dx * 8.5, hy + dy * 8.5, 1.3, '#7a5a38');
      ex = hx + dx * 7.5; ey = hy + dy * 7.5;
      poly(g, [ex - dx * 1.5, ey - dy * 1.5, ex + nx * 4 - dx * 2.2, ey + ny * 4 - dy * 2.2, ex + nx * 4.4 + dx * 2.4, ey + ny * 4.4 + dy * 2.4, ex + dx * 1.5, ey + dy * 1.5]);
      fs(g, '#b8b6ac', 1.1);
    } else if (kind === 'hammer') {
      limb(g, hx - dx * 1.5, hy - dy * 1.5, hx + dx * 6.5, hy + dy * 6.5, 1.3, '#7a5a38');
      ex = hx + dx * 6.5; ey = hy + dy * 6.5;
      poly(g, [ex - nx * 2.8 - dx * 1.4, ey - ny * 2.8 - dy * 1.4, ex + nx * 2.8 - dx * 1.4, ey + ny * 2.8 - dy * 1.4, ex + nx * 2.8 + dx * 1.4, ey + ny * 2.8 + dy * 1.4, ex - nx * 2.8 + dx * 1.4, ey - ny * 2.8 + dy * 1.4]);
      fs(g, '#8e8c84', 1.1);
    } else if (kind === 'sickle') {
      limb(g, hx - dx * 1, hy - dy * 1, hx + dx * 3.5, hy + dy * 3.5, 1.3, '#7a5a38');
      ex = hx + dx * 3.5; ey = hy + dy * 3.5;
      g.beginPath(); g.moveTo(ex, ey);
      g.quadraticCurveTo(ex + dx * 5 + nx * 1, ey + dy * 5 + ny * 1, ex + dx * 3 + nx * 4.5, ey + dy * 3 + ny * 4.5);
      g.strokeStyle = C.out; g.lineWidth = 1.6 + LW * 1.6; g.stroke(); g.strokeStyle = '#c8c6bc'; g.lineWidth = 1.6; g.stroke();
    } else if (kind === 'ladle') {
      limb(g, hx - dx * 1, hy - dy * 1, hx + dx * 7, hy + dy * 7, 1, '#8a6a44');
      circ(g, hx + dx * 8, hy + dy * 8, 1.6); fs(g, '#9a968c', 1);
    } else if (kind === 'club') {
      limb(g, hx - dx * 1.5, hy - dy * 1.5, hx + dx * 7.5, hy + dy * 7.5, 1.6, '#6e5033');
      circ(g, hx + dx * 8, hy + dy * 8, 1.9); fs(g, '#7a5a38', 1.1);
    } else if (kind === 'rifle') {
      limb(g, hx - dx * 4, hy - dy * 4, hx + dx * 1, hy + dy * 1, 2.4, '#6e5033');
      limb(g, hx, hy, hx + dx * 10, hy + dy * 10, 1.3, '#3c3c38');
    } else if (kind === 'blade') {
      limb(g, hx - dx * 1.5, hy - dy * 1.5, hx + dx * 1.5, hy + dy * 1.5, 1.4, '#4a3424');
      limb(g, hx - dy * 2.2 + dx * 1.6, hy + dx * 2.2 + dy * 1.6, hx + dy * 2.2 + dx * 1.6, hy - dx * 2.2 + dy * 1.6, 0.9, '#8a7a5a');
      g.beginPath(); g.moveTo(hx + dx * 2, hy + dy * 2); g.lineTo(hx + dx * 10, hy + dy * 10);
      g.strokeStyle = C.out; g.lineWidth = 2 + LW * 1.6; g.stroke();
      g.strokeStyle = '#c4c2ba'; g.lineWidth = 2; g.stroke();
    }
  }
  function muzzle(g, x, y, ang) {
    g.save(); g.translate(x, y); g.rotate(ang || 0);
    g.fillStyle = 'rgba(255,200,90,0.45)'; circ(g, 0, 0, 3.4); g.fill();
    poly(g, [-1, -1.6, 4.5, 0, -1, 1.6]); g.fillStyle = '#fff0b0'; g.fill();
    g.restore();
  }

  // work kind -> tool, swing period (ms), crouch (units), swing angles per view [wind, strike]
  var WORK = {
    mine: { tool: 'pick', per: 720, crouch: 0, side: [-2.35, 0.75], back: [1.1, -1.55], front: [-1.65, 1.45] },
    chop: { tool: 'axe', per: 640, crouch: 0, side: [-2.2, 0.35], back: [1.0, -1.5], front: [-1.6, 1.3] },
    build: { tool: 'hammer', per: 420, crouch: 1, side: [-1.7, 0.45], back: [0.5, -1.45], front: [-1.0, 1.3] }
  };

  // carried (downed) colonist slung over the shoulders
  function drawCarried(g, look, bx, by) {
    var L = LOOKS[((look | 0) % 8 + 8) % 8];
    g.save(); g.translate(bx - 0.5, by - 12.5); g.scale(0.78, 0.78);
    ell(g, 10.5, -0.6, 1.9, 1.3); fs(g, dark(L.pants, 0.45), 1.1);
    ell(g, 11, 1.8, 1.9, 1.3); fs(g, dark(L.pants, 0.45), 1.1);
    g.save(); g.translate(-4.5, 0.5); g.rotate(-Math.PI / 2); torso(g, L, 0, 7); g.restore();
    g.save(); g.translate(-10.5, 3); g.rotate(0.9); headAt(g, L, 0, 0, 6.4, 'sleep', true, look, 'side'); g.restore();
    g.restore();
  }

  // standing / crouching pawn. origin = feet centre, unit scale, facing right (side view).
  function paintPawn(g, L, pose, t, seed, carrying, weapon, look, drafted, work, aim, carryLook) {
    var T = t + seed * 1337, bob = 0, sway = 0, lean = 0;
    var actionPose = pose === 'work' || pose === 'shoot' || pose === 'fight';
    var view = actionPose && aim === 'N' ? 'back' : actionPose && aim === 'S' ? 'front' : 'side';
    var wk = pose === 'work' ? (work || 'mine') : null;
    var crouch = wk === 'sow' || wk === 'harvest' ? 3.2 : wk === 'doctor' ? 4.6 : 0;
    if (pose === 'walk') { var ph = T / 115; bob = -Math.abs(Math.sin(ph)) * 1.5; sway = Math.sin(ph); }
    else if (pose === 'idle' || pose === 'shoot' || pose === 'eat') { bob = Math.sin(T / 520) * 0.45; }
    var W = WORK[wk], c = 0, a = 0;
    if (W) {
      c = (T % W.per) / W.per;
      var rng2 = W[view];
      a = c < 0.6 ? lerp(rng2[0] * 0.35, rng2[0], smooth(c / 0.6)) : lerp(rng2[0], rng2[1], smooth((c - 0.6) / 0.4));
      bob = c > 0.6 ? 0.7 * smooth((c - 0.6) / 0.4) : 0;
      if (view === 'side') lean = c > 0.6 ? 0.8 : -0.3;
      if (view === 'back') bob = c > 0.6 ? -0.6 : 0.3;
      crouch = W.crouch;
    }
    var jab = 0;
    if (pose === 'fight') { jab = Math.max(0, Math.sin(T / 420 * TAU)); lean = view === 'side' ? jab * 1.2 : 0; bob = -jab * 0.4; }
    var shotK = (T % 760) / 760, flash = pose === 'shoot' && shotK < 0.09;
    if (pose === 'shoot' && view === 'side') lean = flash ? -0.6 : 0;
    shadowBlob(g, 1.8, 0.6, 7.2 + crouch * 0.4, 2.5, 0.32);
    // feet
    var fy = -0.6, spread = crouch ? 1.2 : 0;
    ell(g, -2.4 - sway * 1.6 - spread, fy + (sway > 0 ? -0.3 : 0), 1.9, 1.2); fs(g, dark(L.pants, 0.45), 1.1);
    ell(g, 2.4 + sway * 1.6 + spread, fy + (sway < 0 ? -0.3 : 0), 1.9, 1.2); fs(g, dark(L.pants, 0.45), 1.1);
    var bx = lean, by = -2.4 + bob + crouch;
    var restRifle = drafted && !carrying && carryLook == null && (pose === 'idle' || pose === 'walk');
    // back hand (behind torso)
    var bh = { x: bx - 6, y: by - 4.5 - sway * 0.8 };
    if (carrying || pose === 'eat') bh = { x: bx + 1.5, y: by - 4 };
    if (view !== 'side') bh = { x: bx - 6, y: by - 4 };
    var backHandHidden = pose === 'shoot' || restRifle || carryLook != null || wk === 'doctor' || wk === 'cook';
    if (!backHandHidden) hand(g, L, bh.x, bh.y);
    torso(g, L, bx, by);
    if (view === 'back') { line(g, bx, by - 9.5, bx, by - 2, 'rgba(20,14,8,0.25)', 0.8); }
    if (carryLook != null) drawCarried(g, carryLook, bx, by);
    var hx = bx + (view === 'side' ? 0.4 + lean * 0.3 : 0), hy = by - 15.8;
    var blink = (T % 3400) < 130;
    var mood = pose === 'fight' || pose === 'shoot' ? 'fight' : 'ok';
    // tool raised behind the head (front view wind-up) is drawn before the head? no: tools are always in front.
    headAt(g, L, hx, hy, 7.4, L.style === 'hood' ? 'fight' : mood, blink && pose !== 'shoot', look, view);
    var sx, sy, hxx, hyy;
    if (W) {
      sx = bx + (view === 'side' ? 2.6 : 3.4); sy = by - (view === 'back' ? 9.5 : 7.5);
      hxx = sx + Math.cos(a) * 5; hyy = sy + Math.sin(a) * 5;
      if (view === 'front') hand(g, L, bx - 4.6, by - 4.5);
      tool(g, W.tool, hxx, hyy, a); hand(g, L, hxx, hyy);
    } else if (wk === 'sow') {
      var sk = (T % 900) / 900, reach = smooth(sk < 0.5 ? sk * 2 : (1 - sk) * 2);
      var tx = view === 'side' ? bx + 4 + reach * 3.5 : bx + 2 + reach * 2, ty = by - 6 + reach * 3.5;
      hand(g, L, tx, ty);
      if (sk > 0.35) {
        for (var i = 0; i < 4; i++) {
          var f = (sk - 0.35) / 0.65, sx2 = tx + 1 + i * 1.3 * (view === 'side' ? 1 : (i % 2 ? 1 : -1)), sy2 = ty + 1 + f * (4 + i * 1.4);
          g.fillStyle = '#e8d8a0'; g.fillRect(sx2, sy2, 0.9, 0.9);
        }
      }
      if (view !== 'back') { rr(g, bx - 3, by - 6.5, 5, 4, 1.4); fs(g, '#a88a58', 0.9); }
    } else if (wk === 'harvest') {
      var hk = (T % 800) / 800, ang = view === 'side' ? lerp(-0.2, 1.5, smooth(hk < 0.5 ? hk * 2 : (1 - hk) * 2)) : lerp(0.3, 2.8, smooth(hk < 0.5 ? hk * 2 : (1 - hk) * 2));
      hxx = bx + (view === 'side' ? 4.5 : 0) + Math.cos(ang) * 2.5; hyy = by - 4 + Math.sin(ang) * 1.5;
      tool(g, 'sickle', hxx, hyy, view === 'side' ? 0.6 : ang);
      hand(g, L, hxx, hyy);
    } else if (wk === 'cook') {
      var ck = T / 260, cxr = Math.cos(ck) * 1.6, cyr = Math.sin(ck) * 0.8;
      if (view === 'side') { hxx = bx + 6.5 + cxr; hyy = by - 5 + cyr; tool(g, 'ladle', hxx, hyy, 1.1); }
      else if (view === 'front') { hxx = bx + 1 + cxr; hyy = by - 3 + cyr; tool(g, 'ladle', hxx, hyy, 1.5); }
      else { hxx = bx + 1 + cxr; hyy = by - 12 + cyr; tool(g, 'ladle', hxx, hyy, -1.5); }
      hand(g, L, hxx, hyy); hand(g, L, bx - 4.5, by - 5);
    } else if (wk === 'doctor') {
      var dk2 = Math.sin(T / 300) * 0.8;
      var dxh = view === 'side' ? bx + 5 : bx, dyh = view === 'back' ? by - 10 : by - 2.5;
      rr(g, dxh - 2 + dk2, dyh - 1.6, 4.2, 3.2, 1.4); fs(g, '#f2ece0', 1);
      line(g, dxh - 1.2 + dk2, dyh, dxh + 1.6 + dk2, dyh, '#c84a3a', 0.8);
      hand(g, L, dxh - 2.6 + dk2, dyh + 0.4); hand(g, L, dxh + 2.6 + dk2 * 0.5, dyh - 0.4);
    } else if (pose === 'shoot') {
      if (view === 'side') {
        var rx = bx + 3 + lean, ry = by - 8;
        tool(g, 'rifle', rx, ry, -0.04);
        hand(g, L, rx - 2.4, ry + 0.6); hand(g, L, rx + 3.2, ry + 0.2);
        if (flash) muzzle(g, rx + 10.8, ry - 0.4, 0);
      } else {
        var va = view === 'back' ? -Math.PI / 2 : Math.PI / 2, rx2 = bx + 2.2, ry2 = view === 'back' ? by - 11 : by - 5;
        tool(g, 'rifle', rx2, ry2, va);
        hand(g, L, rx2, ry2 - Math.sin(va) * 2); hand(g, L, rx2, ry2 + Math.sin(va) * 3);
        if (flash) muzzle(g, rx2, ry2 + Math.sin(va) * 10.8, va);
      }
    } else if (pose === 'fight' || weapon) {
      if (weapon === 'fist' || (pose === 'fight' && !weapon && false)) {
        hand(g, L, bx + 5.5 + jab * 4, by - 7 - jab);
      } else {
        var fx = bx + 5.5 + jab * 3.5, fyy = by - 6 - jab * 1.5;
        if (view === 'back') { fx = bx + 3; fyy = by - 10 - jab * 4; }
        if (view === 'front') { fx = bx + 3; fyy = by - 4 + jab * 3; }
        var wa = view === 'side' ? -1.05 + jab * 0.9 : view === 'back' ? -1.4 : 1.3 - (1 - jab) * 2.4;
        tool(g, weapon || 'club', fx, fyy, wa); hand(g, L, fx, fyy);
      }
    } else if (pose === 'eat') {
      var ek = (T % 1400) / 1400, up = ek < 0.5 ? smooth(ek * 2) : smooth((1 - ek) * 2);
      paintItem(g, 'meal', bx + 3.5, by - 4.2, 0.75);
      hand(g, L, bx + 5 - up * 0.5, by - 5 - up * 7.5);
      hand(g, L, bx + 0.5, by - 3.2);
    } else if (carryLook != null) {
      hand(g, L, bx + 5.5, by - 12); hand(g, L, bx - 3.5, by - 12.5);
    } else if (restRifle) {
      tool(g, 'rifle', bx - 1, by - 3.5, -0.85);
      hand(g, L, bx - 1.5, by - 3); hand(g, L, bx + 3, by - 8);
    } else if (carrying) {
      hand(g, L, bx + 5.8, by - 4);
    } else {
      hand(g, L, bx + 6, by - 4.5 + sway * 0.8);
    }
    if (carrying && carryLook == null) paintItem(g, carrying === 'food' ? 'berries' : carrying, bx + 3.2, by - 3.4, 0.95);
  }

  // lying pawn: mode 'sleep' | 'dead' | 'downed'
  function paintLying(g, L, t, seed, mode, look) {
    var T = t + seed * 1337, dead = mode === 'dead';
    var Ld = L;
    if (dead) Ld = { skin: mix(L.skin, '#8f8a80', 0.55), hair: mix(L.hair, '#6a6660', 0.4), shirt: mix(L.shirt, '#6a6660', 0.55), pants: mix(L.pants, '#4a4640', 0.5), style: L.style, hood: L.hood && mix(L.hood, '#4a4640', 0.5), mask: L.mask && mix(L.mask, '#6a6660', 0.5) };
    shadowBlob(g, 1.6, -1, 13, 3.2, 0.3);
    if (mode === 'sleep') {
      rr(g, -13, -7.5, 26, 7.5, 3); fs(g, '#5d5444');
      rr(g, -13.5, -9.6, 7.5, 5.5, 2.5); fs(g, C.cloth);
    } else {
      g.fillStyle = dead ? 'rgba(90,30,24,0.4)' : 'rgba(120,30,24,0.35)'; lump(g, -4, -2.5, dead ? 7 : 4.5, dead ? 2.6 : 1.8, 7, 99, 0.3); g.fill();
    }
    var br = mode === 'dead' ? 0 : Math.sin(T / (mode === 'downed' ? 500 : 900)) * 0.35;
    g.save(); g.translate(1.5, -4.6 - br * 0.5); g.rotate(-Math.PI / 2);
    if (mode !== 'sleep') {
      ell(g, -1.8, 9.5, 1.9, 1.3); fs(g, dark(Ld.pants, 0.45), 1.1);
      ell(g, 1.8, 9.8, 1.9, 1.3); fs(g, dark(Ld.pants, 0.45), 1.1);
    }
    torso(g, Ld, 0, 7);
    g.restore();
    if (mode === 'sleep') {
      rr(g, -5.5, -10 - br, 18, 9 + br, 3.5); fs(g, L.shirt);
      line(g, -3.5, -7.6 - br, 11, -7.6 - br, 'rgba(255,240,210,0.3)', 0.8);
      g.fillStyle = 'rgba(20,14,8,0.2)'; g.fillRect(-5, -4, 17.5, 2.5);
    }
    g.save(); g.translate(-9.5, -7.6); g.rotate(mode === 'sleep' ? -0.35 : 0.15);
    headAt(g, Ld, 0, 0, 6.6, dead ? 'dead' : 'sleep', true, look);
    g.restore();
    if (mode !== 'sleep') hand(g, Ld, -2, -1.2);
  }
  function drawZs(ctx, t) {
    for (var i = 0; i < 3; i++) {
      var k = ((t / 1400 + i / 3) % 1);
      var s = 0.6 + k * 0.7, x = -6 + k * 7 + Math.sin(k * 6 + i) * 1.2, y = -13 - k * 13;
      ctx.save(); ctx.globalAlpha = Math.min(1, (1 - k) * 1.6);
      ctx.translate(x, y); ctx.scale(s, s);
      ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(2, -2); ctx.lineTo(-2, 2); ctx.lineTo(2, 2);
      ctx.strokeStyle = C.out; ctx.lineWidth = 2.6; ctx.stroke();
      ctx.strokeStyle = '#e4ecff'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.restore();
    }
  }
  function draftBadge(g) {
    // small orange chevron shield at the pawn's upper-left
    g.save(); g.translate(-9, -24);
    poly(g, [-3, -3.5, 3, -3.5, 3, 0.5, 0, 3.6, -3, 0.5]); fs(g, PALETTE.draft, 1.1);
    line(g, -1.6, -1.4, 0, 0.2, '#fff4dc', 0.9); line(g, 0, 0.2, 1.6, -1.4, '#fff4dc', 0.9);
    g.restore();
  }

  function paintBoar(g, t, seed, still) {
    var T = still ? 0 : t + seed * 977, ph = T / 95, bob = still ? 0 : -Math.abs(Math.sin(ph)) * 0.8, s = still ? 0 : Math.sin(ph);
    shadowBlob(g, 2, 0.4, 11, 2.8, 0.32);
    var fur = '#5a4030', furLo = '#3e2a1e', furHi = '#76543c';
    limb(g, -5, -4 + bob, -5 - s * 1.6, -0.5, 2.2, furLo);
    limb(g, 5, -4 + bob, 5 + s * 1.6, -0.5, 2.2, furLo);
    lump(g, -0.5, -8.8 + bob, 10, 6.4, 10, 515, 0.08); fs(g, fur);
    g.save(); lump(g, -0.5, -8.8 + bob, 10, 6.4, 10, 515, 0.08); g.clip();
    g.fillStyle = furLo; g.fillRect(-12, -6 + bob, 24, 6);
    g.fillStyle = furHi; ell(g, -3, -12.5 + bob, 6, 2); g.fill();
    g.restore();
    lump(g, -0.5, -8.8 + bob, 10, 6.4, 10, 515, 0.08); stroke(g);
    g.beginPath(); g.moveTo(-6, -14 + bob);
    for (var i = 0; i <= 8; i++) g.lineTo(-6 + i * 1.6, -15 + bob - (i % 2 ? 2.6 : 0) - Math.sin(i / 8 * Math.PI) * 0.8);
    g.lineTo(6.6, -13 + bob); g.closePath(); fs(g, '#2e2018', 1.1);
    limb(g, -3, -4 + bob, -3 + s * 1.6, -0.4, 2.4, fur);
    limb(g, 7, -4 + bob, 7 - s * 1.6, -0.4, 2.4, fur);
    g.beginPath(); g.moveTo(-10, -10 + bob); g.quadraticCurveTo(-13, -12 + bob, -12, -8 + bob); g.strokeStyle = C.out; g.lineWidth = 1.6; g.stroke();
    g.beginPath();
    g.moveTo(5, -14 + bob); g.quadraticCurveTo(10, -13 + bob, 13.2, -8.5 + bob);
    g.lineTo(13.8, -5.2 + bob); g.quadraticCurveTo(10, -3 + bob, 6, -4.5 + bob);
    g.closePath(); fs(g, furHi);
    ell(g, 13.6, -6.8 + bob, 1.4, 2); fs(g, '#a07a68', 1.1);
    g.fillStyle = C.out; g.fillRect(13.4, -7.6 + bob, 0.6, 0.6); g.fillRect(13.4, -6.2 + bob, 0.6, 0.6);
    poly(g, [6.4, -13 + bob, 7.4, -17 + bob, 9.6, -13 + bob]); fs(g, fur, 1.1);
    g.beginPath(); g.moveTo(11, -5 + bob); g.quadraticCurveTo(13.4, -5 + bob, 13.2, -9 + bob);
    g.strokeStyle = C.out; g.lineWidth = 2.8; g.stroke(); g.strokeStyle = '#ece2c8'; g.lineWidth = 1.3; g.stroke();
    if (still === 'dead') {
      g.strokeStyle = C.out; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(9.2, -10.6); g.lineTo(10.8, -9); g.moveTo(10.8, -10.6); g.lineTo(9.2, -9); g.stroke();
    } else {
      g.fillStyle = '#ff5a3a'; g.fillRect(9.4, -10.3 + bob, 1.4, 1.2);
    }
  }
  function paintBoarLying(g, t, dead) {
    shadowBlob(g, 2, -0.5, 12, 3, 0.3);
    if (dead) { g.fillStyle = 'rgba(90,30,24,0.4)'; lump(g, 0, -1, 8, 2.4, 7, 98, 0.3); g.fill(); }
    g.save(); g.translate(0, -7); g.scale(1, -0.75); g.translate(0, 7);
    paintBoar(g, t, 0, 'dead');
    g.restore();
    if (!dead) { // breathing tick
      var k = Math.sin(t / 400) * 0.3;
      g.fillStyle = 'rgba(255,255,255,0.0)'; g.fillRect(0, k, 0, 0);
    }
  }

  function hostileRing(ctx, t) {
    ctx.save();
    ctx.setLineDash([2.6, 2]); ctx.lineDashOffset = -t / 120;
    ell(ctx, 0, 0.3, 11, 3.6);
    ctx.strokeStyle = 'rgba(224,80,60,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- blueprints
  function bpPath(g, type, mask) {
    mask = mask | 0;
    var N = mask & 1, E = mask & 2, S = mask & 4, W = mask & 8;
    g.beginPath();
    if (type === 'wall_wood' || type === 'wall_stone' || type === 'door_wood') {
      var x0 = W ? 0 : 1, x1 = E ? 32 : 31, y0 = N ? 0 : -RAISE + 1;
      g.rect(x0, y0, x1 - x0, 31 - y0 + (S ? 1 : 0));
    } else if (type === 'bed') {
      g.rect(6, 1, 20, 30);
    } else if (type === 'turret') {
      g.rect(5, 15, 22, 14.5); g.moveTo(22, 10); g.arc(16, 10, 6, 0, TAU);
    } else if (type === 'campfire') {
      g.ellipse(16, 23, 11, 6.4, 0, 0, TAU);
    } else if (type === 'torch') {
      g.rect(14, 3, 4, 27); g.moveTo(20.5, 3); g.arc(16, 3, 4.5, 0, TAU);
    } else {
      g.rect(2, 2, 28, 28);
    }
  }
  function drawBlueprintLive(g, type, progress, mask, t) {
    var p = clamp(progress || 0, 0, 1);
    bpPath(g, type, mask);
    g.fillStyle = C.bpFill; g.fill();
    g.save(); bpPath(g, type, mask); g.clip();
    // hatch
    g.strokeStyle = C.bpHatch; g.lineWidth = 0.8;
    g.beginPath();
    for (var x = -44; x < 40; x += 4) { g.moveTo(x, 34); g.lineTo(x + 46, -12); }
    g.stroke();
    // frame fill (construction progress) from bottom up
    if (p > 0) {
      var top = -RAISE, h = (32 - top) * p;
      g.beginPath(); g.rect(-2, 32 - h, 36, h);
      g.fillStyle = 'rgba(176,138,88,0.88)'; g.fill();
      g.strokeStyle = 'rgba(90,62,34,0.8)'; g.lineWidth = 0.9;
      g.beginPath();
      for (var y = 32; y > 32 - h; y -= 5) { g.moveTo(-2, y); g.lineTo(34, y); }
      for (x = 2; x < 32; x += 7) { g.moveTo(x, 32); g.lineTo(x, 32 - h); }
      g.stroke();
    }
    g.restore();
    bpPath(g, type, mask);
    g.strokeStyle = C.bpLine; g.lineWidth = 1.3; g.stroke();
    if (type === 'door_wood') { line(g, 16, 2, 16, 30, C.bpLine, 1); }
    if (type === 'bed') { g.beginPath(); g.rect(9, 3.5, 14, 5); g.strokeStyle = C.bpLine; g.lineWidth = 1; g.stroke(); }
    if (p > 0 && p < 1) {
      g.fillStyle = 'rgba(10,12,18,0.75)'; g.fillRect(4, 27.5, 24, 3.2);
      g.fillStyle = '#f0cb6a'; g.fillRect(4.6, 28.1, 22.8 * p, 2);
    }
  }

  // ---------------------------------------------------------------- icons
  var iconCache = {}, portraitCache = {};
  var ICON_PX = 72;
  function fit(g, s, tx, ty, fn) { g.save(); g.translate(tx, ty); g.scale(s, s); fn(); g.restore(); }
  function paintAxe(g) {
    limb(g, 8, 27, 21, 7, 2.4, '#7a5a38');
    poly(g, [17.5, 5.5, 24.5, 2.5, 28.5, 9.5, 24, 13.5, 19.5, 10]); fs(g, '#c8c6bc', 1.5);
    line(g, 25, 3.8, 28, 9.4, '#f2f0e8', 1);
  }
  function paintPick(g) {
    limb(g, 8, 27, 21.5, 8, 2.4, '#7a5a38');
    g.beginPath(); g.moveTo(9.5, 8.5); g.quadraticCurveTo(19, 1.5, 28.5, 11.5);
    g.strokeStyle = C.out; g.lineWidth = 3.4 + LW * 2; g.stroke(); g.strokeStyle = '#b8b6ac'; g.lineWidth = 3.4; g.stroke();
  }
  function paintSickle(g) {
    limb(g, 7, 28, 12.5, 20.5, 2.6, '#7a5a38');
    g.beginPath(); g.arc(17.5, 13, 8.5, 2.45, -0.55, false);
    g.strokeStyle = C.out; g.lineWidth = 3 + LW * 2; g.stroke(); g.strokeStyle = '#c8c6bc'; g.lineWidth = 3; g.stroke();
    circ(g, 25, 23, 2.4); fs(g, C.berry, 1.2); circ(g, 21.5, 25.5, 2.1); fs(g, C.berry, 1.2);
  }
  function paintHammer(g) {
    limb(g, 9, 27, 19, 11, 2.4, '#7a5a38');
    g.save(); g.translate(20, 9.5); g.rotate(0.56);
    rr(g, -7, -3.2, 14, 6.4, 1.2); fs(g, '#8e8c84', 1.5);
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-6, -2.4, 12, 1.4);
    g.restore();
  }
  function paintRedX(g, x, y, r) {
    circ(g, x, y, r); fs(g, '#b8463a', 1.4);
    line(g, x - r * 0.45, y - r * 0.45, x + r * 0.45, y + r * 0.45, '#fff4dc', r * 0.28);
    line(g, x + r * 0.45, y - r * 0.45, x - r * 0.45, y + r * 0.45, '#fff4dc', r * 0.28);
  }
  function triangles(g, n) {
    var w = n === 1 ? 14 : n === 2 ? 11.5 : 9, total = w * n, x = 16 - total / 2;
    for (var i = 0; i < n; i++) { poly(g, [x + i * w, 7, x + i * w + w, 16, x + i * w, 25]); fs(g, '#e8dcc0', 1.7); }
  }
  function zoneSquare(g, fillC, lineC) {
    g.fillStyle = fillC; g.fillRect(4, 4, 24, 24);
    g.save(); g.setLineDash([3.4, 2.2]); g.strokeStyle = C.out; g.lineWidth = 3.4; g.strokeRect(4, 4, 24, 24);
    g.strokeStyle = lineC; g.lineWidth = 1.8; g.strokeRect(4, 4, 24, 24); g.restore();
  }
  function paintShield(g, col) {
    g.beginPath(); g.moveTo(16, 3.5); g.lineTo(27, 7.5); g.quadraticCurveTo(27, 21, 16, 29); g.quadraticCurveTo(5, 21, 5, 7.5); g.closePath();
    fs(g, col, 1.8);
    g.save(); g.clip(); g.fillStyle = 'rgba(255,250,235,0.2)'; g.fillRect(5, 3, 11, 26); g.restore();
  }
  var ICONS = {
    food: function (g) { paintItem(g, 'food', 15.5, 17, 2.3, true); },
    berries: function (g) { paintItem(g, 'berries', 15.5, 17.5, 2.4, true); },
    rice: function (g) { paintItem(g, 'rice', 16, 17.5, 2.3, true); },
    meal: function (g) { paintItem(g, 'meal', 16, 18, 2.35, true); },
    wood: function (g) { paintItem(g, 'wood', 16, 17, 2.25, true); },
    stone: function (g) { paintItem(g, 'stone', 16, 16.5, 2.4, true); },
    pop: function (g) {
      var L = LOOKS[0];
      fit(g, 1.12, 15, 31, function () { torso(g, L, 0, -3); headAt(g, L, 0.4, -17.2, 7.4, 'ok', false, 0); });
    },
    wanderer: function (g) {
      var L = LOOKS[3];
      fit(g, 1.0, 13, 31, function () { torso(g, L, 0, -3); headAt(g, L, 0.4, -17.2, 7.4, 'ok', false, 3); });
      circ(g, 24.5, 9, 5.5); fs(g, '#6a9a4a', 1.4);
      line(g, 24.5, 6, 24.5, 12, '#fff4dc', 1.8); line(g, 21.5, 9, 27.5, 9, '#fff4dc', 1.8);
    },
    day: function (g) {
      g.save(); g.translate(16, 16);
      for (var i = 0; i < 8; i++) { g.rotate(TAU / 8); poly(g, [-2.2, -9, 2.2, -9, 0, -14.5]); fs(g, '#e8a83a', 1.3); }
      circ(g, 0, 0, 8); fs(g, '#f0c85a', 1.6);
      g.fillStyle = 'rgba(255,250,220,0.5)'; ell(g, -2.5, -2.8, 3.2, 2); g.fill();
      g.restore();
    },
    morale: function (g) {
      g.beginPath();
      g.moveTo(16, 27.5);
      g.bezierCurveTo(4, 19, 2.5, 12, 5, 8.5); g.bezierCurveTo(8, 4, 14, 5, 16, 10);
      g.bezierCurveTo(18, 5, 24, 4, 27, 8.5); g.bezierCurveTo(29.5, 12, 28, 19, 16, 27.5);
      g.closePath(); fs(g, '#c9594e', 1.8);
      g.fillStyle = 'rgba(255,230,210,0.45)'; ell(g, 9.5, 11, 2.6, 1.7); g.fill();
    },
    speed: function (g) { triangles(g, 2); },
    play: function (g) { triangles(g, 1); },
    fast: function (g) { triangles(g, 2); },
    faster: function (g) { triangles(g, 3); },
    pause: function (g) { rr(g, 7, 6, 6.5, 20, 1.8); fs(g, '#e8dcc0', 1.8); rr(g, 18.5, 6, 6.5, 20, 1.8); fs(g, '#e8dcc0', 1.8); },
    architect: function (g) {
      fit(g, 0.62, 4, 14, function () { paintWall(g, 'stone', 2); });
      fit(g, 0.62, 23.8, 14, function () { paintWall(g, 'stone', 8); });
      fit(g, 0.8, 7, 1, function () { paintHammer(g); });
    },
    work: function (g) {
      rr(g, 6, 5, 20, 24, 2); fs(g, '#a8845a', 1.6);
      rr(g, 8.5, 8, 15, 19, 1); fs(g, '#e8dcc0', 1.1);
      rr(g, 12, 3, 8, 4.4, 1.2); fs(g, '#7a7a74', 1.2);
      for (var i = 0; i < 3; i++) {
        var y = 12 + i * 5;
        g.beginPath(); g.moveTo(10.5, y); g.lineTo(12, y + 1.6); g.lineTo(14.6, y - 1.6);
        g.strokeStyle = '#4f8a3a'; g.lineWidth = 1.5; g.stroke();
        line(g, 16.5, y, 21.5, y, '#8a7a60', 1.2);
      }
    },
    orders: function (g) {
      limb(g, 9, 29, 9, 4, 1.8, '#7a5a38');
      g.beginPath(); g.moveTo(10, 5); g.quadraticCurveTo(17, 2, 26, 7); g.lineTo(23, 11.5); g.lineTo(26, 16.5);
      g.quadraticCurveTo(17, 12, 10, 15.5); g.closePath(); fs(g, '#c9594e', 1.6);
      g.fillStyle = 'rgba(255,240,220,0.25)'; g.fillRect(11, 6, 6, 3);
    },
    zones: function (g) {
      zoneSquare(g, 'rgba(110,190,90,0.45)', '#b8e89a');
      g.fillStyle = 'rgba(110,150,210,0.55)'; g.fillRect(16, 16, 12, 12);
    },
    info: function (g) {
      circ(g, 16, 16, 12); fs(g, '#5a7890', 1.8);
      circ(g, 16, 9.6, 2.1); fill(g, '#f2ead6');
      rr(g, 14.2, 13.2, 3.6, 11, 1.2); fill(g, '#f2ead6');
    },
    menu: function (g) {
      for (var i = 0; i < 3; i++) { rr(g, 6, 7.5 + i * 7, 20, 3.6, 1.8); fs(g, '#e8dcc0', 1.4); }
    },
    wall_wood: function (g) { fit(g, 0.72, 4.5, 11.5, function () { paintWall(g, 'wood', 0); }); },
    wall_stone: function (g) { fit(g, 0.72, 4.5, 11.5, function () { paintWall(g, 'stone', 0); }); },
    door_wood: function (g) { fit(g, 0.72, 4.5, 11.5, function () { paintDoor(g, 'wood', 0.35, false); }); },
    bed: function (g) { fit(g, 0.92, 1.3, 2, function () { paintBed(g, 0); }); },
    turret: function (g) { fit(g, 0.95, 0.5, 0, function () { paintTurretBase(g); drawTurretHead(g, -0.3); }); },
    campfire: function (g) { fit(g, 1.05, -1, -4, function () { paintCampfireBase(g); drawFlames(g, 0, 16, 23, 1); }); },
    torch: function (g) { fit(g, 0.8, 3, 7, function () { paintTorchBase(g); drawFlames(g, 300, 16, 3.5, 0.6); }); },
    chop: function (g) { paintAxe(g); },
    mine: function (g) { paintPick(g); },
    harvest: function (g) { paintSickle(g); },
    deconstruct: function (g) { paintHammer(g); paintRedX(g, 23, 23, 6); },
    cancel: function (g) { paintRedX(g, 16, 16, 12); },
    zone_grow: function (g) {
      zoneSquare(g, 'rgba(110,190,90,0.45)', '#b8e89a');
      fit(g, 0.7, 4.8, 1, function () { paintCrop(g, 'rice', 2); });
    },
    zone_stockpile: function (g) {
      zoneSquare(g, 'rgba(110,150,210,0.5)', '#b8d4f2');
      rr(g, 10, 11, 12, 11, 1); fs(g, C.plank, 1.4);
      line(g, 10, 16.5, 22, 16.5, C.plankLo, 1); line(g, 16, 11, 16, 22, C.plankLo, 1);
    },
    zone_remove: function (g) { zoneSquare(g, 'rgba(160,150,140,0.3)', '#d8d0c4'); paintRedX(g, 22, 22, 6.5); },
    draft: function (g) {
      paintShield(g, '#c87a34');
      line(g, 10.5, 11, 21.5, 22, C.out, 4.4); line(g, 10.5, 11, 21.5, 22, '#e8e4da', 2.2);
      line(g, 21.5, 11, 10.5, 22, C.out, 4.4); line(g, 21.5, 11, 10.5, 22, '#e8e4da', 2.2);
    },
    undraft: function (g) {
      paintShield(g, '#6e6a62');
      line(g, 7, 26, 25, 6, C.out, 4.6); line(g, 7, 26, 25, 6, '#e0644e', 2.4);
    },
    raid: function (g) {
      function sword(x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
        var gx = x1 + ux * 6, gy = y1 + uy * 6;
        limb(g, gx, gy, x2, y2, 3, '#cfccc2');
        limb(g, gx - uy * 4, gy + ux * 4, gx + uy * 4, gy - ux * 4, 1.6, '#c9a24a');
        limb(g, x1, y1, gx, gy, 2.2, '#6e4a2e');
      }
      sword(5, 27, 26, 6); sword(27, 27, 6, 6);
    },
    boar: function (g) { fit(g, 1.05, 15, 27, function () { paintBoar(g, 0, 0, true); }); },
    storm: function (g) {
      g.beginPath();
      g.arc(10, 14, 5.5, Math.PI * 0.5, Math.PI * 1.5); g.arc(16, 9, 7, Math.PI, Math.PI * 1.95);
      g.arc(23.5, 13, 5.5, Math.PI * 1.4, Math.PI * 0.5); g.closePath();
      fs(g, '#7a8090', 1.8);
      g.fillStyle = 'rgba(255,255,255,0.22)'; ell(g, 13, 7.5, 3.5, 1.6); g.fill();
      poly(g, [16, 15, 11, 24, 15, 24, 12.5, 31, 21, 20, 16.5, 20, 19, 15]); fs(g, '#f0c85a', 1.4);
    },
    gift: function (g) {
      rr(g, 5, 13, 22, 15, 1.5); fs(g, '#a8432f', 1.8);
      rr(g, 3.5, 9.5, 25, 5, 1.2); fs(g, '#c0533c', 1.6);
      g.fillStyle = '#e8bf58'; g.fillRect(14, 10, 4, 17.6);
      g.strokeStyle = C.out; g.lineWidth = 1; g.strokeRect(14, 10, 4, 17.6);
      g.beginPath(); g.ellipse(12, 7, 4, 2.6, 0.5, 0, TAU); fs(g, '#e8bf58', 1.4);
      g.beginPath(); g.ellipse(20, 7, 4, 2.6, -0.5, 0, TAU); fs(g, '#e8bf58', 1.4);
      circ(g, 16, 8.6, 1.8); fs(g, '#d0a440', 1.2);
    },
    alert: function (g) {
      g.beginPath(); g.moveTo(16, 3.5); g.lineTo(29, 27.5); g.lineTo(3, 27.5); g.closePath();
      g.lineJoin = 'round'; fs(g, '#e8b84a', 1.8);
      rr(g, 14.3, 10, 3.4, 10.5, 1.5); fill(g, '#2a1e12');
      circ(g, 16, 23.6, 1.9); fill(g, '#2a1e12');
    },
    erase: function (g) {
      g.save(); g.translate(16, 16); g.rotate(-0.6);
      rr(g, -11, -6, 22, 12, 2.5); fs(g, '#d88a7a', 1.8);
      g.beginPath(); g.rect(-11, -6, 8, 12); g.fillStyle = '#5a7890'; g.fill();
      rr(g, -11, -6, 22, 12, 2.5); stroke(g, C.out, 1.8);
      g.fillStyle = 'rgba(255,245,230,0.35)'; g.fillRect(-2, -4.5, 11, 2);
      g.restore();
      g.save(); g.setLineDash([2.4, 2]); line(g, 5, 29, 28, 29, '#e8dcc0', 1.6); g.restore();
    },
    rescue: function (g) {
      limb(g, 4, 21, 28, 21, 1.6, '#7a5a38'); limb(g, 4, 27, 28, 27, 1.6, '#7a5a38');
      rr(g, 7, 19.5, 18, 9, 1.5); fs(g, '#e8e0cc', 1.4);
      circ(g, 11, 17, 4); fs(g, LOOKS[0].skin, 1.4);
      g.beginPath(); g.arc(11, 17, 4.4, Math.PI, 0); g.closePath(); fs(g, LOOKS[0].hair, 1.2);
      circ(g, 23, 9, 6.5); fs(g, '#f2ece0', 1.6);
      g.fillStyle = '#c84a3a'; g.fillRect(21.6, 5, 2.8, 8); g.fillRect(19, 7.6, 8, 2.8);
    },
    medicine: function (g) {
      rr(g, 5, 9, 22, 18, 2.5); fs(g, '#f2ece0', 1.8);
      rr(g, 11.5, 5, 9, 5, 1.5); fs(g, '#9a968c', 1.4);
      g.fillStyle = '#c84a3a'; g.fillRect(14.2, 12.5, 3.6, 11); g.fillRect(10.5, 16.2, 11, 3.6);
      g.fillStyle = 'rgba(20,14,8,0.15)'; g.fillRect(5.8, 23, 20.4, 3.2);
    },
    tutorial: function (g) {
      g.beginPath(); g.arc(16, 13, 8.5, Math.PI * 0.8, Math.PI * 2.2); g.lineTo(19.5, 22); g.lineTo(12.5, 22); g.closePath();
      fs(g, '#f0cb6a', 1.8);
      g.fillStyle = 'rgba(255,250,225,0.6)'; ell(g, 12.5, 9.5, 2.4, 1.6); g.fill();
      rr(g, 12.2, 22, 7.6, 3, 1); fs(g, '#9a968c', 1.3); rr(g, 13, 25, 6, 2.6, 1); fs(g, '#7a766c', 1.3);
      line(g, 16, 13, 16, 20, '#a87a2a', 1);
    },
    focus: function (g) {
      g.strokeStyle = C.out; g.lineWidth = 5;
      function br() {
        g.beginPath();
        g.moveTo(4, 11); g.lineTo(4, 4); g.lineTo(11, 4); g.moveTo(21, 4); g.lineTo(28, 4); g.lineTo(28, 11);
        g.moveTo(28, 21); g.lineTo(28, 28); g.lineTo(21, 28); g.moveTo(11, 28); g.lineTo(4, 28); g.lineTo(4, 21); g.stroke();
      }
      br(); g.strokeStyle = '#e8dcc0'; g.lineWidth = 2.4; br();
      circ(g, 16, 16, 4); fs(g, '#f0cb6a', 1.5);
    },
    hunt: function (g) { paintCrosshair(g); },
    close: function (g) {
      line(g, 8, 8, 24, 24, C.out, 6); line(g, 24, 8, 8, 24, C.out, 6);
      line(g, 8, 8, 24, 24, '#e8dcc0', 3); line(g, 24, 8, 8, 24, '#e8dcc0', 3);
    }
  };
  function makeIcon(name) {
    var c = mk(ICON_PX, ICON_PX), g = c.getContext('2d');
    g.scale(ICON_PX / 32, ICON_PX / 32);
    g.lineJoin = 'round'; g.lineCap = 'round';
    var f = ICONS[name];
    try { if (f) f(g); else { circ(g, 16, 16, 9); fs(g, '#8a7a60'); } } catch (e) { /* draw nothing */ }
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
  }
  function makePortrait(look) {
    var P = 96, c = mk(P, P), g = c.getContext('2d');
    g.scale(P / 32, P / 32); g.lineJoin = 'round'; g.lineCap = 'round';
    var L = LOOKS[look];
    fit(g, 1.25, 15.5, 41, function () { torso(g, L, 0, -3); headAt(g, L, 0.4, -17.2, 7.4, 'ok', false, look); });
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
  }

  // designation badge (cached sprite)
  function paintCrosshair(g) {
    circ(g, 16, 16, 9); g.strokeStyle = C.out; g.lineWidth = 4.4; g.stroke(); g.strokeStyle = '#e0644e'; g.lineWidth = 2.2; g.stroke();
    [[16, 3, 16, 10], [16, 22, 16, 29], [3, 16, 10, 16], [22, 16, 29, 16]].forEach(function (l) { line(g, l[0], l[1], l[2], l[3], C.out, 4.4); line(g, l[0], l[1], l[2], l[3], '#e0644e', 2.2); });
    circ(g, 16, 16, 1.6); fill(g, '#e0644e');
  }
  var DESIG = { chop: paintAxe, mine: paintPick, harvest: paintSickle, hunt: paintCrosshair, deconstruct: function (g) { paintHammer(g); paintRedX(g, 23, 23, 6); } };
  function paintDesignation(g, kind) {
    circ(g, 16, 16, 14.5); g.fillStyle = 'rgba(14,12,10,0.7)'; g.fill();
    g.strokeStyle = 'rgba(244,239,226,0.9)'; g.lineWidth = 1.8; g.stroke();
    fit(g, 0.74, 4.2, 4.2, function () { (DESIG[kind] || paintAxe)(g); });
  }

  // ---------------------------------------------------------------- sky
  var vig = { w: 0, h: 0, c: null };
  function vignette(w, h) {
    if (vig.w !== w || vig.h !== h || !vig.c) {
      var c = mk(Math.max(1, w / 2), Math.max(1, h / 2)), g = c.getContext('2d');
      var cw = c.width, ch = c.height;
      var gr = g.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.25, cw / 2, ch / 2, Math.max(cw, ch) * 0.72);
      gr.addColorStop(0, 'rgba(6,8,20,0)'); gr.addColorStop(1, 'rgba(6,8,20,0.85)');
      g.fillStyle = gr; g.fillRect(0, 0, cw, ch);
      vig = { w: w, h: h, c: c };
    }
    return vig.c;
  }

  var darkL = { c: null, g: null, w: 0, h: 0 };
  function darkLayer(w, h) {
    var cw = Math.max(1, Math.ceil(w / 2)), ch = Math.max(1, Math.ceil(h / 2));
    if (!darkL.c || darkL.w !== cw || darkL.h !== ch) { darkL.c = mk(cw, ch); darkL.g = darkL.c.getContext('2d'); darkL.w = cw; darkL.h = ch; }
    return darkL;
  }
  // ---------------------------------------------------------------- hostile rim
  // draws a figure into a scratch canvas, then stamps a red silhouette around it so enemies read at night
  var rimA = null, rimB = null;
  function scratch(o, w, h) {
    if (!o || o.c.width < w || o.c.height < h) {
      var c = mk(Math.max(w, o ? o.c.width : 0), Math.max(h, o ? o.c.height : 0));
      o = { c: c, g: c.getContext('2d') };
    }
    return o;
  }
  function drawWithRim(ctx, px, py, size, fn) {
    var ds = devScale(ctx), ox = 0.45 * size, oy = 0.7 * size, bw = size * 1.9, bh = size * 1.75;
    var W = Math.ceil(bw * ds), H = Math.ceil(bh * ds);
    if (W > 1024 || H > 1024 || W < 4) { fn(ctx); return; }
    rimA = scratch(rimA, W, H); rimB = scratch(rimB, W, H);
    var a = rimA.g, b = rimB.g;
    a.setTransform(1, 0, 0, 1, 0, 0); a.clearRect(0, 0, W + 2, H + 2);
    a.setTransform(ds, 0, 0, ds, (ox - px) * ds, (oy - py) * ds);
    fn(a);
    b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.clearRect(0, 0, W + 2, H + 2);
    b.drawImage(rimA.c, 0, 0, W, H, 0, 0, W, H);
    b.globalCompositeOperation = 'source-in'; b.fillStyle = '#ff5038'; b.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'source-over';
    var k = Math.max(1.2, Math.min(2.4, size * 0.05)), dx = px - ox, dy = py - oy, sw = W / ds, sh = H / ds;
    var offs = [[k, 0], [-k, 0], [0, k], [0, -k], [k * 0.7, k * 0.7], [-k * 0.7, k * 0.7], [k * 0.7, -k * 0.7], [-k * 0.7, -k * 0.7]];
    for (var i = 0; i < offs.length; i++) ctx.drawImage(rimB.c, 0, 0, W, H, dx + offs[i][0], dy + offs[i][1], sw, sh);
    ctx.drawImage(rimA.c, 0, 0, W, H, dx, dy, sw, sh);
  }

  function stateOf(s) { return s || 'idle'; }

  // ---------------------------------------------------------------- public API
  var OBJ_SPEC = {
    tree: { over: OVER.tree }, rock: { over: OVER.rock }, bush: { over: OVER.bush }, bush_empty: { over: OVER.bush_empty },
    campfire: { over: OVER.campfire }, bed: { over: OVER.bed }, turret: { over: OVER.turret }, torch: { over: OVER.torch }
  };
  var WALL_SPEC = { over: RAISE / 32, padR: 0.12, padB: 0.12 };
  var MTN_SPEC = { over: MRAISE / 32, padR: 0.12, padB: 0.12 };
  var CROP_SPEC = { over: OVER.crop };
  var ITEM_SPEC = { over: OVER.item };
  var DESIG_SPEC = { over: 0 };

  var Art = {
    palette: PALETTE,
    overflow: OVER,
    looks: LOOKS.length,

    init: function (size) {
      var s = size && isFinite(size) && size > 0 ? size : 32;
      var b = bucketOf(s * getDpr());
      var cache = bucketCache(b);
      var kinds = ['grass', 'soil', 'rich', 'sand', 'gravel'];
      for (var k = 0; k < kinds.length; k++) for (var v = 0; v < 4; v++) {
        var key = 'g_' + kinds[k] + v;
        if (!cache[key]) cache[key] = renderSprite(b, { over: 0 }, paintGround, kinds[k], v);
      }
    },

    drawGround: function (ctx, kind, px, py, size, variant) {
      var v = ((variant | 0) % 4 + 4) % 4, k = GROUND[kind] ? kind : 'grass';
      var b = bucketOf(size * devScale(ctx));
      var cache = bucketCache(b), key = 'g_' + k + v, c = cache[key];
      if (!c) c = cache[key] = renderSprite(b, { over: 0 }, paintGround, k, v);
      ctx.drawImage(c, px, py, size, size);
    },

    drawMountain: function (ctx, px, py, size, mask, variant) {
      var m = (mask | 0) & 15, v = ((variant | 0) % 4 + 4) % 4;
      drawSprite(ctx, 'm' + m + '_' + v, px, py, size, MTN_SPEC, paintMountain, m, v);
    },

    drawObject: function (ctx, type, px, py, size, time, opts) {
      opts = opts || {};
      var spec = OBJ_SPEC[type];
      if (!spec) return;
      var t = time || 0;
      var v = typeof opts.variant === 'number' ? (opts.variant & 1) : (hash2(Math.round(px / size), Math.round(py / size)) < 0.5 ? 0 : 1);
      switch (type) {
        case 'tree':
          drawSprite(ctx, 'tree_b', px, py, size, spec, paintTreeBase);
          var sw = Math.sin(t / 1100 + px * 0.13 + py * 0.07) * size * 0.012;
          drawSprite(ctx, 'tree_c' + v, px + sw, py, size, spec, paintTreeCanopy, v);
          return;
        case 'rock': drawSprite(ctx, 'rock' + v, px, py, size, spec, paintRock, v); return;
        case 'bush': drawSprite(ctx, 'bush', px, py, size, spec, paintBush, false); return;
        case 'bush_empty': drawSprite(ctx, 'bush_e', px, py, size, spec, paintBush, true); return;
        case 'bed':
          var d = ((opts.dir | 0) % 4 + 4) % 4;
          drawSprite(ctx, 'bed' + d, px, py, size, spec, paintBed, d); return;
        case 'campfire':
          drawSprite(ctx, 'campfire', px, py, size, spec, paintCampfireBase);
          tileSpace(ctx, px, py, size); drawCampfireLive(ctx, t); ctx.restore(); return;
        case 'torch':
          drawSprite(ctx, 'torch', px, py, size, spec, paintTorchBase);
          tileSpace(ctx, px, py, size); drawTorchLive(ctx, t); ctx.restore(); return;
        case 'turret':
          drawSprite(ctx, 'turret', px, py, size, spec, paintTurretBase);
          var ang = typeof opts.angle === 'number' ? opts.angle : (opts.dir === -1 ? Math.PI : 0) + Math.sin(t / 1600 + px * 0.01) * 0.7;
          tileSpace(ctx, px, py, size); drawTurretHead(ctx, ang); ctx.restore(); return;
      }
    },

    drawWall: function (ctx, material, px, py, size, mask) {
      var m = (mask | 0) & 15, mat = material === 'stone' ? 'stone' : 'wood';
      drawSprite(ctx, 'w' + mat + m, px, py, size, WALL_SPEC, paintWall, mat, m);
    },

    drawDoor: function (ctx, material, px, py, size, open, vertical) {
      tileSpace(ctx, px, py, size);
      paintDoor(ctx, material === 'stone' ? 'stone' : 'wood', open || 0, !!vertical);
      ctx.restore();
    },

    drawCrop: function (ctx, kind, px, py, size, growth, time) {
      var k = kind === 'berry' ? 'berry' : 'rice';
      var gr = clamp(growth || 0, 0, 1), stage = gr >= 1 ? 4 : Math.min(3, Math.floor(gr * 4));
      var sw = stage > 1 ? Math.sin((time || 0) / 900 + px * 0.05 + py * 0.03) * size * 0.01 : 0;
      drawSprite(ctx, 'crop_' + k + stage, px + sw, py, size, CROP_SPEC, paintCrop, k, stage);
    },

    drawZone: function (ctx, kind, px, py, size, mask) {
      var m = mask | 0, grow = kind === 'grow';
      ctx.save();
      ctx.fillStyle = grow ? 'rgba(120,200,90,0.20)' : 'rgba(120,160,220,0.20)';
      ctx.fillRect(px, py, size, size);
      var lw = Math.max(1, size * 0.06), h = lw / 2;
      ctx.strokeStyle = grow ? 'rgba(170,240,130,0.85)' : 'rgba(170,205,250,0.85)';
      ctx.lineWidth = lw; ctx.lineCap = 'butt';
      ctx.beginPath();
      if (!(m & 1)) { ctx.moveTo(px, py + h); ctx.lineTo(px + size, py + h); }
      if (!(m & 2)) { ctx.moveTo(px + size - h, py); ctx.lineTo(px + size - h, py + size); }
      if (!(m & 4)) { ctx.moveTo(px, py + size - h); ctx.lineTo(px + size, py + size - h); }
      if (!(m & 8)) { ctx.moveTo(px + h, py); ctx.lineTo(px + h, py + size); }
      ctx.stroke();
      ctx.restore();
    },

    drawItem: function (ctx, kind, px, py, size, count) {
      var k = kind === 'food' ? 'berries' : (kind || 'wood'), n = count == null ? 1 : count | 0;
      var big = n >= 20;
      drawSprite(ctx, 'it_' + k + (big ? 'B' : 's'), px, py, size, ITEM_SPEC, paintStack, k, big);
      if (n > 1 && size >= 14) {
        var fsz = Math.max(7, size * 0.3);
        ctx.save();
        ctx.font = '700 ' + fsz.toFixed(1) + 'px system-ui, "Noto Sans Thai", sans-serif';
        ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(2, fsz * 0.3); ctx.strokeStyle = 'rgba(14,10,6,0.9)';
        var tx = px + size - size * 0.05, ty = py + size - size * 0.04;
        ctx.strokeText(String(n), tx, ty);
        ctx.fillStyle = '#f4efe2'; ctx.fillText(String(n), tx, ty);
        ctx.restore();
      }
    },

    drawBlueprint: function (ctx, type, px, py, size, progress, mask) {
      tileSpace(ctx, px, py, size);
      drawBlueprintLive(ctx, type, progress, mask);
      ctx.restore();
    },

    drawDesignation: function (ctx, kind, px, py, size) {
      var s2 = size * 0.4;
      ctx.save(); ctx.globalAlpha = 0.78;
      drawSprite(ctx, 'des_' + kind, px + size - s2 - size * 0.03, py + size * 0.03, s2, DESIG_SPEC, paintDesignation, kind);
      ctx.restore();
    },

    drawColonist: function (ctx, c, px, py, size, time) {
      c = c || {};
      var t = time || 0, s = size / 32, dir = c.dir === -1 ? -1 : 1;
      var look = ((c.look | 0) % 8 + 8) % 8, L = LOOKS[look];
      var seed = look * 3 + (c.name ? c.name.length : 0);
      var st = stateOf(c.state);
      var carryLook = c.carryPawn == null || c.carryPawn === false ? null : c.carryPawn;
      ctx.save();
      ctx.translate(px + size / 2, py + size * 0.9);
      ctx.scale(s, s);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (c.selected) {
        var pulse = 0.65 + Math.sin(t / 220) * 0.25;
        ell(ctx, 0, 0.3, 12, 4.2);
        ctx.fillStyle = 'rgba(240,203,106,0.16)'; ctx.fill();
        ctx.strokeStyle = 'rgba(240,203,106,' + pulse.toFixed(2) + ')'; ctx.lineWidth = 1.6; ctx.stroke();
      }
      if (c.drafted && st !== 'dead') {
        ell(ctx, 0, 0.3, 10.2, 3.4); ctx.strokeStyle = 'rgba(232,144,58,0.85)'; ctx.lineWidth = 1.1; ctx.stroke();
      }
      // N/S aimed actions use front/back views and must not be mirrored oddly; keep dir flip for side views
      ctx.scale(dir, 1);
      if (st === 'sleep' || st === 'dead' || st === 'downed') {
        paintLying(ctx, L, t, seed, st, look);
        if (st === 'sleep') { ctx.scale(dir, 1); drawZs(ctx, t + seed * 300); }
      } else if (st === 'melee') {
        paintPawn(ctx, L, 'fight', t, seed, null, 'fist', look, !!c.drafted, null, c.aim, null);
        if (c.drafted) { ctx.scale(dir, 1); draftBadge(ctx); }
      } else {
        paintPawn(ctx, L, st, t, seed, c.carrying || null, null, look, !!c.drafted, c.work || null, c.aim, carryLook);
        if (c.drafted) { ctx.scale(dir, 1); draftBadge(ctx); }
      }
      ctx.restore();
    },

    drawEnemy: function (ctx, kind, px, py, size, time, dir, state) {
      var t = time || 0, d = dir === -1 ? -1 : 1, st = state || 'walk';
      function body(g) {
        g.save();
        g.translate(px + size / 2, py + size * 0.9);
        g.scale(size / 32, size / 32);
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.scale(d, 1);
        if (kind === 'boar') {
          if (st === 'dead' || st === 'downed') paintBoarLying(g, t, st === 'dead');
          else paintBoar(g, st === 'idle' ? t * 0.3 : (st === 'fight' || st === 'melee' ? t * 1.6 : t), 3);
        } else {
          if (st === 'dead' || st === 'downed' || st === 'sleep') paintLying(g, RAIDER, t, 5, st === 'sleep' ? 'downed' : st, 0);
          else if (st === 'shoot') paintPawn(g, RAIDER, 'shoot', t, 5, null, null, 0, false);
          else paintPawn(g, RAIDER, st === 'fight' || st === 'melee' ? 'fight' : (st === 'idle' ? 'idle' : 'walk'), t, 5, null, 'blade', 0, false);
        }
        g.restore();
      }
      ctx.save();
      ctx.translate(px + size / 2, py + size * 0.9); ctx.scale(size / 32, size / 32);
      if (st !== 'dead') hostileRing(ctx, t);
      ctx.restore();
      if (st === 'dead') { body(ctx); return; }
      drawWithRim(ctx, px, py, size, body);
    },

    drawProjectile: function (ctx, p) {
      if (!p) return;
      var dx = p.dx || 1, dy = p.dy || 0, l = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / l, uy = dy / l;
      ctx.save(); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x - ux * 9, p.y - uy * 9); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = 'rgba(255,190,90,0.35)'; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x - ux * 6, p.y - uy * 6); ctx.lineTo(p.x, p.y);
      ctx.strokeStyle = '#fff2c4'; ctx.lineWidth = 1.3; ctx.stroke();
      ctx.restore();
    },

    drawSelection: function (ctx, px, py, w, h) {
      var m = Math.min(w, h), L = Math.max(4, m * 0.26), lw = clamp(m * 0.055, 1.2, 3), p = lw * 0.6;
      var x0 = px - p, y0 = py - p, x1 = px + w + p, y1 = py + h + p;
      ctx.save(); ctx.lineCap = 'square'; ctx.lineJoin = 'miter';
      function br() {
        ctx.beginPath();
        ctx.moveTo(x0, y0 + L); ctx.lineTo(x0, y0); ctx.lineTo(x0 + L, y0);
        ctx.moveTo(x1 - L, y0); ctx.lineTo(x1, y0); ctx.lineTo(x1, y0 + L);
        ctx.moveTo(x1, y1 - L); ctx.lineTo(x1, y1); ctx.lineTo(x1 - L, y1);
        ctx.moveTo(x0 + L, y1); ctx.lineTo(x0, y1); ctx.lineTo(x0, y1 - L);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(14,10,6,0.75)'; ctx.lineWidth = lw * 2.2; br();
      ctx.strokeStyle = PALETTE.select; ctx.lineWidth = lw; br();
      ctx.restore();
    },

    drawDragRect: function (ctx, x, y, w, h, kind) {
      var col = { designate: [240, 220, 150], zone: [150, 230, 120], cancel: [235, 100, 80], build: [130, 190, 255] }[kind] || [240, 236, 226];
      var rgb = col.join(',');
      if (w < 0) { x += w; w = -w; }
      if (h < 0) { y += h; h = -h; }
      ctx.save();
      ctx.fillStyle = 'rgba(' + rgb + ',0.14)'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(14,10,6,0.6)'; ctx.lineWidth = 3.5; ctx.strokeRect(x, y, w, h);
      ctx.strokeStyle = 'rgba(' + rgb + ',0.95)'; ctx.lineWidth = 1.6; ctx.strokeRect(x, y, w, h);
      ctx.fillStyle = 'rgb(' + rgb + ')';
      [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(function (pt) { ctx.fillRect(pt[0] - 2.5, pt[1] - 2.5, 5, 5); });
      ctx.restore();
    },

    drawHighlight: function (ctx, px, py, size, kind) {
      tileSpace(ctx, px, py, size);
      if (kind === 'target') {
        ctx.strokeStyle = 'rgba(20,14,8,0.7)'; ctx.lineWidth = 3.6; brackets(ctx);
        ctx.strokeStyle = '#f0cb6a'; ctx.lineWidth = 1.8; brackets(ctx);
        circ(ctx, 16, 16, 3); ctx.strokeStyle = 'rgba(240,203,106,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
      } else if (kind === 'move') {
        ell(ctx, 16, 22, 9, 4); ctx.fillStyle = 'rgba(150,230,120,0.18)'; ctx.fill();
        ctx.strokeStyle = 'rgba(14,10,6,0.6)'; ctx.lineWidth = 3.2; ctx.stroke();
        ctx.strokeStyle = 'rgba(190,245,160,0.95)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(12, 9); ctx.lineTo(16, 15); ctx.lineTo(20, 9);
        ctx.strokeStyle = 'rgba(14,10,6,0.6)'; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = 'rgba(190,245,160,0.95)'; ctx.lineWidth = 2; ctx.stroke();
      } else {
        var ok = kind !== 'build-bad';
        rr(ctx, 1.5, 1.5, 29, 29, 3);
        ctx.fillStyle = ok ? 'rgba(150,210,110,0.28)' : 'rgba(224,90,70,0.32)'; ctx.fill();
        ctx.setLineDash([4, 2.5]);
        ctx.strokeStyle = ok ? 'rgba(190,240,150,0.95)' : 'rgba(255,130,110,0.95)'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.setLineDash([]);
        if (!ok) {
          ctx.beginPath(); ctx.moveTo(10, 10); ctx.lineTo(22, 22); ctx.moveTo(22, 10); ctx.lineTo(10, 22);
          ctx.strokeStyle = 'rgba(40,10,6,0.6)'; ctx.lineWidth = 4; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,140,120,0.95)'; ctx.lineWidth = 2; ctx.stroke();
        } else {
          ctx.beginPath(); ctx.moveTo(16, 11); ctx.lineTo(16, 21); ctx.moveTo(11, 16); ctx.lineTo(21, 16);
          ctx.strokeStyle = 'rgba(210,250,180,0.8)'; ctx.lineWidth = 1.6; ctx.stroke();
        }
      }
      ctx.restore();
      function brackets(g) {
        g.beginPath();
        g.moveTo(2, 9); g.lineTo(2, 2); g.lineTo(9, 2);
        g.moveTo(23, 2); g.lineTo(30, 2); g.lineTo(30, 9);
        g.moveTo(30, 23); g.lineTo(30, 30); g.lineTo(23, 30);
        g.moveTo(9, 30); g.lineTo(2, 30); g.lineTo(2, 23);
        g.stroke();
      }
    },

    drawParticle: function (ctx, p) {
      if (!p) return;
      var max = p.maxLife || 1, k = clamp((p.life || 0) / max, 0, 1), age = 1 - k;
      var x = p.x, y = p.y;
      ctx.save();
      switch (p.kind) {
        case 'dust':
          ctx.globalAlpha = 0.45 * k; ctx.fillStyle = '#b8a47a';
          circ(ctx, x, y, 1.5 + age * 3); ctx.fill(); break;
        case 'chip':
          ctx.globalAlpha = Math.min(1, k * 1.5);
          ctx.translate(x, y); ctx.rotate(age * 8);
          ctx.fillStyle = C.out; ctx.fillRect(-1.6, -1.2, 3.2, 2.4);
          ctx.fillStyle = (p.x * 7 | 0) % 2 ? '#a29d90' : '#a07a4a'; ctx.fillRect(-1.1, -0.7, 2.2, 1.4); break;
        case 'leaf':
          ctx.globalAlpha = Math.min(1, k * 1.4);
          ctx.translate(x + Math.sin(age * 9) * 2, y); ctx.rotate(Math.sin(age * 7) * 1.2);
          ell(ctx, 0, 0, 2.4, 1.2); ctx.fillStyle = C.leafHi; ctx.fill();
          ctx.strokeStyle = 'rgba(29,24,19,0.7)'; ctx.lineWidth = 0.6; ctx.stroke(); break;
        case 'spark':
          ctx.globalAlpha = k;
          ctx.fillStyle = 'rgba(255,170,60,0.35)'; circ(ctx, x, y, 2.6); ctx.fill();
          ctx.fillStyle = '#ffe9a0'; ctx.fillRect(x - 0.8, y - 0.8, 1.6, 1.6); break;
        case 'smoke':
          ctx.globalAlpha = 0.3 * k;
          ctx.fillStyle = '#8a8680'; circ(ctx, x, y, 2 + age * 5); ctx.fill(); break;
        case 'rain':
          ctx.globalAlpha = 0.6 * Math.min(1, k * 2);
          ctx.strokeStyle = '#b8c8dc'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 7); ctx.stroke(); break;
        case 'blood':
          ctx.globalAlpha = Math.min(1, k * 1.6);
          if (age < 0.6) { ctx.fillStyle = '#8e1f1a'; circ(ctx, x, y, 1.3); ctx.fill(); }
          else { ctx.fillStyle = 'rgba(110,24,20,0.8)'; ell(ctx, x, y, 2.4, 1.1); ctx.fill(); }
          break;
        default:
          ctx.globalAlpha = k; ctx.fillStyle = '#ddd'; ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      ctx.restore();
    },

    drawSky: function (ctx, w, h, phase, weather, time, lights) {
      var ph = frac(phase || 0), t = time || 0;
      var d = Math.cos((ph - 0.25) * TAU);
      var night = smooth((0.12 - d) / 0.7);
      var warm = clamp(1 - Math.abs(d + 0.05) / 0.42, 0, 1);
      var storm = weather === 'storm';
      ctx.save();
      if (warm > 0.01) {
        var dawn = ph > 0.75 || ph < 0.25;
        var gr = ctx.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, dawn ? 'rgba(255,170,120,' + (0.3 * warm) + ')' : 'rgba(255,128,60,' + (0.34 * warm) + ')');
        gr.addColorStop(1, dawn ? 'rgba(255,214,150,' + (0.12 * warm) + ')' : 'rgba(190,80,70,' + (0.18 * warm) + ')');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
      }
      // mild blue mood tint at night (keeps units readable)
      if (night > 0.01) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = 'rgb(' + Math.round(lerp(255, 196, night)) + ',' + Math.round(lerp(255, 206, night)) + ',' + Math.round(lerp(255, 238, night)) + ')';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
      }
      // darkness layer (night + storm gloom) on a cached half-res canvas, lights cut out of it
      var dA = night * 0.42 + (storm ? 0.24 * (1 - night * 0.4) : 0);
      var L = lights && lights.length ? lights : null;
      if (dA > 0.01) {
        var D = darkLayer(w, h), g = D.g, sxk = D.w / w, syk = D.h / h;
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
        g.clearRect(0, 0, D.w, D.h);
        g.fillStyle = night > 0.3 ? 'rgba(8,14,40,' + dA.toFixed(3) + ')' : 'rgba(26,32,44,' + dA.toFixed(3) + ')';
        g.fillRect(0, 0, D.w, D.h);
        if (night > 0.01) { g.globalAlpha = night * 0.5; g.drawImage(vignette(w, h), 0, 0, D.w, D.h); g.globalAlpha = 1; }
        if (L) {
          g.globalCompositeOperation = 'destination-out';
          g.setTransform(sxk, 0, 0, syk, 0, 0);
          for (var i = 0; i < L.length && i < 32; i++) {
            var li = L[i], r = (li.r || 100) * (1 + Math.sin(t / 110 + i * 1.7) * 0.025);
            var rg = g.createRadialGradient(li.x, li.y, 0, li.x, li.y, r);
            rg.addColorStop(0, 'rgba(0,0,0,1)'); rg.addColorStop(0.45, 'rgba(0,0,0,0.85)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = rg; g.fillRect(li.x - r, li.y - r, r * 2, r * 2);
          }
          g.globalCompositeOperation = 'source-over'; g.setTransform(1, 0, 0, 1, 0, 0);
        }
        ctx.drawImage(D.c, 0, 0, D.w, D.h, 0, 0, w, h);
        // warm glow around lights
        if (L) {
          var ga = Math.min(1, dA * 1.6);
          for (var j = 0; j < L.length && j < 32; j++) {
            var lj = L[j], r2 = (lj.r || 100) * 0.75 * (1 + Math.sin(t / 95 + j) * 0.04);
            var wg = ctx.createRadialGradient(lj.x, lj.y, 0, lj.x, lj.y, r2);
            wg.addColorStop(0, 'rgba(255,170,80,' + (0.22 * ga).toFixed(3) + ')'); wg.addColorStop(1, 'rgba(255,140,50,0)');
            ctx.fillStyle = wg; ctx.fillRect(lj.x - r2, lj.y - r2, r2 * 2, r2 * 2);
          }
        }
      }
      if (night > 0.5 && !storm) {
        var fa = (night - 0.5) * 2;
        for (var k = 0; k < 12; k++) {
          var fx = frac(Math.sin(k * 91.7) * 43758.5 + t / (40000 + k * 3000)) * w;
          var fy = frac(Math.sin(k * 57.3) * 23421.6) * h + Math.sin(t / 900 + k) * 12;
          var tw = 0.5 + 0.5 * Math.sin(t / (380 + k * 40) + k);
          ctx.globalAlpha = fa * tw * 0.9;
          ctx.fillStyle = 'rgba(230,240,140,0.25)'; circ(ctx, fx, fy, 3.2); ctx.fill();
          ctx.fillStyle = '#f4f7b0'; ctx.fillRect(fx - 0.8, fy - 0.8, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
      }
      if (storm) {
        var n = Math.round(clamp(w * h / 2600, 40, 220));
        ctx.strokeStyle = 'rgba(190,206,226,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (var q = 0; q < n; q++) {
          var sp = 0.55 + frac(q * 0.618) * 0.35;
          var rx = frac(q * 0.7548 + 0.13) * (w + 40) - t * 0.08 * sp;
          var ry = frac(q * 0.5698 + 0.71) * (h + 30) + t * 0.7 * sp;
          rx = ((rx % (w + 40)) + (w + 40)) % (w + 40) - 20; ry = (ry % (h + 30)) - 15;
          ctx.moveTo(rx, ry); ctx.lineTo(rx - 3.5, ry + 12);
        }
        ctx.stroke();
        var cyc = Math.floor(t / 4200), lt = t - cyc * 4200;
        if (hash2(cyc, 17) < 0.4 && (lt < 90 || (lt > 170 && lt < 230))) {
          ctx.fillStyle = 'rgba(230,236,255,' + (lt < 90 ? 0.38 : 0.22) + ')'; ctx.fillRect(0, 0, w, h);
        }
      }
      ctx.restore();
    },

    icon: function (name) {
      if (!(name in iconCache)) iconCache[name] = makeIcon(name);
      return iconCache[name];
    },

    portrait: function (look) {
      var l = ((look | 0) % 8 + 8) % 8;
      if (!(l in portraitCache)) portraitCache[l] = makePortrait(l);
      return portraitCache[l];
    }
  };

  window.Art = Art;
})();
