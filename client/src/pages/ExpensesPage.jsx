import React, { useState } from 'react';
import { useExpenses, useCreateExpense, useUpdateExpense, useDeleteExpense } from '../hooks/useExpenses';
import { useSettlements } from '../hooks/useSettlements';
import ExpenseForm from './ExpenseForm';

function fmt(n) {
  if (n == null) return '';
  return `$${Math.round(parseFloat(n))}`;
}

function fmtDate(d) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}.${m}.${y.slice(2)}`;
}


function calcLeafContribution(exp, partnerA, partnerB) {
  if (exp.amount == null) return null;
  const otherShare = exp.amount * (1 - (exp.split_pct_payer ?? 50) / 100);
  if (exp.paid_by === partnerA) return { from: partnerB, to: partnerA, amount: otherShare };
  if (exp.paid_by === partnerB) return { from: partnerA, to: partnerB, amount: otherShare };
  return null;
}

function calcParentContribution(items, partnerA, partnerB) {
  let aOwes = 0, bOwes = 0;
  for (const item of items) {
    const c = calcLeafContribution(item, partnerA, partnerB);
    if (!c) continue;
    if (c.from === partnerA) aOwes += c.amount;
    else bOwes += c.amount;
  }
  const net = bOwes - aOwes;
  const amount = Math.abs(net);
  if (amount < 0.005) return null;
  if (net > 0) return { from: partnerB, to: partnerA, amount };
  return { from: partnerA, to: partnerB, amount };
}

function shortName(name) {
  if (!name) return '?';
  return name.length > 6 ? name.slice(0, 5) + '…' : name;
}

function ContribCell({ contrib }) {
  if (!contrib) return <td>—</td>;
  return <td>{shortName(contrib.from)}→{shortName(contrib.to)} {fmt(contrib.amount)}</td>;
}

export default function ExpensesPage({ session, settings, showOwes }) {
  const { data: expenses = [], isLoading } = useExpenses();
  const { data: settlements = [] } = useSettlements();
  const createExpense = useCreateExpense();
  const updateExpense = useUpdateExpense();
  const deleteExpense = useDeleteExpense();

  const [expanded, setExpanded] = useState({});
  const [addForm, setAddForm] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const partnerA = settings?.partner_a || 'A';
  const partnerB = settings?.partner_b || 'B';

  // Total columns depends on owes visibility
  const colCount = showOwes ? 6 : 5;

  function toggleExpand(id) {
    setExpanded(e => ({ ...e, [id]: !e[id] }));
  }

  async function handleDelete(id) {
    if (!confirm('Delete this expense?')) return;
    await deleteExpense.mutateAsync(id);
  }

  async function handleSubmitForm(data) {
    if (editForm) {
      await updateExpense.mutateAsync({ id: editForm.id, ...data });
    } else {
      await createExpense.mutateAsync(data);
      if (data.parent_id) {
        setExpanded(e => ({ ...e, [data.parent_id]: true }));
      }
    }
    setAddForm(null);
    setEditForm(null);
  }

  if (isLoading) return <p>Loading…</p>;

  const isParent = (row) => row.items && row.items.length > 0;

  // Merge expenses and settlements, sorted oldest → newest
  const merged = [
    ...expenses.map(e => ({ type: 'expense', data: e, sortDate: e.date || '0000-00-00' })),
    ...settlements.map(s => ({ type: 'settlement', data: s, sortDate: s.date || '0000-00-00' })),
  ].sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  return (
    <div className={showOwes ? '' : 'owes-hidden'}>
      <table className="expense-table">
        <colgroup>
          <col className="col-desc" />
          <col className="col-paid" />
          <col className="col-amount" />
          {showOwes && <col className="col-owes" />}
          <col className="col-date" />
          <col className="col-actions" />
        </colgroup>
        <thead>
          <tr>
            <th>Description</th>
            <th>By</th>
            <th>Amount</th>
            {showOwes && <th>Owes</th>}
            <th>Date</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {merged.map((item, idx) => {
            if (item.type === 'settlement') {
              const s = item.data;
              return (
                <tr key={`settlement-${s.id}`}>
                  <td colSpan={colCount} style={{ padding: '6px 0' }}>
                    <div className="settlement-table-box">
                      <div>
                        Settlement: {s.from_name} → {s.to_name}, ${parseFloat(s.amount).toFixed(2)}, on {fmtDate(s.date)}
                        {s.note ? `, ${s.note}` : ''}
                      </div>
                      {s.balance_snapshot && (
                        <div className="settlement-table-balance">{s.balance_snapshot}</div>
                      )}
                    </div>
                  </td>
                </tr>
              );
            }

            const row = item.data;
            const hasChildren = isParent(row);
            const isExpanded = expanded[row.id];
            const totalAmount = hasChildren
              ? row.items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
              : row.amount;
            const contrib = hasChildren
              ? calcParentContribution(row.items, partnerA, partnerB)
              : calcLeafContribution(row, partnerA, partnerB);
            const paidBy = hasChildren
              ? (new Set(row.items.map(i => i.paid_by)).size === 1 ? row.items[0].paid_by : '-')
              : row.paid_by;

            return (
              <React.Fragment key={row.id}>
                <tr>
                  <td>
                    <button className="row-toggle" onClick={() => toggleExpand(row.id)}>
                      {isExpanded ? '▼' : '▶'}
                    </button>
                    {row.description}
                  </td>
                  <td>{paidBy || '—'}</td>
                  <td>{fmt(totalAmount)}</td>
                  {showOwes && <ContribCell contrib={contrib} />}
                  <td>{hasChildren ? '—' : fmtDate(row.date)}</td>
                  <td>
                    <button className="link-btn" onClick={() => setEditForm(row)}>✏</button>
                    {' '}
                    <button className="link-btn" onClick={() => handleDelete(row.id)}>🗑</button>
                  </td>
                </tr>

                {isExpanded && (
                  <>
                    {row.items.map(sub => {
                      const subContrib = calcLeafContribution(sub, partnerA, partnerB);
                      return (
                        <tr key={sub.id} className="sub-row">
                          <td>{sub.description}</td>
                          <td>{sub.paid_by || '—'}</td>
                          <td>{fmt(sub.amount)}</td>
                          {showOwes && <ContribCell contrib={subContrib} />}
                          <td>{fmtDate(sub.date)}</td>
                          <td>
                            <button className="link-btn" onClick={() => setEditForm(sub)}>✏</button>
                            {' '}
                            <button className="link-btn" onClick={() => handleDelete(sub.id)}>🗑</button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="add-subitem-row">
                      <td colSpan={colCount}>
                        <button className="link-btn" onClick={() => setAddForm({ parent_id: row.id })}>
                          + sub-item
                        </button>
                      </td>
                    </tr>
                  </>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      <div className="add-row">
        <button className="link-btn" onClick={() => setAddForm({ parent_id: null })}>+ Add expense</button>
      </div>

      {(addForm || editForm) && (
        <ExpenseForm
          initial={editForm}
          parentId={addForm?.parent_id ?? null}
          isEditing={!!editForm}
          isParent={editForm ? isParent(editForm) : false}
          partnerA={partnerA}
          partnerB={partnerB}
          onSubmit={handleSubmitForm}
          onClose={() => { setAddForm(null); setEditForm(null); }}
        />
      )}
    </div>
  );
}
