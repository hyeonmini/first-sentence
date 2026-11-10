// Gemini 기반 인문학 직조(Weaving) 엔진
// - 인류의 동서고금 철학·종교·문학 유산에서 현재 사용자의 글과 맞닿거나 대립하는 사유를 길어와,
//   사용자의 문체(종결어미·호흡·어조)에 맞춰 자연스럽게 이어지는 다음 한 호흡(2~3문장)을 직조합니다.

const modelCache = new Map(); // apiKey -> { models: string[], ts: number }

async function resolveCandidateModels(apiKey) {
  const cached = modelCache.get(apiKey);
  if (cached && Date.now() - cached.ts < 3600 * 1000) {
    return cached.models;
  }

  const fallbackOrder = [
    'models/gemini-3.8-flash',
    'models/gemini-3-flash-preview',
    'models/gemini-flash-latest',
    'models/gemini-2.5-flash'
  ];

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 400 || res.status === 403) {
        throw new Error('INVALID_API_KEY');
      }
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

    // 한국어 산문 품질과 응답 속도의 균형이 가장 좋은 최신 Flash(비-lite 우선) -> Pro -> Lite 순 정렬
    const scoreModel = name => {
      const n = name.toLowerCase();
      let s = 0;
      if (n.includes('gemini-3')) s += 40;
      else if (n.includes('gemini-2.5')) s += 20;
      else if (n.includes('latest')) s += 25;

      if (n.includes('flash') && !n.includes('lite')) s += 30;
      else if (n.includes('pro')) s += 20;
      else if (n.includes('flash-lite') || n.includes('lite')) s += 10;

      // 세부 버전 숫자가 높을수록 우선 (예: 3.8 > 3.5)
      const ver = n.match(/gemini-(\d+(?:\.\d+)?)/);
      if (ver) s += parseFloat(ver[1]) * 3;
      return s;
    };

    usable.sort((a, b) => scoreModel(b) - scoreModel(a));
    const top = usable.slice(0, 4);
    modelCache.set(apiKey, { models: top, ts: Date.now() });
    return top;
  } catch (err) {
    if (err.message === 'INVALID_API_KEY') throw err;
    return fallbackOrder;
  }
}

