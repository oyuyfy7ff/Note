const APP_VERSION = "1.3.0 (4)";

let editing = false;
let pushed = false;
let selecting = false;
let selected = new Set();

function fmt(ms) {
  try {
    return new Date(ms).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  } catch (e) {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
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
  rows.forEach(function (n) {
    const li = document.createElement("li");
    li.className = "row";
    li.setAttribute("role", "button");
    li.tabIndex = 0;
    if (selecting) {
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(n.id);
      cb.tabIndex = -1;
      li.appendChild(cb);
    }
    const grow = document.createElement("div");
    grow.className = "grow";
    const t = document.createElement("div");
    t.style.fontWeight = "600";
    t.textContent = n.title || "ไม่มีหัวข้อ";
    const m = document.createElement("div");
    m.className = "muted small";
    const text = (n.body || "").replace(/\s+/g, " ").slice(0, 50);
    const ink = n.strokes.length ? "เขียนมือ " + n.strokes.length + " เส้น" : "";
    m.textContent = [fmt(n.updated), text, ink].filter(Boolean).join("  ");
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
    box.appendChild(li);
  });
  $("empty").textContent = q ? "ไม่พบโน้ต" : "ยังไม่มีโน้ต กดปุ่ม + เพื่อสร้าง";
  $("empty").hidden = rows.length > 0;
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
  const s = Store.settings();
  $("ai-status").textContent = (s.apiKey ? "API key: ตั้งค่าแล้ว" : "API key: ยังไม่ได้ตั้งค่า (ไปที่หน้าตั้งค่า)") +
    "   โมเดล: " + (s.model || "ยังไม่ได้ตั้งค่า");
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
