// Paleidimas: npm run build
// Iš content.json ir src/ padaro du variantus: dist/one-page/ ir dist/multi-page/.
// Jokių priklausomybių, jokio tinklo. Nuorodos santykinės, kad veiktų ir GitHub Pages pakatalogyje.
// Vienintelė išimtis — 404.html: Pages ją paduoda iš bet kokio gylio, todėl jos nuorodos
// absoliučios, su priešdėliu iš site.baseUrl.
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync, readdirSync } from "node:fs";
import { deflateSync } from "node:zlib";

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

// Susirenka --kintamuosius iš abiejų bylų ir išverčia var(...) nuorodas į hex.
// Ikona yra tamsi ženklo juosta, todėl rašalas ir akcentas imami iš .on-brand: ten
// theme.css jau pasakė, kas ant tamsaus fono skaitosi. Skaitant viską į vieną krūvą
// .on-brand persukdavo ir --color-bg, ir ženklo lentos gaudavo fono spalvą — dingdavo.
function themeColours() {
  const css = read("./src/tokens.css") + read("./src/theme.css");
  const vars = (selector) => {
    const map = {};
    for (const block of css.matchAll(new RegExp(`${selector}\\s*\\{([^}]*)\\}`, "g"))) {
      for (const m of block[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) map[m[1]] = m[2].trim();
    }
    return map;
  };
  const root = vars(":root");
  const band = { ...root, ...vars("\\.on-brand") };
  const resolve = (map, value, depth = 0) => {
    const ref = /^var\((--[\w-]+)\)$/.exec(value || "");
    if (!ref || depth > 5) return value;
    return resolve(map, map[ref[1]] || value, depth + 1);
  };
  const out = {
    brand: resolve(root, root["--color-brand"]),
    bg: resolve(root, root["--color-bg"]),
    ink: resolve(band, band["--color-ink"]),
    accent: resolve(band, band["--color-accent"]),
  };
  for (const [name, value] of Object.entries(out)) {
    // Ikona piešiama pikseliais, todėl spalva privalo būti #RRGGBB. Kitokia užrašymo
    // forma anksčiau būtų davusi tylią šiukšlę PNG viduje, ne klaidą.
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) throw new Error(`ikonai reikia #RRGGBB, o ${name} yra "${value}"`);
  }
  return out;
}

const theme = themeColours();

// Ženklas: dvi lentos ir pjūvis per vidurį, 32x32 tinklelyje. Aprašytas skaičiais,
// o ne dviem piešiniais, kad favicon.svg ir apple-touch-icon.png negalėtų išsiskirti.
const MARK = {
  bars: [{ x: 4, y: 9.75, w: 24, h: 2.5 }, { x: 4, y: 19.75, w: 24, h: 2.5 }],
  cut: { x: 14.75, y: 3, w: 2.5, h: 26 },
};
const box = (r, fill) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${fill}"/>`;
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">`
  + `<rect width="32" height="32" fill="${theme.brand}"/>`
  + MARK.bars.map((b) => box(b, theme.ink)).join("")
  + box(MARK.cut, theme.accent)
  + `</svg>\n`;

