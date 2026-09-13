// Paleidimas: node tools/images.mjs
// Iš src/img/_source/ originalų padaro tai, ko prašo content.json: kiekvienai nuotraukai
// du pločius ir du formatus (JPEG + AVIF) į src/img/. Originalai lieka nepaliesti.
//
// Nauja kliento nuotrauka: įdėk originalą į src/img/_source/<vardas>.jpg (hero — tokiu
// vardu, koks įrašytas content.json „photo" lauke), surašyk autorių į src/img/credits.json
// ir paleisk šitą skriptą iš naujo.
//
// Įrankiai: tik macOS sips, nieko diegti nereikia. WebP pakopos nėra — sips jo nerašo.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";

const here = (p) => new URL(p, import.meta.url).pathname;
const IMG = here("../src/img/");
const SRC = here("../src/img/_source/");
const TMP = here("../src/img/.tmp/");
const content = JSON.parse(readFileSync(here("../content.json"), "utf8"));
const section = (id) => content.sections.find((s) => s.id === id);

const sips = (args) => execFileSync("/usr/bin/sips", args, { stdio: ["ignore", "pipe", "pipe"] }).toString();
const dims = (file) => {
  const out = sips(["-g", "pixelWidth", "-g", "pixelHeight", file]);
  return [+/pixelWidth:\s*(\d+)/.exec(out)[1], +/pixelHeight:\s*(\d+)/.exec(out)[1]];
};

// Kortelės visur vienodo dydžio; hero savo, iš content.json.
const CARD = [[720, 480], [1200, 800]];
const hero = section("hero");
const heroBase = hero.photo.replace(/-\d+\.(jpg|jpeg)$/i, "");
const heroSmall = Math.round(((hero.height / hero.width) * 900) / 2) * 2;

const wanted = [{ slug: heroBase, file: hero.photo, sizes: [[900, heroSmall], [hero.width, hero.height]] }];
for (const id of ["services", "works"]) {
  for (const item of section(id)?.items || []) {
    if (item.photo && !wanted.some((w) => w.slug === item.photo)) {
      wanted.push({ slug: item.photo, file: item.photo + ".jpg", sizes: CARD });
    }
  }
}
const about = section("about");
if (about?.photo && !wanted.some((w) => w.slug === about.photo)) {
  wanted.push({ slug: about.photo, file: about.photo + ".jpg", sizes: CARD });
}

mkdirSync(TMP, { recursive: true });
const report = [];

for (const item of wanted) {
  const source = SRC + item.file;
  if (!existsSync(source)) throw new Error(`nėra originalo: src/img/_source/${item.file}`);
  const [sw, sh] = dims(source);

  for (const [w, h] of item.sizes) {
    // sips prie NELYGINIO pikselių matmens parašo tuščią AVIF: byla teisingo svorio,
    // bet visi pikseliai permatomi, ir naršyklė piešia tuštumą be jokios klaidos.
    // Išmatuota 2026-09-13: 1800x1012 geras, 1800x1013 tuščias.
    if (w % 2 || h % 2) throw new Error(`${item.slug}: ${w}x${h} turi nelyginį matmenį — sips parašytų tuščią AVIF`);

    // Pirma proporcingai iki dydžio, kuris uždengia rėmelį, paskui centrinis kirpimas.
    const cover = TMP + `${item.slug}-${w}-cover.jpg`;
    const byHeight = sw / sh > w / h;
    sips([...(byHeight ? ["--resampleHeight", String(h)] : ["--resampleWidth", String(w)]), source, "--out", cover]);
    const [cw, ch] = dims(cover);
    if (cw < w || ch < h) throw new Error(`${item.slug}: ${cw}x${ch} neuždengia ${w}x${h}`);

    const jpg = `${IMG}${item.slug}-${w}.jpg`;
    const avif = `${IMG}${item.slug}-${w}.avif`;
    sips(["-c", String(h), String(w), "-s", "format", "jpeg", "-s", "formatOptions", "60", cover, "--out", jpg]);

    // AVIF kokybė mažinama tol, kol byla tikrai lengvesnė už JPEG: sips prie aukštų
    // formatOptions parašo DIDESNĘ bylą už šaltinį, ir tai tyli klaida.
    const jb = statSync(jpg).size;
    let ab = Infinity, q = 45;
    for (const quality of [45, 40, 35, 30]) {
      q = quality;
      sips(["-s", "format", "avif", "-s", "formatOptions", String(quality), jpg, "--out", avif]);
      ab = statSync(avif).size;
      if (ab < jb) break;
    }
    if (ab >= jb) throw new Error(`${item.slug}-${w}.avif (${ab} B) nemažesnis už JPEG (${jb} B)`);
    const [aw, ah] = dims(avif);
    if (aw !== w || ah !== h) throw new Error(`${item.slug}-${w}.avif yra ${aw}x${ah}, laukta ${w}x${h}`);
    report.push({ name: `${item.slug}-${w}`, w, h, jb, ab, q, src: statSync(source).size });
  }
}

rmSync(TMP, { recursive: true, force: true });

const jt = report.reduce((s, r) => s + r.jb, 0);
const at = report.reduce((s, r) => s + r.ab, 0);
for (const r of report) {
  console.log(`${r.name.padEnd(26)} ${String(r.w).padStart(4)}×${String(r.h).padEnd(4)} jpg ${String(r.jb).padStart(7)} B · avif q${r.q} ${String(r.ab).padStart(7)} B · −${(100 - (r.ab / r.jb) * 100).toFixed(0)}%`);
}
console.log(`viso jpg ${(jt / 1024).toFixed(0)} KB · avif ${(at / 1024).toFixed(0)} KB · AVIF lengvesnis ${(100 - (at / jt) * 100).toFixed(0)}%`);
