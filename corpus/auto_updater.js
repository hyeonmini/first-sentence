// 주기적 글귀 아카이브 업데이트 엔진 (현대 문학·산문·철학 포함)
// 1) 서버 시작 시 현대 작가·사상가 컬렉션(MODERN_PASSAGES_PACK) 자동 반영
// 2) 6시간 주기 백그라운드 스케줄러(및 수동/키 등록 시 즉시 트리거):
//    - 한국어 위키인용집(Wikiquote) 공개 API에서 새로운 명문장 수집
//    - 연결된 AI 프로바이더(Gemini / OpenAI / Claude)가 있을 경우 동시대 현대 문학·철학·에세이 명문장 큐레이션 추가
//    - 수집된 모든 구절은 data/corpus/auto_harvested.jsonl 및 SQLite passages 테이블에 영구 누적

const fs = require('node:fs');
const path = require('node:path');
const { normalizePassageRecord } = require('./importer');
const { curatePassagesBatchWithAI } = require('./ai_weaver');

const MODERN_PASSAGES_PACK = [
  {
    cat: '문학',
    author: '조앤 디디온',
    text: '우리는 살아남기 위해 스스로에게 이야기를 들려준다.',
    source: '조앤 디디온, 《화이트 앨범》',
    tags: '글쓰기|이야기|생존|이해|삶'
  },
  {
    cat: '문학',
    author: '조앤 디디온',
    text: '내가 무슨 생각을 하고 있는지 오직 알기 위해서, 나는 글을 쓴다.',
    source: '조앤 디디온, 〈내가 글을 쓰는 이유〉',
    tags: '글쓰기|생각|시작|발견|내면'
  },
  {
    cat: '철학',
    author: '수전 손택',
    text: '침묵은 비어 있는 공간이 아니라, 생각과 감각이 다시 제 무게를 되찾기 위해 필요한 여백이다.',
    source: '수전 손택, 《침묵의 미학》',
    tags: '침묵|여백|소음|생각|감각'
  },
  {
    cat: '문학',
    author: '리베카 솔닛',
    text: '길을 잃는다는 것은 우리가 미지의 세계와 마주하고 있다는 뜻이며, 거기서부터 비로소 전혀 몰랐던 자기 자신이 발견된다.',
    source: '리베카 솔닛, 《길 잃기 안내서》',
    tags: '방황|길|미지|불안|발견|시작'
  },
  {
    cat: '문학',
    author: '리베카 솔닛',
    text: '희망은 모든 것이 잘될 것이라는 낙관이 아니라, 우리가 하는 행동이 어떤 결과를 낳을지 알 수 없음에도 그것이 의미를 갖는다는 믿음이다.',
    source: '리베카 솔닛, 《어둠 속의 희망》',
    tags: '희망|행동|불확실|미래|의미'
  },
  {
    cat: '철학',
    author: '데이비드 포스터 월리스',
    text: '진짜 자유란 무엇에 주의를 기울이고 무엇에서 의미를 길어올지를 내가 스스로 선택할 수 있는 능력이다.',
    source: '데이비드 포스터 월리스, 《이것은 물이다》',
    tags: '자유|집중|의미|일상|시선|선택'
  },
  {
    cat: '철학',
    author: '알랭 드 보통',
    text: '불안은 우리가 가진 욕망의 크기에서 우리가 가진 인내심의 크기를 뺀 값과 같다.',
    source: '알랭 드 보통, 《불안》',
    tags: '불안|욕망|비교|인내|조급'
  },
  {
    cat: '철학',
    author: '롤랑 바르트',
    text: '글쓰기란 내가 이미 알고 있던 생각을 옮겨 적는 도구가 아니라, 언어가 스스로 부딪치며 아직 태어나지 않은 생각을 길어 올리는 장소다.',
    source: '롤랑 바르트, 《글쓰기의 영도》·강의록',
    tags: '글쓰기|언어|생각|창작|시작'
  },
  {
    cat: '철학',
    author: '카를로 로벨리',
    text: '세상은 사물들로 이루어진 것이 아니라 사건들로 이루어져 있다. 돌은 영원히 멈춰 있는 물체가 아니라 잠시 유지되고 있는 진동일 뿐이다.',
    source: '카를로 로벨리, 《시간은 흐르지 않는다》',
    tags: '시간|변화|세상|순간|흐름'
  },
  {
    cat: '철학',
    author: '올리버 색스',
    text: '무엇보다 나는 이 아름다운 행성에서 지각 있는 존재로 살며 생각하고 사랑할 수 있었던 특권에 깊이 감사한다.',
    source: '올리버 색스, 《고마움에 대하여》',
    tags: '감사|삶|유한|기쁨|인생'
  },
  {
    cat: '문학',
    author: '테드 창',
    text: '미래를 안다는 것이 현재의 삶을 무의미하게 만들지는 않는다. 오히려 매 순간을 온전히 음미하며 걸어가게 만들 뿐이다.',
    source: '테드 창, 《당신 인생의 이야기》',
    tags: '미래|현재|운명|선택|순간'
  },
  {
    cat: '문학',
    author: '어슐러 르 귄',
    text: '빛을 밝히려면 어둠이 있어야 하고, 말이 울리려면 침묵이 먼저 있어야 한다.',
    source: '어슐러 르 귄, 《어스시의 마법사》',
    tags: '어둠|빛|침묵|말|균형'
  },
  {
    cat: '문학',
    author: '가즈오 이시구로',
    text: '저녁이야말로 하루 중 가장 좋은 시간입니다. 지나간 하루를 아쉬워할 것이 아니라, 지금 남은 이 저녁의 불빛을 바라보아야 합니다.',
    source: '가즈오 이시구로, 《남아 있는 나날》',
    tags: '후회|현재|시간|위로|하루'
  },
  {
    cat: '문학',
    author: '레이먼드 카버',
    text: '이 세상에서 사랑받았다고, 나 또한 간절히 사랑받는 존재였다고 느끼는 것. 결국 그것만으로도 삶은 충분했다.',
    source: '레이먼드 카버, 〈후기(Late Fragment)〉',
    tags: '사랑|삶|충분|관계|죽음'
  },
  {
    cat: '문학',
    author: '김소연',
    text: '마음이란 것은 꺼내어 말할수록 자꾸만 모양이 바뀌어서, 끝내 말하지 못한 자리만이 가장 정확한 마음으로 남기도 한다.',
    source: '김소연, 《마음사전》',
    tags: '마음|말|침묵|감정|표현'
  },
  {
    cat: '문학',
    author: '김소연',
    text: '단 한 줄의 일기라도 쓰기 위해 책상 앞에 앉는 사람은 이미 자기 하루의 주인이 된 사람이다.',
    source: '김소연, 《한 글자 사전》 외 산문',
    tags: '일기|글쓰기|하루|습관|시작'
  },
  {
    cat: '문학',
    author: '김연수',
    text: '이해할 수 없는 일을 겪을 때 우리는 비로소 이야기를 쓰기 시작한다. 소설과 에세이는 이해할 수 없는 삶을 끝내 이해하려는 인간의 몸부림이다.',
    source: '김연수, 《소설가의 일》',
    tags: '글쓰기|이해|고통|삶|이야기'
  },
  {
    cat: '문학',
    author: '김연수',
    text: '매일 아침 아무것도 쓰지 못한 백지 앞에 앉는 일은 두렵지만, 어제보다 단 한 문장이라도 더 나아간 나를 만나는 유일한 길이다.',
    source: '김연수, 《지지 않는다는 말》',
    tags: '아침|백지|글쓰기|꾸준|성장'
  },
  {
    cat: '문학',
    author: '김영하',
    text: '예술과 글쓰기는 우리가 일상에서 차마 꺼내지 못했던 낯선 자아에게 합법적인 은신처를 내어주는 일이다.',
    source: '김영하, 《말하다》·《읽다》',
    tags: '글쓰기|자아|솔직|일상|표현'
  },
  {
    cat: '문학',
    author: '김애란',
    text: '누군가의 손을 잡는다는 건 그 사람의 체온뿐만 아니라 그 사람이 지나온 시간의 결까지 함께 만지는 일이었다.',
    source: '김애란, 《비행운》·《바깥은 여름》',
    tags: '관계|위로|타인|시간|공감'
  },
  {
    cat: '문학',
    author: '최은영',
    text: '누구에게도 쉽게 말할 수 없는 종류의 외로움이 있고, 우리는 가끔 그 외로움이 닮았다는 이유만으로 서로의 곁에 머문다.',
    source: '최은영, 《쇼코의 미소》·《밝은 밤》',
    tags: '외로움|관계|연대|위로|마음'
  },
  {
    cat: '문학',
    author: '황정은',
    text: '아무것도 아닌 것 같은 사소한 안부 한마디가 어떤 사람에게는 하루를 견디게 하는 전부가 되기도 한다.',
    source: '황정은, 《계속해보겠습니다》·《디디의 우산》',
    tags: '안부|타인|다정|하루|버티'
  },
  {
    cat: '문학',
    author: '은희경',
    text: '상처받지 않고 사는 법은 없다. 다만 상처가 내 삶 전체를 정의하도록 내버려 두지 않는 법을 배워갈 뿐이다.',
    source: '은희경, 《생각의 일요일들》',
    tags: '상처|태도|성숙|회복|삶'
  },
  {
    cat: '문학',
    author: '이슬아',
    text: '부지런히 쓰고 고치는 사람 앞에서는 재능이라는 말도 결국 무릎을 꿇게 되어 있다.',
    source: '이슬아, 《일간 이슬아》·《부지런한 사랑》',
    tags: '글쓰기|꾸준|성실|습관|실천'
  }
];

