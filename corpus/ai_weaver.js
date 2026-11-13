// 다중 AI 프로바이더 직조 엔진 (Gemini · OpenAI · Claude 지원)
// 1) 사용자의 현재 글(인용구·직전 문장·전체 흐름)과 말투(종결어미·호흡)를 정밀하게 읽어,
//    글을 처음 쓰는 보통 사람도 '내가 쓴 글 같다'고 느낄 만큼 자연스럽고 담백한 다음 1~2문장을 직조
// 2) 주기적 글귀 아카이브 업데이트 시 현대·고전 명문장 큐레이션 수행

const geminiModelCache = new Map();

async function resolveGeminiModels(apiKey) {
  const cached = geminiModelCache.get(apiKey);
  if (cached && Date.now() - cached.ts < 3600 * 1000) {
    return cached.models;
  }

  const fallbackOrder = [
    'models/gemini-2.5-flash',
    'models/gemini-2.0-flash',
    'models/gemini-flash-latest',
    'models/gemini-3-flash-preview'
  ];

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 400 || res.status === 403) throw new Error('INVALID_API_KEY');
      return fallbackOrder;
    }
    const data = await res.json();
    const list = Array.isArray(data.models) ? data.models : [];

    const usable = list
      .filter(m => {
        const name = String(m.name || '').toLowerCase();
        const methods = m.supportedGenerationMethods || [];
        if (!methods.includes('generateContent')) return false;
        if (!name.includes('gemini')) return false;
        if (/tts|image|imagen|embedding|aqa|audio|vision|robotics|computer-use|learnlm|veo|lyria/.test(name)) {
          return false;
        }
        return true;
      })
      .map(m => m.name);

    if (usable.length === 0) return fallbackOrder;

    const scoreModel = name => {
      const n = name.toLowerCase();
      let s = 0;
      if (n === 'models/gemini-2.5-flash') s += 100;
      else if (n === 'models/gemini-2.0-flash') s += 85;
      else if (n === 'models/gemini-flash-latest') s += 80;
      else if (n.includes('gemini-2.5') && n.includes('flash') && !n.includes('preview')) s += 70;
      else if (n.includes('gemini-3') && n.includes('flash')) s += 60;
      else if (n.includes('flash') && !n.includes('lite')) s += 45;
      else if (n.includes('pro') && !n.includes('preview')) s += 25;
      else if (n.includes('lite')) s += 15;
      return s;
    };

    usable.sort((a, b) => scoreModel(b) - scoreModel(a));
    const top = usable.slice(0, 4);
    geminiModelCache.set(apiKey, { models: top, ts: Date.now() });
    return top;
  } catch (err) {
    if (err.message === 'INVALID_API_KEY') throw err;
    return fallbackOrder;
  }
}

