"use strict";

// Builds rules-data.js (the bundled rules search data) from the free SRD 5.2 (2024 rules) as published in the
// 5e-bits/5e-database project. Run:  node tools/build-rules.js [folder-with-downloaded-json-files]
// With no folder it downloads the files from GitHub. The SRD 5.2 is licensed CC-BY 4.0 by Wizards of the Coast.
const fs = require("fs");
const path = require("path");
const { parseGlossary } = require("./glossary.js");

const BASE = "https://raw.githubusercontent.com/5e-bits/5e-database/main/src/2024/en/";
const FILES = [
  "Ability-Scores", "Alignments", "Backgrounds", "Classes", "Conditions", "Damage-Types", "Equipment", "Feats",
  "Features", "Languages", "Levels", "Magic-Items", "Magic-Schools", "Monsters", "Poisons", "Skills", "Species",
  "Subclasses", "Subspecies", "Traits", "Weapon-Mastery-Properties", "Weapon-Properties", "Spells"
];

async function loadAll(folder) {
  const data = {};
  for (const name of FILES) {
    if (folder) {
      data[name] = JSON.parse(fs.readFileSync(path.join(folder, `5e-SRD-${name}.json`), "utf8"));
    } else {
      const response = await fetch(`${BASE}5e-SRD-${name}.json`);
      if (!response.ok) {
        throw new Error(`Could not download ${name}: ${response.status}`);
      }
      data[name] = await response.json();
    }
  }
  return data;
}

// The source text was copied from a PDF: words are sometimes split by "ex- pended" and paragraphs start with spaces.
function clean(text) {
  if (!text) {
    return "";
  }
  return String(text)
    .replace(/\u00ad/g, "")
    .replace(/\bHalfCover\b/g, "Half Cover")
    .replace(/([a-z])- (?!(?:and|or|to)\b)([a-z])/g, "$1$2")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .reduce((lines, line) => {
      // A line starting in lower case continues the previous one (the PDF wrapped it mid-sentence).
      if (lines.length && /^[a-z]/.test(line)) {
        lines[lines.length - 1] += ` ${line}`;
      } else {
        lines.push(line);
      }
      return lines;
    }, [])
    .join("\n");
}

function sign(n) {
  return n >= 0 ? `+${n}` : `−${Math.abs(n)}`;
}
function mod(score) {
  return Math.floor((score - 10) / 2);
}
function cap(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}
function ordinal(n) {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) {
    return `${n}th`;
  }
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"}`;
}
function crText(cr) {
  return { 0.125: "1/8", 0.25: "1/4", 0.5: "1/2" }[cr] || String(cr);
}
function thousands(n) {
  return Number(n).toLocaleString("en-US");
}

const entries = [];
function add(kind, name, sub, text, extra = "") {
  const body = clean(text);
  if (!name || !body) {
    return;
  }
  entries.push({ k: kind, n: name, s: sub || "", t: body, ...(extra ? { x: extra } : {}) });
}

function buildSpells(spells) {
  spells.forEach((spell) => {
    const level = spell.level === 0 ? `${spell.school.name} cantrip` : `${ordinal(spell.level)}-level ${spell.school.name}`;
    const comps = (spell.components || []).join(", ") + (spell.material ? ` (${spell.material})` : "");
    const lines = [
      `**Casting Time:** ${spell.casting_time}${spell.ritual ? " (or Ritual)" : ""}`,
      `**Range:** ${spell.range}`,
      `**Components:** ${comps}`,
      `**Duration:** ${spell.concentration ? "Concentration, " : ""}${spell.duration}`,
      spell.description,
      spell.higher_level ? `**Using a Higher-Level Spell Slot.** ${spell.higher_level}` : "",
      `**Classes:** ${(spell.classes || []).map((c) => c.name).join(", ")}`
    ];
    add("spell", spell.name, level, lines.filter(Boolean).join("\n"), (spell.classes || []).map((c) => c.name).join(" "));
  });
}

