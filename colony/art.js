/* Mini Colony — art.js (visual agent)
 * Procedural Canvas 2D art in a RimWorld-like painted style:
 * muted earthy palette, thick dark outlines, flat shading with a lit top face
 * and darker front face, soft drop shadows cast down-right (light from top-left).
 * All painters work in a 32-unit tile space and are scaled to any tile size.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------- palette
  var C = {
    out: '#1d1813',           // thick outline
    shadow: 'rgba(18,14,8,0.34)',
    grass: ['#7b7c46', '#787a43', '#7e7e49', '#7a7944'],
    grassLo: '#6a6c3b', grassHi: '#8d8b55', grassBlade: '#5c6234',
    soil: '#7c6646', soilLo: '#5f4c34', soilHi: '#917a56',
    leaf: '#566f36', leafHi: '#6d8644', leafLo: '#3f5428', pine: '#3f5a36', pineHi: '#527046',
    bark: '#5b4430', barkLo: '#43311f', barkHi: '#77593c',
    stoneTop: '#a29d90', stoneHi: '#b7b2a4', stoneFront: '#757064', stoneLo: '#5a564c',
    berry: '#b8413e', berryHi: '#e07a68',
    plank: '#8f6c44', plankLo: '#6e5233', plankHi: '#a8845a',
    thatch: '#b59a5c', thatchLo: '#927a44', thatchHi: '#cdb574',
    roof: '#8e4b35', roofLo: '#6d3727',
    door: '#3a2a1c', windowLit: '#e8b65a',
    cloth: '#d9cdb3',
    flame: ['#fff1b8', '#ffc85a', '#f08a2e', '#c4481f'],
    hostile: '#d0503c'
  };

  var PALETTE = {
    text: '#efe4cf', textShadow: 'rgba(14,10,6,0.9)', good: '#9cc26a', bad: '#e0644e',
    warn: '#e8b84a', gold: '#f0cb6a', night: '#1c2340',
    // extras (optional for the game)
    panel: '#2a241d', panelLight: '#3a3228', muted: '#a8997f', hostile: C.hostile, outline: C.out
  };

  var LW = 1.6;     // outline width in tile units (32 units = 1 tile)
  var TAU = Math.PI * 2;

  // Overflow above the tile top, in tiles, for each object sprite.
  var OVER = { tree: 0.85, rock: 0.15, bush: 0.1, bush_empty: 0.05, hut: 0.3, tower: 0.95, farm: 0.05, campfire: 0.15 };

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
  function mk(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function getDpr() { return clamp(Math.round((window.devicePixelRatio || 1) * 4) / 4, 1, 3); }
  function hex2rgb(h) { var n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) {
    var x = hex2rgb(a), y = hex2rgb(b);
    var r = Math.round(lerp(x[0], y[0], t)), g = Math.round(lerp(x[1], y[1], t)), bl = Math.round(lerp(x[2], y[2], t));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  function dark(c, t) { return mix(c, '#1a140e', t); }
  function light(c, t) { return mix(c, '#fff4dc', t); }

  function ell(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU); }
  function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, Math.max(0.01, r), 0, TAU); }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
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
  // smooth lumpy blob through jittered points
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
  // a thick outlined stroke ("limb")
  function limb(g, x1, y1, x2, y2, w, col) {
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
    g.strokeStyle = C.out; g.lineWidth = w + LW * 2; g.stroke();
    g.strokeStyle = col; g.lineWidth = w; g.stroke();
  }
  // soft drop shadow blob (light from top-left => shadow down-right)
  function shadowBlob(g, x, y, rx, ry, a) {
    g.save();
    g.fillStyle = 'rgba(18,14,8,' + ((a || 0.3) * 0.55) + ')';
    ell(g, x, y, rx + 1.2, ry + 0.9); g.fill();
    g.fillStyle = 'rgba(18,14,8,' + (a || 0.3) + ')';
    ell(g, x, y, rx, ry); g.fill();
    g.restore();
  }

  // ---------------------------------------------------------------- caches
  var dpr = 1, curSize = 32, caches = {}, cacheOrder = [];
  function cacheFor(size) {
    var d = getDpr();
    if (d !== dpr) { dpr = d; caches = {}; cacheOrder = []; }
    var key = Math.round(size * 100);
    var c = caches[key];
    if (!c) {
      c = caches[key] = {};
      cacheOrder.push(key);
      if (cacheOrder.length > 3) delete caches[cacheOrder.shift()];
    }
    return c;
  }
  // render a painter (32-unit space, tile at 0..32, overflow above) into an offscreen canvas
  function renderSprite(size, over, painter, arg) {
    var W = Math.ceil(size * dpr), H = Math.ceil(size * (1 + over) * dpr);
    var c = mk(W, H), g = c.getContext('2d');
    g.scale(W / 32, H / (32 * (1 + over)));
    g.translate(0, over * 32);
    g.lineJoin = 'round'; g.lineCap = 'round';
    painter(g, arg);
    return c;
  }
  function sprite(key, size, over, painter, arg) {
    var cache = cacheFor(size), c = cache[key];
    if (!c) c = cache[key] = renderSprite(size, over, painter, arg);
    return c;
  }
  function blit(ctx, spr, px, py, size, over, dx) {
    ctx.drawImage(spr, px + (dx || 0), py - over * size, size, size * (1 + over));
  }

  // ---------------------------------------------------------------- ground
  function paintGround(g, v) {
    var r = rng(9173 + v * 7919), i;
    g.fillStyle = C.grass[v]; g.fillRect(0, 0, 32, 32);
    // large soft patches (kept away from edges => no seams; low contrast => no checkerboard)
    for (i = 0; i < 5; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(80,78,40,0.16)' : 'rgba(150,140,80,0.12)';
      lump(g, 6 + r() * 20, 6 + r() * 20, 4 + r() * 6, 3 + r() * 5, 7, (r() * 1e6) | 0, 0.35); g.fill();
    }
    // fine noise speckles
    for (i = 0; i < 70; i++) {
      var k = r();
      g.fillStyle = k < 0.45 ? 'rgba(60,62,30,0.22)' : k < 0.8 ? 'rgba(150,146,92,0.2)' : 'rgba(110,90,60,0.22)';
      g.fillRect(r() * 31, r() * 31, 0.9 + r() * 0.9, 0.9 + r() * 0.7);
    }
    // grass tufts
    g.lineWidth = 0.9; g.lineCap = 'round';
    var tufts = v === 2 ? 9 : 5;
    for (i = 0; i < tufts; i++) {
      var x = 3 + r() * 26, y = 4 + r() * 25;
      g.strokeStyle = r() < 0.5 ? C.grassBlade : '#66693a';
      g.beginPath();
      g.moveTo(x, y); g.lineTo(x - 1.2, y - 2.6);
      g.moveTo(x + 0.4, y); g.lineTo(x + 0.6, y - 3.1);
      g.moveTo(x + 0.8, y); g.lineTo(x + 2, y - 2.3);
      g.stroke();
    }
    if (v === 1) { // a few muted wild flowers
      for (i = 0; i < 3; i++) {
        var fx = 5 + r() * 22, fy = 5 + r() * 22;
        g.fillStyle = ['#d8cc9a', '#c9a24a', '#b9a3b8'][i % 3];
        g.fillRect(fx, fy, 1.4, 1.4);
        g.fillStyle = 'rgba(40,36,20,0.35)'; g.fillRect(fx + 0.6, fy + 1.4, 1, 0.6);
      }
    }
    if (v === 3) { // soil patch + pebbles
      g.fillStyle = 'rgba(112,92,62,0.45)';
      lump(g, 10 + r() * 12, 10 + r() * 12, 7, 5, 8, 4242 + v, 0.35); g.fill();
      for (i = 0; i < 4; i++) {
        var sx = 6 + r() * 20, sy = 6 + r() * 20;
        g.fillStyle = 'rgba(30,24,16,0.35)'; ell(g, sx + 0.4, sy + 0.5, 1.1, 0.7); g.fill();
        g.fillStyle = '#958e7e'; ell(g, sx, sy, 1, 0.7); g.fill();
      }
    }
  }

  // ---------------------------------------------------------------- objects
  function paintTreeBase(g, v) {
    // shadow of whole tree cast down-right, kept inside the tile
    g.save();
    g.fillStyle = 'rgba(18,14,8,0.16)';
    lump(g, 20.5, 25.5, 11, 5.2, 9, 77, 0.2); g.fill();
    g.fillStyle = 'rgba(18,14,8,0.22)';
    lump(g, 20, 26, 8.5, 4, 9, 78, 0.2); g.fill();
    g.restore();
    // trunk
    g.beginPath();
    g.moveTo(13.6, 12); g.lineTo(18.4, 12);
    g.lineTo(18.8, 25.5); g.quadraticCurveTo(21, 28, 21.2, 28.2);
    g.lineTo(10.8, 28.2); g.quadraticCurveTo(13, 28, 13.2, 25.5);
    g.closePath(); fs(g, C.bark);
    g.fillStyle = C.barkHi; g.fillRect(14.4, 14, 1.4, 11);
    g.strokeStyle = C.barkLo; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(17, 16); g.lineTo(17.2, 22); g.stroke();
  }
  function paintTreeCanopy(g, v) {
    if (v === 1) { // conifer
      var tiers = [[16, -23, 6, 2], [16, -13, 9.5, 5], [16, -2, 12, 13]];
      g.save();
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
      g.restore();
      return;
    }
    // broadleaf: union of blobs with a single thick outline
    var blobs = [[16, -8, 11, 9, 1], [9, 0, 7.5, 6.5, 2], [23, 0, 7.5, 6.5, 3], [16, 3, 9, 6, 4], [12, -14, 6, 5, 5], [21, -13, 6, 5, 6]];
    var b, k;
    g.lineWidth = LW * 2; g.strokeStyle = C.out;
    for (k = 0; k < blobs.length; k++) { b = blobs[k]; lump(g, b[0], b[1], b[2], b[3], 9, b[4] * 31, 0.12); g.stroke(); }
    g.fillStyle = C.leaf;
    for (k = 0; k < blobs.length; k++) { b = blobs[k]; lump(g, b[0], b[1], b[2], b[3], 9, b[4] * 31, 0.12); g.fill(); }
    // shading: dark lower band, lit upper-left clumps
    g.save();
    g.beginPath();
    for (k = 0; k < blobs.length; k++) { b = blobs[k]; g.ellipse(b[0], b[1], b[2] * 0.95, b[3] * 0.95, 0, 0, TAU); }
    g.clip();
    g.fillStyle = C.leafLo; g.fillRect(0, 2, 32, 12);
    g.fillStyle = 'rgba(40,58,26,0.5)'; ell(g, 22, -3, 7, 6); g.fill();
    g.fillStyle = C.leafHi;
    ell(g, 12, -13, 5, 3.5); g.fill(); ell(g, 8, -2, 4, 3); g.fill(); ell(g, 16, -6, 4.5, 3); g.fill();
    g.fillStyle = 'rgba(200,200,130,0.25)';
    ell(g, 11, -15, 2.4, 1.5); g.fill(); ell(g, 7, -3, 2, 1.2); g.fill();
    g.restore();
  }

  function paintRock(g, v) {
    // big boulder with lit top face & darker front face; second small stone
    function boulder(cx, by, w, top, front, seed) {
      // shadow down-right
      g.fillStyle = 'rgba(18,14,8,0.3)';
      lump(g, cx + 2.6, by + 0.2, w * 0.55, 2.8, 8, seed + 5, 0.2); g.fill();
      // front face (body)
      lump(g, cx, by - front * 0.5 - top * 0.25, w * 0.5, front * 0.5 + top * 0.35, 9, seed, 0.18);
      fs(g, C.stoneFront);
      // top face
      g.save(); g.clip();
      g.fillStyle = C.stoneTop;
      lump(g, cx - 0.6, by - front - top * 0.25, w * 0.47, top * 0.62, 8, seed + 1, 0.15); g.fill();
      g.fillStyle = C.stoneHi;
      ell(g, cx - w * 0.16, by - front - top * 0.45, w * 0.18, top * 0.22); g.fill();
      g.fillStyle = C.stoneLo; g.fillRect(cx - w, by - 2.2, w * 2, 3);
      g.restore();
      lump(g, cx, by - front * 0.5 - top * 0.25, w * 0.5, front * 0.5 + top * 0.35, 9, seed, 0.18);
      stroke(g);
      // crack
      g.strokeStyle = 'rgba(30,26,20,0.55)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(cx + w * 0.12, by - front - top * 0.4); g.lineTo(cx + w * 0.02, by - front * 0.6); g.lineTo(cx + w * 0.14, by - front * 0.3); g.stroke();
    }
    if (v === 1) {
      boulder(11, 27.5, 14, 8, 8, 301);
      boulder(22, 29, 13, 7, 7, 302);
      boulder(17, 21, 11, 6, 6, 303);
    } else {
      boulder(14.5, 28, 22, 12, 11, 101);
      boulder(25.5, 29.5, 9, 5, 4, 102);
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

  function paintHut(g) {
    // shadow down-right
    g.fillStyle = 'rgba(18,14,8,0.32)';
    poly(g, [8, 29.5, 30.5, 29.5, 31.5, 26, 31.5, 4, 29, 4]); g.fill();
    // front wall (darker face)
    rr(g, 3, 16, 26, 13.5, 1); fs(g, C.plank);
    g.save(); rr(g, 3, 16, 26, 13.5, 1); g.clip();
    g.strokeStyle = C.plankLo; g.lineWidth = 0.8;
    for (var x = 6.5; x < 29; x += 3.5) { g.beginPath(); g.moveTo(x, 16); g.lineTo(x, 30); g.stroke(); }
    g.fillStyle = 'rgba(20,14,8,0.28)'; g.fillRect(3, 16, 26, 3);
    g.restore();
    rr(g, 3, 16, 26, 13.5, 1); stroke(g);
    // door + window
    g.beginPath(); g.moveTo(12.5, 29.5); g.lineTo(12.5, 22); g.arc(16, 22, 3.5, Math.PI, 0); g.lineTo(19.5, 29.5); g.closePath(); fs(g, C.door);
    g.fillStyle = '#c09050'; circ(g, 18.3, 25.8, 0.55); g.fill();
    rr(g, 22.2, 20, 4.2, 3.8, 0.6); fs(g, C.windowLit);
    g.strokeStyle = C.out; g.lineWidth = 0.7; g.beginPath(); g.moveTo(24.3, 20); g.lineTo(24.3, 23.8); g.stroke();
    rr(g, 5.2, 20, 4.2, 3.8, 0.6); fs(g, C.windowLit);
    // roof seen from above (lit top face), with thickness edge
    poly(g, [1, 16.5, 31, 16.5, 31, 18.3, 1, 18.3]); fs(g, C.thatchLo);
    poly(g, [1, 16.5, 4, -8, 28, -8, 31, 16.5]); fs(g, C.thatch);
    g.save(); poly(g, [1, 16.5, 4, -8, 28, -8, 31, 16.5]); g.clip();
    g.strokeStyle = C.thatchLo; g.lineWidth = 0.8;
    for (var y = -5; y < 16; y += 3.2) { g.beginPath(); g.moveTo(0, y); g.lineTo(32, y); g.stroke(); }
    g.strokeStyle = 'rgba(70,52,24,0.35)';
    for (var i = 0; i < 26; i++) { var sx = 2 + (i * 7.3) % 28, sy = -6 + (i * 5.1) % 21; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 0.4, sy + 2); g.stroke(); }
    g.fillStyle = C.thatchHi; poly(g, [4, -8, 28, -8, 27.4, -5, 4.6, -5]); g.fill();
    g.fillStyle = 'rgba(30,20,8,0.18)'; poly(g, [22, -8, 28, -8, 31, 16.5, 25, 16.5]); g.fill();
    g.restore();
    // ridge
    limb(g, 6, 4, 26, 4, 2.2, C.thatchLo);
    poly(g, [1, 16.5, 4, -8, 28, -8, 31, 16.5]); stroke(g);
    // chimney
    rr(g, 22, -9.5, 4, 5, 0.6); fs(g, C.stoneFront);
    g.fillStyle = C.stoneTop; g.fillRect(22.8, -9, 2.4, 1.4);
  }

  function paintTower(g) {
    // stone watchtower: lit top platform + tall darker front face
    g.fillStyle = 'rgba(18,14,8,0.32)';
    poly(g, [9, 29.6, 30.5, 29.6, 31.5, 26, 31.5, 8, 28, 4]); g.fill();
    // front face with slight taper
    poly(g, [6, 29.5, 26, 29.5, 25, 0, 7, 0]); fs(g, C.stoneFront);
    g.save(); poly(g, [6, 29.5, 26, 29.5, 25, 0, 7, 0]); g.clip();
    g.strokeStyle = C.stoneLo; g.lineWidth = 0.8;
    for (var row = 0, y = 3; y < 30; y += 4, row++) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(32, y); g.stroke();
      for (var x = (row % 2) * 3 + 6; x < 27; x += 6) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 4); g.stroke(); }
    }
    g.fillStyle = 'rgba(255,240,210,0.12)'; g.fillRect(7, 0, 4, 30);
    g.fillStyle = 'rgba(15,10,5,0.25)'; g.fillRect(21, 0, 6, 30);
    g.restore();
    poly(g, [6, 29.5, 26, 29.5, 25, 0, 7, 0]); stroke(g);
    // arrow slit + door
    rr(g, 14.8, 8, 2.4, 6, 1); fs(g, '#2a221a');
    g.beginPath(); g.moveTo(12.8, 29.5); g.lineTo(12.8, 24); g.arc(16, 24, 3.2, Math.PI, 0); g.lineTo(19.2, 29.5); g.closePath(); fs(g, C.door);
    // overhanging platform: thickness band + lit top
    rr(g, 3, -2.5, 26, 4.5, 0.8); fs(g, C.plankLo);
    rr(g, 3, -17, 26, 15, 1.2); fs(g, C.plank);
    g.save(); rr(g, 3, -17, 26, 15, 1.2); g.clip();
    g.strokeStyle = C.plankLo; g.lineWidth = 0.7;
    for (var py = -14; py < -2; py += 3) { g.beginPath(); g.moveTo(0, py); g.lineTo(32, py); g.stroke(); }
    g.fillStyle = 'rgba(255,240,210,0.14)'; g.fillRect(3, -17, 26, 2.5);
    g.restore();
    // crenellations (top faces lighter)
    var cr = [3.5, 10, 16.5, 23];
    for (var i = 0; i < cr.length; i++) {
      rr(g, cr[i], -21, 5.5, 4.8, 0.6); fs(g, C.stoneFront);
      g.fillStyle = C.stoneTop; g.fillRect(cr[i] + 0.8, -20.4, 3.9, 1.8);
    }
    // flag pole (flag itself is animated live)
    limb(g, 26, -21, 26, -29.5, 0.9, '#5b4430');
  }
  function drawFlag(ctx, t) {
    var w = Math.sin(t / 260) * 1.2, w2 = Math.sin(t / 260 + 1.4) * 1.2;
    ctx.beginPath();
    ctx.moveTo(26.4, -29.5);
    ctx.quadraticCurveTo(29, -29.2 + w, 32, -28 + w2);
    ctx.lineTo(26.4, -25.2);
    ctx.closePath();
    ctx.fillStyle = '#a8432f'; ctx.fill();
    ctx.strokeStyle = C.out; ctx.lineWidth = 1; ctx.stroke();
  }

  function paintFarm(g) {
    // tilled soil plot with thickness + crop rows
    g.fillStyle = 'rgba(18,14,8,0.25)'; rr(g, 3.5, 4.5, 28, 27, 2.5); g.fill();
    rr(g, 2, 3, 28, 26.5, 2.5); fs(g, C.soil);
    g.save(); rr(g, 2, 3, 28, 26.5, 2.5); g.clip();
    g.fillStyle = C.soilLo; g.fillRect(0, 27, 32, 3);
    for (var y = 6.5; y < 27; y += 5.2) {
      g.fillStyle = C.soilLo; g.fillRect(3, y + 1.6, 26, 1.6);
      g.fillStyle = C.soilHi; g.fillRect(3, y - 0.2, 26, 1);
    }
    g.restore();
    rr(g, 2, 3, 28, 26.5, 2.5); stroke(g);
    // crops
    var row = 0;
    for (var cy = 7; cy < 27; cy += 5.2, row++) {
      for (var cx = 5.5; cx < 28; cx += 4.2) {
        if (row % 2 === 0) { // wheat tuft
          g.fillStyle = 'rgba(18,14,8,0.3)'; ell(g, cx + 1, cy + 1.2, 1.8, 0.8); g.fill();
          g.strokeStyle = '#7a7a3a'; g.lineWidth = 0.8;
          g.beginPath(); g.moveTo(cx, cy + 1); g.lineTo(cx - 1, cy - 2.5); g.moveTo(cx, cy + 1); g.lineTo(cx + 1, cy - 2.8); g.stroke();
          g.fillStyle = '#d2b25a'; ell(g, cx - 1, cy - 2.8, 0.7, 1.2); g.fill(); ell(g, cx + 1, cy - 3.1, 0.7, 1.2); g.fill();
        } else { // leafy crop
          g.fillStyle = 'rgba(18,14,8,0.3)'; ell(g, cx + 1, cy + 1.1, 2, 0.9); g.fill();
          ell(g, cx, cy - 0.3, 1.9, 1.5); g.fillStyle = '#6e8a3e'; g.fill(); g.strokeStyle = C.out; g.lineWidth = 0.7; g.stroke();
          g.fillStyle = '#8fa858'; g.fillRect(cx - 0.9, cy - 1.2, 1, 0.8);
        }
      }
    }
  }

  function paintCampfireBase(g) {
    g.fillStyle = 'rgba(18,14,8,0.3)'; ell(g, 18, 25.8, 11, 4); g.fill();
    // ash bed
    ell(g, 16, 23, 9.5, 5); g.fillStyle = '#4a4036'; g.fill();
    ell(g, 16, 23, 6, 3.2); g.fillStyle = '#2e2620'; g.fill();
    // logs
    limb(g, 9.5, 25.2, 21, 20.5, 2.6, C.bark);
    limb(g, 22.5, 25.2, 11, 20.5, 2.6, C.barkHi);
    g.fillStyle = '#c89a5a'; circ(g, 22.5, 25.2, 1.1); g.fill();
    // stone ring (front stones overlap)
    var n = 11;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU;
      var x = 16 + Math.cos(a) * 10, y = 23 + Math.sin(a) * 5.4;
      lump(g, x, y, 2.2, 1.7, 6, 700 + i, 0.2);
      fs(g, Math.sin(a) > 0 ? C.stoneFront : C.stoneTop, 1.1);
      g.fillStyle = 'rgba(255,245,220,0.25)'; g.fillRect(x - 1, y - 1.2, 1.2, 0.7);
    }
  }
  function drawFlames(ctx, t) {
    var f1 = Math.sin(t / 90) * 0.8 + Math.sin(t / 37) * 0.4, f2 = Math.sin(t / 70 + 2) * 0.7;
    // glow
    var gr = ctx.createRadialGradient(16, 18, 1, 16, 18, 15);
    gr.addColorStop(0, 'rgba(255,170,70,0.35)'); gr.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = gr; ctx.fillRect(1, 3, 30, 30);
    function flame(x, y, w, h, col, sway) {
      ctx.beginPath();
      ctx.moveTo(x - w, y);
      ctx.quadraticCurveTo(x - w, y - h * 0.55, x + sway, y - h);
      ctx.quadraticCurveTo(x + w, y - h * 0.5, x + w, y);
      ctx.quadraticCurveTo(x, y + w * 0.6, x - w, y);
      ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    }
    flame(16, 23, 5.2, 13 + f1, C.flame[3], f2);
    ctx.strokeStyle = C.out; ctx.lineWidth = 1.2; ctx.stroke();
    flame(16, 23, 4, 10.5 + f2, C.flame[2], f1 * 0.8);
    flame(16.4, 23, 2.6, 7.5 + f1 * 0.6, C.flame[1], -f2 * 0.5);
    flame(16.2, 23, 1.3, 4.2, C.flame[0], 0);
    // embers
    for (var i = 0; i < 3; i++) {
      var k = ((t / 900 + i / 3) % 1);
      ctx.fillStyle = 'rgba(255,200,90,' + (1 - k).toFixed(2) + ')';
      ctx.fillRect(16 + Math.sin(i * 2.1 + t / 300) * 3, 16 - k * 14, 0.9, 0.9);
    }
  }

  // ---------------------------------------------------------------- items
  function paintItem(g, kind, x, y, s) {
    g.save(); g.translate(x, y); if (s && s !== 1) g.scale(s, s);
    g.fillStyle = 'rgba(18,14,8,0.3)'; ell(g, 1.2, 3.6, 5.2, 1.4); g.fill();
    if (kind === 'food') {
      poly(g, [-5, -0.8, 5, -0.8, 4, 3.6, -4, 3.6]); fs(g, '#a87c44', 1.2);
      g.strokeStyle = '#7a5530'; g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(-4.4, 1.4); g.lineTo(4.4, 1.4); g.stroke();
      var b = [[-2.6, -1.6, 1.9], [0.6, -2.6, 2], [3, -1.4, 1.7]];
      for (var i = 0; i < b.length; i++) {
        circ(g, b[i][0], b[i][1], b[i][2]); fs(g, C.berry, 1);
        g.fillStyle = C.berryHi; g.fillRect(b[i][0] - 1, b[i][1] - 1, 0.8, 0.8);
      }
      g.fillStyle = '#6d8644'; ell(g, -0.5, -4.4, 1.6, 0.8); g.fill();
    } else if (kind === 'wood') {
      rr(g, -5.5, -0.6, 11, 3.6, 1.8); fs(g, C.bark, 1.2);
      rr(g, -4.5, -3.6, 10, 3.4, 1.7); fs(g, C.barkHi, 1.2);
      ell(g, 4.4, 1.2, 1.3, 1.7); fs(g, '#d6ad74', 0.9);
      ell(g, 5, -1.9, 1.2, 1.6); fs(g, '#d6ad74', 0.9);
      g.fillStyle = '#a07a48'; g.fillRect(4.2, 0.9, 0.5, 0.5); g.fillRect(4.8, -2.2, 0.5, 0.5);
    } else { // stone
      lump(g, 0, 0.8, 5.4, 3.6, 7, 4711, 0.2); fs(g, C.stoneFront, 1.2);
      g.save(); lump(g, 0, 0.8, 5.4, 3.6, 7, 4711, 0.2); g.clip();
      g.fillStyle = C.stoneTop; ell(g, -0.6, -1.4, 4.4, 2.4); g.fill();
      g.fillStyle = C.stoneHi; ell(g, -1.8, -1.9, 1.6, 0.8); g.fill();
      g.restore();
      lump(g, 0, 0.8, 5.4, 3.6, 7, 4711, 0.2); stroke(g, C.out, 1.2);
    }
    g.restore();
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

  function headAt(g, L, cx, cy, r, mood, blink, look) {
    // back hair for long style
    if (L.style === 1) { rr(g, cx - r - 0.6, cy - 2, r * 1.15, r + 4.5, 3); fs(g, L.hair); }
    circ(g, cx, cy, r); fs(g, L.skin);
    if (L.style === 'hood') {
      g.beginPath();
      g.arc(cx, cy, r + 0.9, -1.2, 1.35, true);
      g.quadraticCurveTo(cx - 1.5, cy + 0.5, cx + 2.6, cy - r - 0.2);
      g.closePath(); fs(g, L.hood);
      // mask over lower face
      g.save(); circ(g, cx, cy, r - 0.2); g.clip();
      g.fillStyle = L.mask; g.fillRect(cx - 1, cy + 0.6, r + 2, r);
      g.restore();
      g.strokeStyle = C.out; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(cx - 0.6, cy + 0.6); g.lineTo(cx + r, cy + 0.6); g.stroke();
      circ(g, cx, cy, r); stroke(g);
      // angry eyes
      g.fillStyle = '#e8d070'; g.fillRect(cx + 2.4, cy - 2, 1.4, 1.2); g.fillRect(cx + 5, cy - 2, 1.2, 1.2);
      g.strokeStyle = C.out; g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(cx + 1.8, cy - 3.8); g.lineTo(cx + 4, cy - 2.6); g.moveTo(cx + 6.6, cy - 3.8); g.lineTo(cx + 4.8, cy - 2.8); g.stroke();
      return;
    }
    // hair cap (from above-front, RimWorld-like), face on the right (facing side)
    g.beginPath();
    g.arc(cx, cy, r + 0.5, Math.PI * 0.86, Math.PI * 1.93);
    g.lineTo(cx + r * 0.62, cy - r * 0.42);
    g.lineTo(cx + r * 0.28, cy - r * 0.2);
    g.lineTo(cx - r * 0.05, cy - r * 0.45);
    g.lineTo(cx - r * 0.35, cy - r * 0.15);
    g.lineTo(cx - r * 0.55, cy + r * 0.25);
    g.lineTo(cx - r * 0.85, cy + r * 0.6);
    g.closePath(); fs(g, L.hair);
    g.fillStyle = 'rgba(255,240,210,0.18)'; ell(g, cx - r * 0.3, cy - r * 0.7, r * 0.35, r * 0.16); g.fill();
    if (L.style === 2) { circ(g, cx - r * 0.55, cy - r - 0.8, 2.6); fs(g, L.hair); }
    if (L.style === 3) {
      limb(g, cx - r + 0.3, cy - r * 0.3, cx + r * 0.75, cy - r * 0.62, 1.4, BAND[look & 7]);
      limb(g, cx - r + 0.3, cy - r * 0.3, cx - r - 2.2, cy + 1.6, 1, BAND[look & 7]);
    }
    // face (facing right)
    g.fillStyle = '#2a1e16';
    if (mood === 'dead') {
      g.strokeStyle = '#2a1e16'; g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(cx + 1.6, cy - 0.4); g.lineTo(cx + 3.2, cy + 1.2); g.moveTo(cx + 3.2, cy - 0.4); g.lineTo(cx + 1.6, cy + 1.2);
      g.moveTo(cx + 4.4, cy - 0.4); g.lineTo(cx + 6, cy + 1.2); g.moveTo(cx + 6, cy - 0.4); g.lineTo(cx + 4.4, cy + 1.2);
      g.stroke();
    } else if (blink || mood === 'sleep') {
      g.strokeStyle = '#2a1e16'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(cx + 1.7, cy + 0.6); g.lineTo(cx + 3.1, cy + 0.6); g.moveTo(cx + 4.5, cy + 0.6); g.lineTo(cx + 5.8, cy + 0.6); g.stroke();
    } else {
      g.fillRect(cx + 1.9, cy - 0.5, 1.2, 1.7); g.fillRect(cx + 4.7, cy - 0.5, 1.1, 1.7);
      if (mood === 'fight') {
        g.strokeStyle = '#2a1e16'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(cx + 1.4, cy - 2.2); g.lineTo(cx + 3.4, cy - 1.2); g.moveTo(cx + 6.4, cy - 2.2); g.lineTo(cx + 4.6, cy - 1.3); g.stroke();
      }
    }
    if (mood !== 'dead') { g.fillStyle = 'rgba(200,90,70,0.3)'; g.fillRect(cx + 4.6, cy + 2.1, 1.8, 1); }
  }

  // body of a pawn: RimWorld-like rounded bean torso, no legs; small feet hint
  function torso(g, L, x, y) {
    g.beginPath();
    g.moveTo(x - 5.2, y - 9);
    g.quadraticCurveTo(x - 6.4, y - 1, x - 5.4, y + 1.2);
    g.quadraticCurveTo(x, y + 3.2, x + 5.4, y + 1.2);
    g.quadraticCurveTo(x + 6.4, y - 1, x + 5.2, y - 9);
    g.quadraticCurveTo(x, y - 11.2, x - 5.2, y - 9);
    g.closePath(); fs(g, L.shirt);
    g.save(); g.clip();
    g.fillStyle = L.pants; g.fillRect(x - 7, y - 1.3, 14, 5);
    g.fillStyle = 'rgba(20,14,8,0.22)'; g.fillRect(x + 2.6, y - 11, 5, 15);
    g.fillStyle = 'rgba(255,240,210,0.16)'; g.fillRect(x - 5, y - 10, 2.2, 9);
    g.restore();
    g.strokeStyle = C.out; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x - 5.6, y - 1.3); g.lineTo(x + 5.6, y - 1.3); g.stroke();
    g.beginPath();
    g.moveTo(x - 5.2, y - 9);
    g.quadraticCurveTo(x - 6.4, y - 1, x - 5.4, y + 1.2);
    g.quadraticCurveTo(x, y + 3.2, x + 5.4, y + 1.2);
    g.quadraticCurveTo(x + 6.4, y - 1, x + 5.2, y - 9);
    g.quadraticCurveTo(x, y - 11.2, x - 5.2, y - 9);
    stroke(g);
  }
  function hand(g, L, x, y) { circ(g, x, y, 1.55); fs(g, L.skin, 1.1); }

  function tool(g, kind, hx, hy, ang) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    if (kind === 'pick') {
      limb(g, hx - dx * 2, hy - dy * 2, hx + dx * 8, hy + dy * 8, 1.3, '#7a5a38');
      var ex = hx + dx * 8, ey = hy + dy * 8, nx = -dy, ny = dx;
      g.beginPath(); g.moveTo(ex - nx * 4, ey - ny * 4 - dy); g.quadraticCurveTo(ex + dx * 1.5, ey + dy * 1.5, ex + nx * 4, ey + ny * 4 - dy);
      g.strokeStyle = C.out; g.lineWidth = 1.8 + LW * 1.6; g.stroke();
      g.strokeStyle = '#a7a59c'; g.lineWidth = 1.8; g.stroke();
    } else if (kind === 'club') {
      limb(g, hx - dx * 1.5, hy - dy * 1.5, hx + dx * 7.5, hy + dy * 7.5, 1.6, '#6e5033');
      circ(g, hx + dx * 8, hy + dy * 8, 1.9); fs(g, '#7a5a38', 1.1);
    } else { // blade
      limb(g, hx - dx * 1.5, hy - dy * 1.5, hx + dx * 1.5, hy + dy * 1.5, 1.4, '#4a3424');
      limb(g, hx - dy * 2.2 + dx * 1.6, hy + dx * 2.2 + dy * 1.6, hx + dy * 2.2 + dx * 1.6, hy - dx * 2.2 + dy * 1.6, 0.9, '#8a7a5a');
      g.beginPath(); g.moveTo(hx + dx * 2, hy + dy * 2); g.lineTo(hx + dx * 10, hy + dy * 10);
      g.strokeStyle = C.out; g.lineWidth = 2 + LW * 1.6; g.stroke();
      g.strokeStyle = '#c4c2ba'; g.lineWidth = 2; g.stroke();
    }
  }

  // generic standing pawn. origin = feet centre, unit scale, facing right.
  function paintPawn(g, L, pose, t, seed, carrying, weapon, look) {
    var T = t + seed * 1337, bob = 0, sway = 0, lean = 0, i;
    if (pose === 'walk') { var ph = T / 115; bob = -Math.abs(Math.sin(ph)) * 1.5; sway = Math.sin(ph); }
    else if (pose === 'idle') { bob = Math.sin(T / 520) * 0.45; }
    var c = 0, a = 0;
    if (pose === 'work') {
      c = (T % 700) / 700;
      a = c < 0.6 ? lerp(-0.6, -2.35, smooth(c / 0.6)) : lerp(-2.35, 0.75, smooth((c - 0.6) / 0.4));
      bob = c > 0.6 ? 0.7 * smooth((c - 0.6) / 0.4) : 0; lean = c > 0.6 ? 0.8 : -0.3;
    }
    var jab = 0;
    if (pose === 'fight') { jab = Math.max(0, Math.sin(T / 420 * TAU)); lean = jab * 1.2; bob = -jab * 0.4; }
    // shadow: offset down-right, stays inside tile
    shadowBlob(g, 1.8, 0.6, 7.2, 2.5, 0.32);
    // feet
    var fy = -0.6;
    ell(g, -2.4 - sway * 1.6, fy + (sway > 0 ? -0.3 : 0), 1.9, 1.2); fs(g, dark(L.pants, 0.45), 1.1);
    ell(g, 2.4 + sway * 1.6, fy + (sway < 0 ? -0.3 : 0), 1.9, 1.2); fs(g, dark(L.pants, 0.45), 1.1);
    var bx = lean, by = -2.4 + bob;
    // back hand
    var bh = { x: bx - 6, y: by - 4.5 - sway * 0.8 };
    if (carrying) bh = { x: bx + 1.5, y: by - 4 };
    hand(g, L, bh.x, bh.y);
    torso(g, L, bx, by);
    // head
    var hx = bx + 0.4 + lean * 0.3, hy = by - 15.8;
    var blink = ((T / 1) % 3400) < 130;
    headAt(g, L, hx, hy, 7.4, pose === 'fight' || L.style === 'hood' ? 'fight' : 'ok', blink, look);
    // front hand / tool
    if (pose === 'work') {
      var sx = bx + 2.6, sy = by - 7.5;
      var hxx = sx + Math.cos(a) * 5, hyy = sy + Math.sin(a) * 5;
      tool(g, 'pick', hxx, hyy, a); hand(g, L, hxx, hyy);
    } else if (pose === 'fight' || weapon) {
      var fx = bx + 5.5 + jab * 3.5, fyy = by - 6 - jab * 1.5;
      tool(g, weapon || 'club', fx, fyy, -1.05 + jab * 0.9); hand(g, L, fx, fyy);
    } else if (carrying) {
      hand(g, L, bx + 5.8, by - 4);
    } else {
      hand(g, L, bx + 6, by - 4.5 + sway * 0.8);
    }
    if (carrying) paintItem(g, carrying, bx + 3.2, by - 3.4, 0.95);
  }

  function paintLying(g, L, t, seed, dead, look) {
    var T = t + seed * 1337;
    var Ld = L;
    if (dead) Ld = { skin: mix(L.skin, '#8f8a80', 0.55), hair: mix(L.hair, '#6a6660', 0.4), shirt: mix(L.shirt, '#6a6660', 0.55), pants: mix(L.pants, '#4a4640', 0.5), style: L.style, hood: L.hood && mix(L.hood, '#4a4640', 0.5), mask: L.mask && mix(L.mask, '#6a6660', 0.5) };
    shadowBlob(g, 1.6, -1, 13, 3.2, 0.3);
    if (!dead) { // bedroll + pillow
      rr(g, -13, -7.5, 26, 7.5, 3); fs(g, '#5d5444');
      rr(g, -13.5, -9.6, 7.5, 5.5, 2.5); fs(g, C.cloth);
    } else {
      g.fillStyle = 'rgba(90,30,24,0.35)'; lump(g, -5, -2.5, 6, 2.4, 7, 99, 0.3); g.fill();
    }
    // body lying horizontally (head left)
    g.save(); g.translate(1.5, -4.6); g.rotate(-Math.PI / 2);
    if (dead) {
      ell(g, -1.8, 9.5, 1.9, 1.3); fs(g, dark(Ld.pants, 0.45), 1.1);
      ell(g, 1.8, 9.8, 1.9, 1.3); fs(g, dark(Ld.pants, 0.45), 1.1);
    }
    torso(g, Ld, 0, 7);
    g.restore();
    if (!dead) {
      var br = Math.sin(T / 900) * 0.35;
      rr(g, -5.5, -10 - br, 18, 9 + br, 3.5); fs(g, L.shirt);
      g.strokeStyle = 'rgba(255,240,210,0.3)'; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(-3.5, -7.6 - br); g.lineTo(11, -7.6 - br); g.stroke();
      g.fillStyle = 'rgba(20,14,8,0.2)'; g.fillRect(-5, -4, 17.5, 2.5);
    }
    // head (rotated so face points up-right)
    g.save(); g.translate(-9.5, -7.6); g.rotate(-0.35);
    headAt(g, Ld, 0, 0, 6.6, dead ? 'dead' : 'sleep', true, look);
    g.restore();
    if (dead) {
      hand(g, Ld, -2, -1.2);
    }
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

  function paintBoar(g, t, seed) {
    var T = t + seed * 977, ph = T / 95, bob = -Math.abs(Math.sin(ph)) * 0.8, s = Math.sin(ph);
    shadowBlob(g, 2, 0.4, 11, 2.8, 0.32);
    var fur = '#5a4030', furLo = '#3e2a1e', furHi = '#76543c';
    // far legs
    limb(g, -5, -4 + bob, -5 - s * 1.6, -0.5, 2.2, furLo);
    limb(g, 5, -4 + bob, 5 + s * 1.6, -0.5, 2.2, furLo);
    // body
    lump(g, -0.5, -8.8 + bob, 10, 6.4, 10, 515, 0.08); fs(g, fur);
    g.save(); lump(g, -0.5, -8.8 + bob, 10, 6.4, 10, 515, 0.08); g.clip();
    g.fillStyle = furLo; g.fillRect(-12, -6 + bob, 24, 6);
    g.fillStyle = furHi; ell(g, -3, -12.5 + bob, 6, 2); g.fill();
    g.restore();
    lump(g, -0.5, -8.8 + bob, 10, 6.4, 10, 515, 0.08); stroke(g);
    // mane bristles
    g.beginPath(); g.moveTo(-6, -14 + bob);
    for (var i = 0; i <= 8; i++) g.lineTo(-6 + i * 1.6, -15 + bob - (i % 2 ? 2.6 : 0) - Math.sin(i / 8 * Math.PI) * 0.8);
    g.lineTo(6.6, -13 + bob); g.closePath(); fs(g, '#2e2018', 1.1);
    // near legs
    limb(g, -3, -4 + bob, -3 + s * 1.6, -0.4, 2.4, fur);
    limb(g, 7, -4 + bob, 7 - s * 1.6, -0.4, 2.4, fur);
    // tail
    g.beginPath(); g.moveTo(-10, -10 + bob); g.quadraticCurveTo(-13, -12 + bob, -12, -8 + bob); g.strokeStyle = C.out; g.lineWidth = 1.6; g.stroke();
    // head
    g.beginPath();
    g.moveTo(5, -14 + bob); g.quadraticCurveTo(10, -13 + bob, 13.2, -8.5 + bob);
    g.lineTo(13.8, -5.2 + bob); g.quadraticCurveTo(10, -3 + bob, 6, -4.5 + bob);
    g.closePath(); fs(g, furHi);
    ell(g, 13.6, -6.8 + bob, 1.4, 2); fs(g, '#a07a68', 1.1);
    g.fillStyle = C.out; g.fillRect(13.4, -7.6 + bob, 0.6, 0.6); g.fillRect(13.4, -6.2 + bob, 0.6, 0.6);
    // ear
    poly(g, [6.4, -13 + bob, 7.4, -17 + bob, 9.6, -13 + bob]); fs(g, fur, 1.1);
    // tusk
    g.beginPath(); g.moveTo(11, -5 + bob); g.quadraticCurveTo(13.4, -5 + bob, 13.2, -9 + bob);
    g.strokeStyle = C.out; g.lineWidth = 2.8; g.stroke(); g.strokeStyle = '#ece2c8'; g.lineWidth = 1.3; g.stroke();
    // eye
    g.fillStyle = '#ff5a3a'; g.fillRect(9.4, -10.3 + bob, 1.4, 1.2);
  }

  function hostileRing(ctx, t) {
    ctx.save();
    ctx.setLineDash([2.6, 2]); ctx.lineDashOffset = -t / 120;
    ell(ctx, 0, 0.3, 11, 3.6);
    ctx.strokeStyle = 'rgba(224,80,60,0.8)'; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- icons
  var iconCache = {};
  var ICON_PX = 72;
  var ICONS = {
    food: function (g) { paintItem(g, 'food', 15.5, 17, 2.3); },
    wood: function (g) { paintItem(g, 'wood', 16, 17, 2.25); },
    stone: function (g) { paintItem(g, 'stone', 16, 16.5, 2.4); },
    pop: function (g) {
      var L = LOOKS[0];
      g.save(); g.translate(15, 31); g.scale(1.12, 1.12); torso(g, L, 0, -3); headAt(g, L, 0.4, -17.2, 7.4, 'ok', false, 0); g.restore();
    },
    day: function (g) {
      g.save(); g.translate(16, 16);
      for (var i = 0; i < 8; i++) {
        g.rotate(TAU / 8);
        poly(g, [-2.2, -9, 2.2, -9, 0, -14.5]); fs(g, '#e8a83a', 1.3);
      }
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
    hut: function (g) { g.save(); g.translate(2.5, 7.2); g.scale(0.84, 0.84); paintHut(g); g.restore(); },
    tower: function (g) { g.save(); g.translate(7.6, 16.5); g.scale(0.52, 0.52); paintTower(g); drawFlag(g, 0); g.restore(); },
    farm: function (g) { g.save(); g.translate(1, 1.5); g.scale(0.94, 0.94); paintFarm(g); g.restore(); },
    speed: function (g) {
      poly(g, [3, 7, 15, 16, 3, 25]); fs(g, '#e8dcc0', 1.8);
      poly(g, [15, 7, 27.5, 16, 15, 25]); fs(g, '#e8dcc0', 1.8);
    },
    pause: function (g) { rr(g, 7, 6, 6.5, 20, 1.8); fs(g, '#e8dcc0', 1.8); rr(g, 18.5, 6, 6.5, 20, 1.8); fs(g, '#e8dcc0', 1.8); },
    play: function (g) {
      g.beginPath(); g.moveTo(9, 6); g.lineTo(26, 16); g.lineTo(9, 26); g.closePath();
      g.lineJoin = 'round'; fs(g, '#e8dcc0', 1.8);
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
    boar: function (g) { g.save(); g.translate(15, 27); g.scale(1.05, 1.05); paintBoar(g, 0, 0); g.restore(); },
    storm: function (g) {
      poly(g, [16, 15, 11, 24, 15, 24, 12.5, 31, 21, 20, 16.5, 20, 19, 15]); fs(g, '#f0c85a', 1.4);
      g.beginPath();
      g.arc(10, 14, 5.5, Math.PI * 0.5, Math.PI * 1.5); g.arc(16, 9, 7, Math.PI, Math.PI * 1.95);
      g.arc(23.5, 13, 5.5, Math.PI * 1.4, Math.PI * 0.5); g.closePath();
      fs(g, '#7a8090', 1.8);
      g.fillStyle = 'rgba(255,255,255,0.22)'; ell(g, 13, 7.5, 3.5, 1.6); g.fill();
      g.fillStyle = 'rgba(20,20,30,0.25)'; g.fillRect(6, 16.6, 22, 1.6);
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
    }
  };
  function makeIcon(name) {
    var c = mk(ICON_PX, ICON_PX), g = c.getContext('2d');
    g.scale(ICON_PX / 32, ICON_PX / 32);
    g.lineJoin = 'round'; g.lineCap = 'round';
    var f = ICONS[name];
    if (f) f(g); else { circ(g, 16, 16, 9); fs(g, '#8a7a60'); }
    try { return c.toDataURL('image/png'); } catch (e) { return ''; }
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
  function frac(x) { return x - Math.floor(x); }

  // ---------------------------------------------------------------- public API
  var Art = {
    palette: PALETTE,
    overflow: OVER,           // tiles each object sprite extends above its tile top
    unitOverflow: 0.3,        // pawns/enemies: head (and carried item) reach ~0.3 tile above the tile top
    looks: LOOKS.length,

    init: function (size) {
      curSize = size && isFinite(size) && size > 0 ? size : curSize;
      cacheFor(curSize);
      for (var v = 0; v < 4; v++) groundSprite(curSize, v);
      ['tree', 'rock', 'bush', 'bush_empty', 'hut', 'tower', 'farm', 'campfire'].forEach(function (t) { objSprites(t, curSize, 0); objSprites(t, curSize, 1); });
    },

    drawGround: function (ctx, px, py, size, variant) {
      var v = ((variant | 0) % 4 + 4) % 4;
      ctx.drawImage(groundSprite(size, v), px, py, size + 0.5, size + 0.5);
    },

    drawObject: function (ctx, type, px, py, size, time) {
      var v = hash2(Math.round(px / size), Math.round(py / size)) < 0.5 ? 0 : 1;
      var s = objSprites(type, size, v);
      if (!s) return;
      var o = OVER[type] || 0;
      if (type === 'tree') {
        blit(ctx, s[0], px, py, size, o);
        var sw = Math.sin((time || 0) / 1100 + px * 0.13 + py * 0.07) * size * 0.012;
        blit(ctx, s[1], px, py, size, o, sw);
        return;
      }
      blit(ctx, s[0], px, py, size, o);
      if (type === 'campfire' || type === 'tower') {
        ctx.save(); ctx.translate(px, py); ctx.scale(size / 32, size / 32);
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (type === 'campfire') drawFlames(ctx, time || 0); else drawFlag(ctx, time || 0);
        ctx.restore();
      }
    },

    drawColonist: function (ctx, c, px, py, size, time) {
      c = c || {};
      var t = time || 0, s = size / 32, dir = c.dir === -1 ? -1 : 1;
      var look = ((c.look | 0) % 8 + 8) % 8, L = LOOKS[look];
      var seed = look * 3 + (c.name ? c.name.length : 0);
      var st = c.state || 'idle';
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
      ctx.scale(dir, 1);
      if (st === 'sleep' || st === 'dead') {
        paintLying(ctx, L, t, seed, st === 'dead', look);
        if (st === 'sleep') { ctx.scale(dir, 1); drawZs(ctx, t + seed * 300); }
      } else {
        paintPawn(ctx, L, st, t, seed, c.carrying || null, null, look);
      }
      ctx.restore();
    },

    drawEnemy: function (ctx, kind, px, py, size, time, dir) {
      var t = time || 0, s = size / 32, d = dir === -1 ? -1 : 1;
      ctx.save();
      ctx.translate(px + size / 2, py + size * 0.9);
      ctx.scale(s, s);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      hostileRing(ctx, t);
      ctx.scale(d, 1);
      if (kind === 'boar') paintBoar(ctx, t, 3);
      else paintPawn(ctx, RAIDER, 'walk', t, 5, null, 'blade', 0);
      ctx.restore();
    },

    drawHighlight: function (ctx, px, py, size, kind) {
      var s = size / 32;
      ctx.save(); ctx.translate(px, py); ctx.scale(s, s);
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      if (kind === 'target') {
        ctx.strokeStyle = 'rgba(20,14,8,0.7)'; ctx.lineWidth = 3.6; brackets(ctx);
        ctx.strokeStyle = '#f0cb6a'; ctx.lineWidth = 1.8; brackets(ctx);
        circ(ctx, 16, 16, 3); ctx.strokeStyle = 'rgba(240,203,106,0.85)'; ctx.lineWidth = 1.2; ctx.stroke();
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
        default:
          ctx.globalAlpha = k; ctx.fillStyle = '#ddd'; ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      ctx.restore();
    },

    drawSky: function (ctx, w, h, phase, weather, time) {
      var ph = frac(phase || 0), t = time || 0;
      var d = Math.cos((ph - 0.25) * TAU);              // 1 noon, 0 dawn/dusk, -1 midnight
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
      if (night > 0.01) {
        ctx.globalCompositeOperation = 'multiply';
        var r = Math.round(lerp(255, 70, night)), g2 = Math.round(lerp(255, 88, night)), b = Math.round(lerp(255, 150, night));
        ctx.fillStyle = 'rgb(' + r + ',' + g2 + ',' + b + ')'; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = night * 0.85;
        ctx.drawImage(vignette(w, h), 0, 0, w, h);
        ctx.globalAlpha = 1;
        if (!storm && night > 0.5) { // fireflies
          var fa = (night - 0.5) * 2;
          for (var i = 0; i < 9; i++) {
            var fx = frac(Math.sin(i * 91.7) * 43758.5 + t / (40000 + i * 3000)) * w;
            var fy = frac(Math.sin(i * 57.3) * 23421.6) * h + Math.sin(t / 900 + i) * 12;
            var tw = 0.5 + 0.5 * Math.sin(t / (380 + i * 40) + i);
            ctx.globalAlpha = fa * tw * 0.9;
            ctx.fillStyle = 'rgba(230,240,140,0.25)'; circ(ctx, fx, fy, 3.2); ctx.fill();
            ctx.fillStyle = '#f4f7b0'; ctx.fillRect(fx - 0.8, fy - 0.8, 1.6, 1.6);
          }
          ctx.globalAlpha = 1;
        }
      }
      if (storm) {
        ctx.fillStyle = 'rgba(34,42,54,0.36)'; ctx.fillRect(0, 0, w, h);
        // rain streaks
        var n = Math.round(clamp(w * h / 2600, 40, 140));
        ctx.strokeStyle = 'rgba(190,206,226,0.55)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (var j = 0; j < n; j++) {
          var sp = 0.55 + frac(j * 0.618) * 0.35;
          var rx = frac(j * 0.7548 + 0.13) * (w + 40) - t * 0.08 * sp;
          var ry = frac(j * 0.5698 + 0.71) * (h + 30) + t * 0.7 * sp;
          rx = ((rx % (w + 40)) + (w + 40)) % (w + 40) - 20; ry = (ry % (h + 30)) - 15;
          ctx.moveTo(rx, ry); ctx.lineTo(rx - 3.5, ry + 12);
        }
        ctx.stroke();
        // lightning flash
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
    }
  };

  function groundSprite(size, v) {
    return sprite('g' + v, size, 0, paintGround, v);
  }
  function objSprites(type, size, v) {
    var cache = cacheFor(size), key = 'o_' + type + (type === 'tree' || type === 'rock' ? v : '');
    var s = cache[key];
    if (s) return s;
    var o = OVER[type];
    if (o === undefined) return null;
    switch (type) {
      case 'tree': s = [renderSprite(size, o, paintTreeBase, v), renderSprite(size, o, paintTreeCanopy, v)]; break;
      case 'rock': s = [renderSprite(size, o, paintRock, v)]; break;
      case 'bush': s = [renderSprite(size, o, paintBush, false)]; break;
      case 'bush_empty': s = [renderSprite(size, o, paintBush, true)]; break;
      case 'hut': s = [renderSprite(size, o, paintHut)]; break;
      case 'tower': s = [renderSprite(size, o, paintTower)]; break;
      case 'farm': s = [renderSprite(size, o, paintFarm)]; break;
      case 'campfire': s = [renderSprite(size, o, paintCampfireBase)]; break;
    }
    cache[key] = s;
    return s;
  }

  window.Art = Art;
})();
