// 첫 문장 — 가장 진실한 한 줄부터
// - 글쓰기를 어떻게 시작할지 막막한 사람들을 위해 고전·현대의 사유로 한 호흡(2~3문장)씩 함께 짓는 에세이 스튜디오
// - 다중 사용자(Google 로그인) 격리 저장 + Gemini · OpenAI · Claude 3대 AI 프로바이더 지원
// - 6시간 주기 자동 업데이트 및 수동 즉시 업데이트되는 현대·고전 글귀 아카이브 탑재

const CATEGORIES = ['전체', '철학', '문학', '경전'];
const QUOTE_LINE_RE = /["“]([^"”\n]{6,})["”]\s*(?:—|--|―)\s*([^\n]+)/;

const WEAVE_LABELS = {
  opening: '첫 호흡 제안',
  reson: '공명 · 깊이 잇기',
  contra: '반론 · 뒤집어 보기',
  scene: '비유 · 문학적 장면',
  close: '매듭 · 결론 짓기'
};

// 방향별 재치있는 문학적 로딩 안내 멘트
const WEAVE_LOADING_WITTY = {
  opening: [
    {
      status: '✦ 서가의 먼지를 털며 첫 문장을 고르는 중',
      text: '장자의 나비와 헤밍웨이의 타자기 사이에서, 오늘 당신의 빈 종이를 깨울 첫 문장을 고르고 있습니다…',
      sub: '— 백지 공포증 퇴치 작전 진행 중'
    },
    {
      status: '✦ 만년필 촉에 잉크를 적시는 중',
      text: '몽테뉴의 다락방 서재에서 아직 마르지 않은 문장 한 줄을 조심스레 빌려오고 있습니다…',
      sub: '— 고전과 현대의 서가 산책 중'
    },
    {
      status: '✦ 가장 진실한 첫 호흡을 고르는 중',
      text: '카뮈의 수첩과 조앤 디디온의 메모장을 번갈아 넘기며 오늘의 첫 단락을 벼리고 있습니다…',
      sub: '— 첫 단추 끼우는 중'
    },
    {
      status: '✦ 문장의 물꼬를 트는 중',
      text: '세상의 모든 위대한 에세이도 처음엔 깜빡이는 커서 하나였다는 사실을 떠올리며 첫 줄을 짓고 있습니다…',
      sub: '— 첫 호흡 조율 중'
    }
  ],
  reson: [
    {
      status: '✦ 당신의 문체에 주파수를 맞추는 중',
      text: '방금 쓰신 문장의 어미와 호흡을 가만히 소리 내어 읽으며, 고개를 끄덕일 사상가를 찾고 있습니다…',
      sub: '— 행간의 온도 측정 중'
    },
    {
      status: '✦ 공명하는 사유의 책갈피를 펼치는 중',
      text: '수백 년 전에도 당신과 비슷한 고민으로 밤을 지새웠던 작가의 밑줄 친 구절을 길어 올리고 있습니다…',
      sub: '— 같은 결의 문장 직조 중'
    },
    {
      status: '✦ 생각의 뿌리를 한 뼘 더 내리는 중',
      text: '쓰신 문장 뒤에 자연스럽게 이어질 두어 줄의 사유를 당신의 말투 그대로 다듬고 있습니다…',
      sub: '— 문체 동기화 중'
    }
  ],
  contra: [
    {
      status: '✦ 정중한 딴지를 준비하는 중',
      text: '니체와 시몬 베유를 호출해 방금 쓰신 생각에 매력적인 균열을 내어달라고 부탁하고 있습니다…',
      sub: '— 생각의 이면 뒤집는 중'
    },
    {
      status: '✦ 반대편 서가를 뒤적이는 중',
      text: '고개가 절로 끄덕여지는 문장일수록 한 번쯤 의심해 보아야 하기에, 정반대의 시선을 초빙하는 중입니다…',
      sub: '— 생산적 반론 벼리는 중'
    },
    {
      status: '✦ ‘과연 그럴까?’ 질문을 고르는 중',
      text: '당신의 글을 한층 입체적으로 만들어 줄 낯선 철학자의 반문을 다듬고 있습니다…',
      sub: '— 시선 전환 중'
    }
  ],
  scene: [
    {
      status: '✦ 관념을 풍경으로 인화하는 중',
      text: '추상적인 생각에 체온을 불어넣기 위해 문학 작품 속 구체적인 한 장면을 현상하고 있습니다…',
      sub: '— 은유와 심상 스케치 중'
    },
    {
      status: '✦ 문학적 비유를 건져 올리는 중',
      text: '설명 대신 눈앞에 그려지는 장면 하나로 마음을 건드릴 소설 속 한 대목을 찾고 있습니다…',
      sub: '— 감각의 해상도 높이는 중'
    },
    {
      status: '✦ 사유에 색채를 입히는 중',
      text: '보르헤스의 미로와 칼비노의 도시 사이에서 당신의 문장에 어울릴 비유를 고르고 있습니다…',
      sub: '— 장면 연출 중'
    }
  ],
  close: [
    {
      status: '✦ 흩어진 생각의 실을 여미는 중',
      text: '성급한 교훈 대신 긴 여운이 남도록, 마지막 마침표가 놓일 자리를 가만히 재어 보고 있습니다…',
      sub: '— 글의 매듭 짓는 중'
    },
    {
      status: '✦ 마지막 호흡을 가다듬는 중',
      text: '지금까지 걸어온 문장들을 조용히 돌아보며 담백하고 단단한 착지점을 찾고 있습니다…',
      sub: '— 결론 단락 다듬는 중'
    }
  ]
};

const PROVIDER_META = {
  gemini: {
    label: 'Gemini',
    badge: '무료 추천',
    desc: 'Google AI Studio에서 무료로 10초 만에 발급 · 빠르고 자연스러운 일상 문장 제안',
    placeholder: 'Gemini API 키 붙여넣기 (AIza...)',
    keyUrl: 'https://aistudio.google.com/apikey',
    linkText: 'Gemini 무료 키 발급 ↗'
  },
  openai: {
    label: 'OpenAI',
    badge: '',
    desc: 'OpenAI Platform 키 사용 · 군더더기 없이 담백하고 깔끔한 에세이 호흡',
    placeholder: 'OpenAI API 키 붙여넣기 (sk-...)',
    keyUrl: 'https://platform.openai.com/api-keys',
    linkText: 'OpenAI 키 발급 ↗'
  },
  claude: {
    label: 'Claude',
    badge: '',
    desc: 'Anthropic Console 키 사용 · 잔잔한 산문 호흡과 섬세한 비유 표현',
    placeholder: 'Claude API 키 붙여넣기 (sk-ant-...)',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    linkText: 'Claude 키 발급 ↗'
  }
};

const state = {
  writings: [],
  echoes: [],
  echoIdx: 0,
  user: null, // { id, email, name, picture, authType }
  sessionToken: localStorage.getItem('dw_session') || '',
  googleClientId: '',
  googleFormOpen: false,

  hasPin: false,
  pin: sessionStorage.getItem('dw_pin') || '',
  today: '',
  activeId: null,
  mode: 'write', // 'write' | 'distill'
  platform: 'threads', // 'threads' (500) | 'x' (280)
  docBlocks: [],
  selectedBlockIdx: -1,
  editingBlockIdx: -1,
  justMovedIdx: -1,
  lastClosedBlockCount: 0,
  composeOpen: false,
  firstLineComposing: false,
  passageRevealed: false,
  passageRevealTimer: null,
  passageSlowTimer: null,
  segments: [],
  hookInverted: false,

  // 다중 AI 프로바이더 상태
  aiProvider: 'gemini', // 'gemini' | 'openai' | 'claude'
  editingProvider: 'gemini',
  hasAiKey: false,
  hasKeys: { gemini: false, openai: false, claude: false },
  keyEditorOpen: false,

  // AI 직조 상태
  weaveDirection: 'reson',
  wovenDraft: null,
  weaveLoading: false,
  weaveReqSeq: 0,
  lastWovenContext: null,
  closedComplete: false,
  lastClosedParagraph: '',
  replacingClose: false,
  recentAuthors: [],
  autoWeaveTimer: null,
  styleTunerOpen: false,
  lastStyleChanged: null,
  weaveStyle: (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dw_weave_style_v2') || '{}');
      return {
        tone: ['simple', 'lyrical', 'pedantic'].includes(saved.tone) ? saved.tone : 'simple',
        length: ['short', 'medium', 'long'].includes(saved.length) ? saved.length : 'medium',
        ending: ['auto', 'plain', 'polite'].includes(saved.ending) ? saved.ending : 'auto'
      };
    } catch (_) {
      return { tone: 'simple', length: 'medium', ending: 'auto' };
    }
  })(),

  // 아카이브 상태
  passageCount: 0,
  passageCategory: '전체',
  currentPassage: null,
  anchorPassage: null,
  relationMode: 'fresh',
  relationLabel: '',
  lastArchiveContext: '',
  autoArchiveTimer: null,
  plainContinuation: null,
  seenContinuations: [],
  seenByMode: {
    fresh: new Set(),
    same_concept: new Set(),
    contra_concept: new Set(),
    same_author: new Set()
  },

  saveTimer: null,
  typingTimer: null
};

const $ = id => document.getElementById(id);

function setSessionToken(tok) {
  if (tok) {
    state.sessionToken = tok;
    localStorage.setItem('dw_session', tok);
  }
}

function apiFetch(url, opts = {}) {
  const headers = Object.assign({}, opts.headers || {});
  if (state.pin) headers['x-pin'] = encodeURIComponent(state.pin);
  if (state.sessionToken) headers['x-session-token'] = state.sessionToken;
  return fetch(url, Object.assign({}, opts, { headers }));
}

function toast(msg, opts = {}) {
  const el = $('toast');
  if (!el) return;
  const { actionLabel = '', onAction = null, duration = 2200 } = opts;
  el.innerHTML = `<span class="toast-ornament">✦</span><span class="toast-msg"></span>`;
  const msgEl = el.querySelector('.toast-msg');
  if (msgEl) msgEl.textContent = msg;

  if (actionLabel && typeof onAction === 'function') {
    const actBtn = document.createElement('button');
    actBtn.type = 'button';
    actBtn.className = 'toast-undo-btn';
    actBtn.textContent = actionLabel;
    actBtn.onclick = e => {
      e.stopPropagation();
      clearTimeout(el._t);
      el.classList.remove('show', 'interactive');
      onAction();
    };
    el.appendChild(actBtn);
    el.classList.add('interactive');
  } else {
    el.classList.remove('interactive');
  }

  el.classList.remove('hidden');
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.classList.remove('show', 'interactive');
  }, actionLabel ? Math.max(duration, 3800) : duration);
}

function showDialog({ title, sub = '', inputPlaceholder = '', confirmText = '확인', danger = false }) {
  return new Promise(resolve => {
    const modal = $('dialogModal');
    const titleEl = $('dialogTitle');
    const subEl = $('dialogSub');
    const inputEl = $('dialogInput');
    const cancelBtn = $('dialogCancelBtn');
    const confirmBtn = $('dialogConfirmBtn');
    if (!modal) {
      resolve(null);
      return;
    }

    titleEl.textContent = title;
    if (sub) {
      subEl.textContent = sub;
      subEl.classList.remove('hidden');
    } else {
      subEl.classList.add('hidden');
    }

    if (inputPlaceholder) {
      inputEl.value = '';
      inputEl.placeholder = inputPlaceholder;
      inputEl.classList.remove('hidden');
    } else {
      inputEl.classList.add('hidden');
    }

    confirmBtn.textContent = confirmText;
    confirmBtn.classList.toggle('danger', Boolean(danger));
    modal.classList.remove('hidden');

    if (inputPlaceholder) {
      requestAnimationFrame(() => inputEl.focus());
    } else {
      requestAnimationFrame(() => confirmBtn.focus());
    }

    const cleanup = result => {
      modal.classList.add('hidden');
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
      modal.onclick = null;
      inputEl.onkeydown = null;
      resolve(result);
    };

    cancelBtn.onclick = () => cleanup(null);
    confirmBtn.onclick = () => cleanup(inputPlaceholder ? inputEl.value : true);
    modal.onclick = e => {
      if (e.target === modal) cleanup(null);
    };
    inputEl.onkeydown = e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cleanup(inputEl.value);
      } else if (e.key === 'Escape') {
        cleanup(null);
      }
    };
  });
}

function formatKoreanFullDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${m}월 ${d}일 ${days[dt.getDay()]}요일`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const [, m, d] = dateStr.split('-');
  return `${Number(m)}. ${Number(d)}`;
}

function getActiveWriting() {
  return state.writings.find(w => w.id === state.activeId) || null;
}

function autoResizeTextarea(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = `${Math.max(34, el.scrollHeight)}px`;
}

// ============================================================================
// 모바일 퍼스트: 문장 단위 파싱 & 터치·스와이프·드래그 캔버스
// ============================================================================
function isQuoteBlockText(str = '') {
  return /^["“].+["”]\s*(?:—|--|―)\s*.+$/s.test(String(str).trim());
}

function splitLineIntoSentences(line = '') {
  const trimmed = String(line).trim();
  if (!trimmed) return [];
  if (isQuoteBlockText(trimmed)) return [trimmed];

  const out = [];
  let cur = '';
  let quoteDepth = 0;
  let parenDepth = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    cur += ch;

    if (ch === '“' || ch === '‘') quoteDepth++;
    else if (ch === '”' || ch === '’') quoteDepth = Math.max(0, quoteDepth - 1);
    else if (ch === '"') quoteDepth = quoteDepth === 0 ? 1 : 0;
    else if (ch === '(' || ch === '《' || ch === '〈' || ch === '[') parenDepth++;
    else if (ch === ')' || ch === '》' || ch === '〉' || ch === ']') parenDepth = Math.max(0, parenDepth - 1);

    if (quoteDepth === 0 && parenDepth === 0 && /[.?!…]/.test(ch)) {
      const nextCh = trimmed[i + 1] || '';
      if (/[.?!…]/.test(nextCh)) continue;
      if (/["”'’)\]》〉]/.test(nextCh)) continue;
      const prevCh = trimmed[i - 1] || '';
      if (ch === '.' && /\d/.test(prevCh) && /\d/.test(trimmed.slice(i + 1).trimStart()[0] || '')) {
        continue;
      }
      if (!nextCh || /\s/.test(nextCh)) {
        if (cur.trim()) out.push(cur.trim());
        cur = '';
      }
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseContentToBlocks(content = '') {
  const raw = String(content || '').trim();
  if (!raw) return [];
  const lines = raw.split(/\n+/).map(s => s.trim()).filter(Boolean);
  const blocks = [];
  for (const line of lines) {
    blocks.push(...splitLineIntoSentences(line));
  }
  return blocks;
}

function syncBlocksToEditor({ triggerSave = false, triggerRecommend = false } = {}) {
  const ed = $('editor');
  const joined = state.docBlocks.join('\n\n');
  if (ed) ed.value = joined;

  if (state.closedComplete || state.replacingClose) {
    if (!state.lastClosedParagraph || !joined.trim().endsWith(state.lastClosedParagraph)) {
      state.closedComplete = false;
      state.replacingClose = false;
      state.lastClosedParagraph = '';
      state.lastClosedBlockCount = 0;
    }
  }

  if (state.docBlocks.length > 0 && !state.passageRevealed) {
    revealPassageCardImmediately();
  }

  updateWriteMeta();
  renderEchoBox();
  renderSentenceCanvas();
  updatePassageDeckHeader();

  if (triggerSave) scheduleSave();
  if (triggerRecommend) {
    if (state.hasAiKey) {
      scheduleAutoWeaveAfterEdit();
    } else {
      scheduleAutoArchiveAfterEdit();
    }
  }
}

function appendTextAsBlocks(text, { inline = false, replaceLastCount = 0 } = {}) {
  const units = parseContentToBlocks(text);
  if (units.length === 0) return 0;

  if (replaceLastCount > 0 && state.docBlocks.length >= replaceLastCount) {
    state.docBlocks.splice(state.docBlocks.length - replaceLastCount, replaceLastCount, ...units);
  } else if (inline && state.docBlocks.length > 0) {
    const lastIdx = state.docBlocks.length - 1;
    state.docBlocks[lastIdx] = `${state.docBlocks[lastIdx].replace(/[ \t]+$/g, '')} ${units[0]}`;
    if (units.length > 1) {
      state.docBlocks.push(...units.slice(1));
    }
  } else {
    state.docBlocks.push(...units);
  }

  state.selectedBlockIdx = -1;
  state.editingBlockIdx = -1;
  return units.length;
}

function moveBlock(fromIdx, toIdx) {
  const total = state.docBlocks.length;
  if (fromIdx < 0 || fromIdx >= total || toIdx < 0 || toIdx >= total || fromIdx === toIdx) return;

  const [moved] = state.docBlocks.splice(fromIdx, 1);
  state.docBlocks.splice(toIdx, 0, moved);

  if (state.selectedBlockIdx === fromIdx) {
    state.selectedBlockIdx = toIdx;
  } else if (state.selectedBlockIdx !== -1) {
    state.selectedBlockIdx = -1;
  }
  state.editingBlockIdx = -1;
  state.justMovedIdx = toIdx;

  syncBlocksToEditor({ triggerSave: true, triggerRecommend: true });
  setTimeout(() => {
    if (state.justMovedIdx === toIdx) {
      state.justMovedIdx = -1;
    }
  }, 600);
}

function removeBlockAt(idx, slotEl = null) {
  if (idx < 0 || idx >= state.docBlocks.length) return;
  const removedText = state.docBlocks[idx];
  const removedIdx = idx;

  const finalizeRemove = () => {
    state.docBlocks.splice(removedIdx, 1);
    state.selectedBlockIdx = -1;
    state.editingBlockIdx = -1;
    syncBlocksToEditor({ triggerSave: true, triggerRecommend: true });

    toast('문장을 덜어냈습니다', {
      actionLabel: '되돌리기 ↺',
      duration: 4200,
      onAction: () => {
        const restorePos = Math.min(removedIdx, state.docBlocks.length);
        state.docBlocks.splice(restorePos, 0, removedText);
        state.justMovedIdx = restorePos;
        syncBlocksToEditor({ triggerSave: true, triggerRecommend: true });
        toast('덜어낸 문장을 되살렸습니다');
      }
    });
  };

  if (slotEl) {
    slotEl.classList.add('removing');
    setTimeout(finalizeRemove, 180);
  } else {
    finalizeRemove();
  }
}

function attachSentenceTouchGestures(slot, item, bg, idx) {
  let startX = 0;
  let startY = 0;
  let curDx = 0;
  let axis = null;
  let tracking = false;

  const total = state.docBlocks.length;
  const rightMoveLabel = idx > 0 ? '↑ 한 칸 위로' : (total >= 2 ? '↓ 한 칸 아래로' : '');

  item.addEventListener('touchstart', e => {
    if (state.editingBlockIdx === idx) return;
    if (e.target.closest('.sentence-toolbar') || e.target.closest('.sentence-drag-handle')) return;
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    curDx = 0;
    axis = null;
    tracking = true;
  }, { passive: true });

  item.addEventListener('touchmove', e => {
    if (!tracking || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    if (!axis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      axis = Math.abs(dx) > Math.abs(dy) * 1.25 ? 'x' : 'y';
    }
    if (axis !== 'x') return;

    e.preventDefault();
    // 우측 스와이프는 문장이 2개 이상일 때만 허용
    const clampedDx = (dx > 0 && !rightMoveLabel)
      ? dx * 0.18
      : Math.max(-130, Math.min(110, dx));
    curDx = clampedDx;

    item.classList.add('swiping');
    item.style.transform = `translateX(${clampedDx}px)`;

    if (clampedDx < -12) {
      const ready = clampedDx <= -74;
      bg.className = `sentence-swipe-bg swiping-left${ready ? ' ready' : ''}`;
      bg.textContent = ready ? '놓아서 덜어내기 ✕' : '← 밀어서 덜어내기';
    } else if (clampedDx > 12 && rightMoveLabel) {
      const ready = clampedDx >= 68;
      bg.className = `sentence-swipe-bg swiping-right${ready ? ' ready' : ''}`;
      bg.textContent = ready ? `${rightMoveLabel} ✓` : `→ ${rightMoveLabel}`;
    } else {
      bg.className = 'sentence-swipe-bg';
      bg.textContent = '';
    }
  }, { passive: false });

  const finishSwipe = () => {
    if (!tracking) return;
    tracking = false;
    item.classList.remove('swiping');

    if (axis === 'x') {
      item._suppressClickUntil = Date.now() + 320;
      if (curDx <= -74) {
        bg.className = 'sentence-swipe-bg';
        removeBlockAt(idx, slot);
        return;
      }
      if (curDx >= 68 && rightMoveLabel) {
        item.style.transform = '';
        bg.className = 'sentence-swipe-bg';
        moveBlock(idx, idx > 0 ? idx - 1 : 1);
        return;
      }
    }

    item.style.transform = '';
    bg.className = 'sentence-swipe-bg';
    bg.textContent = '';
  };

  item.addEventListener('touchend', finishSwipe);
  item.addEventListener('touchcancel', finishSwipe);
}

function attachDragReorderHandle(handle, sourceItem, fromIdx) {
  let dragging = false;
  let dropTargetIdx = fromIdx;

  const clearIndicators = () => {
    document.querySelectorAll('.sentence-item').forEach(el => {
      el.classList.remove('drag-over-top', 'drag-over-bottom', 'dragging-source');
    });
  };

  handle.addEventListener('pointerdown', e => {
    if (state.docBlocks.length < 2) return;
    e.stopPropagation();
    e.preventDefault();
    dragging = true;
    dropTargetIdx = fromIdx;
    sourceItem.classList.add('dragging-source');
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}
  });

  handle.addEventListener('pointermove', e => {
    if (!dragging) return;
    e.preventDefault();
    const items = [...document.querySelectorAll('#sentenceCanvas .sentence-item')];
    items.forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));

    const y = e.clientY;
    let nextIdx = fromIdx;

    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) {
        items[i].classList.add('drag-over-top');
        nextIdx = i > fromIdx ? i - 1 : i;
        dropTargetIdx = nextIdx;
        return;
      }
    }

    const lastEl = items[items.length - 1];
    if (lastEl) lastEl.classList.add('drag-over-bottom');
    dropTargetIdx = items.length - 1;
  });

  const endDrag = e => {
    if (!dragging) return;
    dragging = false;
    try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
    clearIndicators();
    if (dropTargetIdx !== fromIdx) {
      moveBlock(fromIdx, dropTargetIdx);
    }
  };

  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
}

function renderSentenceCanvas() {
  const canvas = $('sentenceCanvas');
  const hint = $('touchCanvasHint');
  const firstWrap = $('firstLineWrap');
  const directWrap = $('directComposeWrap');
  const openBtn = $('openComposeBtn');
  if (!canvas) return;

  const blocks = state.docBlocks;
  const isEmpty = blocks.length === 0;

  if (firstWrap) {
    firstWrap.classList.toggle('hidden', !isEmpty);
    if (isEmpty) syncFirstLineUi();
  }
  if (hint) {
    hint.classList.toggle('hidden', isEmpty);
  }
  if (directWrap) {
    directWrap.classList.toggle('hidden', isEmpty);
  }
  if (openBtn && !isEmpty) {
    openBtn.textContent = '✎ 직접 문장 적어 넣기';
    openBtn.classList.toggle('hidden', state.composeOpen);
  }

  canvas.innerHTML = '';

  blocks.forEach((txt, idx) => {
    const slot = document.createElement('div');
    slot.className = 'sentence-swipe-slot';

    const bg = document.createElement('div');
    bg.className = 'sentence-swipe-bg';

    const item = document.createElement('div');
    const isQuote = isQuoteBlockText(txt);
    const isSelected = state.selectedBlockIdx === idx;
    const isEditing = state.editingBlockIdx === idx;
    const isMoved = state.justMovedIdx === idx;

    item.className = [
      'sentence-item',
      isQuote ? 'is-quote' : '',
      isSelected ? 'selected' : '',
      isMoved ? 'just-moved' : ''
    ].filter(Boolean).join(' ');

    if (isEditing) {
      const editBox = document.createElement('div');
      editBox.className = 'sentence-edit-box';

      const ta = document.createElement('textarea');
      ta.className = 'sentence-edit-input';
      ta.rows = 1;
      ta.value = txt;

      const acts = document.createElement('div');
      acts.className = 'sentence-edit-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ghost-tool-btn';
      cancelBtn.textContent = '취소';
      cancelBtn.onclick = ev => {
        ev.stopPropagation();
        state.editingBlockIdx = -1;
        renderSentenceCanvas();
      };

      const saveEdit = () => {
        const nextVal = ta.value.trim();
        state.editingBlockIdx = -1;
        if (!nextVal) {
          removeBlockAt(idx);
          return;
        }
        const splitEdited = parseContentToBlocks(nextVal);
        state.docBlocks.splice(idx, 1, ...splitEdited);
        state.selectedBlockIdx = idx;
        syncBlocksToEditor({ triggerSave: true, triggerRecommend: true });
      };

      const okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'ghost-tool-btn add';
      okBtn.textContent = '다듬기 완료 ✓';
      okBtn.onclick = ev => {
        ev.stopPropagation();
        saveEdit();
      };

      ta.addEventListener('input', () => autoResizeTextarea(ta));
      ta.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
          ev.preventDefault();
          saveEdit();
        } else if (ev.key === 'Escape') {
          state.editingBlockIdx = -1;
          renderSentenceCanvas();
        }
      });

      acts.append(cancelBtn, okBtn);
      editBox.append(ta, acts);
      item.appendChild(editBox);
      slot.append(bg, item);
      canvas.appendChild(slot);

      requestAnimationFrame(() => {
        autoResizeTextarea(ta);
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      });
      return;
    }

    const p = document.createElement('div');
    p.className = 'sentence-text';
    p.textContent = txt;
    item.appendChild(p);

    if (blocks.length >= 2) {
      const dragHandle = document.createElement('span');
      dragHandle.className = 'sentence-drag-handle';
      dragHandle.title = '끌어서 순서 옮기기';
      dragHandle.textContent = '⋮⋮';
      attachDragReorderHandle(dragHandle, item, idx);
      item.appendChild(dragHandle);
    }

    if (isSelected) {
      const bar = document.createElement('div');
      bar.className = 'sentence-toolbar';

      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'sentence-act-btn';
      upBtn.textContent = '↑ 위로';
      upBtn.disabled = idx === 0;
      upBtn.onclick = ev => {
        ev.stopPropagation();
        moveBlock(idx, idx - 1);
      };

      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'sentence-act-btn';
      downBtn.textContent = '↓ 아래로';
      downBtn.disabled = idx === blocks.length - 1;
      downBtn.onclick = ev => {
        ev.stopPropagation();
        moveBlock(idx, idx + 1);
      };

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'sentence-act-btn';
      editBtn.textContent = '✎ 다듬기';
      editBtn.onclick = ev => {
        ev.stopPropagation();
        state.editingBlockIdx = idx;
        renderSentenceCanvas();
      };

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'sentence-act-btn danger';
      delBtn.textContent = '✕ 덜어내기';
      delBtn.onclick = ev => {
        ev.stopPropagation();
        removeBlockAt(idx, slot);
      };

      bar.append(upBtn, downBtn, editBtn, delBtn);
      item.appendChild(bar);
    }

    item.addEventListener('click', ev => {
      ev.stopPropagation();
      if (item._suppressClickUntil && Date.now() < item._suppressClickUntil) return;
      state.selectedBlockIdx = state.selectedBlockIdx === idx ? -1 : idx;
      state.editingBlockIdx = -1;
      renderSentenceCanvas();
    });

    attachSentenceTouchGestures(slot, item, bg, idx);

    slot.append(bg, item);
    canvas.appendChild(slot);
  });
}

function resetAndScheduleOpeningPassageReveal(delayMs = 2000) {
  clearTimeout(state.passageRevealTimer);
  clearTimeout(state.passageSlowTimer);
  state.passageRevealed = false;
  const card = $('passageCard');
  if (card) {
    card.classList.remove('slow-reveal');
    card.classList.add('awaiting-reveal');
  }
  state.passageRevealTimer = setTimeout(() => {
    triggerSlowPassageReveal();
  }, delayMs);
}

function bumpOpeningPassageIdleTimer(delayMs = 2000) {
  if (state.passageRevealed || state.docBlocks.length > 0) return;
  clearTimeout(state.passageRevealTimer);
  state.passageRevealTimer = setTimeout(() => {
    triggerSlowPassageReveal();
  }, delayMs);
}

function triggerSlowPassageReveal() {
  clearTimeout(state.passageRevealTimer);
  state.passageRevealTimer = null;
  if (state.passageRevealed) return;
  state.passageRevealed = true;
  document.body.classList.remove('typing');
  const card = $('passageCard');
  if (!card) return;
  requestAnimationFrame(() => {
    card.classList.add('slow-reveal');
    requestAnimationFrame(() => {
      card.classList.remove('awaiting-reveal');
      clearTimeout(state.passageSlowTimer);
      state.passageSlowTimer = setTimeout(() => {
        card.classList.remove('slow-reveal');
      }, 1750);
    });
  });
}

function revealPassageCardImmediately() {
  clearTimeout(state.passageRevealTimer);
  clearTimeout(state.passageSlowTimer);
  state.passageRevealTimer = null;
  state.passageRevealed = true;
  const card = $('passageCard');
  if (card) {
    card.classList.remove('slow-reveal', 'awaiting-reveal');
  }
}

function syncFirstLineUi() {
  const wrap = $('firstLineWrap');
  const inp = $('firstLineInput');
  const acts = $('firstLineActions');
  if (!wrap || !inp) return;
  const hasVal = inp.value.length > 0 || Boolean(state.firstLineComposing);
  const hasTrimmed = inp.value.trim().length > 0;
  wrap.classList.toggle('has-text', hasVal);
  wrap.classList.toggle('focused', document.activeElement === inp);
  if (acts) acts.classList.toggle('hidden', !hasTrimmed);
}

function commitFirstLineInput({ triggerSave = true, triggerRecommend = true } = {}) {
  const inp = $('firstLineInput');
  if (!inp) return false;
  const val = inp.value.trim();
  if (!val) {
    inp.value = '';
    syncFirstLineUi();
    return false;
  }
  appendTextAsBlocks(val);
  inp.value = '';
  inp.blur();
  syncFirstLineUi();
  syncBlocksToEditor({ triggerSave, triggerRecommend });
  return true;
}

function flushPendingInputs() {
  commitFirstLineInput({ triggerSave: false, triggerRecommend: false });
  if (state.composeOpen && $('composeInput') && $('composeInput').value.trim()) {
    const val = $('composeInput').value.trim();
    appendTextAsBlocks(val);
    $('composeInput').value = '';
    toggleDirectCompose(false);
    syncBlocksToEditor({ triggerSave: false, triggerRecommend: false });
  }
}

function maybeFocusFirstLineOnDesktop() {
  if (state.mode !== 'write' || state.docBlocks.length > 0) return;
  const isFinePointer = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const inp = $('firstLineInput');
  if (isFinePointer && inp) {
    requestAnimationFrame(() => {
      inp.focus();
      syncFirstLineUi();
    });
  }
}

function toggleDirectCompose(open) {
  state.composeOpen = Boolean(open);
  const box = $('composeBox');
  const openBtn = $('openComposeBtn');
  const inp = $('composeInput');
  if (!box || !openBtn || !inp) return;

  openBtn.classList.toggle('hidden', state.composeOpen);
  box.classList.toggle('hidden', !state.composeOpen);

  if (state.composeOpen) {
    inp.placeholder = state.docBlocks.length === 0
      ? '첫 문장을 직접 적어보세요...'
      : '이어 적을 문장을 입력하세요...';
    requestAnimationFrame(() => {
      autoResizeTextarea(inp);
      inp.focus();
    });
  } else {
    inp.blur();
  }
}

function submitDirectCompose() {
  const inp = $('composeInput');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val) {
    toggleDirectCompose(false);
    return;
  }
  appendTextAsBlocks(val);
  inp.value = '';
  toggleDirectCompose(false);
  syncBlocksToEditor({ triggerSave: true, triggerRecommend: true });
}

// ============================================================================
// 잠금 화면 (잠금 시에만 password input 마운트 → iOS 자동완성 바 방지)
// ============================================================================
function showLockScreen() {
  const ls = $('lockScreen');
  ls.innerHTML = `
    <form id="unlockForm" class="pin-box" autocomplete="off">
      <input type="password" id="pinInput" placeholder="비밀번호 입력" autocomplete="off" />
    </form>
  `;
  ls.classList.remove('hidden');
  const form = $('unlockForm');
  const input = $('pinInput');
  form.addEventListener('submit', handleUnlockSubmit);
  requestAnimationFrame(() => input && input.focus());
}

function hideLockScreen() {
  const ls = $('lockScreen');
  ls.classList.add('hidden');
  ls.innerHTML = '';
}

async function handleUnlockSubmit(e) {
  e.preventDefault();
  const input = $('pinInput');
  if (!input) return;
  const entered = input.value;
  const res = await apiFetch('/api/unlock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: entered })
  });
  if (res.ok) {
    state.pin = entered;
    sessionStorage.setItem('dw_pin', entered);
    hideLockScreen();
    await loadBootstrap();
  } else {
    input.value = '';
    toast('비밀번호가 다릅니다');
  }
}

// ============================================================================
// 밤낮 자동 테마 & 초기화
// ============================================================================
function resolveAutoDayNightTheme() {
  const hr = new Date().getHours();
  return (hr >= 6 && hr < 19) ? 'light' : 'dark';
}

function applyTheme(prefOverride) {
  const pref = prefOverride || localStorage.getItem('dw_theme_pref') || 'auto';
  localStorage.setItem('dw_theme_pref', pref);
  const actual = (pref === 'light' || pref === 'dark') ? pref : resolveAutoDayNightTheme();
  document.documentElement.setAttribute('data-theme', actual);

  const btn = $('themeBtn');
  if (btn) {
    const labelMap = { auto: '테마 · 자동', light: '테마 · 낮', dark: '테마 · 밤' };
    btn.textContent = labelMap[pref] || '테마 · 자동';
  }
}

async function init() {
  applyTheme();
  setInterval(() => {
    if ((localStorage.getItem('dw_theme_pref') || 'auto') === 'auto') {
      applyTheme('auto');
    }
  }, 60 * 1000);

  const stRes = await apiFetch('/api/status');
  const st = await stRes.json();
  if (st.sessionToken) setSessionToken(st.sessionToken);

  if (st.locked && !st.authorized) {
    showLockScreen();
    return;
  }

  await loadBootstrap();
  checkFirebaseRedirectResult();
}

async function loadBootstrap() {
  const res = await apiFetch('/api/bootstrap');
  if (res.status === 401) {
    showLockScreen();
    return;
  }
  const data = await res.json();
  if (data.sessionToken) setSessionToken(data.sessionToken);

  state.writings = data.writings || [];
  state.echoes = data.echoes || [];
  state.echoIdx = 0;
  state.user = data.user || null;
  state.googleClientId = data.googleClientId || '';
  state.firebaseConfigs = Array.isArray(data.firebaseConfigs) ? data.firebaseConfigs : [];
  state.hasPin = Boolean(data.hasPin);
  state.aiProvider = data.aiProvider || 'gemini';
  state.editingProvider = state.aiProvider;
  state.hasAiKey = Boolean(data.hasAiKey);
  state.hasKeys = data.hasKeys || { gemini: false, openai: false, claude: false };
  state.passageCount = Number(data.passageCount || 0);
  state.today = data.today;

  applyTheme();
  updateAiSettingBtnLabel();
  updateDbCountLabel();
  renderUserSection();

  const todayEntry = state.writings.find(w => w.created_date === state.today);
  if (todayEntry) {
    await selectWriting(todayEntry.id);
  } else {
    await createNewWriting();
  }
}

function updateAiSettingBtnLabel() {
  const btn = $('aiSettingBtn');
  if (!btn) return;
  if (state.hasAiKey) {
    const label = PROVIDER_META[state.aiProvider]?.label || 'AI';
    btn.textContent = `${label} ✓`;
  } else {
    btn.textContent = 'AI 연결';
  }
}

function updateDbCountLabel() {
  const el = $('dbCountLabel');
  if (el) {
    el.textContent = state.passageCount > 0 ? `사유 아카이브 ${state.passageCount}선` : '사유 아카이브';
  }
}

// ============================================================================
// 공식 Google OAuth 팝업 로그인 (서버 환경변수 기반 동적 Firebase Auth 초기화)
// ============================================================================
let firebaseReady = false;
function ensureFirebaseAuth(useFallback = false) {
  if (!window.firebase || !window.firebase.auth) return null;
  const cfgs = Array.isArray(state.firebaseConfigs) ? state.firebaseConfigs.filter(c => c && c.apiKey) : [];
  if (cfgs.length === 0) return null;

  if (!firebaseReady) {
    if (!window.firebase.apps || window.firebase.apps.length === 0) {
      window.firebase.initializeApp(cfgs[0]);
      if (cfgs[1]) {
        window.firebase.initializeApp(cfgs[1], 'fallback');
      }
    }
    firebaseReady = true;
  }
  if (useFallback && cfgs[1]) {
    try {
      const fbApp = window.firebase.app('fallback');
      return fbApp ? fbApp.auth() : window.firebase.auth();
    } catch (_) {
      return window.firebase.auth();
    }
  }
  return window.firebase.auth();
}

async function checkFirebaseRedirectResult() {
  for (const useFb of [false, true]) {
    const auth = ensureFirebaseAuth(useFb);
    if (!auth) continue;
    try {
      const result = await auth.getRedirectResult();
      if (result && result.user) {
        const idToken = await result.user.getIdToken();
        await submitGoogleLogin({ credential: idToken });
        return;
      }
    } catch (_) {}
  }
}

async function triggerRealGoogleSignIn(btnEl) {
  const auth = ensureFirebaseAuth(false);
  if (!auth) {
    toast('Google 인증 모듈을 불러오는 중입니다. 잠시 후 다시 눌러주세요');
    return;
  }

  const origHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '<span>Google 계정 연결 중...</span>';
  }

  const runSignInWith = async targetAuth => {
    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const result = await targetAuth.signInWithPopup(provider);
    if (result && result.user) {
      const idToken = await result.user.getIdToken();
      await submitGoogleLogin({ credential: idToken });
    }
  };

  try {
    await runSignInWith(auth);
  } catch (err) {
    if (err && (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found')) {
      try {
        const fbAuth = ensureFirebaseAuth(true);
        await runSignInWith(fbAuth);
        return;
      } catch (_) {}
    }
    if (err && err.code === 'auth/popup-blocked') {
      const provider = new window.firebase.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithRedirect(provider);
      return;
    }
    if (err && err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      toast('Google 로그인 창을 열지 못했습니다. 다시 시도해 주세요');
    }
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = origHtml;
    }
  }
}

function renderUserSection() {
  const sec = $('userSection');
  if (!sec) return;

  if (state.user && state.user.authType === 'google') {
    const avatarHtml = state.user.picture
      ? `<img src="${state.user.picture}" alt="" class="user-avatar" referrerpolicy="no-referrer" />`
      : '';
    sec.innerHTML = `
      <div class="user-row">
        <div class="user-profile-info">
          ${avatarHtml}
          <div class="user-text-col">
            <span class="user-name">${state.user.name || '사용자'}</span>
            ${state.user.email ? `<span class="user-email">${state.user.email}</span>` : ''}
          </div>
        </div>
        <button type="button" id="logoutBtn" class="muted-btn">로그아웃</button>
      </div>
    `;
    $('logoutBtn').addEventListener('click', async () => {
      try {
        const auth = ensureFirebaseAuth();
        if (auth) await auth.signOut();
      } catch (_) {}
      const res = await apiFetch('/api/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.sessionToken) setSessionToken(data.sessionToken);
      state.pin = '';
      sessionStorage.removeItem('dw_pin');
      toast('로그아웃되었습니다');
      await loadBootstrap();
    });
    return;
  }

  sec.innerHTML = `
    <button type="button" id="openGoogleLoginBtn" class="google-btn">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/>
        <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/>
        <path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/>
        <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/>
      </svg>
      <span>Google로 계속하기</span>
    </button>
  `;

  $('openGoogleLoginBtn').addEventListener('click', e => {
    e.stopPropagation();
    triggerRealGoogleSignIn(e.currentTarget);
  });
}

async function submitGoogleLogin(payload) {
  const res = await apiFetch('/api/auth/google', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!res.ok) {
    toast(data.error || '로그인에 실패했습니다');
    return;
  }
  if (data.sessionToken) setSessionToken(data.sessionToken);
  state.googleFormOpen = false;
  toast(`${data.user?.name || 'Google'} 계정으로 로그인되었습니다`);
  await loadBootstrap();
}

// ============================================================================
// 문서 선택 & 생성
// ============================================================================
function resetRelationalSeen() {
  state.seenByMode.same_concept.clear();
  state.seenByMode.contra_concept.clear();
  state.seenByMode.same_author.clear();
}

async function selectWriting(id) {
  const w = state.writings.find(item => item.id === id);
  if (!w) return;
  state.activeId = w.id;
  clearTimeout(state.autoWeaveTimer);

  const echoRes = await apiFetch(`/api/echo?exclude=${w.id}`);
  if (echoRes.ok) {
    const echoData = await echoRes.json();
    state.echoes = echoData.echoes || [];
    state.echoIdx = 0;
  }

  const content = w.content || '';
  if ($('firstLineInput')) $('firstLineInput').value = '';
  state.firstLineComposing = false;
  state.docBlocks = parseContentToBlocks(content);
  state.selectedBlockIdx = -1;
  state.editingBlockIdx = -1;
  state.justMovedIdx = -1;
  state.lastClosedBlockCount = 0;
  toggleDirectCompose(false);
  state.anchorPassage = null;
  state.wovenDraft = null;
  state.lastWovenContext = null;
  state.closedComplete = false;
  state.lastClosedParagraph = '';
  state.replacingClose = false;
  state.weaveDirection = 'reson';
  resetRelationalSeen();
  if (state.docBlocks.length > 0) {
    revealPassageCardImmediately();
  } else {
    resetAndScheduleOpeningPassageReveal(1500);
  }
  syncBlocksToEditor();

  setMode('write');
  maybeFocusFirstLineOnDesktop();
  renderArchive();
  renderAiKeyBanner();

  if (state.hasAiKey) {
    await requestWeave(content.trim() ? 'reson' : 'opening', { forceNew: false });
  } else if (content.trim()) {
    await fetchArchivePassage({ mode: 'same_concept', anchor: null, animate: false });
  } else {
    await fetchArchivePassage({ mode: 'fresh', clearAnchor: true, animate: false });
  }
}

async function createNewWriting() {
  clearTimeout(state.autoWeaveTimer);
  const res = await apiFetch('/api/writings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: '', created_date: state.today })
  });
  if (res.ok) {
    const data = await res.json();
    state.writings.unshift(data.writing);
    state.echoes = data.echoes || [];
    state.echoIdx = 0;
    state.activeId = data.writing.id;
    if ($('firstLineInput')) $('firstLineInput').value = '';
    state.firstLineComposing = false;
    state.docBlocks = [];
    state.selectedBlockIdx = -1;
    state.editingBlockIdx = -1;
    state.justMovedIdx = -1;
    state.lastClosedBlockCount = 0;
    toggleDirectCompose(false);
    state.anchorPassage = null;
    state.wovenDraft = null;
    state.lastWovenContext = null;
    state.closedComplete = false;
    state.lastClosedParagraph = '';
    state.replacingClose = false;
    state.weaveDirection = 'reson';
    state.relationMode = 'fresh';
    state.relationLabel = '';
    resetRelationalSeen();
    resetAndScheduleOpeningPassageReveal(1500);
    syncBlocksToEditor();

    setMode('write');
    maybeFocusFirstLineOnDesktop();
    renderArchive();
    closeArchive();
    renderAiKeyBanner();

    if (state.hasAiKey) {
      requestWeave('opening', { forceNew: false });
    } else {
      fetchArchivePassage({ mode: 'fresh', clearAnchor: true, animate: false });
    }
  }
}

function setMode(nextMode) {
  state.mode = nextMode;
  if (nextMode === 'write') {
    $('writeView').classList.remove('hidden');
    $('distillView').classList.add('hidden');
    $('leftNavBtn').textContent = '서재';
    if ($('topbarRight')) $('topbarRight').classList.remove('hidden');
    renderSentenceCanvas();
    updateWriteMeta();
    renderEchoBox();
  } else {
    flushPendingInputs();
    const ed = $('editor');
    const full = ed.value.trim();
    if (!full) {
      state.mode = 'write';
      toast('먼저 첫 문장을 작성해주세요');
      return;
    }

    $('writeView').classList.add('hidden');
    $('distillView').classList.remove('hidden');
    $('leftNavBtn').textContent = '← 계속 쓰기';
    if ($('topbarRight')) $('topbarRight').classList.add('hidden');

    prepareDistillSegments();
    renderDistillView();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function updateSaveStateIndicator(status = '') {
  const el = $('saveStateLabel');
  if (!el) return;
  const hasText = Boolean($('editor') && $('editor').value.trim());
  if (!hasText && !status) {
    el.textContent = '';
    el.classList.remove('saved');
    return;
  }
  if (status === 'saving') {
    el.textContent = '저장 중…';
    el.classList.remove('saved');
  } else if (status === 'manual') {
    el.textContent = '저장 완료 ✓';
    el.classList.add('saved');
  } else {
    el.textContent = hasText ? '자동 저장됨 ✓' : '';
    el.classList.toggle('saved', hasText);
  }
}

function updateWriteMeta() {
  const w = getActiveWriting();
  const trimmed = $('editor').value.trim();
  $('dateLabel').textContent = formatKoreanFullDate(w ? w.created_date : state.today);
  $('metaHint').textContent = trimmed.length > 0 ? `${trimmed.length.toLocaleString()}자` : '';
  if ($('saveNowBtn')) $('saveNowBtn').classList.toggle('dimmed', trimmed.length === 0);
  $('rightNavBtn').textContent = '발행';
  $('rightNavBtn').classList.toggle('dimmed', trimmed.length === 0);
  if (!state.saveTimer) updateSaveStateIndicator();
}

function renderEchoBox() {
  const echoBox = $('echoBox');
  if (echoBox) echoBox.classList.add('hidden');
}

// ============================================================================
// Gemini · OpenAI · Claude 3대 프로바이더 인라인 설정 바
// ============================================================================
function renderAiKeyBanner() {
  const banner = $('aiKeyBanner');
  if (!banner) return;

  if (state.hasAiKey && !state.keyEditorOpen) {
    banner.innerHTML = '';
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');

  if (!state.keyEditorOpen) {
    banner.innerHTML = `
      <div class="ai-benefit-box">
        <div class="ai-benefit-head">
          <span class="ai-benefit-lead">✦ AI 키를 연결하면 처음 쓰는 글도 막힘없이 이어집니다</span>
          <button type="button" id="openKeyEditorBtn" class="passage-btn primary">AI 키 연결하기 (Gemini · OpenAI · Claude)</button>
        </div>
        <ul class="ai-benefit-list">
          <li><strong>보통 사람의 말투로 잇는 다음 문장</strong> — 쓰던 글의 맥락과 어미(~다/~요)에 맞춰, 꾸밈없이 자연스러운 1~2문장을 제안해 터치 한 번으로 이어 적게 돕습니다.</li>
          <li><strong>막힐 땐 4가지 방향 전환</strong> — 단순 글귀 인용을 넘어 <em>공명 · 반론 · 비유 · 매듭</em>으로 생각을 넓히고 글의 마무리까지 자연스럽게 여며 줍니다.</li>
          <li><strong>내 호흡에 맞춘 문체 조율 & 무료 키</strong> — 문체 농도(일상·산문·사유)와 길이(1문장~3문장), 어미를 즉시 바꿀 수 있으며 <strong>Gemini 키는 무료</strong>로 발급됩니다.</li>
        </ul>
      </div>
    `;
    $('openKeyEditorBtn').addEventListener('click', e => {
      e.stopPropagation();
      state.editingProvider = state.aiProvider || 'gemini';
      state.keyEditorOpen = true;
      renderAiKeyBanner();
      requestAnimationFrame(() => {
        const inp = $('aiKeyInput');
        if (inp) inp.focus();
      });
    });
    return;
  }

  const curProv = state.editingProvider || 'gemini';
  const meta = PROVIDER_META[curProv] || PROVIDER_META.gemini;
  const curHasKey = Boolean(state.hasKeys && state.hasKeys[curProv]);

  banner.innerHTML = `
    <div class="ai-editor-guide">
      <div class="ai-editor-guide-title">✦ AI 연결 시 활성화되는 기능</div>
      <div class="ai-editor-guide-items">
        <span>· 본문 맥락·어미(~다/~요)에 맞춘 담백한 다음 1~2문장 제안</span>
        <span>· 공명 · 반론 · 비유 · 매듭 4가지 방향으로 생각 확장·마무리</span>
        <span>· 농도(일상·산문·사유) · 호흡 길이 · 어미 실시간 조율</span>
      </div>
    </div>
    <div class="provider-tabs">
      ${['gemini', 'openai', 'claude'].map(p => {
        const m = PROVIDER_META[p];
        const has = Boolean(state.hasKeys && state.hasKeys[p]);
        const badge = m.badge && !has ? `<span class="prov-badge">${m.badge}</span>` : '';
        return `<button type="button" class="provider-tab${curProv === p ? ' active' : ''}" data-prov="${p}">${m.label}${badge}${has ? '<span class="dot" title="키 등록됨"></span>' : ''}</button>`;
      }).join('')}
      <a href="${meta.keyUrl}" target="_blank" rel="noopener" class="key-issue-link">${meta.linkText || `${meta.label} 키 발급 ↗`}</a>
    </div>
    <div class="provider-desc">${meta.desc} · <span>내 계정에만 안전하게 격리 보관됩니다</span></div>
    <div class="key-inline-row">
      <input
        id="aiKeyInput"
        type="text"
        class="masked-key-input"
        placeholder="${curHasKey ? `새 ${meta.label} 키 입력 (현재 연결됨 ✓)` : meta.placeholder}"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
      />
      <button type="button" id="saveKeyBtn" class="passage-btn primary">${curHasKey ? '변경' : '연결'}</button>
      ${curHasKey ? '<button type="button" id="clearKeyBtn" class="muted-btn danger">해제</button>' : ''}
      <button type="button" id="cancelKeyBtn" class="muted-btn">닫기</button>
    </div>
  `;

  banner.querySelectorAll('.provider-tab').forEach(tab => {
    tab.addEventListener('click', async e => {
      e.stopPropagation();
      const nextProv = tab.dataset.prov;
      state.editingProvider = nextProv;

      // 이미 키가 등록된 프로바이더 탭을 누르면 즉시 활성 모델 전환도 함께 수행
      if (state.hasKeys && state.hasKeys[nextProv] && state.aiProvider !== nextProv) {
        const res = await apiFetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: nextProv, selectOnly: true })
        });
        if (res.ok) {
          const data = await res.json();
          state.aiProvider = data.aiProvider;
          state.hasAiKey = data.hasAiKey;
          state.hasKeys = data.hasKeys || state.hasKeys;
          updateAiSettingBtnLabel();
          toast(`${PROVIDER_META[nextProv].label} 모델로 전환되었습니다`);
          const hasText = Boolean($('editor').value.trim());
          requestWeave(hasText ? state.weaveDirection : 'opening', { forceNew: true });
        }
      }
      renderAiKeyBanner();
      requestAnimationFrame(() => {
        const inp = $('aiKeyInput');
        if (inp) inp.focus();
      });
    });
  });

  const saveKey = async () => {
    const inp = $('aiKeyInput');
    const val = (inp ? inp.value : '').trim();
    if (!val) {
      toast('API 키를 입력해주세요');
      return;
    }
    const saveBtn = $('saveKeyBtn');
    saveBtn.textContent = '열쇠 맞춰보는 중...';
    saveBtn.disabled = true;

    // 카드에도 재치있는 열쇠 확인 안내 표시
    const relEl = $('passageRel');
    const quoteEl = $('passageQuote');
    const sourceEl = $('passageSource');
    if (relEl && quoteEl) {
      $('passageCard').classList.add('loading');
      relEl.classList.remove('hidden');
      relEl.textContent = `✦ ${meta.label} 서재의 문을 여는 중`;
      quoteEl.textContent = '동서고금의 문장들이 잠든 서재의 열쇠가 맞는지 문고리를 조심스레 돌려보고 있습니다…';
      if (sourceEl) sourceEl.textContent = '— 열쇠 구멍 맞춰보는 중';
    }

    const res = await apiFetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: curProv, apiKey: val })
    });
    const data = await res.json();
    if (res.ok && data.hasAiKey) {
      state.aiProvider = data.aiProvider || curProv;
      state.hasAiKey = Boolean(data.hasAiKey);
      state.hasKeys = data.hasKeys || state.hasKeys;
      state.keyEditorOpen = false;
      updateAiSettingBtnLabel();
      renderAiKeyBanner();
      toast(`${meta.label} 서재의 문이 열렸습니다`);
      const hasText = Boolean($('editor').value.trim());
      requestWeave(hasText ? state.weaveDirection : 'opening', { forceNew: true });
    } else {
      $('passageCard').classList.remove('loading');
      saveBtn.textContent = curHasKey ? '변경' : '저장';
      saveBtn.disabled = false;
      toast(data.error || '키 확인에 실패했습니다');
      if (!state.hasAiKey) renderArchivePassageCard(false);
    }
  };

  $('saveKeyBtn').addEventListener('click', e => {
    e.stopPropagation();
    saveKey();
  });

  $('aiKeyInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveKey();
    }
  });

  if ($('clearKeyBtn')) {
    $('clearKeyBtn').addEventListener('click', async e => {
      e.stopPropagation();
      const res = await apiFetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: curProv, apiKey: '' })
      });
      const data = await res.json();
      state.aiProvider = data.aiProvider || 'gemini';
      state.hasAiKey = Boolean(data.hasAiKey);
      state.hasKeys = data.hasKeys || { gemini: false, openai: false, claude: false };
      state.keyEditorOpen = !state.hasAiKey;
      updateAiSettingBtnLabel();
      renderAiKeyBanner();
      if (!state.hasAiKey) {
        toast(`${meta.label} 키가 해제되어 내장 아카이브 모드로 전환되었습니다`);
        fetchArchivePassage({ mode: 'fresh', clearAnchor: true, animate: true });
      } else {
        toast(`${PROVIDER_META[state.aiProvider].label} 모델로 유지됩니다`);
      }
    });
  }

  $('cancelKeyBtn').addEventListener('click', e => {
    e.stopPropagation();
    state.keyEditorOpen = false;
    renderAiKeyBanner();
  });
}

function startWeaveLoadingTicker() {
  clearInterval(state.weaveLoadingTimer);
  state.weaveLoadingIdx = (typeof state.weaveLoadingIdx === 'number' ? state.weaveLoadingIdx + 1 : 0);
  state.weaveLoadingTimer = setInterval(() => {
    if (!state.weaveLoading) {
      clearInterval(state.weaveLoadingTimer);
      return;
    }
    state.weaveLoadingIdx = (state.weaveLoadingIdx || 0) + 1;
    renderWeaveCard();
  }, 2200);
}

function stopWeaveLoadingTicker() {
  clearInterval(state.weaveLoadingTimer);
  state.weaveLoadingTimer = null;
}

const STYLE_AXES = [
  {
    key: 'tone',
    label: '농도',
    options: [
      { val: 'simple', label: '일상·담백', short: '담백' },
      { val: 'lyrical', label: '차분한 산문', short: '산문' },
      { val: 'pedantic', label: '깊은 사유', short: '사유' }
    ]
  },
  {
    key: 'length',
    label: '호흡',
    options: [
      { val: 'short', label: '짧게 (1문장)', short: '1문장' },
      { val: 'medium', label: '보통 (1~2문장)', short: '1~2문장' },
      { val: 'long', label: '길게 (2~3문장)', short: '2~3문장' }
    ]
  },
  {
    key: 'ending',
    label: '어미',
    options: [
      { val: 'auto', label: '본문 맞춤', short: '자동' },
      { val: 'plain', label: '~다 (평서)', short: '~다' },
      { val: 'polite', label: '~요 (경어)', short: '~요' }
    ]
  }
];

const STYLE_CHANGE_WITTY = {
  'tone:simple': {
    status: '✦ 꾸밈없는 일상 말투로 다듬는 중',
    text: '거창한 수식어를 덜어내고, 보통 사람이 일기장에 툭 적어 내려간 듯 자연스럽고 담백하게 고치고 있습니다…',
    sub: '— 일상·담백 문체로 재조율 중'
  },
  'tone:lyrical': {
    status: '✦ 차분한 산문 어조로 고르는 중',
    text: '일상의 온기와 잔잔한 여운이 느껴지는 부드러운 산문 호흡으로 문장을 다듬고 있습니다…',
    sub: '— 차분한 산문 문체로 재조율 중'
  },
  'tone:pedantic': {
    status: '✦ 생각의 깊이를 한 겹 더하는 중',
    text: '일상적인 흐름을 유지하면서도 생각의 이유를 차분히 짚어보는 에세이 문체로 다듬고 있습니다…',
    sub: '— 깊은 사유 문체로 재조율 중'
  },
  'length:short': {
    status: '✦ 짧고 간결한 한 문장으로 줄이는 중',
    text: '군더더기를 덜어내고 핵심만 남은 깔끔한 한 문장으로 압축하고 있습니다…',
    sub: '— 짧은 호흡(1문장)으로 재조율 중'
  },
  'length:medium': {
    status: '✦ 부담 없는 1~2문장으로 고르는 중',
    text: '처음 글을 쓸 때 가장 자연스럽게 이어 붙일 수 있는 짧은 한두 문장으로 다듬고 있습니다…',
    sub: '— 보통 호흡(1~2문장)으로 재조율 중'
  },
  'length:long': {
    status: '✦ 2~3문장으로 호흡을 넓히는 중',
    text: '생각이 자연스럽게 이어지도록 읽기 편한 두세 문장으로 풀어내고 있습니다…',
    sub: '— 긴 호흡(2~3문장)으로 재조율 중'
  },
  'ending:auto': {
    status: '✦ 쓰신 본문 말투에 맞추는 중',
    text: '본문의 마지막 문장 어미를 읽어 자연스럽게 이어지도록 말투를 맞추고 있습니다…',
    sub: '— 본문 맞춤 어미로 재조율 중'
  },
  'ending:plain': {
    status: '✦ 담백한 평서체(~다)로 바꾸는 중',
    text: '문장의 끝을 깔끔하고 솔직한 평서체(~다)로 통일하고 있습니다…',
    sub: '— 평서체(~다)로 재조율 중'
  },
  'ending:polite': {
    status: '✦ 다정한 경어체(~요/습니다)로 바꾸는 중',
    text: '조용히 건네는 이야기처럼 부드러운 경어체로 어미를 바꾸고 있습니다…',
    sub: '— 경어체(~요)로 재조율 중'
  }
};

function getStyleSummaryLabel() {
  const s = state.weaveStyle;
  const toneShort = STYLE_AXES[0].options.find(o => o.val === s.tone)?.short || '담백';
  const lenShort = STYLE_AXES[1].options.find(o => o.val === s.length)?.short || '1~2문장';
  const endShort = s.ending === 'auto' ? '' : ` · ${STYLE_AXES[2].options.find(o => o.val === s.ending)?.short || ''}`;
  const arrow = state.styleTunerOpen ? '▴' : '▾';
  return `${toneShort} · ${lenShort}${endShort} ${arrow}`;
}

function renderStyleTuner() {
  const toggleBtn = $('styleTuneToggleBtn');
  const styleBar = $('styleGroupBar');
  const panel = $('styleTunerPanel');
  if (!toggleBtn || !panel) return;

  if (!state.hasAiKey) {
    if (styleBar) styleBar.classList.add('hidden');
    toggleBtn.classList.add('hidden');
    panel.classList.add('hidden');
    return;
  }

  if (styleBar) styleBar.classList.remove('hidden');
  toggleBtn.classList.remove('hidden');
  toggleBtn.classList.toggle('open', state.styleTunerOpen);
  toggleBtn.textContent = getStyleSummaryLabel();
  toggleBtn.onmousedown = e => e.preventDefault();
  toggleBtn.onclick = e => {
    e.stopPropagation();
    state.styleTunerOpen = !state.styleTunerOpen;
    renderStyleTuner();
  };

  if (!state.styleTunerOpen) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  panel.innerHTML = '';

  for (const axis of STYLE_AXES) {
    const row = document.createElement('div');
    row.className = 'style-axis-row';

    const lbl = document.createElement('span');
    lbl.className = 'style-axis-label';
    lbl.textContent = axis.label;
    row.appendChild(lbl);

    const seg = document.createElement('div');
    seg.className = 'style-axis-seg';

    for (const opt of axis.options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `style-seg-btn${state.weaveStyle[axis.key] === opt.val ? ' active' : ''}`;
      btn.textContent = opt.label;
      btn.onmousedown = ev => ev.preventDefault();
      btn.onclick = ev => {
        ev.stopPropagation();
        if (state.weaveStyle[axis.key] === opt.val && !state.weaveLoading) return;
        state.weaveStyle[axis.key] = opt.val;
        localStorage.setItem('dw_weave_style_v2', JSON.stringify(state.weaveStyle));
        state.lastStyleChanged = `${axis.key}:${opt.val}`;
        document.body.classList.remove('typing');
        renderStyleTuner();
        const isBlank = !$('editor').value.trim();
        requestWeave(isBlank ? 'opening' : state.weaveDirection, { forceNew: false, styleReweave: true });
      };
      seg.appendChild(btn);
    }

    row.appendChild(seg);
    panel.appendChild(row);
  }
}

// ============================================================================
// 주력 모드: 한 호흡(2~3문장) 직조 & 내 문체 조각 엔진 (Gemini · OpenAI · Claude)
// ============================================================================
async function requestWeave(direction = 'reson', { forceNew = false, styleReweave = false, replaceCloseTarget = '' } = {}) {
  if (!state.hasAiKey) return;

  const ed = $('editor');
  const rawVal = ed ? ed.value : '';
  let contextText = rawVal;
  if (replaceCloseTarget && rawVal.trim().endsWith(replaceCloseTarget)) {
    const idx = rawVal.lastIndexOf(replaceCloseTarget);
    if (idx !== -1) {
      contextText = rawVal.slice(0, idx).replace(/\s+$/g, '');
    }
  }
  const trimmed = contextText.trim();
  const effectiveDir = trimmed ? direction : 'opening';
  if (trimmed) state.weaveDirection = effectiveDir;

  if (!styleReweave) {
    state.closedComplete = false;
    if (!replaceCloseTarget) {
      state.replacingClose = false;
      state.lastClosedParagraph = '';
    }
  }

  const reqId = ++state.weaveReqSeq;
  state.weaveLoading = true;
  if (!styleReweave) state.lastStyleChanged = null;
  startWeaveLoadingTicker();

  if (forceNew && state.wovenDraft && state.wovenDraft.author) {
    if (!state.recentAuthors.includes(state.wovenDraft.author)) {
      state.recentAuthors.push(state.wovenDraft.author);
    }
  }

  renderWeaveCard();

  try {
    const res = await apiFetch('/api/weave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        direction: effectiveDir,
        editorText: contextText,
        avoidAuthors: state.recentAuthors.slice(-8),
        styleOptions: state.weaveStyle,
        currentDraft: (styleReweave && state.wovenDraft) ? state.wovenDraft : null
      })
    });

    if (reqId !== state.weaveReqSeq) return;
    const data = await res.json();

    if (!res.ok) {
      state.weaveLoading = false;
      state.lastStyleChanged = null;
      stopWeaveLoadingTicker();
      if (data.code === 'NO_API_KEY' || data.code === 'INVALID_API_KEY') {
        state.hasAiKey = false;
        state.keyEditorOpen = true;
        updateAiSettingBtnLabel();
        renderAiKeyBanner();
        fetchArchivePassage({ mode: 'fresh', clearAnchor: true, animate: false });
        toast(data.error || 'API 키를 확인해주세요');
        return;
      }
      toast(data.error || '문장 직조 중 오류가 발생했습니다');
      renderWeaveCard();
      return;
    }

    state.weaveLoading = false;
    state.lastStyleChanged = null;
    stopWeaveLoadingTicker();
    state.wovenDraft = data;
    state.lastWovenContext = trimmed;
    if (data.author && !state.recentAuthors.includes(data.author)) {
      state.recentAuthors.push(data.author);
      if (state.recentAuthors.length > 12) state.recentAuthors.shift();
    }
    renderWeaveCard();
  } catch (_) {
    if (reqId !== state.weaveReqSeq) return;
    state.weaveLoading = false;
    state.lastStyleChanged = null;
    stopWeaveLoadingTicker();
    renderWeaveCard();
  }
}

function renderWeaveCard() {
  const card = $('passageCard');
  card.classList.remove('hidden');
  card.classList.toggle('loading', state.weaveLoading);

  const relEl = $('passageRel');
  const quoteEl = $('passageQuote');
  const sourceEl = $('passageSource');
  const btnsEl = $('passageBtns');
  const rightBtn = $('rightCardBtn');

  const isBlankEditor = !$('editor').value.trim();
  const activeDir = isBlankEditor ? 'opening' : state.weaveDirection;
  const provName = PROVIDER_META[state.aiProvider]?.label || 'AI';

  relEl.classList.remove('hidden');
  if (state.weaveLoading) {
    const customWitty = state.lastStyleChanged && STYLE_CHANGE_WITTY[state.lastStyleChanged];
    const pool = WEAVE_LOADING_WITTY[activeDir] || WEAVE_LOADING_WITTY.reson;
    const item = customWitty || pool[(state.weaveLoadingIdx || 0) % pool.length];
    relEl.textContent = `${item.status} · ${provName}`;
    quoteEl.textContent = item.text;
    sourceEl.textContent = item.sub;
  } else if (state.closedComplete) {
    relEl.textContent = '✦ 매듭 완료 · 글이 여미어졌습니다';
    quoteEl.textContent = '마지막 문장이 본문에 더해졌습니다. 내 말투로 가볍게 다듬은 뒤 발행하거나, 아래에서 다른 마무리 문장으로 바꿔볼 수 있습니다.';
    sourceEl.textContent = '';
  } else if (state.wovenDraft) {
    relEl.textContent = WEAVE_LABELS[state.wovenDraft.direction] || '다음 한 호흡';
    quoteEl.textContent = state.wovenDraft.paragraph;
    sourceEl.textContent = state.wovenDraft.inspiration
      ? `— ${state.wovenDraft.inspiration}`
      : '';
  } else {
    relEl.textContent = WEAVE_LABELS[activeDir] || '다음 한 호흡';
    quoteEl.textContent = '방향을 누르면 이어질 문장을 제안합니다.';
    sourceEl.textContent = '';
  }

  renderStyleTuner();
  if ($('categoryGroupBar')) $('categoryGroupBar').classList.add('hidden');
  if (rightBtn) rightBtn.classList.add('hidden');

  const bubbleInsertBtn = $('bubbleInsertBtn');
  const triggerAiAdopt = () => {
    document.body.classList.remove('typing');
    if (state.closedComplete && !state.weaveLoading) {
      setMode('distill');
    } else if (!state.weaveLoading && state.wovenDraft) {
      insertWovenDraft();
    }
  };
  const triggerAiNext = () => {
    document.body.classList.remove('typing');
    if ((state.closedComplete || state.replacingClose) && state.lastClosedParagraph) {
      state.replacingClose = true;
      requestWeave('close', { forceNew: true, replaceCloseTarget: state.lastClosedParagraph });
    } else {
      requestWeave(isBlankEditor ? 'opening' : state.weaveDirection, { forceNew: true });
    }
  };

  if (bubbleInsertBtn) {
    if (state.closedComplete && !state.weaveLoading) {
      bubbleInsertBtn.textContent = '발행 화면으로 →';
      bubbleInsertBtn.disabled = false;
    } else {
      bubbleInsertBtn.textContent = isBlankEditor
        ? '+ 첫 문장으로 채택 ↵'
        : state.replacingClose
          ? '+ 이 매듭으로 바꾸기 ↵'
          : '+ 다음 문장으로 채택 ↵';
      bubbleInsertBtn.disabled = state.weaveLoading || !state.wovenDraft;
    }
    bubbleInsertBtn.onclick = e => {
      e.stopPropagation();
      triggerAiAdopt();
    };
  }

  btnsEl.innerHTML = '';

  const fetchGroup = document.createElement('div');
  fetchGroup.className = 'passage-control-group';

  const groupLbl = document.createElement('span');
  groupLbl.className = 'group-label';
  groupLbl.textContent = isBlankEditor ? '새 추천' : '사유 방향';
  fetchGroup.appendChild(groupLbl);

  const optsWrap = document.createElement('div');
  optsWrap.className = 'group-options';

  if (!isBlankEditor) {
    const dirs = [
      { key: 'reson', label: '공명', title: '내 생각과 맞닿는 고전·현대의 시선으로 깊이 잇기' },
      { key: 'contra', label: '반론', title: '정반대 사상가·작가의 시선으로 생각 뒤집기' },
      { key: 'scene', label: '비유', title: '문학·산문 속 장면이나 우화로 형상화하기' },
      { key: 'close', label: '매듭', title: '지금까지의 흐름을 여미며 결론 단락 짓기' }
    ];
    for (const d of dirs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `passage-btn${state.weaveDirection === d.key ? ' active' : ''}`;
      b.textContent = d.label;
      b.title = d.title;
      b.addEventListener('mousedown', ev => ev.preventDefault());
      b.onclick = e => {
        e.stopPropagation();
        document.body.classList.remove('typing');
        if (d.key === 'close' && (state.closedComplete || state.replacingClose) && state.lastClosedParagraph) {
          state.replacingClose = true;
          requestWeave('close', { forceNew: true, replaceCloseTarget: state.lastClosedParagraph });
        } else {
          requestWeave(d.key, { forceNew: state.weaveDirection === d.key });
        }
      };
      optsWrap.appendChild(b);
    }
  }

  const reweaveBtn = document.createElement('button');
  reweaveBtn.type = 'button';
  reweaveBtn.className = 'passage-btn';
  reweaveBtn.textContent = isBlankEditor
    ? '다른 첫 문장 ↻'
    : (state.closedComplete || state.replacingClose)
      ? '다른 매듭 ↻'
      : '다른 문장 ↻';
  reweaveBtn.onmousedown = e => e.preventDefault();
  reweaveBtn.onclick = e => {
    e.stopPropagation();
    triggerAiNext();
  };
  optsWrap.appendChild(reweaveBtn);

  fetchGroup.appendChild(optsWrap);
  btnsEl.appendChild(fetchGroup);

  updatePassageDeckHeader();
  bindPassageBubbleInteractions({
    canAdopt: () => (state.closedComplete && !state.weaveLoading) || (!state.weaveLoading && Boolean(state.wovenDraft)),
    onAdopt: triggerAiAdopt,
    onNext: triggerAiNext
  });
}

function isManuscriptBlank() {
  const firstPending = ($('firstLineInput') && state.docBlocks.length === 0)
    ? $('firstLineInput').value.trim()
    : '';
  const ed = $('editor');
  return state.docBlocks.length === 0 && !(ed && ed.value.trim()) && !firstPending;
}

function updatePassageDeckHeader() {
  const titleEl = $('passageDeckTitle');
  const hintEl = $('passageDeckHint');
  const insertBtn = $('bubbleInsertBtn');
  const isBlank = isManuscriptBlank();

  if (titleEl) {
    if (state.hasAiKey && state.closedComplete) {
      titleEl.textContent = '✦ 매듭 완료';
    } else if (isBlank) {
      titleEl.textContent = '✦ 첫 문장 · 글귀 추천';
    } else {
      titleEl.textContent = '✦ 다음 문장 · 글귀 추천';
    }
  }

  if (hintEl) {
    if (state.hasAiKey && state.closedComplete) {
      hintEl.textContent = '문장을 다듬거나 발행해보세요';
    } else if (state.hasAiKey) {
      hintEl.textContent = '카드 터치로 채택 · 좌측 밀어 다른 문장';
    } else {
      hintEl.textContent = '카드 터치로 채택 · 좌측 밀어 다른 글귀';
    }
  }

  if (insertBtn && !(state.hasAiKey && state.closedComplete) && !(state.hasAiKey && state.replacingClose)) {
    insertBtn.textContent = isBlank ? '+ 첫 문장으로 채택 ↵' : '+ 다음 문장으로 채택 ↵';
  }
}

function bindPassageBubbleInteractions({ canAdopt, onAdopt, onNext }) {
  const bubble = $('passageBubble');
  if (!bubble) return;

  bubble._canAdopt = canAdopt;
  bubble._onAdopt = onAdopt;
  bubble._onNext = onNext;

  if (bubble._boundUnified) return;
  bubble._boundUnified = true;

  bubble.addEventListener('click', ev => {
    if (ev.target && ev.target.closest && ev.target.closest('button, a')) return;
    if (bubble._suppressClickUntil && Date.now() < bubble._suppressClickUntil) return;
    if (typeof bubble._canAdopt === 'function' && !bubble._canAdopt()) return;
    if (typeof bubble._onAdopt === 'function') bubble._onAdopt();
  });

  let bStartX = 0;
  let bStartY = 0;
  let bDx = 0;
  let bAxis = null;
  let bTrack = false;

  bubble.addEventListener('touchstart', ev => {
    if (ev.touches.length !== 1) return;
    bStartX = ev.touches[0].clientX;
    bStartY = ev.touches[0].clientY;
    bDx = 0;
    bAxis = null;
    bTrack = true;
    bubble.style.transition = 'none';
  }, { passive: true });

  bubble.addEventListener('touchmove', ev => {
    if (!bTrack || ev.touches.length !== 1) return;
    const dx = ev.touches[0].clientX - bStartX;
    const dy = ev.touches[0].clientY - bStartY;

    if (!bAxis) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      bAxis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
    }
    if (bAxis !== 'x') return;

    if (ev.cancelable) ev.preventDefault();
    bDx = Math.max(-96, Math.min(96, dx));
    bubble.style.transform = `translateX(${bDx}px)`;
    bubble.style.opacity = String(Math.max(0.5, 1 - Math.abs(bDx) / 200));
  }, { passive: false });

  const finishBubbleSwipe = () => {
    if (!bTrack) return;
    bTrack = false;
    bubble.style.transition = 'transform 0.2s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease';
    bubble.style.transform = '';
    bubble.style.opacity = '';

    if (bAxis === 'x' && Math.abs(bDx) >= 12) {
      bubble._suppressClickUntil = Date.now() + 360;
    }
    if (bAxis === 'x' && bDx >= 60) {
      if ((!bubble._canAdopt || bubble._canAdopt()) && typeof bubble._onAdopt === 'function') {
        bubble._onAdopt();
      }
    } else if (bAxis === 'x' && bDx <= -60) {
      if (typeof bubble._onNext === 'function') {
        bubble._onNext();
      }
    }
    bDx = 0;
    bAxis = null;
  };

  bubble.addEventListener('touchend', finishBubbleSwipe);
  bubble.addEventListener('touchcancel', finishBubbleSwipe);
}

function insertWovenDraft() {
  const draft = state.wovenDraft;
  if (!draft || !draft.paragraph) return;

  clearTimeout(state.autoWeaveTimer);
  commitFirstLineInput({ triggerSave: false, triggerRecommend: false });
  let addedCount = 0;

  if (state.replacingClose && state.lastClosedBlockCount > 0) {
    addedCount = appendTextAsBlocks(draft.paragraph, { replaceLastCount: state.lastClosedBlockCount });
  } else if (!state.docBlocks.length || draft.appendMode === 'start') {
    state.docBlocks = parseContentToBlocks(draft.paragraph);
    state.selectedBlockIdx = -1;
    state.editingBlockIdx = -1;
    addedCount = state.docBlocks.length;
  } else if (draft.appendMode === 'inline') {
    addedCount = appendTextAsBlocks(draft.paragraph, { inline: true });
  } else {
    addedCount = appendTextAsBlocks(draft.paragraph);
  }

  syncBlocksToEditor({ triggerSave: true });
  state.lastWovenContext = $('editor').value.trim();

  if (draft.direction !== 'close') {
    state.closedComplete = false;
    state.replacingClose = false;
    state.lastClosedParagraph = '';
    state.lastClosedBlockCount = 0;
    state.weaveDirection = 'reson';
    requestWeave('reson', { forceNew: false });
  } else {
    state.wovenDraft = null;
    state.closedComplete = true;
    state.replacingClose = false;
    state.lastClosedBlockCount = addedCount;
    state.lastClosedParagraph = addedCount > 0
      ? state.docBlocks.slice(-addedCount).join('\n\n')
      : draft.paragraph;
    renderWeaveCard();
    toast('글의 매듭이 지어졌습니다. 문장을 터치해 다듬거나 발행해보세요');
  }
}

function scheduleAutoWeaveAfterEdit() {
  if (!state.hasAiKey) return;
  clearTimeout(state.autoWeaveTimer);
  state.autoWeaveTimer = setTimeout(() => {
    if (!state.hasAiKey || state.mode !== 'write' || state.weaveLoading) return;
    const cur = $('editor').value.trim();
    if (!cur) {
      if (state.lastWovenContext !== '') requestWeave('opening');
      return;
    }
    const prev = state.lastWovenContext || '';
    const changedTail = cur.slice(-24) !== prev.slice(-24);
    const changedLen = Math.abs(cur.length - prev.length) >= 4;
    if (cur !== prev && (changedTail || changedLen)) {
      requestWeave(state.weaveDirection || 'reson');
    }
  }, 1500);
}

function scheduleAutoArchiveAfterEdit() {
  if (state.hasAiKey) return;
  clearTimeout(state.autoArchiveTimer);
  state.autoArchiveTimer = setTimeout(() => {
    if (state.hasAiKey || state.mode !== 'write') return;
    const cur = $('editor').value.trim();
    const prev = state.lastArchiveContext || '';
    if (!cur) {
      state.lastArchiveContext = '';
      state.anchorPassage = null;
      state.relationMode = 'fresh';
      state.relationLabel = '';
      renderArchivePassageCard(false);
      return;
    }
    const changedTail = cur.slice(-18) !== prev.slice(-18);
    const changedLen = Math.abs(cur.length - prev.length) >= 6;
    if (cur !== prev && (changedTail || changedLen)) {
      state.lastArchiveContext = cur;
      fetchArchivePassage({ mode: 'same_concept', anchor: null, animate: true });
    }
  }, 1600);
}

// ============================================================================
// 폴백 모드: SQLite 고전·현대 아카이브 구절 추천 (AI 키 미연결 시)
// ============================================================================
function formatCatLabel(cat) {
  if (cat === '전체') return '전체 분야';
  if (cat === '경전') return '종교·경전';
  return cat;
}

async function fetchArchivePassage({ mode = 'fresh', clearAnchor = false, anchor = undefined, animate = false } = {}) {
  const ed = $('editor');
  const rawVal = ed ? ed.value : '';
  const selectedSentence = (state.selectedBlockIdx >= 0 && state.docBlocks[state.selectedBlockIdx])
    ? state.docBlocks[state.selectedBlockIdx]
    : '';
  const recentText = selectedSentence || rawVal.slice(Math.max(0, rawVal.length - 180));

  const seenSet = state.seenByMode[mode] || state.seenByMode.fresh;
  const effectiveAnchor = clearAnchor ? null : (anchor !== undefined ? anchor : state.anchorPassage);

  const res = await apiFetch('/api/passages/next', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode,
      clearAnchor,
      category: state.passageCategory,
      anchor: effectiveAnchor,
      editorText: rawVal,
      recentText,
      currentId: state.currentPassage ? state.currentPassage.id : -1,
      excludeIds: Array.from(seenSet),
      excludeContinuations: state.seenContinuations.slice(-24)
    })
  });

  if (!res.ok) return;
  const data = await res.json();
  if (data.totalCount) {
    state.passageCount = data.totalCount;
    updateDbCountLabel();
  }
  if (data.plainContinuation && data.plainContinuation.sentence) {
    state.plainContinuation = data.plainContinuation;
    if (!state.seenContinuations.includes(data.plainContinuation.sentence)) {
      state.seenContinuations.push(data.plainContinuation.sentence);
      if (state.seenContinuations.length > 30) state.seenContinuations.shift();
    }
  }
  if (!data.passage) {
    $('passageCard').classList.add('hidden');
    return;
  }

  $('passageCard').classList.remove('hidden');
  if (data.resetSeen) seenSet.clear();
  seenSet.add(data.passage.id);

  state.currentPassage = data.passage;
  state.lastArchiveContext = rawVal.trim();
  state.anchorPassage = clearAnchor ? null : (data.anchor || null);
  state.relationMode = state.anchorPassage ? (data.mode || mode) : 'fresh';
  state.relationLabel = data.relationLabel || '';

  renderArchivePassageCard(animate);
}

function renderArchivePassageCard(animate = false) {
  if (state.hasAiKey) return;
  renderStyleTuner();
  const p = state.currentPassage;
  if (!p) return;

  const card = $('passageCard');
  card.classList.remove('loading');

  const applyContent = () => {
    const relEl = $('passageRel');
    if (state.relationLabel) {
      relEl.textContent = state.relationLabel;
      relEl.classList.remove('hidden');
    } else {
      relEl.textContent = '';
      relEl.classList.add('hidden');
    }

    $('passageQuote').textContent = p.text;

    const srcEl = $('passageSource');
    srcEl.innerHTML = '';
    const srcText = document.createElement('span');
    srcText.textContent = `— ${p.source}`;
    const catBadge = document.createElement('span');
    catBadge.className = 'source-cat-badge';
    catBadge.textContent = formatCatLabel(p.cat);
    srcEl.append(srcText, catBadge);

    if ($('rightCardBtn')) $('rightCardBtn').classList.add('hidden');

    const hasAnchor = Boolean(state.anchorPassage);
    const isUserAnchor = Boolean(state.anchorPassage && state.anchorPassage.isUserText);

    // 1. 카드 내부 우하단 및 카드 터치: 다음(또는 첫) 문장으로 채택하는 주요 액션
    const isBlank = isManuscriptBlank();
    const triggerArchiveAdopt = () => {
      document.body.classList.remove('typing');
      quoteArchivePassage();
    };
    const triggerArchiveNext = () => {
      document.body.classList.remove('typing');
      fetchArchivePassage({
        mode: state.anchorPassage ? state.relationMode : 'fresh',
        clearAnchor: !state.anchorPassage,
        animate: true
      });
    };

    const bubbleInsertBtn = $('bubbleInsertBtn');
    if (bubbleInsertBtn) {
      bubbleInsertBtn.textContent = isBlank ? '+ 첫 문장으로 채택 ↵' : '+ 다음 문장으로 채택 ↵';
      bubbleInsertBtn.disabled = false;
      bubbleInsertBtn.onclick = e => {
        e.stopPropagation();
        triggerArchiveAdopt();
      };
    }

    // 2. 말풍선 아래 첫째 줄: 새 글귀 가져오는 그룹
    const btnsEl = $('passageBtns');
    btnsEl.innerHTML = '';

    const fetchGroup = document.createElement('div');
    fetchGroup.className = 'passage-control-group';

    const fetchLbl = document.createElement('span');
    fetchLbl.className = 'group-label';
    fetchLbl.textContent = '새 글귀';
    fetchGroup.appendChild(fetchLbl);

    const fetchOpts = document.createElement('div');
    fetchOpts.className = 'group-options';

    if (hasAnchor) {
      const relDefs = isUserAnchor
        ? [
            { mode: 'same_concept', label: '같은 결' },
            { mode: 'contra_concept', label: '반대 시선' }
          ]
        : [
            { mode: 'same_concept', label: '같은 결' },
            { mode: 'contra_concept', label: '반대 시선' },
            { mode: 'same_author', label: '같은 작가' }
          ];
      for (const r of relDefs) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `passage-btn${state.relationMode === r.mode ? ' active' : ''}`;
        b.textContent = r.label;
        b.onmousedown = ev => ev.preventDefault();
        b.onclick = e => {
          e.stopPropagation();
          document.body.classList.remove('typing');
          fetchArchivePassage({ mode: r.mode, animate: true });
        };
        fetchOpts.appendChild(b);
      }
    }

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'passage-btn';
    nextBtn.textContent = hasAnchor ? '무작위 ↻' : '다른 글귀 ↻';
    nextBtn.onmousedown = ev => ev.preventDefault();
    nextBtn.onclick = e => {
      e.stopPropagation();
      document.body.classList.remove('typing');
      fetchArchivePassage({ mode: 'fresh', clearAnchor: true, animate: true });
    };
    fetchOpts.appendChild(nextBtn);
    fetchGroup.appendChild(fetchOpts);
    btnsEl.appendChild(fetchGroup);

    // 3. 말풍선 아래 둘째 줄: 글귀 분야(카테고리) 선택 그룹핑 바
    const catBar = $('categoryGroupBar');
    if (catBar) {
      catBar.classList.remove('hidden');
      catBar.innerHTML = '';

      const catGroup = document.createElement('div');
      catGroup.className = 'passage-control-group';

      const catLbl = document.createElement('span');
      catLbl.className = 'group-label';
      catLbl.textContent = '글귀 분야';
      catGroup.appendChild(catLbl);

      const catOpts = document.createElement('div');
      catOpts.className = 'group-options';

      for (const cat of CATEGORIES) {
        const cBtn = document.createElement('button');
        cBtn.type = 'button';
        cBtn.className = `passage-btn${state.passageCategory === cat ? ' active' : ''}`;
        cBtn.textContent = formatCatLabel(cat);
        cBtn.onmousedown = ev => ev.preventDefault();
        cBtn.onclick = e => {
          e.stopPropagation();
          if (state.passageCategory === cat) return;
          document.body.classList.remove('typing');
          state.passageCategory = cat;
          fetchArchivePassage({
            mode: state.anchorPassage ? state.relationMode : 'fresh',
            clearAnchor: !state.anchorPassage,
            animate: true
          });
        };
        catOpts.appendChild(cBtn);
      }

      catGroup.appendChild(catOpts);
      catBar.appendChild(catGroup);
    }

    updatePassageDeckHeader();
    bindPassageBubbleInteractions({
      canAdopt: () => Boolean(state.currentPassage),
      onAdopt: triggerArchiveAdopt,
      onNext: triggerArchiveNext
    });
  };

  if (animate) {
    card.classList.add('switching');
    clearTimeout(card._swTimer);
    card._swTimer = setTimeout(() => {
      applyContent();
      card.classList.remove('switching');
    }, 120);
  } else {
    applyContent();
  }
}

async function quoteArchivePassage() {
  const p = state.currentPassage;
  if (!p) return;

  commitFirstLineInput({ triggerSave: false, triggerRecommend: false });
  const quoteBlock = `"${p.text}" — ${p.source}`;
  appendTextAsBlocks(quoteBlock);
  syncBlocksToEditor({ triggerSave: true });

  state.anchorPassage = p;
  resetRelationalSeen();
  await fetchArchivePassage({ mode: 'same_concept', anchor: p, animate: true });
}

// ============================================================================
// 자동 저장 & 수동 안심 저장
// ============================================================================
function scheduleSave() {
  clearTimeout(state.saveTimer);
  updateSaveStateIndicator('saving');
  state.saveTimer = setTimeout(() => {
    state.saveTimer = null;
    saveNow({ manual: false });
  }, 400);
}

async function saveNow({ manual = false } = {}) {
  clearTimeout(state.saveTimer);
  state.saveTimer = null;
  if (manual) flushPendingInputs();

  const w = getActiveWriting();
  if (!w) return;
  const content = $('editor').value;
  if (manual && !content.trim()) {
    toast('먼저 첫 문장을 작성해주세요');
    return;
  }
  w.content = content;

  if (manual) updateSaveStateIndicator('saving');

  const res = await apiFetch(`/api/writings/${w.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, crystals: w.crystals || [] })
  });
  if (res.ok) {
    const data = await res.json();
    const idx = state.writings.findIndex(item => item.id === w.id);
    if (idx !== -1) state.writings[idx] = data.writing;
    renderArchive();
    updateSaveStateIndicator(manual ? 'manual' : 'saved');
    if (manual) {
      const btn = $('saveNowBtn');
      if (btn) {
        btn.textContent = '저장됨 ✓';
        clearTimeout(btn._t);
        btn._t = setTimeout(() => { btn.textContent = '저장'; }, 1500);
      }
      toast('서재에 안전하게 갈무리되었습니다');
    }
  }
}

