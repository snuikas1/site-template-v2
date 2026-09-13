// Paleidimas: node test/harness.mjs   (npm test)
// Abu variantai — dist/one-page/ ir dist/multi-page/ — praeinami puslapis po puslapio,
// telefono ir stalinio kompiuterio pločiu, headless Edge naršyklėje per CDP.
// Katalogas paduodamas per http, kad persiųsti baitai būtų tikri. Krenta su ne nuliu, jei kas nepraeina.
// Ekrano nuotraukos: test/shots/<variantas>-<puslapis>-<plotis>.png ir du kontaktiniai lapai.
//
// Kontrastas ČIA NESKAIČIUOJAMAS. Jį matuoja site-verify check.mjs gyvoje naršyklėje,
// vaikščiodamas po tikrą DOM; skaičiavimas iš temos kintamųjų praeidavo tada, kai puslapis
// krisdavo (teisingi žetonai, neteisingai prirašyti elementai), todėl ta koja iš čia išimta.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync, unlinkSync, cpSync } from "node:fs";
import { extname, join, dirname, normalize } from "node:path";

const EDGE = "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge";
const ROOT = new URL("../", import.meta.url).pathname;
const OUT = new URL(".", import.meta.url).pathname;
const SHOTS = OUT + "shots";
const TMP = OUT + "tmp";
// Prievadai parenkami laisvi: fiksuotas numeris sugenda, kai po nutraukto testo lieka gyva naršyklė.
const freePort = async () => {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));
  return port;
};
const WIDTHS = [{ w: 390, h: 844, mobile: true }, { w: 1280, h: 800, mobile: false }];
const BYTE_BUDGET = 1.5 * 1024 * 1024;
const MAX_SHOT_PX = 6000;

const content = JSON.parse(readFileSync(ROOT + "content.json", "utf8"));
const credits = JSON.parse(readFileSync(ROOT + "src/img/credits.json", "utf8"));
const site = content.site;
const enabled = content.sections.filter((s) => s.enabled);
const sectionIds = new Set(enabled.map((s) => s.id));
const sectionById = new Map(content.sections.map((s) => [s.id, s]));

// Tie patys sprendimai kaip build.mjs: puslapis be įjungtų sekcijų nerenkamas.
const livePages = content.pages
  .map((p) => ({ ...p, sections: p.sections.filter((s) => sectionIds.has(s.id)) }))
  .filter((p) => p.sections.length);

// Tie patys adresai, kuriuos skaičiuoja build.mjs — bet perskaičiuoti čia iš naujo,
// kad patikrinimas nesiremtų tuo pačiu kodu, kurį tikrina.
const BASE = site.baseUrl.endsWith("/") ? site.baseUrl : site.baseUrl + "/";
const BASE_PATH = new URL(BASE).pathname;
const canonicalFor = (file) => BASE + (file === "index.html" ? "" : file);
const JS_BUDGET = 20 * 1024;

const BUILDS = [
  {
    name: "one-page",
    dir: "dist/one-page/",
    pages: [{
      file: "index.html",
      title: `${site.name} — ${site.tagline}`,
      sections: enabled.map((s) => s.id),
    }],
  },
  {
    name: "multi-page",
    dir: "dist/multi-page/",
    pages: livePages.map((p) => ({
      file: `${p.slug}.html`,
      title: `${p.title} — ${site.name}`,
      sections: p.sections.map((s) => s.id),
      crumb: p.crumb,
    })),
  },
];

for (const build of BUILDS) {
  for (const page of build.pages) {
    if (!existsSync(ROOT + build.dir + page.file)) {
      console.error(`trūksta ${build.dir}${page.file} — paleisk npm run build`);
      process.exit(1);
    }
  }
}
rmSync(SHOTS, { recursive: true, force: true });
mkdirSync(SHOTS, { recursive: true });
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });

/* --- Tikrasis kontrasto auditas: site-verify check.mjs --- */

// Skriptas gyvena skill'e ir yra tik skaitomas. Jis pats pasileidžia naršyklę,
// paduoda katalogą per http ir išmatuoja kiekvieno matomo teksto kontrastą
// trimis ėjimais: 1280x800, 390x844 ir 1280x800 su emuliuota tamsia tema.
const CHECK = "/Users/snuikas/.claude/skills/site-verify/scripts/check.mjs";

// check.mjs visada atidaro serverio šaknį, tai yra index.html, ir daugiau niekur neina.
// Paduoti jam katalogą reiškia išmatuoti TIK pradžios puslapį — keturi iš penkių liktų
// nepatikrinti. Todėl kiekvienas puslapis paeiliui padedamas index.html vieton laikinoje
// kopijoje. Išmatuota 2026-09-13: be šito v1 ir v2 „green" rėmėsi vienu puslapiu iš šešių.
function runCheck(build) {
  const stage = `${TMP}/verify-${build.name}/`;
  rmSync(stage, { recursive: true, force: true });
  cpSync(ROOT + build.dir, stage, { recursive: true });

  const results = [];
  for (const page of build.pages) {
    if (page.file !== "index.html") cpSync(stage + page.file, stage + "index.html");
    const slug = page.file.replace(/\.html$/, "");
    const res = spawnSync("node", [CHECK, stage, `${SHOTS}/verify-${build.name}-${slug}`], { encoding: "utf8" });
    const out = ((res.stdout || "") + (res.stderr || "")).trim();
    const lines = out.split("\n").map((l) => l.trimEnd());
    results.push({
      file: page.file,
      slug,
      ok: res.status === 0,
      passes: lines.filter((l) => /^(PASS|FAIL)\s/.test(l.trim())),
      problems: res.status === 0 ? [] : lines.filter((l) => l.trim()).map((l) => l.trim()),
      tail: lines.slice(-1)[0] || "",
    });
  }
  rmSync(stage, { recursive: true, force: true });
  return results;
}

/* --- Serveris --- */

const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".jpg": "image/jpeg", ".png": "image/png",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8", ".webmanifest": "application/manifest+json",
};
// GitHub Pages 404.html paduoda iš bet kokio gylio, o jos resursai absoliutūs
// (/site-template-v2/styles.css). Kad tai būtų tikrinama taip, kaip veiks gyvai,
// tikrinamas variantas laikinai prikabinamas prie to paties priešdėlio.
let mount = null;
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  let file = join(ROOT, path === "/" ? "index.html" : path);
  if (mount && path.startsWith(mount.prefix)) {
    file = join(ROOT, mount.dir, path.slice(mount.prefix.length) || "index.html");
    if (file.startsWith(ROOT) && (!existsSync(file) || statSync(file).isDirectory())) {
      const missing = join(ROOT, mount.dir, "404.html");
      res.writeHead(404, { "content-type": TYPES[".html"] }).end(readFileSync(missing));
      return;
    }
  }
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404).end("not found");
    return;
  }
  res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
