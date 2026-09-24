/*
  La fecha del club, no la de UTC.

  El club abre de 15:00 a 00:00 y Buenos Aires es UTC-3: a partir de las 21:00
  new Date().toISOString() ya devuelve el día siguiente. Sin esto, todas las
  noches el dashboard, la caja y los reportes se van un día para adelante.
*/
const TZ = process.env.CLUB_TZ || 'America/Argentina/Buenos_Aires';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});

/* YYYY-MM-DD en la zona del club */
function hoyClub(fecha = new Date()) {
  try { return fmt.format(fecha); }
  catch { return fecha.toISOString().split('T')[0]; }
}

/* Corre N días desde hoy (negativo = hacia atrás) */
function diasDesdeHoy(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return hoyClub(d);
}

module.exports = { TZ, hoyClub, diasDesdeHoy };