function monsterLines(monster) {
  const out = [];
  const speed = Object.entries(monster.speed || {}).map(([mode, value]) => (mode === "walk" ? value : `${mode} ${value}`)).join(", ");
  const ac = (monster.armor_class || []).map((a) => a.value).join(", ");
  out.push(`**AC** ${ac}   **HP** ${monster.hit_points}${monster.hit_points_roll ? ` (${monster.hit_points_roll})` : ""}   **Speed** ${speed}`);
  const stats = [["STR", "strength"], ["DEX", "dexterity"], ["CON", "constitution"], ["INT", "intelligence"], ["WIS", "wisdom"], ["CHA", "charisma"]];
  out.push(stats.map(([label, key]) => `**${label}** ${monster[key]} (${sign(mod(monster[key]))})`).join("   "));
  const saves = [];
  const skills = [];
  (monster.proficiencies || []).forEach((p) => {
    const label = p.proficiency.name.replace(/^(Saving Throw|Skill): /, "");
    (p.proficiency.name.startsWith("Saving Throw") ? saves : skills).push(`${label} ${sign(p.value)}`);
  });
  if (saves.length) {
    out.push(`**Saving Throws** ${saves.join(", ")}`);
  }
  if (skills.length) {
    out.push(`**Skills** ${skills.join(", ")}`);
  }
  const list = (label, values) => values && values.length && out.push(`**${label}** ${values.map(cap).join(", ")}`);
  list("Damage Vulnerabilities", monster.damage_vulnerabilities);
  list("Damage Resistances", monster.damage_resistances);
  list("Damage Immunities", monster.damage_immunities);
  list("Condition Immunities", (monster.condition_immunities || []).map((c) => (typeof c === "string" ? c : c.name)));
  const senses = Object.entries(monster.senses || {}).map(([key, value]) => `${key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} ${value}`).join(", ");
  if (senses) {
    out.push(`**Senses** ${senses}`);
  }
  if (monster.languages) {
    out.push(`**Languages** ${monster.languages}`);
  }
  out.push(`**CR** ${crText(monster.challenge_rating)} (XP ${thousands(monster.xp || 0)}${monster.xp_in_lair ? `, or ${thousands(monster.xp_in_lair)} in lair` : ""})   **PB** ${sign(monster.proficiency_bonus || 2)}`);
  const section = (title, items) => {
    if (items && items.length) {
      out.push(`## ${title}`);
      items.forEach((item) => {
        const usage = item.usage && item.usage.type === "per day" ? ` (${item.usage.times}/Day)` : "";
        out.push(`**${item.name}${usage}.** ${item.desc}`);
      });
    }
  };
  section("Traits", monster.special_abilities);
  section("Actions", monster.actions);
  section("Bonus Actions", monster.bonus_actions);
  section("Reactions", monster.reactions);
  section("Legendary Actions", monster.legendary_actions);
  return out;
}

function buildMonsters(monsters) {
  monsters.forEach((monster) => {
    const sub = `${monster.size} ${monster.type}, ${monster.alignment}; CR ${crText(monster.challenge_rating)}`;
    add("monster", monster.name, sub, monsterLines(monster).join("\n"), monster.type);
  });
}

function buildSimple(kind, list, subFn, textFn) {
  list.forEach((item) => add(kind, item.name, subFn ? subFn(item) : "", textFn ? textFn(item) : item.description));
}

