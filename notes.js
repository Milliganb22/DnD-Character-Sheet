"use strict";

// Notes tab: session notes stored in IndexedDB, searchable, with bulk import that splits on "Session N" headings.

// ---- Pure helpers (also exercised by tests in Node) ----

const SESSION_HEADING =
  /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*|__)?(?:session|sess|ses|sesh)\.?[ \t]*(?:#|no\.?|number|-)?[ \t]*(\d{1,4})\b(?:\*\*|__)?[ \t]*(?:[-–—:.)|][ \t]*)?(.*)$/i;

// Exported notes without a session number use "## Unsorted: Title", which the importer understands.
const UNSORTED_HEADING = /^[ \t]*#{1,6}[ \t]*unsorted[ \t]*(?:[:\-\u2013\u2014][ \t]*(.*))?$/i;

function hashText(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function cleanHeadingTitle(raw) {
  return String(raw ?? "")
    .replace(/^[\s*_#:.\-–—|)]+/, "")
    .replace(/[\s*_#:|]+$/, "")
    .trim()
    .slice(0, 120);
}

function trimBlankLines(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) {
    start += 1;
  }
  while (end > start && !lines[end - 1].trim()) {
    end -= 1;
  }
  return lines.slice(start, end).join("\n").trimEnd();
}

// Splits pasted text into notes wherever a line looks like "Session 12", "## Session 12: Title", "**Session 12**".
// Text before the first heading becomes an unnumbered intro note.
function parseSessions(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const notes = [];
  const intro = [];
  let current = null;

  const finish = () => {
    if (!current) {
      return;
    }
    const body = trimBlankLines(current.lines);
    if (current.title || body) {
      notes.push({ session: current.session, title: current.title, body });
    }
    current = null;
  };

  lines.forEach((line) => {
    const match = SESSION_HEADING.exec(line);
    const unsorted = match ? null : UNSORTED_HEADING.exec(line);
    if (match) {
      finish();
      current = { session: Number(match[1]), title: cleanHeadingTitle(match[2]), lines: [] };
    } else if (unsorted) {
      finish();
      current = { session: null, title: cleanHeadingTitle(unsorted[1]), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      intro.push(line);
    }
  });
  finish();

  const introText = trimBlankLines(intro);
  if (introText && notes.length) {
    notes.unshift({ session: null, title: "Before the first session heading", body: introText });
  }
  return { notes, introText, found: notes.some((n) => n.session !== null) };
}

function parseQuery(query) {
  const terms = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  let match = pattern.exec(String(query ?? ""));
  while (match) {
    const text = (match[1] !== undefined ? match[1] : match[2]).toLowerCase().trim();
    if (text) {
      terms.push({ text, phrase: match[1] !== undefined });
    }
    match = pattern.exec(String(query ?? ""));
  }
  return terms;
}

// "session 12", "s12", "#12" or just "12" jump to that session.
function parseSessionShortcut(query) {
  const match = /^\s*(?:session|sess|s|#)?\s*#?(\d{1,4})\s*$/i.exec(String(query ?? ""));
  return match ? Number(match[1]) : null;
}

const lowerCache = new WeakMap();

function lowered(note) {
  const key = `${note.updated}|${note.title.length}|${note.body.length}`;
  const cached = lowerCache.get(note);
  if (cached && cached.key === key) {
    return cached;
  }
  const entry = { key, title: note.title.toLowerCase(), body: note.body.toLowerCase() };
  lowerCache.set(note, entry);
  return entry;
}

function countOccurrences(haystack, needle, cap) {
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1 && count < cap) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

// Every term must appear (in the title or body). Returns matching notes with a relevance score.
function searchNotes(notes, query, range = {}) {
  const terms = parseQuery(query);
  const jump = terms.length ? parseSessionShortcut(query) : null;
  const from = range.from ?? null;
  const to = range.to ?? null;
  const results = [];

  notes.forEach((note) => {
    if (from !== null && (note.session === null || note.session < from)) {
      return;
    }
    if (to !== null && (note.session === null || note.session > to)) {
      return;
    }
    if (!terms.length) {
      results.push({ note, score: 0 });
      return;
    }
    const lc = lowered(note);
    let score = 0;
    let matches = true;
    for (const term of terms) {
      const inTitle = countOccurrences(lc.title, term.text, 5);
      const inBody = countOccurrences(lc.body, term.text, 50);
      if (!inTitle && !inBody) {
        matches = false;
        break;
      }
      score += inTitle * 8 + inBody;
    }
    if (!matches && jump !== null && note.session === jump) {
      matches = true;
      score = 100;
    }
    if (matches) {
      results.push({ note, score });
    }
  });
  return { terms, results };
}

function makeSnippets(text, terms, max = 2) {
  const lc = text.toLowerCase();
  const windows = [];
  terms.forEach((term) => {
    const index = lc.indexOf(term.text);
    if (index >= 0) {
      windows.push([Math.max(0, index - 70), Math.min(text.length, index + term.text.length + 110)]);
    }
  });
  windows.sort((a, b) => a[0] - b[0]);
  const merged = [];
  windows.forEach((window_) => {
    const last = merged[merged.length - 1];
    if (last && window_[0] <= last[1]) {
      last[1] = Math.max(last[1], window_[1]);
    } else {
      merged.push([...window_]);
    }
  });
  return merged.slice(0, max).map(([start, end]) => {
    const piece = text.slice(start, end).replace(/\s+/g, " ").trim();
    return `${start > 0 ? "…" : ""}${piece}${end < text.length ? "…" : ""}`;
  });
}

function sortNotes(items, mode) {
  const bySession = (a, b) => {
    const sa = a.note.session;
    const sb = b.note.session;
    if (sa === null && sb === null) {
      return b.note.updated - a.note.updated;
    }
    if (sa === null) {
      return 1;
    }
    if (sb === null) {
      return -1;
    }
    return mode === "session-asc" ? sa - sb || a.note.created - b.note.created : sb - sa || a.note.created - b.note.created;
  };
  const copy = items.slice();
  if (mode === "match") {
    copy.sort((a, b) => b.score - a.score || bySession(a, b));
  } else if (mode === "recent") {
    copy.sort((a, b) => b.note.updated - a.note.updated);
  } else {
    copy.sort(bySession);
  }
  return copy;
}

function normalizeNote(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const sessionValue = r.session === null || r.session === undefined || r.session === "" ? null : Math.floor(Number(r.session));
  const now = Date.now();
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 60) : `n_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    session: Number.isFinite(sessionValue) && sessionValue >= 0 && sessionValue < 100000 ? sessionValue : null,
    title: String(r.title ?? "").slice(0, 200),
    body: String(r.body ?? "").slice(0, 2000000),
    created: Number(r.created) || now,
    updated: Number(r.updated) || now
  };
}

function noteKey(note) {
  return `${note.session === null ? "-" : note.session}|${note.title.trim()}|${hashText(note.body.trim())}`;
}

// All notes as plain text, newest session last, using headings the importer understands (round trip).
function buildExportText(notes) {
  const ordered = sortNotes(
    notes.map((note) => ({ note, score: 0 })),
    "session-asc"
  );
  return ordered
    .map(({ note }) => {
      const heading = note.session === null ? "## Unsorted" : `## Session ${note.session}`;
      return `${heading}${note.title ? `: ${note.title}` : ""}\n\n${note.body}`.trim();
    })
    .join("\n\n\n");
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Notes tab UI ----

const Notes = (() => {
  const PAGE = 150;
  const state = {
    notes: [],
    selectedId: null,
    editing: false,
    query: "",
    sort: "session-desc",
    from: null,
    to: null,
    limit: PAGE,
    loaded: false,
    storageOk: true,
    saveTimers: new Map(),
    importSources: []
  };

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

  const isOpen = () => typeof Tabs !== "undefined" && Tabs.current() === "notes";
  const selected = () => state.notes.find((n) => n.id === state.selectedId) || null;

  function say(message, kind = "") {
    const status = $("notesStatus");
    status.textContent = message;
    status.className = `muted notes-status ${kind}`.trim();
  }

  function formatDate(timestamp) {
    return new Date(timestamp).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function formatSize(chars) {
    return chars < 1000 ? `${chars} characters` : chars < 1000000 ? `${(chars / 1000).toFixed(0)} KB` : `${(chars / 1000000).toFixed(1)} MB`;
  }

  // ---- highlighting and light formatting ----

  function highlighter(terms) {
    if (!terms.length) {
      return null;
    }
    const sorted = terms.map((t) => t.text).sort((a, b) => b.length - a.length);
    return new RegExp(`(${sorted.map(escapeRegExp).join("|")})`, "gi");
  }

  function appendHighlighted(parent, text, regex) {
    if (!regex) {
      parent.append(document.createTextNode(text));
      return;
    }
    let last = 0;
    regex.lastIndex = 0;
    let match = regex.exec(text);
    while (match) {
      if (match.index > last) {
        parent.append(document.createTextNode(text.slice(last, match.index)));
      }
      parent.append(el("mark", { text: match[0] }));
      last = match.index + match[0].length;
      if (match[0].length === 0) {
        regex.lastIndex += 1;
      }
      match = regex.exec(text);
    }
    if (last < text.length) {
      parent.append(document.createTextNode(text.slice(last)));
    }
  }

  function appendInline(parent, text, regex) {
    text.split(/(\*\*[^*\n]+\*\*)/).forEach((part) => {
      if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
        const strong = el("strong");
        appendHighlighted(strong, part.slice(2, -2), regex);
        parent.append(strong);
      } else {
        appendHighlighted(parent, part, regex);
      }
    });
  }

  // Plain text with a little formatting: "# Heading", "- bullets", "**bold**". Built from text nodes only.
  function renderBody(container, text, terms) {
    container.textContent = "";
    const regex = highlighter(terms);
    let paragraph = [];
    let list = null;
    const flushParagraph = () => {
      if (paragraph.length) {
        const p = el("p");
        appendInline(p, paragraph.join("\n"), regex);
        container.append(p);
        paragraph = [];
      }
    };
    String(text).replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        list = null;
        return;
      }
      const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
      if (heading) {
        flushParagraph();
        list = null;
        const h = el(`h${heading[1].length + 2}`);
        appendInline(h, heading[2], regex);
        container.append(h);
        return;
      }
      const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
      if (bullet) {
        flushParagraph();
        if (!list) {
          list = el("ul");
          container.append(list);
        }
        const li = el("li");
        appendInline(li, bullet[1], regex);
        list.append(li);
        return;
      }
      list = null;
      paragraph.push(trimmed);
    });
    flushParagraph();
  }

  // ---- loading and saving ----

  async function load() {
    try {
      const rows = await Store.getAll("notes");
      state.notes = rows.map(normalizeNote);
      state.storageOk = true;
    } catch (error) {
      state.storageOk = false;
      state.notes = [];
    }
    state.loaded = true;
    $("notesStorageWarning").hidden = state.storageOk;
    render();
  }

  function persist(note) {
    if (!state.storageOk) {
      return Promise.resolve();
    }
    return Store.put("notes", note).then(
      () => {
        Store.requestPersistence();
      },
      () => {
        state.storageOk = false;
        $("notesStorageWarning").hidden = false;
      }
    );
  }

  function queueSave(note) {
    clearTimeout(state.saveTimers.get(note.id));
    say("Saving...");
    state.saveTimers.set(
      note.id,
      setTimeout(() => {
        note.updated = Date.now();
        persist(note).then(() => say(state.storageOk ? "Saved" : "Not saved: storage is unavailable in this browser mode", state.storageOk ? "" : "error"));
      }, 500)
    );
  }

  function flushPending() {
    state.saveTimers.forEach((timer, id) => {
      clearTimeout(timer);
      const note = state.notes.find((n) => n.id === id);
      if (note) {
        note.updated = Date.now();
        persist(note);
      }
    });
    state.saveTimers.clear();
  }

  // ---- rendering ----

  function currentResults() {
    const { terms, results } = searchNotes(state.notes, state.query, { from: state.from, to: state.to });
    const mode = state.sort === "match" && !terms.length ? "session-desc" : state.sort;
    return { terms, results: sortNotes(results, mode), grouped: mode.startsWith("session") };
  }

  function titleOf(note) {
    if (note.title) {
      return note.title;
    }
    const first = note.body.split("\n").find((line) => line.trim());
    return first ? first.trim().slice(0, 90) : "Untitled note";
  }

  function excerptOf(note) {
    return note.body.replace(/\s+/g, " ").trim().slice(0, 150);
  }

  function renderList() {
    const list = $("notesList");
    list.textContent = "";
    const { terms, results, grouped } = currentResults();
    const total = state.notes.length;
    const sessions = new Set(results.filter((r) => r.note.session !== null).map((r) => r.note.session)).size;
    const searching = terms.length > 0 || state.from !== null || state.to !== null;

    $("notesSummary").textContent = !total
      ? "No notes yet."
      : searching
        ? `${results.length} of ${total} notes match${results.length ? `, in ${sessions} session${sessions === 1 ? "" : "s"}` : ""}.`
        : `${total} notes in ${new Set(state.notes.filter((n) => n.session !== null).map((n) => n.session)).size} sessions.`;
    $("notesSearchClear").hidden = !state.query;

    if (!total) {
      list.append(
        el(
          "div",
          { class: "notes-empty" },
          el("p", { text: "Nothing here yet." }),
          el("p", { class: "muted", text: "Add your first note, or import the notes you already have." })
        )
      );
      return;
    }
    if (!results.length) {
      list.append(el("div", { class: "notes-empty" }, el("p", { text: "No notes match." }), el("p", { class: "muted", text: "Try fewer words, or clear the session range." })));
      return;
    }

    const visible = results.slice(0, state.limit);
    let lastGroup = null;
    let ul = null;
    visible.forEach(({ note }) => {
      if (grouped) {
        const group = note.session === null ? "none" : String(note.session);
        if (group !== lastGroup) {
          lastGroup = group;
          list.append(el("h3", { class: "note-group", text: note.session === null ? "No session number" : `Session ${note.session}` }));
          ul = el("ul", { class: "note-items" });
          list.append(ul);
        }
      } else if (!ul) {
        ul = el("ul", { class: "note-items" });
        list.append(ul);
      }
      const regex = highlighter(terms);
      const snippets = terms.length ? makeSnippets(note.body, terms, 2) : [];
      const item = el(
        "button",
        { type: "button", class: "note-item", "data-id": note.id, "aria-current": note.id === state.selectedId ? "true" : "false" },
        el("span", { class: "note-title" }, ...(() => {
          const holder = el("span");
          appendHighlighted(holder, titleOf(note), regex);
          return Array.from(holder.childNodes);
        })()),
        grouped ? null : el("span", { class: "note-meta", text: note.session === null ? "No session" : `Session ${note.session}` }),
        snippets.length
          ? snippets.map((snippet) => {
              const line = el("span", { class: "note-snippet" });
              appendHighlighted(line, snippet, regex);
              return line;
            })
          : el("span", { class: "note-snippet", text: excerptOf(note) })
      );
      ul.append(el("li", {}, item));
    });
    if (results.length > visible.length) {
      list.append(el("button", { type: "button", class: "chip-btn more-btn", "data-more": "1", text: `Show ${Math.min(PAGE, results.length - visible.length)} more (${results.length - visible.length} left)` }));
    }
  }

  function renderDetail() {
    const box = $("notesDetail");
    box.textContent = "";
    $("notesLayout").classList.toggle("has-selection", Boolean(state.selectedId));
    const note = selected();
    if (!note) {
      box.append(
        el(
          "div",
          { class: "notes-empty" },
          el("h2", { text: "Your notes" }),
          el("p", { class: "muted", text: state.notes.length ? "Choose a note from the list, or search for something you remember." : "Add a note to get started, or import your old notes with Import notes." })
        )
      );
      return;
    }

    const back = el("button", { type: "button", class: "chip-btn back-btn", "data-back": "1", text: "Back to list" });
    if (state.editing) {
      box.append(back, buildEditor(note));
      return;
    }

    const terms = parseQuery(state.query);
    const body = el("div", { class: "note-body" });
    renderBody(body, note.body, terms);
    box.append(
      back,
      el(
        "header",
        { class: "note-header" },
        note.title ? el("p", { class: "note-session", text: note.session === null ? "No session number" : `Session ${note.session}` }) : null,
        el("h2", { text: note.title || (note.session === null ? "Untitled note" : `Session ${note.session}`) }),
        el("p", { class: "muted", text: `Edited ${formatDate(note.updated)}` })
      ),
      el(
        "div",
        { class: "note-actions" },
        el("button", { type: "button", class: "chip-btn primary", "data-edit": "1", text: "Edit" }),
        el("button", { type: "button", class: "chip-btn danger", "data-delete": "1", text: "Delete" })
      ),
      note.body.trim() ? body : el("p", { class: "muted", text: "This note is empty. Choose Edit to write something." })
    );
    const firstMark = body.querySelector("mark");
    if (firstMark && terms.length) {
      firstMark.scrollIntoView({ block: "center" });
    }
  }

  function buildEditor(note) {
    const session = el("input", { id: "noteSession", type: "number", min: "0", max: "99999", inputmode: "numeric", placeholder: "e.g. 47" });
    session.value = note.session === null ? "" : String(note.session);
    const title = el("input", { id: "noteTitle", type: "text", maxlength: "200", placeholder: "Title (optional)" });
    title.value = note.title;
    const body = el("textarea", { id: "noteBody", rows: "18", placeholder: "Write your notes here. Use # for headings, - for bullets, **bold**." });
    body.value = note.body;

    session.addEventListener("input", () => {
      const value = session.value.trim();
      note.session = value === "" ? null : Math.max(0, Math.min(99999, Math.floor(Number(value) || 0)));
      lowerCache.delete(note);
      queueSave(note);
      queueListRefresh();
    });
    title.addEventListener("input", () => {
      note.title = title.value;
      lowerCache.delete(note);
      queueSave(note);
      queueListRefresh();
    });
    body.addEventListener("input", () => {
      note.body = body.value;
      lowerCache.delete(note);
      queueSave(note);
    });

    return el(
      "div",
      { class: "note-editor" },
      el("div", { class: "editor-grid" }, el("label", { class: "field" }, el("span", { text: "Session #" }), session), el("label", { class: "field grow" }, el("span", { text: "Title" }), title)),
      el("label", { class: "field" }, el("span", { text: "Notes" }), body),
      el(
        "div",
        { class: "note-actions" },
        el("button", { type: "button", class: "chip-btn primary", "data-done": "1", text: "Done" }),
        el("button", { type: "button", class: "chip-btn danger", "data-delete": "1", text: "Delete" })
      )
    );
  }

  let listTimer = null;
  function queueListRefresh() {
    clearTimeout(listTimer);
    listTimer = setTimeout(renderList, 400);
  }

  function render() {
    renderList();
    renderDetail();
    renderBackupNotice();
  }

  function renderBackupNotice() {
    let last = null;
    try {
      last = localStorage.getItem("dnd-notes-last-export");
    } catch {
      last = null;
    }
    const days = last ? (Date.now() - Number(last)) / 86400000 : Infinity;
    const needed = state.notes.length >= 10 && days > 30;
    $("notesBackup").hidden = !needed;
    if (needed) {
      $("notesBackupText").textContent = last
        ? `Your last backup was ${Math.floor(days)} days ago. Your notes live only in this browser.`
        : "Your notes live only in this browser and have never been backed up.";
    }
  }

  // ---- actions ----

  function select(id, editing = false) {
    flushPending();
    state.selectedId = id;
    state.editing = editing;
    renderDetail();
    document.querySelectorAll(".note-item").forEach((item) => {
      item.setAttribute("aria-current", item.dataset.id === id ? "true" : "false");
    });
    if (id) {
      $("notesLayout").scrollIntoView({ block: "start" });
    }
  }

  function nextSession() {
    const numbers = state.notes.map((n) => n.session).filter((s) => s !== null);
    return numbers.length ? Math.max(...numbers) + 1 : 1;
  }

  function createNote() {
    const note = normalizeNote({ session: nextSession(), title: "", body: "" });
    state.notes.push(note);
    state.query = "";
    $("notesSearch").value = "";
    persist(note);
    renderList();
    select(note.id, true);
    const title = $("noteTitle");
    if (title) {
      title.focus();
    }
  }

  // A note that was created but left completely empty is not worth keeping.
  function discardIfEmpty(note) {
    if (!note || note.title.trim() || note.body.trim()) {
      return false;
    }
    clearTimeout(state.saveTimers.get(note.id));
    state.saveTimers.delete(note.id);
    state.notes = state.notes.filter((n) => n.id !== note.id);
    if (state.storageOk) {
      Store.remove("notes", note.id).catch(() => {});
    }
    return true;
  }

  function deleteNote(note) {
    if (!confirm(`Delete this note${note.title ? ` ("${note.title}")` : ""}? This cannot be undone. Export a backup first if you are unsure.`)) {
      return;
    }
    clearTimeout(state.saveTimers.get(note.id));
    state.saveTimers.delete(note.id);
    state.notes = state.notes.filter((n) => n.id !== note.id);
    if (state.storageOk) {
      Store.remove("notes", note.id).catch(() => {});
    }
    state.selectedId = null;
    state.editing = false;
    render();
    say("Note deleted.");
  }

  function download(filename, text, type) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function markBackedUp() {
    try {
      localStorage.setItem("dnd-notes-last-export", String(Date.now()));
    } catch {
      // storage unavailable; the reminder will simply keep showing
    }
    renderBackupNotice();
  }

  function exportJson() {
    flushPending();
    const stamp = new Date().toISOString().slice(0, 10);
    download(`dnd-notes-${stamp}.json`, JSON.stringify({ type: "dnd-notes", version: 1, exported: new Date().toISOString(), notes: state.notes }, null, 2), "application/json");
    markBackedUp();
    say(`Exported ${state.notes.length} notes.`);
  }

  function exportText() {
    flushPending();
    const stamp = new Date().toISOString().slice(0, 10);
    download(`dnd-notes-${stamp}.txt`, buildExportText(state.notes), "text/plain");
    markBackedUp();
    say(`Exported ${state.notes.length} notes as text.`);
  }

  // ---- import ----

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result) });
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function importMode() {
    return document.querySelector('input[name="importMode"]:checked').value;
  }

  // Turns the pasted text and chosen files into notes, skipping ones already stored.
  function planImport() {
    const sources = state.importSources.slice();
    const pasted = $("importText").value;
    if (pasted.trim()) {
      sources.push({ name: "Pasted notes", text: pasted });
    }
    const mode = importMode();
    const existing = new Set(state.notes.map(noteKey));
    const seen = new Set();
    const incoming = [];
    let skipped = 0;
    let noHeadings = false;
    let chars = 0;

    const add = (raw, keepIdentity) => {
      const note = normalizeNote(keepIdentity ? raw : { ...raw, id: "" });
      const key = noteKey(note);
      if ((existing.has(key) || seen.has(key)) && $("importSkipDupes").checked) {
        skipped += 1;
        return;
      }
      seen.add(key);
      chars += note.body.length;
      incoming.push(note);
    };

    sources.forEach((source) => {
      let parsedJson = null;
      if (source.text.trimStart().startsWith("{")) {
        try {
          parsedJson = JSON.parse(source.text);
        } catch {
          parsedJson = null;
        }
      }
      if (parsedJson && parsedJson.type === "dnd-notes" && Array.isArray(parsedJson.notes)) {
        parsedJson.notes.forEach((raw) => add(raw, true));
        return;
      }
      if (mode === "single") {
        add({ session: $("importSession").value, title: $("importTitle").value || (source.name === "Pasted notes" ? "" : source.name.replace(/\.[^.]+$/, "")), body: source.text.trim() }, false);
        return;
      }
      const parsed = parseSessions(source.text);
      if (!parsed.found) {
        noHeadings = true;
        return;
      }
      parsed.notes.forEach((note) => add(note, false));
    });

    return { incoming, skipped, noHeadings, chars, sources: sources.length };
  }

  function renderImportPreview() {
    const preview = $("importPreview");
    preview.textContent = "";
    const run = $("importRun");
    $("importSingleFields").hidden = importMode() !== "single";
    const plan = planImport();
    run.disabled = plan.incoming.length === 0;

    if (!plan.sources) {
      preview.append(el("p", { class: "muted", text: "Paste notes above or choose files to see what will be imported." }));
      return;
    }
    if (plan.noHeadings && !plan.incoming.length) {
      preview.append(
        el("p", { class: "warning", text: 'No "Session N" headings were found. Choose "Import as one note" below, or add headings like "Session 12" to your text.' })
      );
      return;
    }
    const sessions = plan.incoming.map((n) => n.session).filter((s) => s !== null);
    const range = sessions.length ? `, sessions ${Math.min(...sessions)} to ${Math.max(...sessions)}` : "";
    preview.append(
      el("p", { class: "res-flag", text: `${plan.incoming.length} note${plan.incoming.length === 1 ? "" : "s"} ready to import${range} (${formatSize(plan.chars)}).` })
    );
    if (plan.skipped) {
      preview.append(el("p", { class: "muted", text: `${plan.skipped} already in your notes will be skipped.` }));
    }
    if (plan.noHeadings) {
      preview.append(el("p", { class: "muted", text: "One file had no session headings and was left out." }));
    }
    const list = el("ul", { class: "import-list" });
    plan.incoming.slice(0, 6).forEach((note) => {
      list.append(el("li", { text: `${note.session === null ? "No session" : `Session ${note.session}`}${note.title ? `: ${note.title}` : ""} (${formatSize(note.body.length)})` }));
    });
    if (plan.incoming.length > 6) {
      list.append(el("li", { class: "muted", text: `and ${plan.incoming.length - 6} more` }));
    }
    preview.append(list);
  }

  async function runImport() {
    const plan = planImport();
    if (!plan.incoming.length) {
      return;
    }
    $("importRun").disabled = true;
    // Keep imported order stable when sorting by date.
    const base = Date.now();
    plan.incoming.forEach((note, index) => {
      if (note.created > base - 1000 || !note.created) {
        note.created = base + index;
        note.updated = base + index;
      }
    });
    const byId = new Map(state.notes.map((n) => [n.id, n]));
    plan.incoming.forEach((note) => {
      byId.set(note.id, note);
    });
    state.notes = Array.from(byId.values());
    try {
      if (state.storageOk) {
        for (let start = 0; start < plan.incoming.length; start += 500) {
          await Store.putMany("notes", plan.incoming.slice(start, start + 500));
        }
        Store.requestPersistence();
      }
    } catch (error) {
      state.storageOk = false;
      $("notesStorageWarning").hidden = false;
    }
    $("notesImport").close();
    state.query = "";
    $("notesSearch").value = "";
    render();
    say(`Imported ${plan.incoming.length} notes${plan.skipped ? `, skipped ${plan.skipped} you already had` : ""}.`);
  }

  function openImport() {
    state.importSources = [];
    $("importText").value = "";
    $("importFiles").value = "";
    $("importSession").value = "";
    $("importTitle").value = "";
    document.querySelector('input[name="importMode"][value="split"]').checked = true;
    renderImportPreview();
    $("notesImport").showModal();
    $("importText").focus();
  }

  // ---- events ----

  function bind() {
    let searchTimer = null;
    $("notesSearch").addEventListener("input", (event) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.query = event.target.value;
        state.limit = PAGE;
        renderList();
        if (state.query.trim() && window.matchMedia("(min-width: 760px)").matches) {
          const first = currentResults().results[0];
          if (first && first.note.id !== state.selectedId) {
            state.selectedId = first.note.id;
            state.editing = false;
          }
        }
        renderDetail();
        document.querySelectorAll(".note-item").forEach((item) => {
          item.setAttribute("aria-current", item.dataset.id === state.selectedId ? "true" : "false");
        });
      }, 140);
    });
    $("notesSearch").addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.target.value = "";
        event.target.dispatchEvent(new Event("input"));
      }
    });
    $("notesSearchClear").addEventListener("click", () => {
      $("notesSearch").value = "";
      $("notesSearch").dispatchEvent(new Event("input"));
      $("notesSearch").focus();
    });
    $("notesSort").addEventListener("change", (event) => {
      state.sort = event.target.value;
      try {
        localStorage.setItem("dnd-notes-sort", state.sort);
      } catch {
        // preference only
      }
      renderList();
    });
    ["notesFrom", "notesTo"].forEach((id) => {
      $(id).addEventListener("input", () => {
        const read = (field) => ($(field).value.trim() === "" ? null : Math.max(0, Math.floor(Number($(field).value) || 0)));
        state.from = read("notesFrom");
        state.to = read("notesTo");
        state.limit = PAGE;
        renderList();
      });
    });

    $("notesList").addEventListener("click", (event) => {
      const more = event.target.closest("[data-more]");
      if (more) {
        state.limit += PAGE;
        renderList();
        return;
      }
      const item = event.target.closest(".note-item");
      if (item) {
        select(item.dataset.id, false);
      }
    });
    $("notesDetail").addEventListener("click", (event) => {
      const note = selected();
      if (event.target.closest("[data-back]")) {
        discardIfEmpty(note);
        state.selectedId = null;
        state.editing = false;
        flushPending();
        render();
      } else if (event.target.closest("[data-edit]") && note) {
        state.editing = true;
        renderDetail();
        $("noteBody").focus();
      } else if (event.target.closest("[data-done]")) {
        flushPending();
        if (discardIfEmpty(note)) {
          state.selectedId = null;
        }
        state.editing = false;
        render();
      } else if (event.target.closest("[data-delete]") && note) {
        deleteNote(note);
      }
    });

    $("notesNew").addEventListener("click", createNote);
    $("notesImportBtn").addEventListener("click", openImport);
    $("notesExportJson").addEventListener("click", exportJson);
    $("notesExportText").addEventListener("click", exportText);
    $("notesBackupNow").addEventListener("click", exportJson);

    $("importText").addEventListener("input", renderImportPreview);
    $("importSkipDupes").addEventListener("change", renderImportPreview);
    $("importSession").addEventListener("input", renderImportPreview);
    $("importTitle").addEventListener("input", renderImportPreview);
    document.querySelectorAll('input[name="importMode"]').forEach((radio) => radio.addEventListener("change", renderImportPreview));
    $("importFiles").addEventListener("change", async (event) => {
      const files = Array.from(event.target.files);
      try {
        state.importSources = await Promise.all(files.map(readFile));
      } catch {
        state.importSources = [];
      }
      renderImportPreview();
    });
    $("importRun").addEventListener("click", runImport);
    $("importCancel").addEventListener("click", () => $("notesImport").close());

    document.addEventListener("keydown", (event) => {
      if (!isOpen() || event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement.isContentEditable) {
        return;
      }
      event.preventDefault();
      $("notesSearch").focus();
    });

    window.addEventListener("pagehide", flushPending);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        flushPending();
      }
    });
  }

  function init() {
    try {
      state.sort = localStorage.getItem("dnd-notes-sort") || "session-desc";
    } catch {
      state.sort = "session-desc";
    }
    $("notesSort").value = ["session-desc", "session-asc", "match", "recent"].includes(state.sort) ? state.sort : "session-desc";
    state.sort = $("notesSort").value;
    bind();
    Tabs.register("notes", {
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
  module.exports = { parseSessions, parseQuery, parseSessionShortcut, searchNotes, makeSnippets, sortNotes, normalizeNote, noteKey, buildExportText, hashText };
}
