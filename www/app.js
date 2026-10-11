const APP_VERSION = "1.1.0 (2)";
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
    const preview = (n.body || "").replace(/\s+/g, " ").slice(0, 60);
    m.textContent = fmt(n.updated) + (preview ? "  " + preview : "");
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
    current.body = $("body").value;
    if (persist()) { $("saved").textContent = "บันทึกแล้ว"; }
  }
}

function leaveEdit() {
  if (!current) { return; }
  flush();
  if (!current.title.trim() && !current.body.trim()) {
    notes = notes.filter(function (n) { return n.id !== current.id; });
    persist();
  }
  current = null;
}

function route() {
  const m = /^#\/note\/(.+)$/.exec(location.hash);
  if (m) {
    const n = notes.find(function (x) { return x.id === m[1]; });
    if (n) {
      if (current && current.id !== n.id) { leaveEdit(); }
      current = n;
      $("title").value = n.title;
      $("body").value = n.body;
      $("saved").textContent = "";
      show("edit");
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

function schedule() {
  $("saved").textContent = "กำลังบันทึก";
  if (current) { current.updated = Date.now(); }
  if (timer) { clearTimeout(timer); }
  timer = setTimeout(flush, 400);
}

$("new").addEventListener("click", function () {
  const n = { id: newId(), type: "text", title: "", body: "", updated: Date.now() };
  notes.push(n);
  openNote(n.id);
  setTimeout(function () { $("body").focus(); }, 50);
});

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
