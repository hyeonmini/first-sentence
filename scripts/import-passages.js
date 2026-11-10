#!/usr/bin/env node
// 사용법:
//   node scripts/import-passages.js <파일경로.json | .jsonl | .md | .txt>
//   인자 없이 실행하면 data/corpus/ 폴더와 기본 시드를 SQLite(data/vault.db)에 재색인합니다.

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { parseCorpusFile, syncAllPassagesToDb } = require('../corpus/importer');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CORPUS_DIR = path.join(DATA_DIR, 'corpus');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(CORPUS_DIR)) fs.mkdirSync(CORPUS_DIR, { recursive: true });

const argPath = process.argv[2];
if (argPath) {
  const abs = path.resolve(process.cwd(), argPath);
  if (!fs.existsSync(abs)) {
    console.error(`파일을 찾을 수 없습니다: ${abs}`);
    process.exit(1);
  }
  const parsed = parseCorpusFile(abs);
  const destName = path.basename(abs, path.extname(abs)) + '.imported.json';
  const destPath = path.join(CORPUS_DIR, destName);
  fs.writeFileSync(destPath, JSON.stringify(parsed, null, 2), 'utf8');
  console.log(`✔ ${parsed.length}개 구절을 ${destPath} 로 변환·저장했습니다.`);
}

const db = new DatabaseSync(path.join(DATA_DIR, 'vault.db'));
const total = syncAllPassagesToDb(db, CORPUS_DIR);
const byCat = db.prepare('SELECT cat, COUNT(*) AS cnt FROM passages GROUP BY cat').all();

console.log(`✔ SQLite 아카이브 동기화 완료 — 총 ${total}개 구절`);
for (const row of byCat) {
  console.log(`  · ${row.cat}: ${row.cnt}개`);
}
