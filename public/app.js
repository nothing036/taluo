// ====== 认证状态 ======
let authToken = localStorage.getItem('taluo_token');
let currentUser = null;
let authMode = 'login';

// ====== API 请求封装 ======
async function api(endpoint, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  return fetch(endpoint, { ...options, headers });
}

// ====== 初始化 —— 自动检测登录状态 ======
async function initAuth() {
  if (!authToken) return;
  try {
    const res = await api('/api/auth/whoami');
    if (res.ok) {
      currentUser = await res.json();
      showLoggedIn();
    } else {
      localStorage.removeItem('taluo_token');
      authToken = null;
    }
  } catch (e) { /* 服务器未启动 */ }
}

// ====== 弹窗控制 ======
function showAuthModal(mode) {
  authMode = mode;
  const modal = document.getElementById('auth-modal');
  const title = document.getElementById('auth-title');
  const fields = document.getElementById('register-fields');
  const submitBtn = document.getElementById('auth-submit-btn');
  const switchEl = document.getElementById('auth-switch');
  const errorEl = document.getElementById('auth-error');

  title.textContent = mode === 'login' ? '🔐 登录' : '✨ 注册';
  submitBtn.textContent = mode === 'login' ? '登录' : '注册';
  fields.classList.toggle('hidden', mode === 'login');
  errorEl.classList.add('hidden');

  // 清空字段
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  const phoneEl = document.getElementById('auth-phone');
  if (phoneEl) phoneEl.value = '';
  const birthEl = document.getElementById('auth-birth');
  if (birthEl) birthEl.value = '';
  submitBtn.disabled = false;

  if (mode === 'login') {
    switchEl.innerHTML = '还没有账号？<a href="#" onclick="switchAuthMode(\'register\')">立即注册</a>';
  } else {
    switchEl.innerHTML = '已有账号？<a href="#" onclick="switchAuthMode(\'login\')">去登录</a>';
  }

  modal.classList.remove('hidden');

  // Enter 键提交
  document.getElementById('auth-password').onkeydown = (e) => {
    if (e.key === 'Enter') handleAuth();
  };
  const phoneInput = document.getElementById('auth-phone');
  if (phoneInput) {
    phoneInput.onkeydown = (e) => { if (e.key === 'Enter') handleAuth(); };
  }
}

function closeAuthModal() {
  document.getElementById('auth-modal').classList.add('hidden');
  document.getElementById('auth-error').classList.add('hidden');
  // 清空所有输入
  document.getElementById('auth-username').value = '';
  document.getElementById('auth-password').value = '';
  const phoneEl = document.getElementById('auth-phone');
  if (phoneEl) phoneEl.value = '';
  const birthEl = document.getElementById('auth-birth');
  if (birthEl) birthEl.value = '';
  const submitBtn = document.getElementById('auth-submit-btn');
  submitBtn.disabled = false;
  submitBtn.textContent = authMode === 'login' ? '登录' : '注册';
}

function switchAuthMode(mode) {
  authMode = mode;
  document.getElementById('auth-error').classList.add('hidden');
  const title = document.getElementById('auth-title');
  const fields = document.getElementById('register-fields');
  const submitBtn = document.getElementById('auth-submit-btn');
  const switchEl = document.getElementById('auth-switch');

  title.textContent = mode === 'login' ? '🔐 登录' : '✨ 注册';
  submitBtn.textContent = mode === 'login' ? '登录' : '注册';
  submitBtn.disabled = false;
  fields.classList.toggle('hidden', mode === 'login');

  if (mode === 'login') {
    switchEl.innerHTML = '还没有账号？<a href="#" onclick="switchAuthMode(\'register\')">立即注册</a>';
  } else {
    switchEl.innerHTML = '已有账号？<a href="#" onclick="switchAuthMode(\'login\')">去登录</a>';
  }
}

