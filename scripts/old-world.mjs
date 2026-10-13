// The Old World stage for 1 Nephi 1–17: Jerusalem, the Red Sea, and Arabia.
// Unlike Mormon's map, this stage is real land. Positions are given in latitude
// and longitude, then moved onto the app's flat grid of miles. The stage sits far
// east of Mormon's map on that grid, so the two never touch.
// Jerusalem is a known place. Every camp after it is a proposal by researchers.

// Flat projection: one unit is one mile. East-west miles are true at 23° north,
// the middle of the trail, and are within about 8% elsewhere on this map.
const LAT0 = 31.78, LNG0 = 35.23;                 // Jerusalem
const MILES_LAT = 69.09, MILES_LNG = 69.17 * Math.cos(23 * Math.PI / 180);
export const stage = {
  id: 'old', origin: [3000, 0], lat0: LAT0, lng0: LNG0, milesPerLat: MILES_LAT, milesPerLng: MILES_LNG,
  bounds: [[-1400, 2600], [190, 4480]]            // [[south, west], [north, east]] in miles, as Leaflet reads it
};
export const fromLatLng = (lat, lng) => [Math.round((3000 + (lng - LNG0) * MILES_LNG) * 10) / 10, Math.round((lat - LAT0) * MILES_LAT * 10) / 10];
const LL = fromLatLng;

const chapters = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `1-nephi-${from + i}`);
const OLD = chapters(1, 17);
export const isOldWorldChapter = id => OLD.includes(id);

// conf: "known" = a place known today; "proposed" = researchers propose this site;
// "guess" = the text gives almost no position.
const P = (id, name, kind, at, conf, match, summary, refs, research, extra = {}) => ({ id, name, kind, at, conf, match, summary, refs, sorenson: null, research, stage: 'old', chapters: OLD, ...extra });
export const places = [
  P('jerusalem', 'Jerusalem', 'city', LL(31.778, 35.235), 'known', ['\\bJerusalem\\b'],
    'Jerusalem was the capital of Judah. Lehi lived there until the Lord told him to leave.',
    [{ ref: '1 Nephi 1:4', note: 'Lehi had lived at Jerusalem all his days.' }, { ref: '1 Nephi 3:9', note: 'Nephi and his brothers went up to the land of Jerusalem.' }],
    null),
  P('red-sea-borders', 'Borders near the Red Sea', 'place', LL(29.56, 35.02), 'proposed', ['\\bRed Sea\\b'],
    'Lehi came down to the borders near the Red Sea. The text names no town there.',
    [{ ref: '1 Nephi 2:5', note: 'Lehi came down by the borders near the shore of the Red Sea.' }],
    { text: 'Researchers place this at the head of the Gulf of Aqaba. It is the arm of the Red Sea nearest Jerusalem.', sourceId: 'aston-2006' },
    { chapters: ['1-nephi-2', '1-nephi-16'] }),
  P('valley-lemuel', 'Valley of Lemuel', 'feature', LL(28.56, 34.86), 'proposed', ['\\bvalley of Lemuel\\b', '\\bname of the river, Laman\\b'],
    'Lehi camped in a valley beside a river. He named the valley Lemuel and the river Laman.',
    [{ ref: '1 Nephi 2:6', note: 'Lehi traveled three days and pitched his tent in a valley by a river.' }, { ref: '1 Nephi 2:8', note: 'He named the river Laman. It emptied into the Red Sea.' }, { ref: '1 Nephi 16:6', note: 'These things happened while Lehi lived in the valley of Lemuel.' }],
    { text: 'George Potter proposed Wadi Tayyib al-Ism in northwest Arabia. A stream runs there through a deep canyon toward the sea.', sourceId: 'potter-1999' }),
  P('shazer', 'Shazer', 'place', LL(27.72, 35.62), 'guess', ['\\bShazer\\b'],
    'The family camped at Shazer after four days of travel. They hunted there with bows.',
    [{ ref: '1 Nephi 16:13', note: 'They traveled four days, nearly south-southeast, and named the place Shazer.' }],
    null),
  P('nahom', 'Nahom', 'place', LL(15.85, 44.6), 'proposed', ['\\bNahom\\b'],
    'Ishmael died and was buried at a place called Nahom. His daughters mourned there.',
    [{ ref: '1 Nephi 16:34', note: 'Ishmael was buried in the place which was called Nahom.' }],
    { text: 'The Nihm tribal land lies northeast of Sanaa in Yemen. Altars near Marib carry the name NHM from about Lehi’s time.', sourceId: 'brown-1999' }),
  P('old-bountiful', 'Bountiful (Arabian coast)', 'land', LL(16.74, 53.33), 'proposed', ['\\bBountiful\\b'],
    'The family reached a coast with much fruit and wild honey. They called it Bountiful.',
    [{ ref: '1 Nephi 17:5', note: 'They came to the land they called Bountiful, by the sea.' }, { ref: '1 Nephi 17:8', note: 'The Lord told Nephi to build a ship there.' }],
    { text: 'Researchers propose green inlets on the Dhofar coast of Oman. Khor Kharfot and Khor Rori are the main candidates.', sourceId: 'aston-1998' },
    { chapters: ['1-nephi-17'] })
];

