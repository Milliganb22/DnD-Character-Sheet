const STORAGE_KEY = "dnd-sheet-v1";
const DEFAULT_ATTACK_ROWS = 5;
const DEFAULT_TRAITS_HEIGHT = 340;
const DEFAULT_INVENTORY_HEIGHT = 240;
const PRIMAL_KNOWLEDGE_SKILLS = new Set([
  "acrobatics",
  "intimidation",
  "perception",
  "stealth",
  "survival"
]);

let isTraitsSizeLocked = false;
let isInventorySizeLocked = false;
let lastTempHpValue = null;

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
  "tempHp"
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

function plainTextToHtml(value) {
  const temp = document.createElement("div");
  temp.textContent = value;
  return temp.innerHTML.replace(/\n/g, "<br>");
}

function setTraitsLockState(locked) {
  isTraitsSizeLocked = Boolean(locked);
  const traits = document.getElementById("traits");
  const btn = document.getElementById("traitsSizeLockBtn");
  traits.style.resize = isTraitsSizeLocked ? "none" : "vertical";
  btn.textContent = isTraitsSizeLocked ? "Unlock Size" : "Lock Size";
  btn.classList.toggle("locked", isTraitsSizeLocked);
}

function setInventoryLockState(locked) {
  isInventorySizeLocked = Boolean(locked);
  const inventory = document.getElementById("inventory");
  const btn = document.getElementById("inventorySizeLockBtn");
  inventory.style.resize = isInventorySizeLocked ? "none" : "vertical";
  btn.textContent = isInventorySizeLocked ? "Unlock Size" : "Lock Size";
  btn.classList.toggle("locked", isInventorySizeLocked);
}

function applyUiSettings(ui = {}) {
  const traits = document.getElementById("traits");
  const inventory = document.getElementById("inventory");

  const savedTraitsHeight = Number(ui.traitsHeight) || DEFAULT_TRAITS_HEIGHT;
  const savedInventoryHeight = Number(ui.inventoryHeight) || DEFAULT_INVENTORY_HEIGHT;

  traits.style.height = `${Math.max(DEFAULT_TRAITS_HEIGHT, savedTraitsHeight)}px`;
  inventory.style.height = `${Math.max(DEFAULT_INVENTORY_HEIGHT, savedInventoryHeight)}px`;

  setTraitsLockState(Boolean(ui.traitsSizeLocked));
  setInventoryLockState(Boolean(ui.inventorySizeLocked));
}

