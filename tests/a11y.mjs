// Accessibility and layout checks for the game page.
// Runs axe-core (WCAG 2.0, 2.1 and 2.2, levels A and AA, plus best practice)
// in Chromium, in light and dark mode, at desktop, phone and 320px widths,
// with every news card and every character card drawn at least once.
//
//   npm install
//   npm test
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" };
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
  const file = path.join(root, urlPath === "/" ? "index.html" : urlPath);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

// Google Fonts are fetched with curl, which verifies TLS against the system
// (or proxy) CA bundle, and handed to the browser. TLS checks stay on.
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const fontCache = new Map();
async function serveFontViaCurl(route) {
  const url = route.request().url();
  if (!fontCache.has(url)) {
    try {
      fontCache.set(url, execFileSync("curl", ["-sS", "--fail", "-A", UA, url], { maxBuffer: 20e6 }));
    } catch {
      fontCache.set(url, null);
    }
  }
  const body = fontCache.get(url);
  if (!body) return route.continue();
  const contentType = url.includes("fonts.googleapis.com") ? "text/css; charset=utf-8" : "font/woff2";
  return route.fulfill({ status: 200, body, contentType, headers: { "access-control-allow-origin": "*" } });
}

const launchOptions = {};
if (process.env.CHROMIUM_PATH) launchOptions.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launchOptions);

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
  { name: "narrow", width: 320, height: 640 }
];
const SCHEMES = ["light", "dark"];
const TAGS = ["wcag2a", "wcag2aa", "wcag2aaa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

const failures = [];
let axeRuns = 0;

async function runAxe(page, label) {
  await page.addScriptTag({ content: axeSource });
  const result = await page.evaluate(async (tags) => {
    // eslint-disable-next-line no-undef
    const r = await axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) }));
  }, TAGS);
  axeRuns += 1;
  for (const v of result) failures.push(`${label}: axe ${v.id} (${v.impact}) ${v.help} -> ${v.nodes.join(", ")}`);
}

async function checkOverflow(page, label) {
  const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  if (o.sw > o.cw) failures.push(`${label}: page scrolls sideways (${o.sw}px content in ${o.cw}px viewport)`);
  // Full-screen overlays: nothing inside may be wider than the screen
  const wide = await page.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    if (!d) return [];
    const cw = document.documentElement.clientWidth;
    return [...d.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > cw + 0.5 && !el.matches("canvas")).map((el) => el.tagName.toLowerCase() + (el.id ? "#" + el.id : ""));
  });
  if (wide.length) failures.push(`${label}: overlay content wider than the screen (${wide.slice(0, 4).join(", ")})`);
  // Overlay titles never break inside a word (a lone R once wrapped from MESSENGER on laptops),
  // and the whole screen fits in the window, close button included
  const overlay = await page.evaluate(() => {
    const d = document.querySelector("dialog[open]");
    if (!d) return null;
    const h = d.querySelector("h2");
    const text = h.textContent;
    const node = h.firstChild;
    const split = [];
    let pos = 0;
    for (const word of text.split(" ")) {
      const start = text.indexOf(word, pos);
      pos = start + word.length;
      const r = document.createRange();
      const tops = new Set();
      for (let i = start; i < start + word.length; i++) { r.setStart(node, i); r.setEnd(node, i + 1); tops.add(Math.round(r.getBoundingClientRect().top)); }
      if (tops.size > 1) split.push(word);
    }
    const button = d.querySelector("button").getBoundingClientRect();
    return { split, buttonBottom: button.bottom, vh: window.innerHeight };
  });
  if (overlay && overlay.split.length) failures.push(`${label}: overlay title splits ${overlay.split.join(", ")} across lines`);
  if (overlay && overlay.buttonBottom > overlay.vh + 0.5) failures.push(`${label}: overlay is taller than the screen (button ends at ${Math.round(overlay.buttonBottom)}px of ${overlay.vh}px)`);
}

// An end-of-round scene is playing if its SVG animations have started
async function scenePlays(page, id) {
  return page.evaluate((id) => {
    const anims = [...document.getElementById(id).querySelectorAll("animate, animateTransform, animateMotion")];
    return anims.length > 0 && anims.every((a) => { try { a.getStartTime(); return true; } catch { return false; } });
  }, id);
}

async function checkFocusRing(page, label, selector) {
  // Reach the element by keyboard so :focus-visible applies, as it would for a real keyboard user
  await page.focus(selector);
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  const active = await page.evaluate(() => "#" + document.activeElement.id);
  if (active !== selector) failures.push(`${label}: keyboard focus landed on ${active}, expected ${selector}`);
  const style = await page.evaluate((sel) => {
    const cs = getComputedStyle(document.querySelector(sel));
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  }, selector);
  if (style.style === "none" || style.width < 2) failures.push(`${label}: no visible focus ring on ${selector}`);
}

