const {
  CONCEPTS,
  inferConcepts,
  getAntithesisConcepts,
  extractAuthorFromSource,
  inferLineage
} = require('./concept_graph');

function hydrateRow(row) {
  if (!row) return null;
  let concepts = [];
  try { concepts = JSON.parse(row.concepts_json || '[]'); } catch (_) {}
  return {
    id: row.id,
    text: row.text,
    author: row.author,
    source: row.source,
    cat: row.cat,
    lineage: row.lineage,
    concepts,
    tagsPattern: row.tags_pattern || ''
  };
}

function extractLastQuotedAnchorFromText(db, editorText = '') {
  if (!editorText || !editorText.trim()) return null;
  const regex = /["“]([^"”\n]{6,})["”]\s*(?:—|--|―)\s*([^\n]+)/g;
  let match;
  let lastQuote = null;
  while ((match = regex.exec(editorText)) !== null) {
    lastQuote = { text: match[1].trim(), source: match[2].trim() };
  }
  if (!lastQuote) return null;

  const prefix = lastQuote.text.slice(0, 24);
  const found = db.prepare('SELECT * FROM passages WHERE text LIKE ? LIMIT 1').get(`${prefix}%`);
  if (found) return hydrateRow(found);

  // DB에 없는 사용자가 직접 타이핑한 인용구라도 즉시 작가·계보·개념축을 추론하여 연관 추천 지원
  const author = extractAuthorFromSource(lastQuote.source);
  const lineage = inferLineage(author, '철학');
  const concepts = inferConcepts(lastQuote.text, lastQuote.source);
  return {
    id: -1,
    text: lastQuote.text,
    author,
    source: lastQuote.source,
    cat: '철학',
    lineage,
    concepts,
    tagsPattern: ''
  };
}

function resolveAnchor(db, explicitAnchor, editorText) {
  if (explicitAnchor && explicitAnchor.id && explicitAnchor.id > 0) {
    const row = db.prepare('SELECT * FROM passages WHERE id = ?').get(explicitAnchor.id);
    if (row) return hydrateRow(row);
  }
  if (explicitAnchor && explicitAnchor.text) {
    const author = explicitAnchor.author || extractAuthorFromSource(explicitAnchor.source || '');
    return {
      id: explicitAnchor.id || -1,
      text: explicitAnchor.text,
      author,
      source: explicitAnchor.source || author,
      cat: explicitAnchor.cat || '철학',
      lineage: explicitAnchor.lineage || inferLineage(author, explicitAnchor.cat || '철학'),
      concepts: Array.isArray(explicitAnchor.concepts) && explicitAnchor.concepts.length
        ? explicitAnchor.concepts
        : inferConcepts(explicitAnchor.text, explicitAnchor.source || ''),
      tagsPattern: ''
    };
  }
  return extractLastQuotedAnchorFromText(db, editorText);
}

function matchesEditorContext(passage, text) {
  if (!text || !passage.tagsPattern) return false;
  try {
    return new RegExp(passage.tagsPattern).test(text);
  } catch (_) {
    return false;
  }
}

function withWaGwa(word = '') {
  const trimmed = String(word).trim();
  if (!trimmed) return word;
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    const hasBatchim = (code - 0xAC00) % 28 !== 0;
    return `${trimmed}${hasBatchim ? '과' : '와'}`;
  }
  return `${trimmed}와`;
}

function pickBest(pool, excludeSet, currentId, scorer) {
  if (!pool.length) return { chosen: null, resetSeen: false };
  let candidates = pool.filter(p => !excludeSet.has(p.id) && p.id !== currentId);
  let resetSeen = false;

  if (candidates.length === 0) {
    resetSeen = true;
    candidates = pool.filter(p => pool.length <= 1 || p.id !== currentId);
  }

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const p of candidates) {
    const sc = scorer(p);
    if (sc > bestScore) {
      bestScore = sc;
      best = p;
    }
  }
  return { chosen: best, resetSeen };
}

