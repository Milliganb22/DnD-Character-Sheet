const STORAGE_KEY = "dnd-sheet-v1";
const DEFAULT_ATTACK_ROWS = 5;
const PRIMAL_KNOWLEDGE_SKILLS = new Set([
  "acrobatics",
  "intimidation",
  "perception",
  "stealth",
  "survival"
]);

let saveTimer = null;
let rageUseSpent = false;

const ABILITIES = [
  { key: "str", label: "Strength" },
  { key: "dex", label: "Dexterity" },
  { key: "con", label: "Constitution" },
  { key: "int", label: "Intelligence" },
  { key: "wis", label: "Wisdom" },
  { key: "cha", label: "Charisma" }
];

const SAVES = [
  { key: "strSave", label: "Strength", ability: "str" },
  { key: "dexSave", label: "Dexterity", ability: "dex" },
  { key: "conSave", label: "Constitution", ability: "con" },
  { key: "intSave", label: "Intelligence", ability: "int" },
  { key: "wisSave", label: "Wisdom", ability: "wis" },
  { key: "chaSave", label: "Charisma", ability: "cha" }
];

const SKILLS = [
  { key: "acrobatics", label: "Acrobatics", ability: "dex" },
  { key: "animalHandling", label: "Animal Handling", ability: "wis" },
  { key: "arcana", label: "Arcana", ability: "int" },
  { key: "athletics", label: "Athletics", ability: "str" },
  { key: "deception", label: "Deception", ability: "cha" },
  { key: "history", label: "History", ability: "int" },
  { key: "insight", label: "Insight", ability: "wis" },
  { key: "intimidation", label: "Intimidation", ability: "cha" },
  { key: "investigation", label: "Investigation", ability: "int" },
  { key: "medicine", label: "Medicine", ability: "wis" },
  { key: "nature", label: "Nature", ability: "int" },
  { key: "perception", label: "Perception", ability: "wis" },
  { key: "performance", label: "Performance", ability: "cha" },
  { key: "persuasion", label: "Persuasion", ability: "cha" },
  { key: "religion", label: "Religion", ability: "int" },
  { key: "sleightOfHand", label: "Sleight of Hand", ability: "dex" },
  { key: "stealth", label: "Stealth", ability: "dex" },
  { key: "survival", label: "Survival", ability: "wis" }
];

const simpleFields = [
  "name",
  "class",
  "race",
  "background",
  "alignment",
  "level",
  "xp",
  "ac",
  "initiative",
  "speed",
  "hitDice",
  "maxHp",
  "currentHp",
  "tempHp",
  "initiativeBonus",
  "rageUsesLeft",
  "cp",
  "sp",
  "ep",
  "gp",
  "pp"
];

const CURRENCY_IDS = ["cp", "sp", "ep", "gp", "pp"];
const DEATH_SAVE_IDS = ["dsS1", "dsS2", "dsS3", "dsF1", "dsF2", "dsF3"];
const PASSIVE_SKILLS = [
  { skill: "perception", outputId: "passivePerception" },
  { skill: "insight", outputId: "passiveInsight" },
  { skill: "investigation", outputId: "passiveInvestigation" }
];

const richTextFields = ["masteryNotes", "proficiencies", "traits", "inventory", "notes"];

function getModifier(score) {
  return Math.floor((Number(score) - 10) / 2);
}

function formatSigned(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

function profByLevel(level) {
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  return 2 + Math.floor((lvl - 1) / 4);
}

function rageDamageByLevel(level) {
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  if (lvl >= 16) {
    return 4;
  }
  if (lvl >= 9) {
    return 3;
  }
  return 2;
}

function rageUsesByLevel(level) {
  const lvl = Math.max(1, Math.min(20, Number(level) || 1));
  if (lvl >= 17) {
    return 6;
  }
  if (lvl >= 12) {
    return 5;
  }
  if (lvl >= 6) {
    return 4;
  }
  if (lvl >= 3) {
    return 3;
  }
  return 2;
}

function clearDeathSaves() {
  DEATH_SAVE_IDS.forEach((id) => {
    document.getElementById(id).checked = false;
  });
}

function plainTextToHtml(value) {
  const temp = document.createElement("div");
  temp.textContent = value;
  return temp.innerHTML.replace(/\n/g, "<br>");
}

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "U", "BR", "P", "DIV", "SPAN", "UL", "OL", "LI"]);
const DROP_TAGS = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "LINK", "META"]);

function sanitizeInto(source, target) {
  source.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(document.createTextNode(node.textContent));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }
    const tag = node.tagName.toUpperCase();
    if (DROP_TAGS.has(tag)) {
      return;
    }
    if (ALLOWED_TAGS.has(tag)) {
      const clean = document.createElement(tag.toLowerCase());
      sanitizeInto(node, clean);
      target.appendChild(clean);
    } else {
      sanitizeInto(node, target);
    }
  });
}

// Imported JSON and pasted content are untrusted: rebuild from an allowlist, dropping every attribute.
function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const wrapper = document.createElement("div");
  sanitizeInto(doc.body, wrapper);
  return wrapper.innerHTML;
}

function executeRichCommand(editor, cmd, value = null) {
  editor.focus();
  document.execCommand(cmd, false, value);
}

