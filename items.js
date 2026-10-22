"use strict";

// Magic items (and, further down, class features and conditions): worn/wielded and attuned toggles, charges and daily uses, and the effects they have on the sheet
// (Haste, fire resistance, speed penalties, weapon stats). The pure rules live at the top so they can be tested in Node.
const Items = (() => {
  const MAX_ATTUNED = 3;
  const MAX_ITEMS = 40;

  const COLOSSUS_STAGES = [
    {
      stage: 1,
      name: "The Burden",
      from: 0,
      text: "Days 1 to 6. Disadvantage on attack rolls and Speed is 10 ft lower while wielding. Train 1 hour a day (sparring, conditioning, swinging); a skipped day delays progress."
    },
    {
      stage: 2,
      name: "The Strain",
      from: 7,
      text: "After 7 successful days. Disadvantage removed and the Speed penalty drops to 5 ft. Gain Cleaving Strike. You begin to hear faint whispers of past wielders."
    },
    {
      stage: 3,
      name: "The Bond",
      from: 21,
      text: "After 21 total days. No Speed penalty. Gain Great Rend, and the sword counts as magical. You must succeed on a DC 14 Wisdom save once per long rest or be compelled to keep pushing yourself harder."
    },
    {
      stage: 4,
      name: "Mastery",
      from: 40,
      text: "After 40 total days. You are fully attuned and damage becomes 4d6 + Strength modifier slashing. Gain Titan's Swing. The whispers fall silent."
    }
  ];

  function stageFor(days) {
    const d = Math.max(0, Math.floor(Number(days) || 0));
    let stage = 1;
    COLOSSUS_STAGES.forEach((entry) => {
      if (d >= entry.from) {
        stage = entry.stage;
      }
    });
    return stage;
  }

  // The objects from your object sheet. Each has a few fields the rest of the app understands:
  // weaponMatch (which Battle weapon it changes), wornLabel (what the Worn switch is called), uses (counters).
  const PRESETS = {
    colossus: {
      name: "Colossus Greatsword",
      kind: "Weapon (legendary), heavy, two-handed, magical",
      requiresAttunement: true,
      wornLabel: "Wielding",
      weaponMatch: /colossus|collosus/i,
      days: 21,
      uses: [
        { key: "great-rend", label: "Great Rend", max: 1, recharge: "long", minStage: 3, note: "When you hit, add 10 damage after seeing the damage roll." },
        { key: "titan-swing", label: "Titan's Swing", max: 1, recharge: "long", minStage: 4, note: "Action: 15 ft line, Dexterity save DC 11 + Strength modifier. 4d6 + Strength modifier slashing, half on a success." }
      ],
      notes: [
        "A titanic blade of blackened steel, chipped and scarred. Most creatures find it more like dragging a slab of iron than wielding a weapon.",
        "**Properties.** Heavy, Two-Handed, magical weapon. +1 bonus to attack and damage rolls. Damage 2d8 + Strength modifier slashing. A creature without Strength 20 cannot lift it effectively.",
        "**Cleaving Strike (once per round).** When you reduce a creature to 0 hit points with this weapon, you can make one weapon attack against another creature within 5 feet of it.",
        "**Great Rend (1/long rest).** When you hit, deal an extra 10 damage after seeing the damage roll.",
        "**Titan's Swing (1/long rest).** As an action, strike in a 15-foot line. Each creature must succeed on a Dexterity save (DC 11 + your Strength modifier) or take 4d6 + Strength modifier slashing damage, half on a success.",
        "**Colossal Demolition.** Attacks with it are automatically critical hits against non-magical objects and structures."
      ].join("\n")
    },
    festus: {
      name: "Festus's Forge",
      kind: "Weapon (rare), forge hammer, versatile, magical",
      requiresAttunement: true,
      wornLabel: "Wielding",
      weaponMatch: /forge hammer|festus/i,
      uses: [{ key: "heat-metal", label: "Heat Metal charges", max: 3, recharge: "long", note: "Bonus action, 1 charge: cast Heat Metal (save DC 15)." }],
      notes: [
        "A black-iron forge hammer that glows with streaks of molten orange when held. Runes of the forge god Gond are etched into the haft. It once belonged to Festus, a master smith.",
        "**Damage.** 1d12 bludgeoning + 1d6 fire two-handed, or 1d10 bludgeoning + 1d4 fire one-handed, plus Strength modifier. Counts as magical.",
        "**Heat of the Forge.** Bonus action, 1 of its 3 charges: cast Heat Metal (save DC 15). All charges return after a long rest.",
        "**Fire Resistance.** While attuned you have resistance to fire damage.",
        "**Master Smith's Touch.** Advantage on crafting checks when shaping or working metal.",
        "**Heat Metal (2nd level, concentration, up to 1 minute).** Choose a manufactured metal object you can see within range. It glows red-hot and any creature touching it takes 2d8 fire damage. On your later turns you can use a bonus action to cause the damage again. A creature holding or wearing it must succeed on a Constitution save or drop it if it can. If it does not drop it, it has Disadvantage on attack rolls and ability checks until the start of your next turn."
      ].join("\n")
    },
    "haste-boots": {
      name: "Boots of Haste",
      kind: "Wondrous item (very rare)",
      requiresAttunement: true,
      wornLabel: "Wearing",
      uses: [{ key: "haste", label: "Haste", max: 1, recharge: "long", note: "Once per day." }],
      hasActive: true,
      notes: [
        "**Haste.** While wearing these boots, you can use a bonus action to cast Haste on yourself. Usable once per day. It lasts 1 minute and needs no concentration. You do not suffer exhaustion when it ends. A bonus action ends it early.",
        "**While hasted.** Your Speed is doubled, you gain a +2 bonus to AC, you have Advantage on Dexterity saving throws, and you gain an additional action on each of your turns. That action can only be used to take the Attack (one weapon attack only), Dash, Disengage, Hide, or Utilize action."
      ].join("\n")
    },
    riverstone: {
      name: "Riverstone of Subtle Persuasion",
      kind: "Wondrous item (uncommon), no attunement",
      requiresAttunement: false,
      wornLabel: "Carrying",
      uses: [],
      notes: [
        "A smooth, light-green stone, polished by flowing water. Held in a pocket or the palm, it makes the world flow more easily around your words.",
        "**+1** to Charisma (Deception) and Charisma (Persuasion) checks while you carry it.",
        "Creatures are slightly more inclined to believe you. The DM may grant Advantage on rare situational checks where the stone feels especially relevant. It is not mind control: NPCs will not automatically believe outrageous lies."
      ].join("\n")
    },
    "alchemy-jug": {
      name: "Alchemy Jug",
      kind: "Wondrous item (uncommon)",
      requiresAttunement: false,
      wornLabel: "Carrying",
      uses: [{ key: "liquid", label: "Liquid made today", max: 1, recharge: "long", note: "Pick one liquid per day (resets at dawn)." }],
      notes: [
        "A ceramic jug that holds a gallon of liquid and weighs 12 pounds, full or empty. It sloshes when shaken, even if empty.",
        "**Magic action:** name one liquid from the table to make the jug produce it. Then uncork it as a Utilize action and pour up to 2 gallons per minute. It cannot produce a different liquid, or more than the maximum, until the next dawn.",
        "- Acid: 8 ounces",
        "- Basic Poison: 4 ounces",
        "- Beer or Ale: 4 gallons",
        "- Honey: 1 gallon",
        "- Mayonnaise: 2 gallons",
        "- Oil: 1 quart",
        "- Vinegar: 2 gallons",
        "- Water, Fresh: 8 gallons",
        "- Water, Salt: 12 gallons",
        "- Wine: 1 gallon"
      ].join("\n")
    }
  };
  const PRESET_ORDER = ["colossus", "festus", "haste-boots", "riverstone", "alchemy-jug"];

  // ---- pure rules ----

  const text = (value, max) => String(value ?? "").trim().slice(0, max);
  const whole = (value, min, max, fallback = min) => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
  };
  const newId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  function sanitizeUse(raw) {
    const u = raw && typeof raw === "object" ? raw : {};
    const max = whole(u.max, 1, 20, 1);
    return {
      key: text(u.key, 30) || `u${Math.random().toString(36).slice(2, 7)}`,
      label: text(u.label, 60) || "Uses",
      max,
      used: whole(u.used, 0, max, 0),
      recharge: u.recharge === "short" ? "short" : "long",
      note: text(u.note, 200),
      minStage: whole(u.minStage, 0, 4, 0)
    };
  }

  function sanitizeItem(raw) {
    const i = raw && typeof raw === "object" ? raw : {};
    const preset = Object.prototype.hasOwnProperty.call(PRESETS, i.preset) ? i.preset : "";
    return {
      id: text(i.id, 40) || newId(),
      preset,
      name: text(i.name, 80) || "New item",
      kind: text(i.kind, 120),
      notes: text(i.notes, 4000),
      requiresAttunement: Boolean(i.requiresAttunement),
      attuned: Boolean(i.requiresAttunement) && Boolean(i.attuned),
      worn: Boolean(i.worn),
      active: Boolean(i.active),
      collapsed: Boolean(i.collapsed),
      days: whole(i.days, 0, 999, 0),
      uses: (Array.isArray(i.uses) ? i.uses : []).slice(0, 8).map(sanitizeUse)
    };
  }

  function makeFromPreset(key) {
    const p = PRESETS[key];
    return sanitizeItem({
      preset: key,
      name: p.name,
      kind: p.kind,
      notes: p.notes,
      requiresAttunement: p.requiresAttunement,
      worn: !p.requiresAttunement,
      days: p.days || 0,
      uses: p.uses
    });
  }

  const attunedCount = (items) => items.filter((i) => i.attuned).length;
  const attunementOk = (item) => !item.requiresAttunement || item.attuned;

  // Resets counters on a rest. A long rest also puts Haste away (it only lasts a minute).
  function afterRest(items, kind) {
    return items.map((item) => ({
      ...item,
      active: kind === "long" ? false : item.active,
      uses: item.uses.map((u) => (kind === "long" || u.recharge === "short" ? { ...u, used: 0 } : u))
    }));
  }

  // What the items are doing to the character right now. ctx: { str } (the Strength score).
  function computeEffects(items, ctx = {}) {
    const out = { extraAttacks: 0, acBonus: 0, speedMultiplier: 1, speedPenalty: 0, resist: [], saveAdvantage: { dex: [] }, skillBonus: {}, chips: [] };
    items.forEach((item) => {
      if (item.preset === "haste-boots" && item.worn && attunementOk(item) && item.active) {
        out.acBonus += 2;
        out.extraAttacks += 1;
        out.speedMultiplier *= 2;
        out.saveAdvantage.dex.push("Haste");
        out.chips.push({ source: item.name, text: "Haste is on: +2 AC, Speed doubled, Advantage on Dexterity saves, and one extra action each turn (one weapon attack, Dash, Disengage, Hide or Utilize)." });
      }
      if (item.preset === "colossus" && item.worn) {
        const stage = stageFor(item.days);
        const penalty = stage === 1 ? 10 : stage === 2 ? 5 : 0;
        out.speedPenalty += penalty;
        if (stage === 1) {
          out.chips.push({ source: item.name, text: "Colossus stage 1 (The Burden): Disadvantage on attacks with it and Speed -10 ft." });
        } else if (penalty) {
          out.chips.push({ source: item.name, text: `Colossus stage ${stage} (${COLOSSUS_STAGES[stage - 1].name}): Speed -${penalty} ft while wielding.` });
        }
        if (Number.isFinite(ctx.str) && ctx.str < 20) {
          out.chips.push({ source: item.name, text: "Your Strength is under 20, so you cannot lift the Colossus Greatsword effectively." });
        }
      }
      if (item.preset === "festus" && item.attuned) {
        out.resist.push({ type: "fire", source: item.name });
        out.chips.push({ source: item.name, text: "Resistance to fire damage while attuned." });
      }
      if (item.preset === "riverstone" && item.worn) {
        out.skillBonus.deception = (out.skillBonus.deception || 0) + 1;
        out.skillBonus.persuasion = (out.skillBonus.persuasion || 0) + 1;
        out.chips.push({ source: item.name, text: "+1 to Deception and Persuasion checks." });
      }
    });
    return out;
  }

  // Battle weapon stats that come from an item (matched by weapon name). Returns the weapon unchanged if none match.
  function weaponWithItem(weapon, items) {
    const item = items.find((i) => i.preset && PRESETS[i.preset].weaponMatch && PRESETS[i.preset].weaponMatch.test(weapon.name || ""));
    if (!item) {
      return weapon;
    }
    if (item.preset === "colossus") {
      const stage = stageFor(item.days);
      return {
        ...weapon,
        dice: stage >= 4 ? "4d6" : "2d8",
        type: "slashing",
        versatile: "",
        extraDice: "",
        extraType: "",
        versatileExtra: "",
        heavy: true,
        magic: attunementOk(item) ? 1 : 0,
        disadvantage: stage === 1 ? "Colossus Greatsword stage 1 (The Burden)" : "",
        fromItem: item.name,
        itemId: item.id
      };
    }
    if (item.preset === "festus") {
      return { ...weapon, dice: "1d10", type: "bludgeoning", versatile: "1d12", extraDice: "1d4", versatileExtra: "1d6", extraType: "fire", magic: 0, disadvantage: "", fromItem: item.name, itemId: item.id };
    }
    return weapon;
  }

  const pure = { MAX_ATTUNED, PRESETS, PRESET_ORDER, COLOSSUS_STAGES, stageFor, sanitizeItem, sanitizeUse, makeFromPreset, attunedCount, attunementOk, afterRest, computeEffects, weaponWithItem };

  // ---- browser UI ----

  if (typeof document === "undefined") {
    return pure;
  }

  const state = { items: [], editing: new Set(), open: new Set(), ready: false, notice: "" };
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

  const strScore = () => Number($("str") && $("str").value) || 10;
  // Item effects plus class feature and condition effects (see Features), so the sheet reads one set of numbers.
  const effects = () => {
    const base = computeEffects(state.items, { str: strScore() });
    return typeof Features !== "undefined" && Features.ready() ? Features.combine(base) : base;
  };
  const itemById = (id) => state.items.find((i) => i.id === id);
  const stageOf = (item) => (item.preset === "colossus" ? stageFor(item.days) : 0);
  const locked = (item, use) => Boolean(use.minStage && stageOf(item) < use.minStage);

  function changed({ rerender = true } = {}) {
    if (typeof scheduleSave === "function") {
      scheduleSave();
    }
    if (rerender) {
      render();
    }
    if (typeof updateDerived === "function") {
      updateDerived({ skipClamp: true });
    }
  }

  function say(message) {
    state.notice = message;
    const status = $("itemsNotice");
    if (status) {
      status.textContent = message;
    }
  }

  // Plain text with "- bullets" and "**bold**", built from text nodes only.
  function renderText(container, source) {
    container.textContent = "";
    let list = null;
    String(source).split("\n").forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        list = null;
        return;
      }
      const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
      const target = bullet ? el("li") : el("p");
      (bullet ? bullet[1] : trimmed).split(/(\*\*[^*\n]+\*\*)/).forEach((part) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          target.append(el("strong", { text: part.slice(2, -2) }));
        } else if (part) {
          target.append(document.createTextNode(part));
        }
      });
      if (bullet) {
        if (!list) {
          list = el("ul");
          container.append(list);
        }
        list.append(target);
      } else {
        list = null;
        container.append(target);
      }
    });
  }

  function useRow(item, use, compact) {
    const left = use.max - use.used;
    const isLocked = locked(item, use);
    const isHaste = item.preset === "haste-boots" && use.key === "haste";
    const row = el("div", { class: `item-use${isLocked ? " is-locked" : ""}` });
    row.append(
      el("span", { class: "item-use-label" }, el("strong", { text: use.label }), " ", el("span", { class: "muted", text: isLocked ? `locked until stage ${use.minStage}` : `${left} of ${use.max} left` }))
    );
    const buttons = el("span", { class: "item-use-buttons" });
    if (isHaste) {
      if (item.active) {
        buttons.append(el("button", { type: "button", class: "chip-btn primary", "data-act": "haste-end", "data-id": item.id, text: "End Haste" }));
      } else {
        buttons.append(
          el("button", { type: "button", class: "chip-btn primary", "data-act": "haste-start", "data-id": item.id, disabled: left < 1 || !item.worn || !attunementOk(item), title: !item.worn ? "Put the boots on first" : !attunementOk(item) ? "Attune to the boots first" : "Bonus action: cast Haste on yourself", text: "Activate Haste" })
        );
      }
    } else {
      buttons.append(el("button", { type: "button", class: "chip-btn", "data-act": "use", "data-id": item.id, "data-key": use.key, disabled: left < 1 || isLocked, text: "Use" }));
    }
    if (use.used > 0 && !isHaste) {
      buttons.append(el("button", { type: "button", class: "chip-btn", "data-act": "undo-use", "data-id": item.id, "data-key": use.key, title: "Give one back", text: "Undo" }));
    }
    row.append(buttons);
    if (use.note && !compact) {
      row.append(el("span", { class: "item-use-note muted", text: use.note }));
    }
    return row;
  }

  function stageBlock(item) {
    const stage = stageFor(item.days);
    const info = COLOSSUS_STAGES[stage - 1];
    const next = COLOSSUS_STAGES[stage];
    return el(
      "div",
      { class: "item-stage" },
      el(
        "div",
        { class: "item-stage-head" },
        el("strong", { text: `Training stage ${stage}: ${info.name}` }),
        el("label", { class: "item-days" }, el("span", { text: "Days trained" }), el("input", { type: "number", min: "0", max: "999", inputmode: "numeric", value: String(item.days), "data-field": "days", "data-id": item.id })),
        el("button", { type: "button", class: "chip-btn", "data-act": "train", "data-id": item.id, text: "Log a training day" })
      ),
      el("p", { class: "muted", text: info.text }),
      next ? el("p", { class: "muted", text: `Next: stage ${next.stage}, ${next.name}, at ${next.from} days (${next.from - item.days} more).` }) : null
    );
  }

  function editBlock(item) {
    const preset = item.preset ? PRESETS[item.preset] : null;
    return el(
      "div",
      { class: "item-edit" },
      el("label", { class: "field" }, el("span", { text: "Name" }), el("input", { type: "text", maxlength: "80", value: item.name, "data-field": "name", "data-id": item.id })),
      el("label", { class: "field" }, el("span", { text: "Type" }), el("input", { type: "text", maxlength: "120", value: item.kind, "data-field": "kind", "data-id": item.id })),
      el("label", { class: "check-inline" }, el("input", { type: "checkbox", checked: item.requiresAttunement, "data-field": "requiresAttunement", "data-id": item.id }), " Requires attunement"),
      el("label", { class: "field" }, el("span", { text: "Description" }), (() => {
        const area = el("textarea", { rows: "7", maxlength: "4000", "data-field": "notes", "data-id": item.id });
        area.value = item.notes;
        return area;
      })()),
      el("div", { class: "item-edit-uses" }, item.uses.map((use, index) => el(
        "div",
        { class: "item-edit-use" },
        el("input", { type: "text", maxlength: "60", value: use.label, "aria-label": "Counter name", "data-field": "use-label", "data-id": item.id, "data-index": String(index) }),
        el("input", { type: "number", min: "1", max: "20", value: String(use.max), "aria-label": "Maximum uses", "data-field": "use-max", "data-id": item.id, "data-index": String(index) }),
        el("select", { "aria-label": "Recharges on", "data-field": "use-recharge", "data-id": item.id, "data-index": String(index) },
          el("option", { value: "long", selected: use.recharge === "long", text: "Long rest" }),
          el("option", { value: "short", selected: use.recharge === "short", text: "Short rest" })),
        el("button", { type: "button", class: "chip-btn", "data-act": "remove-use", "data-id": item.id, "data-index": String(index), text: "Remove" })
      ))),
      el("div", { class: "item-edit-actions" },
        el("button", { type: "button", class: "chip-btn", "data-act": "add-use", "data-id": item.id, text: "Add a counter" }),
        preset ? el("button", { type: "button", class: "chip-btn", "data-act": "restore", "data-id": item.id, title: "Put this item back to what your object sheet says", text: "Restore from object sheet" }) : null,
        el("button", { type: "button", class: "chip-btn danger", "data-act": "delete", "data-id": item.id, text: "Delete item" }))
    );
  }

  function itemCard(item, compact) {
    const preset = item.preset ? PRESETS[item.preset] : null;
    const wornLabel = (preset && preset.wornLabel) || "Carrying";
    const atLimit = attunedCount(state.items) >= MAX_ATTUNED && !item.attuned;
    const className = `item-card${item.worn ? " is-worn" : ""}${compact ? " is-compact" : ""}`;
    const card = compact ? el("article", { class: className, "data-id": item.id }) : el("details", { class: className, "data-id": item.id, open: !item.collapsed });
    const status = [item.worn ? wornLabel : "", item.attuned ? "Attuned" : "", item.active ? "Haste on" : "", item.preset === "colossus" ? `Stage ${stageFor(item.days)}` : ""].filter(Boolean).join(" · ");
    const head = [el("h3", { text: item.name }), compact ? null : el("span", { class: "muted item-kind", text: item.kind }), compact ? null : el("span", { class: "item-status", text: status })];
    if (compact) {
      card.append(el("header", { class: "item-head" }, head));
    } else {
      card.append(el("summary", { class: "item-head" }, head));
      card.addEventListener("toggle", () => {
        const collapsed = !card.open;
        if (item.collapsed !== collapsed) {
          item.collapsed = collapsed;
          if (typeof scheduleSave === "function") {
            scheduleSave();
          }
        }
      });
    }
    const toggles = el("div", { class: "item-toggles" });
    toggles.append(
      el("label", { class: "check-inline" }, el("input", { type: "checkbox", checked: item.worn, "data-act": "worn", "data-id": item.id }), ` ${wornLabel}`)
    );
    if (item.requiresAttunement) {
      toggles.append(
        el("label", { class: "check-inline", title: atLimit ? `You can attune to ${MAX_ATTUNED} items at once. Un-attune another first.` : "" },
          el("input", { type: "checkbox", checked: item.attuned, disabled: atLimit, "data-act": "attuned", "data-id": item.id }), " Attuned")
      );
    }
    card.append(toggles);
    if (item.preset === "colossus" && !compact) {
      card.append(stageBlock(item));
    }
    if (item.preset === "colossus" && compact) {
      card.append(el("p", { class: "muted item-stage-line", text: `Training stage ${stageFor(item.days)}: ${COLOSSUS_STAGES[stageFor(item.days) - 1].name}` }));
    }
    item.uses.forEach((use) => card.append(useRow(item, use, compact)));
    if (compact) {
      return card;
    }
    const detail = el("details", { class: "item-details", open: state.open.has(item.id) }, el("summary", { text: "Description" }));
    detail.addEventListener("toggle", () => (detail.open ? state.open.add(item.id) : state.open.delete(item.id)));
    const body = el("div", { class: "item-notes" });
    renderText(body, item.notes);
    detail.append(body);
    card.append(detail);
    const editing = state.editing.has(item.id);
    card.append(el("div", { class: "item-foot" }, el("button", { type: "button", class: "chip-btn", "data-act": "edit", "data-id": item.id, "aria-pressed": String(editing), text: editing ? "Done editing" : "Edit" })));
    if (editing) {
      card.append(editBlock(item));
    }
    return card;
  }

  function renderChips(target) {
    target.textContent = "";
    const chips = effects().chips;
    target.hidden = !chips.length;
    chips.forEach((chip) => target.append(el("p", { class: "item-chip" }, el("strong", { text: `${chip.source}: ` }), chip.text)));
  }

  function renderSummary() {
    const count = attunedCount(state.items);
    $("itemsAttuned").textContent = `Attuned to ${count} of ${MAX_ATTUNED}`;
    const missing = PRESET_ORDER.filter((key) => !state.items.some((i) => i.preset === key));
    const addBtn = $("itemsAddMine");
    addBtn.hidden = !missing.length;
    addBtn.textContent = missing.length === PRESET_ORDER.length ? "Add my objects" : `Add ${missing.length} missing object${missing.length === 1 ? "" : "s"}`;
  }

  function render() {
    if (!state.ready) {
      return;
    }
    renderSummary();
    const list = $("itemsList");
    list.textContent = "";
    if (!state.items.length) {
      list.append(el("p", { class: "muted", text: "No items yet. Choose Add my objects to add everything from your object sheet, or Add item for something else." }));
    }
    state.items.forEach((item) => list.append(itemCard(item, false)));
    renderChips($("itemsChips"));
    const quick = $("btItems");
    const quickPanel = $("btItemsPanel");
    if (quick) {
      quick.textContent = "";
      const useful = state.items.filter((i) => i.uses.length || i.requiresAttunement || (i.preset && PRESETS[i.preset].wornLabel === "Wielding"));
      quickPanel.hidden = !useful.length;
      useful.forEach((item) => quick.append(itemCard(item, true)));
      renderChips($("btItemChips"));
    }
    $("itemsNotice").textContent = state.notice;
  }

  // ---- actions ----

  function addPresets() {
    const missing = PRESET_ORDER.filter((key) => !state.items.some((i) => i.preset === key));
    missing.forEach((key) => {
      if (state.items.length < MAX_ITEMS) {
        state.items.push(makeFromPreset(key));
      }
    });
    say(missing.length ? `Added ${missing.length} object${missing.length === 1 ? "" : "s"} from your object sheet. Tick Attuned and Wielding or Wearing for the ones you use.` : "");
    changed();
  }

  function handleAction(act, id, target) {
    const item = itemById(id);
    if (!item) {
      return;
    }
    const use = (key) => item.uses.find((u) => u.key === key);
    if (act === "worn") {
      item.worn = target.checked;
      if (!item.worn && item.preset === "haste-boots") {
        item.active = false;
      }
    } else if (act === "attuned") {
      if (target.checked && attunedCount(state.items) >= MAX_ATTUNED) {
        target.checked = false;
        say(`You can attune to ${MAX_ATTUNED} items at once.`);
        return;
      }
      item.attuned = target.checked;
      if (!item.attuned && item.preset === "haste-boots") {
        item.active = false;
      }
    } else if (act === "use") {
      const u = use(target.dataset.key);
      if (u && u.used < u.max && !locked(item, u)) {
        u.used += 1;
        say(`${item.name}: used ${u.label}.`);
      }
    } else if (act === "undo-use") {
      const u = use(target.dataset.key);
      if (u && u.used > 0) {
        u.used -= 1;
        say(`${item.name}: gave back one use of ${u.label}.`);
      }
    } else if (act === "haste-start") {
      const u = use("haste");
      if (u && u.used < u.max) {
        u.used += 1;
        item.active = true;
        say("Haste is on. Your AC, Speed and Dexterity saves are updated. Use End Haste after 1 minute.");
      }
    } else if (act === "haste-end") {
      item.active = false;
      say("Haste ended.");
    } else if (act === "train") {
      item.days = Math.min(999, item.days + 1);
      const stage = stageFor(item.days);
      say(`Colossus Greatsword: ${item.days} days trained, stage ${stage} (${COLOSSUS_STAGES[stage - 1].name}).`);
    } else if (act === "edit") {
      state.editing.has(id) ? state.editing.delete(id) : state.editing.add(id);
    } else if (act === "add-use") {
      if (item.uses.length < 8) {
        item.uses.push(sanitizeUse({ label: "New counter", max: 1 }));
      }
    } else if (act === "remove-use") {
      item.uses.splice(Number(target.dataset.index), 1);
    } else if (act === "restore") {
      if (confirm(`Put "${item.name}" back to what your object sheet says? Your edits to its text and counters will be replaced.`)) {
        const fresh = makeFromPreset(item.preset);
        Object.assign(item, { ...fresh, id: item.id, worn: item.worn, attuned: item.attuned, days: item.days });
      }
    } else if (act === "delete") {
      if (confirm(`Delete "${item.name}"? This cannot be undone.`)) {
        state.items = state.items.filter((i) => i.id !== id);
        state.editing.delete(id);
        say("Item deleted.");
      }
    }
    changed();
  }

  function handleField(target) {
    const item = itemById(target.dataset.id);
    if (!item) {
      return;
    }
    const field = target.dataset.field;
    if (field === "name") {
      item.name = text(target.value, 80) || "New item";
    } else if (field === "kind") {
      item.kind = text(target.value, 120);
    } else if (field === "notes") {
      item.notes = text(target.value, 4000);
    } else if (field === "requiresAttunement") {
      item.requiresAttunement = target.checked;
      if (!target.checked) {
        item.attuned = false;
      }
    } else if (field === "days") {
      item.days = whole(target.value, 0, 999, 0);
    } else if (field.startsWith("use-")) {
      const use = item.uses[Number(target.dataset.index)];
      if (use) {
        if (field === "use-label") {
          use.label = text(target.value, 60) || "Uses";
        } else if (field === "use-max") {
          use.max = whole(target.value, 1, 20, 1);
          use.used = Math.min(use.used, use.max);
        } else {
          use.recharge = target.value === "short" ? "short" : "long";
        }
      }
    }
  }

  function bind() {
    const click = (event) => {
      const target = event.target.closest("[data-act]");
      if (!target || target.tagName === "INPUT") {
        return;
      }
      handleAction(target.dataset.act, target.dataset.id, target);
    };
    const change = (event) => {
      const target = event.target;
      if (target.dataset.act && target.tagName === "INPUT") {
        handleAction(target.dataset.act, target.dataset.id, target);
      } else if (target.dataset.field) {
        handleField(target);
        // Text typing saves quietly; changes that alter the layout redraw.
        const redraw = ["days", "requiresAttunement", "use-max", "use-recharge", "use-label", "name"].includes(target.dataset.field);
        changed({ rerender: redraw });
      }
    };
    [$("itemsList"), $("btItems")].forEach((box) => {
      if (box) {
        box.addEventListener("click", click);
        box.addEventListener("change", change);
      }
    });
    $("itemsList").addEventListener("input", (event) => {
      if (event.target.dataset.field === "notes" || event.target.dataset.field === "kind") {
        handleField(event.target);
        changed({ rerender: false });
      }
    });
    $("itemsAddMine").addEventListener("click", addPresets);
    $("itemsAddCustom").addEventListener("click", () => {
      if (state.items.length >= MAX_ITEMS) {
        say(`That is the maximum of ${MAX_ITEMS} items.`);
        return;
      }
      const item = sanitizeItem({ name: "New item", worn: true });
      state.items.push(item);
      state.editing.add(item.id);
      changed();
    });
    $("itemsShortRest").addEventListener("click", () => $("rageShortRestBtn").click());
    $("itemsLongRest").addEventListener("click", () => $("rageLongRestBtn").click());
  }

  // ---- hooks used by app.js and battle.js ----

  function collect() {
    return state.items.map((item) => ({ ...item, uses: item.uses.map((u) => ({ ...u })) }));
  }

  function apply(data) {
    state.items = (Array.isArray(data) ? data : []).filter((i) => i && typeof i === "object").slice(0, MAX_ITEMS).map(sanitizeItem);
    state.editing.clear();
    state.notice = "";
    render();
  }

  function reset() {
    apply([]);
  }

  function rest(kind) {
    state.items = afterRest(state.items, kind);
    render();
  }

  function init() {
    state.ready = true;
    bind();
    render();
  }

  return {
    ...pure,
    init,
    collect,
    apply,
    reset,
    shortRest: () => rest("short"),
    longRest: () => rest("long"),
    effects,
    refresh: render,
    weapon: (weapon) => weaponWithItem(weapon, state.items),
    has: (preset) => state.items.some((i) => i.preset === preset)
  };
})();

