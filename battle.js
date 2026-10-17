"use strict";

// Battle tab: you enter the d20 and the damage dice you rolled; this adds every modifier and tells you
// what happens (hit or miss, critical, damage by type, mastery effect). Loaded before app.js.

const MASTERY = {
  cleave: {
    label: "Cleave",
    onHit:
      "Cleave: make a melee attack against a second creature within 5 feet of the first that is also within your reach. On a hit it takes the weapon's damage, but do not add your ability modifier. Once per turn."
  },
  graze: {
    label: "Graze",
    onMiss: "Graze: the creature still takes damage equal to your ability modifier, of the weapon's damage type."
  },
  nick: {
    label: "Nick",
    note: "Nick: the extra attack from the Light property can be part of the Attack action instead of a Bonus Action. Once per turn."
  },
  push: {
    label: "Push",
    onHit: "Push: push the creature up to 10 feet straight away from you if it is Large or smaller."
  },
  sap: {
    label: "Sap",
    onHit: "Sap: the creature has Disadvantage on its next attack roll before the start of your next turn."
  },
  slow: {
    label: "Slow",
    onHit: "Slow: if you dealt damage, reduce its Speed by 10 feet until the start of your next turn (does not stack)."
  },
  topple: {
    label: "Topple",
    onHit: "Topple: the creature makes a Constitution save or falls Prone."
  },
  vex: {
    label: "Vex",
    onHit: "Vex: if you dealt damage, you have Advantage on your next attack roll against it before the end of your next turn."
  }
};
const MASTERY_ORDER = ["cleave", "graze", "nick", "push", "sap", "slow", "topple", "vex"];
const DAMAGE_TYPES = [
  "slashing", "piercing", "bludgeoning", "fire", "cold", "lightning", "acid", "poison",
  "necrotic", "radiant", "psychic", "thunder", "force"
];

function parseDice(text) {
  const match = /^\s*(\d{1,2})\s*d\s*(\d{1,3})\s*$/i.exec(String(text ?? ""));
  return match ? { count: Number(match[1]), sides: Number(match[2]) } : null;
}

function diceText(text, multiplier = 1) {
  const dice = parseDice(text);
  return dice ? `${dice.count * multiplier}d${dice.sides}` : "";
}

function toWholeNumber(value, min, max) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    return null;
  }
  return n;
}

function sumValues(parts) {
  return parts.reduce((total, part) => total + part.value, 0);
}