function recommendPassage(db, opts = {}) {
  const mode = opts.mode || 'fresh'; // 'fresh' | 'same_concept' | 'contra_concept' | 'same_author'
  const category = opts.category || '전체';
  const editorText = String(opts.editorText || '').trim();
  const recentText = String(opts.recentText || '').trim();
  const currentId = Number(opts.currentId || -1);
  const excludeSet = new Set(Array.isArray(opts.excludeIds) ? opts.excludeIds.map(Number) : []);

  const allRows = db.prepare('SELECT * FROM passages').all().map(hydrateRow);
  const totalCount = allRows.length;
  if (totalCount === 0) {
    return { passage: null, anchor: null, relationLabel: '', totalCount: 0, resetSeen: false };
  }

  const currentPassage = allRows.find(p => p.id === currentId) || null;
  const prevAnchor = resolveAnchor(db, opts.anchor, editorText);
  const anchor = mode === 'fresh' && opts.clearAnchor ? null : prevAnchor;

  // 본문에 이미 인용된 구절은 추천 후보에서 제외
  const notQuoted = allRows.filter(p => {
    if (anchor && p.id === anchor.id) return false;
    if (editorText && editorText.includes(p.text.slice(0, 18))) return false;
    return true;
  });
  const baseAll = notQuoted.length > 0 ? notQuoted : allRows;

  const filterByCat = list => {
    if (category === '전체') return list;
    const sub = list.filter(p => p.cat === category);
    return sub.length > 0 ? sub : list;
  };

  // 1) 같은 결 (동일 개념 공명)
  if (mode === 'same_concept' && anchor) {
    const targetConcepts = anchor.concepts.length
      ? anchor.concepts
      : inferConcepts(anchor.text, anchor.source);

    let pool = filterByCat(
      baseAll.filter(p => p.concepts.some(c => targetConcepts.includes(c)))
    );
    if (pool.length === 0) {
      pool = baseAll.filter(p => p.concepts.some(c => targetConcepts.includes(c)));
    }
    if (pool.length === 0) pool = filterByCat(baseAll);

    const { chosen, resetSeen } = pickBest(pool, excludeSet, currentId, p => {
      let score = Math.random() * 1.4;
      const overlap = p.concepts.filter(c => targetConcepts.includes(c)).length;
      score += overlap * 3.2;
      if (p.author !== anchor.author) score += 1.3;
      if (p.cat !== anchor.cat) score += 0.7;
      if (matchesEditorContext(p, recentText)) score += 2.2;
      else if (matchesEditorContext(p, editorText)) score += 1.0;
      return score;
    });

    const sharedConcept = chosen.concepts.find(c => targetConcepts.includes(c)) || targetConcepts[0];
    return {
      passage: chosen,
      anchor,
      mode: 'same_concept',
      relationLabel: `${withWaGwa(anchor.author)} 같은 결 · ${sharedConcept}`,
      totalCount,
      resetSeen
    };
  }

  // 2) 반대 시선 (변증법적 대립 개념)
  if (mode === 'contra_concept' && anchor) {
    const baseConcepts = anchor.concepts.length
      ? anchor.concepts
      : inferConcepts(anchor.text, anchor.source);
    const antiConcepts = getAntithesisConcepts(baseConcepts);
    const primaryAnti = antiConcepts[0];

    let pool = filterByCat(
      baseAll.filter(p => p.concepts.some(c => antiConcepts.includes(c)))
    );
    if (pool.length === 0) {
      pool = baseAll.filter(p => p.concepts.some(c => antiConcepts.includes(c)));
    }
    if (pool.length === 0) pool = filterByCat(baseAll);

    const { chosen, resetSeen } = pickBest(pool, excludeSet, currentId, p => {
      let score = Math.random() * 1.4;
      if (primaryAnti && p.concepts.includes(primaryAnti)) score += 5.2;
      const antiOverlap = p.concepts.filter(c => antiConcepts.includes(c)).length;
      score += antiOverlap * 2.2;
      // 원래 개념과 겹치지 않을수록 더 선명한 대립각 형성
      if (p.concepts.some(c => baseConcepts.includes(c))) score -= 3.5;
      if (p.author !== anchor.author) score += 1.2;
      if (matchesEditorContext(p, recentText)) score += 1.8;
      return score;
    });

    const matchedAnti = (primaryAnti && chosen.concepts.includes(primaryAnti))
      ? primaryAnti
      : (chosen.concepts.find(c => antiConcepts.includes(c)) || antiConcepts[0] || '다른 시선');
    return {
      passage: chosen,
      anchor,
      mode: 'contra_concept',
      relationLabel: `${anchor.author}에 맞서는 반대 시선 · ${matchedAnti}`,
      totalCount,
      resetSeen
    };
  }

  // 3) 같은 작가 (모두 소진 시 동일 사상·문학 계보로 자연 확장)
  if (mode === 'same_author' && anchor) {
    const authorPool = baseAll.filter(p => p.author === anchor.author);
    const unseenAuthor = authorPool.filter(p => !excludeSet.has(p.id) && p.id !== currentId);

    if (unseenAuthor.length > 0) {
      const { chosen } = pickBest(unseenAuthor, excludeSet, currentId, p => {
        let score = Math.random() * 1.4;
        if (matchesEditorContext(p, recentText)) score += 2.0;
        return score;
      });
      return {
        passage: chosen,
        anchor,
        mode: 'same_author',
        relationLabel: `${anchor.author}의 다른 글귀`,
        totalCount,
        resetSeen: false
      };
    }

    // 같은 작가의 미열람 구절을 다 보았다면 같은 계보의 사상가·작가로 확장
    const lineagePool = baseAll.filter(
      p => p.lineage === anchor.lineage && p.author !== anchor.author
    );
    const combinedPool = [...authorPool, ...lineagePool];
    const effectivePool = combinedPool.length > 0 ? combinedPool : filterByCat(baseAll);

    const { chosen, resetSeen } = pickBest(effectivePool, excludeSet, currentId, p => {
      let score = Math.random() * 1.4;
      if (p.author === anchor.author) score += 1.0;
      if (matchesEditorContext(p, recentText)) score += 2.0;
      return score;
    });

    const label = chosen.author === anchor.author
      ? `${anchor.author}의 다른 글귀`
      : `${withWaGwa(anchor.author)} 맞닿은 계보 · ${anchor.lineage}`;

    return {
      passage: chosen,
      anchor,
      mode: 'same_author',
      relationLabel: label,
      totalCount,
      resetSeen
    };
  }

  // 4) 새 글귀 (연관 고리 없이 맥락 공명 또는 폭넓은 순환)
  const freshPool = filterByCat(baseAll);
  const inferredUserConcepts = editorText ? inferConcepts(recentText || editorText) : [];

  const { chosen, resetSeen } = pickBest(freshPool, excludeSet, currentId, p => {
    let score = Math.random() * 1.35;
    if (editorText) {
      if (matchesEditorContext(p, recentText)) score += 4.2;
      else if (matchesEditorContext(p, editorText)) score += 2.0;
      else if (p.concepts.some(c => inferredUserConcepts.includes(c))) score += 1.2;
    }
    if (currentPassage) {
      if (p.author === currentPassage.author) score -= 2.5;
      if (category === '전체' && p.cat !== currentPassage.cat) score += 0.85;
    }
    if (opts.clearAnchor && prevAnchor) {
      if (p.author === prevAnchor.author) score -= 3.0;
      if (p.concepts.some(c => prevAnchor.concepts.includes(c))) score -= 1.5;
    }
    return score;
  });

  return {
    passage: chosen,
    anchor: opts.clearAnchor ? null : anchor,
    mode: 'fresh',
    relationLabel: '',
    totalCount,
    resetSeen
  };
}

module.exports = {
  recommendPassage,
  extractLastQuotedAnchorFromText
};
