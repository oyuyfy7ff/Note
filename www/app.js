const APP_VERSION = "1.2.0 (3)";
const KEY = "notemind.notes";
const $ = function (id) { return document.getElementById(id); };

let notes = load();
let current = null;
let timer = null;
let pushed = false;

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(notes));
    return true;
  } catch (e) {
    $("saved").textContent = "บันทึกไม่ได้: " + e.message;
    return false;
  }
}

function fmt(ms) {
  try {
    return new Date(ms).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  } catch (e) {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function isDraw(n) {
  return n.type === "draw";
}

function isEmpty(n) {
  if (n.title.trim()) { return false; }
  return isDraw(n) ? !(n.strokes && n.strokes.length) : !n.body.trim();
}

function show(name) {
  $("view-list").hidden = name !== "list";
  $("view-edit").hidden = name !== "edit";
}

function renderList() {
  const box = $("list");
  box.textContent = "";
  const sorted = notes.slice().sort(function (a, b) { return b.updated - a.updated; });
  sorted.forEach(function (n) {
    const li = document.createElement("li");
    li.className = "row";
    li.setAttribute("role", "button");
    li.tabIndex = 0;
    const grow = document.createElement("div");
    grow.className = "grow";
    const t = document.createElement("div");
    t.style.fontWeight = "600";
    t.textContent = n.title || "ไม่มีหัวข้อ";
    const m = document.createElement("div");
    m.className = "muted small";
    const what = isDraw(n)
      ? "เขียนมือ " + (n.strokes ? n.strokes.length : 0) + " เส้น"
      : (n.body || "").replace(/\s+/g, " ").slice(0, 60);
    m.textContent = fmt(n.updated) + (what ? "  " + what : "");
    grow.appendChild(t);
    grow.appendChild(m);
    li.appendChild(grow);
    li.addEventListener("click", function () { openNote(n.id); });
    box.appendChild(li);
  });
  $("empty").hidden = notes.length > 0;
  $("ver").textContent = "NoteMind v" + APP_VERSION;
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (current) {
    current.title = $("title").value;
    if (!isDraw(current)) { current.body = $("body").value; }
    if (persist()) { $("saved").textContent = "บันทึกแล้ว"; }
  }
}

function leaveEdit() {
  if (!current) { return; }
  flush();
  if (isEmpty(current)) {
    notes = notes.filter(function (n) { return n.id !== current.id; });
    persist();
  }
  Draw.close();
  current = null;
}

function schedule() {
  $("saved").textContent = "กำลังบันทึก";
  if (current) { current.updated = Date.now(); }
  if (timer) { clearTimeout(timer); }
  timer = setTimeout(flush, 400);
}

function route() {
  const m = /^#\/note\/(.+)$/.exec(location.hash);
  if (m) {
    const n = notes.find(function (x) { return x.id === m[1]; });
    if (n) {
      if (current && current.id !== n.id) { leaveEdit(); }
      current = n;
      $("title").value = n.title;
      $("saved").textContent = "";
      const d = isDraw(n);
      $("text-fields").hidden = d;
      $("draw-area").hidden = !d;
      $("tools").hidden = !d;
      if (!d) { $("body").value = n.body; }
      show("edit");
      if (d) { Draw.open(n, schedule); }
      return;
    }
  }
  leaveEdit();
  renderList();
  show("list");
}

function openNote(id) {
  pushed = true;
  location.hash = "#/note/" + id;
}

function create(type) {
  const n = { id: newId(), type: type, title: "", updated: Date.now() };
  if (type === "draw") { n.strokes = []; } else { n.body = ""; }
  notes.push(n);
  openNote(n.id);
  if (type === "text") { setTimeout(function () { $("body").focus(); }, 50); }
}

$("new").addEventListener("click", function () { create("text"); });
$("new-draw").addEventListener("click", function () { create("draw"); });

$("back").addEventListener("click", function () {
  if (pushed) { pushed = false; history.back(); } else { location.hash = "#/"; }
});

$("title").addEventListener("input", schedule);
$("body").addEventListener("input", schedule);

$("del").addEventListener("click", function () { $("confirm").hidden = false; });
$("confirm-no").addEventListener("click", function () { $("confirm").hidden = true; });
$("confirm-yes").addEventListener("click", function () {
  $("confirm").hidden = true;
  if (current) {
    const id = current.id;
    notes = notes.filter(function (n) { return n.id !== id; });
    persist();
    Draw.close();
    current = null;
  }
  location.hash = "#/";
});

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") { flush(); }
});
window.addEventListener("pagehide", flush);
window.addEventListener("hashchange", route);
route();
