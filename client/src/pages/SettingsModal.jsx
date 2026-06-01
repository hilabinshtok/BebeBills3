import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useSettlements, useCreateSettlement, useDeleteSettlement } from '../hooks/useSettlements';
import { useBalance } from '../hooks/useBalance';

export default function SettingsModal({ session, settings, onClose, onLogout, onSettingsChange, showOwes, onToggleOwes }) {
  const qc = useQueryClient();
  const [partnerA, setPartnerA] = useState(settings?.partner_a || '');
  const [partnerB, setPartnerB] = useState(settings?.partner_b || '');
  const [partnerMsg, setPartnerMsg] = useState('');

  const { data: balance } = useBalance();
  const { data: settlements = [] } = useSettlements();
  const createSettlement = useCreateSettlement();
  const deleteSettlement = useDeleteSettlement();

  const [settleForm, setSettleForm] = useState({
    from_name: settings?.partner_a || '',
    to_name: settings?.partner_b || '',
    amount: '',
    note: '',
    date: new Date().toISOString().slice(0, 10)
  });
  const [settleMsg, setSettleMsg] = useState('');

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Pre-fill settle direction from balance
  useEffect(() => {
    if (balance && !balance.settled) {
      setSettleForm(f => ({ ...f, from_name: balance.owes_name, to_name: balance.owes_to, amount: balance.amount.toFixed(2) }));
    }
  }, [balance]);

  async function savePartners(e) {
    e.preventDefault();
    try {
      await api.post('/settings', { partner_a: partnerA, partner_b: partnerB });
      onSettingsChange(s => ({ ...s, partner_a: partnerA, partner_b: partnerB, is_setup: !!(partnerA && partnerB) }));
      setPartnerMsg('Saved!');
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['balance'] });
      qc.invalidateQueries({ queryKey: ['settlements'] });
      setTimeout(() => setPartnerMsg(''), 2000);
    } catch (e) {
      setPartnerMsg('Error: ' + e.message);
    }
  }

  async function exportCsv() {
    const blob = await api.getBlob('/backup/export');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bebebills3-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('This will replace ALL your data. Continue?')) { e.target.value = ''; return; }
    const fd = new FormData();
    fd.append('file', file);
    try {
      await api.postForm('/backup/import', fd);
      qc.invalidateQueries();
      alert('Data imported successfully.');
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
    e.target.value = '';
  }

  // Compute what the balance will be AFTER this settlement is applied
  function balanceAfterSettlement(form) {
    const amt = parseFloat(form.amount);
    if (!balance || !(amt > 0)) return null;

    if (balance.settled) {
      // Was all settled; payment in this direction creates a reverse credit
      return amt < 0.005 ? 'All settled ✓' : `${form.to_name} owes ${form.from_name} $${amt.toFixed(2)}`;
    }

    const { owes_name, owes_to, amount: cur } = balance;
    const from = form.from_name;
    const to = form.to_name;

    let remaining, debtor, creditor;
    if (from === owes_name && to === owes_to) {
      // Paying in the correct direction — reduces debt
      remaining = cur - amt;
      debtor = owes_name; creditor = owes_to;
    } else if (from === owes_to && to === owes_name) {
      // Paying in reverse — increases debt
      remaining = -(cur + amt);
      debtor = owes_name; creditor = owes_to;
    } else {
      // Names don't match known partners, keep current label
      return `${owes_name} owes ${owes_to} $${cur.toFixed(2)}`;
    }

    if (Math.abs(remaining) < 0.005) return 'All settled ✓';
    if (remaining > 0) return `${debtor} owes ${creditor} $${remaining.toFixed(2)}`;
    return `${creditor} owes ${debtor} $${Math.abs(remaining).toFixed(2)}`;
  }

  async function handleSettle(e) {
    e.preventDefault();
    setSettleMsg('');
    if (!settleForm.amount || parseFloat(settleForm.amount) <= 0) { setSettleMsg('Amount required'); return; }
    // Compute the post-settlement balance before the mutation changes the cache
    const snapshot = balanceAfterSettlement(settleForm);
    try {
      await createSettlement.mutateAsync({
        from_name: settleForm.from_name,
        to_name: settleForm.to_name,
        amount: parseFloat(settleForm.amount),
        note: settleForm.note || undefined,
        date: settleForm.date,
        balance_snapshot: snapshot
      });
      setSettleMsg('Recorded!');
      setTimeout(() => setSettleMsg(''), 2000);
    } catch (e) {
      setSettleMsg('Error: ' + e.message);
    }
  }

  async function handleDeleteSettlement(id) {
    if (!confirm('Delete this settlement?')) return;
    await deleteSettlement.mutateAsync(id);
  }

  const pA = partnerA || 'A';
  const pB = partnerB || 'B';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Settings</h2>

        {/* Partners */}
        <div className="modal-section">
          <h3>Partners</h3>
          <form onSubmit={savePartners}>
            <div className="form-field">
              <label>Partner A</label>
              <input value={partnerA} onChange={e => setPartnerA(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Partner B</label>
              <input value={partnerB} onChange={e => setPartnerB(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button type="submit">Save Partners</button>
              {partnerMsg && <span style={{ fontSize: 13 }}>{partnerMsg}</span>}
            </div>
          </form>
        </div>

        {/* Settlements */}
        <div className="modal-section">
          <h3>Record Settlement</h3>
          <form onSubmit={handleSettle}>
            <div className="form-field">
              <label>From → To</label>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <select value={settleForm.from_name} onChange={e => setSettleForm(f => ({ ...f, from_name: e.target.value }))}>
                  <option value={pA}>{pA}</option>
                  <option value={pB}>{pB}</option>
                </select>
                <span>→</span>
                <select value={settleForm.to_name} onChange={e => setSettleForm(f => ({ ...f, to_name: e.target.value }))}>
                  <option value={pA}>{pA}</option>
                  <option value={pB}>{pB}</option>
                </select>
              </div>
            </div>
            <div className="form-field">
              <label>Amount</label>
              <input type="number" min="0.01" step="0.01" value={settleForm.amount} onChange={e => setSettleForm(f => ({ ...f, amount: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>Date</label>
              <input type="date" value={settleForm.date} onChange={e => setSettleForm(f => ({ ...f, date: e.target.value }))} />
            </div>
            <div className="form-field">
              <label>Note (optional)</label>
              <input value={settleForm.note} onChange={e => setSettleForm(f => ({ ...f, note: e.target.value }))} />
            </div>
            <div className="modal-actions">
              <button type="submit">Record</button>
              {settleMsg && <span style={{ fontSize: 13 }}>{settleMsg}</span>}
            </div>
          </form>

          {settlements.length > 0 && (
            <div className="settlements-list">
              {settlements.map(s => (
                <div key={s.id} className="settlement-row">
                  <span>{s.from_name} → {s.to_name}: ${parseFloat(s.amount).toFixed(2)} on {s.date}{s.note ? ` (${s.note})` : ''}</span>
                  <button className="link-btn" onClick={() => handleDeleteSettlement(s.id)}>🗑</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Display */}
        <div className="modal-section">
          <h3>Display</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>Owes column</span>
            <button onClick={onToggleOwes} style={{ minWidth: 44 }}>
              {showOwes ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Data */}
        <div className="modal-section">
          <h3>Data</h3>
          <div className="settings-data-btns">
            <button onClick={exportCsv}>Export CSV</button>
            <label>
              <span style={{ border: '1px solid black', padding: '4px 10px', cursor: 'pointer' }}>Import CSV</span>
              <input type="file" accept=".zip" style={{ display: 'none' }} onChange={importCsv} />
            </label>
          </div>
        </div>

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button onClick={onClose}>Close</button>
          <button onClick={onLogout}>Log Out</button>
        </div>
      </div>
    </div>
  );
}
