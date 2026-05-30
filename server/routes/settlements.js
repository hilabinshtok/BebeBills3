const express = require('express');
const router = express.Router();
const { query } = require('../db');

router.get('/', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
  const result = await query(`SELECT * FROM settlements WHERE user_id = $1 ORDER BY date DESC`, [req.userId]);
  res.json(result.rows);
});

router.post('/', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { from_name, to_name, amount, note, date } = req.body;
  if (!from_name || !to_name || !amount || !date) return res.status(400).json({ error: 'Missing required fields' });
  const now = new Date().toISOString();
  const result = await query(
    `INSERT INTO settlements (user_id, from_name, to_name, amount, note, date, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [req.userId, from_name, to_name, amount, note || null, date, now]
  );
  res.json(result.rows[0]);
});

router.delete('/:id', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
  await query(`DELETE FROM settlements WHERE id = $1 AND user_id = $2`, [req.params.id, req.userId]);
  res.json({ ok: true });
});

module.exports = router;
