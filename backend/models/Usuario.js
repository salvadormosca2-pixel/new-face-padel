const { DataTypes } = require('sequelize');
const crypto = require('crypto');
const sequelize = require('../db');

/*
  Personal del club. Cada accion sensible se firma con el PIN de uno de estos usuarios
  (el PIN se pide DESPUES de la accion, al confirmarla).
*/
const Usuario = sequelize.define('Usuario', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:       { type: DataTypes.STRING, allowNull: false },
  rol:          { type: DataTypes.STRING, allowNull: false, defaultValue: 'empleado' },
  pinHash:      { type: DataTypes.STRING, allowNull: false, defaultValue: '' },
  activo:       { type: DataTypes.BOOLEAN, defaultValue: true },
  color:        { type: DataTypes.STRING, defaultValue: '#64748b' },
  ultimoAcceso: { type: DataTypes.DATE, defaultValue: null }
}, {
  tableName: 'usuarios',
  timestamps: true,
  indexes: [{ fields: ['activo'] }, { fields: ['rol'] }]
});

Usuario.hashPin = function (pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex');
  return `${salt}:${hash}`;
};

Usuario.verificarPin = function (pin, pinHash) {
  if (!pinHash || !pin) return false;
  const [salt, hash] = String(pinHash).split(':');
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(pin), salt, 32);
  const real = Buffer.from(hash, 'hex');
  return calc.length === real.length && crypto.timingSafeEqual(calc, real);
};

module.exports = Usuario;
