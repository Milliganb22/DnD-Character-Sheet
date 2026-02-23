# DnD Character Sheet (Local Web App)

A lightweight browser-based DnD character sheet that runs locally with no install required.

## What This Is

This project is a static web app (HTML/CSS/JavaScript):
- `CharacterSheet.html`
- `styles.css`
- `app.js`

Anyone can use it by opening `CharacterSheet.html` in a browser.

## Quick Start (For Your Friends)

1. Download the project files.
2. Keep these 3 files in the same folder:
   - `CharacterSheet.html`
   - `styles.css`
   - `app.js`
3. Open `CharacterSheet.html` in a browser (Chrome, Edge, Safari, Firefox).

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

- Character stats, saves, skills, proficiencies, attacks, inventory, notes
- Barbarian Rage tracking (2024 rules behavior shown in UI)
- HP damage/heal/full reset controls
- Temp HP-aware current HP tracking
- Rich text editors for major note areas
- Dynamic attack rows (`+` button)
- Import/Export JSON
  
## Troubleshooting

### My friend opened the HTML file and it looks broken

Make sure all 3 files are in the same folder:
- `CharacterSheet.html`
- `styles.css`
- `app.js`

### My saved character disappeared

Likely causes:
- Different browser/device
- Private/incognito mode
- Cleared browser data

Use `Import JSON` to restore from backup.