const QUOTE_BLOCK_RE = /^["“]([^"”]+)["”]\s*(?:—|--|―)\s*(.+)$/s;

function analyzeEditorContext(editorText = '') {
  const trimmedRight = String(editorText).replace(/[ \t]+$/g, '');
  if (!trimmedRight.trim()) {
    return {
      isEmpty: true,
      isIncomplete: false,
      endsWithQuote: false,
      paragraphs: [],
      earlierParagraphs: [],
      lastParagraph: '',
      lastSentence: '',
      lastChunk: '',
      quoteInfo: null,
      styleHint: '담백하고 자연스러운 평서체(~다)'
    };
  }

  const clean = trimmedRight.trim();
  const paragraphs = clean
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const lastParagraph = paragraphs[paragraphs.length - 1] || clean;
  const earlierParagraphs = paragraphs.slice(0, -1);

  // 종결어미 감지는 인용구를 제외한 사용자가 직접 쓴 문장을 우선 반영
  const nonQuoteLines = clean
    .split(/\n+/)
    .map(l => l.trim())
    .filter(l => l && !QUOTE_BLOCK_RE.test(l));
  const sampleForEnding = nonQuoteLines.length > 0 ? nonQuoteLines.join(' ') : clean;

  const politeMatches = (sampleForEnding.match(/(습니다|ㅂ니다|해요|예요|네요|군요|까요|죠|어요|아요)[.?!]?(?=\s|$)/g) || []).length;
  const plainMatches = (sampleForEnding.match(/(다|는다|았다|었다|였다|리라|구나|던가)[.?!]?(?=\s|$)/g) || []).length;
  const styleHint = politeMatches > plainMatches
    ? '다정하고 자연스러운 경어체(~요 / ~습니다)'
    : '담백하고 솔직한 평서체(~다)';

  const quoteMatch = lastParagraph.match(QUOTE_BLOCK_RE);
  const endsWithQuote = Boolean(quoteMatch);
  const quoteInfo = quoteMatch
    ? { text: quoteMatch[1].trim(), source: quoteMatch[2].trim() }
    : null;

  const hasTrailingNewline = /\n$/.test(trimmedRight);
  const lastChunk = clean.split(/\n/).pop().trim();
  const isComplete = endsWithQuote
    || hasTrailingNewline
    || /[.?!…"”'’)\]]$/.test(lastChunk)
    || /(다|요|죠|네|군|구나|까|랴|마|자|음|함|됨|끝)$/.test(lastChunk);

  const sentences = lastParagraph
    .split(/(?<=[.?!])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const lastSentence = sentences[sentences.length - 1] || lastChunk;

  return {
    isEmpty: false,
    isIncomplete: !isComplete && lastChunk.length >= 3,
    endsWithQuote,
    paragraphs,
    earlierParagraphs,
    lastParagraph,
    lastSentence,
    lastChunk,
    quoteInfo,
    styleHint
  };
}

const DIRECTION_GUIDES = {
  opening: `[방향: 첫 문장 물꼬 트기]
아직 빈 종이입니다. 글을 처음 써보는 사람도 "어, 나도 평소 이런 생각 해본 적 있는데" 하며 부담 없이 첫 단락으로 삼을 수 있도록, 일상 속의 친숙한 순간이나 솔직한 마음에서 출발하는 자연스러운 첫 1~2문장을 써주세요.`,

  reson: `[방향: 공명 · 자연스럽게 생각 잇기]
지금까지 적힌 글의 마지막 문장(또는 방금 인용한 글귀)의 구체적인 단어와 감정선을 그대로 이어받아, 글쓴이 본인이 바로 다음 줄에 솔직하게 덧붙일 법한 자연스러운 다음 문장을 써주세요.`,

  contra: `[방향: 반론 · 다른 각도에서 돌아보기]
방금까지 적은 생각의 흐름을 그대로 이어받되, "하지만 다시 생각해보면", "어쩌면 반대로" 하고 스스로에게 솔직하게 되묻거나 다른 각도에서 마음을 짚어보는 자연스러운 다음 문장을 써주세요.`,

  scene: `[방향: 비유 · 일상적인 장면으로 풀기]
추상적인 설명 대신, 지금 본문에 적힌 생각과 자연스럽게 이어지는 소소한 일상 장면(창밖 풍경, 걷던 길, 손끝의 감촉, 스쳐 간 하루의 순간 등)을 떠올리며 쉽게 풀어내는 다음 문장을 써주세요.`,

  close: `[방향: 매듭 · 담백하게 마무리하기]
지금까지 본문에 적힌 이야기들을 거창한 교훈이나 다짐 없이, 오늘 하루의 솔직한 마음 한 줄로 조용하고 담백하게 여미는 마무리 문장을 써주세요.`
};

const STYLE_TONE_GUIDES = {
  simple: '일상·담백 (글을 처음 써보는 보통 사람이 일기나 메모에 자기 생각을 솔직하게 적듯, 꾸밈없는 일상어와 짧은 단문 위주로 소박하고 담백하게 작성. 문학적 과장이나 어려운 한자어를 일절 쓰지 말 것)',
  lyrical: '차분한 산문 (어려운 개념어나 과장된 비유는 피하고, 일상 속의 감정과 여운을 잔잔하고 따뜻한 에세이 어조로 자연스럽게 작성)',
  pedantic: '깊은 사유 (일상적인 문장 호흡을 해치지 않으면서도, 생각의 이유나 이면을 한 겹 더 차분하게 짚어보는 지적인 산문 어조로 작성. 단, 억지스러운 번역투나 현학적인 말장난은 피할 것)'
};

const STYLE_LENGTH_GUIDES = {
  short: {
    rule: '반드시 단 1문장(공백 포함 25~55자 내외)으로, 군더더기 없이 짧고 명료한 한 줄로만 작성하세요.',
    ask: '짧고 담백한 1문장(25~55자)',
    maxSentences: 1
  },
  medium: {
    rule: '반드시 짧은 1~2문장(공백 포함 50~95자 내외)으로 작성하세요. 한 문장이 길어지지 않게 단문으로 끊어 보통 사람이 툭 적어 내려간 듯 부담 없이 읽히게 하세요.',
    ask: '짧고 자연스러운 1~2문장(50~95자)',
    maxSentences: 2
  },
  long: {
    rule: '반드시 2~3문장(공백 포함 95~145자 내외)으로 작성하되, 긴 복문 대신 읽기 편한 짧은 문장들로 자연스럽게 이어 쓰세요.',
    ask: '자연스러운 2~3문장(95~145자)',
    maxSentences: 3
  }
};

function trimToSentenceLimit(text = '', maxSentences = 2) {
  const clean = String(text).replace(/\s*\n+\s*/g, ' ').trim();
  if (!clean) return '';
  const parts = clean
    .split(/(?<=[.?!…])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  if (parts.length <= maxSentences) return clean;
  return parts.slice(0, maxSentences).join(' ');
}

function buildSystemInstruction(styleOptions = {}) {
  const toneKey = STYLE_TONE_GUIDES[styleOptions.tone] ? styleOptions.tone : 'simple';
  const lenKey = STYLE_LENGTH_GUIDES[styleOptions.length] ? styleOptions.length : 'medium';
  const toneRule = STYLE_TONE_GUIDES[toneKey];
  const lenRule = STYLE_LENGTH_GUIDES[lenKey].rule;

  return `당신은 글을 처음 써보는 평범한 사람이 자기 생각을 막힘없이 이어 쓸 수 있도록 돕는 '글쓰기 동반자'입니다.
거창한 작가나 철학 교수처럼 화려하고 장황하게 대신 써주는 것이 아니라, 사용자가 이미 적은 문장 바로 뒤에 붙여 넣었을 때 "내가 직접 쓴 것처럼 자연스럽다"고 느낄 만한 소박하고 솔직한 다음 한 호흡만 제안합니다.

반드시 지켜야 할 핵심 원칙:
1. 앞 내용과의 완벽한 연결 (최우선):
   - 본문에 이미 적힌 마지막 문장(또는 방금 인용한 글귀)의 구체적인 단어, 소재, 감정선을 그대로 이어받아 바로 다음 문장을 쓰세요.
   - 앞 문장과 상관없는 뜬금없는 소재나 다른 주제로 갑자기 점프하지 마세요.
   - 본문에 여러 문단이 있다면 앞 문단들의 맥락과 마지막 문단이 자연스럽게 하나로 이어지게 쓰세요.
2. 보통 사람의 자연스러운 일상어 (장황함·현학성 절대 금지):
   - 글을 처음 쓰는 사람이 일기나 짧은 에세이에 적을 법한 쉽고 평범한 우리말 단문으로 쓰세요.
   - 금지 어휘: "영혼", "실존", "존재론적", "형이상학", "심연", "미궁", "사유의 지평", "고찰", "비로소", "참된", "침잠", "투영", "변증법", "관념", "숭고한", "근원적", "퇴적층" 같은 무겁고 과장된 문학·철학 클리셰 단어를 절대 쓰지 마세요.
   - 금지 어투: "~하는 것이다", "~에 다름 아니다", "~라고 할 수 있다" 같은 딱딱한 번역투·설명문 어투와 "화이팅", "중요한 것은 마음가짐입니다" 같은 상투적 훈계를 절대 쓰지 마세요.
3. 본문 내 사상가·책 이름 직접 언급 금지:
   - 본문(paragraph) 안에 "장자는 말했다", "카뮈의 시지프처럼" 식으로 작가나 책 이름을 직접 넣어 설명하지 마세요.
   - 영감을 얻은 고전·현대 작가와 작품명은 오직 JSON의 "inspiration"과 "author" 필드에 출처로만 남기고, 본문 문장은 온전히 글쓴이 자신의 일상적인 생각으로만 적으세요.
4. 분량 및 문체 엄수:
   - 분량: ${lenRule} 절대 여러 문단으로 나누지 마세요.
   - 문체: ${toneRule}
5. 반드시 순수 JSON 객체로만 응답하세요 (코드 블록 없이):
{
  "paragraph": "본문에 바로 이어 붙일 자연스럽고 담백한 문장 (줄바꿈 없이)",
  "quote": "배경에 참고한 작품·사상가의 실제 원문 발췌 1문장 (본문에 이미 적힌 인용구와 겹치지 않는 새로운 글귀가 있을 때만 작성, 없으면 빈 문자열)",
  "source": "발췌 출처 정보 (quote가 비어 있으면 빈 문자열, 있을 때만 예: 김소연, 《마음사전》)",
  "inspiration": "배경에 참고한 작가·작품과 짧은 모티프 (예: 김소연 《마음사전》 · 흔들리며 버티는 마음)",
  "author": "참고한 작가/출전 이름 (예: 김소연)"
}`;
}

function parseJsonResponse(rawText) {
  const cleaned = String(rawText || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  const jsonSlice = (firstBrace !== -1 && lastBrace > firstBrace)
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;
  return JSON.parse(jsonSlice);
}

// 1) Gemini 호출
async function callGemini(apiKey, systemPrompt, userPrompt) {
  const cleanKey = apiKey.trim();
  const models = await resolveGeminiModels(cleanKey);
  let lastErr = null;

  for (const modelName of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(cleanKey)}`;
      const genConfig = {
        temperature: 0.75,
        responseMimeType: 'application/json'
      };
      if (modelName.includes('gemini-2.5-flash')) {
        genConfig.thinkingConfig = { thinkingBudget: 0 };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: genConfig
        })
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(errBody)) {
          throw new Error('INVALID_API_KEY');
        }
        if (res.status === 403) throw new Error('INVALID_API_KEY');
        lastErr = new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 140)}`);
        continue;
      }

      const data = await res.json();
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const rawText = parts
        .filter(p => !p.thought && typeof p.text === 'string')
        .map(p => p.text)
        .join('')
        .trim();

      if (!rawText) {
        lastErr = new Error('Empty response from Gemini');
        continue;
      }

      const parsed = parseJsonResponse(rawText);
      const reordered = [modelName, ...models.filter(m => m !== modelName)];
      geminiModelCache.set(cleanKey, { models: reordered, ts: Date.now() });

      return { parsed, model: modelName.replace(/^models\//, '') };
    } catch (err) {
      if (err.message === 'INVALID_API_KEY') throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('Gemini 응답 실패');
}

// 2) OpenAI 호출
async function callOpenAI(apiKey, systemPrompt, userPrompt) {
  const models = ['gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini'];
  let lastErr = null;

  for (const model of models) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey.trim()}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.75,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        if (res.status === 401) throw new Error('INVALID_API_KEY');
        lastErr = new Error(`OpenAI HTTP ${res.status}: ${errBody.slice(0, 140)}`);
        continue;
      }

      const data = await res.json();
      const rawText = data?.choices?.[0]?.message?.content || '';
      return { parsed: parseJsonResponse(rawText), model };
    } catch (err) {
      if (err.message === 'INVALID_API_KEY') throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('OpenAI 응답 실패');
}

// 3) Anthropic Claude 호출
async function callClaude(apiKey, systemPrompt, userPrompt) {
  const models = [
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-latest',
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest'
  ];
  let lastErr = null;

  for (const model of models) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey.trim(),
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 500,
          temperature: 0.75,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        })
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        if (res.status === 401 || res.status === 403) throw new Error('INVALID_API_KEY');
        lastErr = new Error(`Claude HTTP ${res.status}: ${errBody.slice(0, 140)}`);
        continue;
      }

      const data = await res.json();
      const rawText = (data?.content || [])
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('')
        .trim();

      return { parsed: parseJsonResponse(rawText), model };
    } catch (err) {
      if (err.message === 'INVALID_API_KEY') throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('Claude 응답 실패');
}

