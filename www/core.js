const $ = function (id) { return document.getElementById(id); };

const Store = (function () {
  const NOTES_KEY = "notemind.notes";
  const SET_KEY = "notemind.settings";

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return null;
    } catch (e) {
      return e.message;
    }
  }

  function norm(n) {
    n.title = n.title || "";
    n.body = n.body || "";
    n.strokes = Array.isArray(n.strokes) ? n.strokes : [];
    n.h = n.h || 1200;
    n.updated = n.updated || Date.now();
    return n;
  }

  const stored = read(NOTES_KEY, []);
  let notes = (Array.isArray(stored) ? stored : []).map(norm);

  return {
    all: function () { return notes; },
    get: function (id) { return notes.find(function (n) { return n.id === id; }); },
    add: function () {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const n = norm({ id: id, updated: Date.now() });
      notes.push(n);
      return n;
    },
    remove: function (ids) {
      notes = notes.filter(function (n) { return ids.indexOf(n.id) < 0; });
    },
    isEmpty: function (n) {
      return !n.title.trim() && !n.body.trim() && n.strokes.length === 0;
    },
    save: function () { return write(NOTES_KEY, notes); },
    settings: function () {
      return Object.assign({ apiKey: "", model: "" }, read(SET_KEY, {}));
    },
    saveSettings: function (s) { return write(SET_KEY, s); }
  };
})();

const Dialog = (function () {
  let onYes = null;
  $("confirm-no").addEventListener("click", function () { $("confirm").hidden = true; });
  $("confirm-yes").addEventListener("click", function () {
    $("confirm").hidden = true;
    if (onYes) { onYes(); }
  });
  return {
    ask: function (title, text, label, fn) {
      $("confirm-title").textContent = title;
      $("confirm-text").textContent = text;
      $("confirm-yes").textContent = label;
      onYes = fn;
      $("confirm").hidden = false;
    }
  };
})();