function signed(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

// Advantage and Disadvantage from any number of sources cancel each other out: one of each gives a normal roll.
function resolveD20(advantageFrom, disadvantageFrom, rolls) {
  let state = "normal";
  if (advantageFrom.length && !disadvantageFrom.length) {
    state = "adv";
  } else if (disadvantageFrom.length && !advantageFrom.length) {
    state = "dis";
  }
  const first = toWholeNumber(rolls.d20a, 1, 20);
  const second = toWholeNumber(rolls.d20b, 1, 20);
  let natural = null;
  let needSecond = false;
  if (state === "normal") {
    natural = first;
  } else if (first !== null && second !== null) {
    natural = state === "adv" ? Math.max(first, second) : Math.min(first, second);
  } else {
    needSecond = true;
  }
  return { state, first, second, natural, needSecond };
}

function rollFlagText(result) {
  const adv = result.advantageFrom;
  const dis = result.disadvantageFrom;
  if (!adv.length && !dis.length) {
    return "";
  }
  if (adv.length && dis.length) {
    return `Advantage (${adv.join(", ")}) and Disadvantage (${dis.join(", ")}) cancel out. Roll one d20 normally.`;
  }
  return `${adv.length ? "Advantage" : "Disadvantage"} from ${(adv.length ? adv : dis).join(", ")}. Roll two d20 and enter both.`;
}

// Pure attack math. weapon: see sanitizeWeapon. rolls: {d20a, d20b, ac, dice, extra}. ctx: {mods, prof, raging,
// rageDamage, reckless, rollMode, gwm}. Returns everything the UI needs; touches no DOM.
function computeAttack(weapon, rolls, ctx) {
  const abilityKey = weapon.ability === "dex" ? "dex" : "str";
  const abilityMod = ctx.mods[abilityKey];
  const magic = Number(weapon.magic) || 0;

  const attackParts = [
    { label: abilityKey.toUpperCase(), value: abilityMod },
    { label: "Proficiency", value: ctx.prof }
  ];
  if (magic) {
    attackParts.push({ label: "Magic", value: magic });
  }
  const attackBonus = sumValues(attackParts);

  const advantageFrom = [];
  const disadvantageFrom = [];
  if (ctx.reckless && abilityKey === "str") {
    advantageFrom.push("Reckless Attack");
  }
  if (ctx.rollMode === "adv") {
    advantageFrom.push("other effect");
  }
  if (ctx.rollMode === "dis") {
    disadvantageFrom.push("other effect");
  }
  const { state, first, second, natural, needSecond } = resolveD20(advantageFrom, disadvantageFrom, rolls);

  const total = natural === null ? null : natural + attackBonus;
  const crit = natural === 20;
  const fumble = natural === 1;
  const ac = toWholeNumber(rolls.ac, 0, 99);
  let hit = null;
  if (natural !== null && ac !== null) {
    hit = crit || (!fumble && total >= ac);
  }

  const flat = [{ label: abilityKey.toUpperCase(), value: abilityMod, type: weapon.type }];
  if (magic) {
    flat.push({ label: "Magic", value: magic, type: weapon.type });
  }
  if (ctx.raging && abilityKey === "str") {
    flat.push({ label: "Rage", value: ctx.rageDamage, type: weapon.type });
  }
  if (ctx.gwm && weapon.heavy) {
    flat.push({ label: "Heavy Weapon Mastery", value: ctx.prof, type: weapon.type });
  }

  const multiplier = crit ? 2 : 1;
  const useVersatile = Boolean(ctx.twoHanded && weapon.versatile);
  const mainInstruction = diceText(useVersatile ? weapon.versatile : weapon.dice, multiplier);
  const extraInstruction = weapon.extraDice ? diceText(weapon.extraDice, multiplier) : "";
  const mainRolled = toWholeNumber(rolls.dice, 0, 999);
  const extraRolled = toWholeNumber(rolls.extra, 0, 999);
  const needsExtra = Boolean(extraInstruction);

  const parts = [];
  let damageTotal = null;
  const byType = {};
  if (mainRolled !== null && (!needsExtra || extraRolled !== null)) {
    parts.push({ label: `${mainInstruction || "Dice"}`, value: mainRolled, type: weapon.type });
    if (needsExtra) {
      parts.push({ label: extraInstruction, value: extraRolled, type: weapon.extraType || weapon.type });
    }
    flat.forEach((piece) => parts.push(piece));
    damageTotal = Math.max(0, sumValues(parts));
    parts.forEach((part) => {
      const type = part.type || "untyped";
      byType[type] = (byType[type] || 0) + part.value;
    });
    Object.keys(byType).forEach((type) => {
      byType[type] = Math.max(0, byType[type]);
    });
  }

  const mastery = weapon.mastery && MASTERY[weapon.mastery] ? weapon.mastery : "";
  const masteryInfo = mastery
    ? {
        key: mastery,
        label: MASTERY[mastery].label,
        onHit: MASTERY[mastery].onHit || "",
        onMiss: MASTERY[mastery].onMiss || "",
        note: MASTERY[mastery].note || "",
        grazeDamage: mastery === "graze" ? Math.max(0, abilityMod) : null,
        toppleDc: mastery === "topple" ? 8 + abilityMod + ctx.prof : null
      }
    : null;

  return {
    abilityKey,
    abilityMod,
    attackParts,
    attackBonus,
    state,
    advantageFrom,
    disadvantageFrom,
    first,
    second,
    natural,
    needSecond,
    total,
    crit,
    fumble,
    ac,
    hit,
    flat,
    flatTotal: sumValues(flat),
    mainInstruction,
    twoHanded: useVersatile,
    extraInstruction,
    needsExtra,
    parts,
    damageTotal,
    byType,
    mastery: masteryInfo,
    heavyBonusApplied: Boolean(ctx.gwm && weapon.heavy),
    gwmFollowUp: Boolean(ctx.gwm && crit && !weapon.ranged)
  };
}

const PRIMAL_SKILLS = new Set(["acrobatics", "intimidation", "perception", "stealth", "survival"]);

// Pure ability check / saving throw math. spec: {kind: "save"|"check"|"skill", ability, skill, proficient, expert,
// usePrimal}. ctx: {mods, prof, raging, level, dangerSense, rollMode}. Rage gives Advantage on Strength checks and
// Strength saves (not attack rolls); Danger Sense on Dexterity saves; anything else cancels per resolveD20.
function computeCheck(spec, rolls, ctx) {
  const baseAbility = spec.ability;
  const primalEligible = spec.kind === "skill" && ctx.raging && ctx.level >= 3 && PRIMAL_SKILLS.has(spec.skill) && baseAbility !== "str";
  const usedPrimal = primalEligible && Boolean(spec.usePrimal);
  const abilityKey = usedPrimal ? "str" : baseAbility;

  const parts = [{ label: abilityKey.toUpperCase(), value: ctx.mods[abilityKey] }];
  const multiplier = spec.kind === "check" ? 0 : spec.expert ? 2 : spec.proficient ? 1 : 0;
  if (multiplier) {
    parts.push({ label: multiplier === 2 ? "Expertise" : "Proficiency", value: multiplier * ctx.prof });
  }
  const bonus = sumValues(parts);

  const advantageFrom = [];
  const disadvantageFrom = [];
  if (ctx.raging && abilityKey === "str") {
    advantageFrom.push("Rage");
  }
  if (spec.kind === "save" && baseAbility === "dex" && ctx.dangerSense) {
    advantageFrom.push("Danger Sense");
  }
  if (ctx.rollMode === "adv") {
    advantageFrom.push("other effect");
  }
  if (ctx.rollMode === "dis") {
    disadvantageFrom.push("other effect");
  }

  const roll = resolveD20(advantageFrom, disadvantageFrom, rolls);
  const total = roll.natural === null ? null : roll.natural + bonus;
  const dc = toWholeNumber(rolls.dc, 0, 99);
  const success = total !== null && dc !== null ? total >= dc : null;
  return { ...roll, abilityKey, parts, bonus, primalEligible, usedPrimal, advantageFrom, disadvantageFrom, total, dc, success };
}

// ---- Weapon setup helpers (best-effort guesses from the free-text Attacks list) ----

const DEFAULT_TYPE_BY_NAME = [
  [/axe|sword|blade|scythe|glaive|halberd/i, "slashing"],
  [/hammer|maul|mace|club|staff|flail|morningstar/i, "bludgeoning"],
  [/javelin|spear|pike|lance|dagger|rapier|arrow|bow/i, "piercing"]
];
const DEFAULT_MASTERY_BY_NAME = [
  [/great ?axe/i, "cleave"],
  [/great ?sword/i, "graze"],
  [/hammer|warhammer/i, "push"],
  [/maul|quarterstaff|battleaxe/i, "topple"],
  [/javelin/i, "slow"],
  [/handaxe/i, "vex"]
];
const VERSATILE_BY_NAME = [
  [/quarter ?staff/i, "1d8"],
  [/long ?sword|battle ?axe|war ?hammer/i, "1d10"],
  [/spear|trident/i, "1d8"]
];
const HEAVY_NAMES = /great ?axe|great ?sword|maul|pike|halberd|glaive|lance|heavy crossbow|colossus|collosus/i;
const THROWN_NAMES = /javelin|dart|net/i;

function normalizeName(text) {
  return String(text ?? "").toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z]/g, "");
}