function buildAbilityCards() {
  const container = document.getElementById("abilityCards");
  container.innerHTML = "";

  ABILITIES.forEach((ab) => {
    const card = document.createElement("div");
    card.className = "ability-card";
    card.innerHTML = `
      <div class="ability-head">
        <span>${ab.label}</span>
        <span id="${ab.key}Mod" class="ability-mod">+0</span>
      </div>
      <div class="ability-body">
        <label>
          Score
          <input id="${ab.key}" type="number" min="1" max="30" value="10" />
        </label>
      </div>
    `;
    container.appendChild(card);
  });
}

function buildChecklist(containerId, rows, includeExpertise) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = "check-item";
    item.innerHTML = `
      <input id="${row.key}Prof" type="checkbox" title="Proficient" />
      <label for="${row.key}Prof">${row.label}</label>
      <span id="${row.key}Val" class="value-pill">+0</span>
    `;

    if (includeExpertise) {
      const expertise = document.createElement("input");
      expertise.id = `${row.key}Expert`;
      expertise.type = "checkbox";
      expertise.title = "Expertise";
      expertise.setAttribute("aria-label", `${row.label} expertise`);
      item.classList.add("has-expertise");
      item.appendChild(expertise);
    }

    container.appendChild(item);
  });
}

function getAttackRowsContainer() {
  return document.getElementById("attacksRows");
}

function addAttackRow(values = {}) {
  const rows = getAttackRowsContainer();
  const row = document.createElement("div");
  row.className = "attack-row";
  row.dataset.attackRow = "true";
  row.innerHTML = `
    <input class="attack-name" type="text" placeholder="Attack" />
    <input class="attack-bonus" type="text" placeholder="+8" />
    <input class="attack-type" type="text" placeholder="Damage and notes" />
  `;
  row.classList.toggle("is-blank", !values.name && !values.bonus && !values.type);
  const rowNumber = rows.children.length + 1;
  [
    [".attack-name", "name", values.name],
    [".attack-bonus", "bonus", values.bonus],
    [".attack-type", "type", values.type]
  ].forEach(([selector, label, value]) => {
    const input = row.querySelector(selector);
    input.value = String(value ?? "");
    input.setAttribute("aria-label", `Attack ${rowNumber} ${label}`);
  });
  rows.appendChild(row);
}

function buildAttacksTable(existingRows = []) {
  const container = document.getElementById("attacksTable");
  container.innerHTML = '<div id="attacksRows"></div>';

  if (existingRows.length > 0) {
    existingRows.forEach((row) => addAttackRow(row));
  } else {
    for (let i = 0; i < DEFAULT_ATTACK_ROWS; i += 1) {
      addAttackRow();
    }
  }

  // Empty slots stay hidden until "+" is pressed, unless there is nothing else to show.
  const allBlank = Array.from(container.querySelectorAll(".attack-row")).every((row) => row.classList.contains("is-blank"));
  container.classList.toggle("show-blank", allBlank);
}

function collectAttackRows() {
  return Array.from(document.querySelectorAll(".attack-row[data-attack-row='true']")).map((row) => ({
    name: row.querySelector(".attack-name")?.value || "",
    bonus: row.querySelector(".attack-bonus")?.value || "",
    type: row.querySelector(".attack-type")?.value || ""
  }));
}

function parseLegacyAttacks(data) {
  const rows = [];
  for (let i = 1; i <= 50; i += 1) {
    const name = data[`attack${i}Name`];
    const bonus = data[`attack${i}Bonus`];
    const type = data[`attack${i}Type`];
    if (name === undefined && bonus === undefined && type === undefined) {
      continue;
    }
    rows.push({
      name: name || "",
      bonus: bonus || "",
      type: type || ""
    });
  }
  return rows;
}

function getData() {
  const data = {};

  simpleFields.forEach((id) => {
    data[id] = document.getElementById(id).value;
  });

  ABILITIES.forEach((ab) => {
    data[ab.key] = document.getElementById(ab.key).value;
  });

  SAVES.forEach((s) => {
    data[`${s.key}Prof`] = document.getElementById(`${s.key}Prof`).checked;
  });

  SKILLS.forEach((s) => {
    data[`${s.key}Prof`] = document.getElementById(`${s.key}Prof`).checked;
    data[`${s.key}Expert`] = document.getElementById(`${s.key}Expert`).checked;
  });

  data.isRaging = document.getElementById("isRaging").checked;

  DEATH_SAVE_IDS.forEach((id) => {
    data[id] = document.getElementById(id).checked;
  });

  richTextFields.forEach((id) => {
    data[id] = document.getElementById(id).innerHTML;
  });

  data.attacks = collectAttackRows();
  data.battle = Battle.collect();
  data.items = Items.collect();
  data.levelUp = levelUpState ? { ...levelUpState } : null;
  data.rageUseSpent = rageUseSpent;
  return data;
}

