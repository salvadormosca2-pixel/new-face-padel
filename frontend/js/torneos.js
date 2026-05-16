/* ═══════════════════════════════════════════════════════════
   torneos.js — Torneos públicos (WPT style)
   ═══════════════════════════════════════════════════════════ */

let torneoActualId = null;
let _torneosPublicos = [];

const IMG_DEFAULT = 'https://images.unsplash.com/photo-1554284126-aa88f22d8b74?w=1200&auto=format&fit=crop&q=80';

/* ── Inicialización ── */

async function iniciarTorneos() {
  const selectorEl  = document.getElementById('torneos-selector');
  const contenidoEl = document.getElementById('torneo-contenido');
  if (!selectorEl || !contenidoEl) return;

  contenidoEl.style.display = 'none';
  spinner(selectorEl);

  try {
    _torneosPublicos = await api.getTorneos();
    if (!_torneosPublicos.length) {
      selectorEl.innerHTML = '<div style="padding:80px 0;text-align:center;color:rgba(255,255,255,0.4);font-size:18px">No hay torneos por el momento.</div>';
      return;
    }
    renderPortadas(_torneosPublicos);
  } catch (e) {
    selectorEl.innerHTML = `<p style="color:var(--rojo);padding:20px">Error al cargar torneos.</p>`;
  }
}

function renderPortadas(torneos) {
  const selectorEl = document.getElementById('torneos-selector');
  const ESTADO_LABEL = { inscripcion:'Inscripción abierta', grupos:'Fase de grupos', bracket:'Bracket eliminatorio', finalizado:'Finalizado' };
  const ESTADO_COLOR = { inscripcion:'badge-azul', grupos:'badge-amarillo', bracket:'badge-verde', finalizado:'badge-gris' };

  selectorEl.innerHTML = `<div class="torneos-portadas-grid">${torneos.map(t => {
    const img   = t.imagen || IMG_DEFAULT;
    const label = ESTADO_LABEL[t.estado] || t.estado;
    const color = ESTADO_COLOR[t.estado] || 'badge-gris';
    const parejas = (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada').length;
    const desc  = t.descripcion || '';

    return `
      <div class="torneo-portada-card" style="background-image:url('${img}')">
        <div class="torneo-portada-overlay"></div>
        <div class="torneo-portada-content">
          <span class="badge ${color} torneo-portada-badge">${label}</span>
          <h2 class="torneo-portada-nombre">${t.nombre}</h2>
          <p class="torneo-portada-meta">
            📅 ${formatFechaLarga(t.fecha)}
            &nbsp;·&nbsp;
            🎾 ${parejas} pareja${parejas !== 1 ? 's' : ''} inscripta${parejas !== 1 ? 's' : ''}
          </p>
          ${desc ? `<p class="torneo-portada-desc">${desc}</p>` : ''}
          <button class="torneo-portada-btn" onclick="abrirTorneo('${t._id}')">
            Ver torneo
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>
      </div>`;
  }).join('')}</div>`;
}

async function abrirTorneo(id) {
  torneoActualId = id;
  const selectorEl  = document.getElementById('torneos-selector');
  const contenidoEl = document.getElementById('torneo-contenido');

  selectorEl.style.display  = 'none';
  contenidoEl.style.display = 'block';
  spinner(contenidoEl);

  try {
    const t = await api.getTorneo(id);
    if (!t) throw new Error('Torneo no encontrado');

    // Botón volver
    const btnVolver = `
      <button onclick="volverAPortadas()" style="display:inline-flex;align-items:center;gap:8px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.7);border-radius:8px;padding:8px 16px;font-size:13px;font-weight:600;cursor:pointer;margin-bottom:24px;font-family:inherit;transition:background .2s" onmouseover="this.style.background='rgba(255,255,255,.14)'" onmouseout="this.style.background='rgba(255,255,255,.08)'">
        ← Todos los torneos
      </button>`;

    contenidoEl.innerHTML = btnVolver;
    const wrapper = document.createElement('div');
    contenidoEl.appendChild(wrapper);
    renderTorneo(t, wrapper);
  } catch (e) {
    contenidoEl.innerHTML = `<p style="color:var(--rojo);padding:20px">Error al cargar el torneo.</p>`;
  }
}

