const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { syncAllPassagesToDb } = require('./corpus/importer');
const { recommendPassage } = require('./corpus/recommender');
const { weaveNextParagraph, verifyProviderKey } = require('./corpus/ai_weaver');
const {
  runPeriodicPassageUpdate,
  startPeriodicPassageScheduler
} = require('./corpus/auto_updater');

const PORT = Number(process.env.PORT || 4567);
const DATA_DIR = process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(__dirname, 'data');
const MD_DIR = path.join(DATA_DIR, 'markdown');
const CORPUS_DIR = path.join(DATA_DIR, 'corpus');
const PUBLIC_DIR = path.join(__dirname, 'public');
const TUNNEL_FILE = path.join(DATA_DIR, 'tunnel_url.txt');
const ENV_FILE = path.join(__dirname, '.env');

if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    }
  }
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(MD_DIR)) fs.mkdirSync(MD_DIR, { recursive: true });
if (!fs.existsSync(CORPUS_DIR)) fs.mkdirSync(CORPUS_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'vault.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    picture TEXT NOT NULL DEFAULT '',
    auth_type TEXT NOT NULL DEFAULT 'guest',
    ai_provider TEXT NOT NULL DEFAULT 'gemini',
    gemini_key TEXT NOT NULL DEFAULT '',
    openai_key TEXT NOT NULL DEFAULT '',
    claude_key TEXT NOT NULL DEFAULT '',
    theme TEXT NOT NULL DEFAULT 'dark',
    pin_code TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    last_login_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS writings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL DEFAULT 'default',
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    crystals_json TEXT NOT NULL DEFAULT '[]',
    word_count INTEGER NOT NULL DEFAULT 0,
    char_count INTEGER NOT NULL DEFAULT 0,
    created_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

try { db.exec(`ALTER TABLE writings ADD COLUMN crystals_json TEXT NOT NULL DEFAULT '[]';`); } catch (_) {}
try { db.exec(`ALTER TABLE writings ADD COLUMN user_id TEXT NOT NULL DEFAULT 'default';`); } catch (_) {}
try { db.exec(`CREATE INDEX IF NOT EXISTS idx_writings_user_date ON writings(user_id, created_date DESC);`); } catch (_) {}

function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, String(value));
}

// ============================================================================
// 보안 유틸리티: API 키 AES-256-GCM 암호화 보관 & PIN 단방향 해시 검증
// ============================================================================
function getVaultMasterKey() {
  let secret = (process.env.VAULT_SECRET || getSetting('vault_master_secret', '')).trim();
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex');
    setSetting('vault_master_secret', secret);
  }
  return crypto.createHash('sha256').update(secret).digest();
}

const VAULT_KEY = getVaultMasterKey();