// ====== 处理登录/注册 ======
async function handleAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');
  const submitBtn = document.getElementById('auth-submit-btn');

  errorEl.classList.add('hidden');
  submitBtn.disabled = true;
  submitBtn.textContent = '处理中...';

  const body = { username, password };
  if (authMode === 'register') {
    const gender = document.querySelector('input[name="gender"]:checked')?.value || '男';
    const birthDate = document.getElementById('auth-birth').value;
    const phone = document.getElementById('auth-phone').value.trim();
    if (!birthDate) {
      showAuthError('请选择出生日期');
      submitBtn.disabled = false;
      submitBtn.textContent = '注册';
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      showAuthError('请输入有效的手机号');
      submitBtn.disabled = false;
      submitBtn.textContent = '注册';
      return;
    }
    body.gender = gender;
    body.birthDate = birthDate;
    body.phone = phone;
  }

  try {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const res = await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
    const data = await res.json();

    if (!res.ok) {
      showAuthError(data.error || '操作失败');
      submitBtn.disabled = false;
      submitBtn.textContent = authMode === 'login' ? '登录' : '注册';
      return;
    }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('taluo_token', authToken);
    showLoggedIn();
    closeAuthModal();
    showToast(`🌟 欢迎，${currentUser.username}`);
  } catch (err) {
    showAuthError('网络错误，请确认服务器已启动');
    submitBtn.disabled = false;
    submitBtn.textContent = authMode === 'login' ? '登录' : '注册';
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function showLoggedIn() {
  document.getElementById('auth-area').classList.add('hidden');
  document.getElementById('user-area').classList.remove('hidden');
  document.getElementById('history-entry').classList.remove('hidden');
  const genderEmoji = currentUser.gender === '女' ? '👩' : currentUser.gender === '男' ? '👨' : '🧑';
  document.getElementById('user-greeting').textContent = `${genderEmoji} ${currentUser.username}`;
}

// ====== 登出 ======
async function logout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  authToken = null;
  currentUser = null;
  localStorage.removeItem('taluo_token');
  document.getElementById('auth-area').classList.remove('hidden');
  document.getElementById('user-area').classList.add('hidden');
  document.getElementById('history-entry').classList.add('hidden');
  goHome();
  showToast('已退出登录');
}

// ====== 记录占卜历史 ======
async function saveReading(cards, spread) {
  if (!authToken) return;
  try {
    await api('/api/auth/history', {
      method: 'POST',
      body: JSON.stringify({
        spread,
        cards: cards.map(c => ({
          id: c.id,
          name: c.name,
          name_zh: c.name_zh,
          position: c.position,
          isReversed: c.isReversed,
        })),
        timestamp: new Date().toISOString(),
      })
    });
  } catch (e) { /* 静默失败 */ }
}

// ====== 状态 ======
let currentSpread = 'single';
let drawnCards = [];
let isFirstDraw = true;

// ====== 选择牌阵 → 自动开始洗牌 ======
function selectSpread(spread) {
  if (!authToken) {
    showToast('🔐 请先登录或注册');
    showAuthModal('login');
    return;
  }
  currentSpread = spread;
  isFirstDraw = true;
  const titles = {
    single: '单张抽牌',
    three: '三张牌阵 — 过去·现在·未来',
    celtic: '凯尔特十字 — 深度解读'
  };
  const instructions = {
    single: '静心冥想你的问题，然后抽取今日启示',
    three: '三张牌分别代表你的过去、现在和未来',
    celtic: '十张牌全方位解读你的状况、挑战和最终结果'
  };

  document.getElementById('home').classList.remove('active');
  document.getElementById('draw').classList.add('active');
  document.getElementById('result').classList.remove('active');

  document.getElementById('draw-title').textContent = titles[spread];
  document.getElementById('draw-instruction').textContent = instructions[spread];

  resetDrawUI();
  drawnCards = [];

  // 自动开始洗牌
  startDraw();
}

// ====== 重置抽牌 UI ======
function resetDrawUI() {
  document.getElementById('cards-area').innerHTML = '';
  document.getElementById('cards-area').className = currentSpread === 'celtic' ? 'celtic' : '';
  document.getElementById('reveal-btn').classList.add('hidden');
  const btn = document.getElementById('shuffle-btn');
  btn.classList.remove('hidden', 'shuffling');
  btn.textContent = '✨ 洗牌中...';
  btn.disabled = false;
}

