# DnD Character Sheet (Local Web App)

A lightweight browser-based DnD character sheet that runs locally with no install required.

## What This Is

This project is a static web app (HTML/CSS/JavaScript):
- `index.html`
- `styles.css`
- `app.js`
- `items.js`
- `battle.js`
- `notes.js`
- `maps.js`
- `rules.js`
- `rules-data.js`
- `store.js`
- `tabs.js`
- `zip.js`

Anyone can use it by opening `index.html` in a browser.

## Quick Start (For Your Friends)

1. Download the project files.
2. Keep these 12 files in the same folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `items.js`
   - `battle.js`
   - `notes.js`
   - `maps.js`
   - `rules.js`
   - `rules-data.js`
   - `store.js`
   - `tabs.js`
   - `zip.js`
3. Open `index.html` in a browser (Chrome, Edge, Safari, Firefox).

No install, no server, no account needed.

## How Character Data Is Saved

Character data is saved in the browser on that device using `localStorage`.

What that means:
- Data stays on the device/browser they used.
- Different browsers on the same computer do not share data.
- Using private/incognito mode may not persist data.
- Clearing browser site data/cache may remove saved characters.

## Export / Import JSON (Important)

Use `Export JSON` and `Import JSON` to move or back up characters.

### When to Export JSON

Export before any of these:
- Switching to a different computer
- Switching browsers
- Clearing browser cache/data
- Major app updates (good backup habit)
- Sharing a character build with someone else

### When to Import JSON

Import when:
- Restoring a backup
- Moving your character to another device/browser
- Loading a character a friend shared with you

### Backup reminder and saved copies

- A strip under the top bar reminds you to export when you have never exported, or the last export is a week old. **Export now** downloads the file; **Remind me later** hides it for two days. Notes and maps have their own Export on their tabs.
- The sheet also keeps up to five automatic copies in the browser (at most one every six hours, plus one before a Reset or an Import). **File, Restore a saved copy** puts one back. These protect against mistakes, not against the browser clearing its site data, so an exported file is still the safe copy.
- The sheet asks the browser to protect its stored data from automatic clean-up. The browser may refuse.

### Recommended Backup Habit

- Click `Save` during play
- Click `Export JSON` at the end of a session
- Keep backups in a folder (for example: `Character Backups/`)

## Features Included

- Pinned vitals bar (HP with a meter, AC, initiative, speed, rages left) that stays visible while you scroll
- Large ability modifiers, passive senses, saves, and skills on one screen
- Barbarian Rage tracking (2024 rules behavior shown in UI), including rages left per long rest; raging lights up the key numbers
- HP damage/heal/full reset controls; temp HP absorbs damage first
- Death saves tracker that appears at 0 HP (clears when you heal)
- Initiative calculated from DEX plus an editable bonus
- CP/SP/EP/GP/PP currency fields
- Features & Traits and Weapon Mastery shown as cards (a blank line separates cards; use `Edit text` to change them)
- Battle, Notes, and Maps tabs (see below)
- Phone-friendly layout; long reference sections fold away
- Dynamic attack rows (`+` button); empty slots stay hidden until you add one
- Autosaves to your browser as you edit
- Import/Export JSON

Note: the sheet loads its fonts from Google Fonts, so it falls back to system fonts when offline.

## Battle Tab

Open the **Battle** tab (top right) when a fight starts. Roll your own dice, type in what you rolled, and the sheet does the rest:

1. Pick a weapon.
2. Enter your **d20** (and the **target's AC** if you know it).
3. Enter your **damage dice** total (and the extra dice for weapons that have them, like fire damage).

It shows the attack total, hit or miss (a natural 20 is a critical hit, a natural 1 always misses), the final damage with a breakdown by type, and the mastery effect to apply (Cleave, Graze, Push, Topple, and so on). Critical hits double the dice and add modifiers once.

- **Rage** and **Reckless Attack** buttons change the numbers (Rage damage, advantage). Reckless Attack follows the 2024 rule: declare it on your first attack of the turn, it gives Advantage on Strength attack rolls until the start of your next turn, and it can be used every turn (no rest needed). **New turn** ends it. **Undo Rage** (also in the top bar) turns an accidental Rage off and gives the use back; **Undo Reckless** cancels Reckless Attack.
- Roll mode covers advantage and disadvantage; enter both d20s and it uses the right one.
- Weapons with the Versatile property (like the Quarterstaff) get a **Two-handed** toggle that switches to the larger die.
- **Checks and saves** rolls Strength checks, saves and skills the same way. Rage gives Advantage on Strength checks and saves (not attack rolls; Reckless Attack covers attacks), Danger Sense on Dexterity saves, and Primal Knowledge lets raging Acrobatics, Intimidation, Perception, Stealth, and Survival use Strength. Advantage and Disadvantage from any sources cancel to a normal roll.
- **Turn** tracks your Action, Bonus action, Reaction, and attacks per action. **Next attack** clears the rolls for the next swing.
- **Your numbers** shows AC, HP, saves, and Rage effects from the sheet.
- **Battle setup** holds each weapon's damage dice, type, Heavy, thrown, magic bonus, and mastery. The first time you open the tab it fills this in from your Attacks list; check it once, especially Heavy and mastery.
- The rolls you type are scratch work and are not saved. The weapon setup is saved with your character and included in Export JSON.

## Notes Tab

The **Notes** tab keeps your campaign notes, sorted by session number, with fast search.

- **Add notes** with New note: a session number, an optional title, and free text. Use `# Heading`, `- bullets`, and `**bold**` for a little structure. Notes save as you type.
- **Search** finds every word you type (all of them must appear) in titles and text, with the matches highlighted. Use quotes for an exact phrase ("great axe"). Type a session number (like `12` or `session 12`) to jump to that session. You can also limit the search to a range of sessions, and sort by session, best match, or recently edited. Press `/` to jump to the search box.
- **Import your old notes** with Import notes: paste the text (or choose .txt / .md files) and it splits into notes wherever a line starts with `Session 12`, `## Session 12: Title`, or `**Session 12**`. A preview shows what it found before anything is added, and notes you already have are skipped, so it is safe to import twice.
- **Export** gives you a backup file (JSON) or plain text. The plain-text export can be imported again.
- Notes are stored in your browser's database (IndexedDB), which has room for years of notes. They stay on this device and browser, so export a backup now and then; the Notes tab reminds you if it has been a while.

## Maps Tab

The **Maps** tab keeps the map images and handouts you import, in a gallery you can search.

- **Import images** with the button, by dragging image files onto the tab, or by pasting an image from your clipboard. PNG, JPG, WebP, GIF, AVIF, BMP and SVG work, and you can pick many at once. A .zip of images imports too.
- **Open a map** to see it full screen. Scroll or pinch to zoom, drag to move around, double-tap to zoom in or out, and use Fit and Actual size. Prev and Next (or the arrow keys) flip through your maps.
- **Details** lets you rename a map, give it a group (like "Waterdeep" or "Dungeons"), and add a note. The gallery can be searched by name, group, or note, filtered by group, and sorted.
- **Backup** downloads every map and its details as one .zip. To restore (or move to another browser), choose that .zip with Import images. Maps you already have are skipped.
- Maps are stored in your browser's database on this device, so download a backup now and then; the tab reminds you if it has been a while.

## Top Bar and Levelling Up

- **Damage / Heal:** type an amount in the top bar and press **Damage** or **Heal** (Enter applies damage). **Full HP** sits next to Heal. Temp HP is under **Temp HP**. Damage uses up Temp HP first.
- **Short rest / Long rest** are in the top bar as well as the Magic items panel. A short rest gives back one rage and opens **Spend hit die** (rolls a die plus your Constitution modifier and heals that much; HP is not restored automatically, as in the rules). A long rest gives back all HP, all hit dice, all rages and item charges, clears temp HP and death saves, and ends Haste. Hit dice left is tracked under Details (empty means none spent).
- **Levelling up:** when you type enough Experience to reach the next level, the level goes up on its own (it never goes down). The proficiency bonus, rage uses, rage damage and hit dice update, and a **Level up** banner lists the new class features from the built-in rules, plus a box to add your hit point gain to your maximum and current HP. Roll the die or use the average. You still add new features to Features and Traits yourself, and choose ability score improvements. The banner stays until you dismiss it. **Undo level up** on the banner puts the level, hit dice and any hit points you added back one level (lowering the Experience box on its own never lowers the level).
- **Battle turn tracker:** Extra Attack gives 2 attacks per Attack action. With Haste on, a **Haste action** appears and the turn counter allows a third attack (the Haste action allows one weapon attack only). A natural 20 doubles the damage dice, not the flat bonuses.

## Class and Species Features, Conditions

The **Class and species features** panel (Sheet tab, with a short version on the Battle tab) only shows what your Level, Class and Race fit. Set Class to Barbarian and Race to Goliath under Details. Nothing unlocks until the level is reached, and the level rises by itself when you add enough Experience.

- **Goliath, Stone's Endurance** (Giant Ancestry): uses equal to your proficiency bonus, back on a long rest. Use it as a reaction: roll 1d12 + your Constitution modifier and reduce the damage by that total.
- **Goliath, Large Form** (level 5): once per long rest, for 10 minutes. While it is on, Speed is +10 ft and Strength checks have Advantage (shown on the sheet and in Battle).
- **Aspect of the Wild** (Barbarian 6): choose Owl, Panther or Salmon after each long rest. The long rest message reminds you.
- **Feral Instinct and Instinctive Pounce** (Barbarian 7): Advantage on Initiative (shown under Initiative), and a reminder to move half your Speed when you start a Rage.
- **Brutal Strike** (Barbarian 9): in Battle, after you turn on Reckless Attack, a **Brutal Strike** button appears. You give up Advantage on that one attack (it can't have Disadvantage), add a 1d10 damage die (doubled on a critical hit), and the sheet reminds you of the Forceful Blow and Hamstring Blow effects. It can be used on one attack each turn.
- **Rage of the Wilds** is Bear: the Rage panel lists resistance to all damage except Force, Necrotic, Psychic and Radiant.
- **Unarmored Defense:** tick the box under Details to calculate AC as 10 + Dex + Con.
- The Path of the Wild Heart is not in the free rules, so those descriptions were written from the 2024 Player's Handbook. Check them against your book.

**Conditions:** the **Conditions** strip under the top bar toggles the 2024 conditions and an Exhaustion level. The sheet applies them: Disadvantage or Advantage on attack rolls and ability checks, Disadvantage on Dexterity saves when Restrained, automatic failure of Strength and Dexterity saves when Stunned, Paralyzed, Petrified or Unconscious, Speed 0, and Incapacitated switches off Danger Sense and warns that your Rage ends. Exhaustion lowers every d20 roll by 2 per level and Speed by 5 ft per level, and a long rest removes one level. Advantage and Disadvantage still cancel each other.

## Magic Items

The **Magic items** panel (Sheet tab, and a short version on the Battle tab) tracks your special objects. Choose **Add my objects** to add the Colossus Greatsword, Festus's Forge, Boots of Haste, Riverstone of Subtle Persuasion and Alchemy Jug from your object sheet. **Add item** makes your own.

- **Attuned** (up to 3 at a time) and **Wielding / Wearing / Carrying** switches for each item.
- Charges and daily uses (Heat Metal, Great Rend, Titan's Swing, Haste, the jug's daily liquid) with **Use** and **Undo**. The **Short rest** and **Long rest** buttons also give back rages and end Haste.
- **Boots of Haste:** put them on, attune, then **Activate Haste**. AC (+2), Speed (doubled) and Dexterity saves (Advantage) update in the top bar, the saving throws list and the Battle tab until you **End Haste**.
- **Colossus Greatsword:** keep a count of training days. The training stage sets the Speed penalty, the attack Disadvantage at stage 1, when Great Rend (stage 3) and Titan's Swing (stage 4) unlock, and the 4d6 damage at stage 4. Set **Days trained** to where you really are.
- **Festus's Forge:** fire resistance while attuned, and in Battle the hammer uses 1d10 + 1d4 fire one-handed or 1d12 + 1d6 fire two-handed.
- **Riverstone:** +1 to Deception and Persuasion while carried.
- Battle weapons named like these items (Colossus or Collosus, Forge hammer or Festus) take their dice and bonuses from the item.
- Every item has a description you can open and edit, plus a button to restore it to the object sheet text. The panel and each item fold open and closed with the arrow.

## Rules Tab

Search the free D&D 2024 rules without leaving the sheet. Type a word or a whole question ("what does fireball do", "grappled", "fire giant", "opportunity attack") and the best matches come first. Spelling mistakes are forgiven when the word is not found anywhere else.

- Press **Ctrl+K** (or **Cmd+K** on a Mac) on any tab to jump to the search box. **Back to ...** returns you to the tab you came from, such as Battle.
- Use **Look in** to narrow to spells, monsters, conditions, rules and glossary, classes and features, items and gear, or species, feats and backgrounds.
- Shortcuts like AC, HP, DC and AoO are understood.
- Press Enter to open the top result. On a phone, **Back to results** returns to the list.
- Every result has links to search D&D Beyond and the 5e wiki in a new tab, for anything the free rules do not cover.

**My library** is for rules that are not in the free SRD, such as your subclass or house rules. Add an entry, or import `.txt` or `.md` files (a line starting with `# Title` begins a new entry). Your entries are searched together with the built-in rules. They are saved in the browser only, so use **Export as text** now and then to keep a copy.

The built-in data (`rules-data.js`, about 1.3 MB) is the System Reference Document 5.2, the free version of the 2024 rules. It does not contain the full Player's Handbook, Dungeon Master's Guide or Monster Manual, and the official books and wiki sites cannot be copied into this project. To rebuild the data, run `node tools/build-rules.js` (it downloads the SRD data files from the 5e-bits/5e-database project; the glossary text and rule sections in `tools/source` came from the official SRD 5.2 document and the Open5e project).

### Attribution

This work includes material from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

## Releasing a Change (Cache Stamp)

Browsers keep copies of the scripts and styles, so a browser can run old code after an update. Before every push, run:

```bash
node tools/stamp.js
```

It adds a version stamp to every script and style link in `index.html` (for example `app.js?v=202610220105`), which makes browsers fetch the new files. The same stamp shows under **File** as "Version", so you can see which version a browser is really running. If File shows an older stamp than the latest push, hard refresh the page (Cmd+Shift+R).

## Sharing This on GitHub

This folder contains personal reference files (PDFs/.pages) and a character save file (`May7th.json`). The `.gitignore` in this repo excludes those by default, so they stay local and are never pushed.

This project is tracked at [github.com/Milliganb22/DnD-Character-Sheet](https://github.com/Milliganb22/DnD-Character-Sheet). To push local changes:

```bash
git add -A
git commit -m "Describe your change"
git push
```

## Optional: Make It Easier for Friends

If you want a shareable link instead of sending files, host it on:
- GitHub Pages
- Netlify
- Vercel

Because this is a static app, hosting is straightforward.

## Troubleshooting

### My friend opened the HTML file and it looks broken

Make sure all 12 files are in the same folder:
- `index.html`
- `styles.css`
- `app.js`
- `items.js`
- `battle.js`
- `notes.js`
- `maps.js`
- `rules.js`
- `rules-data.js`
- `store.js`
- `tabs.js`
- `zip.js`

### My saved character disappeared

Likely causes:
- Different browser/device
- Private/incognito mode
- Cleared browser data

Use `Import JSON` to restore from backup.