/* --- apple-touch-icon.png ---
   Rasterizatoriaus šitame kataloge nėra ir diegti nieko negalima, o ženklas yra trys
   stačiakampiai, todėl PNG surašomas ranka: IHDR, vienas suspaustas IDAT ir IEND.
   Dėl to ikona lieka temos dalimi: perdažius theme.css ji persipiešia kartu su viskuo kitu. */

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body));
  return Buffer.concat([head, body, tail]);
}
function markPng(size) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [bg, ink, accent] = [rgb(theme.brand), rgb(theme.ink), rgb(theme.accent)];
  const inside = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const stride = size * 3 + 1;
  const rows = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = ((x + 0.5) * 32) / size, gy = ((y + 0.5) * 32) / size;
      let c = bg;
      if (MARK.bars.some((b) => inside(b, gx, gy))) c = ink;
      if (inside(MARK.cut, gx, gy)) c = accent;
      rows.set(c, y * stride + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bitų kanalui
  ihdr[9] = 2;  // RGB be permatomumo: iOS ikonos permatomumo vis tiek nerodo
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(rows, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
const appleIcon = markPng(180);

const manifest = {
  name: site.name,
  short_name: site.name,
  lang: site.lang,
  theme_color: theme.brand,
  background_color: theme.bg,
  icons: [
    { src: "favicon.svg", type: "image/svg+xml", sizes: "any" },
    { src: "apple-touch-icon.png", type: "image/png", sizes: "180x180" },
  ],
};

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

// Adresai mašinoms: baseUrl su pasvirimu gale, pradžia — katalogas, ne index.html.
const BASE = site.baseUrl.endsWith("/") ? site.baseUrl : site.baseUrl + "/";
const BASE_PATH = new URL(BASE).pathname;
const pageUrl = (file) => BASE + (file === "index.html" ? "" : file);
const today = new Date().toISOString().slice(0, 10);

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

// Ta pati nuoroda iš to paties puslapio virsta inkaru: puslapis nepersikrauna pats į save.
function linkHref(to, kind, current) {
  const href = targetHref(to, kind);
  if (!href || !current) return href;
  if (href === current) return `#${to}`;
  if (href.startsWith(current + "#")) return href.slice(current.length);
  return href;
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
  // Nuoroda prie atsakymo apie matavimą veda ten, kur to matavimo užsakoma.
  if (id === "faq") {
    scope.items = s.items.map((item) => {
      if (!item.link) return item;
      const href = linkHref(item.link.to, kind, opts.current);
      return { ...item, link: href ? { ...item.link, href } : null };
    });
  }
  // Nuorodos į kitas sekcijas: rodomos pilnoje sekcijoje, ne anonse — anonsas jau turi savo.
  const links = (s.links || [])
    .map((l) => ({ ...l, href: linkHref(l.to, kind, opts.current) }))
    .filter((l) => l.href);
  scope.links = !opts.teaser && links.length ? links : null;
  if (opts.teaser) {
    scope.isTeaser = true;
    scope.moreHref = kind === "one-page" ? `#${id}` : targetHref(id, kind);
  } else {
    scope.isFull = true;
  }
  return scope;
}

/* --- Mašinoms skirti duomenys ---
   Tuščias laukas blogiau už nesamą: raktas įrašomas tik tada, kai turi reikšmę.
   Koordinačių (geo) čia sąmoningai nėra — tikras klientas įrašo savo, o išgalvotų nebūna. */

const clean = (obj) => Object.fromEntries(Object.entries(obj)
  .filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)));

const DAYS = { Mo: "Monday", Tu: "Tuesday", We: "Wednesday", Th: "Thursday", Fr: "Friday", Sa: "Saturday", Su: "Sunday" };
const DAY_ORDER = Object.keys(DAYS);

// „Mo-Fr 08:00-17:00“ -> OpeningHoursSpecification. Kelios eilutės skiriamos kabliataškiu.
function openingHours(text) {
  return String(text || "").split(";").map((p) => p.trim()).filter(Boolean).map((part) => {
    const m = /^([A-Za-z,-]+)\s+(\d{2}:\d{2})-(\d{2}:\d{2})$/.exec(part);
    if (!m) throw new Error(`site.openingHours nesuprantamas: "${part}" (laukta "Mo-Fr 08:00-17:00")`);
    const days = [];
    for (const token of m[1].split(",")) {
      const [from, to] = token.split("-");
      const a = DAY_ORDER.indexOf(from), b = to ? DAY_ORDER.indexOf(to) : DAY_ORDER.indexOf(from);
      if (a < 0 || b < 0) throw new Error(`nežinoma diena: ${token}`);
      for (let i = a; i <= b; i++) days.push(DAYS[DAY_ORDER[i]]);
    }
    return { "@type": "OpeningHoursSpecification", dayOfWeek: days, opens: m[2], closes: m[3] };
  });
}

const ogUrl = site.ogImage ? BASE + site.ogImage : "";
const localBusiness = clean({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: site.name,
  legalName: site.legalName,
  url: BASE,
  image: ogUrl,
  telephone: (site.phoneHref || "").replace(/^tel:/, ""),
  email: site.email,
  address: site.addr ? clean({
    "@type": "PostalAddress",
    streetAddress: site.addr.street,
    addressLocality: site.addr.locality,
    addressRegion: site.addr.region,
    postalCode: site.addr.postalCode,
    addressCountry: site.addr.country,
  }) : null,
  openingHoursSpecification: openingHours(site.openingHours),
  priceRange: site.priceRange,
  areaServed: site.areaServed,
});
const webSite = clean({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: site.name,
  url: BASE,
  inLanguage: site.lang,
});

// „<“ užrakinamas: jokia turinio reikšmė negali uždaryti <script> elemento.
const ld = (obj) => `  <script type="application/ld+json">\n${JSON.stringify(obj, null, 2).replace(/</g, "\\u003c")}\n  </script>`;

// Matomas kelias ir BreadcrumbList imami iš to paties sąrašo, todėl negali išsiskirti.
function crumbTrail(page) {
  const home = pages.find((p) => p.slug === "index");
  if (!home || !page || page.slug === "index" || !page.crumb) return null;
  return [
    { name: home.title, href: "index.html", url: BASE },
    { name: page.crumb, href: "", here: true, url: pageUrl(`${page.slug}.html`) },
  ];
}
const breadcrumbList = (trail) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: trail.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.url })),
});

