const Chat = (function () {
  const KEY = "notemind.chat";
  const KEEP = 40;
  const SEND = 16;
  const API = "https://openrouter.ai/api/v1/chat/completions";
  const SYSTEM = "คุณเป็นผู้ช่วยในแอปจดโน้ต ตอบเป็นภาษาเดียวกับผู้ใช้ (ค่าเริ่มต้นคือภาษาไทย) ให้กระชับและชัดเจน ใช้หัวข้อย่อยเมื่อมีหลายประเด็น";
  const NOTE_MAX = 6000;
  const FIND_MAX = 1500;
  const listEl = $("chat");
  const emptyEl = $("chat-empty");
  const errEl = $("chat-err");
  const inputEl = $("chat-input");
  const sendEl = $("chat-send");
  const toolEls = ["act-sum", "act-ana", "act-find", "chat-clear"].map($);
  let msgs = load();
  let busy = false;

  function load() {
    try {
      const r = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(r) ? r.filter(function (m) {
        return m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
      }) : [];
    } catch (e) {
      return [];
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(msgs.slice(-KEEP))); } catch (e) { /* ignore */ }
  }

  function showErr(text) {
    errEl.textContent = text;
    errEl.hidden = !text;
  }

  function inline(parent, text) {
    text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/).forEach(function (part) {
      if (!part) { return; }
      if (part.length > 4 && part.slice(0, 2) === "**" && part.slice(-2) === "**") {
        const b = document.createElement("strong");
        b.textContent = part.slice(2, -2);
        parent.appendChild(b);
      } else if (part.length > 2 && part.charAt(0) === "`" && part.slice(-1) === "`") {
        const c = document.createElement("code");
        c.textContent = part.slice(1, -1);
        parent.appendChild(c);
      } else {
        parent.appendChild(document.createTextNode(part));
      }
    });
  }

  function fill(el, text) {
    const lines = text.split("\n");
    lines.forEach(function (line, i) {
      const h = /^#{1,6}\s+(.*)$/.exec(line);
      const li = /^\s*[-*]\s+(.*)$/.exec(line);
      if (h) {
        const s = document.createElement("strong");
        inline(s, h[1]);
        el.appendChild(s);
      } else if (li) {
        el.appendChild(document.createTextNode("• "));
        inline(el, li[1]);
      } else {
        inline(el, line);
      }
      if (i < lines.length - 1) { el.appendChild(document.createTextNode("\n")); }
    });
  }

  function scrollDown() {
    requestAnimationFrame(function () { window.scrollTo(0, document.body.scrollHeight); });
  }

  function render() {
    listEl.textContent = "";
    msgs.forEach(function (m) {
      const b = document.createElement("div");
      b.className = "bubble" + (m.role === "user" ? " me" : "");
      if (m.role === "user") { b.textContent = m.shown || m.content; } else { fill(b, m.content); }
      listEl.appendChild(b);
    });
    if (busy) {
      const b = document.createElement("div");
      b.className = "bubble thinking";
      b.textContent = "กำลังคิด...";
      listEl.appendChild(b);
    }
    emptyEl.hidden = msgs.length > 0 || busy;
    sendEl.disabled = busy;
    toolEls.forEach(function (t) { t.disabled = busy; });
    scrollDown();
  }

  function explain(status, j) {
    const detail = j && j.error && j.error.message ? " (" + j.error.message + ")" : "";
    if (status === 401) { return "API key ไม่ถูกต้อง ตรวจที่หน้าตั้งค่า"; }
    if (status === 402) { return "เครดิต OpenRouter ไม่พอ" + detail; }
    if (status === 404) { return "ไม่พบโมเดลนี้ ตรวจชื่อโมเดลที่หน้าตั้งค่า" + detail; }
    if (status === 429) { return "ใช้ถี่เกินไป รอสักครู่แล้วลองใหม่" + detail; }
    return "AI ตอบกลับผิดพลาด รหัส " + status + detail;
  }

  function ask(s, history) {
    const h = history.slice();
    while (h.length && h[0].role !== "user") { h.shift(); }
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 90000);
    const body = {
      model: s.model,
      messages: [{ role: "system", content: SYSTEM }].concat(h.map(function (m) {
        return { role: m.role, content: m.content };
      }))
    };
    return fetch(API, {
      method: "POST",
      signal: ctrl.signal,
      headers: { "Authorization": "Bearer " + s.apiKey, "Content-Type": "application/json", "X-Title": "NoteMind" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.text().then(function (txt) {
        let j = null;
        try { j = JSON.parse(txt); } catch (e) { /* not json */ }
        if (!res.ok) { throw new Error(explain(res.status, j)); }
        const c = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
        if (!c) { throw new Error("AI ไม่ได้ตอบกลับ" + (j && j.error && j.error.message ? ": " + j.error.message : "")); }
        return String(c);
      });
    }).catch(function (e) {
      if (e && e.name === "AbortError") { throw new Error("รอนานเกินไป ลองใหม่อีกครั้ง"); }
      if (e instanceof TypeError) { throw new Error("เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ต"); }
      throw e;
    }).then(function (r) { clearTimeout(timer); return r; }, function (e) { clearTimeout(timer); throw e; });
  }

  function submit(content, shown, restore) {
    if (busy) { return; }
    const s = Store.settings();
    if (!s.apiKey || !s.model) {
      showErr("ยังไม่ได้ตั้งค่า API key หรือชื่อโมเดล ไปที่แท็บตั้งค่า");
      if (restore) { inputEl.value = restore; }
      return;
    }
    showErr("");
    msgs.push({ role: "user", content: content, shown: shown });
    busy = true;
    save();
    render();
    ask(s, msgs.slice(-SEND)).then(function (reply) {
      msgs.push({ role: "assistant", content: reply });
    }, function (e) {
      msgs.pop();
      showErr(e.message);
      if (restore) { inputEl.value = restore; growInput(); }
    }).then(function () {
      busy = false;
      save();
      render();
    });
  }

  function nameOf(n) {
    const t = (n.title || "").trim();
    if (t) { return t; }
    const first = (n.body || "").split("\n").map(function (x) { return x.trim(); }).filter(Boolean)[0];
    return first ? first.slice(0, 40) : "โน้ตใหม่";
  }

  function textOf(n, max) {
    const t = ((n.title ? n.title + "\n" : "") + (n.body || "")).trim();
    return t.length > max ? t.slice(0, max) + "\n(ตัดทอน)" : t;
  }

  function runNote(kind, n) {
    if (!(n.body || "").trim() && !(n.title || "").trim()) {
      showErr("โน้ตนี้ไม่มีข้อความให้ AI อ่าน (เป็นรูปหรือเขียนมือ)");
      return;
    }
    const what = kind === "sum"
      ? "สรุปโน้ตต่อไปนี้ให้สั้นและตรงประเด็น"
      : "วิเคราะห์โน้ตต่อไปนี้ บอกประเด็นสำคัญ สิ่งที่ควรทำต่อ และข้อสังเกต";
    submit(what + "\n\n" + textOf(n, NOTE_MAX), (kind === "sum" ? "สรุปโน้ต: " : "วิเคราะห์โน้ต: ") + nameOf(n), "");
  }

  function openPicker(kind) {
    if (busy) { return; }
    showErr("");
    $("pick-title").textContent = kind === "sum" ? "เลือกโน้ตที่จะสรุป" : "เลือกโน้ตที่จะวิเคราะห์";
    const ul = $("pick-list");
    ul.textContent = "";
    const notes = Store.all().slice().sort(function (a, b) { return b.updated - a.updated; });
    if (!notes.length) {
      const li = document.createElement("li");
      li.className = "nrow muted";
      li.textContent = "ยังไม่มีโน้ต";
      ul.appendChild(li);
    }
    notes.forEach(function (n) {
      const li = document.createElement("li");
      li.className = "nrow";
      li.setAttribute("role", "button");
      li.tabIndex = 0;
      const grow = document.createElement("div");
      grow.className = "grow";
      const t = document.createElement("div");
      t.className = "t";
      t.textContent = nameOf(n);
      const m = document.createElement("div");
      m.className = "m";
      m.textContent = (n.body || "").trim() ? (n.body || "").trim().replace(/\s+/g, " ").slice(0, 60) : (n.images.length ? "รูปภาพ" : "เขียนมือหรือว่าง");
      grow.appendChild(t);
      grow.appendChild(m);
      li.appendChild(grow);
      li.addEventListener("click", function () {
        $("pick").hidden = true;
        runNote(kind, n);
      });
      ul.appendChild(li);
    });
    $("pick").hidden = false;
  }

  function findNotes(q) {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const withText = Store.all().filter(function (n) { return (n.title + n.body).trim(); });
    const scored = withText.map(function (n) {
      const hay = (n.title + " " + n.body).toLowerCase();
      let score = 0;
      terms.forEach(function (t) { if (hay.indexOf(t) >= 0) { score += 1; } });
      return { n: n, score: score };
    }).filter(function (x) { return x.score > 0; }).sort(function (a, b) {
      return b.score - a.score || b.n.updated - a.n.updated;
    });
    if (scored.length) { return { notes: scored.slice(0, 5).map(function (x) { return x.n; }), fallback: false }; }
    const recent = withText.sort(function (a, b) { return b.updated - a.updated; }).slice(0, 5);
    return { notes: recent, fallback: true };
  }

  function runFind() {
    const q = inputEl.value.trim();
    if (!q) { showErr("พิมพ์คำถามหรือคำค้นในช่องข้อความก่อน แล้วกดค้นหาในโน้ต"); return; }
    const r = findNotes(q);
    if (!r.notes.length) { showErr("ยังไม่มีโน้ตที่เป็นข้อความให้ค้น"); return; }
    const parts = r.notes.map(function (n, i) { return "[โน้ต " + (i + 1) + ": " + nameOf(n) + "]\n" + textOf(n, FIND_MAX); });
    const head = r.fallback ? "ไม่พบโน้ตที่มีคำตรงกัน จึงส่งโน้ตล่าสุดมาแทน\n\n" : "";
    const prompt = head + "นี่คือโน้ตของฉัน:\n\n" + parts.join("\n\n") + "\n\nคำถาม: " + q + "\nตอบจากโน้ตเหล่านี้เท่านั้น ถ้าไม่มีข้อมูลให้บอกตรง ๆ และบอกว่าข้อมูลมาจากโน้ตไหน";
    inputEl.value = "";
    growInput();
    submit(prompt, "ค้นหาในโน้ต: " + q, q);
  }

  function growInput() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + "px";
  }

  function sendTyped() {
    const text = inputEl.value.trim();
    if (!text || busy) { return; }
    inputEl.value = "";
    growInput();
    submit(text, text, text);
  }

  sendEl.addEventListener("click", sendTyped);
  inputEl.addEventListener("input", growInput);
  $("act-sum").addEventListener("click", function () { openPicker("sum"); });
  $("act-ana").addEventListener("click", function () { openPicker("ana"); });
  $("act-find").addEventListener("click", runFind);
  $("pick-no").addEventListener("click", function () { $("pick").hidden = true; });
  $("chat-clear").addEventListener("click", function () {
    if (!msgs.length) { return; }
    Dialog.ask("ล้างแชต", "ข้อความทั้งหมดในแชตจะหายไป", "ล้าง", function () {
      msgs = [];
      save();
      showErr("");
      render();
    });
  });

  return {
    show: function () {
      const s = Store.settings();
      $("ai-status").textContent = s.apiKey && s.model
        ? "โมเดล: " + s.model
        : "ยังไม่ได้ตั้งค่า API key หรือชื่อโมเดล (ไปที่แท็บตั้งค่า)";
      render();
    }
  };
})();