export const areas = [
  { id: 'irreantum', name: 'Irreantum · many waters', at: LL(14.9, 54.6), match: ['\\bIrreantum\\b'], chapters: ['1-nephi-17'], stage: 'old' }
];

export const labels = [
  { text: 'RED SEA', at: LL(20.6, 38.6), kind: 'sea' }, { text: 'ARABIAN SEA', at: LL(13.4, 55.6), kind: 'sea' },
  { text: 'MEDITERRANEAN SEA', at: LL(33.4, 31.6), kind: 'sea' }, { text: 'PERSIAN GULF', at: LL(26.9, 51.4), kind: 'sea' },
  { text: 'ARABIA', at: LL(23.6, 45.6), kind: 'land' }, { text: 'EGYPT', at: LL(27.2, 31), kind: 'land' }
];

// Movements. Only the named stops come from the text. The bends follow common proposals.
const R = (id, title, kind, points, refs, chapters, text, research) => ({ id, title, kind, points, refs, chapters, text, sorenson: null, research, stage: 'old' });
const upToJerusalem = ['valley-lemuel', LL(29.1, 35.0), 'red-sea-borders', LL(30.55, 35.28), LL(31.25, 35.2), 'jerusalem'];
export const routes = [
  R('lehi-departs', 'Lehi’s family leaves Jerusalem', 'flight', [...upToJerusalem].reverse(), '1 Nephi 2:2–6', ['1-nephi-2'],
    'The Lord told Lehi to leave Jerusalem. The family camped three days past the Red Sea borders.',
    { text: 'The road down the Arabah valley is one common proposal. The text names no road.', sourceId: 'aston-2006' }),
  R('plates-journey', 'The sons return for the brass plates', 'journey', upToJerusalem, '1 Nephi 3:9; 1 Nephi 4:38', ['1-nephi-3', '1-nephi-4'],
    'Nephi and his brothers went up to Jerusalem for the plates. They came back with the plates and Zoram.',
    null),
  R('ishmael-journey', 'The sons bring Ishmael’s family', 'journey', upToJerusalem, '1 Nephi 7:2–5, 22', ['1-nephi-7'],
    'The sons went up to Jerusalem again. Ishmael’s family came down with them to the valley.',
    null),
  R('valley-to-nahom', 'From the valley to Nahom', 'journey', ['valley-lemuel', 'shazer', LL(26.6, 37.9), LL(24.5, 39.6), LL(21.3, 40.6), LL(18.3, 42.7), LL(17.5, 44.1), 'nahom'], '1 Nephi 16:13–17, 33–34', ['1-nephi-16'],
    'The family traveled south-southeast near the Red Sea. Nephi’s bow broke on the way. Ishmael died at Nahom.',
    { text: 'Researchers follow the old incense road east of the coastal mountains. The text names only Shazer and Nahom.', sourceId: 'aston-2006' }),
  R('nahom-to-bountiful', 'Eastward to Bountiful', 'journey', ['nahom', LL(15.9, 46.6), LL(16.5, 49.5), LL(17.0, 52.0), 'old-bountiful'], '1 Nephi 17:1–5', ['1-nephi-17'],
    'From Nahom the family traveled nearly eastward. After eight years in the wilderness they reached the sea.',
    { text: 'This line runs along the south edge of the great Arabian desert. The stops are not known.', sourceId: 'aston-2006' })
];

