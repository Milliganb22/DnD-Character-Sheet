"use strict";

// Rules tab: search the bundled SRD 5.2 (rules-data.js) and your own "My library" entries.
// Everything is wrapped in one object so nothing here can clash with the other scripts' globals.
const Rules = (() => {
  const KIND_LABELS = {
    spell: "Spell",
    monster: "Monster",
    condition: "Condition",
    rule: "Rule",
    class: "Class",
    subclass: "Subclass",
    feature: "Class feature",
    species: "Species",
    trait: "Species trait",
    gear: "Gear",
    "magic-item": "Magic item",
    feat: "Feat",
    background: "Background",
    mine: "My library"
  };

  const KIND_GROUPS = {
    spells: ["spell"],
    monsters: ["monster"],
    conditions: ["condition"],
    rules: ["rule"],
    classes: ["class", "subclass", "feature"],
    items: ["gear", "magic-item"],
    character: ["species", "trait", "feat", "background"],
    mine: ["mine"]
  };

  // Words that people type around the real search term ("what does fireball do").
  const STOP_WORDS = new Set(
    ("a an the of and or to in on at for with from by is are was be do does did done what whats how why when where which who whom " +
      "can could should would will i me my you your we it its this that these those about tell explain work works working mean means " +
      "meaning rule rules happen happens if get gets give gives use uses using am so not no up there than then just if").split(" ")
  );

  // Words that mean "I am looking for this kind of thing".
  const KIND_HINTS = {
    spell: "spell",
    spells: "spell",
    cantrip: "spell",
    cantrips: "spell",
    monster: "monster",
    monsters: "monster",
    creature: "monster",
    creatures: "monster",
    condition: "condition",
    conditions: "condition",
    feat: "feat",
    feats: "feat",
    class: "class",
    classes: "class",
    species: "species",
    race: "species",
    background: "background"
  };

  // Table shorthand people use at the table.
  const ALIASES = {
    ac: "armor class",
    hp: "hit points",
    dc: "difficulty class",
    pb: "proficiency bonus",
    cr: "challenge rating",
    xp: "experience points",
    aoo: "opportunity attack",
    oa: "opportunity attack",
    thp: "temporary hit points"
  };

  // Gentle tie-breakers: when names match equally well, rules and spells come first.
  const KIND_WEIGHT = { condition: 6, rule: 5, spell: 4, feature: 3, class: 3, monster: 3, subclass: 2, feat: 2, "magic-item": 1, gear: 1, species: 1, trait: 0, background: 0, mine: 0 };

  // ---- pure search code (also tested in Node) ----

  function normalize(text) {
    return String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['’‘]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function stem(word) {
    const trimmed = word.replace(/(ing|ed|es|s)$/, "");
    return trimmed.length >= 4 ? trimmed : word;
  }

  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) {
      return max + 1;
    }
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      const row = [i];
      let best = i;
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + cost);
        best = Math.min(best, row[j]);
      }
      if (best > max) {
        return max + 1;
      }
      previous = row;
    }
    return previous[b.length];
  }

  function parseQuery(query) {
    const typed = normalize(query).split(" ").filter(Boolean);
    // Shorthand like "dc" always becomes real words and is never mistaken for a kind hint.
    const expanded = [];
    typed.forEach((word) => {
      if (ALIASES[word]) {
        ALIASES[word].split(" ").forEach((part) => expanded.push({ word: part, forced: true }));
      } else {
        expanded.push({ word, forced: false });
      }
    });
    const hinted = new Set();
    const meaningful = expanded.filter(({ word, forced }) => forced || !STOP_WORDS.has(word));
    const searchWords = meaningful.filter(({ word, forced }) => {
      if (!forced && KIND_HINTS[word]) {
        hinted.add(KIND_HINTS[word]);
        return false;
      }
      return true;
    });
    // "spells" on its own is a request to browse spells; the hint only filters when other words are present too.
    let terms = searchWords.map((item) => item.word);
    if (!terms.length && !hinted.size) {
      terms = meaningful.map((item) => item.word);
    }
    // One or two letters ("a", "up") only add noise, unless that is all the person typed.
    const longer = terms.filter((word) => word.length > 2);
    if (longer.length) {
      terms = longer;
    }
    return { terms: Array.from(new Set(terms)), hinted, phrase: meaningful.map((item) => item.word).join(" ") };
  }

  // Precomputes the lower-case forms once so each keystroke only does cheap string checks.
  function indexEntries(entries) {
    return entries.map((entry) => {
      const name = normalize(entry.n);
      return {
        entry,
        name,
        nameWords: name.split(" "),
        nameFlat: name.replace(/ /g, ""),
        sub: normalize(entry.s || ""),
        extra: normalize(entry.x || ""),
        text: normalize(entry.t),
        spaced: ` ${normalize(entry.t)}`
      };
    });
  }

  function countOccurrences(haystack, needle, cap = 6) {
    let count = 0;
    let at = haystack.indexOf(needle);
    while (at >= 0 && count < cap) {
      count += 1;
      at = haystack.indexOf(needle, at + needle.length);
    }
    return count;
  }

  function scoreTerm(doc, term, fuzzy = true) {
    const root = stem(term);
    if (doc.nameWords.includes(term)) {
      return 40;
    }
    if (doc.nameWords.some((word) => word.startsWith(term) || word.startsWith(root))) {
      return 28;
    }
    if (doc.name.includes(term)) {
      // "ball" in "Fireball" is a real match; "cover" in the middle of "Recovery" is not.
      return doc.nameFlat.startsWith(term) || doc.nameFlat.endsWith(term) ? 16 : 6;
    }
    if (doc.sub.includes(term) || doc.extra.includes(term)) {
      return 10;
    }
    if (doc.spaced.includes(` ${term}`) || (root !== term && doc.spaced.includes(` ${root}`))) {
      return 3 + countOccurrences(doc.spaced, ` ${root}`) * 0.5;
    }
    if (fuzzy && term.length >= 4) {
      const allowed = term.length >= 7 ? 2 : 1;
      if (doc.nameWords.some((word) => editDistance(term, word, allowed) <= allowed)) {
        return 14;
      }
      if (term.length >= 6 && editDistance(term, doc.nameFlat, 2) <= 2) {
        return 14;
      }
    }
    return 0;
  }

  function searchRules(index, query, options = {}) {
    const { terms, hinted, phrase: typedPhrase } = parseQuery(query);
    const allowed = options.kinds ? new Set(options.kinds) : null;
    const pool = allowed ? index.filter((doc) => allowed.has(doc.entry.k)) : index;
    if (!terms.length) {
      const browse = pool
        .filter((doc) => !hinted.size || hinted.has(doc.entry.k) || (hinted.has("class") && ["subclass", "feature"].includes(doc.entry.k)))
        .map((doc) => ({ doc, score: 0 }));
      return { terms, hinted, results: options.browse === false ? [] : browse.sort(browseOrder), partial: false, browsing: true };
    }
    const phrase = terms.join(" ");
    const flat = terms.join("");
    // Typo tolerance only kicks in for a word that appears nowhere ("firball"), so "cover" never turns up "hover".
    const fuzzyTerms = new Set(terms.filter((term) => !pool.some((doc) => scoreTerm(doc, term, false) > 0)));
    const full = [];
    const partial = [];
    pool.forEach((doc) => {
      let score = 0;
      let missing = 0;
      terms.forEach((term) => {
        const value = scoreTerm(doc, term, fuzzyTerms.has(term));
        if (value === 0) {
          missing += 1;
        } else {
          score += value;
        }
      });
      if (missing === terms.length) {
        return;
      }
      if (doc.name === typedPhrase && typedPhrase !== phrase) {
        score += 160;
      } else if (doc.name === phrase || doc.nameFlat === flat) {
        score += 120;
      } else if (doc.name.startsWith(`${phrase} `)) {
        score += 50;
      } else if (terms.length > 1 && doc.nameFlat.startsWith(flat)) {
        score += 30;
      } else if (terms.length > 1 && doc.name.includes(phrase)) {
        score += 20;
      }
      if (hinted.has(doc.entry.k)) {
        score += 15;
      }
      score += (KIND_WEIGHT[doc.entry.k] || 0) - doc.name.length * 0.05;
      if (doc.entry.k === "mine") {
        score += 8;
      }
      (missing === 0 ? full : partial).push({ doc, score: score - missing * 20 });
    });
    const byScore = (a, b) => b.score - a.score || a.doc.name.localeCompare(b.doc.name);
    full.sort(byScore);
    if (full.length) {
      return { terms, hinted, results: full, partial: false, browsing: false };
    }
    partial.sort(byScore);
    return { terms, hinted, results: partial, partial: partial.length > 0, browsing: false };
  }

  function spellLevel(entry) {
    if (/cantrip/.test(entry.s)) {
      return 0;
    }
    const match = /^(\d+)/.exec(entry.s);
    return match ? Number(match[1]) : 99;
  }

  function browseOrder(a, b) {
    const ea = a.doc.entry;
    const eb = b.doc.entry;
    if (ea.k === "spell" && eb.k === "spell") {
      return spellLevel(ea) - spellLevel(eb) || a.doc.name.localeCompare(b.doc.name);
    }
    if (ea.k !== eb.k) {
      return (KIND_WEIGHT[eb.k] || 0) - (KIND_WEIGHT[ea.k] || 0) || ea.k.localeCompare(eb.k);
    }
    return a.doc.name.localeCompare(b.doc.name);
  }

  // One or two short pieces of the text around where the search words appear, with markup removed.
  function makeSnippet(text, terms) {
    // Lines that only list stats (Casting Time, AC...) make dull snippets, so lead with real sentences when there is no match.
    const lines = String(text).split("\n");
    const prose = lines.filter((line) => !/^\*\*[^*]+:?\*\*\s/.test(line) && !/^#+\s/.test(line));
    const plain = String(text).replace(/\*\*/g, "").replace(/\n+/g, " ").replace(/^#+\s*/g, "");
    const lc = plain.toLowerCase();
    let at = -1;
    for (const term of terms) {
      const found = lc.indexOf(term);
      if (found >= 0 && (at < 0 || found < at)) {
        at = found;
      }
    }
    if (at < 0) {
      const lead = (prose[0] || plain).replace(/\*\*/g, "").trim();
      return lead.length > 160 ? `${lead.slice(0, 160).trim()}…` : lead;
    }
    const start = Math.max(0, at - 50);
    const end = Math.min(plain.length, at + 130);
    return `${start > 0 ? "…" : ""}${plain.slice(start, end).trim()}${end < plain.length ? "…" : ""}`;
  }

  function webLinks(query) {
    const q = encodeURIComponent(String(query).trim());
    return [
      { label: "Search D&D Beyond", url: `https://www.dndbeyond.com/search?q=${q}` },
      { label: "Search the 5e wiki", url: `https://dnd5e.wikidot.com/search:site/q/${q}` }
    ];
  }

  // Splits text into library entries wherever a line starts with "# Title" (a single #).
  function parseLibraryText(text, fallbackTitle) {
    const lines = String(text).replace(/\r\n?/g, "\n").split("\n");
    const sections = [];
    let current = null;
    lines.forEach((line) => {
      const heading = /^#\s+(\S.*)$/.exec(line);
      if (heading) {
        current = { title: heading[1].trim(), body: [] };
        sections.push(current);
      } else if (current) {
        current.body.push(line);
      } else if (line.trim()) {
        current = { title: fallbackTitle, body: [line] };
        sections.push(current);
      }
    });
    return sections
      .map((s) => ({ title: s.title.slice(0, 200), body: s.body.join("\n").trim() }))
      .filter((s) => s.title && s.body);
  }

  function buildLibraryText(entries) {
    return entries
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((entry) => `# ${entry.title}\n\n${entry.body}`)
      .join("\n\n\n");
  }

  // Reads the class entry's "Features by level" lines into { hitDie, levels: { 7: { features, extras } } }.
  function parseClassLevels(entry) {
    const levels = {};
    String(entry.t).split("\n").forEach((line) => {
      const match = /^\*\*Level (\d+)\*\* \(proficiency [^)]*\): (.*)$/.exec(line);
      if (match) {
        const [featureText, extras] = match[2].split(" \u2014 ");
        levels[Number(match[1])] = {
          features: /^no new features$/i.test(featureText.trim()) ? [] : featureText.split(", ").map((f) => f.trim()).filter(Boolean),
          extras: (extras || "").trim()
        };
      }
    });
    const die = /\*\*Hit Point Die:\*\* d(\d+)/.exec(String(entry.t));
    return { hitDie: die ? Number(die[1]) : null, levels };
  }

  function libraryEntry(record) {
    return { k: "mine", n: record.title, s: "My library", t: record.body, id: record.id };
  }

  // ---- Rules tab UI ----

  const PAGE = 60;
  const state = {
    index: [],
    library: [],
    loaded: false,
    loading: false,
    loadError: "",
    query: "",
    kind: "all",
    limit: PAGE,
    selected: null,
    editing: null,
    storageOk: true,
    focusAfterShow: false
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
    children.flat(Infinity).forEach((child) => {
      if (child !== null && child !== undefined && child !== false) {
        node.append(child);
      }
    });
    return node;
  }

  function say(message, kind = "") {
    const status = $("rulesStatus");
    status.textContent = message;
    status.className = `muted notes-status ${kind}`.trim();
  }

  function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function highlighter(terms) {
    if (!terms.length) {
      return null;
    }
    const parts = [];
    terms.forEach((term) => {
      parts.push(term, stem(term));
    });
    const sorted = Array.from(new Set(parts)).sort((a, b) => b.length - a.length);
    return new RegExp(`\\b(${sorted.map(escapeRegExp).join("|")})`, "gi");
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

  const splitRow = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  // Text with a little formatting: "## Heading", "- bullets", "**bold**", and "|a|b|" tables. Built from text nodes only.
  function renderBody(container, text, terms) {
    container.textContent = "";
    const regex = highlighter(terms);
    let list = null;
    let rows = [];
    const flushTable = () => {
      if (!rows.length) {
        return;
      }
      const hasHead = rows.length > 1 && rows[1].every((cell) => /^:?-{2,}:?$/.test(cell));
      const body = rows.filter((_, index) => !(hasHead && index === 1));
      const table = el("table", { class: "rules-table" });
      body.forEach((cells, index) => {
        const tr = el("tr");
        cells.forEach((cell) => {
          const node = el(hasHead && index === 0 ? "th" : "td");
          appendInline(node, cell, regex);
          tr.append(node);
        });
        table.append(tr);
      });
      container.append(el("div", { class: "rules-table-wrap" }, table));
      rows = [];
    };
    String(text).replace(/\r\n?/g, "\n").split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("|")) {
        list = null;
        rows.push(splitRow(trimmed));
        return;
      }
      flushTable();
      if (!trimmed) {
        list = null;
        return;
      }
      const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
      if (heading) {
        list = null;
        const h = el(`h${heading[1].length + 2}`);
        appendInline(h, heading[2], regex);
        container.append(h);
        return;
      }
      const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
      if (bullet) {
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
      const p = el("p");
      appendInline(p, trimmed, regex);
      container.append(p);
    });
    flushTable();
  }

  // ---- data ----

  function allDocs() {
    return state.index.concat(state.libraryDocs || []);
  }

  function rebuildLibraryDocs() {
    state.libraryDocs = indexEntries(state.library.map(libraryEntry));
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("The rules file could not be loaded. Check your connection and try again."));
      document.head.append(script);
    });
  }

  let dataPromise = null;
  function ensureData() {
    if (window.SRD_DATA) {
      return Promise.resolve();
    }
    if (!dataPromise) {
      const meta = document.querySelector('meta[name="app-version"]');
      const version = meta && meta.content && meta.content !== "dev" ? `?v=${encodeURIComponent(meta.content)}` : "";
      dataPromise = loadScript(`rules-data.js${version}`).catch((error) => {
        dataPromise = null;
        throw error;
      });
    }
    return dataPromise;
  }

  // For the level-up banner: what a class gains at each level, from the built-in rules.
  async function classLevels(className) {
    const name = normalize(className || "");
    if (!name) {
      return null;
    }
    await ensureData();
    const classes = window.SRD_DATA.entries.filter((e) => e.k === "class");
    const entry = classes.find((e) => normalize(e.n) === name) || classes.find((e) => name.includes(normalize(e.n)));
    return entry ? parseClassLevels(entry) : null;
  }

  async function loadRules() {
    if (state.loaded || state.loading) {
      return;
    }
    state.loading = true;
    state.loadError = "";
    render();
    try {
      await ensureData();
      state.index = indexEntries(window.SRD_DATA.entries);
      state.loaded = true;
    } catch (error) {
      state.loadError = error.message || "The rules could not be loaded.";
    }
    try {
      state.library = (await Store.getAll("library")).filter((r) => r && r.title && typeof r.body === "string");
    } catch {
      state.library = [];
      state.storageOk = false;
      $("rulesStorageWarning").hidden = false;
    }
    rebuildLibraryDocs();
    state.loading = false;
    render();
    if (state.focusAfterShow) {
      focusSearch();
    }
  }

  // ---- screen ----

  const currentKinds = () => (state.kind === "all" ? null : KIND_GROUPS[state.kind]);

  function runSearch() {
    return searchRules(allDocs(), state.query, { kinds: currentKinds() });
  }

  function previousTabLabel() {
    const name = typeof Tabs !== "undefined" ? Tabs.previous() : null;
    if (!name || name === "rules") {
      return null;
    }
    return { name, label: name.charAt(0).toUpperCase() + name.slice(1) };
  }

  function renderReturn() {
    const back = previousTabLabel();
    const button = $("rulesReturn");
    button.hidden = !back;
    if (back) {
      button.textContent = `Back to ${back.label}`;
      button.dataset.tab = back.name;
    }
  }

  function renderExamples(list) {
    const examples = ["fireball", "grappled", "reckless attack", "opportunity attack", "cover", "fire giant", "concentration", "topple"];
    list.append(
      el(
        "div",
        { class: "rules-empty" },
        el("h2", { text: "Search the rules" }),
        el("p", { class: "muted", text: "Type a word or a question. The built-in rules are the free D&D 2024 rules (SRD 5.2), so they work without the internet once this page has loaded." }),
        el("p", { class: "muted", text: "Try one of these:" }),
        el(
          "div",
          { class: "rules-examples" },
          examples.map((word) => el("button", { type: "button", class: "chip-btn", "data-example": word, text: word }))
        )
      )
    );
  }

  function renderList() {
    const list = $("rulesList");
    list.textContent = "";
    $("rulesSearchClear").hidden = !state.query;
    if (state.loading && !state.loaded) {
      list.append(el("p", { class: "rules-empty muted", text: "Loading the rules…" }));
      $("rulesSummary").textContent = "";
      return;
    }
    if (state.loadError) {
      list.append(
        el(
          "div",
          { class: "rules-empty" },
          el("p", { class: "muted", text: state.loadError }),
          el("button", { type: "button", class: "chip-btn primary", "data-retry": "1", text: "Try again" })
        )
      );
      $("rulesSummary").textContent = "";
      return;
    }
    const outcome = runSearch();
    const terms = outcome.terms;
    if (outcome.browsing && state.kind === "all" && !outcome.hinted.size) {
      renderExamples(list);
      $("rulesSummary").textContent = `${state.index.length.toLocaleString()} rules entries${state.library.length ? ` and ${state.library.length} of yours` : ""}.`;
      return;
    }
    const total = outcome.results.length;
    const label = state.query.trim();
    if (outcome.browsing) {
      $("rulesSummary").textContent = `${total.toLocaleString()} entr${total === 1 ? "y" : "ies"}, A to Z.`;
    } else if (!total) {
      $("rulesSummary").textContent = `Nothing found for "${label}".`;
    } else if (outcome.partial) {
      $("rulesSummary").textContent = `No entry has all of those words. Showing ${total.toLocaleString()} partial match${total === 1 ? "" : "es"}.`;
    } else {
      $("rulesSummary").textContent = `${total.toLocaleString()} result${total === 1 ? "" : "s"} for "${label}".`;
    }
    if (!total) {
      list.append(emptyWithLinks(label));
      return;
    }
    const regex = highlighter(terms);
    const items = el("ul", { class: "note-items" });
    outcome.results.slice(0, state.limit).forEach(({ doc }) => {
      const entry = doc.entry;
      const key = entryKey(entry);
      const title = el("span", { class: "note-title" });
      appendHighlighted(title, entry.n, regex);
      const button = el(
        "button",
        { type: "button", class: "note-item", "data-key": key, "aria-current": state.selected === key ? "true" : "false" },
        title,
        el("span", { class: "note-meta", text: [KIND_LABELS[entry.k], entry.s && entry.s !== KIND_LABELS[entry.k] ? entry.s : ""].filter(Boolean).join(" · ") })
      );
      if (terms.length) {
        const snippet = el("span", { class: "note-snippet" });
        appendHighlighted(snippet, makeSnippet(entry.t, terms), regex);
        button.append(snippet);
      }
      items.append(el("li", {}, button));
    });
    list.append(items);
    if (total > state.limit) {
      list.append(el("button", { type: "button", class: "chip-btn more-btn", "data-more": "1", text: `Show more (${total - state.limit} left)` }));
    }
    if (terms.length) {
      list.append(linksBlock(label));
    }
  }

  function linksBlock(label) {
    return el(
      "p",
      { class: "rules-links muted" },
      "Not what you need? ",
      webLinks(label).map((link, index) => [index ? " · " : "", el("a", { href: link.url, target: "_blank", rel: "noopener noreferrer", text: link.label })])
    );
  }

  function emptyWithLinks(label) {
    return el(
      "div",
      { class: "rules-empty" },
      el("h2", { text: "No match" }),
      el("p", { class: "muted", text: "The built-in rules are the free SRD, so some books, subclasses and newer content are not included. Try fewer or simpler words, or add the text to My library." }),
      linksBlock(label)
    );
  }

  const entryKey = (entry) => (entry.k === "mine" ? `mine:${entry.id}` : `${entry.k}:${entry.i}`);

  function findEntry(key) {
    const doc = allDocs().find((d) => entryKey(d.entry) === key);
    return doc ? doc.entry : null;
  }

  function renderDetail() {
    const detail = $("rulesDetail");
    detail.textContent = "";
    $("rulesLayout").classList.toggle("has-selection", Boolean(state.selected || state.editing));
    if (state.editing) {
      renderEditor(detail);
      return;
    }
    const entry = state.selected ? findEntry(state.selected) : null;
    if (!entry) {
      detail.append(
        el(
          "div",
          { class: "notes-empty" },
          el("h2", { text: "Pick a result" }),
          el("p", { text: "Rules, spells, monsters and anything you saved in My library show up here." })
        )
      );
      return;
    }
    const terms = parseQuery(state.query).terms;
    detail.append(el("button", { type: "button", class: "chip-btn back-btn", "data-back": "1", text: "Back to results" }));
    detail.append(
      el(
        "header",
        { class: "note-header" },
        el("p", { class: "note-session", text: KIND_LABELS[entry.k] }),
        el("h2", { text: entry.n }),
        entry.s && entry.s !== KIND_LABELS[entry.k] ? el("p", { class: "muted", text: entry.s }) : null
      )
    );
    if (entry.k === "mine") {
      detail.append(
        el(
          "div",
          { class: "note-actions" },
          el("button", { type: "button", class: "chip-btn", "data-edit": entry.id, text: "Edit" }),
          el("button", { type: "button", class: "chip-btn", "data-delete": entry.id, text: "Delete" })
        )
      );
    }
    const body = el("div", { class: "note-body rules-body" });
    renderBody(body, entry.t, terms);
    detail.append(body);
    if (entry.k !== "mine") {
      detail.append(linksBlock(entry.n));
    }
  }

  function renderEditor(detail) {
    const record = state.editing;
    const title = el("input", { type: "text", id: "libTitle", maxlength: "200", value: record.title, placeholder: "For example: Path of the Wild Heart" });
    const body = el("textarea", { id: "libBody", rows: "14", placeholder: "Paste or type the rules text here. You can use ## headings, - bullets and **bold**." });
    body.value = record.body;
    detail.append(
      el("button", { type: "button", class: "chip-btn back-btn", "data-cancel": "1", text: "Back to results" }),
      el("h2", { text: record.isNew ? "Add to My library" : "Edit entry" }),
      el(
        "div",
        { class: "note-editor" },
        el("label", { class: "field" }, el("span", { text: "Title" }), title),
        el("label", { class: "field" }, el("span", { text: "Text" }), body),
        el(
          "div",
          { class: "note-actions" },
          el("button", { type: "button", class: "chip-btn primary", "data-save": "1", text: "Save" }),
          el("button", { type: "button", class: "chip-btn", "data-cancel": "1", text: "Cancel" })
        )
      )
    );
    title.focus();
  }

  function render() {
    renderReturn();
    renderList();
    renderDetail();
  }

  function focusSearch() {
    const input = $("rulesSearch");
    input.focus();
    input.select();
  }

  // ---- My library ----

  async function saveEditing() {
    const title = $("libTitle").value.trim();
    const body = $("libBody").value.replace(/\r\n?/g, "\n").trim();
    if (!title || !body) {
      say("Add both a title and some text.", "error");
      return;
    }
    const now = Date.now();
    const record = { id: state.editing.id, title: title.slice(0, 200), body, created: state.editing.created || now, updated: now };
    try {
      await Store.put("library", record);
      Store.requestPersistence();
    } catch {
      say("Could not save in this browser mode. Your entry is kept only until you leave the page.", "error");
    }
    const at = state.library.findIndex((r) => r.id === record.id);
    if (at >= 0) {
      state.library[at] = record;
    } else {
      state.library.push(record);
    }
    rebuildLibraryDocs();
    state.editing = null;
    state.selected = `mine:${record.id}`;
    say("Saved to My library.");
    render();
  }

  async function deleteEntry(id) {
    const record = state.library.find((r) => r.id === id);
    if (!record || !confirm(`Delete "${record.title}" from My library? This cannot be undone. Export first if you are unsure.`)) {
      return;
    }
    try {
      await Store.remove("library", id);
    } catch {
      say("Could not delete from storage.", "error");
    }
    state.library = state.library.filter((r) => r.id !== id);
    rebuildLibraryDocs();
    state.selected = null;
    say("Deleted.");
    render();
  }

  function newId() {
    return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `lib-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function startNew() {
    state.editing = { id: newId(), title: "", body: "", isNew: true };
    state.selected = null;
    render();
  }

  async function importFiles(files) {
    const known = new Set(state.library.map((r) => `${r.title.trim()}|${r.body.trim()}`));
    const added = [];
    for (const file of files) {
      if (file.size > 5 * 1024 * 1024) {
        say(`${file.name} is too large (over 5 MB).`, "error");
        continue;
      }
      const text = await file.text();
      const fallback = file.name.replace(/\.[^.]+$/, "") || "Imported text";
      parseLibraryText(text, fallback).forEach((section) => {
        const key = `${section.title.trim()}|${section.body.trim()}`;
        if (!known.has(key)) {
          known.add(key);
          const now = Date.now();
          added.push({ id: newId(), title: section.title, body: section.body, created: now, updated: now });
        }
      });
    }
    if (!added.length) {
      say("Nothing new to import. Lines that start with \"# Title\" begin a new entry.", "error");
      return;
    }
    try {
      await Store.putMany("library", added);
      Store.requestPersistence();
    } catch {
      say("Imported, but this browser mode cannot keep them after you leave the page.", "error");
    }
    state.library.push(...added);
    rebuildLibraryDocs();
    state.kind = "mine";
    $("rulesKind").value = "mine";
    state.query = "";
    $("rulesSearch").value = "";
    say(`Imported ${added.length} entr${added.length === 1 ? "y" : "ies"} into My library.`);
    render();
  }

  function exportLibrary() {
    if (!state.library.length) {
      say("My library is empty. Add an entry first.", "error");
      return;
    }
    const blob = new Blob([buildLibraryText(state.library)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: `dnd-my-library-${new Date().toISOString().slice(0, 10)}.txt` });
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    say("Exported My library as a text file.");
  }

  // ---- events ----

  function closeMenus() {
    document.querySelectorAll("#rulesTab details.more-menu[open]").forEach((d) => d.removeAttribute("open"));
  }

  function setQuery(value) {
    state.query = value;
    state.limit = PAGE;
    state.selected = null;
    state.editing = null;
    renderList();
    renderDetail();
  }

  function bind() {
    const search = $("rulesSearch");
    let timer = null;
    search.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => setQuery(search.value), 90);
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && search.value) {
        event.preventDefault();
        search.value = "";
        setQuery("");
      } else if (event.key === "Enter") {
        event.preventDefault();
        clearTimeout(timer);
        if (state.query !== search.value) {
          setQuery(search.value);
        }
        const target = $("rulesList").querySelector(".note-item");
        if (target) {
          state.selected = target.dataset.key;
          renderList();
          renderDetail();
        }
      }
    });
    $("rulesSearchClear").addEventListener("click", () => {
      search.value = "";
      setQuery("");
      search.focus();
    });
    $("rulesKind").addEventListener("change", (event) => {
      state.kind = event.target.value;
      state.limit = PAGE;
      state.selected = null;
      state.editing = null;
      render();
    });
    $("rulesReturn").addEventListener("click", (event) => {
      const name = event.currentTarget.dataset.tab;
      if (name) {
        Tabs.show(name);
      }
    });
    $("rulesList").addEventListener("click", (event) => {
      const item = event.target.closest(".note-item");
      if (item) {
        state.selected = item.dataset.key;
        state.editing = null;
        renderList();
        renderDetail();
        $("rulesLayout").scrollIntoView({ block: "start" });
        return;
      }
      const example = event.target.closest("[data-example]");
      if (example) {
        search.value = example.dataset.example;
        setQuery(search.value);
        return;
      }
      if (event.target.closest("[data-more]")) {
        state.limit += PAGE;
        renderList();
        return;
      }
      if (event.target.closest("[data-retry]")) {
        loadRules();
      }
    });
    $("rulesDetail").addEventListener("click", (event) => {
      const target = event.target.closest("button");
      if (!target) {
        return;
      }
      if (target.dataset.back !== undefined) {
        state.selected = null;
        renderList();
        renderDetail();
      } else if (target.dataset.edit) {
        const record = state.library.find((r) => r.id === target.dataset.edit);
        if (record) {
          state.editing = { ...record };
          renderDetail();
        }
      } else if (target.dataset.delete) {
        deleteEntry(target.dataset.delete);
      } else if (target.dataset.save !== undefined) {
        saveEditing();
      } else if (target.dataset.cancel !== undefined) {
        state.editing = null;
        renderList();
        renderDetail();
      }
    });
    $("libNew").addEventListener("click", () => {
      closeMenus();
      startNew();
    });
    $("libImport").addEventListener("click", () => {
      closeMenus();
      $("libFiles").click();
    });
    $("libFiles").addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      event.target.value = "";
      if (files.length) {
        await importFiles(files);
      }
    });
    $("libExport").addEventListener("click", () => {
      closeMenus();
      exportLibrary();
    });
    document.addEventListener("keydown", (event) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (Tabs.current() !== "rules") {
          state.focusAfterShow = true;
          Tabs.show("rules");
        }
        focusSearch();
      }
    });
  }

  // Opens the Rules tab with a search already typed in (used by the level-up banner).
  function open(query) {
    state.focusAfterShow = false;
    state.kind = "all";
    $("rulesKind").value = "all";
    $("rulesSearch").value = query;
    state.query = query;
    state.limit = PAGE;
    state.selected = null;
    state.editing = null;
    Tabs.show("rules");
  }

  function init() {
    bind();
    Tabs.register("rules", {
      onShow() {
        if (!state.loaded && !state.loading) {
          loadRules();
        } else {
          render();
        }
        if (state.focusAfterShow) {
          state.focusAfterShow = false;
          focusSearch();
        }
      }
    });
  }

  return { init, open, classLevels, parseClassLevels, normalize, parseQuery, indexEntries, searchRules, makeSnippet, webLinks, parseLibraryText, buildLibraryText, editDistance, stem };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Rules;
}