// ====== 洗牌 & 抽牌 ======
async function startDraw() {
  const btn = document.getElementById('shuffle-btn');

  // 首次抽牌：显示洗牌动画
  if (isFirstDraw) {
    btn.classList.add('shuffling');
    btn.textContent = '🔮 连接宇宙能量...';
  } else {
    btn.classList.add('shuffling');
    btn.textContent = '🔮 重新洗牌...';
  }

  try {
    const res = await api('/api/draw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spread: currentSpread })
    });
    const data = await res.json();

    if (res.status === 401) {
      showToast('🔐 登录已过期，请重新登录');
      logout();
      return;
    }

    // 今日已占卜，直接展示之前的牌
    if (data.isRepeat) {
      btn.classList.remove('shuffling');
      btn.classList.add('hidden');
      drawnCards = data.cards;
      showToast(data.message);
      setTimeout(() => showInterpretation(true), 500);
      return;
    }

    drawnCards = data.cards;
  } catch (err) {
    showToast('⚠️ 连接服务器失败，请确认已启动后端');
    btn.classList.remove('shuffling');
    btn.textContent = '✨ 洗牌';
    return;
  }

  // 洗牌动画后展示背面卡牌
  const delay = isFirstDraw ? 1800 : 1200;
  setTimeout(() => {
    btn.classList.add('hidden');
    renderCardBacks();

    if (isFirstDraw) {
      // 首次：显示揭示按钮，等用户主动点击
      document.getElementById('reveal-btn').classList.remove('hidden');
      isFirstDraw = false;
    } else {
      // 后续：自动揭示
      setTimeout(autoReveal, 800);
    }
  }, delay);
}

// ====== 渲染背面卡牌 ======
function renderCardBacks() {
  const area = document.getElementById('cards-area');
  area.innerHTML = '';

  drawnCards.forEach((card, i) => {
    const el = document.createElement('div');
    el.className = 'tarot-card';
    el.innerHTML = `
      <div class="card-inner" id="card-${i}">
        <div class="card-face card-back">
          <span class="card-position">${card.position}</span>
        </div>
        <div class="card-face card-front ${card.isReversed ? 'reversed-face' : ''}">
          ${card.isReversed ? '<span class="card-reversed-badge">⬇ 逆位</span>' : ''}
          <span class="card-name">${card.name}</span>
          <span class="card-name-zh">${card.name_zh}</span>
          <span class="card-keywords">${card.keywords.slice(0, 3).join(' · ')}</span>
        </div>
      </div>
    `;
    area.appendChild(el);
  });
}

// ====== 一键揭示全部卡牌（用户点击） ======
function revealCards() {
  document.getElementById('reveal-btn').classList.add('hidden');
  flipAllCards();
  setTimeout(showInterpretation, 1200);
}

// ====== 自动揭示（再抽时自动触发） ======
function autoReveal() {
  flipAllCards();
  setTimeout(showInterpretation, 1500);
}

// ====== 翻转所有卡牌 ======
function flipAllCards() {
  drawnCards.forEach((_, i) => {
    const inner = document.getElementById(`card-${i}`);
    if (inner) inner.classList.add('revealed');
  });
}

