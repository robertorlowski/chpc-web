// Eksport danych pomiarowych z bazy chpc-web do archiwum: jedna kolekcja, jeden rok
// (createdAt w czasie warszawskim), JSON Lines w Extended JSON (zachowuje ObjectId i daty), gzip.
// Użycie (z katalogu server, MONGODB_URI w server/.env):
//   node ../archiwum/export-year.cjs <kolekcja> <rok> <plik.jsonl.gz>
require('dotenv').config({ quiet: true });
const fs = require('fs');
const zlib = require('zlib');
const { MongoClient } = require('mongodb');
const { EJSON } = require('bson');

(async () => {
  const [collection, year, out] = process.argv.slice(2);
  const from = new Date(`${year}-01-01T00:00:00+01:00`);
  const to = new Date(`${Number(year) + 1}-01-01T00:00:00+01:00`);
  const client = await MongoClient.connect(process.env.MONGODB_URI);
  const gzip = zlib.createGzip({ level: 9 });
  const file = fs.createWriteStream(out);
  gzip.pipe(file);
  let count = 0;
  for await (const doc of client.db().collection(collection).find({ createdAt: { $gte: from, $lt: to } }).sort({ createdAt: 1 })) {
    if (!gzip.write(EJSON.stringify(doc, { relaxed: false }) + '\n')) await new Promise((r) => gzip.once('drain', r));
    count++;
  }
  gzip.end();
  await new Promise((r) => file.on('finish', r));
  await client.close();
  console.log(JSON.stringify({ collection, year, from, to, count, file: out }));
})().catch((e) => { console.error(e); process.exit(1); });
