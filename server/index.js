const app = require('./app');
const { initDb } = require('./db');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3001;

async function start() {
  await initDb();

  // Serve built client in production
  const distPath = path.join(__dirname, '../client/dist');
  if (fs.existsSync(distPath)) {
    const express = require('express');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(distPath, 'index.html'));
      }
    });
  }

  app.listen(PORT, () => {
    console.log(`BebeBills3 server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
