const express = require('express');
const router = express.Router();
const { query } = require('../db');

router.get('/', async (req, res) => {
  const usersResult = await query(`SELECT COUNT(*) as count FROM users`);
  const count = parseInt(usersResult.rows[0].count, 10);
  const is_auth_setup = count > 0;

  if (!req.userId) {
    return res.json({ is_auth_setup, is_setup: false });
  }

  const result = await query(`SELECT * FROM users WHERE id = $1`, [req.userId]);
  const user = result.rows[0];
  if (!user) return res.json({ is_auth_setup, is_setup: false });

  const is_setup = !!(user.partner_a && user.partner_b);
  res.json({ is_auth_setup, is_setup, partner_a: user.partner_a, partner_b: user.partner_b });
});

router.post('/', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });
  const { partner_a, partner_b } = req.body;

  // Get old names to cascade rename into expenses + settlements
  const oldResult = await query(`SELECT partner_a, partner_b FROM users WHERE id = $1`, [req.userId]);
  const old = oldResult.rows[0] || {};
  const newA = partner_a || '';
  const newB = partner_b || '';

  await query(`UPDATE users SET partner_a = $2, partner_b = $3 WHERE id = $1`, [req.userId, newA, newB]);

  if (old.partner_a && newA && old.partner_a !== newA) {
    await query(`UPDATE expenses SET paid_by = $3 WHERE user_id = $1 AND paid_by = $2`, [req.userId, old.partner_a, newA]);
    await query(`UPDATE settlements SET from_name = $3 WHERE user_id = $1 AND from_name = $2`, [req.userId, old.partner_a, newA]);
    await query(`UPDATE settlements SET to_name = $3 WHERE user_id = $1 AND to_name = $2`, [req.userId, old.partner_a, newA]);
  }
  if (old.partner_b && newB && old.partner_b !== newB) {
    await query(`UPDATE expenses SET paid_by = $3 WHERE user_id = $1 AND paid_by = $2`, [req.userId, old.partner_b, newB]);
    await query(`UPDATE settlements SET from_name = $3 WHERE user_id = $1 AND from_name = $2`, [req.userId, old.partner_b, newB]);
    await query(`UPDATE settlements SET to_name = $3 WHERE user_id = $1 AND to_name = $2`, [req.userId, old.partner_b, newB]);
  }

  res.json({ ok: true });
});

module.exports = router;