function volverAPortadas() {
  const selectorEl  = document.getElementById('torneos-selector');
  const contenidoEl = document.getElementById('torneo-contenido');
  contenidoEl.style.display = 'none';
  selectorEl.style.display  = 'block';
}

async function cargarTorneo(id, tabEl) {
  await abrirTorneo(id);
}

/* ── Render principal ── */

function renderTorneo(t, contenedor) {
  const estadoColor = { inscripcion: 'badge-azul', grupos: 'badge-amarillo', bracket: 'badge-verde', finalizado: 'badge-gris' }[t.estado] || 'badge-gris';
  const estadoLabel = { inscripcion: 'Inscripción abierta', grupos: 'Fase de grupos', bracket: 'Cuadro eliminatorio', finalizado: 'Finalizado' }[t.estado] || t.estado;
  const totalConfirmadas = (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada').length;

  let html = `
    <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;margin-bottom:28px">
      <div>
        <h2 style="font-size:28px;font-weight:900;margin-bottom:6px">${t.nombre}</h2>
        <p style="color:rgba(255,255,255,0.5);font-size:14px">
          📅 ${formatFechaLarga(t.fecha)}
          &nbsp;·&nbsp; 🎾 ${totalConfirmadas} pareja${totalConfirmadas !== 1 ? 's' : ''} inscripta${totalConfirmadas !== 1 ? 's' : ''}
          &nbsp;·&nbsp; <span class="badge ${estadoColor}">${estadoLabel}</span>
        </p>
      </div>
    </div>
  `;

  if (t.estado === 'inscripcion') html += renderInscripcionPublica(t);
  if (t.estado === 'grupos') html += renderGruposPublico(t);
  if (t.estado === 'bracket') html += renderGruposPublico(t) + renderBracketPublico(t);
  if (t.estado === 'finalizado') html += renderCampeonPublico(t) + renderBracketPublico(t) + renderGruposPublico(t);

  contenedor.innerHTML = html;
}

/* ── FASE: Inscripción pública ── */

function renderInscripcionPublica(t) {
  const confirmadas = (t.inscripciones || []).filter(i => i.estadoInscripcion === 'aceptada');

  return `
    <div class="torneo-pub-seccion">
      <h3 class="torneo-pub-titulo">Inscripción de parejas</h3>
      <p style="color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:20px">
        Completá los datos de ambos jugadores. Tu inscripción quedará pendiente hasta que el organizador la confirme.
      </p>

      <div class="inscripcion-pub-form" id="form-inscripcion-pub">
        <div class="inscripcion-form-cols">
          <div>
            <div class="inscripcion-form-subtitulo">Jugador 1</div>
            <div class="rprem-form-group">
              <label>Nombre completo</label>
              <input type="text" id="pub-j1-nombre" placeholder="Ej: Martín Gómez" class="inscripcion-input">
            </div>
            <div class="rprem-form-group">
              <label>Teléfono (WhatsApp)</label>
              <input type="tel" id="pub-j1-tel" placeholder="11 1234-5678" class="inscripcion-input">
            </div>
          </div>
          <div>
            <div class="inscripcion-form-subtitulo">Jugador 2</div>
            <div class="rprem-form-group">
              <label>Nombre completo</label>
              <input type="text" id="pub-j2-nombre" placeholder="Ej: Lucas Herrera" class="inscripcion-input">
            </div>
            <div class="rprem-form-group">
              <label>Teléfono (WhatsApp)</label>
              <input type="tel" id="pub-j2-tel" placeholder="11 1234-5678" class="inscripcion-input">
            </div>
          </div>
        </div>
        <button class="btn-prem-primary" style="margin-top:20px" onclick="enviarInscripcion('${t._id}')">
          Inscribirse al torneo →
        </button>
        <div id="inscripcion-pub-msg" style="margin-top:12px;font-size:13px"></div>
      </div>
    </div>

    ${confirmadas.length > 0 ? `
      <div class="torneo-pub-seccion">
        <h3 class="torneo-pub-titulo">Parejas confirmadas (${confirmadas.length})</h3>
        <div class="parejas-pub-lista">
          ${confirmadas.map((i, idx) => `
            <div class="pareja-pub-item">
              <span class="pareja-pub-num">${idx + 1}</span>
              <div>
                <div class="pareja-pub-nombre">${i.nombrePareja}</div>
                <div class="pareja-pub-jugadores">${i.jugador1.nombre} · ${i.jugador2.nombre}</div>
              </div>
              <span class="badge badge-verde">✅ Confirmada</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

async function enviarInscripcion(torneoId) {
  const j1n = document.getElementById('pub-j1-nombre')?.value.trim();
  const j1t = document.getElementById('pub-j1-tel')?.value.trim();
  const j2n = document.getElementById('pub-j2-nombre')?.value.trim();
  const j2t = document.getElementById('pub-j2-tel')?.value.trim();
  const msg = document.getElementById('inscripcion-pub-msg');

  if (!j1n || !j2n) {
    if (msg) { msg.style.color = '#ef4444'; msg.textContent = 'Completá el nombre de ambos jugadores.'; }
    return;
  }

  try {
    await api.inscribirsePublico(torneoId, {
      jugador1: { nombre: j1n, telefono: j1t || '' },
      jugador2: { nombre: j2n, telefono: j2t || '' },
    });
    const form = document.getElementById('form-inscripcion-pub');
    if (form) form.innerHTML = `
      <div style="text-align:center;padding:32px 0">
        <div style="font-size:48px;margin-bottom:12px">✅</div>
        <div style="font-size:20px;font-weight:800;margin-bottom:8px">¡Inscripción enviada!</div>
        <p style="color:rgba(255,255,255,0.5);font-size:14px">Tu pareja quedó pendiente de aprobación. El organizador te contactará para confirmar.</p>
      </div>
    `;
  } catch (e) {
    if (msg) { msg.style.color = '#ef4444'; msg.textContent = e.message || 'Error al inscribirse.'; }
  }
}

/* ── FASE: Grupos ── */

function renderGruposPublico(t) {
  const letras = Object.keys(t.grupos || {}).sort();
  if (!letras.length) return '';
  const inscripciones = t.inscripciones || [];
  const getNombre = id => inscripciones.find(i => i.id === id)?.nombrePareja || id;

  return `
    <div class="torneo-pub-seccion">
      <h3 class="torneo-pub-titulo">Fase de grupos</h3>
      <div class="grupos-pub-grid">
        ${letras.map(letra => {
          const grupo = t.grupos[letra];
          return `
            <div class="grupo-pub-card">
              <div class="grupo-pub-header">
                <span class="grupo-pub-letra">${letra}</span>
                <span class="grupo-pub-titulo">Grupo ${letra}</span>
              </div>

              <!-- Tabla de posiciones -->
              <table class="grupo-pub-tabla">
                <thead>
                  <tr><th>#</th><th>Pareja</th><th>V</th><th>D</th><th>SG</th><th>SP</th><th>Pts</th></tr>
                </thead>
                <tbody>
                  ${grupo.tabla.map((row, idx) => {
                    const nombre = getNombre(row.parejaId);
                    const clasifica = idx < 2;
                    return `
                      <tr class="${clasifica ? 'clasifica' : ''}">
                        <td>${clasifica ? ['🥇','🥈'][idx] : idx + 1}</td>
                        <td>
                          ${nombre}
                          ${clasifica ? '<span class="clasifica-badge">CLASIFICA</span>' : ''}
                        </td>
                        <td>${row.V}</td><td>${row.D}</td>
                        <td>${row.SG}</td><td>${row.SP}</td>
                        <td><strong>${row.Pts}</strong></td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>

              <!-- Partidos del grupo -->
              <div class="grupo-pub-partidos">
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:rgba(255,255,255,0.3);margin-bottom:8px">Partidos</div>
                ${grupo.partidos.map(p => {
                  const n1 = getNombre(p.pareja1);
                  const n2 = getNombre(p.pareja2);
                  return `
                    <div class="partido-pub-row">
                      <span class="partido-pub-hora">${p.hora || '—'}</span>
                      <span class="${p.ganador === p.pareja1 ? 'ganador-txt' : ''}">${n1}</span>
                      <span class="partido-pub-vs">vs</span>
                      <span class="${p.ganador === p.pareja2 ? 'ganador-txt' : ''}">${n2}</span>
                      <span class="partido-pub-resultado">${p.resultado || '—'}</span>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

/* ── FASE: Bracket eliminatorio ── */

function renderBracketPublico(t) {
  if (!t.bracket || !t.bracket.length) return '';
  const inscripciones = t.inscripciones || [];
  const getNombre = id => {
    if (!id) return '<span style="color:rgba(255,255,255,0.3);font-size:13px">Por definir</span>';
    return inscripciones.find(i => i.id === id)?.nombrePareja || id;
  };

  const fases = ['cuartos', 'semifinal', 'final'];
  const faseLabel = { cuartos: 'Cuartos de Final', semifinal: 'Semifinal', final: '🏆 Gran Final' };
  const activasFases = fases.filter(f => t.bracket.some(p => p.fase === f));

  return `
    <div class="torneo-pub-seccion">
      <h3 class="torneo-pub-titulo">Cuadro Eliminatorio</h3>
      <div class="bracket-pub-wrap">
        ${activasFases.map(fase => `
          <div class="bracket-pub-columna">
            <div class="bracket-pub-col-titulo">${faseLabel[fase] || fase}</div>
            ${t.bracket.filter(p => p.fase === fase).map(p => `
              <div class="bracket-pub-match ${p.ganador ? 'terminado' : (p.pareja1 && p.pareja2 ? 'listo' : 'esperando')}">
                ${p.hora ? `<div class="bracket-pub-hora">🕐 ${p.hora}</div>` : ''}
                <div class="bracket-pub-pareja ${p.ganador === p.pareja1 ? 'ganador' : (p.ganador && p.ganador !== p.pareja1 ? 'perdedor' : '')}">
                  ${getNombre(p.pareja1)}
                </div>
                <div class="bracket-pub-vs">vs</div>
                <div class="bracket-pub-pareja ${p.ganador === p.pareja2 ? 'ganador' : (p.ganador && p.ganador !== p.pareja2 ? 'perdedor' : '')}">
                  ${getNombre(p.pareja2)}
                </div>
                ${p.resultado ? `<div class="bracket-pub-resultado">${p.resultado}</div>` : ''}
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/* ── Campeón ── */

function renderCampeonPublico(t) {
  if (!t.campeon) return '';
  const pareja = (t.inscripciones || []).find(i => i.id === t.campeon);
  const nombre = pareja ? pareja.nombrePareja : t.campeon;
  const j1 = pareja?.jugador1?.nombre || '';
  const j2 = pareja?.jugador2?.nombre || '';
  return `
    <div class="campeon-display">
      <div class="campeon-trofeo">🏆</div>
      <div class="campeon-titulo">Campeón del Torneo</div>
      <div class="campeon-nombre">${nombre}</div>
      ${j1 && j2 ? `<div style="color:rgba(255,255,255,0.5);font-size:14px;margin-top:4px">${j1} · ${j2}</div>` : ''}
    </div>
  `;
}

/* ── Actualización automática cada 30s ── */

setInterval(() => {
  if (torneoActualId) {
    api.getTorneo(torneoActualId).then(t => {
      if (!t) return;
      const contenidoEl = document.getElementById('torneo-contenido');
      if (contenidoEl) renderTorneo(t, contenidoEl);
    }).catch(() => {});
  }
}, 30000);

document.addEventListener('DOMContentLoaded', iniciarTorneos);
