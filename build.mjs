// Paleidimas: npm run build
// Iš content.json ir src/ padaro du variantus: dist/one-page/ ir dist/multi-page/.
// Jokių priklausomybių, jokio tinklo. Nuorodos santykinės, kad veiktų ir GitHub Pages pakatalogyje.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url);
const read = (p) => readFileSync(here(p), "utf8");

// Testams: CONTENT_FILE leidžia paimti kitą turinį, DIST_DIR — rašyti kitur.
// Įprastai abu tušti ir renkama iš content.json į dist/.
const contentFile = process.env.CONTENT_FILE ? new URL("file://" + process.env.CONTENT_FILE) : here("./content.json");
const content = JSON.parse(readFileSync(contentFile, "utf8"));
const credits = JSON.parse(read("./src/img/credits.json"));
const site = content.site;
const DIST = process.env.DIST_DIR ? new URL("file://" + process.env.DIST_DIR) : here("./dist/");
const TPL = "./src/templates/";

const templates = {};
for (const f of readdirSync(here(TPL))) templates[f.replace(".html", "")] = read(TPL + f);

const esc = (s) => String(s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* --- Mažas šablonų variklis: {{raktas}}, {{{be kabučių}}}, <!--repeat:x--> ir <!--if:x--> --- */

function lookup(stack, key) {
  for (const scope of stack) {
    if (key === ".") return scope;
    if (scope === null || typeof scope !== "object") continue;
    let value = scope, found = true;
    for (const part of key.split(".")) {
      if (value && typeof value === "object" && part in value) value = value[part];
      else { found = false; break; }
    }
    if (found) return value;
  }
  return undefined;
}

// Randa pirmą kind-bloką ir jo porą, skaičiuodama įdėtus tos pačios rūšies blokus.
function findBlock(tpl, kind) {
  const open = new RegExp(`<!--${kind}:([\\w.]+)-->`).exec(tpl);
  if (!open) return null;
  const bodyStart = open.index + open[0].length;
  const token = new RegExp(`<!--${kind}:[\\w.]+-->|<!--/${kind}-->`, "g");
  token.lastIndex = bodyStart;
  let depth = 1, t;
  while ((t = token.exec(tpl))) {
    if (t[0].startsWith("<!--/")) {
      if (--depth === 0) return { key: open[1], start: open.index, bodyStart, bodyEnd: t.index, end: t.index + t[0].length };
    } else depth++;
  }
  throw new Error(`neuždarytas <!--${kind}:${open[1]}-->`);
}

function render(tpl, stack) {
  let out = tpl, block;
  while ((block = findBlock(out, "repeat"))) {
    const list = lookup(stack, block.key) || [];
    const body = out.slice(block.bodyStart, block.bodyEnd);
    const filled = list.map((item) => render(body, [item, ...stack])).join("");
    out = out.slice(0, block.start) + filled + out.slice(block.end);
  }
  while ((block = findBlock(out, "if"))) {
    const body = out.slice(block.bodyStart, block.bodyEnd);
    const keep = lookup(stack, block.key) ? render(body, stack) : "";
    out = out.slice(0, block.start) + keep + out.slice(block.end);
  }
  out = out.replace(/\{\{\{([\w.]+)\}\}\}/g, (m, key) => {
    const v = lookup(stack, key);
    return v == null ? "" : String(v);
  });
  out = out.replace(/\{\{([\w.]+)\}\}/g, (m, key) => {
    const v = lookup(stack, key);
    return v == null ? "" : esc(v);
  });
  return out;
}

/* --- Tema: ikona piešiama tomis pačiomis spalvomis kaip theme.css --- */

// Susirenka visus --kintamuosius iš abiejų bylų ir išverčia var(...) nuorodas į hex.
function themeColours() {
  const css = read("./src/tokens.css") + read("./src/theme.css");
  const map = {};
  for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) map[m[1]] = m[2].trim();
  const resolve = (v, depth = 0) => {
    const ref = /^var\((--[\w-]+)\)$/.exec(v);
    if (!ref || depth > 5) return v;
    return resolve(map[ref[1]] || v, depth + 1);
  };
  return { brand: resolve(map["--color-brand"]), accent: resolve(map["--color-accent"]), bg: resolve(map["--color-bg"]) };
}

