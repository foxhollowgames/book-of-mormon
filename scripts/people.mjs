// People, peoples, objects, and terms that link from the verse text to a study card.
// Each part file exports `people` and `sources`. Run: npm run build
//
// Entry fields:
//   id, name, kind ('person' | 'group' | 'object' | 'term' | 'title')
//   role      short label under the name, e.g. 'Nephite record keeper'
//   era       optional date label in the chapter-date style, e.g. '~323 - 279 BCE'
//   match     regex sources tested against each verse; the first hit in a verse links
//   books / chapters / notBooks   limit where the name links (needed for shared names)
//   summary   one or two sentences that identify the entry
//   detail    optional sentences on why the entry matters
//   refs      [{ref:'Omni 1:3', note}] key statements in the text
//   scholarship [{text, sourceId}] research from trusted sources, kept apart from the text
//   related   ids of other entries
import * as smallPlates from './people/small-plates.mjs';
import * as mosiah from './people/mosiah.mjs';
import * as alma from './people/alma.mjs';
import * as later from './people/helaman-moroni.mjs';

const parts = [smallPlates, mosiah, alma, later];
export const people = parts.flatMap(p => p.people);
const seen = new Set();
export const sources = parts.flatMap(p => p.sources || []).filter(s => !seen.has(s.id) && seen.add(s.id));

const ids = new Set();
for (const p of people) {
  if (ids.has(p.id)) throw new Error(`Duplicate person id: ${p.id}`);
  ids.add(p.id);
}