function collectUiSettings() {
  const traits = document.getElementById("traits");
  const inventory = document.getElementById("inventory");

  const currentTraitsHeight = Math.round(traits.getBoundingClientRect().height);
  const currentInventoryHeight = Math.round(inventory.getBoundingClientRect().height);

  return {
    traitsHeight: Math.max(DEFAULT_TRAITS_HEIGHT, currentTraitsHeight),
    inventoryHeight: Math.max(DEFAULT_INVENTORY_HEIGHT, currentInventoryHeight),
    traitsSizeLocked: isTraitsSizeLocked,
    inventorySizeLocked: isInventorySizeLocked
  };
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
    <input class="attack-name" type="text" placeholder="Attack" value="${values.name || ""}" />
    <input class="attack-bonus" type="text" placeholder="e.g. +6" value="${values.bonus || ""}" />
    <input class="attack-type" type="text" placeholder="Melee/Ranged/Spell" value="${values.type || ""}" />
  `;
  rows.appendChild(row);
}

function buildAttacksTable(existingRows = []) {
  const container = document.getElementById("attacksTable");
  container.innerHTML = `
    <div class="attack-row attack-header">
      <span>Name of Object</span><span>Attack Bonus</span><span>Attack Type</span>
    </div>
    <div id="attacksRows"></div>
  `;

  if (existingRows.length > 0) {
    existingRows.forEach((row) => addAttackRow(row));
    return;
  }

  for (let i = 0; i < DEFAULT_ATTACK_ROWS; i += 1) {
    addAttackRow();
  }
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

  richTextFields.forEach((id) => {
    data[id] = document.getElementById(id).innerHTML;
  });

  data.attacks = collectAttackRows();
  data.ui = collectUiSettings();
  return data;
}

function setData(data) {
  if (!data || typeof data !== "object") {
    applyUiSettings();
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

  richTextFields.forEach((id) => {
    if (id in data && typeof data[id] === "string") {
      const value = data[id];
      if (value.includes("<") && value.includes(">")) {
        document.getElementById(id).innerHTML = value;
      } else {
        document.getElementById(id).innerHTML = plainTextToHtml(value);
      }
    }
  });

  const attackRows = Array.isArray(data.attacks) ? data.attacks : parseLegacyAttacks(data);
  buildAttacksTable(attackRows);

  applyUiSettings(data.ui);
  updateDerived();
}

function applyHpAdjustment() {
  const amountInput = document.getElementById("hpAdjustAmount");
  const mode = document.querySelector('input[name="hpAdjustMode"]:checked')?.value || "damage";
  const maxHpEl = document.getElementById("maxHp");
  const currentHpEl = document.getElementById("currentHp");
  const tempHpEl = document.getElementById("tempHp");

  const maxHp = Math.max(1, Number(maxHpEl.value) || 1);

  if (mode === "full") {
    tempHpEl.value = "0";
    currentHpEl.value = String(maxHp);
    lastTempHpValue = null;
    updateDerived();
    setStatus("Reset to full HP.", "status-ok");
    amountInput.select();
    return;
  }

  const amount = Math.max(0, Number(amountInput.value) || 0);
  if (!amount) {
    setStatus("Enter an HP amount first.", "status-error");
    return;
  }

  const tempHp = Math.max(0, Number(tempHpEl.value) || 0);
  const effectiveMaxHp = maxHp + tempHp;
  const currentHp = Math.max(0, Number(currentHpEl.value) || 0);
  const nextHp = mode === "heal"
    ? Math.min(effectiveMaxHp, currentHp + amount)
    : Math.max(0, currentHp - amount);

  currentHpEl.value = String(nextHp);
  updateDerived();

  setStatus(
    mode === "heal" ? `Healed ${amount} HP.` : `Took ${amount} damage.`,
    "status-ok"
  );

  amountInput.select();
}

function updateDerived() {
  const level = Number(document.getElementById("level").value) || 1;
  const prof = profByLevel(level);
  document.getElementById("profBonus").value = prof;

  const maxHpEl = document.getElementById("maxHp");
  const currentHpEl = document.getElementById("currentHp");
  const tempHpEl = document.getElementById("tempHp");
  const maxHp = Math.max(1, Number(maxHpEl.value) || 1);
  const tempHp = Math.max(0, Number(tempHpEl.value) || 0);

  let currentHp = Number(currentHpEl.value);
  if (!Number.isFinite(currentHp)) {
    currentHp = maxHp + tempHp;
  }

  if (lastTempHpValue === null) {
    lastTempHpValue = tempHp;
  } else if (tempHp !== lastTempHpValue) {
    currentHp += tempHp - lastTempHpValue;
    lastTempHpValue = tempHp;
  }

  const effectiveMaxHp = maxHp + tempHp;
  currentHp = Math.min(effectiveMaxHp, Math.max(0, currentHp));
  currentHpEl.value = String(currentHp);
  document.getElementById("damageTaken").value = String(Math.max(0, effectiveMaxHp - currentHp));

  const isRaging = document.getElementById("isRaging").checked;
  const rageBonus = isRaging ? rageDamageByLevel(level) : 0;
  const hasPrimalKnowledge = isRaging && level >= 3;

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
    const advText = isRaging && s.ability === "str" ? " (Adv)" : "";
    document.getElementById(`${s.key}Val`).textContent = `${formatSigned(total)}${advText}`;
  });

  SKILLS.forEach((s) => {
    const proficient = document.getElementById(`${s.key}Prof`).checked;
    const expertise = document.getElementById(`${s.key}Expert`).checked;
    const profMult = expertise ? 2 : proficient ? 1 : 0;
    const baseTotal = abilityMods[s.ability] + profMult * prof;

    if (hasPrimalKnowledge && PRIMAL_KNOWLEDGE_SKILLS.has(s.key) && s.ability !== "str") {
      const strTotal = abilityMods.str + profMult * prof;
      document.getElementById(`${s.key}Val`).textContent = `${formatSigned(baseTotal)} / STR ${formatSigned(strTotal)} (Adv)`;
      return;
    }

    const advText = isRaging && s.ability === "str" ? " (Adv)" : "";
    document.getElementById(`${s.key}Val`).textContent = `${formatSigned(baseTotal)}${advText}`;
  });

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
  document.getElementById("rageEffects").classList.toggle("active", isRaging);
}

function setStatus(message, type = "") {
  const el = document.getElementById("status");
  el.textContent = message;
  el.classList.remove("status-ok", "status-error");
  if (type) {
    el.classList.add(type);
  }
}

function saveToLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getData()));
  setStatus("Saved to browser storage.", "status-ok");
}

function loadFromLocal() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    lastTempHpValue = null;
    applyUiSettings();
    updateDerived();
    return;
  }

  try {
    lastTempHpValue = null;
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
      lastTempHpValue = null;
      setData(JSON.parse(String(reader.result)));
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
    } else if (el.id === "tempHp" || el.id === "initiative") {
      el.value = 0;
    } else if (ABILITIES.some((a) => a.key === el.id)) {
      el.value = 10;
    } else if (el.id !== "profBonus") {
      el.value = "";
    }
  });

  richTextFields.forEach((id) => {
    document.getElementById(id).innerHTML = "";
  });

  document.querySelector('input[name="hpAdjustMode"][value="damage"]').checked = true;

  buildAttacksTable();
  lastTempHpValue = null;
  localStorage.removeItem(STORAGE_KEY);
  applyUiSettings();
  updateDerived();
  setStatus("Sheet reset.");
}

function bindEvents() {
  document.body.addEventListener("input", (event) => {
    if (event.target.matches("input, [contenteditable=\"true\"]")) {
      updateDerived();
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
    });
  });

  document.querySelectorAll(".rich-input").forEach((editor) => {
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

  document.getElementById("traitsSizeLockBtn").addEventListener("click", () => {
    setTraitsLockState(!isTraitsSizeLocked);
  });

  document.getElementById("inventorySizeLockBtn").addEventListener("click", () => {
    setInventoryLockState(!isInventorySizeLocked);
  });

  document.getElementById("applyHpAdjustBtn").addEventListener("click", applyHpAdjustment);

  document.getElementById("hpAdjustAmount").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyHpAdjustment();
    }
  });

  document.getElementById("addAttackBtn").addEventListener("click", () => {
    addAttackRow();
  });

  document.getElementById("saveBtn").addEventListener("click", saveToLocal);
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
  bindEvents();
  loadFromLocal();
  updateDerived();
}

init();