function setData(data) {
  if (!data || typeof data !== "object") {
    return;
  }

  [...simpleFields, ...ABILITIES.map((a) => a.key)].forEach((id) => {
    if (id in data) {
      document.getElementById(id).value = data[id];
    }
  });

  SAVES.forEach((s) => {
    const id = `${s.key}Prof`;
    if (id in data) {
      document.getElementById(id).checked = Boolean(data[id]);
    }
  });

  SKILLS.forEach((s) => {
    const prof = `${s.key}Prof`;
    const expert = `${s.key}Expert`;
    if (prof in data) {
      document.getElementById(prof).checked = Boolean(data[prof]);
    }
    if (expert in data) {
      document.getElementById(expert).checked = Boolean(data[expert]);
    }
  });

  if ("isRaging" in data) {
    document.getElementById("isRaging").checked = Boolean(data.isRaging);
  }
  rageUseSpent = Boolean(data.rageUseSpent) && Boolean(data.isRaging);

  DEATH_SAVE_IDS.forEach((id) => {
    document.getElementById(id).checked = Boolean(data[id]);
  });

  // Older saves stored the final initiative number; keep it by turning the difference from DEX into a bonus.
  if (!("initiativeBonus" in data) && "initiative" in data) {
    const dexMod = getModifier(Number(data.dex) || 10);
    document.getElementById("initiativeBonus").value = String((Number(data.initiative) || 0) - dexMod);
  }

  if (!("rageUsesLeft" in data)) {
    document.getElementById("rageUsesLeft").value = String(rageUsesByLevel(data.level ?? document.getElementById("level").value));
  }

  richTextFields.forEach((id) => {
    if (id in data && typeof data[id] === "string") {
      const value = data[id];
      if (value.includes("<") && value.includes(">")) {
        document.getElementById(id).innerHTML = sanitizeHtml(value);
      } else {
        document.getElementById(id).innerHTML = plainTextToHtml(value);
      }
    }
  });

  const attackRows = Array.isArray(data.attacks) ? data.attacks : parseLegacyAttacks(data);
  buildAttacksTable(attackRows);
  Items.apply(data.items);
  levelUpState = sanitizeLevelUp(data.levelUp);
  renderLevelUp();
  Battle.apply(data.battle);

  renderAllCards();
  updateDerived();
}

// ---- Read view for long text: each blank-line-separated block becomes a card. The editor stays the data. ----
const CARD_VIEWS = [
  ["traits", "traitsCards"],
  ["masteryNotes", "masteryCards"]
];

function isBlankNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return !node.textContent.trim();
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return true;
  }
  return node.tagName === "BR" || !node.textContent.trim();
}

function splitEntries(editor) {
  const nodes = Array.from(editor.childNodes);
  const entries = [];
  let current = [];
  const flush = () => {
    if (current.some((n) => !isBlankNode(n))) {
      entries.push(current);
    }
    current = [];
  };

  nodes.forEach((node, i) => {
    if (node.nodeType === Node.ELEMENT_NODE && node.tagName === "BR") {
      const doubled = (nodes[i + 1] && nodes[i + 1].nodeName === "BR") || (nodes[i - 1] && nodes[i - 1].nodeName === "BR");
      if (doubled) {
        flush();
      } else {
        current.push(node);
      }
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && isBlankNode(node)) {
      flush();
      return;
    }
    current.push(node);
  });
  flush();
  return entries;
}

function textBefore(root, el) {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEndBefore(el);
  return range.toString().trim();
}

function trimLeading(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node.textContent.replace(/^[\s :\-–—]+/, "");
    node.textContent = text;
    if (text) {
      break;
    }
    node = walker.nextNode();
  }
  while (root.firstChild && isBlankNode(root.firstChild)) {
    root.removeChild(root.firstChild);
  }
}

function buildCard(nodes) {
  const body = document.createElement("div");
  body.className = "entry-body";
  nodes.forEach((n) => body.appendChild(n.cloneNode(true)));

  const card = document.createElement("article");
  card.className = "entry";

  const lead = body.querySelector("b, strong, u");
  if (lead && textBefore(body, lead) === "") {
    const title = lead.textContent.replace(/[\s :\-–—]+$/, "").trim();
    if (title && title.length <= 70) {
      const heading = document.createElement("h3");
      heading.textContent = title;
      card.appendChild(heading);
      lead.remove();
      trimLeading(body);
    }
  }
  card.appendChild(body);
  return card;
}

function renderCards(editorId, cardsId) {
  const container = document.getElementById(cardsId);
  container.textContent = "";
  const entries = splitEntries(document.getElementById(editorId));
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "cards-empty";
    empty.textContent = "Nothing here yet. Choose Edit text to add some.";
    container.appendChild(empty);
    return;
  }
  entries.forEach((nodes) => container.appendChild(buildCard(nodes)));
}

function renderAllCards() {
  CARD_VIEWS.forEach(([editorId, cardsId]) => renderCards(editorId, cardsId));
}

function updateHeaderAndVitals() {
  const level = document.getElementById("level").value;
  const head = [level && `Level ${level}`, document.getElementById("race").value.trim(), document.getElementById("class").value.trim()]
    .filter(Boolean)
    .join(" ");
  const tail = [document.getElementById("background").value.trim(), document.getElementById("alignment").value.trim()].filter(Boolean);
  document.getElementById("summaryLine").textContent = [head, ...tail].filter(Boolean).join(", ");

  const current = Number(document.getElementById("currentHp").value) || 0;
  const max = Math.max(1, Number(document.getElementById("maxHp").value) || 1);
  const pct = Math.max(0, Math.min(100, Math.round((current / max) * 100)));
  document.getElementById("hpMeterFill").style.width = `${pct}%`;
  document.querySelector(".vitals").dataset.hp = pct <= 25 ? "low" : "ok";
  document.getElementById("deathStrip").hidden = current > 0;
}

