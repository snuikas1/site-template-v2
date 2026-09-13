# Šablono specifikacija (v2)

Ką šitas katalogas privalo daryti ir kokius matavimus turi praeiti, kad būtų laikomas
tvarkingu. Rašyta pagal `site-build`, `web-vitals`, `scroll-craft` ir `site-verify` skill'us;
pirmoji versija (`~/Projects/site-template`) lieka nepaliesta.

## 1. Kas renkama

Vienas `content.json` → du variantai:

- `dist/one-page/index.html` — visos įjungtos sekcijos iš eilės, meniu veda į inkarus;
- `dist/multi-page/` — penki puslapiai (`index`, `paslaugos`, `darbai`, `apie`, `kontaktai`)
  su bendra antrašte ir porašte.

Jokių priklausomybių, jokio tinklo rinkimo metu, jokio `npm install`, **jokios svetimos
JS bibliotekos puslapyje**. Visos nuorodos santykinės, kad veiktų ir GitHub Pages
pakatalogyje; vienintelė išimtis — `404.html`, kurią Pages paduoda iš bet kokio gylio,
todėl jos nuorodos ir resursai absoliutūs, su priešdėliu iš `site.baseUrl`.

Sekcijos: `hero, services, works, process, trust, stats, testimonials, prices, faq, about,
contact, cta`. Kiekviena turi savo šabloną `src/templates/<id>.html`; naujos sekcijos
pridėjimas yra byla plius įrašas `content.json`.

## 2. Žetonai

Trys sluoksniai, komponentai mato tik trečią:

1. `src/tokens.css` — primityvai. Spalvų skalės išvestos OKLCH (hue nekinta, šviesumas
   tolygus, chroma numušta galuose), atiduodamos sRGB hex pavidalu.
2. `src/theme.css` — semantiniai vardai. **Vienintelė byla, kurią keičia naujas klientas.**
3. `src/styles.css` — komponentai. **Nė vieno hex, rgb ar spalvos literalo.**

Privaloma:

- Tamsiausias neutralas nėra `#000`.
- Ženklo akcentas (varis) naudojamas pirminiam veiksmui ir fokusui, daugiau beveik niekur.
- Tipografika **arba** takioji `clamp()`, **arba** fiksuoti laipteliai — niekada abu.
  Pasirinkta: takioji, visa skalė, 360→1440 px.
- Tarpų bazė 4 px. Lygiai du pločiai: platus sekcijoms (`--measure-wide`), siauras tekstui
  (`--measure-prose`, 45–90 ženklų matas).
- Judesio trukmės žetonuose ir tarp 100 ir 400 ms. Jokių `cubic-bezier` komponentų
  taisyklėse. Vienintelė įvardyta išimtis — `--dur-count` (1200 ms), skaitiklis, kuris
  nieko nejudina.
- Tik šviesi tema, pasakyta `color-scheme: light`. Pusiau padarytos tamsios temos nebūna.
  Puslapis privalo teisingai atrodyti ir tada, kai naršyklėje emuliuojama tamsi tema.

## 3. Sandara

- Vienas `<h1>` puslapyje, tikri orientyrai (`header/nav/main/footer`), nepraleistos antraščių pakopos.
- Sekcijų eilė: kabliukas → parodyk → įrodyk, kad saugu → įrodyk, kad kiti jau naudoja → prašyk.
  Įrodymai eina vėlai, prieš pat kvietimą.
- Kvietimo mygtuko užrašas sutampa su hero pirminio veiksmo užrašu raidė į raidę.
- Teisinė (kainų) eilutė perkeliama, bet nemažinama žemiau kūno dydžio.
- Neišgalvotų įrodymų: nėra atsiliepimų — sekcija išjungiama.

## 4. Nuotraukos ir šriftai

- `<picture>`: AVIF, tarpinė WebP pakopa, atsarginis JPEG (`sips` WebP nerašo, todėl ją daro
  `sharp-cli`). `og:image` — atskira 1200×630 JPEG byla, į puslapį nepatenkanti.
- Originalai `src/img/_source/`, dydžiai daromi `node tools/images.mjs`, į `dist/` keliauja
  tik tos bylos, kurių prašo įjungtos sekcijos.
- Kiekvieno AVIF matmenys lyginiai (nelyginis duoda tuščią bylą) ir kiekvienas AVIF
  lengvesnis už savo JPEG — abu tikrinama rinkimo metu.
- `srcset`/`sizes` rašomi `vw`, niekada procentais.
- Hero yra LCP: `fetchpriority="high"`, `width`/`height`, niekada `loading="lazy"`.
  Visa kita žemiau lanko — `loading="lazy"`.
- Šriftai savo serveryje, woff2, poaibiais, `preload` su **`crossorigin`** (be jo byla
  parsiunčiama dukart), `font-display: swap` ir išmatuoti atsarginio šrifto matmenys.
- Ribos: ~35 KB vienam šriftui, ~139 KB visiems, iki 1,5 MB persiųsta viename lange.

## 5. Judesys

- Pasirodymai — `IntersectionObserver`, niekada `scroll` klausytojas.
- Be JS arba be observerio kiekviena sekcija matoma ir skaitoma.
- `animation-timeline` niekada be atsarginio kelio: arba `@supports not (...)` taisyklė, arba
  ta pati sąlyga JS pusėje (`CSS.supports`). Taip padarytas hero paralaksas — CSS
  `view-timeline`, o senesnėms naršyklėms tą patį poslinkį padaro pasyvus klausytojas.
- Animuojamas elementas neturi `overflow`, kitokio nei `visible`.
- Abu transformacijos kadrai užrašomi aiškiai; `transform: none` kaip tikslas draudžiamas.
- `prefers-reduced-motion: reduce` judesį pašalina, ne sutrumpina.

## 6. Paieška ir mašinos

Renkama iš `content.json`, ne rašoma ranka. Privaloma kiekviename puslapyje:

- savas `<meta name="description">`, `<link rel="canonical">` (pradžiai — katalogo adresas,
  ne `index.html`), pilnas `og:` ir `twitter:` rinkinys su absoliučiu `og:image`;
- `LocalBusiness` JSON-LD; `WebSite` pradžioje; `BreadcrumbList` vidiniuose puslapiuose,
  žodis į žodį sutampantis su matomu keliu;
- **nė vieno tuščio ar išgalvoto lauko.** Nežinomas laukas praleidžiamas; koordinačių
  (`geo`) šablone nėra sąmoningai — jas įrašo tikras klientas.

Kataloge, greta puslapių: `sitemap.xml` (tik surinkti puslapiai, `lastmod` — rinkimo diena),
`robots.txt` (seka `site.noindex` abiem kryptimis), `llms.txt`, `404.html`, `favicon.svg`,
`apple-touch-icon.png` (180×180) ir `site.webmanifest`. Ikonos piešiamos temos spalvomis.

## 7. Kada laikoma padaryta

- `npm run build` padaro abu variantus.
- `npm test` grįžta su nuliu: šešiolika patikrinimų, 390×844 ir 1280×800, abu variantai.
- Viename puslapyje ne daugiau 20 KB JS ir nė vienos svetimos bibliotekos.
- `check.mjs` praneša nulį išmatuotų kontrasto klaidų visuose trijuose ėjimuose.
- LCP ir CLS yra išmatuoti skaičiai, ne spėjimai; LCP ≤ 2500 ms, CLS ≤ 0,1.
- `grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(' src/styles.css` neranda nieko.
- Sumažintas judesys pašalina judėjimą; be JS matosi viskas.
- v1 katalogas nepaliestas.