for (const scheme of SCHEMES) {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme });
    await context.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, serveFontViaCurl);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    const label = (state) => `[${scheme} ${vp.name}] ${state}`;

    await page.goto(base, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    // Fonts must load, or the design silently falls back.
    const loadedFamilies = await page.evaluate(() => {
      const fams = new Set();
      document.fonts.forEach((f) => { if (f.status === "loaded") fams.add(f.family.replace(/["']/g, "")); });
      return [...fams];
    });
    for (const fam of ["Archivo", "Atkinson Hyperlegible"]) {
      if (!loadedFamilies.includes(fam)) failures.push(`${label("load")}: web font ${fam} did not load (loaded: ${loadedFamilies.join(", ") || "none"})`);
    }

    // 1. Page at rest
    await runAxe(page, label("at rest"));
    await checkOverflow(page, label("at rest"));

    // Keyboard: Tab reaches the skip link then the role buttons, with a visible ring
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => document.activeElement.className);
    if (!first.includes("skip")) failures.push(`${label("keyboard")}: first Tab stop is not the skip link`);
    await page.keyboard.press("Tab");
    const second = await page.evaluate(() => document.activeElement.id);
    if (second !== "btn-news") failures.push(`${label("keyboard")}: second Tab stop is ${second}, expected btn-news`);
    await checkFocusRing(page, label("keyboard"), "#btn-news");

    // Character deck: every card is complete and uses a known climate view
    if (scheme === SCHEMES[0] && vp === VIEWPORTS[0]) {
      const problems = await page.evaluate(() => {
        const views = window.CLIMATE_VIEWS.map((v) => v.key);
        const out = [];
        const names = new Set();
        for (const c of window.CHARACTERS) {
          if (names.has(c.name)) out.push(`${c.name}: duplicate name`);
          names.add(c.name);
          for (const f of ["name", "pronouns", "role", "place", "tagline", "scene", "openingLine", "neverWithout"]) if (!String(c[f] || "").trim()) out.push(`${c.name}: no ${f}`);
          if (!views.includes(c.view)) out.push(`${c.name}: unknown climate view "${c.view}"`);
          for (const s of ["time", "wallet", "reach"]) if (!(c.stats[s] >= 1 && c.stats[s] <= 5)) out.push(`${c.name}: ${s} is ${c.stats[s]}`);
          if (c.triggers.length !== 3 || c.doorOpeners.length !== 3) out.push(`${c.name}: needs three triggers and three door openers`);
        }
        for (const v of views) if (!window.CHARACTERS.some((c) => c.view === v)) out.push(`no character is ${v}`);
        return out;
      });
      for (const p of problems) failures.push(`[data] ${p}`);
    }

    // Worked example, climate views and resources, opened
    const folds = ["#climate-views", "#worked-example", "#resources"];
    for (const f of folds) await page.click(`${f} > summary`);
    const viewItems = await page.evaluate(() => document.querySelectorAll("#views-list li").length);
    if (viewItems !== 6) failures.push(`${label("climate views")}: listed ${viewItems} views, expected 6`);
    await runAxe(page, label("folds open"));
    await checkOverflow(page, label("folds open"));
    for (const f of folds) await page.click(`${f} > summary`);

    // 2. Newsbearer: draw every story at least once
    await page.click("#btn-news");
    await page.waitForTimeout(350);
    await runAxe(page, label("news card"));
    const newsCount = await page.evaluate(() => window.NEWS.length);
    for (let i = 0; i < newsCount; i++) {
      await checkOverflow(page, label(`news draw ${i + 1}`));
      const empty = await page.evaluate(() => ["news-headline", "news-snapshot", "news-source"].filter((id) => !document.getElementById(id).textContent.trim()));
      if (empty.length) failures.push(`${label(`news draw ${i + 1}`)}: empty ${empty.join(", ")}`);
      await page.click("#news-next");
    }
    const pressed = await page.getAttribute("#btn-news", "aria-pressed");
    if (pressed !== "true") failures.push(`${label("news")}: role button not marked as pressed`);

    // 3. Character: draw every character, with secrets open
    await page.click("#btn-character");
    await page.waitForTimeout(350);
    await runAxe(page, label("character card, secrets hidden"));
    await page.click("#secret-toggle");
    await runAxe(page, label("character card, secrets shown"));
    const charCount = await page.evaluate(() => window.CHARACTERS.length);
    const seen = new Set();
    for (let i = 0; i < charCount; i++) {
      await page.click("#secret-toggle");
      const open = await page.getAttribute("#secret-toggle", "aria-expanded");
      if (open !== "true") await page.click("#secret-toggle");
      await checkOverflow(page, label(`character draw ${i + 1}`));
      const card = await page.evaluate(() => ({
        name: document.getElementById("char-name").textContent,
        scene: document.getElementById("char-scene").textContent.trim(),
        view: document.querySelector('#secret-body [data-f="view-name"]').textContent.trim(),
        secret: document.querySelector(".secret").getBoundingClientRect().height,
        vh: window.innerHeight
      }));
      seen.add(card.name);
      if (!card.scene || !card.view) failures.push(`${label(`character draw ${i + 1}`)}: ${card.name} is missing a scene or climate view`);
      // The character must see how to react without scrolling: the hidden side fits on one screen
      if (card.vh >= 800 && card.secret > card.vh) failures.push(`${label(`character draw ${i + 1}`)}: ${card.name}'s hidden side is ${Math.round(card.secret)}px tall, taller than the ${card.vh}px screen`);
      await page.click("#char-next");
    }
    if (seen.size !== charCount) failures.push(`${label("character")}: drew ${seen.size} different characters in ${charCount} draws, expected all of them`);

    // 4. Referee kit: look up the character by typing or picking
    await page.click("#btn-referee");
    await page.waitForTimeout(350);
    const refFocus = await page.evaluate(() => document.activeElement.id);
    if (refFocus !== "refchar-title") failures.push(`${label("referee")}: focus went to ${refFocus}, expected the character heading`);
    await checkFocusRing(page, label("referee keyboard"), "#ref-char-input");
    await page.fill("#ref-char-input", "abdi");
    const found = await page.evaluate(() => ({ hidden: document.getElementById("ref-char-body").hidden, name: document.getElementById("ref-char-name").textContent }));
    if (found.hidden || found.name !== "Abdi Hassan") failures.push(`${label("referee lookup")}: typing "abdi" showed ${found.hidden ? "nothing" : found.name}`);
    await runAxe(page, label("referee kit, character shown"));
    await checkOverflow(page, label("referee kit, character shown"));
    await page.fill("#ref-char-input", "ross");
    const matchCount = await page.evaluate(() => document.querySelectorAll("#ref-char-matches .match").length);
    if (matchCount < 2) failures.push(`${label("referee lookup")}: typing "ross" offered ${matchCount} matches, expected several`);
    await runAxe(page, label("referee kit, several matches"));
    const picked = await page.textContent("#ref-char-matches .match .match-name");
    await page.click("#ref-char-matches .match");
    const afterPick = await page.evaluate(() => ({ name: document.getElementById("ref-char-name").textContent, focus: document.activeElement.id, value: document.getElementById("ref-char-input").value }));
    if (afterPick.name !== picked || afterPick.value !== picked) failures.push(`${label("referee lookup")}: picking ${picked} showed ${afterPick.name}`);
    if (afterPick.focus !== "ref-char-name") failures.push(`${label("referee lookup")}: focus went to ${afterPick.focus} after picking, expected the character's name`);
    await page.fill("#ref-char-input", "zzzz");
    const none = await page.textContent("#ref-char-status");
    if (!none.includes("No character")) failures.push(`${label("referee lookup")}: an unknown name gave "${none}"`);
    const unreachable = await page.evaluate(() => {
      const input = document.getElementById("ref-char-input");
      const missed = [];
      for (const c of window.CHARACTERS) {
        input.value = c.name;
        input.dispatchEvent(new Event("input"));
        if (document.getElementById("ref-char-body").hidden || document.getElementById("ref-char-name").textContent !== c.name) missed.push(c.name);
      }
      return missed;
    });
    if (unreachable.length) failures.push(`${label("referee lookup")}: full names that did not show their character: ${unreachable.join(", ")}`);
    const listed = await page.evaluate(() => document.querySelectorAll("#ref-char-list option").length);
    if (listed !== charCount) failures.push(`${label("referee lookup")}: dropdown lists ${listed} names, expected ${charCount}`);

    // Verdict filled in
    await page.fill("#ref-char-input", "big steve");
    await page.check("#v-why");
    await page.check("#v-motive");
    await page.check("#v-maybe");
    await page.waitForTimeout(200);
    if (!(await page.evaluate(() => document.getElementById("pewpew").open))) failures.push(`${label("pew pew")}: did not open for a maybe`);
    else {
      if (!(await scenePlays(page, "pewpew"))) failures.push(`${label("pew pew")}: the dart scene did not play`);
      await runAxe(page, label("pew pew overlay"));
      await checkOverflow(page, label("pew pew overlay"));
      await page.click("#pewpew-close");
    }
    await runAxe(page, label("referee kit"));
    await checkOverflow(page, label("referee kit"));
    await checkFocusRing(page, label("referee keyboard"), "#show-yellow");

    // Score: two plus taps, one minus tap, one undo
    await page.click('.tick[data-key="personal"]');
    await page.click('.tick[data-key="question"]');
    await page.click('.tick[data-key="jargon"]');
    await page.click('.tick[data-key="stats"]');
    await page.click("#score-undo");
    const total = await page.textContent("#score-total");
    if (total.trim() !== "1") failures.push(`${label("score")}: total is ${total}, expected 1`);
    await runAxe(page, label("score panel"));

    // Ticking boxes alone ends nothing; the character's yes, with no red card, wins
    for (const id of ["#v-connect", "#v-thing", "#v-means", "#v-opportunity"]) await page.check(id);
    await page.waitForTimeout(200);
    if (await page.evaluate(() => document.querySelector("dialog[open]") !== null)) failures.push(`${label("verdict")}: an end screen opened before the character answered`);
    await page.check("#v-yes");
    await page.waitForTimeout(200);
    if (!(await page.evaluate(() => document.getElementById("celebrate").open))) failures.push(`${label("victory")}: did not open when the character said yes`);
    else {
      if (!(await scenePlays(page, "celebrate"))) failures.push(`${label("victory")}: the pigeon scene did not play`);
      const perfect = await page.textContent("#celebrate-text");
      if (!perfect.includes("Every box ticked")) failures.push(`${label("victory")}: all six ticked but the screen does not say so (${perfect})`);
      await runAxe(page, label("victory overlay"));
      await checkOverflow(page, label("victory overlay"));
      await page.click("#celebrate-close");
    }

    // 5. Penalty overlays
    await page.click("#show-yellow");
    await runAxe(page, label("yellow card overlay"));
    await checkOverflow(page, label("yellow card overlay"));
    await page.keyboard.press("Escape");
    const back = await page.evaluate(() => document.activeElement.id);
    if (back !== "show-yellow") failures.push(`${label("yellow overlay")}: focus did not return to the yellow button (got ${back})`);
    await page.click("#show-yellow");
    const kicker = await page.textContent("#penalty-kicker");
    if (!kicker.includes("Second yellow")) failures.push(`${label("second yellow")}: did not turn red`);
    await runAxe(page, label("red card overlay"));
    const counted = await page.textContent("#penalty-count");
    if (!counted.includes("Reds this round: 1")) failures.push(`${label("red overlay")}: card not counted (${counted})`);
    await checkOverflow(page, label("red card overlay"));
    await page.waitForTimeout(5600);
    if (await page.evaluate(() => document.getElementById("penalty").open)) failures.push(`${label("red overlay")}: did not close by itself after 5 seconds`);

    // A yes after a red card does not win
    await page.check("#v-no");
    await page.click("#pewpew-close");
    await page.check("#v-yes");
    await page.waitForTimeout(200);
    const afterRed = await page.evaluate(() => ({ won: document.getElementById("celebrate").open, down: document.getElementById("pewpew").open, why: document.getElementById("pewpew-detail").textContent }));
    if (afterRed.won || !afterRed.down || !afterRed.why.includes("red card")) failures.push(`${label("yes after red")}: expected Messenger down for a red card (${afterRed.why})`);
    await page.click("#pewpew-close");

    // 6. WCAG 1.4.12 text spacing: the page must not break with wider spacing
    await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
    await checkOverflow(page, label("text spacing override"));

    if (errors.length) failures.push(`${label("console")}: ${errors.join(" | ")}`);
    await context.close();
  }
}

// Random draws must not depend on Math.random alone. Some page viewers make it
// repeat, which once gave every phone in the room the same first character.
{
  const firsts = { character: new Set(), news: new Set() };
  for (let i = 0; i < 10; i++) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addInitScript(() => { Math.random = () => 0.5; });
    const page = await context.newPage();
    await page.goto(base);
    await page.click("#btn-character");
    firsts.character.add(await page.textContent("#char-name"));
    await page.click("#btn-news");
    firsts.news.add(await page.textContent("#news-headline"));
    await context.close();
  }
  for (const [deck, names] of Object.entries(firsts)) {
    if (names.size < 3) failures.push(`[random] with Math.random stuck, 10 fresh phones drew only ${names.size} different first ${deck} card(s)`);
  }
}

await browser.close();
server.close();

console.log(`axe runs: ${axeRuns}, rule tags: ${TAGS.join(", ")}`);
if (failures.length) {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log(" - " + f);
  process.exit(1);
}
console.log("All checks passed.");