/* --- Puslapis --- */

function shell({ title, description, canonical, base, nav, current, home, main, dialog, jsonld, robots }) {
  const navWithCurrent = nav.map((n) => ({
    ...n,
    current: current && n.href === current ? ' aria-current="page"' : "",
  }));
  const html = render(templates.layout, [{
    ...site,
    title,
    description,
    canonical,
    base: base || "",
    ogImage: ogUrl,
    robots,
    home,
    nav: navWithCurrent,
    main,
    dialog: dialog || "",
    jsonld: jsonld.map(ld).join("\n"),
    year: new Date().getFullYear(),
  }]);
  if (/\{\{/.test(html)) throw new Error(`liko neužpildyta vieta: ${title}`);
  return html;
}

const robotsMeta = site.noindex ? '<meta name="robots" content="noindex, nofollow">' : "";

function buildPage({ kind, page, title, description, canonical, list, nav, current, home }) {
  let body = list
    .map(({ id, teaser }) => render(templates[id], [sectionScope(id, kind, { teaser, current }), { site }, site]))
    .join("\n");
  // Kiekviename puslapyje lygiai vienas h1. Hero jį turi; puslapiuose be hero
  // pakeliama pirmoji matoma sekcijos antraštė (sr-only antraštės su klase nepaliečiamos).
  if (!/<h1[\s>]/.test(body)) body = body.replace(/<h2>([\s\S]*?)<\/h2>/, "<h1>$1</h1>");
  const trail = kind === "multi-page" ? crumbTrail(page) : null;
  const wrapper = kind === "one-page" ? templates["one-page"] : templates["page"];
  const main = render(wrapper, [{
    sections: body,
    crumbs: trail ? render(templates.crumbs, [{ trail }]) : "",
  }]);
  const jsonld = [localBusiness];
  if (canonical === BASE) jsonld.push(webSite);
  if (trail) jsonld.push(breadcrumbList(trail));
  return shell({
    title, description, canonical, nav, current, home, main, jsonld,
    robots: robotsMeta,
    dialog: list.some((s) => s.id === "works") ? templates.dialog : "",
  });
}

// 404 paduodama iš bet kokio gylio, todėl visos jos nuorodos ir resursai — absoliutūs.
// Priešdėlis imamas iš site.baseUrl, kad klientui savo srityje liktų teisingas („/“).
function buildNotFound(nav) {
  // Vieno puslapio meniu yra inkarai: iš 404 jie turi vesti į pradžios puslapį su inkaru.
  const links = nav.map((n) => ({ label: n.label, href: BASE_PATH + n.href }));
  const main = render(templates.notfound, [{ ...site.notFound, links }]);
  return shell({
    title: `${site.notFound.title} — ${site.name}`,
    description: site.notFound.text,
    canonical: "",
    base: BASE_PATH,
    nav: links,
    current: null,
    home: BASE_PATH,
    main,
    jsonld: [localBusiness],
    // Klaidos puslapis neindeksuojamas niekada, nepriklausomai nuo site.noindex.
    robots: '<meta name="robots" content="noindex, nofollow">',
  });
}

/* --- Bylos paieškos varikliams ir modeliams --- */

function sitemapXml(files) {
  const urls = files.map((f) => `  <url>\n    <loc>${esc(pageUrl(f))}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

// robots.txt seka site.noindex: kol jis true, svetainė uždaryta visiems.
function robotsTxt() {
  if (site.noindex) return `# site.noindex: true — kol taip, indeksuoti draudžiama.\nUser-agent: *\nDisallow: /\n`;
  return `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`;
}

// llms.txt (llmstxt.org): antraštė, vienas sakinys citatoje ir trumpos sekcijos su nuorodomis.
function llmsTxt(kind) {
  const links = pages.map((p) => ({
    label: p.title,
    url: kind === "one-page"
      ? (p.slug === "index" ? BASE : `${BASE}#${p.sections[0].id}`)
      : pageUrl(`${p.slug}.html`),
    text: p.description || site.tagline,
  }));
  const lines = [`# ${site.name}`, "", `> ${site.tagline}`, ""];
  if (site.fictional) lines.push("Pavyzdinė svetainė: įmonė ir jos duomenys išgalvoti.", "");
  lines.push("## Puslapiai", "");
  for (const l of links) lines.push(`- [${l.label}](${l.url}): ${l.text}`);
  lines.push("", "## Kontaktai", "");
  lines.push(`- Telefonas: ${site.phone}`);
  lines.push(`- El. paštas: ${site.email}`);
  lines.push(`- Darbo laikas: ${site.hours}`);
  if (site.addr) lines.push(`- Adresas: ${site.addr.street}, ${site.addr.locality}, ${site.addr.region}, ${site.addr.postalCode}`);
  if (site.areaServed?.length) lines.push(`- Aptarnaujama: ${site.areaServed.join(", ")}`);
  return lines.join("\n") + "\n";
}

/* --- Išvestis --- */

// Kiekviena nuotrauka gyvena dviem pločiais ir dviem formatais. Hero — savo pločiais.
const CARD_WIDTHS = [720, 1200];
const FORMATS = ["jpg", "avif", "webp"];

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
  // Dalybų nuotrauka (og:image) nerodoma puslapyje, bet privalo gulėti dist viduje.
  if (site.ogImage) names.add(site.ogImage.replace(/^img\//, ""));
  return [...names].sort();
}

// Į dist keliauja tik tos nuotraukos, kurių prašo įjungtos sekcijos: senos bylos
// src/img/ kataloge lieka vietoje ir nekeliauja į klientui atiduodamą katalogą.
const usedImages = imageNames();
for (const f of usedImages) {
  if (!existsSync(here("./src/img/" + f))) {
    throw new Error(`trūksta src/img/${f} — paleisk node tools/images.mjs`);
  }
}

function copyAssets(dir) {
  for (const f of ["styles.css", "tokens.css", "theme.css", "main.js"]) cpSync(here("./src/" + f), new URL(f, dir));
  cpSync(here("./src/fonts/"), new URL("fonts/", dir), { recursive: true });
  mkdirSync(new URL("img/", dir), { recursive: true });
  for (const f of usedImages) cpSync(here("./src/img/" + f), new URL("img/" + f, dir));
}

// Ikonos, manifestas ir bylos robotams — vienodai abiem variantams.
function writeExtras(dir, kind, files) {
  writeFileSync(new URL("favicon.svg", dir), faviconSvg);
  writeFileSync(new URL("apple-touch-icon.png", dir), appleIcon);
  writeFileSync(new URL("site.webmanifest", dir), JSON.stringify(manifest, null, 2) + "\n");
  writeFileSync(new URL("sitemap.xml", dir), sitemapXml(files));
  writeFileSync(new URL("robots.txt", dir), robotsTxt());
  writeFileSync(new URL("llms.txt", dir), llmsTxt(kind));
  writeFileSync(new URL("404.html", dir), buildNotFound(kind === "one-page" ? navOne : navMulti));
}

rmSync(DIST, { recursive: true, force: true });
const written = [];
const homePage = pages.find((p) => p.slug === "index");

// 1. Vienas puslapis: visos įjungtos sekcijos iš eilės, meniu — inkarai.
const oneDir = new URL("./one-page/", DIST);
mkdirSync(oneDir, { recursive: true });
copyAssets(oneDir);
writeFileSync(new URL("index.html", oneDir), buildPage({
  kind: "one-page",
  page: homePage,
  title: `${site.name} — ${site.tagline}`,
  description: homePage?.description || site.tagline,
  canonical: BASE,
  list: content.sections.filter((s) => s.enabled).map((s) => ({ id: s.id })),
  nav: navOne,
  current: null,
  home: "#hero",
}));
written.push("one-page/index.html");
writeExtras(oneDir, "one-page", ["index.html"]);

// 2. Keli puslapiai: bendra antraštė ir poraštė, po vieną bylą kiekvienam puslapiui.
const manyDir = new URL("./multi-page/", DIST);
mkdirSync(manyDir, { recursive: true });
copyAssets(manyDir);
for (const page of pages) {
  const file = `${page.slug}.html`;
  writeFileSync(new URL(file, manyDir), buildPage({
    kind: "multi-page",
    page,
    title: `${page.title} — ${site.name}`,
    description: page.description || site.tagline,
    canonical: pageUrl(file),
    list: page.sections,
    nav: navMulti,
    current: file,
    home: "index.html",
  }));
  written.push("multi-page/" + file);
}
writeExtras(manyDir, "multi-page", pages.map((p) => `${p.slug}.html`));

const imgs = usedImages.length;
console.log(`dist/one-page/index.html ir dist/multi-page/: ${pages.map((p) => p.slug).join(", ")}`);
console.log(`sekcijos: ${[...sections.keys()].join(", ")}`);
console.log(`nuotraukų bylos: ${imgs} (jpg + avif + webp) · puslapiai: ${written.length}`);
console.log(`kiekvienam variantui: sitemap.xml, robots.txt (noindex: ${!!site.noindex}), llms.txt, 404.html, favicon.svg, apple-touch-icon.png, site.webmanifest`);
