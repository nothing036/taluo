const express = require('express');
const path = require('path');
const crypto = require('crypto');
const compression = require('compression');
const db = require('./db');
const tarotCards = require('./data/tarot-cards.json');

const app = express();
const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '127.0.0.1';

// Gzip 压缩
app.use(compression());

// 静态文件缓存（1 小时）
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

// 信任反向代理
try { app.set('trust proxy', 1); } catch (e) {}

// 初始化数据库
db.open();
console.log(`🗄️  数据库路径: ${path.join(__dirname, 'data', 'taluo.db')}`);

app.use(express.json());

// ---- 密码哈希 ----
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  const check = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  return check === hash;
}

// ---- 管理员认证 ----
const ADMIN_SALT = crypto.randomBytes(16).toString('hex');
const ADMIN_HASH = crypto.pbkdf2Sync('xz200366', ADMIN_SALT, 100000, 64, 'sha512').toString('hex');
const adminSessions = new Map();

function checkAdmin(token) {
  return adminSessions.get(token) || null;
}

// 管理员登录
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username !== 'nothing') {
    return res.status(401).json({ error: '管理员账号错误' });
  }
  const check = crypto.pbkdf2Sync(password, ADMIN_SALT, 100000, 64, 'sha512').toString('hex');
  if (check !== ADMIN_HASH) {
    return res.status(401).json({ error: '密码错误' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, { username, loginAt: Date.now() });
  res.json({ ok: true, token });
});

// 管理员鉴权中间件
function adminAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !checkAdmin(token)) {
    return res.status(401).json({ error: '请先登录管理员账号' });
  }
  next();
}

// ---- 会话管理 ----
const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    username: user.username,
    gender: user.gender,
    birthDate: user.birthDate || user.birth_date,
    createdAt: Date.now(),
  });
  return token;
}

function getSession(token) {
  return sessions.get(token) || null;
}

// ---- 鉴权中间件 ----
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  req.user = token ? getSession(token) : null;
  req.token = token;
  next();
}

// ---- 用户 API ----

// 注册
app.post('/api/auth/register', (req, res) => {
  const { username, password, gender, birthDate, phone } = req.body;

  if (!username || !password || !gender || !birthDate || !phone) {
    return res.status(400).json({ error: '请填写所有必填字段' });
  }
  if (username.length < 2 || username.length > 20) {
    return res.status(400).json({ error: '用户名 2-20 个字符' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: '密码至少 4 位' });
  }
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ error: '请输入有效的手机号' });
  }
  if (db.findUser(username)) {
    return res.status(409).json({ error: '用户名已被注册' });
  }
  if (db.findUserByPhone(phone)) {
    return res.status(409).json({ error: '该手机号已被注册，请直接登录' });
  }

  const { salt, hash } = hashPassword(password);
  const now = new Date().toISOString();
  const user = { username, salt, hash, gender, birthDate, phone, createdAt: now, lastLogin: now };
  db.createUser(user);

  const sessionUser = { username, gender, birthDate, phone };
  const token = createSession(sessionUser);
  res.json({ ok: true, token, user: sessionUser });
});

// 登录
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.findUser(username);
  if (!user || !verifyPassword(password, user.salt, user.hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  db.updateLastLogin(username, new Date().toISOString());

  const sessionUser = { username: user.username, gender: user.gender, birthDate: user.birth_date, phone: user.phone };
  const token = createSession(sessionUser);
  res.json({ ok: true, token, user: sessionUser });
});

// 获取当前用户
app.get('/api/auth/whoami', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  res.json(req.user);
});

// 登出
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  if (req.token) sessions.delete(req.token);
  res.json({ ok: true });
});

// 获取占卜历史
app.get('/api/auth/history', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  const readings = db.getReadings(req.user.username);
  res.json(readings.map(r => ({ ...r, cards: JSON.parse(r.cards) })));
});

// 保存占卜历史
app.post('/api/auth/history', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: '未登录' });
  const { spread, cards, timestamp } = req.body;
  db.addReading(req.user.username, spread, cards, timestamp);
  res.json({ ok: true });
});

