"use strict";

// Maps tab: import images (maps, handouts), browse them as a gallery, and view them with zoom and pan.
// Small records and thumbnails live in the "maps" store; the full image files live in "mapfiles".

// ---- Pure helpers (also exercised by tests in Node) ----

const IMAGE_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  bmp: "image/bmp",
  svg: "image/svg+xml"
};
const TYPE_EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/bmp": "bmp",
  "image/svg+xml": "svg"
};
const MAX_IMAGE_BYTES = 250 * 1024 * 1024;

function guessImageType(name, type) {
  if (type && Object.prototype.hasOwnProperty.call(TYPE_EXTENSIONS, type)) {
    return type;
  }
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name ?? ""));
  const byExtension = match ? IMAGE_TYPES[match[1].toLowerCase()] : "";
  return byExtension || "";
}

function cleanMapName(filename) {
  const base = String(filename ?? "")
    .split(/[\\/]/)
    .pop()
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (base || "Untitled map").slice(0, 120);
}

function asciiSlug(text) {
  return (
    String(text ?? "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "map"
  );
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function normalizeMap(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const now = Date.now();
  const whole = (value, fallback = 0) => (Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : fallback);
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 60) : `m_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name: String(r.name ?? "").trim().slice(0, 120) || "Untitled map",
    group: String(r.group ?? "").trim().slice(0, 60),
    note: String(r.note ?? "").slice(0, 2000),
    type: guessImageType("", r.type) || "image/png",
    size: whole(r.size),
    width: whole(r.width),
    height: whole(r.height),
    created: whole(r.created, now),
    updated: whole(r.updated, now),
    thumb: r.thumb || null
  };
}

function filterMaps(maps, query, group) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return maps.filter((map) => {
    if (group === "__none") {
      if (map.group) {
        return false;
      }
    } else if (group && map.group !== group) {
      return false;
    }
    if (!words.length) {
      return true;
    }
    const hay = `${map.name}\n${map.group}\n${map.note}`.toLowerCase();
    return words.every((word) => hay.includes(word));
  });
}

function sortMaps(maps, mode) {
  const copy = maps.slice();
  if (mode === "name") {
    copy.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  } else if (mode === "oldest") {
    copy.sort((a, b) => a.created - b.created);
  } else {
    copy.sort((a, b) => b.created - a.created);
  }
  return copy;
}

// Unique, zip-safe file names for a backup, in order.
function uniqueFileNames(maps) {
  const used = new Set();
  return maps.map((map) => {
    const extension = TYPE_EXTENSIONS[map.type] || "img";
    const stem = asciiSlug(map.name);
    let candidate = `images/${stem}.${extension}`;
    let counter = 2;
    while (used.has(candidate.toLowerCase())) {
      candidate = `images/${stem}-${counter}.${extension}`;
      counter += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

// ---- Maps tab UI ----

const Maps = (() => {
  const PAGE = 120;
  const state = {
    maps: [],
    loaded: false,
    storageOk: true,
    query: "",
    group: "",
    sort: "recent",
    limit: PAGE,
    thumbUrls: [],
    viewerId: null,
    busy: false
  };
  const view = { url: "", scale: 1, x: 0, y: 0, fit: 1, iw: 1, ih: 1, pointers: new Map(), pinch: null, pan: null, lastTap: null, observer: null };

  const $ = (id) => document.getElementById(id);

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (key === "class") {
        node.className = value;
      } else if (key === "text") {
        node.textContent = value;
      } else if (value !== false && value !== null && value !== undefined) {
        node.setAttribute(key, value === true ? "" : value);
      }
    });
    children.flat().forEach((child) => {
      if (child !== null && child !== undefined && child !== false) {
        node.append(child);
      }
    });
    return node;
  }

  const isOpen = () => typeof Tabs !== "undefined" && Tabs.current() === "maps";

  function say(message, kind = "") {
    const status = $("mapsStatus");
    status.textContent = message;
    status.className = `muted notes-status ${kind}`.trim();
  }

  function newId() {
    return `m_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---- loading ----

  async function load() {
    try {
      const rows = await Store.getAll("maps");
      state.maps = rows.map(normalizeMap);
      state.storageOk = true;
    } catch (error) {
      state.maps = [];
      state.storageOk = false;
    }
    state.loaded = true;
    $("mapsStorageWarning").hidden = state.storageOk;
    render();
    showUsage();
  }

  async function showUsage() {
    const usage = $("mapsUsage");
    usage.textContent = "";
    if (!(navigator.storage && navigator.storage.estimate) || !state.maps.length) {
      return;
    }
    try {
      const { usage: used, quota } = await navigator.storage.estimate();
      if (used && quota) {
        usage.textContent = `This site is using ${formatBytes(used)} of about ${formatBytes(quota)} available in this browser.`;
      }
    } catch {
      usage.textContent = "";
    }
  }

  // ---- gallery ----

  function groupsOf(maps) {
    return Array.from(new Set(maps.map((m) => m.group).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }

  function renderFilters() {
    const select = $("mapsGroup");
    const groups = groupsOf(state.maps);
    select.textContent = "";
    select.append(el("option", { value: "", text: "All groups" }));
    if (state.maps.some((m) => !m.group)) {
      select.append(el("option", { value: "__none", text: "No group" }));
    }
    groups.forEach((group) => select.append(el("option", { value: group, text: group })));
    if (state.group && state.group !== "__none" && !groups.includes(state.group)) {
      state.group = "";
    }
    select.value = state.group;

    const list = $("mapGroups");
    list.textContent = "";
    groups.forEach((group) => list.append(el("option", { value: group })));
  }

  function currentList() {
    return sortMaps(filterMaps(state.maps, state.query, state.group), state.sort);
  }

  function renderGrid() {
    state.thumbUrls.forEach((url) => URL.revokeObjectURL(url));
    state.thumbUrls = [];
    const grid = $("mapsGrid");
    grid.textContent = "";
    const total = state.maps.length;
    const list = currentList();
    const searching = Boolean(state.query.trim() || state.group);

    $("mapsSummary").textContent = !total ? "No maps yet." : searching ? `${list.length} of ${total} maps.` : `${total} map${total === 1 ? "" : "s"}.`;
    $("mapsSearchClear").hidden = !state.query;

    if (!total) {
      grid.append(
        el(
          "div",
          { class: "maps-empty" },
          el("h2", { text: "Your maps" }),
          el("p", { class: "muted", text: "Import map images, handouts, or art. You can also drag images onto this page, or paste one from your clipboard." }),
          el("button", { type: "button", class: "chip-btn primary", "data-import": "1", text: "Import images" })
        )
      );
      return;
    }
    if (!list.length) {
      grid.append(el("div", { class: "maps-empty" }, el("p", { text: "No maps match." }), el("p", { class: "muted", text: "Try a different search, or choose All groups." })));
      return;
    }

    const visible = list.slice(0, state.limit);
    const ul = el("ul", { class: "map-cards" });
    visible.forEach((map) => {
      const img = el("img", { alt: "", class: "map-thumb" });
      if (map.thumb) {
        const url = URL.createObjectURL(map.thumb);
        state.thumbUrls.push(url);
        img.src = url;
      }
      ul.append(
        el(
          "li",
          {},
          el(
            "button",
            { type: "button", class: "map-card", "data-id": map.id, "aria-label": `Open ${map.name}` },
            el("span", { class: "map-thumb-wrap" }, img),
            el("span", { class: "map-name", text: map.name }),
            el("span", { class: "map-meta", text: [map.group, map.width && map.height ? `${map.width} x ${map.height}` : ""].filter(Boolean).join("  ") })
          )
        )
      );
    });
    grid.append(ul);
    if (list.length > visible.length) {
      grid.append(el("button", { type: "button", class: "chip-btn more-btn", "data-more": "1", text: `Show ${Math.min(PAGE, list.length - visible.length)} more (${list.length - visible.length} left)` }));
    }
  }

  function render() {
    renderFilters();
    renderGrid();
    renderBackupNotice();
  }

  function renderBackupNotice() {
    let last = null;
    try {
      last = localStorage.getItem("dnd-maps-last-export");
    } catch {
      last = null;
    }
    const days = last ? (Date.now() - Number(last)) / 86400000 : Infinity;
    const needed = state.maps.length >= 3 && days > 30;
    $("mapsBackup").hidden = !needed;
    if (needed) {
      $("mapsBackupText").textContent = last
        ? `Your last backup was ${Math.floor(days)} days ago. Your maps live only in this browser.`
        : "Your maps live only in this browser and have never been backed up.";
    }
  }

  // ---- importing ----

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("This image could not be read."));
      };
      img.src = url;
    });
  }

  async function makeThumb(blob) {
    const { img, url } = await loadImage(blob);
    try {
      const width = img.naturalWidth || 1024;
      const height = img.naturalHeight || 768;
      const scale = Math.min(1, 480 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#241d18";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(img, 0, 0, canvas.width, canvas.height);
      let thumb = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
      if (!thumb || thumb.type !== "image/webp") {
        thumb = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      }
      return { thumb, width, height };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const duplicateKey = (name, size) => `${String(name).toLowerCase()}|${size}`;

  // meta: { fileName, name, group, note, id, created }
  async function addImage(blob, meta, summary) {
    const fileName = meta.fileName || meta.name || "map";
    const type = guessImageType(fileName, blob.type);
    if (!type) {
      throw new Error("This is not an image file.");
    }
    if (blob.size > MAX_IMAGE_BYTES) {
      throw new Error(`This image is larger than ${formatBytes(MAX_IMAGE_BYTES)}.`);
    }
    if (meta.id && state.maps.some((m) => m.id === meta.id)) {
      summary.skipped += 1;
      return;
    }
    const existing = state.maps.some((m) => duplicateKey(m.name, m.size) === duplicateKey(meta.name || cleanMapName(fileName), blob.size));
    if (existing) {
      summary.skipped += 1;
      return;
    }
    const typed = blob.type === type ? blob : new Blob([blob], { type });
    const { thumb, width, height } = await makeThumb(typed);
    const now = Date.now();
    const record = normalizeMap({
      id: meta.id || newId(),
      name: meta.name || cleanMapName(fileName),
      group: meta.group || "",
      note: meta.note || "",
      type,
      size: typed.size,
      width,
      height,
      created: meta.created || now + summary.added,
      updated: now,
      thumb
    });
    if (state.storageOk) {
      await Store.put("mapfiles", { id: record.id, blob: typed });
      try {
        await Store.put("maps", record);
      } catch (error) {
        await Store.remove("mapfiles", record.id).catch(() => {});
        throw error;
      }
      Store.requestPersistence();
    }
    state.maps.push(record);
    summary.added += 1;
  }

  function isZip(file) {
    return /\.zip$/i.test(file.name) || file.type === "application/zip" || file.type === "application/x-zip-compressed";
  }

  async function importZip(file, summary) {
    const entries = (await Zip.read(file)).filter(
      (entry) => !entry.directory && !/^__MACOSX\//.test(entry.name) && !/(^|\/)(\._|\.DS_Store$)/.test(entry.name)
    );
    const manifestEntry = entries.find((entry) => /(^|\/)maps\.json$/.test(entry.name));
    let manifest = null;
    if (manifestEntry) {
      try {
        manifest = JSON.parse(await (await manifestEntry.blob()).text());
      } catch {
        manifest = null;
      }
    }
    const byFile = new Map();
    if (manifest && manifest.type === "dnd-maps" && Array.isArray(manifest.maps)) {
      manifest.maps.forEach((m) => {
        if (m && typeof m.file === "string") {
          byFile.set(m.file, m);
        }
      });
    }
    for (const entry of entries) {
      if (entry === manifestEntry || !guessImageType(entry.name, "")) {
        continue;
      }
      try {
        const meta = byFile.get(entry.name) || {};
        await addImage(await entry.blob(), { fileName: entry.name, name: meta.name, group: meta.group, note: meta.note, id: meta.id, created: meta.created }, summary);
      } catch (error) {
        summary.failed.push(`${entry.name}: ${error.message}`);
      }
    }
    summary.zips += 1;
  }

  async function importFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || state.busy) {
      return;
    }
    state.busy = true;
    const summary = { added: 0, skipped: 0, zips: 0, failed: [] };
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      say(`Importing ${i + 1} of ${files.length}: ${file.name}`);
      try {
        if (isZip(file)) {
          await importZip(file, summary);
        } else {
          await addImage(file, { fileName: file.name }, summary);
        }
      } catch (error) {
        summary.failed.push(`${file.name}: ${error.message}`);
      }
      if ((i + 1) % 5 === 0) {
        render();
      }
    }
    state.busy = false;
    render();
    showUsage();
    const parts = [`Added ${summary.added} map${summary.added === 1 ? "" : "s"}.`];
    if (summary.skipped) {
      parts.push(`Skipped ${summary.skipped} you already have.`);
    }
    if (summary.failed.length) {
      parts.push(`${summary.failed.length} could not be imported: ${summary.failed.slice(0, 3).join("; ")}${summary.failed.length > 3 ? "; ..." : ""}`);
    }
    say(parts.join(" "), summary.failed.length ? "error" : "");
  }

  // ---- backup ----

  function download(filename, blob) {
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  async function exportZip() {
    if (!state.maps.length) {
      say("There are no maps to back up yet.");
      return;
    }
    say("Preparing your backup...");
    try {
      const ordered = state.maps.slice().sort((a, b) => a.created - b.created);
      const files = uniqueFileNames(ordered);
      const entries = [];
      const manifest = { type: "dnd-maps", version: 1, exported: new Date().toISOString(), maps: [] };
      for (let i = 0; i < ordered.length; i += 1) {
        const map = ordered[i];
        const record = await Store.get("mapfiles", map.id);
        if (!record) {
          continue;
        }
        entries.push({ name: files[i], blob: record.blob });
        manifest.maps.push({ id: map.id, name: map.name, group: map.group, note: map.note, file: files[i], type: map.type, width: map.width, height: map.height, created: map.created, updated: map.updated });
      }
      entries.unshift({ name: "maps.json", blob: new Blob([JSON.stringify(manifest, null, 2)], { type: "application/json" }) });
      const blob = await Zip.build(entries);
      download(`dnd-maps-${new Date().toISOString().slice(0, 10)}.zip`, blob);
      try {
        localStorage.setItem("dnd-maps-last-export", String(Date.now()));
      } catch {
        // the reminder will keep showing
      }
      renderBackupNotice();
      say(`Backed up ${manifest.maps.length} maps (${formatBytes(blob.size)}).`);
    } catch (error) {
      say(`The backup could not be created: ${error.message}`, "error");
    }
  }

  // ---- viewer ----

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function stageSize() {
    const rect = $("viewerStage").getBoundingClientRect();
    return { w: rect.width, h: rect.height };
  }

  function applyTransform() {
    const img = $("viewerImg");
    img.style.transform = `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.scale})`;
    $("viewerZoom").textContent = `${Math.round(view.scale * 100)}%`;
  }

  function clampPan() {
    const { w, h } = stageSize();
    const sw = view.iw * view.scale;
    const sh = view.ih * view.scale;
    view.x = sw <= w ? (w - sw) / 2 : clamp(view.x, w - sw, 0);
    view.y = sh <= h ? (h - sh) / 2 : clamp(view.y, h - sh, 0);
  }

  function limits() {
    return { min: view.fit * 0.5, max: Math.max(view.fit * 16, 8) };
  }

  function fitView() {
    const { w, h } = stageSize();
    view.fit = Math.min(w / view.iw, h / view.ih) || 1;
    view.scale = view.fit;
    view.x = 0;
    view.y = 0;
    clampPan();
    applyTransform();
  }

  function zoomAt(px, py, factor) {
    const { min, max } = limits();
    const next = clamp(view.scale * factor, min, max);
    const ratio = next / view.scale;
    view.x = px - (px - view.x) * ratio;
    view.y = py - (py - view.y) * ratio;
    view.scale = next;
    clampPan();
    applyTransform();
  }

  function zoomCenter(factor) {
    const { w, h } = stageSize();
    zoomAt(w / 2, h / 2, factor);
  }

  function actualSize() {
    const { w, h } = stageSize();
    zoomAt(w / 2, h / 2, 1 / view.scale);
  }

  function stagePoint(event) {
    const rect = $("viewerStage").getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function toggleZoomAt(point) {
    if (view.scale > view.fit * 1.05) {
      fitView();
    } else {
      zoomAt(point.x, point.y, Math.max(1 / view.scale, 2.5));
    }
  }

  function bindStage() {
    const stage = $("viewerStage");

    stage.addEventListener("pointerdown", (event) => {
      try {
        stage.setPointerCapture(event.pointerId);
      } catch {
        // capture is only an optimisation; the gesture still works without it
      }
      view.pointers.set(event.pointerId, stagePoint(event));
      if (view.pointers.size === 1) {
        view.pan = { x: view.x, y: view.y, start: stagePoint(event), moved: false, time: Date.now() };
      } else if (view.pointers.size === 2) {
        const [a, b] = Array.from(view.pointers.values());
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        view.pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: view.scale, center, anchor: { x: (center.x - view.x) / view.scale, y: (center.y - view.y) / view.scale } };
        view.pan = null;
      }
    });

    stage.addEventListener("pointermove", (event) => {
      if (!view.pointers.has(event.pointerId)) {
        return;
      }
      view.pointers.set(event.pointerId, stagePoint(event));
      if (view.pinch && view.pointers.size >= 2) {
        const [a, b] = Array.from(view.pointers.values());
        const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const { min, max } = limits();
        view.scale = clamp(view.pinch.scale * (distance / view.pinch.distance), min, max);
        view.x = center.x - view.pinch.anchor.x * view.scale;
        view.y = center.y - view.pinch.anchor.y * view.scale;
        clampPan();
        applyTransform();
      } else if (view.pan) {
        const point = stagePoint(event);
        const dx = point.x - view.pan.start.x;
        const dy = point.y - view.pan.start.y;
        if (Math.hypot(dx, dy) > 6) {
          view.pan.moved = true;
        }
        view.x = view.pan.x + dx;
        view.y = view.pan.y + dy;
        clampPan();
        applyTransform();
      }
    });

    const end = (event) => {
      const wasPan = view.pan;
      view.pointers.delete(event.pointerId);
      if (view.pointers.size < 2) {
        view.pinch = null;
      }
      if (view.pointers.size === 1) {
        const [remaining] = Array.from(view.pointers.values());
        view.pan = { x: view.x, y: view.y, start: remaining, moved: true, time: Date.now() };
      } else if (view.pointers.size === 0) {
        view.pan = null;
        // A quick second tap in the same spot toggles between fit and zoomed in.
        if (event.type === "pointerup" && wasPan && !wasPan.moved && Date.now() - wasPan.time < 350) {
          const point = stagePoint(event);
          const last = view.lastTap;
          if (last && Date.now() - last.time < 400 && Math.hypot(point.x - last.x, point.y - last.y) < 30) {
            view.lastTap = null;
            toggleZoomAt(point);
          } else {
            view.lastTap = { x: point.x, y: point.y, time: Date.now() };
          }
        }
      }
    };
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);

    stage.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        const point = stagePoint(event);
        const sensitivity = event.ctrlKey ? 0.01 : 0.0016;
        zoomAt(point.x, point.y, Math.exp(-event.deltaY * sensitivity));
      },
      { passive: false }
    );

    $("viewerZoomIn").addEventListener("click", () => zoomCenter(1.4));
    $("viewerZoomOut").addEventListener("click", () => zoomCenter(1 / 1.4));
    $("viewerFit").addEventListener("click", fitView);
    $("viewerActual").addEventListener("click", actualSize);

    view.observer = new ResizeObserver(() => {
      if ($("mapViewer").open && view.iw) {
        const wasFit = Math.abs(view.scale - view.fit) < 0.001;
        const { w, h } = stageSize();
        view.fit = Math.min(w / view.iw, h / view.ih) || 1;
        if (wasFit) {
          view.scale = view.fit;
        }
        clampPan();
        applyTransform();
      }
    });
    view.observer.observe(stage);
  }

  function listForViewer() {
    return currentList();
  }

  // Loads the image in a fresh element so no stale state from the previous map can confuse the result.
  // Uses load/error events, which still fire in a background tab.
  function loadProbe(url) {
    return new Promise((resolve) => {
      const probe = new Image();
      const timer = setTimeout(() => resolve(probe), 30000);
      probe.onload = () => {
        clearTimeout(timer);
        resolve(probe);
      };
      probe.onerror = () => {
        clearTimeout(timer);
        resolve(probe);
      };
      probe.src = url;
    });
  }

  function setViewerMessage(text) {
    const message = $("viewerLoading");
    message.textContent = text;
    message.hidden = !text;
  }

  async function openViewer(id) {
    const map = state.maps.find((m) => m.id === id);
    if (!map) {
      return;
    }
    state.viewerId = id;
    const dialog = $("mapViewer");
    if (!dialog.open) {
      dialog.showModal();
    }
    $("viewerTitle").textContent = map.name;
    const list = listForViewer();
    const index = list.findIndex((m) => m.id === id);
    $("viewerCount").textContent = list.length > 1 && index >= 0 ? `${index + 1} of ${list.length}` : "";
    $("viewerPrev").disabled = list.length < 2;
    $("viewerNext").disabled = list.length < 2;
    fillDetails(map);

    const img = $("viewerImg");
    img.alt = map.name;
    img.style.visibility = "hidden";
    setViewerMessage("Loading map...");
    let record = null;
    try {
      record = await Store.get("mapfiles", id);
    } catch (error) {
      record = null;
    }
    if (state.viewerId !== id) {
      return;
    }
    if (!record || !record.blob) {
      setViewerMessage("The image file for this map is missing. Delete it and import it again.");
      return;
    }
    const nextUrl = URL.createObjectURL(record.blob);
    const probe = await loadProbe(nextUrl);
    if (state.viewerId !== id) {
      URL.revokeObjectURL(nextUrl);
      return;
    }
    if (!probe.naturalWidth) {
      URL.revokeObjectURL(nextUrl);
      setViewerMessage("This image could not be displayed. It may be too large for this browser. You can still download it from Details.");
      return;
    }
    const previous = view.url;
    view.url = nextUrl;
    img.src = nextUrl;
    if (previous) {
      URL.revokeObjectURL(previous);
    }
    setViewerMessage("");
    view.iw = probe.naturalWidth;
    view.ih = probe.naturalHeight;
    img.style.width = `${view.iw}px`;
    img.style.height = `${view.ih}px`;
    img.style.visibility = "visible";
    fitView();
    $("viewerStage").focus({ preventScroll: true });
  }

  function closeViewer() {
    const dialog = $("mapViewer");
    if (dialog.open) {
      dialog.close();
    }
  }

  function step(direction) {
    const list = listForViewer();
    if (list.length < 2) {
      return;
    }
    const index = list.findIndex((m) => m.id === state.viewerId);
    const next = list[(index + direction + list.length) % list.length];
    openViewer(next.id);
  }

  let detailTimer = null;

  function fillDetails(map) {
    $("mapName").value = map.name;
    $("mapGroup").value = map.group;
    $("mapNote").value = map.note;
    $("mapInfo").textContent = `${map.width && map.height ? `${map.width} x ${map.height} pixels. ` : ""}${formatBytes(map.size)}. Added ${new Date(map.created).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}.`;
  }

  function saveDetailsSoon() {
    const map = state.maps.find((m) => m.id === state.viewerId);
    if (!map) {
      return;
    }
    map.name = $("mapName").value.trim().slice(0, 120) || map.name;
    map.group = $("mapGroup").value.trim().slice(0, 60);
    map.note = $("mapNote").value.slice(0, 2000);
    $("viewerTitle").textContent = map.name;
    clearTimeout(detailTimer);
    detailTimer = setTimeout(() => {
      map.updated = Date.now();
      if (state.storageOk) {
        Store.put("maps", map).catch(() => {});
      }
      renderFilters();
    }, 500);
  }

  function flushDetails() {
    clearTimeout(detailTimer);
    const map = state.maps.find((m) => m.id === state.viewerId);
    if (map && state.storageOk) {
      map.updated = Date.now();
      Store.put("maps", map).catch(() => {});
    }
  }

  async function deleteCurrent() {
    const map = state.maps.find((m) => m.id === state.viewerId);
    if (!map) {
      return;
    }
    if (!confirm(`Delete "${map.name}"? This cannot be undone. Download a backup first if you are unsure.`)) {
      return;
    }
    const list = listForViewer();
    const index = list.findIndex((m) => m.id === map.id);
    clearTimeout(detailTimer);
    state.maps = state.maps.filter((m) => m.id !== map.id);
    if (state.storageOk) {
      await Store.remove("maps", map.id).catch(() => {});
      await Store.remove("mapfiles", map.id).catch(() => {});
    }
    render();
    showUsage();
    const remaining = listForViewer();
    if (remaining.length) {
      openViewer(remaining[Math.min(index, remaining.length - 1)].id);
    } else {
      closeViewer();
    }
    say(`Deleted "${map.name}".`);
  }

  async function downloadCurrent() {
    const map = state.maps.find((m) => m.id === state.viewerId);
    if (!map) {
      return;
    }
    const record = await Store.get("mapfiles", map.id).catch(() => null);
    if (record && record.blob) {
      download(`${asciiSlug(map.name)}.${TYPE_EXTENSIONS[map.type] || "img"}`, record.blob);
    }
  }

  // ---- events ----

  function bind() {
    $("mapsImportBtn").addEventListener("click", () => $("mapsFiles").click());
    $("mapsFiles").addEventListener("change", async (event) => {
      const files = Array.from(event.target.files);
      event.target.value = "";
      await importFiles(files);
    });
    $("mapsExportZip").addEventListener("click", exportZip);
    $("mapsBackupNow").addEventListener("click", exportZip);

    $("mapsGrid").addEventListener("click", (event) => {
      if (event.target.closest("[data-import]")) {
        $("mapsFiles").click();
        return;
      }
      if (event.target.closest("[data-more]")) {
        state.limit += PAGE;
        renderGrid();
        return;
      }
      const card = event.target.closest(".map-card");
      if (card) {
        openViewer(card.dataset.id);
      }
    });

    let searchTimer = null;
    $("mapsSearch").addEventListener("input", (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = event.target.value;
        state.limit = PAGE;
        renderGrid();
      }, 140);
    });
    $("mapsSearchClear").addEventListener("click", () => {
      $("mapsSearch").value = "";
      state.query = "";
      renderGrid();
      $("mapsSearch").focus();
    });
    $("mapsGroup").addEventListener("change", (event) => {
      state.group = event.target.value;
      state.limit = PAGE;
      renderGrid();
    });
    $("mapsSort").addEventListener("change", (event) => {
      state.sort = event.target.value;
      try {
        localStorage.setItem("dnd-maps-sort", state.sort);
      } catch {
        // preference only
      }
      renderGrid();
    });

    // Drag images onto the page.
    const panel = $("mapsTab");
    let dragDepth = 0;
    const hasFiles = (event) => event.dataTransfer && Array.from(event.dataTransfer.types || []).includes("Files");
    panel.addEventListener("dragenter", (event) => {
      if (hasFiles(event)) {
        dragDepth += 1;
        panel.classList.add("drag-over");
      }
    });
    panel.addEventListener("dragover", (event) => {
      if (hasFiles(event)) {
        event.preventDefault();
      }
    });
    panel.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (!dragDepth) {
        panel.classList.remove("drag-over");
      }
    });
    panel.addEventListener("drop", (event) => {
      dragDepth = 0;
      panel.classList.remove("drag-over");
      if (hasFiles(event)) {
        event.preventDefault();
        importFiles(event.dataTransfer.files);
      }
    });

    // Paste an image from the clipboard.
    document.addEventListener("paste", (event) => {
      if (!isOpen() || $("mapViewer").open) {
        return;
      }
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
      }
      const files = Array.from((event.clipboardData && event.clipboardData.files) || []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        event.preventDefault();
        const named = files.map((file, i) => new File([file], file.name && file.name !== "image.png" ? file.name : `Pasted image ${new Date().toLocaleTimeString().replace(/[:\s]/g, "-")}${files.length > 1 ? `-${i + 1}` : ""}.png`, { type: file.type }));
        importFiles(named);
      }
    });

    // Viewer controls.
    bindStage();
    $("viewerClose").addEventListener("click", closeViewer);
    $("viewerPrev").addEventListener("click", () => step(-1));
    $("viewerNext").addEventListener("click", () => step(1));
    $("viewerDetailsBtn").addEventListener("click", () => {
      const panelEl = $("viewerDetails");
      panelEl.hidden = !panelEl.hidden;
      $("viewerDetailsBtn").setAttribute("aria-expanded", String(!panelEl.hidden));
    });
    ["mapName", "mapGroup", "mapNote"].forEach((id) => $(id).addEventListener("input", saveDetailsSoon));
    $("mapDelete").addEventListener("click", deleteCurrent);
    $("mapDownload").addEventListener("click", downloadCurrent);

    $("mapViewer").addEventListener("keydown", (event) => {
      const tag = event.target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(1);
      } else if (event.key === "+" || event.key === "=") {
        zoomCenter(1.4);
      } else if (event.key === "-" || event.key === "_") {
        zoomCenter(1 / 1.4);
      } else if (event.key === "0") {
        fitView();
      } else if (event.key === "1") {
        actualSize();
      }
    });
    $("mapViewer").addEventListener("close", () => {
      if ($("mapViewer").open) {
        return;
      }
      flushDetails();
      state.viewerId = null;
      $("viewerImg").removeAttribute("src");
      if (view.url) {
        URL.revokeObjectURL(view.url);
        view.url = "";
      }
      view.pointers.clear();
      view.pinch = null;
      view.pan = null;
      $("viewerDetails").hidden = true;
      $("viewerDetailsBtn").setAttribute("aria-expanded", "false");
      renderGrid();
    });
    window.addEventListener("pagehide", flushDetails);
  }

  function init() {
    try {
      state.sort = localStorage.getItem("dnd-maps-sort") || "recent";
    } catch {
      state.sort = "recent";
    }
    $("mapsSort").value = ["recent", "oldest", "name"].includes(state.sort) ? state.sort : "recent";
    state.sort = $("mapsSort").value;
    bind();
    Tabs.register("maps", {
      onShow() {
        if (!state.loaded) {
          load();
        } else {
          render();
        }
      }
    });
  }

  return { init };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { guessImageType, cleanMapName, asciiSlug, normalizeMap, filterMaps, sortMaps, uniqueFileNames, formatBytes };
}