// ============================================================================
// 발행 화면: 문장 선별 + 끝문장 올리기 + Threads / X 분할 발행
// ============================================================================
function prepareDistillSegments() {
  const w = getActiveWriting();
  const rawLines = state.docBlocks.length > 0
    ? [...state.docBlocks]
    : $('editor').value.trim().split(/\n+/).map(s => s.trim()).filter(Boolean);

  const savedSet = new Set((w && Array.isArray(w.crystals)) ? w.crystals : []);

  state.hookInverted = false;
  state.segments = rawLines.map(text => ({
    text,
    picked: savedSet.has(text)
  }));
}

function getEffectiveDistillLines() {
  const picked = state.segments.filter(s => s.picked).map(s => s.text);
  const baseLines = picked.length > 0 ? picked : state.segments.map(s => s.text);
  if (state.hookInverted && baseLines.length >= 2) {
    return [baseLines[baseLines.length - 1], ...baseLines.slice(0, -1)];
  }
  return baseLines;
}

function savePickedCrystals() {
  const w = getActiveWriting();
  if (!w) return;
  w.crystals = state.segments.filter(s => s.picked).map(s => s.text);
  saveNow();
}

function splitTextForPlatform(rawText, limit) {
  const cleaned = (rawText || '').trim();
  if (!cleaned) return [];

  const paragraphs = cleaned.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  const chunks = [];
  let cur = '';

  for (const p of paragraphs) {
    if ((cur ? `${cur}\n\n${p}` : p).length <= limit) {
      cur = cur ? `${cur}\n\n${p}` : p;
    } else {
      if (cur) chunks.push(cur);
      if (p.length <= limit) {
        cur = p;
      } else {
        const sentences = p.split(/(?<=[.?!다요죠])\s+/);
        cur = '';
        for (const s of sentences) {
          if ((cur ? `${cur} ${s}` : s).length <= limit) {
            cur = cur ? `${cur} ${s}` : s;
          } else {
            if (cur) chunks.push(cur);
            cur = s;
          }
        }
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

const PUBLISH_SIGNATURE = '— ‘첫 문장’에서 영감을 받아 작성했어요';

function formatCard(text, idx, total) {
  const useNum = $('numToggle') && $('numToggle').checked;
  return useNum && total > 1 ? `${text.trim()}\n\n(${idx + 1}/${total})` : text.trim();
}

function renderDistillView() {
  const pickerSec = $('pickerSection');
  const pickerEl = $('sentencePicker');
  const pickedCount = state.segments.filter(s => s.picked).length;

  if (state.segments.length >= 2) {
    pickerSec.classList.remove('hidden');
    $('pickerGuide').textContent = pickedCount > 0
      ? `선택한 ${pickedCount}개 문장·문단만 아래 발행 카드로 묶였습니다`
      : '남길 문단만 탭하여 추려낼 수 있습니다 (지금은 전체 포함)';
    $('clearPicksBtn').classList.toggle('hidden', pickedCount === 0);

    pickerEl.innerHTML = '';
    state.segments.forEach(seg => {
      const div = document.createElement('div');
      div.className = `pick-line${seg.picked ? ' picked' : ''}`;
      div.textContent = seg.text;
      div.onclick = () => {
        seg.picked = !seg.picked;
        savePickedCrystals();
        renderDistillView();
      };
      pickerEl.appendChild(div);
    });
  } else {
    pickerSec.classList.add('hidden');
  }

  const activeLines = getEffectiveDistillLines();
  if (activeLines.length < 2 && state.hookInverted) {
    state.hookInverted = false;
  }
  const invBtn = $('invertHookBtn');
  if (invBtn) {
    invBtn.classList.toggle('hidden', activeLines.length < 2);
    invBtn.classList.toggle('active-toggle', Boolean(state.hookInverted));
    invBtn.textContent = state.hookInverted ? '원래 순서로 ↺' : '끝문장을 첫 줄로 ↑';
    invBtn.title = state.hookInverted
      ? '원래 작성한 문단 순서로 되돌립니다'
      : '마지막 결론 문단을 맨 첫 줄로 올립니다';
  }
  $('metaHint').textContent = pickedCount > 0 ? `${pickedCount}단락 발췌됨` : '전체 발행';

  const useSig = !$('sigToggle') || $('sigToggle').checked;
  const fullDistillText = useSig
    ? [...activeLines, PUBLISH_SIGNATURE].join('\n\n')
    : activeLines.join('\n\n');

  const limit = state.platform === 'threads' ? 500 : 280;
  const cards = splitTextForPlatform(fullDistillText, limit - 10);

  const list = $('publishList');
  list.innerHTML = '';

  cards.forEach((txt, i) => {
    const card = document.createElement('div');
    card.className = 'pub-card';

    const ta = document.createElement('textarea');
    ta.className = 'pub-textarea';
    ta.value = txt;

    const foot = document.createElement('div');
    foot.className = 'pub-foot';

    const countSpan = document.createElement('span');
    const updateCard = () => {
      autoResizeTextarea(ta);
      const len = ta.value.length;
      countSpan.textContent = cards.length > 1 ? `${i + 1}/${cards.length} · ${len}/${limit}` : `${len} / ${limit}`;
      countSpan.classList.toggle('over', len > limit);
    };
    ta.addEventListener('input', updateCard);

    const actions = document.createElement('div');
    actions.className = 'pub-actions';

    if (navigator.share) {
      const shareBtn = document.createElement('button');
      shareBtn.className = 'muted-btn';
      shareBtn.textContent = '공유';
      shareBtn.onclick = async () => {
        try { await navigator.share({ text: formatCard(ta.value, i, cards.length) }); } catch (_) {}
      };
      actions.appendChild(shareBtn);
    }

    const copyBtn = document.createElement('button');
    copyBtn.className = 'muted-btn';
    copyBtn.textContent = '복사';
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(formatCard(ta.value, i, cards.length));
      toast('복사됨');
    };

    const goBtn = document.createElement('button');
    goBtn.className = 'text-btn';
    goBtn.textContent = state.platform === 'threads' ? 'Threads로 발행 ↗' : 'X로 발행 ↗';
    goBtn.onclick = () => {
      const finalTxt = formatCard(ta.value, i, cards.length);
      navigator.clipboard.writeText(finalTxt).catch(() => {});
      const url = state.platform === 'threads'
        ? `https://www.threads.net/intent/post?text=${encodeURIComponent(finalTxt)}`
        : `https://twitter.com/intent/tweet?text=${encodeURIComponent(finalTxt)}`;
      window.open(url, '_blank', 'noopener');
    };

    actions.append(copyBtn, goBtn);
    foot.append(countSpan, actions);
    card.append(ta, foot);
    list.appendChild(card);

    requestAnimationFrame(updateCard);
  });

  if ($('numToggleWrap')) $('numToggleWrap').classList.toggle('hidden', cards.length <= 1);
  if ($('copyAllBtn')) $('copyAllBtn').classList.toggle('hidden', cards.length <= 1);
}

// ============================================================================
// 기록 시트
// ============================================================================
function renderArchive() {
  const list = $('archiveList');
  list.innerHTML = '';

  const visible = state.writings.filter(w => (w.content || '').trim() || w.id === state.activeId);
  for (const w of visible) {
    const el = document.createElement('div');
    el.className = `archive-item ${w.id === state.activeId ? 'active' : ''}`;

    const titleEl = document.createElement('span');
    titleEl.className = 'archive-title';
    titleEl.textContent = w.title || '빈 종이';

    const dateEl = document.createElement('span');
    dateEl.className = 'archive-date';
    dateEl.textContent = formatShortDate(w.created_date);

    el.append(titleEl, dateEl);
    el.addEventListener('click', () => {
      selectWriting(w.id);
      closeArchive();
    });
    list.appendChild(el);
  }
}

function openArchive() {
  renderArchive();
  renderUserSection();
  $('archiveSheet').classList.add('open');
  $('backdrop').classList.remove('hidden');
  document.body.classList.remove('typing');
}

function closeArchive() {
  $('archiveSheet').classList.remove('open');
  $('backdrop').classList.add('hidden');
}

// ============================================================================
// 이벤트 연결
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  init();

  const ed = $('editor');

  if ($('firstLineInput')) {
    const fInp = $('firstLineInput');
    fInp.addEventListener('focus', () => {
      syncFirstLineUi();
    });
    fInp.addEventListener('blur', () => {
      state.firstLineComposing = false;
      syncFirstLineUi();
    });
    fInp.addEventListener('compositionstart', () => {
      state.firstLineComposing = true;
      syncFirstLineUi();
    });
    fInp.addEventListener('compositionend', () => {
      state.firstLineComposing = false;
      syncFirstLineUi();
    });
    fInp.addEventListener('input', () => {
      autoResizeTextarea(fInp);
      syncFirstLineUi();
      bumpOpeningPassageIdleTimer(1500);
      if (state.docBlocks.length === 0 && ed) {
        ed.value = fInp.value.trim();
        updateWriteMeta();
        updatePassageDeckHeader();
        scheduleSave();
        if (state.hasAiKey) {
          scheduleAutoWeaveAfterEdit();
        } else {
          scheduleAutoArchiveAfterEdit();
        }
      }
      document.body.classList.add('typing');
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => document.body.classList.remove('typing'), 1800);
    });
    fInp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        commitFirstLineInput({ triggerSave: true, triggerRecommend: true });
        document.body.classList.remove('typing');
      }
    });
  }

  if ($('commitFirstLineBtn')) {
    $('commitFirstLineBtn').addEventListener('mousedown', e => e.preventDefault());
    $('commitFirstLineBtn').addEventListener('click', e => {
      e.stopPropagation();
      commitFirstLineInput({ triggerSave: true, triggerRecommend: true });
      document.body.classList.remove('typing');
    });
  }

  if ($('openComposeBtn')) {
    $('openComposeBtn').addEventListener('click', e => {
      e.stopPropagation();
      state.selectedBlockIdx = -1;
      state.editingBlockIdx = -1;
      renderSentenceCanvas();
      toggleDirectCompose(true);
    });
  }

  if ($('cancelComposeBtn')) {
    $('cancelComposeBtn').addEventListener('click', e => {
      e.stopPropagation();
      toggleDirectCompose(false);
      document.body.classList.remove('typing');
    });
  }

  if ($('submitComposeBtn')) {
    $('submitComposeBtn').addEventListener('click', e => {
      e.stopPropagation();
      submitDirectCompose();
      document.body.classList.remove('typing');
    });
  }

  if ($('composeInput')) {
    const cInp = $('composeInput');
    cInp.addEventListener('input', () => {
      autoResizeTextarea(cInp);
      document.body.classList.add('typing');
      clearTimeout(state.typingTimer);
      state.typingTimer = setTimeout(() => document.body.classList.remove('typing'), 1800);
    });
    cInp.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        submitDirectCompose();
        document.body.classList.remove('typing');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        toggleDirectCompose(false);
        document.body.classList.remove('typing');
      }
    });
  }

  $('mainCanvas').addEventListener('click', e => {
    if (state.mode === 'write' && (e.target === $('mainCanvas') || e.target === $('paper'))) {
      if (state.selectedBlockIdx !== -1 || state.editingBlockIdx !== -1) {
        state.selectedBlockIdx = -1;
        state.editingBlockIdx = -1;
        renderSentenceCanvas();
      }
    }
  });

  $('leftNavBtn').addEventListener('click', () => {
    if (state.mode === 'distill') {
      setMode('write');
    } else {
      openArchive();
    }
  });

  if ($('saveNowBtn')) {
    $('saveNowBtn').addEventListener('click', () => {
      if (state.mode === 'write') {
        saveNow({ manual: true });
      }
    });
  }

  $('rightNavBtn').addEventListener('click', () => {
    if (state.mode === 'write') {
      setMode('distill');
    }
  });

  $('backdrop').addEventListener('click', closeArchive);
  $('newBtn').addEventListener('click', createNewWriting);

  $('aiSettingBtn').addEventListener('click', () => {
    closeArchive();
    setMode('write');
    revealPassageCardImmediately();
    state.editingProvider = state.aiProvider || 'gemini';
    state.keyEditorOpen = true;
    renderAiKeyBanner();
    requestAnimationFrame(() => {
      const banner = $('aiKeyBanner');
      if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const inp = $('aiKeyInput');
      if (inp) inp.focus();
    });
  });

  $('updateDbBtn').addEventListener('click', async () => {
    const btn = $('updateDbBtn');
    const orig = btn.textContent;
    btn.textContent = '업데이트 중...';
    btn.disabled = true;
    try {
      const res = await apiFetch('/api/passages/update-now', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        state.passageCount = Number(data.totalCount || state.passageCount);
        updateDbCountLabel();
        toast(data.addedCount > 0
          ? `현대·고전 글귀 ${data.addedCount}선이 새로 추가되었습니다 (총 ${state.passageCount}선)`
          : `아카이브가 최신 상태입니다 (총 ${state.passageCount}선)`);
      } else {
        toast('글귀 업데이트 중 오류가 발생했습니다');
      }
    } catch (_) {
      toast('글귀 업데이트 실패');
    } finally {
      btn.textContent = orig;
      btn.disabled = false;
    }
  });

  $('clearPicksBtn').addEventListener('click', () => {
    state.segments.forEach(s => { s.picked = false; });
    savePickedCrystals();
    renderDistillView();
  });

  document.querySelectorAll('.plat-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.plat-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.platform = btn.dataset.plat;
      renderDistillView();
    });
  });

  $('invertHookBtn').addEventListener('click', () => {
    const picked = state.segments.filter(s => s.picked);
    const count = picked.length > 0 ? picked.length : state.segments.length;
    if (count < 2) return;

    state.hookInverted = !state.hookInverted;
    renderDistillView();
    toast(state.hookInverted ? '끝문장을 첫 줄로 올렸습니다' : '원래 문단 순서로 되돌렸습니다');
  });

  if ($('sigToggle')) {
    $('sigToggle').addEventListener('change', () => {
      renderDistillView();
    });
  }

  $('copyAllBtn').addEventListener('click', async () => {
    const tas = [...document.querySelectorAll('.pub-textarea')];
    const joined = tas.map((t, i) => formatCard(t.value, i, tas.length)).join('\n\n---\n\n');
    await navigator.clipboard.writeText(joined);
    toast('전체 복사됨');
  });

  $('themeBtn').addEventListener('click', async () => {
    const cur = localStorage.getItem('dw_theme_pref') || 'auto';
    const order = ['auto', 'light', 'dark'];
    const next = order[(order.indexOf(cur) + 1) % order.length];
    applyTheme(next);
    const toastMsg = {
      auto: '밤낮 시간에 맞춰 테마가 자동 전환됩니다 (06~19시 낮 · 19~06시 밤)',
      light: '밝은 종이(낮) 테마로 고정했습니다',
      dark: '어두운 서재(밤) 테마로 고정했습니다'
    };
    toast(toastMsg[next]);
    await apiFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next })
    });
  });

  $('lockBtn').addEventListener('click', async () => {
    if (!state.hasPin) {
      const pin = await showDialog({
        title: '서재 잠금 비밀번호 설정',
        sub: '다시 열 때 사용할 비밀번호를 입력해주세요.',
        inputPlaceholder: '비밀번호 입력',
        confirmText: '잠그기'
      });
      if (!pin || !pin.trim()) return;
      await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin_code: pin.trim() })
      });
      state.hasPin = true;
    }
    state.pin = '';
    sessionStorage.removeItem('dw_pin');
    state.docBlocks = [];
    syncBlocksToEditor();
    closeArchive();
    showLockScreen();
  });

  $('deleteBtn').addEventListener('click', async () => {
    if (!state.activeId) return;
    const ok = await showDialog({
      title: '현재 원고를 삭제할까요?',
      sub: '삭제된 종이는 복구할 수 없습니다.',
      confirmText: '삭제',
      danger: true
    });
    if (!ok) return;
    const id = state.activeId;
    await apiFetch(`/api/writings/${id}`, { method: 'DELETE' });
    state.writings = state.writings.filter(w => w.id !== id);
    toast('원고가 삭제되었습니다');
    if (state.writings.length > 0) {
      await selectWriting(state.writings[0].id);
      closeArchive();
    } else {
      await createNewWriting();
    }
  });

  window.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (state.mode === 'write') saveNow({ manual: true });
      return;
    }
    if (e.key === 'Escape') {
      closeArchive();
      if (state.mode === 'distill') setMode('write');
    }
  });
});
