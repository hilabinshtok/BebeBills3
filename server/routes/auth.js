const express = require('express');
const router = express.Router();
const { query } = require('../db');

router.post('/signup', async (req, res) => {
  const { username, password, partner_a, partner_b } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const result = await query(
      `INSERT INTO users (username, password, partner_a, partner_b) VALUES ($1, $2, $3, $4) RETURNING *`,
      [username, password, partner_a || '', partner_b || '']
    );
    const user = result.rows[0];
    res.json({ ok: true, user_id: user.id, username: user.username, partner_a: user.partner_a, partner_b: user.partner_b });
  } catch (e) {
    if (e.message && e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Username already taken' });
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const result = await query(`SELECT * FROM users WHERE username = $1`, [username]);
    const user = result.rows[0];
    if (!user || user.password !== password) return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ ok: true, user_id: user.id, username: user.username, partner_a: user.partner_a, partner_b: user.partner_b });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/change-password', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { current_password, new_password, new_username } = req.body;
  const result = await query(`SELECT * FROM users WHERE id = $1`, [req.userId]);
  const user = result.rows[0];
  if (!user || user.password !== current_password) return res.status(401).json({ error: 'Wrong password' });
  const updates = ['password = $2'];
  const params = [req.userId, new_password];
  if (new_username) {
    updates.push(`username = $${params.length + 1}`);
    params.push(new_username);
  }
  await query(`UPDATE users SET ${updates.join(', ')} WHERE id = $1`, params);
  res.json({ ok: true });
});

module.exports = router;
