const express = require('express');
const router  = express.Router();
const { Op }  = require('sequelize');
const TurnoFijo = require('../models/TurnoFijo');
const Reserva   = require('../models/Reserva');
const Profesor  = require('../models/Profesor');
const { getEspacio, getEspacios, DEPORTES } = require('../lib/espacios');
const { autorizar, auditar, responderError, hoyStr } = require('../lib/permisos');
const { generarReservas, limpiarFuturas, descripcion, DIAS_NOMBRE, DIAS_CORTO, HORIZONTE_DIAS } = require('../lib/fijos');

const HORA_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

router.get('/api/admin/fijos/dias', (_req, res) => {
  res.json(DIAS_NOMBRE.map((nombre, id) => ({ id, nombre, corto: DIAS_CORTO[id] })));
});

/* ─── Listado con sus próximos turnos ───────────────────── */

router.get('/api/admin/fijos', async (req, res) => {
  try {
    const where = req.query.todos === '1' ? {} : { activo: true };
    const [fijos, espacios] = await Promise.all([
      TurnoFijo.findAll({ where, order: [['activo', 'DESC'], ['hora_inicio', 'ASC']], raw: true }),
      getEspacios({ soloActivos: false })
    ]);

    const hoy = hoyStr();
    const ids = fijos.map(f => f.id);
    const reservas = ids.length ? await Reserva.findAll({
      where: { turno_fijo_id: { [Op.in]: ids }, estado_reserva: 'confirmada' }, raw: true
    }) : [];

    res.json(fijos.map(f => {
      const mias     = reservas.filter(r => r.turno_fijo_id === f.id);
      const futuras  = mias.filter(r => r.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha));
      const pasadas  = mias.filter(r => r.fecha < hoy);
      const espacio  = espacios.find(e => e.id === f.cancha_id);

      return {
        ...f,
        cancha_nombre: espacio?.nombre || `Cancha ${f.cancha_id}`,
        deporte_nombre: DEPORTES[f.deporte]?.nombre || f.deporte,
        descripcion: descripcion(f),
        diasNombre: (f.dias || []).map(Number).sort().map(d => DIAS_CORTO[d]),
        proximas: futuras.slice(0, 6).map(r => ({ id: r.id, fecha: r.fecha, estado_pago: r.estado_pago })),
        generadas: futuras.length,
        jugadas: pasadas.length,
        sinCobrar: pasadas.filter(r => r.estado_pago !== 'pagado').length,
        recaudado: pasadas.filter(r => r.estado_pago === 'pagado').reduce((s, r) => s + (r.monto || 0), 0)
      };
    }));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/* ─── Alta ──────────────────────────────────────────────── */

async function validar(body) {
  const dias = Array.isArray(body.dias) ? [...new Set(body.dias.map(Number))].filter(d => d >= 0 && d <= 6) : [];
  if (!dias.length) return { error: 'Elegí al menos un día de la semana' };
  if (!HORA_RE.test(String(body.hora_inicio || ''))) return { error: 'La hora tiene que ser HH:MM' };

  const canchaId = parseInt(body.cancha_id || body.canchaId);
  const espacio = await getEspacio(canchaId);
  if (!espacio) return { error: 'Elegí una cancha válida' };

  const dur = parseInt(body.duracion_minutos) || 60;
  if (dur < (espacio.duracionMinima || 60))
    return { error: `${espacio.nombre} no toma turnos de menos de ${espacio.duracionMinima} minutos` };

  const tipo = body.tipo === 'profesor' ? 'profesor' : 'persona';
  let profesorId = null, profesorNombre = '';
  if (tipo === 'profesor') {
    profesorId = parseInt(body.profesorId || body.profesor_id);
    const prof = profesorId ? await Profesor.findByPk(profesorId, { raw: true }) : null;
    if (!prof) return { error: 'Elegí el profesor' };
    profesorNombre = prof.nombre;
  }

  const nombre = (body.cliente_nombre || body.nombre || '').trim() || profesorNombre;
  if (!nombre) return { error: 'Falta el nombre' };

  return {
    datos: {
      tipo, cliente_nombre: nombre,
      cliente_telefono: (body.cliente_telefono || body.telefono || '').trim(),
      profesor_id: profesorId, profesor_nombre: profesorNombre,
      cancha_id: canchaId, deporte: espacio.deporte,
      dias, hora_inicio: body.hora_inicio, duracion_minutos: dur,
      desde: body.desde || hoyStr(),
      hasta: body.hasta || null,
      monto: parseFloat(body.monto) || 0,
      notas: body.notas || ''
    }
  };
}

router.post('/api/admin/fijos', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.crear');
    const v = await validar(req.body);
    if (v.error) return res.status(400).json({ error: v.error });

    const fijo = await TurnoFijo.create({
      ...v.datos, activo: true,
      creado_por_id: usuario.id, creado_por: usuario.nombre
    });

    const gen = await generarReservas(fijo.toJSON());

    await auditar(usuario, {
      accion: 'fijo.crear', entidad: 'turno_fijo', entidadId: fijo.id,
      descripcion: `Creó el fijo de ${fijo.cliente_nombre}: ${descripcion(fijo)} — generó ${gen.creadas.length} turnos`,
      fecha: hoyStr(), detalle: { dias: fijo.dias, generados: gen.creadas.length, choques: gen.choques.length }
    });

    res.json({ fijo, generados: gen.creadas.length, choques: gen.choques });
  } catch (err) { responderError(res, err); }
});