// Undo an accidental Rage: turn it off and give the spent use back. If the use was not spent this session
// (Rage was already on when the sheet loaded), it just ends the Rage.
function undoRage() {
  const raging = document.getElementById("isRaging");
  if (!raging.checked) {
    return;
  }
  raging.checked = false;
  const leftEl = document.getElementById("rageUsesLeft");
  const max = rageUsesByLevel(document.getElementById("level").value);
  if (rageUseSpent) {
    leftEl.value = String(Math.min(max, (Number(leftEl.value) || 0) + 1));
    setStatus(`Rage undone. Your use is back (${leftEl.value} of ${max} left).`, "status-ok");
  } else {
    setStatus("Rage ended.", "status-ok");
  }
  rageUseSpent = false;
  updateDerived();
  scheduleSave();
}

function applyHpAdjustment(mode = "damage") {
  const amountInput = document.getElementById("hpAdjustAmount");
  const maxHpEl = document.getElementById("maxHp");
  const currentHpEl = document.getElementById("currentHp");
  const tempHpEl = document.getElementById("tempHp");

  const maxHp = Math.max(1, Number(maxHpEl.value) || 1);

  if (mode === "full") {
    tempHpEl.value = "0";
    currentHpEl.value = String(maxHp);
    clearDeathSaves();
    updateDerived();
    scheduleSave();
    setStatus("Reset to full HP.", "status-ok");
    amountInput.select();
    return;
  }

  const amount = Math.max(0, Number(amountInput.value) || 0);
  if (!amount) {
    setStatus("Enter an HP amount first.", "status-error");
    return;
  }

  const currentHp = Math.min(maxHp, Math.max(0, Number(currentHpEl.value) || 0));
  let message;

  if (mode === "heal") {
    currentHpEl.value = String(Math.min(maxHp, currentHp + amount));
    if (currentHp === 0) {
      clearDeathSaves();
    }
    message = `Healed ${amount} HP.`;
  } else {
    const tempHp = Math.max(0, Number(tempHpEl.value) || 0);
    const absorbed = Math.min(tempHp, amount);
    tempHpEl.value = String(tempHp - absorbed);
    currentHpEl.value = String(Math.max(0, currentHp - (amount - absorbed)));
    message = absorbed
      ? `Took ${amount} damage (${absorbed} absorbed by temp HP).`
      : `Took ${amount} damage.`;
  }

  updateDerived();
  scheduleSave();
  setStatus(message, "status-ok");
  amountInput.select();
}

