const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  dialectOptions: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {}
});

module.exports = sequelize;