const HTTP_PORT = await freePort();
const CDP_PORT = await freePort();
await new Promise((r) => server.listen(HTTP_PORT, "127.0.0.1", r));
const base = `http://127.0.0.1:${HTTP_PORT}/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Tikri Core Web Vitals iš paties puslapio. Įrašoma prieš bet kokį puslapio skriptą,
// todėl LCP ir layout-shift įrašai nepraslysta. Skaičiuojama, o ne spėjama.
const VITALS = `(() => {
  window.__vitals = { lcp: 0, cls: 0, shifts: 0 };
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) window.__vitals.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__vitals.cls += e.value;
      window.__vitals.shifts++;
    }
  }).observe({ type: "layout-shift", buffered: true });
})()`;
const LCP_BUDGET = 2500;
const CLS_BUDGET = 0.1;

// Naršyklė paleidžiama iš naujo kiekvienam puslapiui. Viena ilgai gyvenanti kortelė
// po kelių pilno puslapio kadrų ir emuliacijų nustoja atsakinėti į CDP, ir testas pakimba;
// nauja kortelė kiekvienam puslapiui tą atima, o paleidimas kainuoja apie sekundę.
let ws = null;
let id = 0;
const pending = new Map();
let noise = [];        // konsolės klaidos, išimtys ir nepavykusios užklausos tikrinamame puslapyje
let requests = [];     // { url, bytes } tikrinamame puslapyje

async function pageTarget(port) {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) return page;
    } catch { /* dar nepasileido */ }
    await sleep(250);
  }
  throw new Error("Edge neatidarė derinimo prievado");
}

async function startBrowser() {
  const port = await freePort();
  // Trys vėliavėlės būtinos: be jų headless kortelė lieka "hidden",
  // o IntersectionObserver (taigi ir Motion inView) nepasileidžia, nors puslapis slenkamas.
  const edge = spawn(EDGE, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars",
    `--remote-debugging-port=${port}`, "--window-size=1440,900",
    "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding",
    "--disable-background-timer-throttling", "--disable-dev-shm-usage",
    "--user-data-dir=" + OUT + "edge-profile", "about:blank",
  ], { stdio: "ignore" });
  const target = await pageTarget(port);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  id = 0;
  pending.clear();
  ws.addEventListener("message", onMessage);
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Page.setWebLifecycleState", { state: "active" });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: VITALS });
  return edge;
}

async function stopBrowser(edge) {
  try { ws.close(); } catch { /* jau uždaryta */ }
  edge.kill("SIGKILL");
  await sleep(250);
}

function onMessage(m) {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === "Runtime.exceptionThrown") {
    noise.push("exception: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  } else if (msg.method === "Log.entryAdded" && msg.params.entry.level === "error") {
    noise.push("log: " + msg.params.entry.text + (msg.params.entry.url ? " " + msg.params.entry.url : ""));
  } else if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    noise.push("console: " + msg.params.args.map((a) => a.value ?? a.description).join(" "));
  } else if (msg.method === "Inspector.targetCrashed") {
    noise.push("naršyklės kortelė nulūžo");
  } else if (msg.method === "Network.loadingFailed" && !msg.params.canceled) {
    noise.push("request failed: " + msg.params.errorText);
  } else if (msg.method === "Network.requestWillBeSent") {
    requests.push({ id: msg.params.requestId, url: msg.params.request.url, bytes: 0 });
  } else if (msg.method === "Network.responseReceived") {
    const r = requests.find((x) => x.id === msg.params.requestId);
    if (r) r.status = msg.params.response.status;
  } else if (msg.method === "Network.loadingFinished") {
    const r = requests.find((x) => x.id === msg.params.requestId);
    if (r) r.bytes = msg.params.encodedDataLength;
  }
}
// Kiekvienas CDP kvietimas su laikrodžiu: pakibusi naršyklė turi nutraukti testą, o ne kabinti jį amžiams.
function send(method, params = {}, timeout = 45000) {
  return new Promise((resolve, reject) => {
    const n = ++id;
    const timer = setTimeout(() => {
      pending.delete(n);
      reject(new Error(`${method} neatsakė per ${timeout} ms`));
    }, timeout);
    pending.set(n, (msg) => {
      clearTimeout(timer);
      msg.error ? reject(new Error(method + ": " + JSON.stringify(msg.error))) : resolve(msg.result);
    });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("evaluate failed: " + JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function load(url) {
  const loaded = new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeEventListener("message", h); reject(new Error("puslapis neįsikėlė per 45 s: " + url)); }, 45000);
    const h = (m) => {
      if (JSON.parse(m.data).method === "Page.loadEventFired") {
        clearTimeout(timer);
        ws.removeEventListener("message", h);
        resolve();
      }
    };
    ws.addEventListener("message", h);
  });
  noise = [];
  requests = [];
  await send("Page.navigate", { url });
  await loaded;
}
async function key(name, code) {
  for (const type of ["rawKeyDown", "keyUp"]) {
    await send("Input.dispatchKeyEvent", { type, key: name, code: name, windowsVirtualKeyCode: code, nativeVirtualKeyCode: code });
  }
}

// Perbėga puslapį taip, kaip skaitytojas, kad suveiktų kiekvienas pasirodymas,
// tada grįžta į viršų ir palaukia, kol animacijos nusėda.
const SCROLL_THROUGH = `new Promise((done) => {
  let y = 0;
  const step = () => {
    y += innerHeight * 0.8;
    // "instant" būtina: puslapyje įjungtas scroll-behavior: smooth, o sklandi slinktis
    // kas 90 ms perkraunama iš naujo ir puslapis lieka vietoje.
    scrollTo({ top: y, behavior: "instant" });
    if (y < document.documentElement.scrollHeight) return setTimeout(step, 90);
    setTimeout(() => { scrollTo({ top: 0, behavior: "instant" }); setTimeout(done, 700); }, 400);
  };
  step();
})`;

// Viskas, ką puslapis privalo turėti, nuskaitoma iš gyvo DOM vienu ėjimu.
const INSPECT = `(() => {
  const links = Array.from(document.querySelectorAll("a[href]")).map((a) => a.getAttribute("href"));
  const assets = Array.from(document.querySelectorAll("[src]")).map((e) => e.getAttribute("src"));
  // srcset ir <source> nepatenka į [src], o būtent ten gyvena visi AVIF variantai:
  // klaidingas kelias ten tyliai nusileistų į JPEG ir niekas to nepastebėtų.
  const sets = Array.from(document.querySelectorAll("[srcset]"))
    .flatMap((e) => e.getAttribute("srcset").split(",").map((c) => c.trim().split(/\\s+/)[0]))
    .filter(Boolean);
  const robots = document.querySelector('meta[name="robots"]');
  const canonical = document.querySelector('link[rel="canonical"]');
  const revealed = Array.from(document.querySelectorAll(".reveal, .reveal-group > *, [data-hero]"));
  return {
    lang: document.documentElement.lang,
    title: document.title,
    robots: robots ? robots.content : "",
    canonical: canonical ? canonical.getAttribute("href") : "",
    meta: Object.fromEntries(Array.from(document.querySelectorAll("meta[name], meta[property]"))
      .map((m) => [m.getAttribute("name") || m.getAttribute("property"), m.getAttribute("content") || ""])),
    jsonld: Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((n) => n.textContent),
    crumbs: Array.from(document.querySelectorAll(".crumbs li")).map((li) => ({
      name: li.textContent.trim(),
      href: li.querySelector("a") ? li.querySelector("a").getAttribute("href") : "",
      current: !!li.querySelector('[aria-current="page"]'),
    })),
    h1s: Array.from(document.querySelectorAll("h1")).map((h) => h.textContent.trim()),
    links, assets, sets,
    picked: Array.from(document.images).map((i) => i.currentSrc),
    currentPage: Array.from(document.querySelectorAll('.nav a[aria-current="page"]')).map((a) => a.getAttribute("href")),
    currentAnchor: Array.from(document.querySelectorAll('.nav a[aria-current="true"]')).map((a) => a.getAttribute("href")),
    navHrefs: Array.from(document.querySelectorAll(".nav a")).map((a) => a.getAttribute("href")),
    imgs: Array.from(document.images).map((i) => ({
      src: i.getAttribute("src"), w: i.getAttribute("width"), h: i.getAttribute("height"),
      alt: i.getAttribute("alt"), natural: i.naturalWidth, lazy: i.getAttribute("loading"),
    })),
    // Tuščias AVIF (visi pikseliai permatomi) atrodo kaip veikianti byla: naturalWidth
    // teisingas, užklausa 200, o ekrane nieko. Tikrinama nupiešus į drobę.
    blank: Array.from(document.images).map((i) => {
      const c = document.createElement("canvas");
      c.width = 4; c.height = 4;
      const x = c.getContext("2d");
      try { x.drawImage(i, 0, 0, 4, 4); } catch (e) { return null; }
      const d = x.getImageData(0, 0, 4, 4).data;
      for (let p = 3; p < d.length; p += 4) if (d[p] > 0) return null;
      return (i.currentSrc || i.src).split("/").pop();
    }).filter(Boolean),
    revealCount: revealed.length,
    hidden: revealed.filter((e) => +getComputedStyle(e).opacity < 1).length,
    sectionIds: Array.from(document.querySelectorAll("main section")).map((s) => s.id),
    anchorIds: Array.from(document.querySelectorAll("[id]")).map((e) => e.id),
    statsItems: Array.from(document.querySelectorAll(".stat")).map((e) => e.textContent.replace(/\\s+/g, " ").trim()),
    scrollW: document.documentElement.scrollWidth,
    innerW: innerWidth,
    height: document.documentElement.scrollHeight,
    font: getComputedStyle(document.body).fontFamily,
    fontsLoaded: Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => f.family),
    visible: document.visibilityState === "visible",
    motionOn: document.documentElement.classList.contains("js"),
    stuck: !!document.querySelector(".masthead.is-stuck"),
  };
})()`;

// JSON-LD: kiekvienas objektas privalo turėti @type, ir nė viena reikšmė negali būti tuščia.
// Tuščias laukas atrodo kaip užpildytas ir praslysta pro akis — tokio geriau nerašyti visai.
function ldProblems(node, path, out = []) {
  if (Array.isArray(node)) node.forEach((v, i) => ldProblems(v, `${path}[${i}]`, out));
  else if (node && typeof node === "object") {
    if (!node["@type"]) out.push(`${path} be @type`);
    for (const [k, v] of Object.entries(node)) ldProblems(v, `${path}.${k}`, out);
  } else if (typeof node === "string" && !node.trim()) out.push(`${path} tuščias`);
  return out;
}

const OG_TAGS = ["og:type", "og:site_name", "og:locale", "og:title", "og:description", "og:url",
  "og:image", "og:image:width", "og:image:height",
  "twitter:card", "twitter:title", "twitter:description", "twitter:image"];

let failed = 0;
const report = [];
const canonicals = new Map();
const vitalsLog = [];
const titles = new Map();
const shots = { "one-page": [], "multi-page": [] };

try {
  for (const build of BUILDS) {
    for (const page of build.pages) {
      const problems = [];
      const weights = {};
      const jsWeights = {};
      const edge = await startBrowser();
      const url = base + build.dir + page.file;
      const pageDir = dirname(build.dir + page.file);
      const hasWorks = page.sections.includes("works");
      const hasContact = page.sections.includes("contact");
      const hasStats = page.sections.includes("stats");

      for (const { w, h, mobile } of WIDTHS) {
        await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
        await load(url);
        await sleep(350);
        // LCP nuskaitomas PRIEŠ slinktį: paslinkus žemyn į kadrą įeitų didesni paveikslėliai
        // ir „didžiausias“ elementas pasikeistų — tai jau nebūtų pirmo ekrano LCP.
        const lcp = await evaluate("window.__vitals.lcp");
        await evaluate(SCROLL_THROUGH);
        const vitals = await evaluate("window.__vitals");
        const s = await evaluate(INSPECT);
        const at = `${w}px`;
        vitalsLog.push({ page: `${build.name}/${page.file}`, w, lcp, cls: vitals.cls, shifts: vitals.shifts });
        if (!lcp) problems.push(`${at} LCP neišmatuotas (PerformanceObserver nedavė įrašo)`);
        else if (lcp > LCP_BUDGET) problems.push(`${at} LCP ${lcp.toFixed(0)} ms, virš ${LCP_BUDGET} ms`);
        if (vitals.cls > CLS_BUDGET) problems.push(`${at} CLS ${vitals.cls.toFixed(3)}, virš ${CLS_BUDGET}`);
        for (const n of noise) problems.push(`${at} ${n}`);
        if (s.lang !== site.lang) problems.push(`${at} lang yra "${s.lang}"`);
        if (site.noindex && (!/noindex/.test(s.robots) || !/nofollow/.test(s.robots))) {
          problems.push(`${at} robots meta yra "${s.robots}"`);
        }
        if (s.h1s.length !== 1) problems.push(`${at} ${s.h1s.length} h1 elementai`);
        if (s.title !== page.title) problems.push(`${at} antraštė yra "${s.title}", laukta "${page.title}"`);
        const titleKey = build.name + "|" + s.title;
        if (titles.has(titleKey) && titles.get(titleKey) !== page.file) {
          problems.push(`${at} antraštė kartojasi su ${titles.get(titleKey)}`);
        }
        titles.set(titleKey, page.file);
        // Galvutė paieškai ir dalyboms. Canonical skaičiuojamas iš content.json, o ne
        // imamas iš puslapio: kitaip tikrintume tik tai, kad puslapis sutampa su savimi.
        const wantCanonical = canonicalFor(page.file);
        if (s.canonical !== wantCanonical) problems.push(`${at} canonical yra "${s.canonical}", laukta "${wantCanonical}"`);
        const canonKey = build.name + "|" + s.canonical;
        if (canonicals.has(canonKey) && canonicals.get(canonKey) !== page.file) {
          problems.push(`${at} canonical kartojasi su ${canonicals.get(canonKey)}`);
        }
        canonicals.set(canonKey, page.file);
        if (!(s.meta.description || "").trim()) problems.push(`${at} nėra meta description`);
        for (const tag of OG_TAGS) if (!(s.meta[tag] || "").trim()) problems.push(`${at} trūksta ${tag}`);
        if (s.meta["og:url"] !== wantCanonical) problems.push(`${at} og:url yra "${s.meta["og:url"]}"`);
        if (s.meta["og:title"] !== s.title) problems.push(`${at} og:title nesutampa su antrašte`);
        if (s.meta["og:description"] !== s.meta.description) problems.push(`${at} og:description nesutampa su description`);
        if (s.meta["twitter:card"] !== "summary_large_image") problems.push(`${at} twitter:card yra "${s.meta["twitter:card"]}"`);
        const ogImage = s.meta["og:image"] || "";
        if (!ogImage.startsWith(BASE)) problems.push(`${at} og:image ne absoliutus: "${ogImage}"`);
        else if (!existsSync(join(ROOT, build.dir, ogImage.slice(BASE.length)))) {
          problems.push(`${at} og:image nerodo į bylą: ${ogImage}`);
        }

        // JSON-LD: kiekvienas blokas parsinamas, su @type ir be tuščių reikšmių.
        const ldTypes = [];
        let ldCrumb = null;
        for (const raw of s.jsonld) {
          let data;
          try { data = JSON.parse(raw); } catch (e) { problems.push(`${at} JSON-LD neperskaitomas: ${e.message}`); continue; }
          ldTypes.push(data["@type"]);
          if (data["@type"] === "BreadcrumbList") ldCrumb = data;
          for (const bad of ldProblems(data, data["@type"] || "?")) problems.push(`${at} JSON-LD ${bad}`);
        }
        const wantTypes = ["LocalBusiness"];
        if (page.file === "index.html") wantTypes.push("WebSite");
        if (page.crumb) wantTypes.push("BreadcrumbList");
        for (const t of wantTypes) if (!ldTypes.includes(t)) problems.push(`${at} nėra ${t} JSON-LD bloko`);
        for (const t of ldTypes) if (!wantTypes.includes(t)) problems.push(`${at} netikėtas JSON-LD blokas: ${t}`);

        // Matomas kelias ir BreadcrumbList turi sakyti tą patį — kitaip vienas iš jų meluoja.
        if (page.crumb) {
          const shown = s.crumbs.map((c) => c.name).join(" / ");
          const said = (ldCrumb?.itemListElement || []).map((i) => i.name).join(" / ");
          if (!shown) problems.push(`${at} nėra matomo kelio`);
          else if (shown !== said) problems.push(`${at} matomas kelias "${shown}" nesutampa su BreadcrumbList "${said}"`);
          if (s.crumbs.length && (!s.crumbs.at(-1).current || s.crumbs.at(-1).href)) {
            problems.push(`${at} paskutinis kelio žingsnis turi būti be nuorodos ir su aria-current="page"`);
          }
          if (s.crumbs[0] && !s.crumbs[0].href) problems.push(`${at} kelio pradžia be nuorodos`);
        } else if (s.crumbs.length) {
          problems.push(`${at} kelias rodomas puslapyje, kuris jo neturi`);
        }

        if (s.scrollW > s.innerW + 1) problems.push(`${at} horizontalus perpildymas: ${s.scrollW} > ${s.innerW}`);
        if (!s.revealCount) problems.push(`${at} puslapyje nėra nė vieno pasirodančio bloko`);
        if (s.hidden) problems.push(`${at} ${s.hidden} iš ${s.revealCount} blokų liko permatomi po slinkties`);
        if (!/Instrument Sans/.test(s.font)) problems.push(`${at} kūno šriftas yra ${s.font}`);
        if (!s.fontsLoaded.some((f) => /Instrument Sans/.test(f))) problems.push(`${at} Instrument Sans neįsikėlė`);
        if (!s.fontsLoaded.some((f) => /Instrument Serif/.test(f))) problems.push(`${at} Instrument Serif neįsikėlė`);
        if (!s.visible) problems.push(`${at} kortelė laikoma paslėpta — IntersectionObserver nepasileis`);
        if (!s.motionOn) problems.push(`${at} puslapis neįjungė animacijų (nėra .js klasės)`);

        // Kainų sekcija išjungta: jos neturi būti nei puslapyje, nei meniu.
        const pricesOn = sectionById.get("prices")?.enabled;
        if (!pricesOn) {
          if (s.sectionIds.includes("prices")) problems.push(`${at} kainų sekcija rodoma, nors išjungta`);
          if (s.navHrefs.some((href) => /prices|kainos/.test(href))) problems.push(`${at} meniu rodo kainas, nors jos išjungtos`);
        }

        // Skaičiai turi rodyti galutines reikšmes, ne tarpinę animacijos būseną.
        // Skaičius ir parašas gyvena atskiruose elementuose, todėl tikrinama pora,
        // o ne vientisas tekstas: svarbu, kad matytųsi galutinė reikšmė, ne animacijos vidurys.
        if (hasStats) {
          for (const item of sectionById.get("stats").items) {
            if (item.count == null) continue;
            const label = (item.after || "").trim();
            const hit = s.statsItems.some((t) => t.includes(String(item.count)) && (!label || t.includes(label)));
            if (!hit) problems.push(`${at} skaičiai nerodo "${item.count} ${label}"`);
          }
        }

        for (const img of s.imgs) {
          if (!img.w || !img.h) problems.push(`${at} img be width/height: ${img.src}`);
          if (!img.alt || !img.alt.trim()) problems.push(`${at} img be alt: ${img.src}`);
          if (!img.natural) problems.push(`${at} img neatsidarė: ${img.src}`);
        }
        for (const b of s.blank) problems.push(`${at} nuotrauka nupiešiama tuščia (visi pikseliai permatomi): ${b}`);
        const hero = s.imgs.find((i) => /hero/.test(i.src || ""));
        if (hero && hero.lazy === "lazy") problems.push(`${at} hero nuotrauka pažymėta loading="lazy"`);

        // Nuorodos: vidinės turi rasti tikrą bylą, o nė viena negali vesti iš šios mašinos.
        for (const href of s.links) {
          if (/^(tel:|mailto:)/.test(href)) continue;
          if (/^https?:/i.test(href) || href.startsWith("//")) { problems.push(`${at} išorinė nuoroda: ${href}`); continue; }
          const bare = href.split("#")[0].split("?")[0];
          const anchor = href.includes("#") ? href.split("#")[1] : "";
          if (!bare) {
            if (anchor && !s.anchorIds.includes(anchor)) problems.push(`${at} inkaras be taikinio: ${href}`);
            continue;
          }
          if (!existsSync(join(ROOT, pageDir, bare))) problems.push(`${at} neveikianti nuoroda: ${href}`);
        }
        for (const src of [...s.assets, ...s.sets]) {
          if (/^(https?:)?\/\//i.test(src)) problems.push(`${at} išorinis resursas: ${src}`);
          else if (src && !src.startsWith("data:") && !existsSync(join(ROOT, pageDir, src))) {
            problems.push(`${at} trūksta resurso: ${src}`);
          }
        }
        // Edge moka AVIF, todėl <picture> privalo atiduoti būtent jį. Jei atiduoda JPEG,
        // reiškia AVIF pakopos kelias neteisingas ir visas svoris keliauja veltui.
        const jpegPicked = s.picked.filter((u) => /\.jpe?g$/i.test(u));
        if (jpegPicked.length) problems.push(`${at} naršyklė pasirinko JPEG vietoj AVIF: ${jpegPicked.join(", ")}`);
        for (const r of requests) {
          if (!r.url.startsWith(base) && !r.url.startsWith("data:")) problems.push(`${at} užklausa išėjo iš localhost: ${r.url}`);
        }
        // Tas pats šriftas ar stilius du kartus = pamirštas crossorigin prie <link rel=preload>:
        // preload nusėda ne į tą talpyklos kibirą ir byla parsiunčiama dukart.
        // Nuotraukos čia netikrinamos sąmoningai: su Network.setCacheDisabled naršyklės
        // spekuliatyvus skaitytuvas ir parseris kartais užsako tą patį paveikslėlį du kartus
        // (išmatuota: „other" ir „parser" iniciatoriai per 13 ms), o su įprasta talpykla —
        // ne. Tai matavimo šalutinis poveikis, ne puslapio klaida.
        const preloaded = /\.(woff2|css|js)$/;
        const seen = new Map();
        for (const r of requests) {
          if (!preloaded.test(new URL(r.url).pathname)) continue;
          seen.set(r.url, [...(seen.get(r.url) || []), r.bytes]);
        }
        for (const [url, sizes] of seen) {
          if (sizes.length > 1) problems.push(`${at} ${url.replace(base, "")} užsakytas ${sizes.length} kartus (${sizes.join(" B, ")} B)`);
        }

        const bytes = requests.reduce((sum, r) => sum + r.bytes, 0);
        weights[w] = bytes;
        if (bytes > BYTE_BUDGET) problems.push(`${at} persiųsta ${(bytes / 1024).toFixed(0)} KB, virš 1,5 MB`);

        // Puslapio JS telpa į 20 KB, ir Motion nebėra: nei bylos, nei užklausos.
        // Buvo 137 KB vienoje bibliotekoje prieš 9 KB savo kodo — todėl riba čia ir atsirado.
        const js = requests.filter((r) => /\.js$/.test(new URL(r.url).pathname));
        const jsBytes = js.reduce((sum, r) => sum + r.bytes, 0);
        jsWeights[w] = jsBytes;
        if (jsBytes > JS_BUDGET) problems.push(`${at} JS ${(jsBytes / 1024).toFixed(1)} KB, virš ${JS_BUDGET / 1024} KB`);
        for (const r of js) {
          if (/vendor\/motion/.test(r.url)) problems.push(`${at} puslapis vis dar užsako ${r.url.replace(base, "")}`);
        }

        // Meniu žymė: keliuose puslapiuose — aria-current="page", viename — "true" pagal matomą sekciją.
        if (build.name === "multi-page") {
          if (s.currentPage.length !== 1) problems.push(`${at} ${s.currentPage.length} meniu punktai su aria-current="page"`);
          else if (s.currentPage[0] !== page.file) problems.push(`${at} aria-current rodo į ${s.currentPage[0]}`);
        }

        const shot = `${build.name}-${page.file.replace(".html", "")}-${w}.png`;
        // Aukšti puslapiai fotografuojami sumažinti: pilno dydžio kadras virš ~6000 px
        // suvalgo tiek atminties, kad naršyklė nustoja atsakinėti vidury testo.
        const scale = Math.min(1, MAX_SHOT_PX / s.height);
        const png = await send("Page.captureScreenshot", {
          format: "png", captureBeyondViewport: true,
          clip: { x: 0, y: 0, width: w, height: s.height, scale },
        });
        writeFileSync(`${SHOTS}/${shot}`, Buffer.from(png.data, "base64"));
        shots[build.name].push({ file: shot, label: `${page.file} · ${w}px` });

        // Antraštė: po 24 px slinkties gauna foną ir plaukelį, grįžus į viršų — vėl plika.
        const sticky = await evaluate(`(async () => {
          scrollTo({ top: 200, behavior: "instant" });
          await new Promise((r) => setTimeout(r, 250));
          const down = document.querySelector(".masthead").classList.contains("is-stuck");
          scrollTo({ top: 0, behavior: "instant" });
          await new Promise((r) => setTimeout(r, 250));
          return { down, up: document.querySelector(".masthead").classList.contains("is-stuck") };
        })()`);
        if (!sticky.down) problems.push(`${at} antraštė negavo .is-stuck paslinkus 200 px`);
        if (sticky.up) problems.push(`${at} antraštė liko .is-stuck grįžus į viršų`);

        // Veiksmai — po nuotraukos, kad ji rodytų puslapį tokį, koks atsidaro.
        if (mobile) {
          const nav = await evaluate(`(async () => {
            const b = document.querySelector(".nav-toggle"), n = document.getElementById("pagrindinis-meniu");
            const shut = getComputedStyle(n).display;
            b.click();
            const openState = { aria: b.getAttribute("aria-expanded"), display: getComputedStyle(n).display };
            b.click();
            return { shut, openState, closed: { aria: b.getAttribute("aria-expanded"), display: getComputedStyle(n).display } };
          })()`);
          if (nav.shut !== "none") problems.push(`${at} meniu matomas dar nepaspaudus mygtuko`);
          if (nav.openState.aria !== "true" || nav.openState.display === "none") problems.push(`${at} meniu neatsidarė paspaudus`);
          if (nav.closed.aria !== "false" || nav.closed.display !== "none") problems.push(`${at} meniu neužsidarė antru paspaudimu`);
        }

        if (hasWorks) {
          const opened = await evaluate(`(async () => {
            const d = document.getElementById("darbo-langas");
            document.querySelector(".work-shot").click();
            await new Promise((r) => setTimeout(r, 500));
            const img = d.querySelector(".lightbox-photo img");
            return {
              open: d.open, src: img.getAttribute("src"), natural: img.naturalWidth,
              title: d.querySelector(".lightbox-title").textContent,
              credit: d.querySelector(".lightbox-credit").textContent,
              opacity: +getComputedStyle(d).opacity,
            };
          })()`);
          if (!opened.open) problems.push(`${at} galerijos langas neatsidarė`);
          if (!opened.natural) problems.push(`${at} galerijos nuotrauka neįsikėlė: ${opened.src}`);
          if (!opened.title.trim()) problems.push(`${at} galerijos langas be pavadinimo`);
          // Parašas surenkamas iš src/img/credits.json — tikrinama ta pati eilutė, kurią
          // surinko build.mjs, kad pakeitus pakaitalus tikromis nuotraukomis testas liktų teisingas.
          const firstPhoto = sectionById.get("works").items[0].photo;
          const c = credits[firstPhoto] || {};
          const wantCredit = `Nuotrauka: ${c.author}, ${c.source}, ${c.license}`;
          if (opened.credit !== wantCredit) problems.push(`${at} galerijos parašas "${opened.credit}", laukta "${wantCredit}"`);
          if (opened.opacity < 1) problems.push(`${at} galerijos langas liko permatomas (${opened.opacity})`);
          await key("Escape", 27);
          await sleep(300);
          if (await evaluate(`document.getElementById("darbo-langas").open`)) {
            problems.push(`${at} galerijos langas neužsidarė su Escape`);
          }
        }

        if (hasContact) {
          const sent = await evaluate(`(async () => {
            document.getElementById("vardas").value = "Jonas";
            document.getElementById("telefonas").value = "+37060000001";
            document.querySelector(".enquiry button[type=submit]").click();
            await new Promise((r) => setTimeout(r, 250));
            return { form: !!document.querySelector(".enquiry"), text: document.body.innerText };
          })()`);
          const thanks = sectionById.get("contact").form.done;
          if (sent.form) problems.push(`${at} forma liko puslapyje po išsiuntimo`);
          if (!sent.text.includes(thanks)) problems.push(`${at} po išsiuntimo nėra padėkos "${thanks}"`);
        }

        // Vieno puslapio meniu turi sekti tą sekciją, kurią žmogus mato.
        if (build.name === "one-page" && !mobile) {
          const spied = await evaluate(`(async () => {
            document.getElementById("works").scrollIntoView();
            await new Promise((r) => setTimeout(r, 700));
            const a = document.querySelector('.nav a[aria-current="true"]');
            return a ? a.getAttribute("href") : null;
          })()`);
          if (spied !== "#works") problems.push(`${at} po slinkties iki darbų meniu žymi ${spied}`);
        }
      }

      // Sumažinto judesio režimas: viskas matoma iš karto, be slinkties ir be animacijų.
      await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
      await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
      await load(url);
      await sleep(400);
      const still = await evaluate(INSPECT);
      for (const n of noise) problems.push(`reduce ${n}`);
      if (still.motionOn) problems.push("reduce: puslapis vis tiek įjungė animacijas");
      if (still.hidden) problems.push(`reduce: ${still.hidden} iš ${still.revealCount} blokų permatomi iškart po pakrovimo`);
      if (hasStats) {
        for (const item of sectionById.get("stats").items) {
          if (item.count == null) continue;
          const label = (item.after || "").trim();
          const hit = still.statsItems.some((t) => t.includes(String(item.count)) && (!label || t.includes(label)));
          if (!hit) problems.push(`reduce: skaičiai nerodo "${item.count} ${label}"`);
        }
      }
      await send("Emulation.setEmulatedMedia", { features: [] });

      // Be JS: puslapis privalo likti pilnas ir skaitomas. Tuščias puslapis blogiau
      // už neanimuotą, todėl tikrinama tikra naršyklė su išjungtais skriptais,
      // o ne tik prielaida, kad .js klasė neatsiras.
      await send("Emulation.setScriptExecutionDisabled", { value: true });
      await load(url);
      await sleep(300);
      const nojs = await evaluate(INSPECT);
      for (const n of noise) problems.push(`be JS ${n}`);
      if (nojs.motionOn) problems.push("be JS: puslapis vis tiek įjungė animacijas");
      if (!nojs.revealCount) problems.push("be JS: puslapyje nėra nė vieno turinio bloko");
      if (nojs.hidden) problems.push(`be JS: ${nojs.hidden} iš ${nojs.revealCount} blokų liko permatomi`);
      for (const id of page.sections) {
        if (!nojs.sectionIds.includes(id)) problems.push(`be JS: nėra sekcijos ${id}`);
      }
      for (const b of nojs.blank) problems.push(`be JS: nuotrauka nupiešiama tuščia: ${b}`);
      await send("Emulation.setScriptExecutionDisabled", { value: false });

      await stopBrowser(edge);

      const ok = problems.length === 0;
      if (!ok) failed++;
      report.push({ page: build.name + "/" + page.file, ok, weights, problems });
      const kb = WIDTHS.map(({ w }) => `${w}px ${(weights[w] / 1024).toFixed(0)} KB (JS ${(jsWeights[w] / 1024).toFixed(1)} KB)`).join(", ");
      const mine = vitalsLog.filter((v) => v.page === build.name + "/" + page.file);
      const vit = mine.map((v) => `${v.w}px LCP ${v.lcp.toFixed(0)} ms CLS ${v.cls.toFixed(3)}`).join(", ");
      report.at(-1).vitals = mine;
      console.log(`${ok ? "PASS" : "FAIL"}  ${(build.name + "/" + page.file).padEnd(24)} ${kb} · ${vit}${ok ? "" : "\n      " + problems.join("\n      ")}`);
    }
  }

  /* --- Išjungta sekcija: atskiras testinis rinkinys ---
     Klientui be atsiliepimų sekcija išjungiama, o ne prirašoma išgalvotų citatų.
     Tikrinama abiem kryptimis: išjungtos nelieka niekur, įjungta parodo visas eilutes. --- */

  {
    const problems = [];
    const edge = await startBrowser();
    const variant = JSON.parse(readFileSync(ROOT + "content.json", "utf8"));
    variant.sections.find((s) => s.id === "testimonials").enabled = false;
    const contentFile = TMP + "/content-variant.json";
    const distDir = TMP + "/dist-variant/";
    writeFileSync(contentFile, JSON.stringify(variant));
    const built = spawnSync("node", [ROOT + "build.mjs"], {
      env: { ...process.env, CONTENT_FILE: contentFile, DIST_DIR: distDir },
      encoding: "utf8",
    });
    if (built.status !== 0) problems.push("testinis rinkimas krito: " + (built.stderr || "").trim());
    else {
      for (const [dir, file] of [["one-page", "index.html"], ["multi-page", "index.html"]]) {
        await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
        await load(`${base}test/tmp/dist-variant/${dir}/${file}`);
        await sleep(300);
        await evaluate(SCROLL_THROUGH);
        const s = await evaluate(INSPECT);
        for (const n of noise) problems.push(`variantas ${dir} ${n}`);
        if (s.sectionIds.includes("testimonials")) problems.push(`variantas ${dir}: atsiliepimai rodomi, nors išjungti`);
        if (s.navHrefs.some((href) => /testimonials|atsiliepim/i.test(href))) {
          problems.push(`variantas ${dir}: meniu rodo atsiliepimus, nors jie išjungti`);
        }
        if (/atsiliepim/i.test(await evaluate("document.body.innerText"))) {
          problems.push(`variantas ${dir}: puslapyje liko atsiliepimų tekstas`);
        }
        const rows = await evaluate(`document.querySelectorAll("#prices .price").length`);
        const wanted = variant.sections.find((x) => x.id === "prices").items.length;
        if (rows !== wanted) problems.push(`variantas ${dir}: ${rows} kainų eilutės, laukta ${wanted}`);
        if (s.hidden) problems.push(`variantas ${dir}: ${s.hidden} blokų liko permatomi`);
        if (dir === "one-page" && !s.navHrefs.includes("#prices")) problems.push("variantas one-page: meniu be kainų");
      }
    }
    await stopBrowser(edge);

    const ok = problems.length === 0;
    if (!ok) failed++;
    report.push({ page: "testimonials enabled: false", ok, weights: {}, problems });
    console.log(`${ok ? "PASS" : "FAIL"}  ${"išjungta sekcija".padEnd(24)} testinis rinkimas${ok ? "" : "\n      " + problems.join("\n      ")}`);
  }

  /* --- Bylos paieškos varikliams ir modeliams: sitemap, robots, llms, 404, ikonos --- */

  for (const build of BUILDS) {
    const problems = [];
    const dir = ROOT + build.dir;
    const edge = await startBrowser();
    await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await load(base + build.dir + build.pages[0].file);

    // sitemap.xml perskaitomas tikru XML parseriu naršyklėje, ne regexu: netaisyklingas
    // XML čia turi kristi taip pat, kaip kristų pas Google.
    const sm = await evaluate(`(async () => {
      const res = await fetch("sitemap.xml");
      const doc = new DOMParser().parseFromString(await res.text(), "application/xml");
      const bad = doc.querySelector("parsererror");
      return {
        status: res.status,
        error: bad ? bad.textContent.replace(/\s+/g, " ").trim() : "",
        root: doc.documentElement.nodeName,
        ns: doc.documentElement.namespaceURI,
        locs: Array.from(doc.getElementsByTagName("loc")).map((n) => n.textContent),
        lastmods: Array.from(doc.getElementsByTagName("lastmod")).map((n) => n.textContent),
      };
    })()`);
    if (sm.status !== 200) problems.push(`sitemap.xml atsakė ${sm.status}`);
    if (sm.error) problems.push(`sitemap.xml nėra taisyklingas XML: ${sm.error}`);
    if (sm.root !== "urlset") problems.push(`sitemap.xml šaknis yra <${sm.root}>`);
    if (sm.ns !== "http://www.sitemaps.org/schemas/sitemap/0.9") problems.push(`sitemap.xml vardų sritis yra ${sm.ns}`);
    const wantLocs = build.pages.map((p) => canonicalFor(p.file)).sort().join(", ");
    const gotLocs = [...sm.locs].sort().join(", ");
    if (gotLocs !== wantLocs) problems.push(`sitemap.xml surašo [${gotLocs}], laukta [${wantLocs}]`);
    if (sm.lastmods.length !== sm.locs.length) problems.push("sitemap.xml ne prie kiekvieno adreso turi lastmod");
    for (const d of sm.lastmods) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) problems.push(`sitemap.xml lastmod yra "${d}"`);

    // robots.txt privalo sekti site.noindex vėliavėlę, o ne būti įrašytas ranka.
    // Motion pašalintas: kataloge neturi likti nei bylos, nei licencijos.
    if (existsSync(dir + "vendor")) problems.push("dist viduje liko vendor/ katalogas");

    const robots = readFileSync(dir + "robots.txt", "utf8");
    if (!/^user-agent:\s*\*/im.test(robots)) problems.push("robots.txt be User-agent eilutės");
    if (site.noindex) {
      if (!/^disallow:\s*\/\s*$/im.test(robots)) problems.push("robots.txt neuždaro svetainės, nors site.noindex yra true");
      if (/^sitemap:/im.test(robots)) problems.push("robots.txt siūlo sitemap, nors indeksuoti draudžiama");
    } else {
      if (!/^allow:\s*\/\s*$/im.test(robots)) problems.push("robots.txt neatidaro svetainės, nors site.noindex yra false");
      if (!robots.includes(`Sitemap: ${BASE}sitemap.xml`)) problems.push("robots.txt be Sitemap eilutės");
    }

    const llms = readFileSync(dir + "llms.txt", "utf8");
    if (!llms.startsWith(`# ${site.name}\n`)) problems.push("llms.txt neprasideda įmonės vardu antraštėje");
    if (!/^> \S/m.test(llms)) problems.push("llms.txt be santraukos citatoje");
    if (!/^## /m.test(llms)) problems.push("llms.txt be nė vienos sekcijos");
    if (llms.length < 400) problems.push(`llms.txt per trumpas: ${llms.length} ženklų`);
    const llmsUrls = [...llms.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    if (llmsUrls.length < livePages.length) problems.push(`llms.txt turi ${llmsUrls.length} nuorodas, laukta bent ${livePages.length}`);
    for (const u of llmsUrls) if (!u.startsWith(BASE)) problems.push(`llms.txt nuoroda ne absoliuti: ${u}`);
    for (const p of livePages) if (!llms.includes(p.title)) problems.push(`llms.txt nemini puslapio „${p.title}“`);

    // 404 iš gilaus kelio: Pages ją paduoda iš bet kokios vietos, todėl jos resursai
    // absoliutūs. Katalogas laikinai prikabinamas prie baseUrl priešdėlio.
    mount = { prefix: BASE_PATH, dir: build.dir };
    const deep = base.replace(/\/$/, "") + BASE_PATH + "nera/tokio/puslapio/";
    await load(deep);
    await sleep(300);
    const lost = await evaluate(INSPECT);
    // Paties dokumento 404 yra šito puslapio esmė, ne klaida; visa kita — klaida.
    for (const n of noise) if (!n.includes(deep)) problems.push(`404 ${n}`);
    if (lost.h1s.length !== 1) problems.push(`404: ${lost.h1s.length} h1 elementai`);
    if (!/noindex/.test(lost.robots)) problems.push(`404: robots meta yra "${lost.robots}"`);
    if (lost.canonical) problems.push(`404: klaidos puslapis turi canonical (${lost.canonical})`);
    if (!/Instrument Sans/.test(lost.font)) problems.push(`404: stiliai neįsikėlė, šriftas ${lost.font}`);
    if (!lost.sectionIds.length) problems.push("404: nėra turinio sekcijos");
    for (const r of requests) {
      if (r.url === deep) {
        if (r.status !== 404) problems.push(`404 puslapis atsakė ${r.status}, o turi 404`);
      } else if (r.status !== 200) {
        problems.push(`404 puslapio resursas ${r.url.replace(base, "/")} atsakė ${r.status}`);
      }
    }
    for (const href of lost.links) {
      if (/^(tel:|mailto:|#)/.test(href)) continue;
      if (!href.startsWith(BASE_PATH)) { problems.push(`404: nuoroda ne absoliuti: ${href}`); continue; }
      const rel = href.slice(BASE_PATH.length).split("#")[0] || "index.html";
      if (!existsSync(join(ROOT, build.dir, rel))) problems.push(`404: neveikianti nuoroda ${href}`);
    }

    // Ikonos ir dalybų nuotrauka: tikras dekodavimas, o ne 200 atsakymas. Deklaruoti
    // matmenys lyginami su tikraisiais — nesutampantys og:image dydžiai apkarpo kortelę.
    const icons = await evaluate(`(async () => {
      const out = { declared: {} };
      for (const tag of ["og:image:width", "og:image:height"]) {
        const m = document.querySelector('meta[property="' + tag + '"]');
        out.declared[tag] = m ? +m.content : 0;
      }
      for (const name of [${JSON.stringify(site.ogImage)}, "apple-touch-icon.png"]) {
        const res = await fetch(${JSON.stringify(BASE_PATH)} + name);
        if (!res.ok) { out[name] = { status: res.status }; continue; }
        const bmp = await createImageBitmap(await res.blob());
        out[name] = { status: res.status, w: bmp.width, h: bmp.height };
      }
      const svg = await fetch(${JSON.stringify(BASE_PATH)} + "favicon.svg");
      out["favicon.svg"] = { status: svg.status, head: (await svg.text()).slice(0, 30) };
      const man = await fetch(${JSON.stringify(BASE_PATH)} + "site.webmanifest");
      out.manifest = { status: man.status, json: await man.json().catch(() => null) };
      return out;
    })()`);
    const shot = icons[site.ogImage];
    if (shot.status !== 200) problems.push(`og:image byla atsakė ${shot.status}`);
    else if (shot.w !== icons.declared["og:image:width"] || shot.h !== icons.declared["og:image:height"]) {
      problems.push(`og:image yra ${shot.w}x${shot.h}, o galvutėje parašyta ${icons.declared["og:image:width"]}x${icons.declared["og:image:height"]}`);
    }
    const touch = icons["apple-touch-icon.png"];
    if (touch.status !== 200) problems.push(`apple-touch-icon.png atsakė ${touch.status}`);
    else if (touch.w !== 180 || touch.h !== 180) problems.push(`apple-touch-icon.png yra ${touch.w}x${touch.h}, laukta 180x180`);
    if (icons["favicon.svg"].status !== 200 || !icons["favicon.svg"].head.includes("<svg")) problems.push("favicon.svg neatsidaro");
    const man = icons.manifest.json;
    if (icons.manifest.status !== 200 || !man) problems.push("site.webmanifest neatsidaro arba nėra JSON");
    else for (const key of ["name", "short_name", "theme_color", "background_color"]) {
      if (!man[key]) problems.push(`site.webmanifest be ${key}`);
    }
    mount = null;
    await stopBrowser(edge);

    const ok = problems.length === 0;
    if (!ok) failed++;
    report.push({ page: `seo ${build.name}`, ok, weights: {}, problems });
    const line = `sitemap ${sm.locs.length} adr. · robots ${site.noindex ? "disallow" : "allow"} · llms.txt ${llms.length} B · 404 iš gilaus kelio`;
    console.log(`${ok ? "PASS" : "FAIL"}  ${("seo " + build.name).padEnd(24)} ${line}${ok ? "" : "\n      " + problems.join("\n      ")}`);
  }

  /* --- Kita site.noindex pusė: robots.txt privalo apsiversti kartu su vėliavėle --- */

  {
    const problems = [];
    const variant = JSON.parse(readFileSync(ROOT + "content.json", "utf8"));
    variant.site.noindex = !site.noindex;
    const contentFile = TMP + "/content-noindex.json";
    const distDir = TMP + "/dist-noindex/";
    writeFileSync(contentFile, JSON.stringify(variant));
    const built = spawnSync("node", [ROOT + "build.mjs"], {
      env: { ...process.env, CONTENT_FILE: contentFile, DIST_DIR: distDir },
      encoding: "utf8",
    });
    if (built.status !== 0) problems.push("testinis rinkimas krito: " + (built.stderr || "").trim());
    else {
      for (const name of ["one-page", "multi-page"]) {
        const robots = readFileSync(`${distDir}${name}/robots.txt`, "utf8");
        const html = readFileSync(`${distDir}${name}/index.html`, "utf8");
        if (variant.site.noindex) {
          if (!/^disallow:\s*\/\s*$/im.test(robots)) problems.push(`${name}: robots.txt neuždarė svetainės su noindex: true`);
          if (!/name="robots" content="noindex/.test(html)) problems.push(`${name}: puslapyje nėra noindex meta su noindex: true`);
        } else {
          if (!/^allow:\s*\/\s*$/im.test(robots)) problems.push(`${name}: robots.txt neatidarė svetainės su noindex: false`);
          if (!robots.includes(`Sitemap: ${BASE}sitemap.xml`)) problems.push(`${name}: robots.txt be Sitemap eilutės su noindex: false`);
          if (/name="robots"/.test(html)) problems.push(`${name}: puslapyje liko robots meta su noindex: false`);
        }
      }
    }

    const ok = problems.length === 0;
    if (!ok) failed++;
    report.push({ page: `noindex: ${!site.noindex}`, ok, weights: {}, problems });
    console.log(`${ok ? "PASS" : "FAIL"}  ${("noindex: " + !site.noindex).padEnd(24)} robots.txt ir meta apsiverčia${ok ? "" : "\n      " + problems.join("\n      ")}`);
  }

  /* --- Kontrastas: tikras auditas gyvoje naršyklėje (site-verify check.mjs) --- */

  for (const build of BUILDS) {
    for (const r of runCheck(build)) {
      if (!r.ok) failed++;
      const label = build.pages.length > 1 ? `${build.name}/${r.slug}` : build.name;
      report.push({ page: `contrast ${label}`, ok: r.ok, weights: {}, problems: r.problems });
      console.log(`${r.ok ? "PASS" : "FAIL"}  ${("kontrastas " + label).padEnd(24)} ${r.passes.map((l) => l.trim().replace(/\s+/g, " ")).join(" · ")}`);
      console.log(`      ${r.tail}`);
      if (!r.ok) for (const line of r.problems) console.log("      " + line);
    }
  }

  /* --- Kontaktiniai lapai: po vieną kiekvienam variantui --- */

  const sheetEdge = await startBrowser();
  for (const build of BUILDS) {
    const tiles = shots[build.name]
      .map((s) => `<figure><figcaption>${s.label}</figcaption><img src="${s.file}"></figure>`).join("");
    const columns = Math.min(shots[build.name].length, 6);
    writeFileSync(`${SHOTS}/sheet.html`, `<!doctype html><meta charset="utf-8"><style>
      body { margin: 0; background: #20211D; font: 13px/1.4 -apple-system, sans-serif; color: #F6F3EE;
             display: grid; grid-template-columns: repeat(${columns}, 1fr); gap: 10px; padding: 10px; align-items: start; }
      figure { margin: 0; max-height: 2400px; overflow: hidden; }
      img { width: 100%; display: block; border: 1px solid #9B958A; }
      figcaption { padding: 2px 0 4px; }</style>${tiles}`);
    const width = columns * 320 + 40;
    await send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
    await load(base + "test/shots/sheet.html");
    await sleep(900);
    const sheetHeight = await evaluate("document.documentElement.scrollHeight");
    const sheet = await send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height: sheetHeight, scale: 1 },
    });
    writeFileSync(`${SHOTS}/contact-sheet-${build.name}.png`, Buffer.from(sheet.data, "base64"));
    unlinkSync(`${SHOTS}/sheet.html`);
  }
  await stopBrowser(sheetEdge);
} finally {
  writeFileSync(OUT + "report.json", JSON.stringify({ checks: report, vitals: vitalsLog }, null, 2));
  server.close();
}

const worstLcp = vitalsLog.reduce((m, v) => Math.max(m, v.lcp), 0);
const worstCls = vitalsLog.reduce((m, v) => Math.max(m, v.cls), 0);
console.log(`išmatuota: blogiausias LCP ${worstLcp.toFixed(0)} ms (riba ${LCP_BUDGET}), blogiausias CLS ${worstCls.toFixed(3)} (riba ${CLS_BUDGET})`);
console.log(`${report.length - failed}/${report.length} patikrinimai praeina 390x844 ir 1280x800; ${failed} krenta; nuotraukos test/shots/`);
process.exit(failed ? 1 : 0);