function updateDerived({ skipClamp = false } = {}) {
  const level = Number(document.getElementById("level").value) || 1;
  const prof = profByLevel(level);
  document.getElementById("profBonus").value = prof;

  const maxHpEl = document.getElementById("maxHp");
  const currentHpEl = document.getElementById("currentHp");
  const maxHp = Math.max(1, Number(maxHpEl.value) || 1);

  // While Max HP or Level is being typed, clamping would shrink Current HP / rages left on every keystroke (7 -> 70).
  if (!skipClamp) {
    const currentHp = Math.min(maxHp, Math.max(0, Number(currentHpEl.value) || 0));
    currentHpEl.value = String(currentHp);
  }
  const shownHp = Math.min(maxHp, Math.max(0, Number(currentHpEl.value) || 0));
  document.getElementById("damageTaken").value = String(maxHp - shownHp);

  const isRaging = document.getElementById("isRaging").checked;
  const rageBonus = isRaging ? rageDamageByLevel(level) : 0;
  const hasPrimalKnowledge = isRaging && level >= 3;

  const fx = Items.effects();
  const abilityMods = {};
  ABILITIES.forEach((ab) => {
    const score = Number(document.getElementById(ab.key).value) || 10;
    const mod = getModifier(score);
    abilityMods[ab.key] = mod;
    document.getElementById(`${ab.key}Mod`).textContent = formatSigned(mod);
  });

  SAVES.forEach((s) => {
    const proficient = document.getElementById(`${s.key}Prof`).checked;
    const total = abilityMods[s.ability] + (proficient ? prof : 0);
    const advText = (isRaging && s.ability === "str") || (s.ability === "dex" && fx.saveAdvantage.dex.length) ? " (Adv)" : "";
    document.getElementById(`${s.key}Val`).textContent = `${formatSigned(total)}${advText}`;
  });

  SKILLS.forEach((s) => {
    const proficient = document.getElementById(`${s.key}Prof`).checked;
    const expertise = document.getElementById(`${s.key}Expert`).checked;
    const profMult = expertise ? 2 : proficient ? 1 : 0;
    const itemBonus = fx.skillBonus[s.key] || 0;
    const baseTotal = abilityMods[s.ability] + profMult * prof + itemBonus;

    if (hasPrimalKnowledge && PRIMAL_KNOWLEDGE_SKILLS.has(s.key) && s.ability !== "str") {
      const strTotal = abilityMods.str + profMult * prof + itemBonus;
      document.getElementById(`${s.key}Val`).textContent = `${formatSigned(baseTotal)} / STR ${formatSigned(strTotal)} (Adv)`;
      return;
    }

    const advText = isRaging && s.ability === "str" ? " (Adv)" : "";
    document.getElementById(`${s.key}Val`).textContent = `${formatSigned(baseTotal)}${advText}`;
  });

  const initiativeBonus = Number(document.getElementById("initiativeBonus").value) || 0;
  document.getElementById("initiative").value = String(abilityMods.dex + initiativeBonus);

  PASSIVE_SKILLS.forEach(({ skill, outputId }) => {
    const def = SKILLS.find((s) => s.key === skill);
    const proficient = document.getElementById(`${skill}Prof`).checked;
    const expertise = document.getElementById(`${skill}Expert`).checked;
    const profMult = expertise ? 2 : proficient ? 1 : 0;
    document.getElementById(outputId).textContent = String(10 + abilityMods[def.ability] + profMult * prof);
  });

  const rageMax = rageUsesByLevel(level);
  document.getElementById("rageUsesMax").textContent = String(rageMax);
  const rageLeftEl = document.getElementById("rageUsesLeft");
  if (!skipClamp && rageLeftEl.value !== "") {
    const clamped = Math.min(rageMax, Math.max(0, Math.floor(Number(rageLeftEl.value) || 0)));
    if (String(clamped) !== rageLeftEl.value) {
      rageLeftEl.value = String(clamped);
    }
  }

  document.getElementById("rageDamageBonus").textContent = formatSigned(rageBonus);
  document.getElementById("rageStrChecks").textContent = isRaging ? "Advantage" : "Normal";
  document.getElementById("rageStrSaves").textContent = isRaging ? "Advantage" : "Normal";
  document.getElementById("rageResist").textContent = isRaging
    ? "All damage except Radiant, Necrotic, Force, Psychic"
    : "Off";
  document.getElementById("rageSpellLock").textContent = isRaging
    ? "No Spellcasting / No Concentration"
    : "Normal";
  document.getElementById("rageDuration").textContent = isRaging
    ? "Until end of next turn; extend by attack/save/bonus action (10 min max)"
    : "Inactive";
  document.getElementById("rageEndCondition").textContent = isRaging
    ? "Rage ends if Heavy Armor donned or Incapacitated"
    : "Normal";
  document.getElementById("rageConditionClear").textContent = isRaging
    ? "Charmed/Frightened ends when Rage starts"
    : "No condition change";
  document.getElementById("ragePrimalKnowledge").textContent = hasPrimalKnowledge
    ? "On (Acrobatics, Intimidation, Perception, Stealth, Survival can use STR)"
    : "Inactive";
  const rageEffectsEl = document.getElementById("rageEffects");
  rageEffectsEl.classList.toggle("active", isRaging);
  // Open on rage start and close on rage end, but leave a manual toggle alone between changes.
  if (rageEffectsEl.dataset.raging !== String(isRaging)) {
    rageEffectsEl.dataset.raging = String(isRaging);
    rageEffectsEl.open = isRaging;
  }

  updateItemVitals(fx);
  updateXpReadout();
  updateHeaderAndVitals();
  document.getElementById("undoRageBtn").hidden = !(isRaging && rageUseSpent);
  Battle.refresh();
}

// Shows AC and Speed as they are with items on (Haste, the Colossus Greatsword's burden) next to the numbers you typed.
function updateItemVitals(fx) {
  const ac = Number(document.getElementById("ac").value) || 0;
  const speed = Number(document.getElementById("speed").value) || 0;
  const acNow = ac + fx.acBonus;
  const speedNow = Math.max(0, speed - fx.speedPenalty) * fx.speedMultiplier;
  const show = (id, changedValue, text) => {
    const node = document.getElementById(id);
    node.hidden = !changedValue;
    node.textContent = changedValue ? text : "";
  };
  show("acEffective", acNow !== ac, `${acNow} with items`);
  show("speedEffective", speedNow !== speed, `${speedNow} ft with items`);
}

// ---- Levelling up from experience points ----

// Total XP needed to reach each level (index = level). Same table as the Character Advancement table.
const XP_FOR_LEVEL = [0, 0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];
let levelUpState = null;

function levelForXp(xp) {
  let level = 1;
  for (let l = 2; l <= 20; l += 1) {
    if (xp >= XP_FOR_LEVEL[l]) {
      level = l;
    }
  }
  return level;
}

function sanitizeLevelUp(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const from = Math.floor(Number(raw.from));
  const to = Math.floor(Number(raw.to));
  if (!(from >= 1 && to > from && to <= 20)) {
    return null;
  }
  return { from, to, hpAdded: Math.max(0, Math.floor(Number(raw.hpAdded) || 0)), hpDone: Boolean(raw.hpDone) };
}

function updateXpReadout() {
  const level = Number(document.getElementById("level").value) || 1;
  const note = document.getElementById("xpNext");
  note.textContent = level >= 20 ? "Max level" : `Level ${level + 1} at ${XP_FOR_LEVEL[level + 1].toLocaleString("en-US")} XP`;
}

// Called when the XP box is changed. Raises the level when the XP is enough, never lowers it.
function checkLevelUp() {
  const xp = Math.max(0, Number(document.getElementById("xp").value) || 0);
  const levelEl = document.getElementById("level");
  const current = Number(levelEl.value) || 1;
  const target = levelForXp(xp);
  if (target <= current) {
    return;
  }
  levelEl.value = String(target);
  // Keep one banner going across several level-ups, unless the hit points for the earlier ones are already done.
  const carry = levelUpState && !levelUpState.hpDone ? levelUpState : null;
  levelUpState = { from: carry ? carry.from : current, to: target, hpAdded: 0, hpDone: false };
  const hitDice = document.getElementById("hitDice");
  const match = /^\s*(\d+)d(\d+)\s*$/i.exec(hitDice.value);
  if (match) {
    hitDice.value = `${target}d${match[2]}`;
  }
  updateDerived();
  scheduleSave();
  renderLevelUp();
  setStatus(`Level up! You are now level ${target}.`, "status-ok");
}

