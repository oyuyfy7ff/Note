const APP_VERSION = "1.7.0 (8)";

let editing = false;
let pushed = false;
let selecting = false;
let selected = new Set();

const DAY = 86400000;

function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
}

function groupName(ms, start) {
  if (ms >= start) { return "วันนี้"; }
  if (ms >= start - DAY) { return "เมื่อวาน"; }
  if (ms >= start - 7 * DAY) { return "7 วันก่อนหน้า"; }
  if (ms >= start - 30 * DAY) { return "30 วันก่อนหน้า"; }
  return "เก่ากว่า";
}

function rowTime(ms, start) {
  try {
    if (ms >= start) {
      return new Date(ms).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
    }
    return new Date(ms).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
  } catch (e) {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

function titleAndPreview(n) {
  const title = (n.title || "").trim();
  const lines = (n.body || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
  if (title) { return [title, lines.join(" ")]; }
  if (lines.length) { return [lines[0], lines.slice(1).join(" ")]; }
  return ["โน้ตใหม่", ""];
}

function show(name) {
  ["notes", "ai", "settings", "edit"].forEach(function (n) {
    $("view-" + n).hidden = n !== name;
  });
  const tabbed = name !== "edit";
  const sel = name === "notes" && selecting;
  $("nav").hidden = !tabbed || sel;
  $("selbar").hidden = !sel;
  $("new").hidden = !(name === "notes" && !selecting);
  document.querySelectorAll("#nav button").forEach(function (b) {
    if (b.dataset.tab === name) { b.setAttribute("aria-current", "page"); } else { b.removeAttribute("aria-current"); }
  });
}

function renderList() {
  const q = $("search").value.trim().toLowerCase();
  const box = $("list");
  box.textContent = "";
  const all = Store.all();
  const rows = all.filter(function (n) {
    return !q || (n.title + " " + n.body).toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) { return b.updated - a.updated; });
  const start = startOfToday();
  let lastGroup = "";
  let ul = null;
  rows.forEach(function (n) {
    const g = groupName(n.updated, start);
    if (g !== lastGroup) {
      lastGroup = g;
      const h = document.createElement("h2");
      h.className = "sec";
      h.textContent = g;
      ul = document.createElement("ul");
      ul.className = "group";
      box.appendChild(h);
      box.appendChild(ul);
    }
    const li = document.createElement("li");
    li.className = "nrow";
    li.setAttribute("role", "button");
    li.tabIndex = 0;
    if (selecting) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(n.id);
      cb.tabIndex = -1;
      li.appendChild(cb);
    }
    const tp = titleAndPreview(n);
    const grow = document.createElement("div");
    grow.className = "grow";
    const t = document.createElement("div");
    t.className = "t";
    t.textContent = tp[0];
    const m = document.createElement("div");
    m.className = "m";
    const extra = tp[1].slice(0, 60) || (n.images.length ? "รูปภาพ " + n.images.length + " รูป" : (n.strokes.length ? "เขียนมือ" : "ไม่มีข้อความเพิ่มเติม"));
    m.textContent = rowTime(n.updated, start) + "  " + extra;
    grow.appendChild(t);
    grow.appendChild(m);
    li.appendChild(grow);
    li.addEventListener("click", function () {
      if (selecting) {
        if (selected.has(n.id)) { selected.delete(n.id); } else { selected.add(n.id); }
        renderList();
      } else {
        openNote(n.id);
      }
    });
    ul.appendChild(li);
  });
  $("empty").textContent = q ? "ไม่พบโน้ต" : "ยังไม่มีโน้ต แตะปุ่มด้านล่างเพื่อสร้าง";
  $("empty").hidden = rows.length > 0;
  $("count").textContent = rows.length ? rows.length + " โน้ต" : "";
  $("sel-delete").textContent = "ลบที่เลือก (" + selected.size + ")";
  $("sel-delete").disabled = selected.size === 0;
  $("select").textContent = selecting ? "เสร็จ" : "เลือก";
}

function setSelecting(on) {
  selecting = on;
  selected = new Set();
  renderList();
  show("notes");
}

function renderAi() {
  Chat.show();
}

function renderSettings() {
  const s = Store.settings();
  $("apikey").value = s.apiKey;
  $("model").value = s.model;
  $("apikey").type = "password";
  $("showkey").textContent = "แสดง key";
  $("settings-msg").textContent = "";
  $("ver").textContent = "NoteMind v" + APP_VERSION;
}

function route() {
  const m = /^#\/note\/(.+)$/.exec(location.hash);
  if (m) {
    const n = Store.get(m[1]);
    if (n) {
      if (editing) { Editor.leave(); }
      Editor.open(n);
      editing = true;
      show("edit");
      return;
    }
  }
  if (editing) { Editor.leave(); editing = false; }
  const tab = location.hash === "#/ai" ? "ai" : (location.hash === "#/settings" ? "settings" : "notes");
  if (tab !== "notes") { selecting = false; }
  if (tab === "notes") { renderList(); }
  if (tab === "ai") { renderAi(); }
  if (tab === "settings") { renderSettings(); }
  show(tab);
}

function openNote(id) {
  pushed = true;
  location.hash = "#/note/" + id;
}

document.querySelectorAll("#nav button").forEach(function (b) {
  b.addEventListener("click", function () {
    location.replace(b.dataset.tab === "notes" ? "#/" : "#/" + b.dataset.tab);
  });
});

$("new").addEventListener("click", function () {
  const n = Store.add();
  openNote(n.id);
  setTimeout(function () { Editor.focusBody(); }, 50);
});

$("search").addEventListener("input", renderList);
$("select").addEventListener("click", function () { setSelecting(!selecting); });
$("sel-done").addEventListener("click", function () { setSelecting(false); });
$("sel-delete").addEventListener("click", function () {
  const ids = Array.from(selected);
  if (!ids.length) { return; }
  Dialog.ask("ลบ " + ids.length + " โน้ต", "ลบแล้วเอากลับมาไม่ได้", "ลบ", function () {
    Store.remove(ids);
    Store.save();
    setSelecting(false);
  });
});

$("back").addEventListener("click", function () {
  if (pushed) { pushed = false; history.back(); } else { location.replace("#/"); }
});
$("del").addEventListener("click", function () {
  Dialog.ask("ลบโน้ตนี้", "ลบแล้วเอากลับมาไม่ได้", "ลบ", function () {
    Editor.discard();
    editing = false;
    pushed = false;
    location.replace("#/");
    route();
  });
});

$("showkey").addEventListener("click", function () {
  const hidden = $("apikey").type === "password";
  $("apikey").type = hidden ? "text" : "password";
  $("showkey").textContent = hidden ? "ซ่อน key" : "แสดง key";
});
$("save-settings").addEventListener("click", function () {
  const err = Store.saveSettings({ apiKey: $("apikey").value.trim(), model: $("model").value.trim() });
  $("settings-msg").textContent = err ? "บันทึกไม่ได้: " + err : "บันทึกแล้ว";
});

document.addEventListener("visibilitychange", function () {
  if (document.visibilityState === "hidden") { Editor.flush(); }
});
window.addEventListener("pagehide", function () { Editor.flush(); });
window.addEventListener("hashchange", route);
route();