async function callProvider(provider, apiKey, systemPrompt, userPrompt) {
  if (!apiKey || !apiKey.trim()) throw new Error('NO_API_KEY');
  if (provider === 'openai') return callOpenAI(apiKey, systemPrompt, userPrompt);
  if (provider === 'claude') return callClaude(apiKey, systemPrompt, userPrompt);
  return callGemini(apiKey, systemPrompt, userPrompt);
}

async function verifyProviderKey(provider, apiKey) {
  const cleanKey = String(apiKey || '').trim();
  if (!cleanKey) throw new Error('EMPTY_KEY');

  if (provider === 'gemini') {
    const models = await resolveGeminiModels(cleanKey);
    return models[0] || 'gemini-flash';
  }

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { 'Authorization': `Bearer ${cleanKey}` }
    });
    if (!res.ok) throw new Error('INVALID_API_KEY');
    return 'gpt-4o';
  }

  if (provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': cleanKey,
        'anthropic-version': '2023-06-01'
      }
    });
    if (!res.ok) throw new Error('INVALID_API_KEY');
    return 'claude-sonnet';
  }

  throw new Error('UNKNOWN_PROVIDER');
}

async function weaveNextParagraph({
  provider = 'gemini',
  apiKey,
  direction = 'reson',
  editorText = '',
  avoidAuthors = [],
  styleOptions = {},
  currentDraft = null
}) {
  const ctx = analyzeEditorContext(editorText);
  const effectiveDir = ctx.isEmpty ? 'opening' : (DIRECTION_GUIDES[direction] ? direction : 'reson');
  const dirPrompt = DIRECTION_GUIDES[effectiveDir];

  const toneKey = STYLE_TONE_GUIDES[styleOptions.tone] ? styleOptions.tone : 'simple';
  const lenKey = STYLE_LENGTH_GUIDES[styleOptions.length] ? styleOptions.length : 'medium';
  const lenCfg = STYLE_LENGTH_GUIDES[lenKey];
  const endingKey = ['auto', 'plain', 'polite'].includes(styleOptions.ending) ? styleOptions.ending : 'auto';

  const endingHint = endingKey === 'plain'
    ? '반드시 간결하고 자연스러운 평서체(~다 / ~는다 / ~였다) 어미로 통일'
    : endingKey === 'polite'
      ? '반드시 다정하고 차분한 경어체(~요 / ~습니다 / ~네요) 어미로 통일'
      : ctx.styleHint;

  const hasCurrentDraft = Boolean(currentDraft && currentDraft.paragraph);
  const avoidLine = (!hasCurrentDraft && Array.isArray(avoidAuthors) && avoidAuthors.length > 0)
    ? `\n- 직전에 참고했으니 피해야 할 작가: ${avoidAuthors.slice(-8).join(', ')}`
    : '';

  let userPrompt = `${dirPrompt}

[문체·분량 설정]
- 말투·농도: ${STYLE_TONE_GUIDES[toneKey]}
- 분량·호흡: ${lenCfg.rule}
- 종결 어미: ${endingHint}${avoidLine}
`;

  if (hasCurrentDraft) {
    userPrompt += `
[문체 재조율 대상 (기존 제안 문장 — 핵심 내용과 출전은 그대로 유지할 것)]
- 기존 문장: """${currentDraft.paragraph}"""
- 기존 영감 출처(inspiration): ${currentDraft.inspiration || ''}
- 기존 작가(author): ${currentDraft.author || ''}

지침: 사용자가 다른 글귀를 요청한 것이 아니라, 위 [기존 문장]의 **문체(농도·길이·어미)만 변경**했습니다.
따라서 기존 출처(${currentDraft.inspiration || currentDraft.author || '동일 출처'})와 핵심 뜻은 그대로 유지한 채, 위 [문체·분량 설정](${lenCfg.ask}, ${endingHint})에 맞춰 더 자연스럽고 간결한 보통 사람의 말투로만 다듬어 주세요.`;
  } else if (ctx.isEmpty) {
    userPrompt += `\n현재 본문은 비어 있습니다. 글을 처음 써보는 사람이 읽자마자 자기 이야기를 이어 적고 싶어지는 소박하고 솔직한 첫 ${lenCfg.ask}을(를) 제안해 주세요.`;
  } else if (ctx.isIncomplete) {
    userPrompt += `
[현재까지 사용자가 작성한 본문]
"""
${editorText}
"""

[미완성 마지막 어구]
"${ctx.lastChunk}"

중요 지침: 사용자의 마지막 구절("${ctx.lastChunk}")이 아직 문장으로 끝나지 않았습니다.
사용자가 이미 쓴 단어를 중복해서 반복하지 말고, 저 마지막 어구 바로 뒤에 이어 붙였을 때 자연스러운 문장이 완성되도록 ${lenCfg.ask} 분량으로 소박하게 이어 써 주세요.`;
  } else if (ctx.endsWithQuote && ctx.quoteInfo) {
    const priorContextBlock = ctx.earlierParagraphs.length > 0
      ? `\n[인용구 앞에 적힌 본문 흐름]\n"""\n${ctx.earlierParagraphs.join('\n\n')}\n"""\n`
      : '';
    userPrompt += `${priorContextBlock}
[방금 본문 끝에 인용된 글귀 (이 글귀 바로 아래에 이어질 내 생각을 써야 함)]
"${ctx.quoteInfo.text}" — ${ctx.quoteInfo.source}

중요 지침:
1. 사용자가 위 인용구를 본문에 적어 두었습니다. 절대 또 다른 외부 철학자나 낯선 비유를 새로 끌어오지 마세요!
2. 위 인용구 속의 구체적인 단어와 뜻(그리고 앞서 적힌 본문 흐름이 있다면 그 맥락까지)을 그대로 이어받아, 보통 사람이 이 글귀를 읽고 자기 일상이나 솔직한 마음을 돌아보며 적을 법한 ${lenCfg.ask}을(를) 평범하고 담백한 1인칭 일상어로 써 주세요.
3. "quote"에는 방금 본문에 인용된 위 글귀를 절대 다시 반복하지 마세요(새로운 원문 발췌가 없다면 "quote"와 "source"는 빈 문자열 ""로 두세요).
4. "inspiration"에는 방금 인용된 "${ctx.quoteInfo.source}"와 연결된 핵심 주제를 적어 주세요.`;
  } else {
    const priorContextBlock = ctx.earlierParagraphs.length > 0
      ? `\n[앞선 문단 흐름]\n"""\n${ctx.earlierParagraphs.join('\n\n')}\n"""\n`
      : '';
    userPrompt += `${priorContextBlock}
[직전 마지막 문단 (가장 중요 — 이 문장 바로 다음에 이어 붙일 것)]
"""
${ctx.lastParagraph}
"""
- 마지막 문장: "${ctx.lastSentence}"

중요 지침:
1. 반드시 위 [마지막 문장]("${ctx.lastSentence}")의 주어, 구체적인 단어, 감정선을 그대로 이어받아 바로 다음 줄에 올 ${lenCfg.ask}을(를) 써 주세요.
2. 앞 문장과 동떨어진 새로운 문학 비유(미궁, 심연 등)나 현학적인 설명으로 갑자기 화제를 돌리지 마세요.
3. 방금 앞 문장을 쓴 바로 그 사람이 숨을 한 번 고르고 자기 생각을 솔직하고 소박하게 이어 적은 것처럼 읽혀야 합니다.`;
  }

  const { parsed, model } = await callProvider(provider, apiKey, buildSystemInstruction(styleOptions), userPrompt);
  const rawParagraph = String(parsed.paragraph || '').replace(/\s*\n+\s*/g, ' ').trim();
  const paragraph = trimToSentenceLimit(rawParagraph, lenCfg.maxSentences);
  if (!paragraph) throw new Error('빈 문단이 반환되었습니다.');

  const rawQuote = (hasCurrentDraft && currentDraft.quote !== undefined)
    ? String(currentDraft.quote || '')
    : String(parsed.quote || '');
  let cleanQuote = rawQuote
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/^["“]+|["”]+$/g, '')
    .trim();

  let cleanSource = (hasCurrentDraft && currentDraft.source !== undefined)
    ? String(currentDraft.source || '').trim()
    : String(parsed.source || parsed.author || '').trim();

  // 본문에 이미 들어간 글귀와 동일하거나 중복되는 경우 원문 발췌 추천에서 제외
  if (cleanQuote) {
    const norm = s => String(s || '').replace(/["“”'’\s.,!?…—―-]+/g, '');
    const nQuote = norm(cleanQuote);
    const nEditor = norm(editorText);
    const nLastQuote = ctx.quoteInfo ? norm(ctx.quoteInfo.text) : '';
    if (
      (nEditor && nQuote.length >= 6 && nEditor.includes(nQuote.slice(0, Math.min(18, nQuote.length)))) ||
      (nLastQuote && (nQuote === nLastQuote || nLastQuote.includes(nQuote) || nQuote.includes(nLastQuote)))
    ) {
      cleanQuote = '';
      cleanSource = '';
    }
  }

  return {
    paragraph,
    quote: cleanQuote,
    source: cleanSource,
    inspiration: hasCurrentDraft && currentDraft.inspiration
      ? currentDraft.inspiration
      : String(parsed.inspiration || parsed.author || '').trim(),
    author: hasCurrentDraft && currentDraft.author
      ? currentDraft.author
      : String(parsed.author || '').trim(),
    direction: effectiveDir,
    appendMode: ctx.isEmpty ? 'start' : (ctx.isIncomplete ? 'inline' : 'paragraph'),
    provider,
    model
  };
}

// 주기적 글귀 DB 업데이트용 AI 큐레이션 (현대 문학·산문·철학 + 동서고금 명문장 발굴)
async function curatePassagesBatchWithAI({ provider = 'gemini', apiKey, existingAuthors = [] }) {
  const sys = `당신은 동서고금의 고전과 20~21세기 현대 문학·에세이·철학·과학산문을 망라하는 문장 아카이브 큐레이터입니다.
글쓰기를 시작하려는 사람들에게 깊은 공감과 생각거리를 던져주는 실제 명문장 6개를 엄선해 JSON으로 반환하세요.
너무 길거나 난해한 번역투 문장은 피하고, 짧고 명료하며 여운이 깊은 1~2문장(40~95자 내외)을 우선 선정하세요.
최소 절반(3개 이상)은 현대 작가·사상가(예: 한강, 신형철, 김소연, 김연수, 김영하, 김애란, 최은영, 황정은, 이슬아, 수전 손택, 조앤 디디온, 리베카 솔닛, 어슐러 르 귄, 테드 창, 카를로 로벨리, 올리버 색스, 가즈오 이시구로, 레이먼드 카버, 알랭 드 보통, 롤랑 바르트, 한병철 등)로 구성하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "passages": [
    {
      "cat": "문학" | "철학" | "경전",
      "author": "작가명",
      "source": "작가명, 《작품명》",
      "text": "한국어 발췌 문장 (짧고 명료한 1~2문장)",
      "tags": "관련주제어1|주제어2|주제어3|주제어4"
    }
  ]
}`;

  const sampleAvoid = existingAuthors.slice(-15).join(', ');
  const user = `최근 자주 등장한 작가(${sampleAvoid || '장자, 노자'}) 외에 일상과 맞닿아 있으면서도 생각이 깊어지는 짧은 현대 및 고전 문장 6개를 선정해 주세요.`;
  const { parsed } = await callProvider(provider, apiKey, sys, user);
  return Array.isArray(parsed.passages) ? parsed.passages : [];
}

module.exports = {
  weaveNextParagraph,
  verifyProviderKey,
  curatePassagesBatchWithAI
};
