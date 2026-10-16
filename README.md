# Book of Mormon Wayfinder

A local, map-first study guide for the Book of Mormon. It follows the Bible Wayfinder app shell (synced with Bible Wayfinder `main` at 48f5a45): the book directory, the book header with a back arrow, the shared Menu with Read and Map study modes, Recenter, the chapter picker, context cards, study guides, and the source library.

The home page is the book directory. It groups the 15 books into the small plates, Mormon’s abridgment, and Moroni’s additions. Each card shows the part of the relief map where that book’s places sit. A book opens in `book.html#chapter=<book>-<n>`. Menu choices (study mode and lens) apply to every book.

The map is **relative**. It is not placed on any real land or globe. It is drawn on a flat grid where one unit is one of John L. Sorenson's estimated miles, following *Mormon's Map* (FARMS, 2000). The city of Zarahemla is the origin.

This copy lives only on this computer. It is not connected to the Isaiah GitHub Pages site and the server listens on 127.0.0.1 only.

## Run locally

Double-click **Start Book of Mormon Wayfinder.cmd**, or run `npm start` in this folder, then open http://127.0.0.1:4174. (Isaiah uses port 4173, so both can run at once.) Node.js is the only requirement.

## What is on the map

- **Shaded relief base.** The map tiles in `dist/assets/relief/` (8 pixels per mile at the closest zoom) and the smaller `dist/assets/relief.jpg` for the book cards are drawn by `scripts/render-relief.py` from the terrain shapes in `scripts/geography.mjs`. A small river-erosion model cuts valleys and ridges into those shapes. The script then shades the result like the Bible Wayfinder relief: smooth plains, sharp high ground, and a shaded sea floor. It is an illustration of "up," "down," and "over" in the text, not real elevation data. Turn on **Terrain zones** to see the outlined zones it was built from and click them for their verses.

- **Places (76).** Each place has a confidence level:
  - *Text gives its relations* — the Book of Mormon links it to other places; Sorenson's figures set the spot.
  - *Sorenson's inference* — Sorenson works out the spot from hints.
  - *Rough guess* — dashed marker. The text gives almost no position (for example most cities in 3 Nephi 9).
- **High and low land.** Highlands of Nephi, the narrow strip of wilderness, the western mountains, the east upland, and the land northward's western highlands, from Sorenson's reading of "up," "down," and "over."
- **Paths (40).** Named movements with kind (army, escape, journey, migration, search party, voyage, gathering). Only the stops come from the text; bends between stops are for reading.
- **Sorenson's distances (15).** Dotted lines for his mile estimates (Nephi–Zarahemla ~180 mi, the neck 60–125 mi, etc.). Off by default; shown in guide steps that use them.
- **Destruction at Christ's death** rings in 3 Nephi 8–9.

Every chapter has an original four-sentence summary from the local public-domain text.
Eight map passages also have an original context note and an exact scripture quote.
The chapter block follows Bible Wayfinder's title, prose, and collapsed **Paths and facts** layout.
Place names in each verse open the place card. 103 chapters have map places.
Open **Map context** in the layer panel for named-place chips and area names.
Names of people, peoples, objects, and terms in each verse open a study card. There are 297 entries in `scripts/people/`, joined by `scripts/people.mjs`. A card gives the person's role, the text's key verses, and related entries. 63 entries also have a separate **Scholarship** section. It cites trusted research, such as the BYU Book of Mormon Onomasticon and Scripture Central. Shared names, such as the four Nephis, are limited by chapter. `npm run check` fails when two entries claim the same words.
Each chapter heading shows a date. The dates in `scripts/chapter-dates.tsv` come from the Church edition at churchofjesuschrist.org. The Jaredite chapters of Ether have no date there, so they say so.
Chapter introductions ground each new name with a short role the first time it appears.

Place dots, labels, paths, terrain zones, distance lines, and destruction rings have click handlers.
Place labels have a full-size target that reaches the dot. They also support keyboard activation.
Terrain gets keyboard access when its layer enters the map.
The ring's stroke sits above labels. Its empty center preserves access to the place dot.
Context cards use the shared title, kind, body, verse references, and source list.
The shared `modal-drag.js` adds the drag handle.

## The Old World stage (1 Nephi 1–17)

1 Nephi 1–17 happens before the family reaches the promised land. For those chapters the map shows **real land** from Jerusalem to the coast of Oman. 1 Nephi 18 jumps to Mormon's map for the landing.

- The stage sits on the same flat grid of miles, far east of Mormon's map (Jerusalem is at `[3000, 0]`). The app changes the map bounds when a chapter changes stage.
- `scripts/old-world.mjs` holds the 6 places, 5 paths, sea labels, and sources. Positions are given in latitude and longitude.
- Jerusalem is a *known place*. The Red Sea borders, the valley of Lemuel, Nahom, and Bountiful are *proposed sites*. Shazer is a *rough guess*. Each card names the researcher.
- The relief uses measured elevation, as Bible Wayfinder does. `scripts/fetch-old-world-terrain.mjs` downloads 504 Mapzen terrarium tiles (about 40 MB) into the git-ignored `scripts/terrain-old-world/`. `scripts/render-old-world.py` shades them with the same recipe as `render-relief.py` and writes `dist/assets/relief-old/`, `dist/assets/relief-old.jpg`, and `dist/data/relief-old.json`.
- The coast, the Dead Sea, the Sea of Galilee, and the great rivers come from the Natural Earth files that Bible Wayfinder uses. Clipped copies are in `scripts/source/old-world-*.geojson`.