function buildClasses(data) {
  const features = data.Features;
  const levels = data.Levels;
  data.Classes.forEach((cls) => {
    const lines = [];
    lines.push(`**Hit Point Die:** d${cls.hit_die}`);
    if (cls.primary_ability) {
      lines.push(`**Primary Ability:** ${cls.primary_ability.desc}`);
    }
    lines.push(`**Saving Throws:** ${(cls.saving_throws || []).map((s) => s.name).join(", ")}`);
    lines.push(`**Proficiencies:** ${(cls.proficiencies || []).map((p) => p.name).join(", ")}`);
    const rows = levels.filter((l) => l.class && l.class.index === cls.index && l.prof_bonus != null && !l.subclass).sort((a, b) => a.level - b.level);
    if (rows.length) {
      lines.push("## Features by level");
      rows.forEach((row) => {
        const names = (row.features || []).map((f) => f.name).join(", ");
        const extra = Object.entries(row.class_specific || {})
          .filter(([, value]) => typeof value === "number" || typeof value === "string")
          .map(([key, value]) => `${key.replace(/_/g, " ")} ${value}`)
          .join("; ");
        lines.push(`**Level ${row.level}** (proficiency ${sign(row.prof_bonus)}): ${names || "no new features"}${extra ? ` — ${extra}` : ""}`);
      });
    }
    const subclasses = (cls.subclasses || []).map((s) => s.name);
    if (subclasses.length) {
      lines.push(`**SRD subclass:** ${subclasses.join(", ")}`);
    }
    add("class", cls.name, `Class, d${cls.hit_die} hit die`, lines.join("\n"));
  });
  features.forEach((feature) => {
    const sub = `${feature.class ? feature.class.name : ""}${feature.level ? `, level ${feature.level.level || String(feature.level.name || "").replace(/\D+/g, "")}` : ""}`;
    add("feature", feature.name, sub.replace(/^, /, ""), feature.description, feature.class ? feature.class.name : "");
  });
  data.Subclasses.forEach((sub) => {
    const lines = [sub.description];
    (sub.features || []).forEach((f) => lines.push(`**${f.name}** (level ${f.level}). ${f.description}`));
    add("subclass", sub.name, `${sub.class ? sub.class.name : ""} subclass${sub.summary ? `: ${sub.summary}` : ""}`, lines.join("\n"), sub.class ? sub.class.name : "");
  });
}

function buildSpecies(data) {
  const traitText = (trait) => `**${trait.name}.** ${trait.description}`;
  const traits = new Map(data.Traits.map((t) => [t.index, t]));
  data.Species.forEach((species) => {
    const lines = [`**Creature Type:** ${species.type}   **Size:** ${species.size}   **Speed:** ${species.speed} ft.`];
    (species.traits || []).forEach((ref) => traits.has(ref.index) && lines.push(traitText(traits.get(ref.index))));
    if ((species.subspecies || []).length) {
      lines.push(`**Options:** ${species.subspecies.map((s) => s.name).join(", ")}`);
    }
    add("species", species.name, "Species", lines.join("\n"));
  });
  data.Subspecies.forEach((sub) => {
    const lines = [];
    (sub.traits || []).forEach((ref) => traits.has(ref.index) && lines.push(traitText(traits.get(ref.index))));
    add("species", sub.name, `Species option${sub.species ? `: ${sub.species.name}` : ""}`, lines.join("\n"));
  });
  data.Traits.forEach((trait) => add("trait", trait.name, `Species trait${(trait.species || []).length ? `: ${trait.species.map((s) => s.name).join(", ")}` : ""}`, trait.description));
}

function buildGear(data) {
  data.Equipment.forEach((item) => {
    const bits = [];
    if (item.cost) {
      bits.push(`${item.cost.quantity} ${item.cost.unit}`);
    }
    if (item.weight) {
      bits.push(`${item.weight} lb.`);
    }
    const category = (item.equipment_categories || []).map((c) => c.name).join(", ");
    add("gear", item.name, [category, ...bits].filter(Boolean).join("; "), item.description || `${item.name}. ${[category, ...bits].filter(Boolean).join("; ")}.`);
  });
  data["Magic-Items"].forEach((item) => {
    const bits = [item.equipment_category ? item.equipment_category.name : "", item.rarity ? item.rarity.name : ""];
    if (item.attunement) {
      bits.push("requires attunement");
    }
    add("magic-item", item.name, bits.filter(Boolean).join(", "), item.desc);
  });
  data.Poisons.forEach((poison) => add("gear", poison.name, `Poison, ${poison.type}; ${poison.cost ? `${poison.cost.quantity} ${poison.cost.unit}` : ""}`.replace(/; $/, ""), poison.description));
}