// Class and species features (Stone's Endurance, Large Form, Aspect of the Wild, Feral Instinct, Brutal Strike) and
// conditions with Exhaustion. They only switch on when the Level, Class and Race fields say they apply, so nothing
// changes until the sheet has levelled up. The pure rules are at the top so they can be tested in Node.
const Features = (() => {
  const MAX_EXHAUSTION = 6;

  const ASPECTS = [
    { key: "owl", label: "Owl", text: "Darkvision out to 60 feet (or 60 feet more if you already have Darkvision)." },
    { key: "panther", label: "Panther", text: "You have a Climb Speed equal to your Speed." },
    { key: "salmon", label: "Salmon", text: "You have a Swim Speed equal to your Speed." }
  ];

  // The 2024 conditions. Flags say what each one does to your own rolls; "text" is the reminder shown on the sheet.
  const CONDITIONS = [
    { key: "blinded", label: "Blinded", attackDis: true, text: "You can't see and automatically fail checks that need sight. Attack rolls against you have Advantage." },
    { key: "charmed", label: "Charmed", text: "You can't attack the charmer or target them with damaging abilities. They have Advantage on social checks against you." },
    { key: "deafened", label: "Deafened", text: "You can't hear and automatically fail checks that need hearing." },
    { key: "frightened", label: "Frightened", attackDis: true, checkDis: true, text: "Disadvantage on attack rolls and ability checks while the source of fear is in line of sight. You can't willingly move closer to it." },
    { key: "grappled", label: "Grappled", speedZero: true, text: "Speed 0. Disadvantage on attack rolls against anyone other than the grappler." },
    { key: "incapacitated", label: "Incapacitated", incapacitated: true, initDis: true, text: "No actions, bonus actions or reactions. Concentration is broken. Danger Sense and your Rage stop working." },
    { key: "invisible", label: "Invisible", attackAdv: true, initAdv: true, text: "Advantage on attack rolls and on Initiative. Attack rolls against you have Disadvantage." },
    { key: "paralyzed", label: "Paralyzed", incapacitated: true, speedZero: true, autoFail: true, text: "Incapacitated, Speed 0, you automatically fail Strength and Dexterity saves. Attacks against you have Advantage, and hits from within 5 feet are critical hits." },
    { key: "petrified", label: "Petrified", incapacitated: true, speedZero: true, autoFail: true, text: "Turned to stone: Incapacitated, Speed 0, you automatically fail Strength and Dexterity saves. Attacks against you have Advantage." },
    { key: "poisoned", label: "Poisoned", attackDis: true, checkDis: true, text: "Disadvantage on attack rolls and ability checks." },
    { key: "prone", label: "Prone", attackDis: true, text: "Disadvantage on your attack rolls. You can crawl, or spend half your Speed to stand. Attacks against you from within 5 feet have Advantage, from farther away Disadvantage." },
    { key: "restrained", label: "Restrained", speedZero: true, attackDis: true, dexSaveDis: true, text: "Speed 0. Disadvantage on your attack rolls and Dexterity saves. Attack rolls against you have Advantage." },
    { key: "stunned", label: "Stunned", incapacitated: true, autoFail: true, text: "Incapacitated. You automatically fail Strength and Dexterity saves. Attacks against you have Advantage." },
    { key: "unconscious", label: "Unconscious", incapacitated: true, speedZero: true, autoFail: true, text: "Incapacitated and Prone, Speed 0, you automatically fail Strength and Dexterity saves. Attacks against you have Advantage, and hits from within 5 feet are critical hits." }
  ];

  const clampInt = (value, min, max) => Math.min(max, Math.max(min, Math.floor(Number(value)) || min));

  function sanitizeFeatures(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const known = new Set(CONDITIONS.map((c) => c.key));
    const conditions = (Array.isArray(src.conditions) ? src.conditions : []).filter((key, i, all) => known.has(key) && all.indexOf(key) === i);
    return {
      stonesUsed: clampInt(src.stonesUsed, 0, 20),
      largeFormUsed: Boolean(src.largeFormUsed),
      largeFormActive: Boolean(src.largeFormActive),
      aspect: ASPECTS.some((a) => a.key === src.aspect) ? src.aspect : "",
      conditions,
      exhaustion: clampInt(src.exhaustion, 0, MAX_EXHAUSTION)
    };
  }

  // A long rest refills the daily features and removes one level of Exhaustion. A short rest changes nothing here.
  function afterRest(feat, kind) {
    if (kind !== "long") {
      return feat;
    }
    return { ...feat, stonesUsed: 0, largeFormUsed: false, largeFormActive: false, exhaustion: Math.max(0, feat.exhaustion - 1) };
  }

  // What the active conditions and Exhaustion do to the character's own rolls.
  function conditionEffects(keys = [], exhaustion = 0) {
    const out = { attackAdv: [], attackDis: [], checkDis: [], dexSaveDis: [], autoFail: [], speedZero: [], incapacitated: [], initAdv: [], initDis: [], d20Penalty: 0, speedPenalty: 0, notes: [] };
    const active = new Set(keys);
    CONDITIONS.forEach((c) => {
      if (!active.has(c.key)) {
        return;
      }
      out.notes.push({ source: c.label, text: c.text });
      [["attackAdv", "attackAdv"], ["attackDis", "attackDis"], ["checkDis", "checkDis"], ["dexSaveDis", "dexSaveDis"], ["autoFail", "autoFail"], ["speedZero", "speedZero"], ["incapacitated", "incapacitated"], ["initAdv", "initAdv"], ["initDis", "initDis"]].forEach(([flag, list]) => {
        if (c[flag]) {
          out[list].push(c.label);
        }
      });
    });
    const level = clampInt(exhaustion, 0, MAX_EXHAUSTION);
    if (level) {
      out.d20Penalty = -2 * level;
      out.speedPenalty = 5 * level;
      out.notes.push({ source: `Exhaustion ${level}`, text: `Every d20 roll is reduced by ${2 * level} and your Speed is ${5 * level} ft lower.${level >= MAX_EXHAUSTION ? " At level 6 you die." : ""}` });
    }
    return out;
  }

  // What the class and species features are doing right now. ctx: { level, barbarian, goliath, raging }.
  function featureEffects(feat, ctx) {
    const out = { speedBonus: 0, strCheckAdvantage: [], initiativeAdvantage: [], notes: [] };
    if (ctx.goliath && ctx.level >= 5 && feat.largeFormActive) {
      out.speedBonus += 10;
      out.strCheckAdvantage.push("Large Form");
      out.notes.push({ source: "Large Form", text: "You are Large: Speed +10 ft and Advantage on Strength checks. It lasts 10 minutes or until you end it." });
    }
    const aspect = ASPECTS.find((a) => a.key === feat.aspect);
    if (ctx.barbarian && ctx.level >= 6 && aspect) {
      out.notes.push({ source: `Aspect of the Wild: ${aspect.label}`, text: aspect.text });
    }
    if (ctx.barbarian && ctx.level >= 7) {
      out.initiativeAdvantage.push("Feral Instinct");
    }
    return out;
  }

  // Adds the feature and condition effects to what the magic items already do. The result is what the sheet uses.
  function combine(base, feat, ctx) {
    const f = featureEffects(feat, ctx);
    const c = conditionEffects(feat.conditions, feat.exhaustion);
    const failList = c.autoFail;
    return {
      ...base,
      speedBonus: f.speedBonus,
      speedPenalty: base.speedPenalty + c.speedPenalty,
      speedZero: c.speedZero.length > 0,
      checkAdvantage: { str: f.strCheckAdvantage },
      checkDisadvantage: c.checkDis,
      saveDisadvantage: { dex: c.dexSaveDis },
      autoFailSaves: { str: failList, dex: failList },
      attackAdvantage: c.attackAdv,
      attackDisadvantage: c.attackDis,
      d20Penalty: c.d20Penalty,
      initiativeAdvantage: [...f.initiativeAdvantage, ...c.initAdv],
      initiativeDisadvantage: c.initDis,
      incapacitated: c.incapacitated,
      featureNotes: f.notes,
      conditionNotes: c.notes
    };
  }

  const pure = { MAX_EXHAUSTION, ASPECTS, CONDITIONS, sanitizeFeatures, afterRest, conditionEffects, featureEffects, combine };

  // ---- browser UI ----

  if (typeof document === "undefined") {
    return pure;
  }

  const state = { feat: sanitizeFeatures({}), ready: false };
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

  function context() {
    const level = Number($("level").value) || 1;
    return {
      level,
      barbarian: /barbarian/i.test($("class").value),
      goliath: /goliath/i.test($("race").value),
      raging: $("isRaging").checked,
      prof: profByLevel(level),
      conMod: getModifier($("con").value)
    };
  }

  function say(message, type = "status-ok") {
    if (typeof setStatus === "function") {
      setStatus(message, type);
    }
  }

  function changed() {
    if (typeof scheduleSave === "function") {
      scheduleSave();
    }
    render();
    if (typeof updateDerived === "function") {
      updateDerived({ skipClamp: true });
    }
  }

  function passive(title, text) {
    return el("div", { class: "feature-card" }, el("div", { class: "feature-head" }, el("strong", { text: title })), el("p", { class: "muted", text }));
  }

  function buildCards(ctx, compact) {
    const cards = [];
    const feat = state.feat;
    if (ctx.goliath) {
      const left = Math.max(0, ctx.prof - feat.stonesUsed);
      cards.push(
        el(
          "div",
          { class: "feature-card" },
          el("div", { class: "feature-head" }, el("strong", { text: "Stone's Endurance" }), el("span", { class: "muted", text: `${left} of ${ctx.prof} left` })),
          compact ? null : el("p", { class: "muted", text: `Reaction when you take damage: roll 1d12 + ${ctx.conMod} (your Constitution modifier) and reduce the damage by that total. Uses come back on a long rest.` }),
          el(
            "div",
            { class: "feature-actions" },
            el("button", { type: "button", class: "chip-btn", "data-feature": "stones-use", disabled: left < 1 }, "Use"),
            feat.stonesUsed > 0 ? el("button", { type: "button", class: "chip-btn", "data-feature": "stones-undo" }, "Undo") : null,
            compact ? el("span", { class: "muted", text: `d12 + ${ctx.conMod}` }) : null
          )
        )
      );
    }
    if (ctx.goliath && ctx.level >= 5) {
      const status = feat.largeFormActive ? "Active" : feat.largeFormUsed ? "Used" : "Ready";
      cards.push(
        el(
          "div",
          { class: "feature-card" },
          el("div", { class: "feature-head" }, el("strong", { text: "Large Form" }), el("span", { class: feat.largeFormActive ? "feature-on" : "muted", text: status })),
          compact ? null : el("p", { class: "muted", text: "Bonus action: become Large for 10 minutes. Advantage on Strength checks and +10 ft Speed. Once per long rest." }),
          el(
            "div",
            { class: "feature-actions" },
            !feat.largeFormUsed ? el("button", { type: "button", class: "chip-btn", "data-feature": "large-use" }, "Use (bonus action)") : null,
            feat.largeFormActive ? el("button", { type: "button", class: "chip-btn", "data-feature": "large-end" }, "End Large Form") : null,
            feat.largeFormUsed && !feat.largeFormActive ? el("span", { class: "muted", text: "Back after a long rest." }) : null
          )
        )
      );
    }
    if (ctx.barbarian && ctx.level >= 6) {
      const select = el("select", { "data-feature": "aspect", "aria-label": "Aspect of the Wild" }, el("option", { value: "", text: "Choose today's aspect" }));
      ASPECTS.forEach((a) => select.append(el("option", { value: a.key, text: a.label })));
      select.value = feat.aspect;
      const chosen = ASPECTS.find((a) => a.key === feat.aspect);
      cards.push(
        el(
          "div",
          { class: "feature-card" },
          el("div", { class: "feature-head" }, el("strong", { text: "Aspect of the Wild" }), select),
          el("p", { class: "muted", text: chosen ? chosen.text : "Pick one after each long rest: Owl, Panther or Salmon." })
        )
      );
    }
    if (ctx.barbarian && ctx.level >= 7 && !compact) {
      cards.push(passive("Feral Instinct", "Advantage on Initiative rolls."));
      cards.push(passive("Instinctive Pounce", "As part of the bonus action that starts your Rage, you can move up to half your Speed."));
    }
    if (ctx.barbarian && ctx.level >= 9 && !compact) {
      cards.push(passive("Brutal Strike", "Turn on Brutal Strike in the Battle tab after you choose Reckless Attack. You give up Advantage on one Strength attack for extra damage and an effect."));
    }
    return cards;
  }

  function renderNotes(target, notes) {
    target.textContent = "";
    target.hidden = !notes.length;
    notes.forEach((n) => target.append(el("p", { class: "item-chip" }, el("strong", { text: `${n.source}: ` }), n.text)));
  }

  function renderConditions() {
    const feat = state.feat;
    const toggles = $("condToggles");
    toggles.textContent = "";
    CONDITIONS.forEach((c) => {
      toggles.append(el("button", { type: "button", class: "cond-toggle", "data-cond": c.key, "aria-pressed": String(feat.conditions.includes(c.key)), title: c.text }, c.label));
    });
    $("condExhaustion").textContent = String(feat.exhaustion);
    $("condExhMinus").disabled = feat.exhaustion < 1;
    $("condExhPlus").disabled = feat.exhaustion >= MAX_EXHAUSTION;

    const active = $("condActive");
    active.textContent = "";
    CONDITIONS.filter((c) => feat.conditions.includes(c.key)).forEach((c) => {
      active.append(el("button", { type: "button", class: "cond-chip", "data-cond": c.key, title: `${c.text} Click to remove.` }, `${c.label} ×`));
    });
    if (feat.exhaustion) {
      active.append(el("button", { type: "button", class: "cond-chip", "data-cond": "exhaustion-minus", title: "Click to remove one level." }, `Exhaustion ${feat.exhaustion} ×`));
    }
    const any = feat.conditions.length > 0 || feat.exhaustion > 0;
    $("condStrip").classList.toggle("has-conditions", any);
  }

  function render() {
    if (!state.ready) {
      return;
    }
    const ctx = context();
    const fx = featureEffects(state.feat, ctx);
    const full = buildCards(ctx, false);
    const list = $("featuresList");
    list.textContent = "";
    if (full.length) {
      full.forEach((card) => list.append(card));
    } else {
      list.append(el("p", { class: "muted", text: "Class and species features appear here as your level, class and race fit them. Set Class to Barbarian and Race to Goliath under Details." }));
    }
    renderNotes($("featureNotes"), fx.notes);

    const compact = buildCards(ctx, true);
    const quick = $("btFeatures");
    quick.textContent = "";
    compact.forEach((card) => quick.append(card));
    $("btFeaturesPanel").hidden = !compact.length;
    renderNotes($("btFeatureNotes"), fx.notes);
    renderConditions();
  }

  function handleFeature(target) {
    const feat = state.feat;
    const ctx = context();
    const act = target.dataset.feature;
    if (act === "stones-use") {
      if (feat.stonesUsed < ctx.prof) {
        feat.stonesUsed += 1;
        const remaining = ctx.prof - feat.stonesUsed;
        say(`Stone's Endurance: roll 1d12 + ${ctx.conMod} and reduce the damage by that total. ${remaining} ${remaining === 1 ? "use" : "uses"} left.`);
      }
    } else if (act === "stones-undo") {
      feat.stonesUsed = Math.max(0, feat.stonesUsed - 1);
    } else if (act === "large-use") {
      feat.largeFormUsed = true;
      feat.largeFormActive = true;
      say("Large Form on: Speed +10 ft and Advantage on Strength checks for 10 minutes.");
    } else if (act === "large-end") {
      feat.largeFormActive = false;
      say("Large Form ended. It comes back after a long rest.");
    } else if (act === "aspect") {
      feat.aspect = ASPECTS.some((a) => a.key === target.value) ? target.value : "";
    } else {
      return;
    }
    changed();
  }

  function toggleCondition(key) {
    const feat = state.feat;
    if (key === "exhaustion-minus") {
      feat.exhaustion = Math.max(0, feat.exhaustion - 1);
    } else if (feat.conditions.includes(key)) {
      feat.conditions = feat.conditions.filter((k) => k !== key);
    } else {
      feat.conditions = [...feat.conditions, key];
      const cond = CONDITIONS.find((c) => c.key === key);
      if (cond && cond.incapacitated && $("isRaging").checked) {
        say(`${cond.label} means you can't take actions, so your Rage ends early. Turn Rage off if it is still on.`, "status-error");
      }
    }
    changed();
  }

  function bind() {
    ["featuresList", "btFeatures"].forEach((id) => {
      const box = $(id);
      box.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-feature]");
        if (button) {
          handleFeature(button);
        }
      });
      box.addEventListener("change", (event) => {
        if (event.target.matches("select[data-feature]")) {
          handleFeature(event.target);
        }
      });
    });
    $("condStrip").addEventListener("click", (event) => {
      const cond = event.target.closest("[data-cond]");
      if (cond) {
        toggleCondition(cond.dataset.cond);
      }
    });
    $("condExhMinus").addEventListener("click", () => {
      state.feat.exhaustion = Math.max(0, state.feat.exhaustion - 1);
      changed();
    });
    $("condExhPlus").addEventListener("click", () => {
      state.feat.exhaustion = Math.min(MAX_EXHAUSTION, state.feat.exhaustion + 1);
      if (state.feat.exhaustion >= MAX_EXHAUSTION) {
        say("Exhaustion level 6 means death.", "status-error");
      }
      changed();
    });
    // Level, Class and Race decide which features show.
    ["level", "class", "race", "isRaging", "con"].forEach((id) => {
      $(id).addEventListener("input", render);
      $(id).addEventListener("change", render);
    });
  }

  // ---- hooks used by app.js, items.js and battle.js ----

  function collect() {
    return { ...state.feat, conditions: [...state.feat.conditions] };
  }

  function apply(data) {
    state.feat = sanitizeFeatures(data);
    render();
  }

  function reset() {
    apply(null);
  }

  function rest(kind) {
    state.feat = afterRest(state.feat, kind);
    render();
  }

  function init() {
    state.ready = true;
    bind();
    render();
  }

  return {
    ...pure,
    init,
    collect,
    apply,
    reset,
    shortRest: () => rest("short"),
    longRest: () => rest("long"),
    refresh: render,
    ready: () => state.ready,
    // The magic item effects plus feature and condition effects, as the sheet and Battle tab use them.
    combine: (base) => combine(base, state.feat, context()),
    exhaustion: () => state.feat.exhaustion
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Items;
  module.exports.Features = Features;
}
