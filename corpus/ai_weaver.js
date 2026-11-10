// 다중 AI 프로바이더 직조 엔진 (Gemini · OpenAI · Claude 지원)
// 1) 사용자의 현재 글과 문체(종결어미·호흡)에 맞춰 다음 한 호흡(2~3문장)을 직조
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

function detectSentenceEndingState(editorText = '') {
  const trimmedRight = String(editorText).replace(/[ \t]+$/g, '');
  if (!trimmedRight.trim()) {
    return { isEmpty: true, isIncomplete: false, styleHint: '담백하고 차분한 에세이 평어체(~다)' };
  }

  const clean = trimmedRight.trim();
  const politeMatches = (clean.match(/(습니다|ㅂ니다|해요|예요|네요|군요|까요|죠)[.?!]?(?=\s|$)/g) || []).length;
  const plainMatches = (clean.match(/(다|는다|았다|었다|였다|리라|구나|던가)[.?!]?(?=\s|$)/g) || []).length;
  const styleHint = politeMatches > plainMatches
    ? '부드럽고 차분한 경어체(~요 / ~습니다)'
    : '간결하고 밀도 있는 에세이 평어체(~다)';

  if (/\n$/.test(trimmedRight)) {
    return { isEmpty: false, isIncomplete: false, styleHint };
  }
  const lastChunk = clean.split(/\n/).pop().trim();
  const isComplete = /[.?!…"”'’)\]]$/.test(lastChunk)
    || /(다|요|죠|네|군|구나|까|랴|마|자|음|함|됨|끝)$/.test(lastChunk);

  return {
    isEmpty: false,
    isIncomplete: !isComplete && lastChunk.length >= 4,
    lastChunk,
    styleHint
  };
}

const DIRECTION_GUIDES = {
  opening: `아직 백지 상태인 노트의 첫 물꼬를 여는 단락입니다.
동서양 고전 철학부터 현대 철학·에세이·문학(장자·노자·스토아·몽테뉴·니체·시몬 베유·벤야민·한병철·수전 손택·조앤 디디온·리베카 솔닛·카프카·릴케·카뮈·페소아·프루스트·울프·칼비노·카를로 로벨리·테드 창·윤동주·김훈·박완서·한강·신형철·김소연·김연수 등) 중 한 작품의 통찰이나 인상을 자연스럽게 녹여, 읽자마자 자기 이야기를 이어 쓰고 싶어지는 2~3문장의 첫 단락을 써주세요.`,

  reson: `[방향: 공명 · 깊이 잇기]
지금까지 사용자가 쓴 생각의 결에 깊이 공명하면서, 동서고금과 현대의 철학·종교·문학·산문 유산 중 그 생각과 가장 잘 맞닿는 사상가나 작가의 통찰을 에세이 문장 속에 자연스럽게 용해시켜 사유를 한 뼘 더 깊게 확장하는 다음 2~3문장을 써주세요.`,

  contra: `[방향: 반론 · 시선 뒤집기]
지금까지 사용자가 쓴 흐름에 생산적인 균열과 긴장을 만들어 주세요. 정반대 철학적 극점이나 다른 시선을 가진 고전·현대 사상가·작가의 관점을 빌려("하지만 다른 쪽에서 보면—", "반면 ~는 정반대의 질문을 던진다" 등 자연스러운 전환으로) 생각의 이면을 찌르는 다음 2~3문장을 써주세요.`,

  scene: `[방향: 비유 · 문학적 장면]
글이 추상적인 관념에 머물지 않도록, 고전 및 현대 문학·에세이·과학 산문 속 구체적인 한 장면이나 생생한 은유를 끌어와 감각적으로 풀어내는 다음 2~3문장을 써주세요.`,

  close: `[방향: 매듭 · 수렴]
지금까지 본문에 쌓인 생각과 갈등을 조용히 여미며, 사용자가 자기 삶에 가져갈 수 있는 단단하고 여운 있는 결론 단락(2문장 내외)으로 착지시켜 주세요. 훈계나 교훈조는 피하고 담백한 성찰로 마무리하세요.`
};

const STYLE_TONE_GUIDES = {
  simple: '심플·담백 (수식어와 현학적인 표현을 덜어내고, 일상적이고 명료한 단문 위주로 담백하게 작성. 사상가 이름을 본문에 직접 나열하기보다 통찰의 알맹이만 쉬운 언어로 녹여낼 것 — 헤밍웨이·김훈·레이먼드 카버 결)',
  lyrical: '서정·은유 (감각적인 비유와 문학적 심상, 여운 있는 리듬이 살아 있는 에세이 문체로 작성 — 한강·김소연·카뮈·릴케 결)',
  pedantic: '현학·사유 (철학적·문학적 개념어와 정교한 복문, 지적인 밀도와 사유의 깊이를 한껏 끌어올린 비평 산문 문체로 작성 — 벤야민·수전 손택·롤랑 바르트·신형철 결)'
};

const STYLE_LENGTH_GUIDES = {
  short: {
    rule: '반드시 단 1문장(공백 포함 45~85자 내외), 아포리즘처럼 밀도 있게 응축된 한 줄로만 작성하세요.',
    ask: '1문장(한 줄 호흡)'
  },
  medium: {
    rule: '반드시 한 문단, 2~3문장(공백 포함 110~190자 내외)으로 작성하세요.',
    ask: '2~3문장(보통 호흡)'
  },
  long: {
    rule: '호흡이 끊기지 않고 사유가 충분히 펼쳐지도록 한 문단, 3~4문장(공백 포함 210~310자 내외)으로 작성하세요.',
    ask: '3~4문장(긴 호흡)'
  }
};

function buildSystemInstruction(styleOptions = {}) {
  const toneKey = STYLE_TONE_GUIDES[styleOptions.tone] ? styleOptions.tone : 'lyrical';
  const lenKey = STYLE_LENGTH_GUIDES[styleOptions.length] ? styleOptions.length : 'medium';
  const toneRule = STYLE_TONE_GUIDES[toneKey];
  const lenRule = STYLE_LENGTH_GUIDES[lenKey].rule;

  return `당신은 동서고금의 고전부터 동시대 현대 문학·철학·산문까지 폭넓게 꿰뚫고 있는 에세이 공동 집필자입니다.
글쓰기를 어떻게 시작하고 이어갈지 막막해하는 사용자가 한 단락씩 글을 지어 나갈 때, 당신은 전체 글을 대신 써버리지 않고 딱 '다음 한 호흡'만 직조해 제안합니다. 사용자는 당신의 문단을 본문에 이어 붙인 뒤 자기 말투와 의도에 맞게 직접 고쳐 쓰며 글을 완성합니다.

반드시 지켜야 할 집필 원칙:
1. 분량 엄수: ${lenRule} 절대 여러 문단으로 나누지 마세요.
2. 문장 결·농도: ${toneRule}
3. 인용이 아닌 '용해': 교과서처럼 「OO는 "..."라고 말했다」만 딱딱하게 나열하지 마세요. 사상가·작가의 핵심 사유나 구절을 산문 흐름 속에 자연스럽게 녹여 쓰세요.
4. 고전과 현대의 조화: 고대·근대 고전뿐 아니라 20~21세기 현대 철학자·작가·에세이스트의 실재하는 작품과 사유도 적극 활용하세요. 없는 구절을 지어내지 마세요.
5. 상투적 자기계발 어투 금지: "화이팅", "중요한 것은 마음가짐입니다", "당신도 할 수 있습니다" 같은 진부한 위로를 절대 쓰지 마세요.
6. 반드시 순수 JSON 객체로만 응답하세요 (코드 블록 없이):
{
  "paragraph": "본문에 바로 이어 붙일 텍스트 (줄바꿈 없이 한 단락)",
  "inspiration": "길어온 작가와 작품 및 핵심 모티프 요약 (예: 조앤 디디온 《자존감에 관하여》 · 자기 자신과의 화해)",
  "author": "핵심 언급 작가/출전 이름 (예: 조앤 디디온)"
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
        temperature: 0.85,
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
      // 성공한 모델을 최우선 순위로 캐시 갱신
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
          temperature: 0.85,
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
          max_tokens: 600,
          temperature: 0.85,
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
  const stateInfo = detectSentenceEndingState(editorText);
  const effectiveDir = stateInfo.isEmpty ? 'opening' : (DIRECTION_GUIDES[direction] ? direction : 'reson');
  const dirPrompt = DIRECTION_GUIDES[effectiveDir];

  const toneKey = STYLE_TONE_GUIDES[styleOptions.tone] ? styleOptions.tone : 'lyrical';
  const lenKey = STYLE_LENGTH_GUIDES[styleOptions.length] ? styleOptions.length : 'medium';
  const endingKey = ['auto', 'plain', 'polite'].includes(styleOptions.ending) ? styleOptions.ending : 'auto';

  const endingHint = endingKey === 'plain'
    ? '반드시 간결하고 단단한 평서체(~다 / ~는다 / ~였다) 어미로 통일'
    : endingKey === 'polite'
      ? '반드시 다정하고 차분한 경어체(~요 / ~습니다 / ~네요) 어미로 통일'
      : stateInfo.styleHint;

  const hasCurrentDraft = Boolean(currentDraft && currentDraft.paragraph);
  const avoidLine = (!hasCurrentDraft && Array.isArray(avoidAuthors) && avoidAuthors.length > 0)
    ? `\n이미 본문이나 직전 추천에 등장했으니 이번에 피해야 할 작가/출전: ${avoidAuthors.slice(-8).join(', ')}`
    : '';

  let userPrompt = `${dirPrompt}

[문체 조율 설정]
- 문장 결·농도: ${STYLE_TONE_GUIDES[toneKey]}
- 호흡·길이: ${STYLE_LENGTH_GUIDES[lenKey].rule}
- 종결 어미: ${endingHint}${avoidLine}
`;

  if (hasCurrentDraft) {
    userPrompt += `
[문체 재조율 대상 (원래 제안 문단 — 출전·핵심 사유는 그대로 유지할 것)]
- 기존 문단: """${currentDraft.paragraph}"""
- 기존 영감 원전(inspiration): ${currentDraft.inspiration || ''}
- 기존 작가(author): ${currentDraft.author || ''}

중요 지침: 사용자가 다른 글귀를 요청한 것이 아니라, 위 [기존 문단]의 **문체(농도·호흡·어미)만 변경**했습니다.
따라서 기존 영감 원전(${currentDraft.inspiration || currentDraft.author || '동일 원전'})과 핵심 메시지는 절대 바꾸지 말고 그대로 유지한 채, 오직 위 [문체 조율 설정](${STYLE_LENGTH_GUIDES[lenKey].ask}, ${endingHint})에 맞춰 문장의 표현·밀도·길이·종결어미만 새롭게 다듬어 주세요.`;
  } else if (stateInfo.isEmpty) {
    userPrompt += `\n현재 본문은 비어 있습니다. 위 문체 조율 설정에 맞춰 ${STYLE_LENGTH_GUIDES[lenKey].ask} 분량의 첫 단락을 제안해 주세요.`;
  } else if (stateInfo.isIncomplete) {
    userPrompt += `\n[현재까지 사용자가 작성한 본문]\n"""\n${editorText}\n"""\n\n중요: 사용자의 마지막 구절("${stateInfo.lastChunk}")이 아직 문장으로 끝나지 않고 열려 있습니다! 사용자가 이미 쓴 어구를 중복해서 반복하지 말고, 그 마지막 어구 바로 뒤에 자연스럽게 이어 붙여 문장을 완성하며 위 문체 조율 설정(${STYLE_LENGTH_GUIDES[lenKey].ask})에 맞춰 써주세요.`;
  } else {
    userPrompt += `\n[현재까지 사용자가 작성한 본문]\n"""\n${editorText}\n"""\n\n위 본문의 마지막 문장 바로 다음으로 자연스럽게 이어질 ${STYLE_LENGTH_GUIDES[lenKey].ask}을(를) 위 문체 조율 설정에 맞춰 직조해 주세요.`;
  }

  const { parsed, model } = await callProvider(provider, apiKey, buildSystemInstruction(styleOptions), userPrompt);
  const paragraph = String(parsed.paragraph || '').replace(/\s*\n+\s*/g, ' ').trim();
  if (!paragraph) throw new Error('빈 문단이 반환되었습니다.');

  return {
    paragraph,
    inspiration: hasCurrentDraft && currentDraft.inspiration
      ? currentDraft.inspiration
      : String(parsed.inspiration || parsed.author || '').trim(),
    author: hasCurrentDraft && currentDraft.author
      ? currentDraft.author
      : String(parsed.author || '').trim(),
    direction: effectiveDir,
    appendMode: stateInfo.isEmpty ? 'start' : (stateInfo.isIncomplete ? 'inline' : 'paragraph'),
    provider,
    model
  };
}

// 주기적 글귀 DB 업데이트용 AI 큐레이션 (현대 문학·산문·철학 + 동서고금 명문장 발굴)
async function curatePassagesBatchWithAI({ provider = 'gemini', apiKey, existingAuthors = [] }) {
  const sys = `당신은 동서고금의 고전과 20~21세기 현대 문학·에세이·철학·과학산문을 망라하는 문장 아카이브 큐레이터입니다.
글쓰기를 시작하려는 사람들에게 깊은 영감과 생각거리를 던져주는 실제 명문장 6개를 엄선해 JSON으로 반환하세요.
특히 최소 절반(3개 이상)은 **현대의 글귀**(예: 한강, 신형철, 김소연, 김연수, 김영하, 김애란, 최은영, 황정은, 이슬아, 수전 손택, 조앤 디디온, 리베카 솔닛, 데이비드 포스터 월리스, 어슐러 르 귄, 테드 창, 카를로 로벨리, 올리버 색스, 가즈오 이시구로, 레이먼드 카버, 알랭 드 보통, 롤랑 바르트, 한병철, 마사 누스바움, 슬라보예 지젝 등 동시대 및 근현대 작가·사상가)로 구성하세요.

반드시 아래 JSON 형식으로만 응답하세요:
{
  "passages": [
    {
      "cat": "문학" | "철학" | "경전",
      "author": "작가명",
      "source": "작가명, 《작품명》",
      "text": "한국어 발췌 문장 (1~2문장)",
      "tags": "관련주제어1|주제어2|주제어3|주제어4"
    }
  ]
}`;

  const sampleAvoid = existingAuthors.slice(-15).join(', ');
  const user = `최근 자주 등장한 작가(${sampleAvoid || '장자, 노자'}) 외에 참신하고 사유가 깊은 현대 및 고전 문장 6개를 선정해 주세요.`;
  const { parsed } = await callProvider(provider, apiKey, sys, user);
  return Array.isArray(parsed.passages) ? parsed.passages : [];
}

module.exports = {
  weaveNextParagraph,
  verifyProviderKey,
  curatePassagesBatchWithAI
};