function sectionTitle(key) {
  // "srd-2024_d20-tests_ability-checks" -> "D20 Tests"
  const section = String(key).split("_")[1] || "";
  return section
    .split("-")
    .map((word) => (/^d\d+$/.test(word) ? word.toUpperCase() : cap(word)))
    .join(" ");
}

function buildRuleText(data) {
  const conditionNames = new Set(data.Conditions.map((c) => c.name.toLowerCase()));
  const glossary = parseGlossary(fs.readFileSync(path.join(__dirname, "source", "srd52-glossary.txt"), "utf8"));
  glossary.forEach((entry) => {
    if (entry.tag === "Condition" && conditionNames.has(entry.name.toLowerCase())) {
      return;
    }
    add("rule", entry.name, `Rules glossary${entry.tag ? `: ${entry.tag}` : ""}`, entry.text);
  });
  const sections = JSON.parse(fs.readFileSync(path.join(__dirname, "source", "open5e-rules.json"), "utf8"));
  sections.forEach((rule) => add("rule", rule.name, `Rules: ${sectionTitle(rule.key)}`, rule.desc));
}

function build(data) {
  buildSimple("condition", data.Conditions, () => "Condition");
  buildSimple("rule", data["Weapon-Mastery-Properties"], () => "Weapon mastery property");
  buildSimple("rule", data["Weapon-Properties"], () => "Weapon property");
  buildSimple("rule", data["Damage-Types"], () => "Damage type");
  buildSimple("rule", data["Ability-Scores"], (a) => `Ability score${a.full_name ? `: ${a.full_name}` : ""}`);
  buildSimple("rule", data.Skills, (s) => `Skill${s.ability_score ? ` (${s.ability_score.name})` : ""}`);
  buildSimple("rule", data.Alignments, () => "Alignment");
  buildSimple("rule", data["Magic-Schools"], () => "School of magic");
  buildSimple("rule", data.Languages, () => "Language", (l) => `${l.is_rare ? "Rare language. " : "Standard language. "}${l.note || ""}`);
  buildRuleText(data);
  buildSpells(data.Spells);
  buildMonsters(data.Monsters);
  buildClasses(data);
  buildSpecies(data);
  buildGear(data);
  buildSimple("feat", data.Feats, (f) => `${cap(f.type || "")} feat`.trim());
  data.Backgrounds.forEach((bg) => {
    const lines = [];
    if (bg.ability_scores && bg.ability_scores.length) {
      lines.push(`**Ability Scores:** ${bg.ability_scores.map((a) => a.name).join(", ")}`);
    }
    if (bg.feat) {
      lines.push(`**Feat:** ${bg.feat.name}`);
    }
    if (bg.proficiencies && bg.proficiencies.length) {
      lines.push(`**Proficiencies:** ${bg.proficiencies.map((p) => p.name).join(", ")}`);
    }
    add("background", bg.name, "Background", lines.join("\n"));
  });
  return entries;
}

async function main() {
  const folder = process.argv[2];
  const data = await loadAll(folder);
  const list = build(data);
  list.forEach((entry, index) => {
    entry.i = index;
  });
  const payload = {
    source: "SRD 5.2 (2024 rules)",
    built: new Date().toISOString().slice(0, 10),
    entries: list
  };
  const out = path.join(__dirname, "..", "rules-data.js");
  fs.writeFileSync(
    out,
    `"use strict";\n// Generated by tools/build-rules.js — do not edit by hand.\n` +
      `// This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC,\n` +
      `// available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under CC-BY-4.0.\n` +
      `window.SRD_DATA = ${JSON.stringify(payload)};\n`
  );
  const counts = {};
  list.forEach((e) => {
    counts[e.k] = (counts[e.k] || 0) + 1;
  });
  console.log(`Wrote ${list.length} entries (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`, counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
