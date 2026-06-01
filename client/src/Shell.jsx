import React, { useState, useEffect } from 'react';
import { useBalance } from './hooks/useBalance';
import { useQueryClient } from '@tanstack/react-query';
import ExpensesPage from './pages/ExpensesPage';
import SettingsModal from './pages/SettingsModal';

export default function Shell({ session, settings, onLogout, onSettingsChange }) {
  const { data: balance } = useBalance();
  const [showSettings, setShowSettings] = useState(false);

  // Persisted display preference: show/hide the Owes column
  const [showOwes, setShowOwes] = useState(() => {
    try { return localStorage.getItem('showOwes') !== 'false'; } catch { return true; }
  });

  // Auto-open settings if partners not set up
  useEffect(() => {
    if (settings && !settings.is_setup) setShowSettings(true);
  }, [settings?.is_setup]);

  function toggleShowOwes() {
    setShowOwes(v => {
      const next = !v;
      try { localStorage.setItem('showOwes', String(next)); } catch {}
      return next;
    });
  }

  function balanceText() {
    if (!balance) return '…';
    if (balance.settled) return 'All settled ✓';
    return `${balance.owes_name} owes ${balance.owes_to} $${balance.amount.toFixed(2)}`;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>BebeBills3</h1>
      </header>

      <main className="app-main">
        <ExpensesPage session={session} settings={settings} showOwes={showOwes} />
      </main>

      <footer className="app-footer">
        <span>{balanceText()}</span>
        <button onClick={() => setShowSettings(true)}>Settings</button>
      </footer>

      {showSettings && (
        <SettingsModal
          session={session}
          settings={settings}
          onClose={() => setShowSettings(false)}
          onLogout={onLogout}
          onSettingsChange={onSettingsChange}
          showOwes={showOwes}
          onToggleOwes={toggleShowOwes}
        />
      )}
    </div>
  );
}
