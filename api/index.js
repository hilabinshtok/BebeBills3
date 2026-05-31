const app = require('../server/app');
const { initDb } = require('../server/db');

let initialized = false;

module.exports = async (req, res) => {
  if (!initialized) {
    await initDb();
    initialized = true;
  }
  app(req, res);
};
