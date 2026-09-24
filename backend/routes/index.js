/*
  Todas las rutas del sistema, en un solo lugar.
  server.js y el demo local montan esta misma lista: antes estaban duplicadas
  y agregar una ruta nueva funcionaba en producción pero no en el demo.
*/
module.exports = [
  'auth', 'reservas', 'espacios', 'usuarios', 'buffet', 'caja', 'salon', 'fijos', 'cocina', 'asistente',
  'torneos', 'profesores', 'socios', 'ingresos', 'club', 'premios', 'bot'
];
