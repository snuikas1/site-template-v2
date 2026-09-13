# Svetainės šablonas, v2

Vienas turinys, du variantai. `npm run build` iš `content.json` ir `src/` padaro:

- `dist/one-page/` — vienas puslapis, meniu veda į inkarus tame pačiame puslapyje;
- `dist/multi-page/` — penki puslapiai (Pradžia, Paslaugos, Darbai, Apie, Kontaktai) su bendra antrašte ir porašte.

Klientui atiduodamas vienas iš jų. Kitas lieka nepaliestas.

**Kas yra v2.** Šitas katalogas perrašytas pagal trisdešimties gyvų įmonių svetainių
išardymą (`site-build` skill'o `references/teardowns.md`): trijų sluoksnių žetonai be nė
vieno hex komponentų byloje, savas šriftas, takioji tipografika, spalvos išvestos OKLCH,
sekcijų eilė, kurioje įrodymai eina prieš pat prašymą, ir kontrastas, kuris **matuojamas
naršyklėje, o ne skaičiuojamas iš žetonų**. Pirmoji versija niekur nedingo ir lieka
`~/Projects/site-template` — v2 jos neliečia.

Demonstracinis turinys — išgalvota metalo dirbtuvė „Plieno linija“. Kol `site.fictional`
yra `true`, poraštėje matyti, kad įmonė išgalvota; kol `site.noindex` yra `true`, kiekviename
puslapyje yra `<meta name="robots" content="noindex, nofollow">`.

Priklausomybių nėra: `npm install` nereikia. Reikia tik Node 24, macOS `sips` (nuotraukoms)
ir (testams) Microsoft Edge.

## Nauja kliento svetainė per pusdienį

1. **Nusikopijuok šitą katalogą** į naują vietą ir ištrink `dist/`, `test/shots/`, `test/report.json`.
2. **Perrašyk `content.json`.** Įmonės duomenys — `site`; tekstai — `sections`. Išjungtos
   sekcijos tiesiog turi `"enabled": false`. **Būtinai pakeisk `site.baseUrl`** — iš jo
   sudaromi canonical, og:url, sitemap.xml, llms.txt ir 404 puslapio keliai.
3. **Perdažyk `src/theme.css`.** Tik šitą bylą — žr. „Tema per vieną bylą“ žemiau.
4. **Sudėk originalias nuotraukas į `src/img/_source/`** tais vardais, kurių prašo sekcijos,
   perrašyk `src/img/credits.json` ir `CREDITS.md`, paleisk `node tools/images.mjs`.
5. `npm run build` — abu variantai atsiranda `dist/`.
6. `npm test` — praeina abu variantus, kiekvieną puslapį, 390×844 ir 1280×800, ir pats
   pasileidžia tikrą kontrasto auditą.
7. **Deploy:** į GitHub Pages keliamas tik pasirinkto varianto katalogas. Visos nuorodos
   santykinės (išskyrus `404.html`, kuriai to negalima), todėl veikia ir `user.github.io/repo/`
   pakatalogyje. Prieš paleidžiant gyvai: `site.noindex` į `false` ir `site.fictional` į `false`.
   `robots.txt` ir `<meta name="robots">` apsiverčia patys — ranka jų liesti nereikia.

## Neišgalvok įrodymų

Jei klientas neturi atsiliepimų — `"enabled": false` sekcijai `testimonials`. Tas pats
galioja skaičiams ir darbų galerijai. **Išgalvotas arba tuščias įrodymas blogiau už jokį**,
ir kiekvienas tikras skaitytojas tai mato. Taip daro ir korpuso svetainės: geriau be logotipų
juostos, negu „mumis pasitiki 12 komandų“. Tą patį tikrina ir harness'as: vienas jo
patikrinimas surenka svetainę su išjungtais atsiliepimais ir žiūri, ar jų nelieka nei
puslapyje, nei meniu.

## Tema per vieną bylą

`src/theme.css` yra vienintelė vieta, kurią keiti klientui. Joje semantiniai vardai
(`--color-bg`, `--color-ink`, `--color-accent`, `--color-link`, …) rodo į skalių laiptelius
iš `src/tokens.css`. Komponentai (`src/styles.css`) mato **tik** semantinius vardus, todėl
temos keitimas niekada neverčia lįsti į komponentų taisykles.

Trys sluoksniai:

| Byla | Kas ten | Ar keiti klientui |
| --- | --- | --- |
| `src/tokens.css` | primityvai: spalvų skalės, tarpai, šriftų dydžiai, trukmės | retai |
| `src/theme.css` | semantiniai vardai: kas yra fonas, rašalas, ženklas, akcentas | **taip, tik čia** |
| `src/styles.css` | komponentai; nė vieno hex ar rgb | ne |

Patikra: `grep -nE '#[0-9a-fA-F]{3,8}|rgba?\(' src/styles.css` turi nerasti nieko.

**Demonstracinė paletė (šalta: skalūnas, plieno mėlyna, varis).** Išvesta OKLCH erdvėje —
hue skalėje nekinta, šviesumas krenta tolygiai, chroma numušama galuose:

| Vardas | Reikšmė | Kam |
| --- | --- | --- |
| `--n-50` | `#F9FAFC` | puslapio fonas |
| `--n-0` | `#FFFFFF` | formos, dialogas |
| `--n-900` | `#171B21` | rašalas (ne juoda) |
| `--n-700` | `#49515B` | antraeilis tekstas |
| `--brand-700` | `#13537C` | tamsios juostos, nuorodos |
| `--brand-900` | `#0C314B` | tamsios juostos paviršius |
| `--accent-700` | `#8C501A` | **varis: tik pirminis veiksmas ir fokusas** |
| `--accent-300` | `#DC9D6C` | tas pats varis ant tamsios juostos |
| `--n-300` | `#D4D9E0` | plaukeliai |

Varis puslapyje pasirodo keturiose vietose: pirminis mygtukas, fokuso rėmelis, esamo meniu
punkto brūkšnys ir žingsnio numeris. Tai sąmoninga — korpuso matas yra Cash App, kurios CSS
baltą naudoja 127 kartus, o ženklo žalią 5.

**Tipografika takioji (`clamp()`) nuo 360 px iki 1440 px lango, visa skalė be išimčių.**
Maišyti takiųjų ir fiksuotų laiptelių negalima — būtent tai atrodo mėgėjiškai, o ne pats
pasirinkimas. Šriftai: Instrument Serif antraštėms, Instrument Sans tekstui, abu savo
serveryje, poaibiuose (latin + latin-ext lietuviškoms raidėms), su `font-display: swap` ir
išmatuotais atsarginio šrifto matmenimis (`size-adjust`, `ascent-override`), kad
persijungimas nieko nepastumtų.

**Tik šviesi tema, pasakyta garsiai** (`color-scheme: light`). Tamsios temos nėra ir nebus
pusiau padarytos — taip daro Anthropic ir Apple pradžios puslapis.

## Nuotraukos

Originalai gyvena `src/img/_source/`, o `node tools/images.mjs` iš jų padaro tai, ko prašo
`content.json`: kiekvienai nuotraukai du pločius ir du formatus.

| Kur | Byla | Dydis |
| --- | --- | --- |
| hero | `hero-900.*`, `hero-1800.*` | 900×506, 1800×1012 |
| kortelės ir galerija | `<vardas>-720.*`, `<vardas>-1200.*` | 720×480, 1200×800 |
| dalyboms (og:image) | `og.jpg` | 1200×630, tik JPEG |

`<picture>` atiduoda AVIF, tarpinė pakopa — WebP, o JPEG lieka atsarginis. `sips` WebP
**skaito, bet nerašo**, todėl tą pakopą daro `sharp-cli` iš jau iškirpto JPEG. Išmatuota su
tikromis nuotraukomis: AVIF 74 % lengvesnis už tą patį JPEG (885 KB → 227 KB aštuoniose bylose).
Devinta byla — `img/og.jpg` (1200×630), skirta tik dalyboms: Facebook, LinkedIn ir Slack
nei AVIF, nei WebP nerodo, todėl ji lieka JPEG ir į puslapį nepatenka.

**Du dalykai, kurie kainavo laiko ir nebeturi kainuoti:**

- **Nelyginis pikselių matmuo `sips` AVIF koduotėje duoda TUŠČIĄ bylą.** Byla teisingo
  dydžio ir svorio, `naturalWidth` teisingas, užklausa 200 — ir visi pikseliai permatomi.
  Išmatuota 2026-09-13: 1800×1012 geras, 1800×1013 tuščias. `tools/images.mjs` nelyginio
  matmens nepriima, o harness'as kiekvieną nuotrauką nupiešia į drobę ir tikrina, ar ji ne tuščia.
- **Prie aukštų `formatOptions` `sips` parašo AVIF, DIDESNĮ už šaltinį.** Skriptas kokybę
  mažina tol, kol byla tikrai lengvesnė, ir krenta, jei nepavyksta.

Hero nuotrauka yra LCP elementas: `fetchpriority="high"`, aiškūs `width`/`height`, niekada
`loading="lazy"`. Visa kita žemiau lanko — `loading="lazy"`. `sizes` rašomas `vw`, niekada
procentais.

## Animacija

**Bibliotekos nėra.** Judesį daro CSS, o `src/main.js` (10 KB, vienintelis puslapio JS)
tik laiku uždeda klases. Iki 2026-09-13 čia gulėjo Motion 13.2.0 — 137 KB prieš 9 KB savo
kodo, didžiausia svetainės byla. Kiekvienas jo darbas turi tiesioginį atitikmenį:

| Buvo (Motion) | Yra |
| --- | --- |
| `inView` | `IntersectionObserver`, `rootMargin: 0px 0px -10% 0px`, klasė `.is-in` |
| `animate` + `stagger` | CSS perėjimas ir `transition-delay: calc(var(--i) * var(--dur-1) / 3)`; `--i` uždeda main.js |
| `animate(0, n)` skaitikliui | `requestAnimationFrame` ciklas, kelios eilutės |
| `press` | CSS `:active { transform: scale(0.97) }` |
| `scroll` antraštei | pasyvus `scroll` klausytojas, kuris jau buvo byloje |
| `scroll` paralaksui | CSS `view-timeline` + `animation-range: exit 0% exit 100%` |
| `animate` galerijos langui | CSS `@keyframes lightbox-in` |

Septyni judesiai: hero suplaukimas, sekcijų pasirodymas, skaičiai, mygtuko paspaudimas,
antraštės fonas, hero paralaksas ir galerijos langas. Trukmės ir greitėjimas imami iš
`tokens.css` — dabar jau vien CSS pusėje, JS jų neturi įrašytų (lieka tik `--dur-count`).

- **Pasirodymai remiasi `IntersectionObserver`**, niekada `scroll` klausytoju.
- **Be JS viskas matoma.** Paslepiama tik tada, kai `main.js` jau pasakė, kad animacijos
  veikia (`.js` klasė). Tuščias puslapis blogiau už neanimuotą.
- **`prefers-reduced-motion: reduce` judesį pašalina, o ne sutrumpina.** Galutinė būsena
  rodoma iš karto: skaičiai rodo galutines reikšmes, niekas nelieka permatomas.
- `--motion-scale: 0` temoje išjungia viską rankiniu būdu.
- **Paralaksas: laiko juosta kabinama ant `.hero-frame`, o animuojama nuotrauka jo viduje.**
  `.hero` neturi `overflow`: bet kokia kitokia nei `visible` reikšmė paverstų animuojamą
  elementą savo paties slinkties konteineriu ir paralaksas užšaltų ties nuliu be jokios
  klaidos. Tai užmušė v1 paralaksą (commit `13d2ded`). Kerpama viduje, `.hero-frame`.
- Naršyklėms be `animation-timeline` tą patį 40 px poslinkį padaro `main.js` pasyvus
  klausytojas; abi pusės tikrina tą pačią sąlygą (`@supports` ir `CSS.supports`), todėl
  kartu niekada nepasileidžia. Išmatuota abiem keliais: 0 → 40 px per rėmelio išslinkimą.

## Paieškai ir mašinoms

Viskas renkama iš `content.json`, niekas nerašoma ranka:

| Byla arba žyma | Iš ko |
| --- | --- |
| `<meta name="description">` | `pages[].description` — po savą kiekvienam puslapiui |
| `<link rel="canonical">` | `site.baseUrl` + puslapio byla; pradžiai — **katalogo adresas** (`…/site-template-v2/`), ne `index.html` |
| `og:` ir `twitter:` žymos | antraštė, aprašymas ir `site.ogImage` (1200×630) |
| `LocalBusiness` JSON-LD | `site` laukai: `legalName`, `addr`, `openingHours`, `priceRange`, `areaServed` |
| `WebSite` JSON-LD | pradžios puslapyje |
| `BreadcrumbList` ir matomas kelias | `pages[].crumb`, keturiuose vidiniuose puslapiuose |
| `sitemap.xml` | surinkti puslapiai; `lastmod` — rinkimo diena |
| `robots.txt` | `site.noindex`: `true` uždaro viską, `false` atidaro ir prideda `Sitemap:` eilutę |
| `llms.txt` | įmonės vardas, santrauka, puslapiai su aprašymais, kontaktai |
| `404.html` | `site.notFound`; **jos nuorodos ir resursai absoliutūs**, nes Pages ją paduoda iš bet kokio gylio |
| `favicon.svg`, `apple-touch-icon.png`, `site.webmanifest` | ženklas piešiamas temos spalvomis; PNG surašomas ranka (rasterizatoriaus nėra ir nereikia) |

**Koordinačių (`geo`) JSON-LD viduje nėra sąmoningai.** Platumos ir ilgumos neišgalvosi, o
tuščias laukas blogiau už nesamą. Tikram klientui `geo` įrašomas kartu su jo tikru adresu.

**Vidinės nuorodos.** Sekcijų `links` (ir vienas `faq` atsakymas) veda ten, kur skaitytojui
toliau: paslaugos → darbai ir kontaktai, darbai → paslaugos, apie → kontaktai, „ar atvažiuojate
matuoti“ → kontaktai. Vieno puslapio variante jos virsta inkarais, o tame pačiame puslapyje —
inkaru į savo sekciją. Nuorodos tekstas visada pasako, kur veda; „skaityti daugiau“ ir „čia“
šitame šablone neegzistuoja.

## Ką tikrina `npm test`

Vienas paleidimas, šešiolika patikrinimų, tikra headless Edge naršyklė per CDP, katalogas
paduodamas per http (kad persiųsti baitai būtų tikri).

1. **Kontrastas — `site-verify/scripts/check.mjs`**, kiekvienam puslapiui atskirai: kiekvienas
   paeiliui padedamas `index.html` vieton laikinoje kopijoje, nes `check.mjs` eina tik į šaknį.
   Jis pats pasileidžia naršyklę ir išmatuoja kiekvieno matomo teksto kontrastą trimis
   ėjimais: 1280×800, 390×844 ir 1280×800 su emuliuota tamsia tema. **Skaičiavimo iš žetonų
   čia nebėra ir nebus** — jis praeidavo tada, kai puslapis krisdavo.
2. **Tikri Core Web Vitals**: LCP ir CLS nuskaitomi `PerformanceObserver` iš gyvo puslapio
   (LCP — prieš slinktį, kad nebūtų pakeistas žemiau esančių paveikslėlių). Ribos 2500 ms ir 0,1.
3. Konsolės klaidos ir išimtys, `lang`, vienas `<h1>`, unikali `<title>`, `noindex`,
   horizontalus perpildymas, `width`/`height`/`alt` prie kiekvienos nuotraukos, tuščios
   (permatomos) nuotraukos, vidinės nuorodos ir resursai, `srcset` keliai, ar naršyklė tikrai
   paėmė AVIF, jokių užklausų iš localhost, ta pati byla neužsakyta dukart, 1,5 MB riba,
   meniu telefone, galerijos langas su Escape, formos padėka, lipni antraštė.
4. **Galvutė paieškai ir dalyboms**: canonical (absoliutus, unikalus, pradžiai — katalogo
   adresas), `description`, visos `og:` ir `twitter:` žymos, o `og:image` tikrai atsidaro ir
   yra būtent tokio dydžio, koks parašytas galvutėje.
5. **JSON-LD**: kiekvienas blokas perskaitomas, kiekvienas objektas su `@type`, nė vienos
   tuščios reikšmės, jokio netikėto bloko. Matomas kelias lyginamas su `BreadcrumbList`
   žodis į žodį — jei išsiskiria, vienas iš jų meluoja.
6. **Bylos robotams ir modeliams**: `sitemap.xml` perskaitomas tikru XML parseriu naršyklėje
   ir privalo surašyti lygiai tuos puslapius, kurie surinkti; `robots.txt` seka `site.noindex`
   (tikrinamos abi pusės — svetainė perrenkama su apversta vėliavėle); `llms.txt` yra, turi
   antraštę, santrauką ir visų puslapių nuorodas.
7. **404 iš gilaus kelio**: katalogas prikabinamas prie `site.baseUrl` priešdėlio, atidaromas
   neegzistuojantis adresas, ir tikrinama, kad puslapis atsakė 404, visi jo resursai — 200,
   stiliai įsikėlė, o visos nuorodos absoliučios ir veikiančios.
8. **JS biudžetas**: ne daugiau 20 KB viename puslapyje ir nė vienos `vendor/motion.js`
   užklausos. Šiandien 10,0 KB.
9. Sumažinto judesio ėjimas, ėjimas su išjungtu JS ir surinkimas su išjungta sekcija.

Ekrano nuotraukos: `test/shots/`, po vieną kiekvienam puslapiui ir pločiui, plius kontaktiniai
lapai; `check.mjs` savo kadrus deda į `test/shots/verify-*`.

## Sekcijų vėliavėlės

`content.json` → `sections[]`:

| Laukas | Ką daro |
| --- | --- |
| `id` | sekcijos vardas; jis pat tampa inkaru (`#works`) ir šablono byla `src/templates/<id>.html` |
| `enabled` | `false` — sekcijos nėra nei viename variante, nei meniu |
| `inNav` | `true` — vieno puslapio meniu rodo inkarą į ją (hero niekada nerodomas) |
| `teaser` | tik `pages[]` viduje: rodyti tik pirmus N narių ir nuorodą į pilną puslapį |

Dvylika sekcijų eina tokia eile: hero, paslaugos, darbai, kaip dirbame, už ką atsakome,
skaičiai, atsiliepimai, kainos, dažni klausimai, apie, kontaktai, kvietimas. **Įrodymai
(garantijos, skaičiai, atsiliepimai) eina vėlai, prieš pat prašymą** — ne viršuje, kur
skaitytojas dar neturi priežasties jais domėtis.

Pastabos:

- **Kvietimo ir hero mygtuko užrašas turi sutapti raidė į raidę** („Gauti pasiūlymą“).
  Perrašytas kvietimas skaitomas kaip kitas pasiūlymas.
- **Kainų `note` yra teisinė eilutė: ji perkeliama, o ne mažinama.** Lieka kūno dydžio,
  tik pilkesnė ir atskirta linija.
- `faq` naudoja tikrus `<details>`/`<summary>`, todėl veikia ir be JS, ir su klaviatūra.

## Bylos

```
content.json          visas tekstas ir sekcijų tvarka
build.mjs             rinkėjas: šablonai + turinys -> dist/
tools/images.mjs      _source/ originalai -> -720/-1200/-900/-1800 jpg + avif
src/tokens.css        1 sluoksnis: primityvai
src/theme.css         2 sluoksnis: tema (VIENINTELĖ keičiama byla)
src/styles.css        3 sluoksnis: komponentai
src/main.js           septyni judesiai, meniu, galerija, forma (be bibliotekų)
src/templates/        layout, kelias, 404 + po vieną bylą kiekvienai sekcijai
src/fonts/            Instrument Sans ir Serif poaibiai (woff2) + OFL
src/img/_source/      originalios nuotraukos (į dist nekeliauja)
src/img/              iš jų padaryti dydžiai ir formatai + credits.json
test/harness.mjs      šešiolika patikrinimų gyvoje naršyklėje
CREDITS.md            nuotraukų autoriai ir licencijos
```
