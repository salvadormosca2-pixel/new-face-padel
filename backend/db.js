const { Sequelize } = require('sequelize');

const dbUrl = process.env.DATABASE_URL || process.env.DATABASE_PRIVATE_URL || process.env.PGDATABASE_URL;

if (!dbUrl) {
  console.error('FATAL: No se encontró DATABASE_URL. Configurá la variable en Railway.');
  process.exit(1);
}

const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  }
});

module.exports = sequelize;
