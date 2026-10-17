# DnD Character Sheet (Local Web App)

A lightweight browser-based DnD character sheet that runs locally with no install required.

## What This Is

This project is a static web app (HTML/CSS/JavaScript):
- `index.html`
- `styles.css`
- `app.js`
- `battle.js`

Anyone can use it by opening `index.html` in a browser.

## Quick Start (For Your Friends)

1. Download the project files.
2. Keep these 4 files in the same folder:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `battle.js`
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
- Battle tab (see below)
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

- **Rage** and **Reckless Attack** buttons change the numbers (Rage damage, advantage). Roll mode covers advantage and disadvantage; enter both d20s and it uses the right one.
- **Checks and saves** rolls Strength checks, saves and skills the same way. Rage gives Advantage on Strength checks and saves (not attack rolls; Reckless Attack covers attacks), Danger Sense on Dexterity saves, and Primal Knowledge lets raging Acrobatics, Intimidation, Perception, Stealth, and Survival use Strength. Advantage and Disadvantage from any sources cancel to a normal roll.
- **Turn** tracks your Action, Bonus action, Reaction, and attacks per action. **Next attack** clears the rolls for the next swing.
- **Your numbers** shows AC, HP, saves, and Rage effects from the sheet.
- **Battle setup** holds each weapon's damage dice, type, Heavy, thrown, magic bonus, and mastery. The first time you open the tab it fills this in from your Attacks list; check it once, especially Heavy and mastery.
- The rolls you type are scratch work and are not saved. The weapon setup is saved with your character and included in Export JSON.

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

Make sure all 4 files are in the same folder:
- `index.html`
- `styles.css`
- `app.js`
- `battle.js`

### My saved character disappeared

Likely causes:
- Different browser/device
- Private/incognito mode
- Cleared browser data

Use `Import JSON` to restore from backup.
