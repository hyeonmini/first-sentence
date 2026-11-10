const fs = require('node:fs');
const path = require('node:path');
const {
  inferConcepts,
  extractAuthorFromSource,
  inferLineage
} = require('./concept_graph');
const { buildSeedPassages } = require('./seed_passages');

function normalizePassageRecord(raw, defaultCat = '철학') {
  if (!raw || typeof raw !== 'object') return null;
  const text = String(raw.text || raw.quote || '').replace(/^["“”]+|["“”]+$/g, '').trim();
  if (text.length < 4) return null;

  const source = String(raw.source || raw.citation || raw.author || '작자 미상').trim();
  const cat = ['철학', '경전', '문학'].includes(raw.cat) ? raw.cat : defaultCat;
  const author = String(raw.author || extractAuthorFromSource(source)).trim();
  const lineage = String(raw.lineage || inferLineage(author, cat)).trim();
  const tagsPattern = raw.tags instanceof RegExp
    ? raw.tags.source
    : String(raw.tagsPattern || raw.tags || '');
  const concepts = Array.isArray(raw.concepts) && raw.concepts.length > 0
    ? raw.concepts
    : inferConcepts(text, `${source} ${tagsPattern}`);

  return {
    text,
    author,
    source,
    cat,
    lineage,
    concepts,
    tagsPattern
  };
}

// 마크다운 파일에서 `- "구절" — 출처` 또는 `> 구절 — 출처` 형식을 자동 파싱
function parseMarkdownPassages(mdContent, filename = '') {
  let defaultCat = '문학';
  if (/철학|사상|phil/i.test(filename)) defaultCat = '철학';
  else if (/경전|종교|성경|불경|relig/i.test(filename)) defaultCat = '경전';

  const records = [];
  const lines = String(mdContent).split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#\s*(철학|경전|문학)\s*$/.test(line)) {
      defaultCat = line.replace(/^#\s*/, '').trim();
      continue;
    }
    if (line.startsWith('#')) continue;

    const cleaned = line.replace(/^[-*>•\d.)\s]+/, '').trim();
    const match = cleaned.match(/^["“]?(.+?)["”]?\s*(?:—|--|―|-)\s*(.+)$/);
    if (match) {
      const rec = normalizePassageRecord({
        text: match[1],
        source: match[2],
        cat: defaultCat
      }, defaultCat);
      if (rec) records.push(rec);
    }
  }
  return records;
}

function parseCorpusFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const raw = fs.readFileSync(filePath, 'utf8');
  const base = path.basename(filePath);

  if (ext === '.json') {
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed.passages || []);
    return arr.map(x => normalizePassageRecord(x)).filter(Boolean);
  }

  if (ext === '.jsonl') {
    return raw
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        try { return normalizePassageRecord(JSON.parse(l)); } catch (_) { return null; }
      })
      .filter(Boolean);
  }

  if (ext === '.md' || ext === '.txt') {
    return parseMarkdownPassages(raw, base);
  }

  return [];
}

function syncAllPassagesToDb(db, corpusDir) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS passages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL UNIQUE,
      author TEXT NOT NULL,
      source TEXT NOT NULL,
      cat TEXT NOT NULL DEFAULT '철학',
      lineage TEXT NOT NULL DEFAULT '',
      concepts_json TEXT NOT NULL DEFAULT '[]',
      tags_pattern TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_passages_cat ON passages(cat);
    CREATE INDEX IF NOT EXISTS idx_passages_author ON passages(author);
    CREATE INDEX IF NOT EXISTS idx_passages_lineage ON passages(lineage);
  `);

  const upsert = db.prepare(`
    INSERT INTO passages (text, author, source, cat, lineage, concepts_json, tags_pattern)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(text) DO UPDATE SET
      author = excluded.author,
      source = excluded.source,
      cat = excluded.cat,
      lineage = excluded.lineage,
      concepts_json = excluded.concepts_json,
      tags_pattern = excluded.tags_pattern
  `);

  const records = [...buildSeedPassages()];

  if (corpusDir && fs.existsSync(corpusDir)) {
    const files = fs.readdirSync(corpusDir).sort();
    for (const f of files) {
      if (f.startsWith('.')) continue;
      const full = path.join(corpusDir, f);
      if (fs.statSync(full).isFile()) {
        try {
          records.push(...parseCorpusFile(full));
        } catch (err) {
          console.error(`[corpus] ${f} 로드 오류:`, err.message);
        }
      }
    }
  }

  db.exec('BEGIN');
  try {
    for (const r of records) {
      upsert.run(
        r.text,
        r.author,
        r.source,
        r.cat,
        r.lineage,
        JSON.stringify(r.concepts || []),
        r.tagsPattern || ''
      );
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  const total = db.prepare('SELECT COUNT(*) AS cnt FROM passages').get().cnt;
  return total;
}

module.exports = {
  normalizePassageRecord,
  parseCorpusFile,
  syncAllPassagesToDb
};
