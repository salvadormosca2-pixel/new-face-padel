const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const ClubConfig = sequelize.define('ClubConfig', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  nombre:        { type: DataTypes.STRING, defaultValue: 'New Face Padel Club' },
  direccion:     { type: DataTypes.STRING, defaultValue: '' },
  telefono:      { type: DataTypes.STRING, defaultValue: '' },
  whatsapp:      { type: DataTypes.STRING, defaultValue: '' },
  email:         { type: DataTypes.STRING, defaultValue: '' },
  redes:         { type: DataTypes.JSONB, defaultValue: { instagram: '', facebook: '', tiktok: '' } },
  horarios:      { type: DataTypes.JSONB, defaultValue: { lunesViernes: '15:00 a 23:00', sabados: '09:00 a 23:00', domingos: '09:00 a 23:00', feriados: '09:00 a 23:00' } },
  canchas:       { type: DataTypes.JSONB, defaultValue: [{ numero: 1, tipo: 'Cubierta', techada: true }, { numero: 2, tipo: 'Cubierta', techada: true }, { numero: 3, tipo: 'Al aire libre', techada: false }, { numero: 4, tipo: 'Al aire libre', techada: false }] },
  precios:       { type: DataTypes.JSONB, defaultValue: [] },
  servicios:     { type: DataTypes.JSONB, defaultValue: ['Estacionamiento', 'Vestuarios', 'Buffet'] },
  metodosPago:   { type: DataTypes.JSONB, defaultValue: ['Efectivo', 'MercadoPago', 'Transferencia bancaria'] },
  reglas:        { type: DataTypes.JSONB, defaultValue: { cancelacion: '', anticipoMinimo: '', vestimenta: '', llegada: '' } },
  sistemaPuntos: { type: DataTypes.JSONB, defaultValue: { puntosPorReserva: 10, descripcion: 'Ganás puntos por cada reserva y los canjeás por premios.' } }
}, {
  tableName: 'club_config',
  timestamps: true
});

module.exports = ClubConfig;