const theme = themeColours();
// Ženklas: dvi lentos ir pjūvis per vidurį.
const icon = "data:image/svg+xml," + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
  `<rect width="32" height="32" fill="${theme.brand}"/>` +
  `<path d="M4 11h24M4 21h24" stroke="${theme.bg}" stroke-width="2.5"/>` +
  `<path d="M16 3v26" stroke="${theme.accent}" stroke-width="2.5"/></svg>`
);

/* --- Turinys --- */

const sections = new Map(content.sections.filter((s) => s.enabled).map((s) => [s.id, s]));
const has = (id) => sections.has(id);

// Puslapis lieka tik tada, kai jame yra bent viena įjungta sekcija.
const pages = content.pages
  .map((p) => ({ ...p, sections: p.sections.filter((s) => has(s.id)) }))
  .filter((p) => p.sections.length);

const navMulti = pages.map((p) => ({ href: `${p.slug}.html`, label: p.title }));
const navOne = content.sections
  .filter((s) => s.enabled && s.inNav && s.id !== "hero")
  .map((s) => ({ href: `#${s.id}`, label: s.navLabel || s.title }));

// Kur nusileidžia nuoroda į sekciją: viename puslapyje — inkaras, keliuose — to puslapio byla.
function targetHref(id, kind) {
  if (!has(id)) return null;
  if (kind === "one-page") return `#${id}`;
  // Pilnas puslapis laimi prieš anonsą: „Žiūrėti darbus“ veda į darbai.html, ne į pradžios anonsą.
  const page = pages.find((p) => p.sections.some((s) => s.id === id && !s.teaser))
    || pages.find((p) => p.sections.some((s) => s.id === id));
  if (!page) return null;
  return page.sections[0].id === id ? `${page.slug}.html` : `${page.slug}.html#${id}`;
}

function sectionScope(id, kind, opts = {}) {
  const s = sections.get(id);
  const scope = { ...s };
  if (id === "hero") {
    // Šablonui reikia vardo be pločio: iš "hero-1800.jpg" gaunamas "hero".
    scope.photoBase = s.photo.replace(/-\d+\.(jpg|jpeg)$/i, "");
    scope.actions = (s.actions || [])
      .map((a) => ({ ...a, href: targetHref(a.to, kind), styleClass: a.style === "ghost" ? " btn--ghost" : "" }))
      .filter((a) => a.href);
  }
  if (id === "cta") scope.actionHref = targetHref(s.action.to, kind) || targetHref("contact", kind) || "";
  if (id === "works") {
    scope.items = (opts.teaser ? s.items.slice(0, opts.teaser) : s.items).map((w) => {
      const c = credits[w.photo];
      if (!c) throw new Error(`src/img/credits.json neturi įrašo apie "${w.photo}"`);
      return { ...w, credit: `Nuotrauka: ${c.author}, ${c.source}, ${c.license}` };
    });
  }
  if (id === "services") scope.items = opts.teaser ? s.items.slice(0, opts.teaser) : s.items;
  if (opts.teaser) {
    scope.isTeaser = true;
    scope.moreHref = kind === "one-page" ? `#${id}` : targetHref(id, kind);
  } else {
    scope.isFull = true;
  }
  return scope;
}