Rebuild the stage after editing `scripts/old-world.mjs`:

```text
npm run build
node scripts/fetch-old-world-terrain.mjs   # only the first time
python scripts/render-old-world.py          # about 1 minute; fails if a place lands in water
npm run check
```

## Menu

**Read** shows the scripture beside the map. **Map** gives the whole screen to the map. **Recenter** appears at the top of the map after you move or zoom it.
Map mode has a chapter-order slider, as in Bible Wayfinder's undated books.
Previous and Next continue across books. Next on the last chapter of a book opens chapter 1 of the next book. Previous on chapter 1 opens the last chapter of the previous book.
The extra **Show the whole land** button was removed. Zoom out to see the whole land.

Under **Study lens**, **Text only** shows what the Book of Mormon says. **Text + Sorenson** adds his reasoning, page references, figures, and distances.
The distance control is shown only with **Text + Sorenson**.
Figure buttons no longer repeat in chapter introductions or place cards.
The numbered figure guide remains in Menu.

## Guides

Open **Menu → Open study guides**. (Bible Wayfinder removed its top-bar Guides button, so the guides moved into the menu here.)

- **Sorenson's 17 maps** — one step per numbered figure, opening the chapter he uses. (The online PDF scan is missing the page for map 11; that step follows his text.)
- **Mormon's own summary** — Alma 22:27–34 in five steps.

## Files

- `scripts/geography.mjs` — the single source of truth for places, terrain, paths, distances, figures, and impacts (coordinates in miles).
- `scripts/prepare-scripture.mjs` — converts `scripts/source/book-of-mormon.json` to `dist/data/scripture.json`.
- `scripts/build-content.mjs` — builds `dist/data/content.json` and maps every chapter.
- `scripts/chapter-copy.tsv` — original chapter titles and summaries. The builder checks complete chapter coverage.
- `scripts/organic-shapes.mjs` — shared coast and lake outlines for the renderer and overlays.
- `scripts/check.mjs` — checks every reference exists, every path stop exists, every marker is on land, and the 15-word sentence rule from the Isaiah writing guide.

Rebuild and check after editing geography:

```text
npm run build
python scripts/render-relief.py   # needs NumPy, SciPy, and Pillow; takes about 4 minutes; fails if a place lands in water
npm run check
```

## Sources and reuse

- Scripture text: [bcbooks/scriptures-json](https://github.com/bcbooks/scriptures-json) (`bom-4`, 1981 text with 2013 corrections). Public domain. No chapter summaries or footnotes.
- John L. Sorenson, *Mormon's Map* (Provo: FARMS, 2000). Copyrighted. The app gives page references and short original summaries only. [PDF](https://archive.bookofmormoncentral.org/sites/default/files/archive-files/pdf/sorenson/2024-04-18/john_l._sorenson_mormons_map_2000.pdf) · [Book page](https://scripturecentral.org/archive/books/book/mormons-map-0)
- Leaflet (BSD 2-Clause), bundled in `dist/vendor`.

Sorenson's chapter 6 links the hourglass shape to Middle America. This app deliberately stops before that step.

## Map corrections and relief

- Manti moved from `[10, -72]` to `[5, -72]`, west of Sidon. Alma 43:32, 42 connects the west valley with Manti.
- Nephihah moved from `[58, 88]` to `[54, 92]`. Alma 50:14 places it between Aaron and Moroni.
- The narrow strip now reaches both coasts. Alma 22:27 and Alma 50:11 describe that sea-to-sea boundary.
- The city order on the east coast, the neck, and Sidon's course remain as previously modeled.
- Coast and lake curves share one deterministic shape with the overlays. Small bends are illustrative.
- The unknown north and south ends have rounded, fading caps. These are not proposed geographic boundaries.
- Terrain uses blended height fields and irregular ridges. The Sidon valley cuts through the southern highlands.
- A soft shelf surrounds the coast. The olive, ochre, pale-peak, and blue-water colors remain.
- The renderer traces the largest streams of its erosion model into `dist/data/relief.json`. The app draws them as thin, unnamed rivers. The text names only the Sidon, and the streams join its drawn course.
- Seed `1830` keeps the relief stable. Cache version `20261013.4` loads the changed assets.

## Verification limits

`npm run build` and `npm run check` passed after these changes.
The relief renderer passed its separate check for markers on the rendered land.
The relief image was inspected directly on disk.
A temporary Node check ran the app's card-opening functions with mocked Leaflet and DOM objects.
It covered place dots and labels, paths, terrain, distances, impacts, and delegated place links.
It also checked closing, reopening, keyboard use, all place cards, and all chapter introductions.
The temporary check was removed after it passed.
Browser access was denied by automatic approval review. Real mouse hit-testing and browser layout were not verified.
The confirmed label fault was a zero-size target with pointer-disabled visible text.
The original dot-only mouse failure could not be reproduced in a real browser during this work.
Impact rings had clicks disabled. Terrain lacked keyboard setup when first added to the map.
The shared CSS and helper files were compared with Bible Wayfinder `main` at `48f5a45`.
That checkout has no `directory.css`. This app keeps only its map-cover additions there.
See [the control comparison](docs/control-comparison.md) for the full control inventory.
