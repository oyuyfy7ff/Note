const Editor = (function () {
  const page = $("page");
  const titleEl = $("title");
  const bodyEl = $("body");
  const saved = $("saved");
  const stamp = $("stamp");
  const strip = $("images");
  const fileEl = $("file");
  const GAP = 8;
  const MIN_W = 0.25;
  const TRASH = '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';
  let note = null;
  let timer = null;
  let inkOn = false;
  let notice = "";
  let urls = [];
  let token = 0;
  let sel = null;
  let drag = null;
  let quietUntil = 0;

  function stampText(ms) {
    try {
      return new Date(ms).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });
    } catch (e) {
      return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
    }
  }

  function autosize() {
    bodyEl.style.height = "auto";
    bodyEl.style.height = bodyEl.scrollHeight + "px";
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!note) { return; }
    note.title = titleEl.value;
    note.body = bodyEl.value;
    const err = Store.save();
    saved.textContent = (err ? "บันทึกไม่ได้: " + err : "บันทึกแล้ว") + (notice ? "  " + notice : "");
  }

  function schedule() {
    if (!note) { return; }
    note.updated = Date.now();
    stamp.textContent = stampText(note.updated);
    saved.textContent = "กำลังบันทึก";
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(flush, 400);
  }

  function clearUrls() {
    urls.forEach(function (u) { URL.revokeObjectURL(u); });
    urls = [];
  }

  function stripW() {
    return strip.clientWidth || 300;
  }

  function fitStrip() {
    if (!note) { strip.style.height = "0px"; return; }
    const W = stripW();
    let bottom = 0;
    note.images.forEach(function (id) {
      const l = note.layout[id];
      if (l) { bottom = Math.max(bottom, l.y + l.w * W * l.ar); }
    });
    strip.style.height = bottom > 0 ? Math.ceil(bottom + GAP) + "px" : "0px";
  }

  function place(fig, l) {
    fig.style.left = (l.x * 100) + "%";
    fig.style.width = (l.w * 100) + "%";
    fig.style.top = Math.round(l.y) + "px";
  }

  function control(kind, label, svg) {
    const c = document.createElement(kind === "del" ? "button" : "div");
    if (kind === "del") { c.type = "button"; }
    c.className = kind;
    c.setAttribute("aria-label", label);
    const dot = document.createElement("span");
    dot.className = "dot";
    if (svg) { dot.innerHTML = svg; }
    c.appendChild(dot);
    return c;
  }

  function select(id) {
    sel = id;
    Array.prototype.forEach.call(strip.children, function (f) {
      const on = !!id && f.dataset.id === id;
      f.classList.toggle("sel", on);
      Array.prototype.forEach.call(f.querySelectorAll(".del, .hnd"), function (c) { c.remove(); });
      if (!on) { return; }
      f.appendChild(control("del", "ลบรูป", TRASH));
      f.appendChild(control("hnd", "ปรับขนาดรูป", ""));
    });
  }

  function askDelete(id) {
    const mine = note;
    Dialog.ask("ลบรูปนี้", "ลบแล้วเอากลับมาไม่ได้", "ลบ", function () {
      mine.images = mine.images.filter(function (x) { return x !== id; });
      delete mine.layout[id];
      Images.remove(id);
      if (note === mine) { schedule(); renderImages(); } else { Store.save(); }
    });
  }

  function loadOne(id, t, fig, img) {
    return new Promise(function (resolve) {
      function done(ar) { resolve({ id: id, fig: fig, ar: ar }); }
      Images.get(id).then(function (blob) {
        if (!blob || t !== token) { done(0); return; }
        const u = URL.createObjectURL(blob);
        urls.push(u);
        img.onload = function () { done(img.naturalHeight / img.naturalWidth); };
        img.onerror = function () { done(0); };
        img.src = u;
      }).catch(function () { done(0); });
    });
  }

  function renderImages() {
    const t = ++token;
    clearUrls();
    strip.textContent = "";
    sel = null;
    drag = null;
    if (!note) { fitStrip(); return; }
    const mine = note;
    const jobs = mine.images.map(function (id) {
      const fig = document.createElement("figure");
      fig.className = "pic";
      fig.dataset.id = id;
      const img = document.createElement("img");
      img.alt = "รูปในโน้ต";
      img.draggable = false;
      fig.appendChild(img);
      strip.appendChild(fig);
      return loadOne(id, t, fig, img);
    });
    Promise.all(jobs).then(function (items) {
      if (t !== token || note !== mine) { return; }
      const W = stripW();
      let changed = false;
      let bottom = 0;
      items.forEach(function (it) {
        const l = mine.layout[it.id];
        if (it.ar) {
          if (l && Math.abs(l.ar - it.ar) > 0.001) { l.ar = it.ar; changed = true; }
        } else {
          it.fig.classList.add("broken");
          it.ar = l ? l.ar : 0.75;
        }
        if (l) { bottom = Math.max(bottom, l.y + l.w * W * l.ar); }
      });
      items.forEach(function (it) {
        if (mine.layout[it.id]) { return; }
        const y = bottom > 0 ? bottom + GAP : 0;
        mine.layout[it.id] = { x: 0, y: y, w: 1, ar: it.ar };
        bottom = y + W * it.ar;
        changed = true;
      });
      items.forEach(function (it) {
        place(it.fig, mine.layout[it.id]);
        it.fig.classList.add("ready");
      });
      fitStrip();
      if (changed) { Store.save(); }
    });
  }

  function addFiles(files) {
    if (!note || !files.length) { return; }
    const mine = note;
    let failed = 0;
    notice = "";
    saved.textContent = "กำลังเพิ่มรูป";
    files.reduce(function (p, f) {
      return p.then(function () {
        return Images.add(f).then(function (id) { mine.images.push(id); }).catch(function () { failed += 1; });
      });
    }, Promise.resolve()).then(function () {
      if (failed) { notice = "เพิ่มรูปไม่ได้ " + failed + " รูป"; }
      if (note === mine) { schedule(); renderImages(); } else { Store.save(); }
    });
  }

  function setMode(on) {
    inkOn = on;
    page.classList.toggle("ink", on);
    $("dock").hidden = !on;
    $("mode").setAttribute("aria-pressed", String(on));
    $("mode").setAttribute("aria-label", on ? "พิมพ์" : "เขียนมือ");
    Ink.setActive(on);
    if (on) { select(null); bodyEl.blur(); }
  }

  function endDrag() {
    if (!drag) { return; }
    const d = drag;
    drag = null;
    if (d.moved) { quietUntil = Date.now() + 300; schedule(); }
  }

  strip.addEventListener("click", function (e) {
    if (inkOn || !note || Date.now() < quietUntil) { return; }
    const fig = e.target.closest(".pic");
    if (!fig) { return; }
    if (e.target.closest(".del")) { askDelete(fig.dataset.id); return; }
    if (e.target.closest(".hnd")) { return; }
    select(fig.dataset.id);
  });

  strip.addEventListener("pointerdown", function (e) {
    if (inkOn || !note || !sel) { return; }
    const fig = e.target.closest(".pic");
    if (!fig || fig.dataset.id !== sel || e.target.closest(".del")) { return; }
    const l = note.layout[sel];
    if (!l) { return; }
    drag = { id: sel, fig: fig, size: !!e.target.closest(".hnd"), sx: e.clientX, sy: e.clientY, x: l.x, y: l.y, w: l.w, moved: false };
    try { fig.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
    e.preventDefault();
  });

  strip.addEventListener("pointermove", function (e) {
    if (!drag || !note) { return; }
    const l = note.layout[drag.id];
    if (!l) { return; }
    const W = stripW();
    const dx = e.clientX - drag.sx;
    const dy = e.clientY - drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) { drag.moved = true; }
    if (!drag.moved) { return; }
    if (drag.size) {
      l.w = Math.min(1 - l.x, Math.max(MIN_W, drag.w + ((dx + dy / l.ar) / 2) / W));
    } else {
      l.x = Math.min(1 - l.w, Math.max(0, drag.x + dx / W));
      l.y = Math.min(4000, Math.max(0, drag.y + dy));
    }
    place(drag.fig, l);
    fitStrip();
    e.preventDefault();
  });

  strip.addEventListener("pointerup", endDrag);
  strip.addEventListener("pointercancel", endDrag);

  titleEl.addEventListener("input", schedule);
  bodyEl.addEventListener("input", function () { autosize(); schedule(); });
  $("mode").addEventListener("click", function () { setMode(!inkOn); });
  $("add-img").addEventListener("click", function () { fileEl.click(); });
  fileEl.addEventListener("change", function () {
    const files = Array.from(fileEl.files || []);
    fileEl.value = "";
    addFiles(files);
  });
  window.addEventListener("resize", function () { if (note) { autosize(); fitStrip(); } });
  page.addEventListener("click", function (e) {
    if (sel && !e.target.closest(".pic")) { select(null); }
    if (inkOn || !note || (e.target !== page && e.target !== $("paper"))) { return; }
    bodyEl.focus();
    const n = bodyEl.value.length;
    try { bodyEl.setSelectionRange(n, n); } catch (x) { /* ignore */ }
  });

  return {
    open: function (n) {
      note = n;
      notice = "";
      titleEl.value = n.title;
      bodyEl.value = n.body;
      saved.textContent = "";
      stamp.textContent = stampText(n.updated);
      page.scrollTop = 0;
      autosize();
      renderImages();
      Ink.open(n, schedule);
      setMode(!n.body && n.strokes.length > 0 && n.images.length === 0);
    },
    leave: function () {
      if (!note) { return; }
      flush();
      if (Store.isEmpty(note)) {
        Store.remove([note.id]);
        Store.save();
      }
      Ink.close();
      note = null;
      renderImages();
    },
    discard: function () {
      if (!note) { return; }
      if (timer) { clearTimeout(timer); timer = null; }
      Store.remove([note.id]);
      Store.save();
      Ink.close();
      note = null;
      renderImages();
    },
    flush: flush,
    focusBody: function () { bodyEl.focus(); }
  };
})();
