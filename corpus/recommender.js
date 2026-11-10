const {
  CONCEPTS,
  inferConcepts,
  getAntithesisConcepts,
  extractAuthorFromSource,
  inferLineage
} = require('./concept_graph');
const { recommendPlainContinuation } = require('./plain_continuations');

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

const STOPWORDS = new Set([
  '그리고', '그러나', '하지만', '그래서', '그런데', '그러면', '그러므로', '따라서',
  '나는', '내가', '나의', '우리', '우리가', '그것', '이것', '저것', '수', '것', '등',
  '있다', '없다', '하다', '되다', '이다', '같다', '보다', '위해', '대해', '통해',
  '생각', '마음', '사람', '때문', '정도', '지금', '오늘', '하루'
]);

function extractContextTokens(text = '') {
  if (!text || !text.trim()) return [];
  const rawWords = String(text)
    .replace(/["“”'‘’—―\-.,?!()[\]《》〈〉/]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 2);

  const tokens = new Set();
  for (const w of rawWords) {
    // 조사 어미 제거한 2~4글자 어간 추출
    const stem = w.replace(/(은|는|이|가|을|를|에|에서|으로|로|과|와|도|만|의|에게|부터|까지|처럼|보다|하고|하며|하던|하는|했다|한다|였다|이다|네요|군요|어요|아요|습니다)$/, '');
    const candidate = stem.length >= 2 ? stem : w.slice(0, 3);
    if (candidate.length >= 2 && !STOPWORDS.has(candidate)) {
      tokens.add(candidate);
    }
  }
  return Array.from(tokens).slice(-14);
}

function countTokenOverlap(passage, tokens = []) {
  if (!tokens.length) return 0;
  let hits = 0;
  const hay = `${passage.text} ${passage.tagsPattern}`;
  for (const tok of tokens) {
    if (hay.includes(tok)) hits += 1;
  }
  return hits;
}

function concisenessScore(passage) {
  const len = (passage.text || '').length;
  if (len <= 75) return 1.1;
  if (len <= 105) return 0.5;
  if (len > 140) return -1.4;
  return 0;
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

function extractUserWritingAnchor(editorText = '') {
  const clean = String(editorText || '').trim();
  if (!clean) return null;
  const paragraphs = clean
    .split(/\n+/)
    .map(p => p.trim())
    .filter(p => p && !/^["“].+["”]\s*(?:—|--|―)\s*.+$/.test(p));

  if (paragraphs.length === 0) return null;
  const lastUserPara = paragraphs[paragraphs.length - 1];
  if (lastUserPara.length < 4) return null;

  return {
    id: -2,
    isUserText: true,
    text: lastUserPara,
    author: '내 문장',
    source: '내가 쓴 문장',
    cat: '전체',
    lineage: '현대 에세이·비평',
    concepts: inferConcepts(lastUserPara, clean),
    tagsPattern: ''
  };
}

function resolveAnchor(db, explicitAnchor, editorText) {
  const quotedFromText = extractLastQuotedAnchorFromText(db, editorText);
  const userWritingAnchor = extractUserWritingAnchor(editorText);

  // 본문의 가장 마지막 단락이 사용자가 직접 쓴 문장이라면 그 문장의 개념과 인용구 개념을 함께 결합
  if (explicitAnchor && explicitAnchor.id && explicitAnchor.id > 0) {
    const row = db.prepare('SELECT * FROM passages WHERE id = ?').get(explicitAnchor.id);
    if (row) {
      const hydrated = hydrateRow(row);
      if (userWritingAnchor) {
        hydrated.concepts = Array.from(new Set([...userWritingAnchor.concepts, ...hydrated.concepts])).slice(0, 3);
      }
      return hydrated;
    }
  }
  if (explicitAnchor && explicitAnchor.text) {
    const author = explicitAnchor.author || extractAuthorFromSource(explicitAnchor.source || '');
    const baseConcepts = Array.isArray(explicitAnchor.concepts) && explicitAnchor.concepts.length
      ? explicitAnchor.concepts
      : inferConcepts(explicitAnchor.text, explicitAnchor.source || '');
    const mergedConcepts = userWritingAnchor
      ? Array.from(new Set([...userWritingAnchor.concepts, ...baseConcepts])).slice(0, 3)
      : baseConcepts;
    return {
      id: explicitAnchor.id || -1,
      isUserText: Boolean(explicitAnchor.isUserText),
      text: explicitAnchor.text,
      author,
      source: explicitAnchor.source || author,
      cat: explicitAnchor.cat || '철학',
      lineage: explicitAnchor.lineage || inferLineage(author, explicitAnchor.cat || '철학'),
      concepts: mergedConcepts,
      tagsPattern: ''
    };
  }
  if (quotedFromText) {
    if (userWritingAnchor) {
      quotedFromText.concepts = Array.from(new Set([...userWritingAnchor.concepts, ...quotedFromText.concepts])).slice(0, 3);
    }
    return quotedFromText;
  }
  return userWritingAnchor;
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
  const paragraphs = editorText.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const lastParagraph = paragraphs[paragraphs.length - 1] || '';
  const recentText = String(opts.recentText || lastParagraph || editorText).trim();
  const contextTokens = extractContextTokens(lastParagraph || recentText || editorText);

  const currentId = Number(opts.currentId || -1);
  const excludeSet = new Set(Array.isArray(opts.excludeIds) ? opts.excludeIds.map(Number) : []);
  const plainContinuation = recommendPlainContinuation({
    editorText,
    excludeTexts: opts.excludeContinuations || []
  });

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
      let score = Math.random() * 1.2 + concisenessScore(p);
      const overlap = p.concepts.filter(c => targetConcepts.includes(c)).length;
      score += overlap * 3.2;
      score += countTokenOverlap(p, contextTokens) * 2.4;
      if (p.author !== anchor.author) score += 1.3;
      if (p.cat !== anchor.cat) score += 0.6;
      if (matchesEditorContext(p, lastParagraph || recentText)) score += 2.6;
      else if (matchesEditorContext(p, editorText)) score += 1.2;
      return score;
    });

    const sharedConcept = chosen.concepts.find(c => targetConcepts.includes(c)) || targetConcepts[0];
    const relPrefix = anchor.isUserText ? '쓰신 문장과 같은 결' : `${withWaGwa(anchor.author)} 같은 결`;
    return {
      passage: chosen,
      anchor,
      mode: 'same_concept',
      relationLabel: `${relPrefix} · ${sharedConcept}`,
      plainContinuation,
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
      let score = Math.random() * 1.2 + concisenessScore(p);
      if (primaryAnti && p.concepts.includes(primaryAnti)) score += 5.2;
      const antiOverlap = p.concepts.filter(c => antiConcepts.includes(c)).length;
      score += antiOverlap * 2.2;
      score += countTokenOverlap(p, contextTokens) * 1.5;
      if (p.concepts.some(c => baseConcepts.includes(c))) score -= 3.5;
      if (p.author !== anchor.author) score += 1.2;
      if (matchesEditorContext(p, lastParagraph || recentText)) score += 1.8;
      return score;
    });

    const matchedAnti = (primaryAnti && chosen.concepts.includes(primaryAnti))
      ? primaryAnti
      : (chosen.concepts.find(c => antiConcepts.includes(c)) || antiConcepts[0] || '다른 시선');
    const relPrefix = anchor.isUserText ? '쓰신 생각에 맞서는 반대 시선' : `${anchor.author}에 맞서는 반대 시선`;
    return {
      passage: chosen,
      anchor,
      mode: 'contra_concept',
      relationLabel: `${relPrefix} · ${matchedAnti}`,
      plainContinuation,
      totalCount,
      resetSeen
    };
  }

  // 3) 같은 작가 (모두 소진 시 동일 사상·문학 계보로 자연 확장)
  if (mode === 'same_author' && anchor && !anchor.isUserText) {
    const authorPool = baseAll.filter(p => p.author === anchor.author);
    const unseenAuthor = authorPool.filter(p => !excludeSet.has(p.id) && p.id !== currentId);

    if (unseenAuthor.length > 0) {
      const { chosen } = pickBest(unseenAuthor, excludeSet, currentId, p => {
        let score = Math.random() * 1.2 + concisenessScore(p);
        score += countTokenOverlap(p, contextTokens) * 2.0;
        if (matchesEditorContext(p, recentText)) score += 2.0;
        return score;
      });
      return {
        passage: chosen,
        anchor,
        mode: 'same_author',
        relationLabel: `${anchor.author}의 다른 글귀`,
        plainContinuation,
        totalCount,
        resetSeen: false
      };
    }

    const lineagePool = baseAll.filter(
      p => p.lineage === anchor.lineage && p.author !== anchor.author
    );
    const combinedPool = [...authorPool, ...lineagePool];
    const effectivePool = combinedPool.length > 0 ? combinedPool : filterByCat(baseAll);

    const { chosen, resetSeen } = pickBest(effectivePool, excludeSet, currentId, p => {
      let score = Math.random() * 1.2 + concisenessScore(p);
      if (p.author === anchor.author) score += 1.0;
      score += countTokenOverlap(p, contextTokens) * 2.0;
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
      plainContinuation,
      totalCount,
      resetSeen
    };
  }

  // 4) 새 글귀 (본문이 있으면 본문의 마지막 단락·어휘와 가장 잘 이어지는 글귀 우선 추천)
  const freshPool = filterByCat(baseAll);
  const inferredUserConcepts = editorText ? inferConcepts(lastParagraph || recentText, editorText) : [];

  const { chosen, resetSeen } = pickBest(freshPool, excludeSet, currentId, p => {
    let score = Math.random() * 1.25 + concisenessScore(p);
    if (editorText) {
      const tokenHits = countTokenOverlap(p, contextTokens);
      score += tokenHits * 3.0;
      if (matchesEditorContext(p, lastParagraph || recentText)) score += 4.5;
      else if (matchesEditorContext(p, editorText)) score += 2.2;
      if (p.concepts.some(c => inferredUserConcepts.includes(c))) score += 2.0;
    }
    if (currentPassage) {
      if (p.author === currentPassage.author) score -= 2.5;
      if (category === '전체' && p.cat !== currentPassage.cat) score += 0.85;
    }
    if (opts.clearAnchor && prevAnchor) {
      if (p.author === prevAnchor.author) score -= 3.0;
      if (p.concepts.some(c => prevAnchor.concepts.includes(c))) score -= 1.2;
    }
    return score;
  });

  const resolvedAnchor = opts.clearAnchor ? (extractUserWritingAnchor(editorText) || null) : anchor;
  const matchedConcept = (editorText && chosen)
    ? (chosen.concepts.find(c => inferredUserConcepts.includes(c)) || chosen.concepts[0] || '')
    : '';
  const freshRelLabel = (editorText && matchedConcept)
    ? `쓰신 내용과 이어지는 글귀 · ${matchedConcept}`
    : '';

  return {
    passage: chosen,
    anchor: resolvedAnchor,
    mode: 'fresh',
    relationLabel: freshRelLabel,
    plainContinuation,
    totalCount,
    resetSeen
  };
}

module.exports = {
  recommendPassage,
  recommendPlainContinuation,
  extractLastQuotedAnchorFromText
};
