const { initDb } = require('../db');
const app = require('../app');

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
  app(req, res);
};
