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
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

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

    // Worked example and resources, opened
    await page.click("#worked-example > summary");
    await page.click("#resources > summary");
    await runAxe(page, label("worked example and resources open"));
    await checkOverflow(page, label("worked example and resources open"));
    await page.click("#worked-example > summary");
    await page.click("#resources > summary");

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
      seen.add(await page.textContent("#char-name"));
      await page.click("#char-next");
    }
    if (seen.size !== charCount) failures.push(`${label("character")}: drew ${seen.size} different characters in ${charCount} draws, expected all of them`);

    // 4. Referee kit, verdict filled in
    await page.click("#btn-referee");
    await page.waitForTimeout(350);
    await page.check("#v-why");
    await page.check("#v-motive");
    await page.check("#v-maybe");
    await page.waitForTimeout(200);
    if (!(await page.evaluate(() => document.getElementById("pewpew").open))) failures.push(`${label("pew pew")}: did not open for a maybe`);
    else {
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

    // Celebration fires when all six are ticked
    for (const id of ["#v-world", "#v-thing", "#v-means", "#v-opportunity"]) await page.check(id);
    await page.waitForTimeout(200);
    if (!(await page.evaluate(() => document.getElementById("celebrate").open))) failures.push(`${label("celebration")}: did not open when all six were ticked`);
    else {
      await runAxe(page, label("celebration overlay"));
      await checkOverflow(page, label("celebration overlay"));
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
    await page.waitForTimeout(5600);
    if (await page.evaluate(() => document.getElementById("penalty").open)) failures.push(`${label("red overlay")}: did not close by itself after 5 seconds`);

    // 6. WCAG 1.4.12 text spacing: the page must not break with wider spacing
    await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
    await checkOverflow(page, label("text spacing override"));

    if (errors.length) failures.push(`${label("console")}: ${errors.join(" | ")}`);
    await context.close();
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
