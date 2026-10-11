const Editor = (function () {
  const page = $("page");
  const titleEl = $("title");
  const bodyEl = $("body");
  const saved = $("saved");
  const stamp = $("stamp");
  let note = null;
  let timer = null;
  let inkOn = false;

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
    saved.textContent = err ? "บันทึกไม่ได้: " + err : "บันทึกแล้ว";
  }

  function schedule() {
    if (!note) { return; }
    note.updated = Date.now();
    stamp.textContent = stampText(note.updated);
    saved.textContent = "กำลังบันทึก";
    if (timer) { clearTimeout(timer); }
    timer = setTimeout(flush, 400);
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
      titleEl.value = n.title;
      bodyEl.value = n.body;
      saved.textContent = "";
      stamp.textContent = stampText(n.updated);
      page.scrollTop = 0;
      autosize();
      Ink.open(n, schedule);
      setMode(!n.body && n.strokes.length > 0);
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
    },
    discard: function () {
      if (!note) { return; }
      if (timer) { clearTimeout(timer); timer = null; }
      Store.remove([note.id]);
      Store.save();
      Ink.close();
      note = null;
    },
    flush: flush,
    focusBody: function () { bodyEl.focus(); }
  };
})();