// Chapters that name no place still show where the family is camped.
export const focus = Object.fromEntries([5, 6, 8, 9, 10, 11, 12, 13, 14, 15].map(n => [`1-nephi-${n}`, ['valley-lemuel', 'jerusalem']]));

export const sources = [
  { id: 'aston-2006', title: 'Across Arabia with Lehi and Sariah', author: 'Warren P. Aston', year: 2006, type: 'Journal article',
    publisher: 'Journal of Book of Mormon Studies 15, no. 2',
    url: 'https://scholarsarchive.byu.edu/jbms/vol15/iss2/4',
    summary: 'Aston follows the family from Jerusalem to the coast of Oman. He compares each stage with the land of Arabia.',
    limitations: 'The text gives directions and travel times, not coordinates. Every camp after Jerusalem is a proposal.',
    license: 'Copyrighted article. This app gives short original summaries only.' },
  { id: 'potter-1999', title: 'A New Candidate in Arabia for the Valley of Lemuel', author: 'George D. Potter', year: 1999, type: 'Journal article',
    publisher: 'Journal of Book of Mormon Studies 8, no. 1',
    url: 'https://scholarsarchive.byu.edu/jbms/vol8/iss1/11',
    summary: 'Potter describes a stream in a canyon east of the Gulf of Aqaba. He proposes it as the river Laman.',
    limitations: 'Other researchers propose other valleys. No inscription names the valley.',
    license: 'Copyrighted article. This app gives short original summaries only.' },
  { id: 'brown-1999', title: 'The Place That Was Called Nahom: New Light from Ancient Yemen', author: 'S. Kent Brown', year: 1999, type: 'Journal article',
    publisher: 'Journal of Book of Mormon Studies 8, no. 1',
    url: 'https://scripturecentral.org/archive/periodicals/journal-article/the-place-that-was-called-nahom-new-light-from-ancient-yemen',
    summary: 'Brown reports an altar in Yemen that names the tribe Nihm. He links the name to Nahom.',
    limitations: 'The altar shows the name in the region. It does not mark Ishmael’s grave.',
    license: 'Copyrighted article. This app gives short original summaries only.' },
  { id: 'aston-1998', title: 'The Arabian Bountiful Discovered? Evidence for Nephi’s Bountiful', author: 'Warren P. Aston', year: 1998, type: 'Journal article',
    publisher: 'Journal of Book of Mormon Studies 7, no. 1',
    url: 'https://scholarsarchive.byu.edu/jbms/vol7/iss1/2',
    summary: 'Aston describes a green inlet on the south coast of Oman. He compares it with Nephi’s description of Bountiful.',
    limitations: 'Aston says the site may not be the exact place. Other researchers prefer a different inlet.',
    license: 'Copyrighted article. This app gives short original summaries only.' },
  { id: 'terrain-tiles', title: 'Terrain Tiles and Natural Earth', author: 'Mapzen, USGS, NOAA, and Natural Earth contributors', year: 2017, type: 'Elevation and coastline data',
    url: 'https://registry.opendata.aws/terrain-tiles/',
    summary: 'The Old World relief uses measured elevation data. Coasts and rivers come from Natural Earth.',
    limitations: 'The data shows the land today. Coasts and rivers have changed since Lehi’s time.',
    license: 'Open data. Terrain: Mapzen, USGS, and NOAA. Natural Earth is in the public domain.' }
];