function mk(tag, props = {}, ...children) {
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

function buildLevelUpBanner(info) {
  const box = document.getElementById("levelUpBanner");
  box.textContent = "";
  const state = levelUpState;
  if (!state) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  const { from, to } = state;
  const count = to - from;
  const className = document.getElementById("class").value.trim();
  const barbarian = /barbarian/i.test(className);
  const done = [`proficiency bonus +${profByLevel(to)}`, "hit dice"];
  if (barbarian) {
    done.push(`${rageUsesByLevel(to)} rages per long rest`, `Rage damage +${rageDamageByLevel(to)}`);
  }

  box.append(
    mk("div", { class: "levelup-head" }, mk("h2", { text: count > 1 ? `Level up! Level ${from} to ${to}` : `Level up! You are now level ${to}` }), mk("button", { type: "button", class: "chip-btn", "data-lu": "dismiss", text: "Dismiss" })),
    mk("p", { class: "muted", text: `Already updated for you: ${done.join(", ")}.` })
  );

  const todo = mk("ul", { class: "levelup-list" });
  for (let l = from + 1; l <= to; l += 1) {
    const row = info && info.levels[l];
    if (row) {
      todo.append(mk("li", {}, mk("strong", { text: `Level ${l}: ` }), row.features.join(", ") || "no new class features", row.extras ? mk("span", { class: "muted", text: ` (${row.extras})` }) : null));
    } else {
      todo.append(mk("li", {}, mk("strong", { text: `Level ${l}: ` }), "look up your class features table."));
    }
  }
  box.append(mk("h3", { text: "What is new" }), todo);

  const hitDie = info && info.hitDie ? info.hitDie : null;
  const conMod = getModifier(document.getElementById("con").value);
  if (hitDie) {
    const average = Math.floor(hitDie / 2) + 1 + conMod;
    const total = Math.max(count, average * count);
    box.append(mk("h3", { text: "Hit points" }));
    if (state.hpDone) {
      box.append(mk("p", { class: "muted", text: `Added ${state.hpAdded} HP. Your maximum is now ${document.getElementById("maxHp").value}.` }));
    } else {
      box.append(
        mk("p", { class: "muted", text: `Roll 1d${hitDie} + ${conMod >= 0 ? "" : "-"}${Math.abs(conMod)} (Constitution) for each new level, or take the average of ${average}.${count > 1 ? ` That is ${total} for ${count} levels.` : ""}` }),
        mk(
          "div",
          { class: "levelup-hp" },
          mk("label", { class: "field" }, mk("span", { text: count > 1 ? `HP gained (all ${count} levels)` : "HP gained" }), mk("input", { type: "number", min: "0", id: "levelUpHp", inputmode: "numeric" })),
          mk("button", { type: "button", class: "chip-btn", "data-lu": "average", "data-value": String(total), text: `Use the average (${total})` }),
          mk("button", { type: "button", class: "chip-btn primary", "data-lu": "addhp", text: "Add to my HP" })
        )
      );
    }
  }

  const reminders = [];
  if (info && Object.keys(info.levels).some((l) => l > from && l <= to && info.levels[l].features.some((f) => /ability score improvement/i.test(f)))) {
    reminders.push("Choose an Ability Score Improvement (or a feat). Change your scores in the Abilities box, and the sheet updates the rest.");
  }
  if (info && Object.keys(info.levels).some((l) => l > from && l <= to && info.levels[l].features.some((f) => /subclass/i.test(f)))) {
    reminders.push("You gain a subclass feature. Add it to Features and Traits (put the text in Rules, My library if you want to search it).");
  }
  reminders.push("Add the new features above to Features and Traits.");
  box.append(mk("h3", { text: "Still up to you" }), mk("ul", { class: "levelup-list" }, reminders.map((text) => mk("li", { text }))));
  box.append(mk("div", { class: "levelup-actions" }, mk("button", { type: "button", class: "chip-btn", "data-lu": "rules", text: className ? `Open ${className} in Rules` : "Open Rules" })));
}

async function renderLevelUp() {
  const token = levelUpState;
  buildLevelUpBanner(null);
  if (!token) {
    return;
  }
  let info = null;
  try {
    info = await Rules.classLevels(document.getElementById("class").value);
  } catch {
    info = null;
  }
  if (token === levelUpState && info) {
    buildLevelUpBanner(info);
  }
}

function bindLevelUp() {
  document.getElementById("levelUpBanner").addEventListener("click", (event) => {
    const button = event.target.closest("[data-lu]");
    if (!button || !levelUpState) {
      return;
    }
    const action = button.dataset.lu;
    if (action === "dismiss") {
      levelUpState = null;
      renderLevelUp();
      scheduleSave();
    } else if (action === "average") {
      document.getElementById("levelUpHp").value = button.dataset.value;
    } else if (action === "addhp") {
      const gained = Math.max(0, Math.floor(Number(document.getElementById("levelUpHp").value) || 0));
      if (!gained) {
        setStatus("Type how many hit points you gained first.", "status-error");
        return;
      }
      const maxEl = document.getElementById("maxHp");
      const curEl = document.getElementById("currentHp");
      maxEl.value = String((Number(maxEl.value) || 0) + gained);
      curEl.value = String((Number(curEl.value) || 0) + gained);
      levelUpState = { ...levelUpState, hpAdded: gained, hpDone: true };
      updateDerived();
      scheduleSave();
      buildLevelUpBanner(null);
      renderLevelUp();
      setStatus(`Added ${gained} HP to your maximum and current hit points.`, "status-ok");
    } else if (action === "rules") {
      Rules.open(document.getElementById("class").value.trim());
    }
  });
}

function setStatus(message, type = "") {
  const el = document.getElementById("status");
  el.textContent = message;
  el.classList.remove("status-ok", "status-error");
  if (type) {
    el.classList.add(type);
  }
}

function setSaveState(text) {
  document.getElementById("saveState").textContent = text;
}

// Autosave reports only in the save indicator so it never overwrites the last action message.
function saveToLocal(auto = false) {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getData()));
    const time = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setSaveState(`Saved ${time}`);
    if (!auto) {
      setStatus("Saved to browser storage.", "status-ok");
    }
  } catch {
    setSaveState("Not saved");
    setStatus("Could not save: browser storage is blocked or full. Use Export JSON.", "status-error");
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  setSaveState("Unsaved changes...");
  saveTimer = setTimeout(() => saveToLocal(true), 600);
}

