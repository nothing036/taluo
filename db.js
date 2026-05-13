const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data', 'taluo.db');

let db;

function open() {
  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode=WAL');
  db.exec('PRAGMA foreign_keys=ON');
  initTables();
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      username   TEXT PRIMARY KEY,
      salt       TEXT NOT NULL,
      hash       TEXT NOT NULL,
      gender     TEXT NOT NULL,
      birth_date TEXT NOT NULL,
      phone      TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      last_login TEXT NOT NULL
    )
  `);

  // 迁移：给旧表加 phone 列
  try { db.exec('ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT \'\''); }
  catch (e) { /* 列已存在 */ }

  db.exec(`
    CREATE TABLE IF NOT EXISTS readings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL,
      spread     TEXT NOT NULL,
      cards      TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (username) REFERENCES users(username)
    )
  `);

  db.exec('CREATE INDEX IF NOT EXISTS idx_readings_username ON readings(username)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_readings_created ON readings(created_at DESC)');
}

// ---- 用户操作 ----

function findUser(username) {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username);
}

function findUserByPhone(phone) {
  if (!phone) return null;
  return db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
}

function createUser(user) {
  const stmt = db.prepare(`
    INSERT INTO users (username, salt, hash, gender, birth_date, phone, created_at, last_login)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(user.username, user.salt, user.hash, user.gender, user.birthDate, user.phone || '', user.createdAt, user.lastLogin);
  return { username: user.username, gender: user.gender, birthDate: user.birthDate, phone: user.phone };
}

function updateLastLogin(username, time) {
  db.prepare('UPDATE users SET last_login = ? WHERE username = ?').run(time, username);
}

// ---- 占卜历史 ----

function getReadings(username, limit = 50) {
  return db.prepare(
    'SELECT * FROM readings WHERE username = ? ORDER BY created_at DESC LIMIT ?'
  ).all(username, limit);
}

function addReading(username, spread, cards, timestamp) {
  db.prepare(
    'INSERT INTO readings (username, spread, cards, created_at) VALUES (?, ?, ?, ?)'
  ).run(username, spread, JSON.stringify(cards), timestamp);

  // 保留最近 50 条
  const count = db.prepare(
    'SELECT COUNT(*) as cnt FROM readings WHERE username = ?'
  ).get(username).cnt;
  if (count > 50) {
    db.prepare(`
      DELETE FROM readings WHERE id IN (
        SELECT id FROM readings WHERE username = ? ORDER BY created_at DESC LIMIT -1 OFFSET 50
      )
    `).run(username);
  }
}

// ---- 每日占卜检测 ----

function getTodayReading(username, spread) {
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return db.prepare(
    'SELECT * FROM readings WHERE username = ? AND spread = ? AND created_at >= ? ORDER BY created_at ASC LIMIT 1'
  ).get(username, spread, today);
}

function close() {
  if (db) db.close();
}

module.exports = { open, findUser, findUserByPhone, createUser, updateLastLogin, getReadings, addReading, getTodayReading, close };
