/* ═══════════════════════════════════════════
   profesores.js — Página pública de profesores
   ═══════════════════════════════════════════ */

async function iniciarProfesores() {
  const c = document.getElementById('profesores-contenido');
  if (!c) return;
  try {
    const profs = await api.getProfesores();
    renderStats(profs);
    renderTarjetas(profs, c);
  } catch (e) {
    c.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,.4);padding:80px 0">No se pudieron cargar los profesores.</p>`;
  }
}

function renderStats(profs) {
  const c = document.getElementById('profesores-stats');
  if (!c) return;
  const totalAlumnos = profs.reduce((s, p) => s + (p.alumnos || 0), 0);
  const avgRating    = profs.length
    ? (profs.reduce((s, p) => s + (p.rating || 5), 0) / profs.length).toFixed(1)
    : '5.0';
  const niveles = new Set(profs.flatMap(p => p.niveles || [])).size || 3;
  c.innerHTML = `
    <div class="stat-prem-item visible"><span class="spn">${profs.length}</span><span class="spl">Instructores</span></div>
    <div class="stat-prem-item visible"><span class="spn">${totalAlumnos}+</span><span class="spl">Alumnos activos</span></div>
    <div class="stat-prem-item visible"><span class="spn">${avgRating}⭐</span><span class="spl">Rating promedio</span></div>
    <div class="stat-prem-item visible"><span class="spn">${niveles}</span><span class="spl">Niveles disponibles</span></div>
  `;
}

function renderTarjetas(profs, c) {
  if (!profs.length) {
    c.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:rgba(255,255,255,.4);padding:80px 0">No hay profesores cargados aún.</p>';
    return;
  }

  const gradients = [
    'linear-gradient(160deg,#062918 0%,#1D9E75 100%)',
    'linear-gradient(160deg,#0a1a3a 0%,#2563eb 100%)',
    'linear-gradient(160deg,#1a0a30 0%,#7c3aed 100%)',
    'linear-gradient(160deg,#2a0a0a 0%,#dc2626 100%)',
  ];

  c.innerHTML = profs.map((p, i) => {
    const bg      = gradients[i % gradients.length];
    const init    = iniciales(p.nombre);
    const stars   = Math.min(5, Math.max(0, Math.round(p.rating || 5)));
    const niveles = (p.niveles || []).map(n => `<span class="prof-lvl-badge">${n}</span>`).join('');
    const imgTag  = p.imagen
      ? `<img src="${p.imagen}" alt="${p.nombre}" loading="lazy" onerror="this.style.display='none'">`
      : '';

    return `
      <div class="prof-page-card">
        <div class="prof-prem-visual" style="background:${bg}">
          <div class="prof-prem-initials">${init}</div>
          <div class="prof-prem-photo-overlay">${imgTag}</div>
          <div class="prof-img-name-bar">
            <span class="prof-img-nombre">${p.nombre}</span>
            <span class="prof-img-esp">${p.especialidad}</span>
          </div>
        </div>
        <div class="prof-page-body">
          <div class="prof-page-rating">
            <span class="prof-stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span>
            <span class="prof-rating-txt">${p.rating || '5.0'} / 5</span>
          </div>
          <div class="prof-page-datos">
            <div class="prof-dato-item"><span>🏆</span><span>${p.experiencia}</span></div>
            <div class="prof-dato-item"><span>🕐</span><span>${p.horarios}</span></div>
            <div class="prof-dato-item"><span>👥</span><span>${p.alumnos || 0} alumnos activos</span></div>
          </div>
          ${niveles ? `<div class="prof-lvl-badges">${niveles}</div>` : ''}
          <a href="https://wa.me/${(p.whatsapp || '').replace(/\D/g, '')}" target="_blank" class="prof-wa-btn">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
            </svg>
            Escribir por WhatsApp
          </a>
        </div>
      </div>
    `;
  }).join('');

  requestAnimationFrame(() => {
    document.querySelectorAll('.prof-page-card').forEach((el, i) => {
      setTimeout(() => el.classList.add('visible'), i * 110);
    });
  });
}

document.addEventListener('DOMContentLoaded', iniciarProfesores);
