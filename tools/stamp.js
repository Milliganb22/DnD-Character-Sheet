"use strict";

// Run this before every release:  node tools/stamp.js
// It puts a version stamp on the script and style links in index.html (for example app.js?v=202610220105), so a
// browser that cached an older copy fetches the new files. The same stamp shows in the File menu, so you can see which
// version a browser is really running. Pass your own stamp as an argument to override the date and time.

const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "index.html");
const now = new Date();
const pad = (n) => String(n).padStart(2, "0");
const stamp = process.argv[2] || `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;

let html = fs.readFileSync(file, "utf8");
let links = 0;
html = html.replace(/(src|href)="((?:tabs|store|zip|items|battle|notes|maps|rules|app)\.js|styles\.css)(?:\?v=[^"]*)?"/g, (all, attr, name) => {
  links += 1;
  return `${attr}="${name}?v=${stamp}"`;
});
html = html.replace(/<meta name="app-version" content="[^"]*" \/>/, `<meta name="app-version" content="${stamp}" />`);
html = html.replace(/(<span id="appVersion">)[^<]*(<\/span>)/, `$1${stamp}$2`);
fs.writeFileSync(file, html);
console.log(`Stamped ${links} links with version ${stamp}`);
