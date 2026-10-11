const Ink = (function () {
  const W = 800;
  const ERASE_R = 14;
  const canvas = $("pad");
  const page = $("page");
  const ctx = canvas.getContext("2d");
  const dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  let note = null;
  let onChange = function () {};
  let active = false;
  let tool = "pen";
  let color = "#111111";
  let size = 6;
  let undoStack = [];
  let redoStack = [];
  let live = null;
  let erasing = false;
  let erasedNow = false;

  function shade(c) {
    return (c === "#111111" && dark && dark.matches) ? "#ececec" : c;
  }

  function drawStroke(s) {
    const c = shade(s.c);
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineWidth = s.w;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const p = s.pts;
    if (p.length === 1) {
      ctx.beginPath();
      ctx.arc(p[0][0], p[0][1], s.w / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length - 1; i++) {
      const mx = (p[i][0] + p[i + 1][0]) / 2;
      const my = (p[i][1] + p[i + 1][1]) / 2;
      ctx.quadraticCurveTo(p[i][0], p[i][1], mx, my);
    }
    const last = p[p.length - 1];
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  }

  function redraw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const k = canvas.width / W;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (note) { note.strokes.forEach(drawStroke); }
    if (live) { drawStroke(live); }
  }

  function fit() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) { return; }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    redraw();
  }

  function applyHeight() {
    if (!note) { return; }
    const w = canvas.clientWidth || page.clientWidth;
    if (w) { page.style.minHeight = Math.round(note.h * w / W) + "px"; }
  }

  function grow(y) {
    if (note && y > note.h - 250) {
      note.h = Math.round(y + 900);
      applyHeight();
    }
  }

  function pos(e) {
    const r = canvas.getBoundingClientRect();
    return [
      Math.round((e.clientX - r.left) * W / r.width * 10) / 10,
      Math.round((e.clientY - r.top) * W / r.width * 10) / 10
    ];
  }

  function segDist(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
  }

  function hits(s, p) {
    const lim = ERASE_R + s.w / 2;
    if (s.pts.length === 1) { return Math.hypot(p[0] - s.pts[0][0], p[1] - s.pts[0][1]) < lim; }
    for (let i = 1; i < s.pts.length; i++) {
      if (segDist(p, s.pts[i - 1], s.pts[i]) < lim) { return true; }
    }
    return false;
  }

  function remember() {
    undoStack.push(note.strokes.slice());
    if (undoStack.length > 60) { undoStack.shift(); }
    redoStack = [];
  }

  function eraseAt(p) {
    const keep = note.strokes.filter(function (s) { return !hits(s, p); });
    if (keep.length === note.strokes.length) { return; }
    if (!erasedNow) { remember(); erasedNow = true; }
    note.strokes = keep;
    redraw();
    onChange();
    buttons();
  }

  function down(e) {
    if (!note || !active || tool === "scroll") { return; }
    try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    const p = pos(e);
    grow(p[1]);
    if (tool === "pen") {
      live = { c: color, w: size, pts: [p] };
      redraw();
    } else {
      erasing = true;
      erasedNow = false;
      eraseAt(p);
    }
  }

  function move(e) {
    if (!note || !active) { return; }
    const p = pos(e);
    if (live) {
      const q = live.pts[live.pts.length - 1];
      if (Math.hypot(p[0] - q[0], p[1] - q[1]) >= 1.5) {
        live.pts.push(p);
        grow(p[1]);
        redraw();
      }
    } else if (erasing) {
      eraseAt(p);
    }
  }

  function up() {
    if (live && note) {
      remember();
      note.strokes.push(live);
      live = null;
      redraw();
      onChange();
      buttons();
    }
    live = null;
    erasing = false;
  }

  function undo() {
    if (!note || !undoStack.length) { return; }
    redoStack.push(note.strokes.slice());
    note.strokes = undoStack.pop();
    redraw();
    onChange();
    buttons();
  }

  function redo() {
    if (!note || !redoStack.length) { return; }
    undoStack.push(note.strokes.slice());
    note.strokes = redoStack.pop();
    redraw();
    onChange();
    buttons();
  }

  function buttons() {
    $("undo").disabled = !undoStack.length;
    $("redo").disabled = !redoStack.length;
    document.querySelectorAll("[data-tool]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.tool === tool));
    });
    document.querySelectorAll("[data-color]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.dataset.color === color));
    });
    document.querySelectorAll("[data-size]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(Number(b.dataset.size) === size));
    });
  }

  function setTool(t) {
    tool = t;
    canvas.style.touchAction = t === "scroll" ? "pan-y" : "none";
    buttons();
  }

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  $("undo").addEventListener("click", undo);
  $("redo").addEventListener("click", redo);
  document.querySelectorAll("[data-tool]").forEach(function (b) {
    b.addEventListener("click", function () { setTool(b.dataset.tool); });
  });
  document.querySelectorAll("[data-color]").forEach(function (b) {
    b.addEventListener("click", function () { color = b.dataset.color; setTool("pen"); });
  });
  document.querySelectorAll("[data-size]").forEach(function (b) {
    b.addEventListener("click", function () { size = Number(b.dataset.size); setTool("pen"); });
  });
  window.addEventListener("resize", function () { if (note) { applyHeight(); fit(); } });
  if (window.ResizeObserver) {
    new ResizeObserver(function () { if (note) { fit(); } }).observe(canvas);
  }
  if (dark && dark.addEventListener) { dark.addEventListener("change", redraw); }
  canvas.style.touchAction = "none";

  return {
    open: function (n, cb) {
      note = n;
      onChange = cb;
      undoStack = [];
      redoStack = [];
      live = null;
      erasing = false;
      applyHeight();
      buttons();
      fit();
    },
    close: function () { note = null; live = null; erasing = false; },
    setActive: function (on) { active = on; setTool(tool); }
  };
})();
