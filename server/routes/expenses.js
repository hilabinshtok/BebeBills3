const express = require('express');
const router = express.Router();
const { query } = require('../db');

// GET /api/expenses — top-level rows with their sub-items
router.get('/', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });

  const topLevel = await query(
    `SELECT * FROM expenses WHERE user_id = $1 AND parent_id IS NULL ORDER BY created_at DESC`,
    [req.userId]
  );

  const allChildren = await query(
    `SELECT * FROM expenses WHERE user_id = $1 AND parent_id IS NOT NULL ORDER BY created_at ASC`,
    [req.userId]
  );

  const childMap = {};
  for (const child of allChildren.rows) {
    if (!childMap[child.parent_id]) childMap[child.parent_id] = [];
    childMap[child.parent_id].push(child);
  }

  const rows = topLevel.rows.map(row => ({
    ...row,
    items: childMap[row.id] || []
  }));

  res.json(rows);
});

// POST /api/expenses — create item or sub-item
router.post('/', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { parent_id, description, paid_by, amount, split_type, split_pct_payer, date } = req.body;

  if (!description) return res.status(400).json({ error: 'Description required' });

  // Enforce max 1 level nesting
  if (parent_id) {
    const parentResult = await query(`SELECT * FROM expenses WHERE id = $1 AND user_id = $2`, [parent_id, req.userId]);
    const parent = parentResult.rows[0];
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    if (parent.parent_id !== null && parent.parent_id !== undefined) {
      return res.status(400).json({ error: 'Cannot nest more than 1 level deep' });
    }
    // If parent has its own amount, null it out (it becomes a container)
    if (parent.amount !== null && parent.amount !== undefined) {
      await query(
        `UPDATE expenses SET amount = NULL, paid_by = NULL, split_type = NULL, split_pct_payer = NULL, date = NULL WHERE id = $1`,
        [parent_id]
      );
    }
  }

  const now = new Date().toISOString();
  const result = await query(
    `INSERT INTO expenses (user_id, parent_id, description, paid_by, amount, split_type, split_pct_payer, date, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      req.userId,
      parent_id || null,
      description,
      paid_by || null,
      amount || null,
      split_type || '50/50',
      split_pct_payer != null ? split_pct_payer : 50,
      date || null,
      now
    ]
  );

  res.json(result.rows[0]);
});

// PUT /api/expenses/:id
router.put('/:id', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { id } = req.params;
  const { description, paid_by, amount, split_type, split_pct_payer, date } = req.body;

  // Check if this is a parent (has children)
  const childrenResult = await query(`SELECT COUNT(*) as count FROM expenses WHERE parent_id = $1`, [id]);
  const hasChildren = parseInt(childrenResult.rows[0].count, 10) > 0;

  if (hasChildren) {
    // Parent: only update description
    await query(`UPDATE expenses SET description = $2 WHERE id = $1 AND user_id = $3`, [id, description, req.userId]);
  } else {
    await query(
      `UPDATE expenses SET description = $2, paid_by = $3, amount = $4, split_type = $5, split_pct_payer = $6, date = $7
       WHERE id = $1 AND user_id = $8`,
      [id, description, paid_by, amount, split_type, split_pct_payer, date, req.userId]
    );
  }

  const result = await query(`SELECT * FROM expenses WHERE id = $1 AND user_id = $2`, [id, req.userId]);
  res.json(result.rows[0]);
});

// DELETE /api/expenses/:id — cascades to children via FK
router.delete('/:id', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });

  const { id } = req.params;

  // For SQLite (which may not enforce FK by default), manually delete children
  await query(`DELETE FROM expenses WHERE parent_id = $1 AND user_id = $2`, [id, req.userId]);
  await query(`DELETE FROM expenses WHERE id = $1 AND user_id = $2`, [id, req.userId]);

  res.json({ ok: true });
});

// GET /api/balance
router.get('/balance', async (req, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Not authenticated' });

  const userResult = await query(`SELECT * FROM users WHERE id = $1`, [req.userId]);
  const user = userResult.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });

  const partnerA = user.partner_a;
  const partnerB = user.partner_b;

  // Get leaf expenses only (no children)
  const leavesResult = await query(
    `SELECT e.* FROM expenses e
     WHERE e.user_id = $1
     AND e.id NOT IN (SELECT DISTINCT parent_id FROM expenses WHERE parent_id IS NOT NULL AND user_id = $1)
     AND e.amount IS NOT NULL`,
    [req.userId]
  );

  let aOwes = 0; // partner_a owes partner_b
  let bOwes = 0; // partner_b owes partner_a

  for (const exp of leavesResult.rows) {
    const otherShare = exp.amount * (1 - (exp.split_pct_payer || 50) / 100);
    if (exp.paid_by === partnerA) {
      bOwes += otherShare;
    } else if (exp.paid_by === partnerB) {
      aOwes += otherShare;
    }
  }

  const settlementsResult = await query(
    `SELECT * FROM settlements WHERE user_id = $1`,
    [req.userId]
  );

  for (const s of settlementsResult.rows) {
    if (s.from_name === partnerA && s.to_name === partnerB) {
      // A paid B → reduces A's debt
      aOwes -= s.amount;
    } else if (s.from_name === partnerB && s.to_name === partnerA) {
      // B paid A → reduces B's debt
      bOwes -= s.amount;
    }
  }

  const net = bOwes - aOwes;
  const amount = Math.abs(net);
  const settled = amount < 0.005;

  let owes_name, owes_to;
  if (settled) {
    owes_name = null;
    owes_to = null;
  } else if (net > 0) {
    owes_name = partnerB;
    owes_to = partnerA;
  } else {
    owes_name = partnerA;
    owes_to = partnerB;
  }

  res.json({ owes_name, owes_to, amount, settled });
});

module.exports = router;
