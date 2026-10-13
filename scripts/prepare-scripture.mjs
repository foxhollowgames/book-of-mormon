// Converts the public-domain bcbooks/scriptures-json edition into the app's
// chapter-keyed reading file. Run: node scripts/prepare-scripture.mjs
import { readFile, writeFile } from 'node:fs/promises';

const source = JSON.parse(await readFile(new URL('./source/book-of-mormon.json', import.meta.url)));
export const slug = (book, chapter) => `${book.toLowerCase().replace(/\s+/g, '-')}-${chapter}`;

const books = [], chapters = {};
for (const book of source.books) {
  const ids = [];
  for (const chapter of book.chapters) {
    const id = slug(book.book, chapter.chapter);
    ids.push(id);
    chapters[id] = {
      book: book.book,
      chapter: chapter.chapter,
      label: `${book.book} ${chapter.chapter}`,
      verses: chapter.verses.map(v => ({ verse: v.verse, text: v.text }))
    };
  }
  books.push({ book: book.book, title: book.full_title || book.book, chapters: ids });
}

const output = {
  translation: 'The Book of Mormon',
  edition: 'Text of the 1981 edition with 2013 corrections, via bcbooks/scriptures-json (bom-4)',
  copyright: 'Public domain text file',
  source: 'https://github.com/bcbooks/scriptures-json',
  books,
  chapters
};
await writeFile(new URL('../dist/data/scripture.json', import.meta.url), JSON.stringify(output));
const verseCount = Object.values(chapters).reduce((n, c) => n + c.verses.length, 0);
console.log(`Wrote ${books.length} books, ${Object.keys(chapters).length} chapters, ${verseCount} verses.`);