function detectSentenceEndingState(editorText = '') {
  const trimmedRight = String(editorText).replace(/[ \t]+$/g, '');
  if (!trimmedRight.trim()) {
    return { isEmpty: true, isIncomplete: false, styleHint: '담백하고 차분한 평어체(~다)' };
  }

  // 종결어미 스타일 감지 (존댓말 vs 평어체)
  const clean = trimmedRight.trim();
  const politeMatches = (clean.match(/(습니다|ㅂ니다|해요|예요|네요|군요|까요|죠)[.?!]?(?=\s|$)/g) || []).length;
  const plainMatches = (clean.match(/(다|는다|았다|었다|였다|리라|구나|던가)[.?!]?(?=\s|$)/g) || []).length;
  const styleHint = politeMatches > plainMatches
    ? '부드럽고 차분한 경어체(~요 / ~습니다)'
    : '간결하고 밀도 있는 에세이 평어체(~다)';

  // 마지막 줄이 줄바꿈으로 끝났거나 완결된 문장부호/종결어미로 끝났는지 판별
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
  opening: `아직 백지 상태인 아침 노트의 첫 물꼬를 여는 단락입니다.
동양 고전(장자·노자·논어·채근담·다산·연암 등), 서양 철학(스토아·몽테뉴·파스칼·니체·키르케고르·시몬 베유·벤야민·소로 등), 종교 경전(전도서·숫타니파타·법구경·금강경·루미 등), 세계·한국 문학(카프카·릴케·카뮈·페소아·프루스트·울프·보르헤스·칼비노·윤동주·김훈·박완서·한강·신형철 등) 중 한 작품의 통찰이나 인상을 자연스럽게 녹여, 읽자마자 자기 이야기를 덧붙이고 싶어지는 2~3문장의 첫 단락을 써주세요.`,

  reson: `[방향: 공명 · 깊이 파기]
지금까지 사용자가 쓴 생각의 결에 깊이 공명하면서, 인류의 철학·종교·문학 유산 중 그 생각과 가장 잘 맞닿는 사상가나 작품의 통찰을 에세이 문장 속에 자연스럽게 용해시켜 사유를 한 뼘 더 깊게 확장하는 다음 2~3문장을 써주세요.`,

  contra: `[방향: 반론 · 시선 뒤집기]
지금까지 사용자가 쓴 흐름에 생산적인 균열과 긴장을 만들어 주세요. 정반대 철학적 극점에 선 사상가·경전·문학 작품의 시선을 빌려("하지만 다른 쪽에서 보면—", "반면 ~는 정반대의 질문을 던진다" 등 문맥에 맞는 자연스러운 전환으로) 생각의 이면을 찌르는 다음 2~3문장을 써주세요.`,

  scene: `[방향: 비유 · 문학적 장면]
글이 추상적인 관념에 머물지 않도록, 세계·한국 문학 작품 속 구체적인 한 장면이나 고전의 생생한 우화·비유(예: 빈 배, 얼어붙은 바다를 깨는 도끼, 시지프의 돌, 진흙탕 물 등 문맥에 꼭 맞는 실제 고전·문학의 이미지)를 끌어와 감각적으로 풀어내는 다음 2~3문장을 써주세요.`,

  close: `[방향: 매듭 · 수렴]
지금까지 본문에 쌓인 생각과 갈등을 조용히 여미며, 오늘 하루 사용자가 자기 삶에 가져갈 수 있는 단단하고 여운 있는 결론 단락(2문장 내외)으로 착지시켜 주세요. 거창한 훈계나 교훈조는 피하고 담백한 자기 다짐이나 성찰로 마무리하세요.`
};

function buildSystemInstruction() {
  return `당신은 인류의 동서고금 철학·종교·문학을 꿰뚫고 있는 사려 깊은 에세이 공동 집필자입니다.
사용자가 아침마다 한 단락씩 글을 지어 나갈 때, 당신은 전체 글을 대신 써버리지 않고 딱 '다음 한 호흡(2~3문장)'만 직조해 제안합니다. 사용자는 당신의 문단을 본문에 이어 붙인 뒤 자기 말투와 의도에 맞게 직접 고쳐 쓰며 글을 완성합니다.

반드시 지켜야 할 집필 원칙:
1. 분량 엄수: 반드시 한 문단, 2~3문장(공백 포함 100~210자 내외)만 작성하세요. 절대 여러 문단을 쓰지 마세요.
2. 문체 동기화: 사용자가 본문에 쓴 종결어미(~다 평어체 vs ~요/습니다 경어체), 호흡, 어조를 세심하게 관찰해 똑같은 문체로 이어 쓰세요.
3. 인용이 아닌 '용해': 교과서처럼 「OO는 "..."라고 말했다」만 딱딱하게 나열하지 마세요. 몽테뉴의 에세이처럼 사상가·작품의 핵심 사유나 구절을 산문 흐름 속에 자연스럽게 녹여 쓰세요.
4. 실재하는 고전·문학만 사용: 반드시 실제로 존재하는 철학자·경전·작가·작품의 정확한 사유만 다루세요. 없는 구절을 지어내지 마세요.
5. 상투적 자기계발 어투 금지: "화이팅", "중요한 것은 마음가짐입니다", "당신도 할 수 있습니다" 같은 진부한 위로·훈계를 절대 쓰지 마세요. 밀도 있고 문학적인 한국어 산문을 구사하세요.
6. 반드시 아래 JSON 스키마로만 응답하세요:
{
  "paragraph": "본문에 바로 이어 붙일 텍스트 (줄바꿈 없이 한 단락)",
  "inspiration": "길어온 작가와 작품 및 핵심 모티프 요약 (예: 시몬 베유 《중력과 은총》 · 비어 있는 틈)",
  "author": "핵심 언급 작가/출전 이름 (예: 시몬 베유)"
}`;
}