/* ─── Edición: se rehacen los turnos futuros ────────────── */

router.patch('/api/admin/fijos/:id', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.editar');
    const fijo = await TurnoFijo.findByPk(parseInt(req.params.id));
    if (!fijo) return res.status(404).json({ error: 'Ese fijo no existe' });

    /* Pausar o reactivar no necesita revalidar todo */
    if (Object.keys(req.body).every(k => ['activo', 'usuarioId', 'pin'].includes(k))) {
      const activo = !!req.body.activo;
      await fijo.update({ activo });
      let extra = {};
      if (!activo) extra.canceladas = await limpiarFuturas(fijo.id);
      else         extra.generados  = (await generarReservas(fijo.toJSON())).creadas.length;

      await auditar(usuario, {
        accion: 'fijo.editar', entidad: 'turno_fijo', entidadId: fijo.id,
        descripcion: activo
          ? `Reactivó el fijo de ${fijo.cliente_nombre} (${extra.generados} turnos generados)`
          : `Pausó el fijo de ${fijo.cliente_nombre} (${extra.canceladas} turnos futuros liberados)`,
        fecha: hoyStr()
      });
      return res.json({ fijo, ...extra });
    }

    const v = await validar({ ...fijo.toJSON(), ...req.body });
    if (v.error) return res.status(400).json({ error: v.error });

    /* Cambió el día, la hora o la cancha: se liberan los futuros y se rehacen */
    const canceladas = await limpiarFuturas(fijo.id);
    await fijo.update(v.datos);
    const gen = await generarReservas(fijo.toJSON());

    await auditar(usuario, {
      accion: 'fijo.editar', entidad: 'turno_fijo', entidadId: fijo.id,
      descripcion: `Cambió el fijo de ${fijo.cliente_nombre} a ${descripcion(fijo)} — liberó ${canceladas} y generó ${gen.creadas.length}`,
      fecha: hoyStr(), detalle: { canceladas, generados: gen.creadas.length }
    });

    res.json({ fijo, canceladas, generados: gen.creadas.length, choques: gen.choques });
  } catch (err) { responderError(res, err); }
});

/* ─── Baja ──────────────────────────────────────────────── */

router.delete('/api/admin/fijos/:id', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.liberar');
    const fijo = await TurnoFijo.findByPk(parseInt(req.params.id));
    if (!fijo) return res.status(404).json({ error: 'Ese fijo no existe' });

    await fijo.update({ activo: false });
    const canceladas = await limpiarFuturas(fijo.id);

    await auditar(usuario, {
      accion: 'fijo.borrar', entidad: 'turno_fijo', entidadId: fijo.id,
      descripcion: `Dio de baja el fijo de ${fijo.cliente_nombre} y liberó ${canceladas} turnos futuros`,
      fecha: hoyStr(), detalle: { canceladas }
    });

    res.json({ ok: true, canceladas });
  } catch (err) { responderError(res, err); }
});

/* Rehacer los turnos de un fijo (después de resolver un choque a mano) */
router.post('/api/admin/fijos/:id/regenerar', async (req, res) => {
  try {
    const usuario = await autorizar(req, 'reserva.crear');
    const fijo = await TurnoFijo.findByPk(parseInt(req.params.id), { raw: true });
    if (!fijo) return res.status(404).json({ error: 'Ese fijo no existe' });

    const gen = await generarReservas(fijo);
    await auditar(usuario, {
      accion: 'fijo.editar', entidad: 'turno_fijo', entidadId: fijo.id,
      descripcion: `Regeneró el fijo de ${fijo.cliente_nombre}: ${gen.creadas.length} turnos nuevos`,
      fecha: hoyStr()
    });
    res.json({ generados: gen.creadas.length, choques: gen.choques, horizonteDias: HORIZONTE_DIAS });
  } catch (err) { responderError(res, err); }
});

module.exports = router;
