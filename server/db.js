const isPg = !!process.env.DATABASE_URL;

let pool, db;

if (isPg) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
}

function getDb() {
  if (!db) {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(__dirname, 'data');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(path.join(dir, 'bills.db'));
  }
  return db;
}

function translateQuery(sql, params) {
  // SQLite uses ? instead of $1, $2 — params must be reordered to match appearance order
  const orderedParams = [];
  const translated = sql.replace(/\$(\d+)/g, (_, n) => {
    orderedParams.push(params[parseInt(n, 10) - 1]);
    return '?';
  });
  return { sql: translated, params: orderedParams };
}

async function query(sql, params = []) {
  if (isPg) {
    const res = await pool.query(sql, params);
    return { rows: res.rows };
  } else {
    const hasReturning = /RETURNING\s+\*/i.test(sql);
    const isInsert = /^\s*INSERT/i.test(sql);
    const isUpdate = /^\s*UPDATE/i.test(sql);
    const isDelete = /^\s*DELETE/i.test(sql);

    let { sql: translatedSql, params: translatedParams } = translateQuery(sql, params);
    params = translatedParams;

    if (hasReturning) {
      // Remove RETURNING * for SQLite
      translatedSql = translatedSql.replace(/\s+RETURNING\s+\*/i, '');
    }

    const _db = getDb();
    if (isInsert && hasReturning) {
      const stmt = _db.prepare(translatedSql);
      const info = stmt.run(...params);
      const lastId = info.lastInsertRowid;
      const tableMatch = translatedSql.match(/INSERT INTO\s+(\w+)/i);
      const table = tableMatch ? tableMatch[1] : null;
      if (table && lastId) {
        const row = _db.prepare(`SELECT * FROM ${table} WHERE rowid = ?`).get(lastId);
        return { rows: row ? [row] : [] };
      }
      return { rows: [] };
    } else if ((isUpdate || isDelete) && hasReturning) {
      if (isUpdate) {
        const whereMatch = translatedSql.match(/WHERE\s+(.+)/i);
        const tableMatch = translatedSql.match(/UPDATE\s+(\w+)/i);
        const stmt = _db.prepare(translatedSql);
        stmt.run(...params);
        const table = tableMatch ? tableMatch[1] : null;
        if (table && whereMatch) {
          const selectSql = `SELECT * FROM ${table} WHERE ${whereMatch[1]}`;
          try {
            const rows = _db.prepare(selectSql).all(...params.slice(-1));
            return { rows };
          } catch {
            return { rows: [] };
          }
        }
        return { rows: [] };
      } else {
        const stmt = _db.prepare(translatedSql);
        stmt.run(...params);
        return { rows: [] };
      }
    } else {
      const isSelect = /^\s*SELECT/i.test(translatedSql);
      const stmt = _db.prepare(translatedSql);
      if (isSelect) {
        const rows = stmt.all(...params);
        return { rows };
      } else {
        stmt.run(...params);
        return { rows: [] };
      }
    }
  }
}

function exec(sql) {
  if (isPg) {
    return pool.query(sql);
  } else {
    getDb().exec(sql);
  }
}

async function initDb() {
  if (!isPg) {
    getDb(); // ensures data dir + db file created
  }

  const createUsers = isPg
    ? `CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        partner_a TEXT DEFAULT '',
        partner_b TEXT DEFAULT ''
      )`
    : `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        partner_a TEXT DEFAULT '',
        partner_b TEXT DEFAULT ''
      )`;

  const createExpenses = isPg
    ? `CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        paid_by TEXT,
        amount REAL,
        split_type TEXT DEFAULT '50/50',
        split_pct_payer REAL DEFAULT 50,
        date TEXT,
        created_at TEXT
      )`
    : `CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        parent_id INTEGER REFERENCES expenses(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        paid_by TEXT,
        amount REAL,
        split_type TEXT DEFAULT '50/50',
        split_pct_payer REAL DEFAULT 50,
        date TEXT,
        created_at TEXT
      )`;

  const createSettlements = isPg
    ? `CREATE TABLE IF NOT EXISTS settlements (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        from_name TEXT NOT NULL,
        to_name TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        date TEXT NOT NULL,
        created_at TEXT
      )`
    : `CREATE TABLE IF NOT EXISTS settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        from_name TEXT NOT NULL,
        to_name TEXT NOT NULL,
        amount REAL NOT NULL,
        note TEXT,
        date TEXT NOT NULL,
        created_at TEXT
      )`;

  await exec(createUsers);
  await exec(createExpenses);
  await exec(createSettlements);
}

module.exports = { query, exec, initDb, isPg };
