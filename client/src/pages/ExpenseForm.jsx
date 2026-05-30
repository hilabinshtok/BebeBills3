import React, { useState, useEffect } from 'react';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function ExpenseForm({ initial, parentId, isEditing, isParent, partnerA, partnerB, onSubmit, onClose }) {
  const [description, setDescription] = useState(initial?.description || '');
  const [paidBy, setPaidBy] = useState(initial?.paid_by || partnerA);
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '');
  const [splitType, setSplitType] = useState(initial?.split_type || '50/50');
  const [splitPct, setSplitPct] = useState(initial?.split_pct_payer != null ? String(initial.split_pct_payer) : '50');
  const [date, setDate] = useState(initial?.date || today());
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!description.trim()) { setError('Description required'); return; }
    if (!isParent) {
      if (!amount || parseFloat(amount) <= 0) { setError('Amount must be > 0'); return; }
      if (!date) { setError('Date required'); return; }
    }
    setSubmitting(true);
    try {
      await onSubmit({
        parent_id: isEditing ? (initial?.parent_id ?? null) : parentId,
        description: description.trim(),
        paid_by: isParent ? null : paidBy,
        amount: isParent ? null : parseFloat(amount),
        split_type: isParent ? null : splitType,
        split_pct_payer: isParent ? null : (splitType === '50/50' ? 50 : parseFloat(splitPct)),
        date: isParent ? null : date,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  const title = isEditing ? 'Edit Expense' : (parentId != null ? 'Add Sub-item' : 'Add Expense');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal expense-form" onClick={e => e.stopPropagation()}>
        <h2>{title}</h2>
        {error && <p className="form-error">{error}</p>}
        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Description</label>
            <input value={description} onChange={e => setDescription(e.target.value)} autoFocus />
          </div>

          {isParent ? (
            <p style={{ marginBottom: 12, color: '#555', fontSize: 13 }}>
              Amount and split are calculated from sub-items.
            </p>
          ) : (
            <>
              <div className="form-field">
                <label>Paid by</label>
                <div className="toggle-group">
                  <button type="button" className={paidBy === partnerA ? 'active' : ''} onClick={() => setPaidBy(partnerA)}>{partnerA}</button>
                  <button type="button" className={paidBy === partnerB ? 'active' : ''} onClick={() => setPaidBy(partnerB)}>{partnerB}</button>
                </div>
              </div>

              <div className="form-field">
                <label>Amount</label>
                <input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>

              <div className="form-field">
                <label>Split</label>
                <div className="split-row">
                  <div className="toggle-group">
                    <button type="button" className={splitType === '50/50' ? 'active' : ''} onClick={() => setSplitType('50/50')}>50/50</button>
                    <button type="button" className={splitType === 'custom' ? 'active' : ''} onClick={() => setSplitType('custom')}>Custom %</button>
                  </div>
                  {splitType === 'custom' && (
                    <span>
                      Payer pays{' '}
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={splitPct}
                        onChange={e => setSplitPct(e.target.value)}
                        style={{ width: 60 }}
                      />%
                    </span>
                  )}
                </div>
              </div>

              <div className="form-field">
                <label>Date</label>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} />
              </div>
            </>
          )}

          <div className="modal-actions">
            <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save'}</button>
            <button type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}
