const express = require('express');
const router = express.Router();
const { query } = require('../db');
const archiver = require('archiver');
const multer = require('multer');
const unzipper = require('unzipper');
const { parse } = require('csv-parse/sync');

const upload = multer({ storage: multer.memoryStorage() });

function toCsv(columns, rows) {
  const header = columns.join(',');
  const lines = rows.map(row =>
    columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      const s = String(val);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

router.get('/export', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });

  const expensesResult = await query(
    `SELECT id, parent_id, description, paid_by, amount, split_type, split_pct_payer, date FROM expenses WHERE user_id = $1 ORDER BY id`,
    [req.userId]
  );
  const settlementsResult = await query(
    `SELECT id, from_name, to_name, amount, note, date FROM settlements WHERE user_id = $1 ORDER BY id`,
    [req.userId]
  );

  const expensesCsv = toCsv(['id', 'parent_id', 'description', 'paid_by', 'amount', 'split_type', 'split_pct_payer', 'date'], expensesResult.rows);
  const settlementsCsv = toCsv(['id', 'from_name', 'to_name', 'amount', 'note', 'date'], settlementsResult.rows);

  const timestamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="bebebills3-${timestamp}.zip"`);

  const archive = archiver('zip');
  archive.pipe(res);
  archive.append(expensesCsv, { name: 'expenses.csv' });
  archive.append(settlementsCsv, { name: 'settlements.csv' });
  archive.finalize();
});

router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const dir = await unzipper.Open.buffer(req.file.buffer);
    const expensesFile = dir.files.find(f => f.path === 'expenses.csv');
    const settlementsFile = dir.files.find(f => f.path === 'settlements.csv');

    if (!expensesFile || !settlementsFile) return res.status(400).json({ error: 'Invalid zip — missing expenses.csv or settlements.csv' });

    const expensesCsv = await expensesFile.buffer();
    const settlementsCsv = await settlementsFile.buffer();

    const expenses = parse(expensesCsv, { columns: true, skip_empty_lines: true });
    const settlements = parse(settlementsCsv, { columns: true, skip_empty_lines: true });

    // Clear existing data
    await query(`DELETE FROM settlements WHERE user_id = $1`, [req.userId]);
    await query(`DELETE FROM expenses WHERE user_id = $1`, [req.userId]);

    // Re-insert expenses (must handle parent_id references)
    const idMap = {}; // old id → new id
    // Insert top-level first, then children
    const topLevel = expenses.filter(e => !e.parent_id);
    const children = expenses.filter(e => e.parent_id);

    for (const e of topLevel) {
      const now = new Date().toISOString();
      const result = await query(
        `INSERT INTO expenses (user_id, parent_id, description, paid_by, amount, split_type, split_pct_payer, date, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [req.userId, null, e.description, e.paid_by || null, e.amount || null, e.split_type || '50/50', e.split_pct_payer || 50, e.date || null, now]
      );
      idMap[e.id] = result.rows[0].id;
    }

    for (const e of children) {
      const newParentId = idMap[e.parent_id];
      if (!newParentId) continue;
      const now = new Date().toISOString();
      await query(
        `INSERT INTO expenses (user_id, parent_id, description, paid_by, amount, split_type, split_pct_payer, date, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [req.userId, newParentId, e.description, e.paid_by || null, e.amount || null, e.split_type || '50/50', e.split_pct_payer || 50, e.date || null, new Date().toISOString()]
      );
    }

    for (const s of settlements) {
      await query(
        `INSERT INTO settlements (user_id, from_name, to_name, amount, note, date, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.userId, s.from_name, s.to_name, s.amount, s.note || null, s.date, new Date().toISOString()]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