function plainText(html) {
  const holder = document.createElement("div");
  holder.innerHTML = html;
  return holder.textContent || "";
}

function guessWeapon(attack, masteryText) {
  const rawName = String(attack.name ?? "").trim();
  if (!rawName) {
    return null;
  }
  const flaggedMastery = /\(\s*mastery\s*\)/i.test(rawName);
  const name = rawName.replace(/\s*\(\s*mastery\s*\)\s*/i, "").trim();
  const damageText = String(attack.type ?? "");

  const dice = [...damageText.matchAll(/(\d+d\d+)/gi)].map((m) => m[1]);
  const types = [...damageText.toLowerCase().matchAll(new RegExp(DAMAGE_TYPES.join("|"), "g"))].map((m) => m[0]);
  let type = types[0];
  if (!type) {
    const byName = DEFAULT_TYPE_BY_NAME.find(([pattern]) => pattern.test(name));
    type = byName ? byName[1] : "";
  }

  let mastery = "";
  const target = normalizeName(name);
  const found = [...masteryText.matchAll(/([^()\n:]{3,40})\(\s*(cleave|graze|nick|push|sap|slow|topple|vex)\s*\)/gi)];
  found.forEach((match) => {
    const listed = normalizeName(match[1]);
    if (target && listed && (listed.includes(target) || target.includes(listed))) {
      mastery = match[2].toLowerCase();
    }
  });
  if (!mastery && flaggedMastery) {
    const byName = DEFAULT_MASTERY_BY_NAME.find(([pattern]) => pattern.test(name));
    mastery = byName ? byName[1] : "";
  }

  return sanitizeWeapon({
    name,
    dice: dice[0] || "",
    type,
    versatile: (VERSATILE_BY_NAME.find(([pattern]) => pattern.test(name)) || [])[1] || "",
    extraDice: dice[1] || "",
    extraType: dice[1] ? types[1] || "" : "",
    ability: "str",
    magic: 0,
    heavy: HEAVY_NAMES.test(name),
    ranged: THROWN_NAMES.test(name),
    mastery
  });
}