// ---- 洗牌算法 ----
function shuffleDeck() {
  const deck = [...tarotCards];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// 抽 N 张牌，每张随机正逆位
function drawCards(count = 1) {
  const deck = shuffleDeck();
  return deck.slice(0, count).map(card => ({
    ...card,
    isReversed: Math.random() < 0.5,
  }));
}

// ---- API ----

// 获取全部卡牌列表
app.get('/api/cards', (_req, res) => {
  res.json(tarotCards);
});

// 获取单张卡牌详情
app.get('/api/cards/:id', (req, res) => {
  const card = tarotCards.find(c => c.id === req.params.id);
  if (!card) return res.status(404).json({ error: '未找到该卡牌' });
  res.json(card);
});

// 洗牌 - 返回整副随机排序的牌
app.get('/api/shuffle', (_req, res) => {
  res.json(shuffleDeck());
});

// 抽牌 - 支持单张、三张、凯尔特十字（需登录，每日唯一）
app.post('/api/draw', authMiddleware, (req, res) => {
  if (!req.user) return res.status(401).json({ error: '请先登录' });

  const { spread } = req.body;

  // 检查今日该牌阵是否已占卜
  const todayReading = db.getTodayReading(req.user.username, spread || 'single');
  if (todayReading) {
    const cards = JSON.parse(todayReading.cards);
    return res.json({
      spread: todayReading.spread,
      timestamp: todayReading.created_at,
      cards,
      isRepeat: true,
      message: '命运不喜贪婪的追问。今日的启示已经降临，请静心回味，明日再来探寻新的指引。',
    });
  }

  let count, positions;

  switch (spread) {
    case 'three':
      count = 3;
      positions = ['过去', '现在', '未来'];
      break;
    case 'celtic':
      count = 10;
      positions = [
        '当前状况', '阻碍/助力', '基础/根源', '过去', '目标/愿望',
        '不久的将来', '自我认知', '外部环境', '希望与恐惧', '最终结果'
      ];
      break;
    case 'single':
    default:
      count = 1;
      positions = ['启示'];
      break;
  }

  const cards = drawCards(count);
  const reading = cards.map((card, i) => ({
    position: positions[i],
    ...card,
  }));

  res.json({ spread: spread || 'single', timestamp: new Date().toISOString(), cards: reading });
});

// ---- 运势总结生成 ----
function generateSummary(cards, spread) {
  const total = cards.length;
  const reversedCount = cards.filter(c => c.isReversed).length;
  const majorCount = cards.filter(c => c.type === 'major').length;
  const elements = {};
  cards.forEach(c => { if (c.element) elements[c.element] = (elements[c.element] || 0) + 1; });

  const revRatio = reversedCount / total;
  let tone, toneDesc;
  if (revRatio >= 0.6) {
    tone = '试炼';
    toneDesc = '逆位的能量占据主导，命运正在向你发出挑战。这不是厄运，而是宇宙在敦促你面对那些被忽略的阴影。每一张逆位牌都是一面镜子，映照出你内心深处尚未疗愈的部分。';
  } else if (revRatio <= 0.2) {
    tone = '恩赐';
    toneDesc = '星辰为你排列成祝福的阵列。正位的能量如潮水般涌来，宇宙此刻站在你这一边。但请记住——顺境之中，真正的智慧是保持清醒与感恩，而非沉溺于好运的幻觉。';
  } else {
    tone = '平衡';
    toneDesc = '光明与阴影在此刻交织，正如同日月交替、潮汐涨落。命运并非非黑即白的审判，而是一场精妙的舞蹈。正位的光芒为你照亮前路，逆位的暗影则提醒你留意脚下的路。';
  }

  let arcanaNote = '';
  if (majorCount >= total * 0.5) {
    arcanaNote = '此次牌阵中大阿尔克纳频繁显现，这意味着你正站在命运的转折点上。这些古老的 archetypes 不是寻常的过客——它们是你灵魂旅程中的里程碑，是宇宙借牌面之口向你传递的深刻寓言。';
  } else if (majorCount === 0) {
    arcanaNote = '此次牌阵中不见大阿尔克纳的身影，命运将目光聚焦于你日常生活的纹理之中。小阿尔克纳在提醒你：真正的转变往往孕育于平凡的时刻——一次对话、一个决定、一次日复一日的坚持。';
  } else {
    arcanaNote = `牌阵中${majorCount}张大阿尔克纳与${total - majorCount}张小阿尔克纳共舞——命运的宏大叙事与日常的细微脉动在此交汇。大牌为你指明灵魂的方向，小牌则在日常的缝隙中为你铺路。`;
  }

  const elemNames = { '火': '火焰', '水': '流水', '风': '清风', '土': '大地' };
  const elemMeanings = {
    '火': '激情的火花在牌阵中跃动，行动与创造的渴望正灼烧着你的灵魂。权杖之火在问：你准备好点燃什么了吗？',
    '水': '情感的潮水在牌阵中流淌，直觉与爱的波浪正轻拍你的心岸。圣杯之水在问：你聆听到内心深处的声音了吗？',
    '风': '思想的利刃在牌阵中划过，理性与真相的清风正穿透迷雾。宝剑之风在问：你敢直面那个不愿承认的真相吗？',
    '土': '物质的根基在牌阵中稳固，务实与丰盛的大地正支撑着你的脚步。星币之土在问：你在建造的，是一座城堡还是一座牢笼？'
  };
  const sortedElems = Object.entries(elements).sort((a, b) => b[1] - a[1]);
  let elemNote = '';
  if (sortedElems.length > 0) {
    const topElem = sortedElems[0][0];
    elemNote = elemMeanings[topElem] || '';
    if (sortedElems.length > 1) {
      const secondElem = sortedElems[1][0];
      elemNote += ` 与此同时，${elemNames[secondElem] || secondElem}的能量也在暗处涌动，提醒你不要忽略了生命的另一个维度。`;
    }
  }

  const keyCards = cards
    .filter(c => c.type === 'major' || c.rank === 'Ace' || c.rank === '10' || c.rank === 'King' || c.rank === 'Queen')
    .slice(0, 3);
  let keyNote = '';
  if (keyCards.length > 0) {
    keyNote = '命运之神托付给你的关键牌面：' +
      keyCards.map(c => `「${c.name_zh}」`).join('、') +
      '。它们是你此次占卜中的锚点，请特别留意它们传递的信息。';
  }

  const spreadIntros = {
    single: '你抽出的这张牌，是宇宙在这个时刻为你单独准备的箴言。它如同一束光，穿透了时间与空间的帷幕，精准地落入了你的生命中。',
    three: '过去、现在、未来——时间并非一条直线，而是一张无限折叠的织锦。这三张牌为你掀开了时间帷幕的一角，让你得以窥见命运的因果之链。',
    celtic: '凯尔特十字是最古老的牌阵之一，如同一面灵魂的镜子。十张牌从十个维度解剖你的处境——从表层到深渊、从内在到外在、从已知到未知。命运在此刻不再是一个谜题，而是一幅你可以细细端详的地图。'
  };

  const closings = [
    '记住，塔罗牌从不会告诉你一个注定的结局，它只是映照出当下能量的流向。命运之笔始终握在你自己手中——牌面只是风中的低语，决定航向的，永远是你手中的舵。',
    '这张牌阵是一封来自宇宙的信。它没有封口，也没有署名——因为寄信人和收信人，都是你自己。读懂它，然后带着这份觉知，继续你的旅程。',
    '最后请记住古老的塔罗箴言：牌面揭示的是可能性，而非必然性。你的每一个选择都在重塑命运的纹路。带着这份洞见前行吧，你不是在阅读命运——你是在书写命运。'
  ];

  return {
    tone, toneDesc, arcanaNote, elemNote, keyNote,
    spreadIntro: spreadIntros[spread] || spreadIntros.single,
    closing: closings[Math.floor(Math.random() * closings.length)],
    cardCount: total, reversedCount, majorCount,
  };
}

// 运势总结 API
app.post('/api/summary', (req, res) => {
  const { cards, spread } = req.body;
  if (!cards || !Array.isArray(cards)) {
    return res.status(400).json({ error: '请提供抽到的牌面数据' });
  }
  res.json(generateSummary(cards, spread || 'single'));
});

// ---- 后台管理 API ----

// 管理员登录页
app.get('/admin-login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// 管理员页面
app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 获取所有用户（需鉴权）
app.get('/api/admin/users', adminAuth, (_req, res) => {
  const raw = new (require('node:sqlite').DatabaseSync)(path.join(__dirname, 'data', 'taluo.db'));
  const users = raw.prepare('SELECT username, gender, phone, birth_date, created_at, last_login FROM users ORDER BY created_at DESC').all();
  raw.close();
  res.json(users);
});

// 获取所有占卜记录（需鉴权）
app.get('/api/admin/readings', adminAuth, (_req, res) => {
  const raw = new (require('node:sqlite').DatabaseSync)(path.join(__dirname, 'data', 'taluo.db'));
  const readings = raw.prepare('SELECT id, username, spread, cards, created_at FROM readings ORDER BY created_at DESC').all();
  raw.close();
  res.json(readings.map(r => ({ ...r, cards: JSON.parse(r.cards) })));
});

// 删除用户（需鉴权）
app.delete('/api/admin/users/:username', adminAuth, (req, res) => {
  const raw = new (require('node:sqlite').DatabaseSync)(path.join(__dirname, 'data', 'taluo.db'));
  raw.prepare('DELETE FROM readings WHERE username = ?').run(req.params.username);
  raw.prepare('DELETE FROM users WHERE username = ?').run(req.params.username);
  raw.close();
  res.json({ ok: true });
});

// 删除占卜记录（需鉴权）
app.delete('/api/admin/readings/:id', adminAuth, (req, res) => {
  const raw = new (require('node:sqlite').DatabaseSync)(path.join(__dirname, 'data', 'taluo.db'));
  raw.prepare('DELETE FROM readings WHERE id = ?').run(req.params.id);
  raw.close();
  res.json({ ok: true });
});

// ---- 优雅退出 ----
process.on('SIGINT', () => { db.close(); process.exit(); });
process.on('SIGTERM', () => { db.close(); process.exit(); });

app.listen(PORT, HOST, () => {
  console.log(`🔮 塔罗牌占卜系统已启动 → http://${HOST}:${PORT}`);
  console.log(`👤 后台管理 → http://${HOST}:${PORT}/admin`);
  console.log(`🗄️  数据库: ${path.join(__dirname, 'data', 'taluo.db')}`);
});