async function weaveNextParagraph({
  apiKey,
  direction = 'reson', // 'opening' | 'reson' | 'contra' | 'scene' | 'close'
  editorText = '',
  avoidAuthors = []
}) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('NO_API_KEY');
  }

  const stateInfo = detectSentenceEndingState(editorText);
  const effectiveDir = stateInfo.isEmpty ? 'opening' : (DIRECTION_GUIDES[direction] ? direction : 'reson');
  const dirPrompt = DIRECTION_GUIDES[effectiveDir];

  const avoidLine = Array.isArray(avoidAuthors) && avoidAuthors.length > 0
    ? `\n이미 본문이나 직전 추천에 등장했으니 이번에 피해야 할 작가/출전: ${avoidAuthors.slice(-8).join(', ')}`
    : '';

  let userPrompt = `${dirPrompt}\n\n권장 문체: ${stateInfo.styleHint}${avoidLine}\n`;

  if (stateInfo.isEmpty) {
    userPrompt += `\n현재 본문은 비어 있습니다. 첫 단락을 제안해 주세요.`;
  } else if (stateInfo.isIncomplete) {
    userPrompt += `\n[현재까지 사용자가 작성한 본문]\n"""\n${editorText}\n"""\n\n중요: 사용자의 마지막 구절("${stateInfo.lastChunk}")이 아직 문장으로 끝나지 않고 열려 있습니다! 사용자가 이미 쓴 어구를 중복해서 반복하지 말고, 그 마지막 어구 바로 뒤에 자연스럽게 이어 붙여 그 문장을 완성한 뒤 1~2문장을 덧붙여 주세요.`;
  } else {
    userPrompt += `\n[현재까지 사용자가 작성한 본문]\n"""\n${editorText}\n"""\n\n위 본문의 마지막 문장 바로 다음 문단으로 자연스럽게 이어질 2~3문장을 직조해 주세요.`;
  }

  const models = await resolveCandidateModels(apiKey.trim());
  let lastErr = null;

  for (const modelName of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${encodeURIComponent(apiKey.trim())}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: buildSystemInstruction() }]
          },
          contents: [
            { role: 'user', parts: [{ text: userPrompt }] }
          ],
          generationConfig: {
            temperature: 0.85,
            responseMimeType: 'application/json'
          }
        })
      });

      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        if (res.status === 400 && /API_KEY_INVALID|API key not valid/i.test(errBody)) {
          throw new Error('INVALID_API_KEY');
        }
        if (res.status === 403) {
          throw new Error('INVALID_API_KEY');
        }
        lastErr = new Error(`Gemini HTTP ${res.status}: ${errBody.slice(0, 160)}`);
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

      const cleanedJson = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      const parsed = JSON.parse(cleanedJson);
      const paragraph = String(parsed.paragraph || '').replace(/\s*\n+\s*/g, ' ').trim();
      if (!paragraph) {
        lastErr = new Error('Missing paragraph field');
        continue;
      }

      return {
        paragraph,
        inspiration: String(parsed.inspiration || parsed.author || '').trim(),
        author: String(parsed.author || '').trim(),
        direction: effectiveDir,
        appendMode: stateInfo.isEmpty ? 'start' : (stateInfo.isIncomplete ? 'inline' : 'paragraph'),
        model: modelName.replace(/^models\//, '')
      };
    } catch (err) {
      if (err.message === 'INVALID_API_KEY') throw err;
      lastErr = err;
    }
  }

  throw lastErr || new Error('AI 직조 응답을 가져오지 못했습니다.');
}

async function verifyGeminiKey(apiKey) {
  const models = await resolveCandidateModels(apiKey.trim());
  return models[0] || 'gemini-flash';
}

module.exports = {
  weaveNextParagraph,
  verifyGeminiKey
};
