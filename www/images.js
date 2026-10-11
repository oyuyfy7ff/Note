const Images = (function () {
  const DB_NAME = "notemind-images";
  const STORE = "img";
  const MAX = 1600;
  let dbp = null;

  function open() {
    if (!dbp) {
      dbp = new Promise(function (resolve, reject) {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    }
    return dbp;
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(STORE, mode);
        const r = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(r ? r.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  function newId() {
    return "i" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        const k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const x = c.getContext("2d");
        x.fillStyle = "#ffffff";
        x.fillRect(0, 0, w, h);
        x.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b) { resolve(b); } else { reject(new Error("แปลงรูปไม่ได้")); }
        }, "image/jpeg", 0.86);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("เปิดรูปนี้ไม่ได้"));
      };
      img.src = url;
    });
  }

  return {
    add: function (file) {
      return shrink(file).then(function (blob) {
        const id = newId();
        return run("readwrite", function (s) { return s.put(blob, id); }).then(function () { return id; });
      });
    },
    get: function (id) {
      return run("readonly", function (s) { return s.get(id); });
    },
    remove: function (id) {
      return run("readwrite", function (s) { return s.delete(id); }).catch(function () { /* ignore */ });
    }
  };
})();