function encryptSecret(plainText) {
  const clean = String(plainText || '').trim();
  if (!clean) return '';
  if (clean.startsWith('enc:v1:')) return clean;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', VAULT_KEY, iv);
  const encrypted = Buffer.concat([cipher.update(clean, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(stored) {
  const raw = String(stored || '').trim();
  if (!raw) return '';
  if (!raw.startsWith('enc:v1:')) return raw;
  try {
    const [, , ivHex, tagHex, dataHex] = raw.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', VAULT_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch (_) {
    return '';
  }
}

function hashPin(pin) {
  const clean = String(pin || '').trim();
  if (!clean) return '';
  if (clean.startsWith('pin:v1:')) return clean;
  const digest = crypto.createHmac('sha256', VAULT_KEY).update(clean).digest('hex');
  return `pin:v1:${digest}`;
}

function verifyPinCode(savedPin, candidatePin) {
  const saved = String(savedPin || '').trim();
  if (!saved) return true;
  const cand = String(candidatePin || '');
  const expected = saved.startsWith('pin:v1:') ? saved : hashPin(saved);
  const actual = hashPin(cand);
  const bufA = Buffer.from(expected, 'utf8');
  const bufB = Buffer.from(actual, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// 초기 기본 사용자('default') 보장 및 기존 평문 키/PIN 암호화 마이그레이션
(function ensureDefaultUserAndEncryptAtRest() {
  const existing = db.prepare('SELECT id FROM users WHERE id = ?').get('default');
  if (!existing) {
    const now = new Date().toISOString();
    const legacyGeminiKey = getSetting('gemini_api_key', '') || process.env.GEMINI_API_KEY || '';
    const legacyTheme = getSetting('theme', 'dark');
    const legacyPin = getSetting('pin_code', '');
    db.prepare(`
      INSERT INTO users (id, email, name, picture, auth_type, ai_provider, gemini_key, openai_key, claude_key, theme, pin_code, created_at, last_login_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'default',
      '',
      '게스트',
      '',
      'guest',
      'gemini',
      encryptSecret(legacyGeminiKey),
      encryptSecret(process.env.OPENAI_API_KEY || ''),
      encryptSecret(process.env.ANTHROPIC_API_KEY || ''),
      legacyTheme,
      hashPin(legacyPin),
      now,
      now
    );
  }

  // 기존 DB 내 평문 API 키 및 PIN을 암호화/해시 포맷으로 일괄 업그레이드
  const allUsers = db.prepare('SELECT id, gemini_key, openai_key, claude_key, pin_code FROM users').all();
  const migrateStmt = db.prepare(`
    UPDATE users
    SET gemini_key = ?, openai_key = ?, claude_key = ?, pin_code = ?
    WHERE id = ?
  `);
  for (const u of allUsers) {
    const g = u.gemini_key ? encryptSecret(u.gemini_key) : '';
    const o = u.openai_key ? encryptSecret(u.openai_key) : '';
    const c = u.claude_key ? encryptSecret(u.claude_key) : '';
    const p = u.pin_code ? hashPin(u.pin_code) : '';
    if (g !== u.gemini_key || o !== u.openai_key || c !== u.claude_key || p !== u.pin_code) {
      migrateStmt.run(g, o, c, p, u.id);
    }
  }
  // 레거시 평문 설정 행 제거
  db.prepare("DELETE FROM settings WHERE key IN ('gemini_api_key', 'pin_code')").run();
})();

// 시스템 환경변수 기반 정기 글귀 업데이트용 AI 설정 조회 (개인 사용자 키는 백그라운드 잡에서 무단 사용하지 않음)
function getAnyAvailableAiConfig() {
  if (process.env.GEMINI_API_KEY) return { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY };
  if (process.env.OPENAI_API_KEY) return { provider: 'openai', apiKey: process.env.OPENAI_API_KEY };
  if (process.env.ANTHROPIC_API_KEY) return { provider: 'claude', apiKey: process.env.ANTHROPIC_API_KEY };
  return null;
}

const initialPassageCount = syncAllPassagesToDb(db, CORPUS_DIR);
startPeriodicPassageScheduler(db, CORPUS_DIR, getAnyAvailableAiConfig);
const afterModernPackCount = db.prepare('SELECT COUNT(*) AS cnt FROM passages').get().cnt;
console.log(`📚 첫 문장 사유 아카이브 준비됨 (${afterModernPackCount || initialPassageCount}개 구절 · 6시간 주기 자동 업데이트 활성)`);

function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('100.')) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function getLocalDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function extractFirstLineTitle(content) {
  const firstLine = (content || '')
    .split('\n')
    .map(l => l.trim())
    .find(Boolean) || '';
  return firstLine.replace(/^[-#*>\s]+/, '').slice(0, 60);
}

function countWordsAndChars(text) {
  const cleaned = (text || '').trim();
  if (!cleaned) return { wordCount: 0, charCount: 0 };
  const words = cleaned.split(/\s+/).filter(Boolean).length;
  return { wordCount: words, charCount: cleaned.length };
}

function syncMarkdownFile(writing) {
  try {
    for (const file of fs.readdirSync(MD_DIR)) {
      if (file.includes(`_${writing.id}_`)) {
        fs.unlinkSync(path.join(MD_DIR, file));
      }
    }
    if (!(writing.content || '').trim()) return;

    const safeTitle = (writing.title || '기록')
      .replace(/[\\/:*?"<>|]/g, '')
      .trim()
      .slice(0, 40) || '기록';
    const filename = `${writing.created_date}_${writing.id}_${safeTitle}.md`;
    fs.writeFileSync(path.join(MD_DIR, filename), writing.content.trim() + '\n', 'utf8');
  } catch (_) {}
}

function findPreviousEchoes(userId, excludeId) {
  const rows = db.prepare(`
    SELECT id, created_date, content, crystals_json
    FROM writings
    WHERE user_id = ? AND id != ? AND char_count > 0
    ORDER BY created_date DESC, id DESC
    LIMIT 12
  `).all(userId, excludeId || 0);

  if (!rows.length) return [];

  const echoes = [];
  const seen = new Set();
  const add = (date, text) => {
    const clean = (text || '').trim();
    if (clean.length < 8 || seen.has(clean)) return;
    seen.add(clean);
    echoes.push({ date, text: clean });
  };

  for (const row of rows) {
    try {
      const crystals = JSON.parse(row.crystals_json || '[]');
      for (const c of crystals.reverse()) add(row.created_date, c);
    } catch (_) {}

    const lines = (row.content || '')
      .split(/\n+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (lines.length) {
      add(row.created_date, lines[lines.length - 1]);
    }
  }

  return echoes.slice(0, 6);
}

// ============================================================================
// 다중 사용자 세션 & 구글 인증 처리
// ============================================================================
function resolveUserFromRequest(req, { createIfMissing = false } = {}) {
  const token = String(req.headers['x-session-token'] || '').trim();
  if (token) {
    const sess = db.prepare('SELECT user_id FROM sessions WHERE token = ?').get(token);
    if (sess) {
      const u = db.prepare('SELECT * FROM users WHERE id = ?').get(sess.user_id);
      if (u) return { user: u, token };
    }
  }

  if (!createIfMissing) {
    return {
      user: {
        id: 'ephemeral_guest',
        email: '',
        name: '게스트',
        picture: '',
        auth_type: 'guest',
        ai_provider: 'gemini',
        gemini_key: '',
        openai_key: '',
        claude_key: '',
        theme: 'dark',
        pin_code: ''
      },
      token: ''
    };
  }

  // 기존 로컬 'default' 유저에 작성된 글이 있고 아직 세션이 발급된 적 없다면 첫 방문자에게 연결
  const defaultWritings = db.prepare("SELECT COUNT(*) AS cnt FROM writings WHERE user_id = 'default'").get();
  const defaultSessions = db.prepare("SELECT COUNT(*) AS cnt FROM sessions WHERE user_id = 'default'").get();
  if ((defaultWritings?.cnt || 0) > 0 && (defaultSessions?.cnt || 0) === 0) {
    const defaultUser = db.prepare("SELECT * FROM users WHERE id = 'default'").get();
    if (defaultUser) {
      const firstToken = crypto.randomBytes(24).toString('hex');
      db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
        firstToken,
        'default',
        new Date().toISOString()
      );
      return { user: defaultUser, token: firstToken };
    }
  }

  // 그 외 모든 새 방문자에게는 독립된 게스트 계정 + 전용 세션 토큰을 발급하여 다른 사용자와 글/API 키가 섞이지 않도록 완벽히 격리
  const now = new Date().toISOString();
  const guestId = `guest_${crypto.randomBytes(8).toString('hex')}`;
  const newToken = crypto.randomBytes(24).toString('hex');

  db.prepare(`
    INSERT INTO users (id, email, name, picture, auth_type, ai_provider, gemini_key, openai_key, claude_key, theme, pin_code, created_at, last_login_at)
    VALUES (?, '', '게스트', '', 'guest', 'gemini', ?, ?, ?, 'dark', '', ?, ?)
  `).run(
    guestId,
    encryptSecret(process.env.GEMINI_API_KEY || ''),
    encryptSecret(process.env.OPENAI_API_KEY || ''),
    encryptSecret(process.env.ANTHROPIC_API_KEY || ''),
    now,
    now
  );
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(newToken, guestId, now);
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(guestId);
  return { user: u, token: newToken };
}

function getUserActiveAiCredentials(user) {
  const gKey = (decryptSecret(user.gemini_key) || process.env.GEMINI_API_KEY || '').trim();
  const oKey = (decryptSecret(user.openai_key) || process.env.OPENAI_API_KEY || '').trim();
  const cKey = (decryptSecret(user.claude_key) || process.env.ANTHROPIC_API_KEY || '').trim();

  const hasKeys = {
    gemini: Boolean(gKey),
    openai: Boolean(oKey),
    claude: Boolean(cKey)
  };
  let activeProvider = user.ai_provider || 'gemini';
  if (!hasKeys[activeProvider]) {
    if (hasKeys.gemini) activeProvider = 'gemini';
    else if (hasKeys.openai) activeProvider = 'openai';
    else if (hasKeys.claude) activeProvider = 'claude';
  }
  const activeKey = activeProvider === 'openai'
    ? oKey
    : activeProvider === 'claude'
      ? cKey
      : gKey;

  return {
    aiProvider: activeProvider,
    hasAiKey: Boolean(activeKey),
    hasKeys,
    activeKey
  };
}

// 클라이언트 응답용: 실제 API 키 원문(activeKey)은 절대 포함하지 않음
function getUserAiStatus(user) {
  const { aiProvider, hasAiKey, hasKeys } = getUserActiveAiCredentials(user);
  return { aiProvider, hasAiKey, hasKeys };
}

function isPinAuthorized(req, user) {
  const savedPin = (user.pin_code || '').trim();
  if (!savedPin) return true;
  const clientPin = decodeURIComponent(req.headers['x-pin'] || '');
  return verifyPinCode(savedPin, clientPin);
}

function getFirebaseConfigs() {
  const configs = [];
  const primaryKey = (process.env.FIREBASE_API_KEY || getSetting('firebase_api_key', '')).trim();
  const primaryDomain = (process.env.FIREBASE_AUTH_DOMAIN || 'first-sentence-kr.firebaseapp.com').trim();
  const primaryProj = (process.env.FIREBASE_PROJECT_ID || 'first-sentence-kr').trim();
  if (primaryKey) {
    configs.push({ apiKey: primaryKey, authDomain: primaryDomain, projectId: primaryProj });
  }
  const fbKey = (process.env.FIREBASE_FALLBACK_API_KEY || getSetting('firebase_fallback_api_key', '')).trim();
  const fbDomain = (process.env.FIREBASE_FALLBACK_AUTH_DOMAIN || 'sumshare-2025.firebaseapp.com').trim();
  const fbProj = (process.env.FIREBASE_FALLBACK_PROJECT_ID || 'sumshare-2025').trim();
  if (fbKey) {
    configs.push({ apiKey: fbKey, authDomain: fbDomain, projectId: fbProj });
  }
  return configs;
}

async function verifyGoogleCredential(credential) {
  // 1) Firebase Google OAuth ID Token 검증 (Identity Toolkit lookup)
  const apiKeys = getFirebaseConfigs().map(c => c.apiKey).filter(Boolean);
  for (const apiKey of apiKeys) {
    try {
      const fbRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken: credential })
        }
      );
      if (fbRes.ok) {
        const fbData = await fbRes.json();
        const u = Array.isArray(fbData.users) ? fbData.users[0] : null;
        if (u && (u.email || u.localId)) {
          return {
            sub: u.localId,
            email: (u.email || '').toLowerCase(),
            name: u.displayName || (u.email ? u.email.split('@')[0] : '사용자'),
            picture: u.photoUrl || ''
          };
        }
      }
    } catch (_) {}
  }

  // 2) Google Identity Services (GIS) ID Token 검증 폴백
  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Google 토큰 검증에 실패했습니다.');
  const payload = await res.json();
  const configuredClientId = (getSetting('google_client_id', '') || process.env.GOOGLE_CLIENT_ID || '').trim();
  if (configuredClientId && payload.aud !== configuredClientId) {
    throw new Error('Google Client ID가 일치하지 않습니다.');
  }
  return {
    sub: payload.sub,
    email: (payload.email || '').toLowerCase(),
    name: payload.name || (payload.email ? payload.email.split('@')[0] : '사용자'),
    picture: payload.picture || ''
  };
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

// PIN 잠금 해제 브루트포스 방어용 IP 레이트리미터
const unlockAttempts = new Map();
function checkUnlockRateLimit(req) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const entry = unlockAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    unlockAttempts.set(ip, { count: 1, resetAt: now + 5 * 60 * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= 10;
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

let activePort = PORT;
let activeTunnelUrl = '';
if (fs.existsSync(TUNNEL_FILE)) {
  activeTunnelUrl = fs.readFileSync(TUNNEL_FILE, 'utf8').trim();
}

const server = http.createServer(async (req, res) => {
  try {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;
    const shouldCreateSession = pathname.startsWith('/api/');
    const { user, token: resolvedToken } = resolveUserFromRequest(req, {
      createIfMissing: shouldCreateSession
    });

    if (pathname === '/api/status' && req.method === 'GET') {
      const savedPin = (user.pin_code || '').trim();
      return sendJson(res, 200, {
        locked: Boolean(savedPin),
        authorized: isPinAuthorized(req, user),
        theme: user.theme || 'dark',
        sessionToken: resolvedToken || undefined
      });
    }

    if (pathname === '/api/unlock' && req.method === 'POST') {
      if (!checkUnlockRateLimit(req)) {
        return sendJson(res, 429, { error: '비밀번호 입력 시도가 너무 많습니다. 잠시 후 다시 시도해주세요.' });
      }
      const body = await parseBody(req);
      const savedPin = (user.pin_code || '').trim();
      if (verifyPinCode(savedPin, body.pin)) {
        return sendJson(res, 200, { ok: true });
      }
      return sendJson(res, 401, { error: '비밀번호가 일치하지 않습니다.' });
    }

    // 구글 로그인 (공식 Firebase Google OAuth ID Token 검증 및 GIS 검증 지원)
    if (pathname === '/api/auth/google' && req.method === 'POST') {
      const body = await parseBody(req);
      let profile = null;

      if (body.credential) {
        profile = await verifyGoogleCredential(body.credential);
      } else if (body.email) {
        const cleanEmail = String(body.email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return sendJson(res, 400, { error: '유효한 이메일 주소를 입력해 주세요.' });
        }
        const cleanName = String(body.name || cleanEmail.split('@')[0]).trim();
        profile = {
          sub: cleanEmail,
          email: cleanEmail,
          name: cleanName,
          picture: ''
        };
      } else {
        return sendJson(res, 400, { error: '로그인 정보가 없습니다.' });
      }

      const googleUserId = `google_${profile.email || profile.sub}`;
      const now = new Date().toISOString();
      const existing = db.prepare("SELECT * FROM users WHERE id = ? OR (email != '' AND email = ?)").get(
        googleUserId,
        profile.email
      );

      const isIsolatedGuest = user.auth_type === 'guest' && user.id !== 'default' && user.id !== 'ephemeral_guest';
      const guestGemini = isIsolatedGuest ? user.gemini_key : '';
      const guestOpenai = isIsolatedGuest ? user.openai_key : '';
      const guestClaude = isIsolatedGuest ? user.claude_key : '';

      const finalUserId = existing ? existing.id : googleUserId;
      if (!existing) {
        db.prepare(`
          INSERT INTO users (id, email, name, picture, auth_type, ai_provider, gemini_key, openai_key, claude_key, theme, pin_code, created_at, last_login_at)
          VALUES (?, ?, ?, ?, 'google', ?, ?, ?, ?, ?, '', ?, ?)
        `).run(
          finalUserId,
          profile.email,
          profile.name,
          profile.picture,
          user.ai_provider || 'gemini',
          guestGemini || encryptSecret(process.env.GEMINI_API_KEY || ''),
          guestOpenai || encryptSecret(process.env.OPENAI_API_KEY || ''),
          guestClaude || encryptSecret(process.env.ANTHROPIC_API_KEY || ''),
          user.theme || 'dark',
          now,
          now
        );
      } else {
        db.prepare(`
          UPDATE users
          SET name = ?, picture = COALESCE(NULLIF(?, ''), picture), last_login_at = ?,
              gemini_key = CASE WHEN gemini_key = '' THEN ? ELSE gemini_key END,
              openai_key = CASE WHEN openai_key = '' THEN ? ELSE openai_key END,
              claude_key = CASE WHEN claude_key = '' THEN ? ELSE claude_key END
          WHERE id = ?
        `).run(
          profile.name || existing.name,
          profile.picture || '',
          now,
          guestGemini || '',
          guestOpenai || '',
          guestClaude || '',
          finalUserId
        );
      }

      // 로그인 전 본인 전용 게스트 세션에서 작성하던 글만 구글 계정으로 안전하게 이관
      if (isIsolatedGuest && user.id !== finalUserId) {
        db.prepare('UPDATE writings SET user_id = ? WHERE user_id = ? AND char_count > 0').run(finalUserId, user.id);
      }

      const newToken = crypto.randomBytes(24).toString('hex');
      db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(newToken, finalUserId, now);

      const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(finalUserId);
      return sendJson(res, 200, {
        ok: true,
        sessionToken: newToken,
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
          picture: updatedUser.picture,
          authType: updatedUser.auth_type
        }
      });
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = String(req.headers['x-session-token'] || '').trim();
      if (token) {
        db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      }
      // 새 독립 게스트 세션 발급
      const now = new Date().toISOString();
      const guestId = `guest_${crypto.randomBytes(8).toString('hex')}`;
      const newToken = crypto.randomBytes(24).toString('hex');
      db.prepare(`
        INSERT INTO users (id, email, name, picture, auth_type, ai_provider, gemini_key, openai_key, claude_key, theme, pin_code, created_at, last_login_at)
        VALUES (?, '', '게스트', '', 'guest', 'gemini', '', '', '', 'dark', '', ?, ?)
      `).run(guestId, now, now);
      db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(newToken, guestId, now);
      return sendJson(res, 200, { ok: true, sessionToken: newToken });
    }

    if (pathname.startsWith('/api/') && !isPinAuthorized(req, user)) {
      return sendJson(res, 401, { error: 'Locked' });
    }

    if (pathname === '/api/bootstrap' && req.method === 'GET') {
      const rawRows = db.prepare(`
        SELECT id, title, content, crystals_json, char_count, created_date, updated_at
        FROM writings
        WHERE user_id = ?
        ORDER BY created_date DESC, id DESC
      `).all(user.id);

      const writings = rawRows.map(w => ({
        id: w.id,
        title: w.title,
        content: w.content || '',
        crystals: (() => { try { return JSON.parse(w.crystals_json || '[]'); } catch (_) { return []; } })(),
        char_count: w.char_count,
        created_date: w.created_date
      }));

      const today = getLocalDateString();
      const todayEntry = writings.find(w => w.created_date === today);
      const echoes = findPreviousEchoes(user.id, todayEntry ? todayEntry.id : 0);
      const aiStatus = getUserAiStatus(user);
      const passageStats = db.prepare('SELECT COUNT(*) AS cnt FROM passages').get();
      const lastUpdated = getSetting('last_passage_update_at', '');
      const googleClientId = (getSetting('google_client_id', '') || process.env.GOOGLE_CLIENT_ID || '').trim();

      return sendJson(res, 200, {
        writings,
        echoes,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          picture: user.picture,
          authType: user.auth_type
        },
        sessionToken: resolvedToken || undefined,
        googleClientId,
        firebaseConfigs: getFirebaseConfigs(),
        hasPin: Boolean((user.pin_code || '').trim()),
        aiProvider: aiStatus.aiProvider,
        hasAiKey: aiStatus.hasAiKey,
        hasKeys: aiStatus.hasKeys,
        passageCount: passageStats ? passageStats.cnt : 0,
        lastPassageUpdateAt: lastUpdated,
        theme: user.theme || 'dark',
        today
      });
    }

    if (pathname === '/api/echo' && req.method === 'GET') {
      const excludeId = Number(urlObj.searchParams.get('exclude') || 0);
      return sendJson(res, 200, { echoes: findPreviousEchoes(user.id, excludeId) });
    }

    if (pathname === '/api/writings' && req.method === 'POST') {
      const body = await parseBody(req);
      const now = new Date().toISOString();
      const createdDate = body.created_date || getLocalDateString();
      const content = String(body.content || '');
      const crystals = Array.isArray(body.crystals) ? body.crystals : [];
      const title = extractFirstLineTitle(content);
      const { wordCount, charCount } = countWordsAndChars(content);

      const info = db.prepare(`
        INSERT INTO writings (user_id, title, content, crystals_json, word_count, char_count, created_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(user.id, title, content, JSON.stringify(crystals), wordCount, charCount, createdDate, now, now);

      const id = Number(info.lastInsertRowid);
      const writing = { id, title, content, crystals, char_count: charCount, created_date: createdDate };
      syncMarkdownFile(writing);

      return sendJson(res, 201, {
        writing,
        echoes: findPreviousEchoes(user.id, id)
      });
    }

    if (pathname.startsWith('/api/writings/') && req.method === 'PUT') {
      const id = Number(pathname.split('/').pop());
      const existing = db.prepare('SELECT * FROM writings WHERE id = ? AND user_id = ?').get(id, user.id);
      if (!existing) return sendJson(res, 404, { error: 'Not found' });

      const body = await parseBody(req);
      const content = body.content !== undefined ? String(body.content) : existing.content;
      let crystals = [];
      try { crystals = JSON.parse(existing.crystals_json || '[]'); } catch (_) {}
      if (Array.isArray(body.crystals)) crystals = body.crystals;

      const title = extractFirstLineTitle(content);
      const { wordCount, charCount } = countWordsAndChars(content);
      const now = new Date().toISOString();

      db.prepare(`
        UPDATE writings
        SET title = ?, content = ?, crystals_json = ?, word_count = ?, char_count = ?, updated_at = ?
        WHERE id = ? AND user_id = ?
      `).run(title, content, JSON.stringify(crystals), wordCount, charCount, now, id, user.id);

      const writing = {
        id,
        title,
        content,
        crystals,
        char_count: charCount,
        created_date: existing.created_date
      };
      syncMarkdownFile(writing);
      return sendJson(res, 200, { writing });
    }

    if (pathname.startsWith('/api/writings/') && req.method === 'DELETE') {
      const id = Number(pathname.split('/').pop());
      db.prepare('DELETE FROM writings WHERE id = ? AND user_id = ?').run(id, user.id);
      try {
        for (const f of fs.readdirSync(MD_DIR)) {
          if (f.includes(`_${id}_`)) fs.unlinkSync(path.join(MD_DIR, f));
        }
      } catch (_) {}
      return sendJson(res, 200, { ok: true });
    }

    if (pathname === '/api/settings' && req.method === 'PUT') {
      const body = await parseBody(req);
      if (body.theme !== undefined) {
        db.prepare('UPDATE users SET theme = ? WHERE id = ?').run(String(body.theme), user.id);
      }
      if (body.pin_code !== undefined) {
        db.prepare('UPDATE users SET pin_code = ? WHERE id = ?').run(hashPin(body.pin_code), user.id);
      }
      if (body.google_client_id !== undefined) {
        setSetting('google_client_id', String(body.google_client_id).trim());
      }
      const updated = db.prepare('SELECT pin_code FROM users WHERE id = ?').get(user.id);
      return sendJson(res, 200, { ok: true, hasPin: Boolean((updated?.pin_code || '').trim()) });
    }

    if (pathname === '/api/passages/next' && req.method === 'POST') {
      const body = await parseBody(req);
      const result = recommendPassage(db, body || {});
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/passages/reload' && req.method === 'POST') {
      const cnt = syncAllPassagesToDb(db, CORPUS_DIR);
      return sendJson(res, 200, { ok: true, totalCount: cnt });
    }

    // 글귀 아카이브 즉시 업데이트 (위키인용집 + AI 현대·고전 큐레이션)
    if (pathname === '/api/passages/update-now' && req.method === 'POST') {
      const aiCreds = getUserActiveAiCredentials(user);
      const cfg = aiCreds.hasAiKey
        ? { provider: aiCreds.aiProvider, apiKey: aiCreds.activeKey }
        : getAnyAvailableAiConfig();
      const result = await runPeriodicPassageUpdate(db, CORPUS_DIR, () => cfg);
      return sendJson(res, 200, { ok: true, ...result });
    }

    // 다중 AI 프로바이더(Gemini / OpenAI / Claude) 설정 및 키 암호화 저장
    if ((pathname === '/api/ai/config' || pathname === '/api/ai/key') && req.method === 'POST') {
      const body = await parseBody(req);
      const provider = ['gemini', 'openai', 'claude'].includes(body.provider)
        ? body.provider
        : (user.ai_provider || 'gemini');

      const colMap = {
        gemini: 'gemini_key',
        openai: 'openai_key',
        claude: 'claude_key'
      };
      const col = colMap[provider];

      // 프로바이더 탭 전환만 요청한 경우
      if (body.selectOnly) {
        db.prepare('UPDATE users SET ai_provider = ? WHERE id = ?').run(provider, user.id);
        const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        const st = getUserAiStatus(refreshed);
        return sendJson(res, 200, { ok: true, ...st });
      }

      const nextKey = String(body.apiKey || '').trim();
      if (!nextKey) {
        db.prepare(`UPDATE users SET ${col} = '' WHERE id = ?`).run(user.id);
        const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        const st = getUserAiStatus(refreshed);
        return sendJson(res, 200, { ok: true, ...st });
      }

      try {
        const model = await verifyProviderKey(provider, nextKey);
        db.prepare(`UPDATE users SET ai_provider = ?, ${col} = ? WHERE id = ?`).run(
          provider,
          encryptSecret(nextKey),
          user.id
        );
        const refreshed = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
        const st = getUserAiStatus(refreshed);

        // 키가 등록되면 백그라운드에서 현대·고전 글귀 아카이브도 한 차례 풍성하게 보강
        runPeriodicPassageUpdate(db, CORPUS_DIR, () => ({ provider, apiKey: nextKey })).catch(() => {});

        return sendJson(res, 200, { ok: true, model, ...st });
      } catch (_) {
        const label = provider === 'openai' ? 'OpenAI' : provider === 'claude' ? 'Claude' : 'Gemini';
        return sendJson(res, 400, { error: `유효하지 않은 ${label} API 키입니다. 키를 다시 확인해 주세요.` });
      }
    }

    if (pathname === '/api/weave' && req.method === 'POST') {
      const aiCreds = getUserActiveAiCredentials(user);
      if (!aiCreds.hasAiKey) {
        return sendJson(res, 400, { code: 'NO_API_KEY', error: 'AI API 키가 설정되지 않았습니다.' });
      }
      const body = await parseBody(req);
      try {
        const woven = await weaveNextParagraph({
          provider: aiCreds.aiProvider,
          apiKey: aiCreds.activeKey,
          direction: body.direction || 'reson',
          editorText: body.editorText || '',
          avoidAuthors: Array.isArray(body.avoidAuthors) ? body.avoidAuthors : [],
          styleOptions: body.styleOptions || {},
          currentDraft: body.currentDraft || null
        });
        return sendJson(res, 200, woven);
      } catch (err) {
        if (err.message === 'INVALID_API_KEY') {
          return sendJson(res, 400, { code: 'INVALID_API_KEY', error: '설정된 API 키가 유효하지 않습니다.' });
        }
        return sendJson(res, 502, { error: err.message || 'AI 직조 중 오류가 발생했습니다.' });
      }
    }

    let filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403, SECURITY_HEADERS);
      return res.end('Forbidden');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, SECURITY_HEADERS);
      res.end('Not Found');
    }
  } catch (err) {
    console.error('[Server Error]', err);
    sendJson(res, 500, { error: '요청을 처리하는 중 서버 오류가 발생했습니다.' });
  }
});

function startCloudflareTunnel(port) {
  const cfPath = '/opt/homebrew/bin/cloudflared';
  if (!fs.existsSync(cfPath)) return;
  try {
    const cf = spawn(cfPath, ['tunnel', '--url', `http://127.0.0.1:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const onData = chunk => {
      const match = chunk.toString().match(/https:\/\/(?!api\.)[a-zA-Z0-9-]+\.trycloudflare\.com/);
      if (match) {
        activeTunnelUrl = match[0];
        fs.writeFileSync(TUNNEL_FILE, activeTunnelUrl, 'utf8');
        console.log(`🌐 외부 모바일 접속: ${activeTunnelUrl}`);
      }
    };
    cf.stdout.on('data', onData);
    cf.stderr.on('data', onData);
    cf.on('close', () => {
      setTimeout(() => startCloudflareTunnel(port), 3000);
    });
    process.on('exit', () => { try { cf.kill(); } catch (_) {} });
  } catch (_) {}
}

function startServer(port) {
  server.once('error', err => {
    if (err.code === 'EADDRINUSE') startServer(port + 1);
  });
  server.listen(port, '0.0.0.0', () => {
    activePort = port;
    console.log(`💻 로컬 접속: http://localhost:${port}`);
    console.log(`📱 Wi-Fi 접속: http://${getLanIp()}:${port}`);
    startCloudflareTunnel(port);
  });
}

startServer(PORT);
