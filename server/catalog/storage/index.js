const path = require('path');

const { JsonCatalogStore } = require('./jsonStore');
const { MongoCatalogStore } = require('./mongoStore');
const { MySqlCatalogStore } = require('./mysqlStore');

function createCatalogStore() {
  const driver = String(process.env.STORAGE_DRIVER || 'json').toLowerCase();

  if (driver === 'mongodb') {
    return new MongoCatalogStore();
  }

  if (driver === 'mysql') {
    return new MySqlCatalogStore();
  }

  return new JsonCatalogStore({
    file: path.join(__dirname, '..', '..', '..', 'data', 'externalCatalog.json')
  });
}

module.exports = {
  createCatalogStore
};
