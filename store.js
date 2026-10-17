"use strict";

// Small IndexedDB wrapper for data that is too big for localStorage: notes, maps (small records plus the full
// image files kept in a separate store), and the rules library.
const Store = (() => {
  const DB_NAME = "dnd-sheet-data";
  const VERSION = 2;
  const STORES = ["notes", "maps", "mapfiles", "library"];
  let dbPromise = null;
  let failed = false;

  function open() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        if (typeof indexedDB === "undefined") {
          reject(new Error("IndexedDB is not available in this browser mode."));
          return;
        }
        const request = indexedDB.open(DB_NAME, VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          STORES.forEach((name) => {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: "id" });
            }
          });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error("The database is blocked by another open tab."));
      });
      dbPromise.catch(() => {
        failed = true;
      });
    }
    return dbPromise;
  }

  function run(storeName, mode, work) {
    return open().then(
      (db) =>
        new Promise((resolve, reject) => {
          const tx = db.transaction(storeName, mode);
          let holder = null;
          try {
            holder = work(tx.objectStore(storeName));
          } catch (error) {
            reject(error);
            return;
          }
          tx.oncomplete = () => resolve(holder && typeof holder === "object" && "result" in holder ? holder.result : undefined);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
    );
  }

  const getAll = (name) => run(name, "readonly", (store) => store.getAll());
  const get = (name, id) => run(name, "readonly", (store) => store.get(id));
  const put = (name, value) =>
    run(name, "readwrite", (store) => {
      store.put(value);
    });
  const putMany = (name, values) =>
    run(name, "readwrite", (store) => {
      values.forEach((value) => store.put(value));
    });
  const remove = (name, id) =>
    run(name, "readwrite", (store) => {
      store.delete(id);
    });
  const clear = (name) =>
    run(name, "readwrite", (store) => {
      store.clear();
    });

  // Asks the browser not to evict this data when storage is low. Harmless if refused.
  function requestPersistence() {
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
      return navigator.storage.persist().catch(() => false);
    }
    return Promise.resolve(false);
  }

  return { getAll, get, put, putMany, remove, clear, requestPersistence, available: () => !failed, ready: () => open().then(() => true, () => false) };
})();