function upsertPassagesBatch(db, rawItems, autoCorpusFile) {
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

  let added = 0;
  const normalizedList = [];

  for (const item of rawItems) {
    const rec = normalizePassageRecord(item, item.cat || '문학');
    if (!rec || rec.text.length < 12 || rec.text.length > 260) continue;
    const exists = db.prepare('SELECT id FROM passages WHERE text = ?').get(rec.text);
    upsert.run(
      rec.text,
      rec.author,
      rec.source,
      rec.cat,
      rec.lineage,
      JSON.stringify(rec.concepts || []),
      rec.tagsPattern || ''
    );
    if (!exists) {
      added++;
      normalizedList.push(rec);
    }
  }

  if (added > 0 && autoCorpusFile) {
    try {
      const lines = normalizedList.map(r => JSON.stringify(r)).join('\n') + '\n';
      fs.appendFileSync(autoCorpusFile, lines, 'utf8');
    } catch (_) {}
  }

  return added;
}

// 한국어 위키인용집 공개 API에서 명언·문장 추출
async function harvestFromKoreanWikiquote() {
  try {
    const listUrl = 'https://ko.wikiquote.org/w/api.php?action=query&list=random&rnnamespace=0&rnlimit=4&format=json';
    const res = await fetch(listUrl, { headers: { 'User-Agent': 'FirstLineWritingStudio/1.0' } });
    if (!res.ok) return [];
    const data = await res.json();
    const pages = data?.query?.random || [];
    const results = [];

    for (const p of pages) {
      if (!p.title || /목록|분류|위키|틀|속담/.test(p.title)) continue;
      const parseUrl = `https://ko.wikiquote.org/w/api.php?action=parse&pageid=${p.id}&prop=wikitext&format=json`;
      const pRes = await fetch(parseUrl, { headers: { 'User-Agent': 'FirstLineWritingStudio/1.0' } });
      if (!pRes.ok) continue;
      const pData = await pRes.json();
      const wiki = pData?.parse?.wikitext?.['*'] || '';
      const bullets = wiki
        .split(/\r?\n/)
        .filter(l => /^\*\s+[^*]/.test(l))
        .map(l =>
          l
            .replace(/^\*\s+/, '')
            .replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1')
            .replace(/'''|''|<[^>]+>|\{\{[^}]+\}\}/g, '')
            .trim()
        )
        .filter(l => l.length >= 16 && l.length <= 160 && /[가-힣]/.test(l) && !/http|ISBN|각주/.test(l));

      if (bullets.length > 0) {
        const picked = bullets[Math.floor(Math.random() * bullets.length)];
        results.push({
          cat: '철학',
          author: p.title.replace(/\s*\([^)]+\)/, '').trim(),
          source: `${p.title.replace(/\s*\([^)]+\)/, '').trim()}, 어록·저작`,
          text: picked.replace(/^["“”']+|["“”']+$/g, '').trim()
        });
      }
    }
    return results;
  } catch (_) {
    return [];
  }
}

async function runPeriodicPassageUpdate(db, corpusDir, getSystemOrUserAiConfig) {
  const autoFile = path.join(corpusDir, 'auto_harvested.jsonl');

  // 1) 기본 현대 문학·산문 팩 보장
  let addedCount = upsertPassagesBatch(db, MODERN_PASSAGES_PACK, null);

  // 2) 한국어 위키인용집 공개 문장 수집
  const wikiItems = await harvestFromKoreanWikiquote();
  if (wikiItems.length > 0) {
    addedCount += upsertPassagesBatch(db, wikiItems, autoFile);
  }

  // 3) AI 키(Gemini / OpenAI / Claude)가 있으면 현대·고전 명문장 6개 추가 큐레이션
  const aiCfg = typeof getSystemOrUserAiConfig === 'function' ? getSystemOrUserAiConfig() : null;
  if (aiCfg && aiCfg.apiKey) {
    try {
      const recentAuthors = db
        .prepare('SELECT DISTINCT author FROM passages ORDER BY id DESC LIMIT 20')
        .all()
        .map(r => r.author);
      const aiItems = await curatePassagesBatchWithAI({
        provider: aiCfg.provider || 'gemini',
        apiKey: aiCfg.apiKey,
        existingAuthors: recentAuthors
      });
      if (aiItems.length > 0) {
        addedCount += upsertPassagesBatch(db, aiItems, autoFile);
      }
    } catch (_) {}
  }

  const nowIso = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('last_passage_update_at', nowIso);
  const totalCount = db.prepare('SELECT COUNT(*) AS cnt FROM passages').get().cnt;

  return { addedCount, totalCount, updatedAt: nowIso };
}

function startPeriodicPassageScheduler(db, corpusDir, getSystemOrUserAiConfig) {
  // 서버 시작 직후 현대 문학·산문 팩 즉시 반영
  upsertPassagesBatch(db, MODERN_PASSAGES_PACK, null);

  const checkAndRun = async () => {
    try {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('last_passage_update_at');
      const lastTs = row ? Date.parse(row.value) : 0;
      const sixHours = 6 * 3600 * 1000;
      if (!lastTs || Date.now() - lastTs >= sixHours) {
        const res = await runPeriodicPassageUpdate(db, corpusDir, getSystemOrUserAiConfig);
        if (res.addedCount > 0) {
          console.log(`🔄 글귀 아카이브 정기 업데이트 완료 (+${res.addedCount}개 추가 / 총 ${res.totalCount}개)`);
        }
      }
    } catch (_) {}
  };

  setTimeout(checkAndRun, 8000);
  const timer = setInterval(checkAndRun, 6 * 3600 * 1000);
  if (timer.unref) timer.unref();
}

module.exports = {
  MODERN_PASSAGES_PACK,
  runPeriodicPassageUpdate,
  startPeriodicPassageScheduler
};
