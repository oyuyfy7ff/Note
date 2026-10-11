const Editor = (function () {
  const page = $("page");
  const titleEl = $("title");
  const bodyEl = $("body");
  const saved = $("saved");
  const stamp = $("stamp");
  const strip = $("images");
  const fileEl = $("file");
  let note = null;
  let timer = null;
  let inkOn = false;
  let notice = "";
  let urls = [];
  let token = 0;

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

  function renderImages() {
    const t = ++token;
    clearUrls();
    strip.textContent = "";
    if (!note) { return; }
    const mine = note;
    mine.images.forEach(function (id) {
      const fig = document.createElement("figure");
      fig.className = "pic";
      const img = document.createElement("img");
      img.alt = "รูปในโน้ต";
      fig.appendChild(img);
      Images.get(id).then(function (blob) {
        if (!blob || t !== token) { return; }
        const u = URL.createObjectURL(blob);
        urls.push(u);
        img.src = u;
      }).catch(function () { fig.classList.add("broken"); });
      fig.addEventListener("click", function () {
        if (inkOn) { return; }
        Dialog.ask("ลบรูปนี้", "ลบแล้วเอากลับมาไม่ได้", "ลบ", function () {
          mine.images = mine.images.filter(function (x) { return x !== id; });
          Images.remove(id);
          if (note === mine) { schedule(); renderImages(); } else { Store.save(); }
        });
      });
      strip.appendChild(fig);
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
    if (on) { bodyEl.blur(); }
  }

  titleEl.addEventListener("input", schedule);
  bodyEl.addEventListener("input", function () { autosize(); schedule(); });
  $("mode").addEventListener("click", function () { setMode(!inkOn); });
  $("add-img").addEventListener("click", function () { fileEl.click(); });
  fileEl.addEventListener("change", function () {
    const files = Array.from(fileEl.files || []);
    fileEl.value = "";
    addFiles(files);
  });
  window.addEventListener("resize", function () { if (note) { autosize(); } });
  page.addEventListener("click", function (e) {
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