// ====== 进入解读页 ======
async function showInterpretation(isRepeat = false) {
  document.getElementById('draw').classList.remove('active');
  document.getElementById('result').classList.add('active');

  const content = document.getElementById('result-content');
  content.innerHTML = '<div class="loading-summary">🌟 命运正在编织你的解读...</div>';

  // 获取命运总结
  let summary = null;
  try {
    const res = await api('/api/summary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cards: drawnCards, spread: currentSpread })
    });
    if (res.ok) summary = await res.json();
  } catch (e) { /* 降级 */ }

  content.innerHTML = '';

  // 重复占卜提示
  if (isRepeat) {
    const banner = document.createElement('div');
    banner.className = 'repeat-banner';
    banner.innerHTML = `
      <span>🌙</span>
      <span>命运已在今日回应过你的呼唤。以下是今日唯一的启示，请潜心领悟。</span>
    `;
    content.appendChild(banner);
  }

  // ---- 命运总结卡片 ----
  if (summary) {
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'summary-card';
    summaryDiv.innerHTML = `
      <div class="summary-header">
        <span class="summary-icon">🔮</span>
        <span class="summary-title">命运之眼</span>
        <span class="summary-tone tone-${summary.tone}">${summary.tone}</span>
      </div>
      <div class="summary-body">
        <p class="summary-intro">${summary.spreadIntro}</p>
        <p class="summary-tone-desc">${summary.toneDesc}</p>
        ${summary.arcanaNote ? `<p class="summary-arcana">${summary.arcanaNote}</p>` : ''}
        ${summary.elemNote ? `<p class="summary-elem">${summary.elemNote}</p>` : ''}
        ${summary.keyNote ? `<p class="summary-key">${summary.keyNote}</p>` : ''}
        <div class="summary-divider"></div>
        <p class="summary-closing">${summary.closing}</p>
      </div>
      <div class="summary-stats">
        <span>🃏 ${summary.cardCount} 张牌</span>
        <span>⬆ ${summary.cardCount - summary.reversedCount} 正 · ⬇ ${summary.reversedCount} 逆</span>
        <span>🌟 ${summary.majorCount} 大阿尔克纳</span>
      </div>
    `;
    content.appendChild(summaryDiv);
  }

  // ---- 单张牌详析 ----
  const detailTitle = document.createElement('h3');
  detailTitle.className = 'detail-section-title';
  detailTitle.textContent = '📜 各牌详析';
  content.appendChild(detailTitle);

  drawnCards.forEach(card => {
    const meaning = card.isReversed ? card.reversed : card.upright;
    const tagClass = card.isReversed ? 'reversed' : 'upright';
    const tagText = card.isReversed ? '逆位 ⬇' : '正位 ⬆';

    const div = document.createElement('div');
    div.className = 'result-card';
    div.innerHTML = `
      <div class="result-card-header">
        <span class="result-position ${card.isReversed ? 'reversed-pos' : ''}">${card.position}</span>
        <div>
          <div class="result-card-name">${card.name} · ${card.name_zh}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
            <span class="result-tag ${tagClass}">${tagText}</span>
            ${card.element ? `<span style="font-size:0.8em;color:var(--text-dim);">${card.element}元素</span>` : ''}
          </div>
        </div>
      </div>
      <div class="result-keywords">
        ${card.keywords.map(k => `<span class="result-keyword">${k}</span>`).join('')}
      </div>
      <div class="result-meaning">
        <h4>🪄 ${card.isReversed ? '逆位含义' : '正位含义'}</h4>
        <p>${meaning}</p>
      </div>
      <div class="result-description">${card.description}</div>
    `;
    content.appendChild(div);
  });

  // 保存占卜历史
  saveReading(drawnCards, currentSpread);

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ====== 再抽一次 → 自动洗牌 ======
function redraw() {
  document.getElementById('result').classList.remove('active');
  document.getElementById('draw').classList.add('active');
  resetDrawUI();
  drawnCards = [];
  startDraw();
}

// ====== 返回首页 ======
function goHome() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('home').classList.add('active');
}

// ====== Toast 提示 ======
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ====== 启动时初始化认证状态 ======
initAuth();

// ====== 查看占卜历史 ======
async function showHistory() {
  if (!authToken) {
    showToast('🔐 请先登录');
    showAuthModal('login');
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('history').classList.add('active');

  const content = document.getElementById('history-content');
  content.innerHTML = '<div class="loading-summary">📜 加载记录中...</div>';

  try {
    const res = await api('/api/auth/history');
    const readings = await res.json();
    content.innerHTML = '';

    if (!readings.length) {
      content.innerHTML = '<div class="empty-history">🌙 还没有占卜记录，去抽一张牌吧</div>';
      return;
    }

    const spreadNames = { single: '单张', three: '三张牌阵', celtic: '凯尔特十字' };

    readings.forEach((r, idx) => {
      const cards = typeof r.cards === 'string' ? JSON.parse(r.cards) : r.cards;
      const date = new Date(r.created_at);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;

      const div = document.createElement('div');
      div.className = 'history-card';
      div.innerHTML = `
        <div class="history-card-header">
          <span class="history-idx">#${readings.length - idx}</span>
          <span class="history-spread">${spreadNames[r.spread] || r.spread}</span>
          <span class="history-date">${dateStr}</span>
        </div>
        <div class="history-cards">
          ${cards.map(c => `
            <div class="history-card-item ${c.isReversed ? 'rev' : 'up'}">
              <span class="hc-pos">${c.position}</span>
              <span class="hc-name">${c.name_zh}</span>
              <span class="hc-arrow">${c.isReversed ? '⬇逆' : '⬆正'}</span>
            </div>
          `).join('')}
        </div>
      `;
      content.appendChild(div);
    });
  } catch (e) {
    content.innerHTML = '<div class="empty-history">⚠️ 加载失败，请确认服务器已启动</div>';
  }
}