function loadFromLocal() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    setStatus("Browser storage is blocked; changes will not persist. Use Export JSON.", "status-error");
  }
  if (!raw) {
    document.getElementById("rageUsesLeft").value = String(rageUsesByLevel(document.getElementById("level").value));
    updateDerived();
    return;
  }

  try {
    setData(JSON.parse(raw));
    setStatus("Loaded saved character.", "status-ok");
  } catch {
    setStatus("Saved data is invalid JSON.", "status-error");
  }
}

function exportJson() {
  const blob = new Blob([JSON.stringify(getData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "character-sheet.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus("Exported character-sheet.json", "status-ok");
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("not a character object");
      }
      setData(parsed);
      saveToLocal();
      setStatus("Imported character JSON.", "status-ok");
    } catch {
      setStatus("Could not parse imported JSON.", "status-error");
    }
  };
  reader.readAsText(file);
}

function resetForm() {
  if (!confirm("Reset all fields? This cannot be undone.")) {
    return;
  }

  document.querySelectorAll("input").forEach((el) => {
    // Notes (and other tabs that store their own data) are not part of the character sheet.
    if (el.type === "radio" || el.type === "file" || el.closest("[data-isolated]")) {
      return;
    }
    if (el.type === "checkbox") {
      el.checked = false;
    } else if (el.id === "level") {
      el.value = 1;
    } else if (el.id === "xp") {
      el.value = 0;
    } else if (el.id === "ac") {
      el.value = 10;
    } else if (el.id === "speed") {
      el.value = 30;
    } else if (el.id === "maxHp" || el.id === "currentHp") {
      el.value = 10;
    } else if (el.id === "tempHp" || el.id === "initiative" || el.id === "initiativeBonus" || CURRENCY_IDS.includes(el.id)) {
      el.value = 0;
    } else if (el.id === "rageUsesLeft") {
      el.value = rageUsesByLevel(1);
    } else if (ABILITIES.some((a) => a.key === el.id)) {
      el.value = 10;
    } else if (el.id !== "profBonus") {
      el.value = "";
    }
  });

  richTextFields.forEach((id) => {
    document.getElementById(id).innerHTML = "";
  });


  buildAttacksTable();
  Battle.reset();
  Items.reset();
  levelUpState = null;
  renderLevelUp();
  rageUseSpent = false;
  clearTimeout(saveTimer);
  saveTimer = null;
  setSaveState("");
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage unavailable; nothing to clear
  }
  renderAllCards();
  updateDerived();
  setStatus("Sheet reset.");
}

