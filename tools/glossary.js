"use strict";

// Turns the text of the SRD 5.2 "Rules Glossary" (copied out of the official PDF, see tools/source) into entries.
// The PDF text has no markup, so headings are found by shape: a short Title Case line, followed by a sentence.
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "per", "the", "to", "with"]);
const KEEP_HYPHEN = /(?:^|[\s(])(?:self|non|half|two|one|three|well|so|re|anti|semi|multi|co|ex|line|cone|day|hit|long|short|free|full|mid)-$/i;

function isNoise(line) {
  return /^=====PAGE \d+=====$/.test(line) || /^\d{3}$/.test(line) || line === "System Reference Document 5.2";
}

function splitTag(line) {
  const match = /^(.*?)\s*\[([A-Za-z ]+)\]$/.exec(line);
  return match ? { name: match[1].trim(), tag: match[2] } : { name: line, tag: "" };
}

function isTitleCase(name) {
  const words = name.split(/\s+/);
  return words.every((word, index) => {
    const bare = word.replace(/^[(“"]+|[)”".,]+$/g, "");
    if (!bare) {
      return false;
    }
    if (index > 0 && SMALL_WORDS.has(bare.toLowerCase())) {
      return true;
    }
    return /^[A-Z0-9]/.test(bare) || /^\(/.test(word);
  });
}

function wordCount(line) {
  return line ? line.split(/\s+/).length : 0;
}

// The glossary is alphabetical, so a "heading" that breaks the order is really a list item or table caption.
// Keep the longest alphabetical run of headings and fold the others into the entry before them.
function mergeOutOfOrder(entries) {
  const key = (entry) => entry.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const n = entries.length;
  const best = new Array(n).fill(1);
  const from = new Array(n).fill(-1);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (key(entries[j]) <= key(entries[i]) && best[j] + 1 > best[i]) {
        best[i] = best[j] + 1;
        from[i] = j;
      }
    }
  }
  let tail = best.indexOf(Math.max(...best));
  const keep = new Set();
  while (tail >= 0) {
    keep.add(tail);
    tail = from[tail];
  }
  const out = [];
  entries.forEach((entry, index) => {
    if (keep.has(index) || !out.length) {
      out.push(entry);
      return;
    }
    const target = out[out.length - 1];
    target.paragraphs.push(`**${entry.name}.**`, ...entry.paragraphs);
  });
  return out;
}

function parseGlossary(rawText) {
  const start = rawText.indexOf("Here are definitions of various rules.");
  const lines = rawText
    .slice(start >= 0 ? start + "Here are definitions of various rules.".length : 0)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && !isNoise(line));

  const entries = [];
  let current = null;
  let bulletsLeft = 0;
  let inList = false;

  const finish = () => {
    if (current) {
      entries.push(current);
    }
    current = null;
  };
  const append = (line) => {
    const paragraphs = current.paragraphs;
    const last = paragraphs[paragraphs.length - 1];
    if (last === undefined) {
      paragraphs.push(line);
      return;
    }
    // Join a hyphenated word that the PDF split over two lines.
    if (/[A-Za-z]-$/.test(last) && /^[a-z]/.test(line) && !KEEP_HYPHEN.test(last) && !/^(and|or|to)\b/.test(line)) {
      paragraphs[paragraphs.length - 1] = last.slice(0, -1) + line;
      return;
    }
    if (/[A-Za-z]-$/.test(last) && /^[a-z]/.test(line)) {
      paragraphs[paragraphs.length - 1] = `${last} ${line}`;
      return;
    }
    const sentenceEnd = /[.!?:”)]$/.test(last);
    if (/^[a-z(]/.test(line) || !sentenceEnd) {
      paragraphs[paragraphs.length - 1] = `${last} ${line}`;
    } else {
      paragraphs.push(line);
    }
  };

  lines.forEach((line, index) => {
    const next = lines[index + 1] || "";
    const { name, tag } = splitTag(line);
    const prev = lines[index - 1] || "";
    const prevEnds = !prev || /[.!?:”)\d]$/.test(prev) || (inList && bulletsLeft === 0) || wordCount(prev) <= 3;
    const looksLikeHeading =
      name.length <= 60 &&
      isTitleCase(name) &&
      !/[.!?:;,]/.test(name) &&
      !/^[•]$/.test(line) &&
      (tag ? true : wordCount(next) >= 4 && /^[A-Z“]/.test(next) && prevEnds);
    if (line === "•") {
      bulletsLeft += 1;
      inList = true;
      return;
    }
    if (looksLikeHeading && !(inList && bulletsLeft > 0)) {
      finish();
      current = { name, tag, paragraphs: [] };
      bulletsLeft = 0;
      inList = false;
      return;
    }
    if (!current) {
      return;
    }
    if (bulletsLeft > 0 && /^[A-Z0-9]/.test(line)) {
      current.paragraphs.push(`- ${line}`);
      bulletsLeft -= 1;
      return;
    }
    if (inList && bulletsLeft === 0 && /^[a-z]/.test(line)) {
      current.paragraphs[current.paragraphs.length - 1] += ` ${line}`;
      return;
    }
    if (inList && bulletsLeft === 0) {
      inList = false;
    }
    if (bulletsLeft > 0) {
      current.paragraphs[current.paragraphs.length - 1] += ` ${line}`;
      return;
    }
    append(line);
  });
  finish();
  return mergeOutOfOrder(entries).map((entry) => ({ name: entry.name, tag: entry.tag, text: entry.paragraphs.join("\n") })).filter((entry) => entry.text.length >= 25);
}

module.exports = { parseGlossary };
