const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Extract X-User-Id header into req.userId
app.use((req, res, next) => {
  const id = req.headers['x-user-id'];
  req.userId = id ? parseInt(id, 10) : null;
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/settlements', require('./routes/settlements'));
app.use('/api/backup', require('./routes/backup'));

module.exports = app;