function bindEvents() {
  document.body.addEventListener("input", (event) => {
    const target = event.target;
    if (!target.matches("input, [contenteditable=\"true\"]") || target.closest("[data-isolated]")) {
      return;
    }
    updateDerived({ skipClamp: target.id === "maxHp" || target.id === "level" });
    if (target.id !== "hpAdjustAmount" && target.name !== "hpAdjustMode" && !target.closest("[data-nosave]")) {
      scheduleSave();
    }
  });

  document.body.addEventListener("change", (event) => {
    if (event.target.id === "xp") {
      checkLevelUp();
    }
    if (event.target.id === "maxHp" || event.target.id === "level") {
      updateDerived();
      scheduleSave();
    }
    if (event.target.id === "isRaging" && event.target.checked) {
      const leftEl = document.getElementById("rageUsesLeft");
      const left = Number(leftEl.value) || 0;
      if (left > 0) {
        leftEl.value = String(left - 1);
        rageUseSpent = true;
        setStatus(`Rage started. ${left - 1} left.`, "status-ok");
      } else {
        rageUseSpent = false;
        setStatus("No rages left in the counter. Edit it if that's wrong.", "status-error");
      }
      updateDerived();
      scheduleSave();
    }
    if (event.target.id === "isRaging" && !event.target.checked) {
      rageUseSpent = false;
      updateDerived();
    }
  });

  document.getElementById("undoRageBtn").addEventListener("click", undoRage);

  document.getElementById("clearDeathSavesBtn").addEventListener("click", () => {
    clearDeathSaves();
    scheduleSave();
  });

  document.getElementById("rageShortRestBtn").addEventListener("click", () => {
    const leftEl = document.getElementById("rageUsesLeft");
    leftEl.value = String((Number(leftEl.value) || 0) + 1);
    rageUseSpent = false;
    updateDerived();
    scheduleSave();
    Items.shortRest();
    setStatus("Short rest: regained one rage and reset short-rest counters.", "status-ok");
  });

  document.getElementById("rageLongRestBtn").addEventListener("click", () => {
    const level = document.getElementById("level").value;
    document.getElementById("rageUsesLeft").value = String(rageUsesByLevel(level));
    rageUseSpent = false;
    updateDerived();
    scheduleSave();
    Items.longRest();
    updateDerived();
    setStatus("Long rest: all rages and item charges regained, and Haste ended.", "status-ok");
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && saveTimer !== null) {
      saveToLocal(true);
    }
  });

  document.body.addEventListener("mousedown", (event) => {
    if (event.target.closest(".rich-btn")) {
      event.preventDefault();
    }
  });

  document.querySelectorAll(".rich-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      const cmd = btn.dataset.cmd;
      const editor = document.getElementById(target);
      if (!editor || !cmd) {
        return;
      }
      executeRichCommand(editor, cmd, null);
      updateDerived();
      scheduleSave();
    });
  });

  document.querySelectorAll(".rich-input").forEach((editor) => {
    editor.addEventListener("paste", (event) => {
      const clipboard = event.clipboardData;
      if (!clipboard) {
        return;
      }
      event.preventDefault();
      const html = clipboard.getData("text/html");
      const clean = html ? sanitizeHtml(html) : plainTextToHtml(clipboard.getData("text/plain"));
      document.execCommand("insertHTML", false, clean);
    });

    editor.addEventListener("keydown", (event) => {
      if (!(event.ctrlKey || event.metaKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (["b", "i", "u"].includes(key)) {
        event.preventDefault();
        const map = { b: "bold", i: "italic", u: "underline" };
        executeRichCommand(editor, map[key], null);
      }
    });
  });

  document.getElementById("hpDamageBtn").addEventListener("click", () => applyHpAdjustment("damage"));
  document.getElementById("hpHealBtn").addEventListener("click", () => applyHpAdjustment("heal"));
  document.getElementById("hpFullBtn").addEventListener("click", () => applyHpAdjustment("full"));

  document.getElementById("hpAdjustAmount").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyHpAdjustment(event.shiftKey ? "heal" : "damage");
    }
  });

  document.getElementById("topShortRest").addEventListener("click", () => document.getElementById("rageShortRestBtn").click());
  document.getElementById("topLongRest").addEventListener("click", () => document.getElementById("rageLongRestBtn").click());

  document.getElementById("addAttackBtn").addEventListener("click", () => {
    addAttackRow();
    document.getElementById("attacksTable").classList.add("show-blank");
    const rows = document.querySelectorAll(".attack-row[data-attack-row]");
    rows[rows.length - 1].querySelector(".attack-name").focus();
    scheduleSave();
  });

  document.querySelectorAll(".edit-toggle").forEach((button) => {
    button.addEventListener("click", () => {
      const fold = button.closest(".cardview");
      const editing = !fold.classList.contains("editing");
      fold.classList.toggle("editing", editing);
      button.setAttribute("aria-pressed", String(editing));
      button.textContent = editing ? "Done" : "Edit text";
      if (editing) {
        document.getElementById(button.dataset.editor).focus();
      } else {
        renderAllCards();
      }
    });
  });

  // Popovers close on Escape or a click elsewhere.
  const popovers = [document.querySelector(".hp-tools"), document.querySelector(".file-menu")];
  document.addEventListener("click", (event) => {
    popovers.forEach((details) => {
      if (details.open && !details.contains(event.target)) {
        details.open = false;
      }
    });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      popovers.forEach((details) => {
        details.open = false;
      });
    }
  });

  document.getElementById("saveBtn").addEventListener("click", () => saveToLocal());
  document.getElementById("exportBtn").addEventListener("click", exportJson);
  document.getElementById("resetBtn").addEventListener("click", resetForm);

  document.getElementById("importFile").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) {
      importJson(file);
      event.target.value = "";
    }
  });
}

function init() {
  buildAbilityCards();
  buildChecklist("savingThrows", SAVES, false);
  buildChecklist("skills", SKILLS, true);
  buildAttacksTable();
  bindLevelUp();
  Items.init();
  Battle.init();
  Notes.init();
  Maps.init();
  Rules.init();
  bindEvents();
  loadFromLocal();
  renderAllCards();
  updateDerived();
  Tabs.start();

  // Reference folds start closed on phones so the page is not a wall of text.
  if (window.matchMedia("(max-width: 759px)").matches) {
    document.querySelectorAll(".fold").forEach((fold) => {
      fold.open = false;
    });
  }
}

init();
