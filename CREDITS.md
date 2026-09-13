# Nuotraukos

Svetainėje yra keturios fotografijos: viena hero sekcijoje ir trys darbų galerijoje.
Originalai — `src/img/_source/`; iš jų `node tools/images.mjs` padaro dydžius ir AVIF
variantus, kurių prašo `content.json`. Galerijos lange rodomas parašas surenkamas iš
`src/img/credits.json` pagal šabloną „Nuotrauka: {author}, {source}, {license}“.

## Autoriai ir licencijos

Duomenys paimti iš Wikimedia Commons API 2026-09-13 ir patikrinti prie kiekvienos bylos
puslapio. **Trims iš keturių nuotraukų nurodyti autorių yra privaloma.**

| Vardas | Autorius | Licencija | Nurodyti autorių |
| --- | --- | --- | --- |
| `hero-1800` | US Air Force | viešoji sritis | ne |
| `laiptai-sraigtiniai` | Jules Verne Times Two | CC BY-SA 4.0 | **taip** |
| `tureklai-balkonas` | SuSanA Secretariat | CC BY 2.0 | **taip** |
| `virtuve-nerudijantis` | Winedirector | CC BY-SA 3.0 | **taip** |

Šaltinių puslapiai:

- hero — https://commons.wikimedia.org/wiki/File:Let_the_sparks_fly_(13313009905).jpg
- laiptai-sraigtiniai — https://commons.wikimedia.org/wiki/File:Metal_spiral_staircase_on_the_side_of_a_warehouse,_Segeltorp,_Stockholm,_Sweden_julesvernex2.jpg
- tureklai-balkonas — https://commons.wikimedia.org/wiki/File:Aboveground_again_(1)_(26462779404).jpg
- virtuve-nerudijantis — https://commons.wikimedia.org/wiki/File:Central_Restaurante_Kitchen_-_Lima,_Peru.jpg

Licencijų tekstai: [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/),
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/),
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

## Statant tikro kliento svetainę

Visos keturios nuotraukos keičiamos kliento nuotraukomis. Tada perrašomas
`src/img/credits.json` ir šita lentelė. Jei kliento nuotraukos yra jo paties, licencijos
eilutė nereikalinga — bet parašas galerijoje sudaromas iš tų pačių trijų laukų, todėl
palik juos užpildytus.

## Šriftai

Instrument Sans ir Instrument Serif — SIL Open Font License 1.1. Licencijų tekstai:
`src/fonts/OFL-Instrument-Sans.txt` ir `src/fonts/OFL-Instrument-Serif.txt`.

## Motion

`src/vendor/motion.js` — Motion 13.2.0, MIT licencija, tekstas `src/vendor/motion-LICENSE.md`.