function sanitizeWeapon(raw) {
  const w = raw && typeof raw === "object" ? raw : {};
  const text = (value, max) => String(value ?? "").trim().slice(0, max);
  const dice = (value) => (parseDice(value) ? text(value, 8).replace(/\s+/g, "").toLowerCase() : "");
  const magic = Math.max(-5, Math.min(10, Math.round(Number(w.magic) || 0)));
  return {
    id: text(w.id, 40) || `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    name: text(w.name, 60),
    dice: dice(w.dice),
    type: text(w.type, 30).toLowerCase(),
    versatile: dice(w.versatile),
    extraDice: dice(w.extraDice),
    extraType: text(w.extraType, 30).toLowerCase(),
    ability: w.ability === "dex" ? "dex" : "str",
    magic,
    heavy: Boolean(w.heavy),
    ranged: Boolean(w.ranged),
    mastery: MASTERY_ORDER.includes(w.mastery) ? w.mastery : "",
    notes: text(w.notes, 200)
  };
}

// ---- Battle tab UI ----

const Battle = (() => {
  const state = {
    weapons: [],
    gwm: false,
    imported: false,
    selectedId: "",
    tab: "sheet",
    rollMode: "normal",
    twoHanded: false,
    checkKind: "save:str",
    checkMode: "normal",
    primal: true,
    danger: true,
    reckless: false,
    turn: { action: false, bonus: false, reaction: false, attacks: 0 },
    ready: false
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

  function isBarbarian() {
    return /barbarian/i.test($("class").value);
  }

  function level() {
    return Number($("level").value) || 1;
  }

  function readContext() {
    const lvl = level();
    return {
      mods: {
        str: getModifier($("str").value),
        dex: getModifier($("dex").value)
      },
      prof: profByLevel(lvl),
      raging: $("isRaging").checked,
      rageDamage: rageDamageByLevel(lvl),
      reckless: state.reckless && isBarbarian() && lvl >= 2,
      rollMode: state.rollMode,
      twoHanded: state.twoHanded,
      gwm: state.gwm
    };
  }

  function selectedWeapon() {
    return state.weapons.find((w) => w.id === state.selectedId) || state.weapons[0] || null;
  }

  function save() {
    scheduleSave();
  }

  // ---- data hooks used by app.js ----

  function collect() {
    return { weapons: state.weapons.map((w) => ({ ...w })), gwm: state.gwm, imported: state.imported };
  }

  function apply(data) {
    const source = data && typeof data === "object" ? data : {};
    state.weapons = Array.isArray(source.weapons)
      ? source.weapons.filter((w) => w && typeof w === "object").slice(0, 20).map(sanitizeWeapon)
      : [];
    state.gwm = Boolean(source.gwm);
    state.imported = Boolean(source.imported);
    state.selectedId = state.weapons[0] ? state.weapons[0].id : "";
    // A character file from before the Battle tab: set weapons up now if the Battle tab is open.
    if (state.ready && state.tab === "battle" && !state.imported && state.weapons.length === 0) {
      importFromAttacks();
    }
    if (state.ready) {
      renderAll();
    }
  }

  function reset() {
    state.weapons = [];
    state.gwm = false;
    state.imported = false;
    state.selectedId = "";
    state.reckless = false;
    state.rollMode = "normal";
    state.twoHanded = false;
    state.checkKind = "save:str";
    state.checkMode = "normal";
    state.primal = true;
    state.danger = true;
    state.turn = { action: false, bonus: false, reaction: false, attacks: 0 };
    ["btD20a", "btD20b", "btAc", "btDice", "btExtra", "btCheckD20a", "btCheckD20b", "btCheckDc"].forEach((id) => {
      $(id).value = "";
    });
    $("btCheckKind").value = state.checkKind;
    renderAll();
  }

  function importFromAttacks() {
    const masteryText = plainText($("masteryNotes").innerHTML);
    const weapons = collectAttackRows().map((attack) => guessWeapon(attack, masteryText)).filter(Boolean);
    if (/tavern brawler/i.test(plainText($("traits").innerHTML))) {
      weapons.push(
        sanitizeWeapon({
          name: "Unarmed strike",
          dice: "1d4",
          type: "bludgeoning",
          notes: "Tavern Brawler: reroll a 1 on the damage die. Once per turn, push the target 5 feet."
        })
      );
    }
    state.weapons = weapons;
    state.imported = true;
    state.selectedId = weapons[0] ? weapons[0].id : "";
    if (/great weapon master/i.test(plainText($("traits").innerHTML))) {
      state.gwm = true;
    }
    save();
    return weapons.length;
  }

  // ---- tabs ----

  function showTab(name) {
    state.tab = name === "battle" ? "battle" : "sheet";
    const battle = state.tab === "battle";
    $("battleTab").hidden = !battle;
    $("sheetTab").hidden = battle;
    document.body.dataset.tab = state.tab;
    document.querySelectorAll(".tab").forEach((tab) => {
      const active = tab.dataset.tab === state.tab;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (battle) {
      if (!state.imported && state.weapons.length === 0) {
        const count = importFromAttacks();
        setStatus(
          count
            ? `Set up ${count} weapons from your Attacks list. Check the details under Battle setup.`
            : "No weapons found. Add one under Battle setup.",
          count ? "status-ok" : ""
        );
      }
      renderAll();
    }
    const hash = battle ? "#battle" : "#sheet";
    if (location.hash !== hash) {
      history.replaceState(null, "", hash);
    }
    window.scrollTo(0, 0);
  }

  // ---- rendering ----

  function renderAll() {
    renderModifiers();
    renderPicker();
    renderSetup();
    renderTurn();
    renderNumbers();
    renderResult();
    renderChecks();
  }

  function refresh() {
    if (!state.ready || state.tab !== "battle") {
      return;
    }
    renderModifiers();
    renderTurn();
    renderNumbers();
    renderResult();
    renderChecks();
  }

  function renderModifiers() {
    const raging = $("isRaging").checked;
    const rageButton = $("btRage");
    rageButton.setAttribute("aria-pressed", String(raging));
    rageButton.querySelector(".toggle-title").textContent = raging ? "Raging" : "Start Rage";
    rageButton.querySelector(".toggle-sub").textContent = `${$("rageUsesLeft").value || 0} of ${$("rageUsesMax").textContent} left`;

    const showReckless = isBarbarian() && level() >= 2;
    const attacksDone = state.turn.attacks > 0;
    const reckless = $("btReckless");
    reckless.hidden = !showReckless;
    reckless.setAttribute("aria-pressed", String(state.reckless));
    // Reckless Attack must be declared on the first attack roll of your turn; it lasts until your next turn starts.
    const locked = !state.reckless && attacksDone;
    reckless.disabled = locked;
    reckless.querySelector(".toggle-sub").textContent = state.reckless
      ? "Until the start of your next turn"
      : locked
        ? "Only on your first attack each turn"
        : "Advantage on Strength attacks";
    $("btUndoReckless").hidden = !(showReckless && state.reckless);
    $("btUndoRage").hidden = !(raging && typeof rageUseSpent !== "undefined" && rageUseSpent);

    document.querySelectorAll("#btRollMode input").forEach((radio) => {
      radio.checked = radio.value === state.rollMode;
    });
    $("btRecklessWarning").hidden = !(showReckless && state.reckless);
  }

  function renderPicker() {
    const picker = $("btWeapons");
    picker.textContent = "";
    if (!state.weapons.length) {
      picker.append(el("p", { class: "muted", text: "No weapons yet. Add one under Battle setup." }));
      return;
    }
    const chosen = selectedWeapon();
    state.weapons.forEach((weapon) => {
      const active = chosen && weapon.id === chosen.id;
      const button = el(
        "button",
        { type: "button", class: "weapon-btn", role: "radio", "aria-checked": String(Boolean(active)), "data-id": weapon.id },
        el("span", { class: "weapon-name", text: weapon.name || "Unnamed weapon" }),
        el("span", {
          class: "weapon-sub",
          text: [weapon.dice, weapon.mastery ? MASTERY[weapon.mastery].label : ""].filter(Boolean).join(" · ") || "Set dice in setup"
        })
      );
      picker.append(button);
    });
  }

  function renderTurn() {
    const attackLimit = isBarbarian() && level() >= 5 ? 2 : 1;
    const chips = [
      ["action", "Action"],
      ["bonus", "Bonus action"],
      ["reaction", "Reaction"]
    ];
    const box = $("btTurnChips");
    box.textContent = "";
    chips.forEach(([key, label]) => {
      box.append(
        el("button", { type: "button", class: "turn-chip", "data-turn": key, "aria-pressed": String(state.turn[key]) }, label)
      );
    });
    $("btAttackCount").textContent = `${state.turn.attacks} of ${attackLimit}`;
  }

  function renderNumbers() {
    const box = $("btNumbers");
    box.textContent = "";
    const lvl = level();
    const raging = $("isRaging").checked;
    const barbarian = isBarbarian();

    const tiles = [
      ["AC", $("ac").value],
      ["HP", `${$("currentHp").value}/${$("maxHp").value}${Number($("tempHp").value) > 0 ? ` +${$("tempHp").value}` : ""}`],
      ["Speed", `${$("speed").value} ft`],
      ["Initiative", signed(Number($("initiative").value) || 0)],
      ["Proficiency", signed(profByLevel(lvl))],
      ["Passive Perception", $("passivePerception").textContent]
    ];
    const tileGrid = el("div", { class: "num-tiles" });
    tiles.forEach(([label, value]) => {
      tileGrid.append(el("div", { class: "num-tile" }, el("span", { class: "num-value", text: value }), el("span", { class: "num-label", text: label })));
    });
    box.append(tileGrid);

    const table = el("div", { class: "ability-table", role: "table", "aria-label": "Abilities and saving throws" });
    table.append(
      el("div", { class: "ability-row ability-row-head", role: "row" }, el("span", { text: "" }), el("span", { text: "Mod" }), el("span", { text: "Save" }))
    );
    ABILITIES.forEach((ability) => {
      const save = $(`${ability.key}SaveVal`).textContent;
      const extra = barbarian && lvl >= 2 && ability.key === "dex" ? " (Adv)" : "";
      table.append(
        el(
          "div",
          { class: "ability-row", role: "row" },
          el("span", { text: ability.label }),
          el("span", { class: "num", text: $(`${ability.key}Mod`).textContent }),
          el("span", { class: "num", text: `${save}${extra}` })
        )
      );
    });
    box.append(table);

    const lines = [];
    if (raging) {
      lines.push(`Rage: +${rageDamageByLevel(lvl)} damage on Strength attacks`);
      lines.push("Advantage on Strength checks and saves");
      lines.push(`Resistance: ${$("rageResist").textContent}`);
      lines.push("No spellcasting or concentration");
    } else if (barbarian) {
      lines.push("Not raging. Start a Rage with the button above (bonus action).");
    }
    if (barbarian && lvl >= 2) {
      lines.push("Danger Sense: Advantage on Dexterity saves unless you are Incapacitated");
    }
    if (lines.length) {
      const list = el("ul", { class: "num-notes" });
      lines.forEach((line) => list.append(el("li", { text: line })));
      box.append(list);
    }
  }

  function renderResult() {
    const out = $("btResult");
    out.textContent = "";
    const weapon = selectedWeapon();
    if (!weapon) {
      out.append(el("p", { class: "muted", text: "Add a weapon under Battle setup to start." }));
      return;
    }

    const rolls = {
      d20a: $("btD20a").value,
      d20b: $("btD20b").value,
      ac: $("btAc").value,
      dice: $("btDice").value,
      extra: $("btExtra").value
    };
    const result = computeAttack(weapon, rolls, readContext());

    $("btTwoHandedWrap").hidden = !weapon.versatile;
    $("btTwoHandedText").textContent = `Two-handed (${weapon.versatile || ""})`;
    $("btTwoHanded").checked = state.twoHanded;
    $("btD20bWrap").hidden = result.state === "normal";
    $("btExtraWrap").hidden = !result.needsExtra;
    $("btExtraLabel").textContent = result.needsExtra ? `Extra dice rolled (${result.extraInstruction} ${weapon.extraType || ""})`.trim() : "Extra dice rolled";
    $("btDiceLabel").textContent = `Damage dice rolled (${result.mainInstruction || "set dice in setup"})`;
    $("btD20aLabel").textContent = result.state === "normal" ? "Attack roll (d20)" : `First d20 (${result.state === "adv" ? "Advantage" : "Disadvantage"})`;

    // Attack roll
    const attackBlock = el("section", { class: "res-block" });
    attackBlock.append(el("h3", { text: "To hit" }));
    const bonusText = result.attackParts.map((part) => `${signed(part.value)} ${part.label}`).join(" ");
    const flag = rollFlagText(result);
    if (flag) {
      attackBlock.append(el("p", { class: "res-flag", text: flag }));
    }
    if (result.needSecond) {
      attackBlock.append(el("p", { class: "muted", text: "Enter both d20 rolls." }));
    } else if (result.natural === null) {
      attackBlock.append(el("p", { class: "muted", text: `Enter your d20 roll. Your attack bonus is ${signed(result.attackBonus)} (${bonusText}).` }));
    } else {
      const used = result.state === "normal" ? `${result.natural}` : `${result.natural} (of ${result.first} and ${result.second})`;
      attackBlock.append(
        el("p", { class: "res-big" }, el("span", { class: "big", text: String(result.total) }), el("span", { class: "res-sub", text: `${used} ${bonusText}` }))
      );
      let badge;
      if (result.crit) {
        badge = ["crit", result.ac !== null ? `Critical hit on AC ${result.ac}` : "Critical hit"];
      } else if (result.fumble) {
        badge = ["miss", result.ac !== null ? `Natural 1: miss against AC ${result.ac}` : "Natural 1: automatic miss"];
      } else if (result.hit === true) {
        badge = ["hit", `Hit AC ${result.ac}`];
      } else if (result.hit === false) {
        badge = ["miss", `Miss against AC ${result.ac}`];
      } else {
        badge = ["info", `Hits any AC up to ${result.total}`];
      }
      attackBlock.append(el("p", { class: `badge badge-${badge[0]}`, text: badge[1] }));
    }
    out.append(attackBlock);

    // Damage
    const missed = result.hit === false || (result.natural !== null && result.fumble);
    const damageBlock = el("section", { class: "res-block" });
    damageBlock.append(el("h3", { text: "Damage" }));
    if (missed) {
      damageBlock.append(el("p", { class: "muted", text: "No damage on a miss." }));
      if (result.mastery && result.mastery.key === "graze") {
        damageBlock.append(el("p", { class: "res-flag", text: `Graze: deal ${result.mastery.grazeDamage} ${weapon.type || ""} damage anyway.`.replace("  ", " ") }));
      }
    } else if (!result.mainInstruction) {
      damageBlock.append(el("p", { class: "muted", text: "Set this weapon's damage dice under Battle setup." }));
    } else if (result.damageTotal === null) {
      const instruction = [result.mainInstruction, result.extraInstruction ? `${result.extraInstruction} ${weapon.extraType || ""}`.trim() : ""].filter(Boolean).join(" + ");
      const prefix = result.crit ? "Critical hit: roll double the dice, " : "Roll ";
      damageBlock.append(el("p", { class: "res-flag", text: `${prefix}${instruction}.` }));
      damageBlock.append(
        el("p", { class: "muted", text: `Then add ${signed(result.flatTotal)} (${result.flat.map((f) => `${signed(f.value)} ${f.label}`).join(" ")}).` })
      );
      if (result.hit === null && result.natural !== null) {
        damageBlock.append(el("p", { class: "muted", text: "Add the target's AC above to see hit or miss." }));
      }
    } else {
      damageBlock.append(
        el("p", { class: "res-big" }, el("span", { class: "big", text: String(result.damageTotal) }), el("span", { class: "res-sub", text: "total damage" }))
      );
      const list = el("ul", { class: "breakdown" });
      result.parts.forEach((part) => {
        list.append(el("li", {}, el("span", { text: part.label }), el("span", { class: "num", text: signed(part.value) })));
      });
      damageBlock.append(list);
      const types = Object.entries(result.byType);
      if (types.length) {
        damageBlock.append(
          el(
            "p",
            { class: "by-type" },
            types.map(([type, amount]) => el("span", { class: "type-chip", text: `${amount} ${type}` }))
          )
        );
      }
      if (result.crit) {
        damageBlock.append(el("p", { class: "muted", text: "Critical hit: the dice are doubled; modifiers are added once." }));
      }
    }
    out.append(damageBlock);

    // Effects and reminders
    const notes = [];
    const landed = !missed && result.natural !== null && result.hit !== false;
    if (result.mastery && landed) {
      const info = result.mastery;
      if (info.onHit) {
        notes.push(info.onHit + (info.toppleDc ? ` DC ${info.toppleDc}.` : ""));
      }
      if (info.key === "cleave" && result.damageTotal !== null) {
        const rage = result.flat.find((f) => f.label === "Rage");
        notes.push(`Cleave damage: your damage dice${rage ? ` plus ${rage.value} Rage` : ""}, no ${result.abilityKey.toUpperCase()} modifier. Rage may still apply; confirm with your DM.`);
      }
    }
    if (result.mastery && result.mastery.note) {
      notes.push(result.mastery.note);
    }
    if (result.mastery && result.mastery.key === "graze" && result.hit === null && result.natural !== null) {
      notes.push(`If you miss: ${result.mastery.onMiss} That is ${result.mastery.grazeDamage} damage.`);
    }
    if (result.mastery && result.mastery.key === "topple" && missed) {
      notes.push(`Topple needs a hit. DC would be ${result.mastery.toppleDc}.`);
    }
    if (result.gwmFollowUp && landed) {
      notes.push("Great Weapon Master: on a critical hit (or if the target drops to 0 HP) you can make one attack with the same weapon as a bonus action.");
    }
    if (weapon.notes) {
      notes.push(weapon.notes);
    }
    if (notes.length) {
      const list = el("ul", { class: "notes" });
      notes.forEach((note) => list.append(el("li", { text: note })));
      out.append(el("section", { class: "res-block" }, el("h3", { text: "Remember" }), list));
    }
  }

  function checkSpec(kind) {
    const [type, key] = String(kind).split(":");
    if (type === "save") {
      const save = SAVES.find((s) => s.ability === key) || SAVES[0];
      return { kind: "save", ability: save.ability, label: `${save.label} saving throw`, proficient: $(`${save.key}Prof`).checked };
    }
    if (type === "skill") {
      const skill = SKILLS.find((s) => s.key === key) || SKILLS[0];
      return {
        kind: "skill",
        skill: skill.key,
        ability: skill.ability,
        label: `${skill.label} check`,
        proficient: $(`${skill.key}Prof`).checked,
        expert: $(`${skill.key}Expert`).checked
      };
    }
    const ability = ABILITIES.find((a) => a.key === key) || ABILITIES[0];
    return { kind: "check", ability: ability.key, label: `${ability.label} check` };
  }

  function renderChecks() {
    const out = $("btCheckResult");
    out.textContent = "";
    const spec = checkSpec(state.checkKind);
    spec.usePrimal = state.primal;

    const mods = {};
    ABILITIES.forEach((a) => {
      mods[a.key] = getModifier($(a.key).value);
    });
    const dangerPossible = spec.kind === "save" && spec.ability === "dex" && isBarbarian() && level() >= 2;
    const result = computeCheck(
      spec,
      { d20a: $("btCheckD20a").value, d20b: $("btCheckD20b").value, dc: $("btCheckDc").value },
      {
        mods,
        prof: profByLevel(level()),
        raging: $("isRaging").checked,
        level: level(),
        dangerSense: dangerPossible && state.danger,
        rollMode: state.checkMode
      }
    );

    $("btCheckKind").value = state.checkKind;
    $("btPrimalWrap").hidden = !result.primalEligible;
    $("btPrimal").checked = state.primal;
    $("btDangerWrap").hidden = !dangerPossible;
    $("btDanger").checked = state.danger;
    $("btCheckD20bWrap").hidden = result.state === "normal";
    $("btCheckD20aLabel").textContent = result.state === "normal" ? "d20 roll" : `First d20 (${result.state === "adv" ? "Advantage" : "Disadvantage"})`;
    document.querySelectorAll("#btCheckMode input").forEach((radio) => {
      radio.checked = radio.value === state.checkMode;
    });

    const block = el("section", { class: "res-block" }, el("h3", { text: spec.label }));
    const flag = rollFlagText(result);
    if (flag) {
      block.append(el("p", { class: "res-flag", text: flag }));
    }
    const bonusText = result.parts.map((part) => `${signed(part.value)} ${part.label}`).join(" ");
    if (result.usedPrimal) {
      block.append(el("p", { class: "muted", text: "Primal Knowledge: made as a Strength check." }));
    }
    if (result.needSecond) {
      block.append(el("p", { class: "muted", text: "Enter both d20 rolls." }));
    } else if (result.natural === null) {
      block.append(el("p", { class: "muted", text: `Enter your d20 roll. Your bonus is ${signed(result.bonus)} (${bonusText}).` }));
    } else {
      const used = result.state === "normal" ? `${result.natural}` : `${result.natural} (of ${result.first} and ${result.second})`;
      block.append(el("p", { class: "res-big" }, el("span", { class: "big", text: String(result.total) }), el("span", { class: "res-sub", text: `${used} ${bonusText}` })));
      if (result.success !== null) {
        block.append(el("p", { class: `badge ${result.success ? "badge-hit" : "badge-miss"}`, text: result.success ? `Success against DC ${result.dc}` : `Fail against DC ${result.dc}` }));
      } else {
        block.append(el("p", { class: "badge badge-info", text: `Succeeds against any DC up to ${result.total}` }));
      }
    }
    out.append(block);
  }

  function buildCheckOptions() {
    const select = $("btCheckKind");
    select.textContent = "";
    const group = (label, items) => {
      const g = el("optgroup", { label });
      items.forEach(([value, text]) => g.append(el("option", { value, text })));
      select.append(g);
    };
    group("Saving throws", SAVES.map((s) => [`save:${s.ability}`, `${s.label} save`]));
    group("Ability checks", ABILITIES.map((a) => [`check:${a.key}`, `${a.label} check`]));
    group("Skills", SKILLS.map((s) => [`skill:${s.key}`, `${s.label} (${s.ability.toUpperCase()})`]));
    select.value = state.checkKind;
  }

  function renderSetup() {
    const box = $("btWeaponCards");
    box.textContent = "";
    $("btGwm").checked = state.gwm;
    state.weapons.forEach((weapon) => box.append(buildWeaponCard(weapon)));
    if (!state.weapons.length) {
      box.append(el("p", { class: "muted", text: "No weapons yet. Choose Add weapon or Import from Attacks." }));
    }
  }

  function field(weapon, key, label, props = {}) {
    const input = el("input", { type: props.type || "text", "data-w": weapon.id, "data-f": key, ...props.attrs });
    input.value = props.type === "number" ? String(weapon[key]) : weapon[key];
    return el("label", { class: "field" }, label, input);
  }

  function buildWeaponCard(weapon) {
    const abilitySelect = el("select", { "data-w": weapon.id, "data-f": "ability" }, el("option", { value: "str", text: "Strength" }), el("option", { value: "dex", text: "Dexterity" }));
    abilitySelect.value = weapon.ability;
    const masterySelect = el("select", { "data-w": weapon.id, "data-f": "mastery" }, el("option", { value: "", text: "None" }));
    MASTERY_ORDER.forEach((key) => masterySelect.append(el("option", { value: key, text: MASTERY[key].label })));
    masterySelect.value = weapon.mastery;

    const heavy = el("input", { type: "checkbox", "data-w": weapon.id, "data-f": "heavy" });
    heavy.checked = weapon.heavy;
    const ranged = el("input", { type: "checkbox", "data-w": weapon.id, "data-f": "ranged" });
    ranged.checked = weapon.ranged;

    return el(
      "div",
      { class: "weapon-card", "data-card": weapon.id },
      el(
        "div",
        { class: "weapon-card-grid" },
        field(weapon, "name", "Name"),
        field(weapon, "dice", "Damage dice", { attrs: { placeholder: "1d12" } }),
        field(weapon, "type", "Damage type", { attrs: { placeholder: "slashing", list: "btTypes" } }),
        field(weapon, "versatile", "Two-handed dice (Versatile)", { attrs: { placeholder: "1d8" } }),
        field(weapon, "extraDice", "Extra dice (optional)", { attrs: { placeholder: "1d6" } }),
        field(weapon, "extraType", "Extra type", { attrs: { placeholder: "fire", list: "btTypes" } }),
        el("label", { class: "field" }, "Attack ability", abilitySelect),
        field(weapon, "magic", "Magic bonus", { type: "number", attrs: { min: "-5", max: "10", inputmode: "numeric" } }),
        el("label", { class: "field" }, "Mastery", masterySelect),
        field(weapon, "notes", "Reminder note", { attrs: { placeholder: "Shown after each attack" } })
      ),
      el(
        "div",
        { class: "weapon-card-foot" },
        el("label", { class: "check-inline" }, heavy, "Heavy"),
        el("label", { class: "check-inline" }, ranged, "Ranged attack (no Hew bonus attack)"),
        el("button", { type: "button", class: "chip-btn danger", "data-remove": weapon.id }, "Remove")
      )
    );
  }

  // ---- events ----

  function bind() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => showTab(tab.dataset.tab));
      tab.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          const next = state.tab === "sheet" ? "battle" : "sheet";
          showTab(next);
          document.querySelector(`.tab[data-tab="${next}"]`).focus();
        }
      });
    });
    window.addEventListener("hashchange", () => {
      const wanted = location.hash === "#battle" ? "battle" : "sheet";
      if (wanted !== state.tab) {
        showTab(wanted);
      }
    });

    $("btRage").addEventListener("click", () => {
      $("isRaging").click();
      renderModifiers();
    });
    $("btReckless").addEventListener("click", () => {
      state.reckless = !state.reckless;
      renderModifiers();
      renderResult();
    });
    $("btUndoReckless").addEventListener("click", () => {
      state.reckless = false;
      renderModifiers();
      renderResult();
      setStatus("Reckless Attack cancelled.", "status-ok");
    });
    $("btUndoRage").addEventListener("click", () => {
      undoRage();
      renderModifiers();
      renderResult();
    });
    $("btTwoHanded").addEventListener("input", (event) => {
      state.twoHanded = event.target.checked;
      renderResult();
    });
    // "input" (not "change"): the sheet-wide input handler re-renders after this and must see the new mode.
    $("btRollMode").addEventListener("input", (event) => {
      state.rollMode = event.target.value;
      renderModifiers();
      renderResult();
    });

    $("btCheckKind").addEventListener("input", (event) => {
      state.checkKind = event.target.value;
      renderChecks();
    });
    $("btCheckMode").addEventListener("input", (event) => {
      state.checkMode = event.target.value;
      renderChecks();
    });
    ["btCheckD20a", "btCheckD20b", "btCheckDc"].forEach((id) => {
      $(id).addEventListener("input", renderChecks);
    });
    $("btPrimal").addEventListener("input", (event) => {
      state.primal = event.target.checked;
      renderChecks();
    });
    $("btDanger").addEventListener("input", (event) => {
      state.danger = event.target.checked;
      renderChecks();
    });

    $("btWeapons").addEventListener("click", (event) => {
      const button = event.target.closest(".weapon-btn");
      if (!button) {
        return;
      }
      state.selectedId = button.dataset.id;
      renderPicker();
      renderResult();
    });

    ["btD20a", "btD20b", "btAc", "btDice", "btExtra"].forEach((id) => {
      $(id).addEventListener("input", renderResult);
    });

    $("btNext").addEventListener("click", () => {
      const limit = isBarbarian() && level() >= 5 ? 2 : 1;
      state.turn.attacks = Math.min(limit, state.turn.attacks + 1);
      state.turn.action = true;
      ["btD20a", "btD20b", "btDice", "btExtra"].forEach((id) => {
        $(id).value = "";
      });
      renderTurn();
      renderModifiers();
      renderResult();
      $("btD20a").focus();
      setStatus(state.turn.attacks >= limit ? "That was your last attack this action." : "Next attack ready.", "status-ok");
    });
    $("btClear").addEventListener("click", () => {
      ["btD20a", "btD20b", "btDice", "btExtra"].forEach((id) => {
        $(id).value = "";
      });
      renderResult();
      $("btD20a").focus();
    });

    $("btTurnChips").addEventListener("click", (event) => {
      const chip = event.target.closest(".turn-chip");
      if (chip) {
        state.turn[chip.dataset.turn] = !state.turn[chip.dataset.turn];
        renderTurn();
      }
    });
    $("btNewTurn").addEventListener("click", () => {
      state.turn = { action: false, bonus: false, reaction: false, attacks: 0 };
      state.reckless = false;
      renderModifiers();
      renderTurn();
      renderResult();
      setStatus($("isRaging").checked ? "New turn. Keep your Rage going: attack, force a save, or use a bonus action." : "New turn.", "status-ok");
    });

    const setup = $("btSetupBody");
    const updateFromField = (event) => {
      const target = event.target;
      const id = target.dataset.w;
      const key = target.dataset.f;
      if (!id || !key) {
        return;
      }
      const weapon = state.weapons.find((w) => w.id === id);
      if (!weapon) {
        return;
      }
      const raw = target.type === "checkbox" ? target.checked : target.value;
      const updated = sanitizeWeapon({ ...weapon, [key]: raw });
      // While typing, keep the user's raw text for free-text fields; sanitize on commit.
      if (event.type === "input" && target.type === "text") {
        weapon[key] = String(raw).slice(0, 60);
        if (key === "dice" || key === "extraDice") {
          weapon[key] = parseDice(raw) ? updated[key] : String(raw).slice(0, 8);
        }
      } else {
        Object.assign(weapon, updated);
      }
      renderPicker();
      renderResult();
    };
    setup.addEventListener("input", updateFromField);
    setup.addEventListener("change", (event) => {
      updateFromField(event);
      if (event.target.type === "text") {
        const weapon = state.weapons.find((w) => w.id === event.target.dataset.w);
        if (weapon) {
          const clean = sanitizeWeapon(weapon);
          Object.assign(weapon, clean);
          event.target.value = clean[event.target.dataset.f] ?? event.target.value;
        }
      }
      save();
    });
    setup.addEventListener("click", (event) => {
      const remove = event.target.closest("[data-remove]");
      if (remove) {
        state.weapons = state.weapons.filter((w) => w.id !== remove.dataset.remove);
        if (!state.weapons.some((w) => w.id === state.selectedId)) {
          state.selectedId = state.weapons[0] ? state.weapons[0].id : "";
        }
        renderSetup();
        renderPicker();
        renderResult();
        save();
      }
    });

    $("btGwm").addEventListener("change", (event) => {
      state.gwm = event.target.checked;
      renderResult();
      save();
    });
    $("btAddWeapon").addEventListener("click", () => {
      if (state.weapons.length >= 20) {
        setStatus("That is the maximum number of weapons.", "status-error");
        return;
      }
      const weapon = sanitizeWeapon({ name: "New weapon" });
      state.weapons.push(weapon);
      state.selectedId = weapon.id;
      state.imported = true;
      renderSetup();
      renderPicker();
      renderResult();
      save();
    });
    $("btImport").addEventListener("click", () => {
      if (state.weapons.length && !confirm("Replace the Battle weapon list with a fresh import from your Attacks list?")) {
        return;
      }
      const count = importFromAttacks();
      renderAll();
      setStatus(`Imported ${count} weapons from your Attacks list.`, "status-ok");
    });
  }

  function init() {
    if (state.ready) {
      return;
    }
    buildCheckOptions();
    bind();
    state.ready = true;
  }

  // Called after saved data has loaded, so the first import of weapons sees the real Attacks list.
  function start() {
    showTab(location.hash === "#battle" ? "battle" : "sheet");
  }

  return { init, start, collect, apply, reset, refresh };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = { computeAttack, computeCheck, rollFlagText, guessWeapon, sanitizeWeapon, parseDice, MASTERY };
}