function buildPage({ kind, title, description, list, nav, current, home }) {
  const navWithCurrent = nav.map((n) => ({
    ...n,
    current: current && n.href === current ? ' aria-current="page"' : "",
  }));
  let body = list
    .map(({ id, teaser }) => render(templates[id], [sectionScope(id, kind, { teaser }), { site }, site]))
    .join("\n");
  // Kiekviename puslapyje lygiai vienas h1. Hero jį turi; puslapiuose be hero
  // pakeliama pirmoji matoma sekcijos antraštė (sr-only antraštės su klase nepaliečiamos).
  if (!/<h1[\s>]/.test(body)) body = body.replace(/<h2>([\s\S]*?)<\/h2>/, "<h1>$1</h1>");
  const wrapper = kind === "one-page" ? templates["one-page"] : templates["page"];
  const main = render(wrapper, [{ sections: body }]);
  const html = render(templates.layout, [{
    ...site,
    title,
    description,
    robots: site.noindex ? '<meta name="robots" content="noindex, nofollow">' : "",
    icon,
    home,
    nav: navWithCurrent,
    main,
    dialog: list.some((s) => s.id === "works") ? templates.dialog : "",
    year: new Date().getFullYear(),
  }]);
  if (/\{\{/.test(html)) throw new Error(`liko neužpildyta vieta: ${title}`);
  return html;
}

/* --- Išvestis --- */

// Kiekviena nuotrauka gyvena dviem pločiais ir dviem formatais. Hero — savo pločiais.
const CARD_WIDTHS = [720, 1200];
const FORMATS = ["jpg", "avif"];

function imageNames() {
  const names = new Set();
  const add = (base, widths) => {
    for (const w of widths) for (const f of FORMATS) names.add(`${base}-${w}.${f}`);
  };
  for (const s of sections.values()) {
    if (s.id === "hero") add(s.photo.replace(/-\d+\.(jpg|jpeg)$/i, ""), [900, s.width]);
    else if (s.photo) add(s.photo, CARD_WIDTHS);
    for (const item of s.items || []) if (item.photo) add(item.photo, CARD_WIDTHS);
  }
  return [...names].sort();
}

// Į dist keliauja tik tos nuotraukos, kurių prašo įjungtos sekcijos: senos bylos
// src/img/ kataloge lieka vietoje ir nekeliauja į klientui atiduodamą katalogą.
const usedImages = imageNames();
for (const f of usedImages) {
  if (!existsSync(here("./src/img/" + f))) {
    throw new Error(`trūksta src/img/${f} — paleisk node tools/placeholders.mjs`);
  }
}

function copyAssets(dir) {
  for (const f of ["styles.css", "tokens.css", "theme.css", "main.js"]) cpSync(here("./src/" + f), new URL(f, dir));
  for (const d of ["fonts", "vendor"]) cpSync(here("./src/" + d + "/"), new URL(d + "/", dir), { recursive: true });
  mkdirSync(new URL("img/", dir), { recursive: true });
  for (const f of usedImages) cpSync(here("./src/img/" + f), new URL("img/" + f, dir));
}

rmSync(DIST, { recursive: true, force: true });
const written = [];

// 1. Vienas puslapis: visos įjungtos sekcijos iš eilės, meniu — inkarai.
const oneDir = new URL("./one-page/", DIST);
mkdirSync(oneDir, { recursive: true });
copyAssets(oneDir);
writeFileSync(new URL("index.html", oneDir), buildPage({
  kind: "one-page",
  title: `${site.name} — ${site.tagline}`,
  description: site.tagline,
  list: content.sections.filter((s) => s.enabled).map((s) => ({ id: s.id })),
  nav: navOne,
  current: null,
  home: "#hero",
}));
written.push("one-page/index.html");

// 2. Keli puslapiai: bendra antraštė ir poraštė, po vieną bylą kiekvienam puslapiui.
const manyDir = new URL("./multi-page/", DIST);
mkdirSync(manyDir, { recursive: true });
copyAssets(manyDir);
for (const page of pages) {
  const file = `${page.slug}.html`;
  writeFileSync(new URL(file, manyDir), buildPage({
    kind: "multi-page",
    title: `${page.title} — ${site.name}`,
    description: site.tagline,
    list: page.sections,
    nav: navMulti,
    current: file,
    home: "index.html",
  }));
  written.push("multi-page/" + file);
}

const imgs = usedImages.length;
console.log(`dist/one-page/index.html ir dist/multi-page/: ${pages.map((p) => p.slug).join(", ")}`);
console.log(`sekcijos: ${[...sections.keys()].join(", ")}`);
console.log(`nuotraukų bylos: ${imgs} (jpg + avif) · puslapiai: ${written.length}`);
if (!existsSync(here("./src/vendor/motion.js"))) throw new Error("trūksta src/vendor/motion.js");
