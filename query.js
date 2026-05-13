// 数据库查看工具
// 用法: node query.js              → 查看所有用户
//       node query.js readings     → 查看占卜历史
//       node query.js all          → 查看全部

const db = require('./db');
db.open();

const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const raw = new DatabaseSync(path.join(__dirname, 'data', 'taluo.db'));

const mode = process.argv[2] || 'users';

if (mode === 'users' || mode === 'all') {
  console.log('\n👤 ====== 用户列表 ======\n');
  const users = raw.prepare('SELECT username, gender, birth_date, created_at, last_login FROM users ORDER BY created_at DESC').all();
  if (users.length === 0) {
    console.log('  (暂无用户)');
  } else {
    users.forEach(u => {
      console.log(`  ${u.username}`);
      console.log(`    性别: ${u.gender}  出生: ${u.birth_date}`);
      console.log(`    注册: ${u.created_at}  最后登录: ${u.last_login}`);
      console.log('');
    });
  }
}

if (mode === 'readings' || mode === 'all') {
  console.log('📜 ====== 占卜历史 ======\n');
  const readings = raw.prepare('SELECT r.username, r.spread, r.cards, r.created_at FROM readings r ORDER BY r.created_at DESC LIMIT 30').all();
  if (readings.length === 0) {
    console.log('  (暂无记录)');
  } else {
    readings.forEach((r, i) => {
      const cards = JSON.parse(r.cards);
      console.log(`  #${i + 1}  ${r.username}  |  ${r.spread}  |  ${r.created_at}`);
      cards.forEach(c => {
        const arrow = c.isReversed ? '⬇' : '⬆';
        console.log(`     ${arrow} ${c.position}: ${c.name_zh} (${c.name})`);
      });
      console.log('');
    });
  }
}

raw.close();
db.close();
