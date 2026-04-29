/* ════════════════════════════════════════════════════
   auth-client.js — Login / Registro / Perfil clientes
   ════════════════════════════════════════════════════ */

const AC = (function () {

  const USERS_KEY   = 'padelpro_users';
  const SESSION_KEY = 'padelpro_session';

  /* ── Storage ───────────────────────────────────────── */

  function getUsers()        { try { return JSON.parse(localStorage.getItem(USERS_KEY)) || []; } catch { return []; } }
  function saveUsers(u)      { localStorage.setItem(USERS_KEY, JSON.stringify(u)); }
  function getSession()      { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; } }
  function saveSession(s)    { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
  function clearSession()    { localStorage.removeItem(SESSION_KEY); }

  /* ── Simple hash (demo) ────────────────────────────── */
  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return h.toString(36);
  }

  /* ── Iniciales del nombre ──────────────────────────── */
  function initials(nombre) {
    return nombre.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  }

  /* ── Inyectar modal HTML ───────────────────────────── */
  function injectModal() {
    const div = document.createElement('div');
    div.id = 'ac-overlay';
    div.innerHTML = `
      <div class="ac-card" id="ac-card">
        <button class="ac-close" onclick="AC.close()" title="Cerrar">✕</button>

        <div class="ac-logo">PadelPro</div>
        <div class="ac-tagline">Tu club de pádel favorito</div>

        <!-- TABS -->
        <div class="ac-tabs" id="ac-tabs">
          <button class="ac-tab active" id="tab-login"    onclick="AC.showTab('login')">Iniciar sesión</button>
          <button class="ac-tab"        id="tab-registro" onclick="AC.showTab('registro')">Registrarse</button>
        </div>

        <!-- LOGIN -->
        <div id="ac-panel-login">
          <form class="ac-form" onsubmit="AC.doLogin(event)">
            <div class="ac-field">
              <label>Email</label>
              <input type="email" id="ac-login-email" placeholder="tu@email.com" autocomplete="email" required>
            </div>
            <div class="ac-field">
              <label>Contraseña</label>
              <input type="password" id="ac-login-pass" placeholder="Tu contraseña" autocomplete="current-password" required>
            </div>
            <div class="ac-error" id="ac-login-error"></div>
            <button type="submit" class="ac-btn" id="ac-login-btn">Ingresar</button>
          </form>
          <div class="ac-switch">¿No tenés cuenta? <span onclick="AC.showTab('registro')">Registrate gratis</span></div>
        </div>

        <!-- REGISTRO -->
        <div id="ac-panel-registro" style="display:none">
          <form class="ac-form" onsubmit="AC.doRegistro(event)">
            <div class="ac-field">
              <label>Nombre completo</label>
              <input type="text" id="ac-reg-nombre" placeholder="Juan García" autocomplete="name" required>
            </div>
            <div class="ac-field">
              <label>Email</label>
              <input type="email" id="ac-reg-email" placeholder="tu@email.com" autocomplete="email" required>
            </div>
            <div class="ac-field">
              <label>Contraseña</label>
              <input type="password" id="ac-reg-pass" placeholder="Mínimo 6 caracteres" autocomplete="new-password" required minlength="6">
            </div>
            <div class="ac-field">
              <label>Confirmar contraseña</label>
              <input type="password" id="ac-reg-pass2" placeholder="Repetí la contraseña" autocomplete="new-password" required>
            </div>
            <div class="ac-error" id="ac-reg-error"></div>
            <div class="ac-success" id="ac-reg-ok"></div>
            <button type="submit" class="ac-btn" id="ac-reg-btn">Crear cuenta</button>
          </form>
          <div class="ac-switch">¿Ya tenés cuenta? <span onclick="AC.showTab('login')">Iniciá sesión</span></div>
        </div>

        <!-- PERFIL -->
        <div id="ac-panel-perfil" style="display:none">
          <div class="ac-perfil-avatar" id="ac-perfil-avatar">?</div>
          <div class="ac-perfil-nombre" id="ac-perfil-nombre">—</div>
          <div class="ac-perfil-email"  id="ac-perfil-email">—</div>
          <div class="ac-perfil-stats">
            <div class="ac-stat">
              <div class="ac-stat-val" id="ac-perfil-pts">0</div>
              <div class="ac-stat-lbl">Puntos</div>
            </div>
            <div class="ac-stat">
              <div class="ac-stat-val" id="ac-perfil-res">0</div>
              <div class="ac-stat-lbl">Reservas</div>
            </div>
          </div>
          <button class="ac-btn-logout" onclick="AC.doLogout()">Cerrar sesión</button>
        </div>

      </div>`;
    document.body.appendChild(div);

    // Cerrar al hacer click fuera de la card
    div.addEventListener('click', function (e) {
      if (e.target === div) AC.close();
    });
  }

  /* ── Inyectar botón en la nav ──────────────────────── */
  function injectNav() {
    // Desktop: insertar antes del botón hamburger
    const hamburger = document.querySelector('.nav-hamburger');
    if (hamburger) {
      const wrap = document.createElement('div');
      wrap.id = 'ac-nav-slot';
      hamburger.parentNode.insertBefore(wrap, hamburger);
    }

    // Mobile: insertar al final del nav mobile
    const mobileNav = document.getElementById('nav-mobile-prem');
    if (mobileNav) {
      const wrap = document.createElement('div');
      wrap.id = 'ac-mobile-slot';
      mobileNav.appendChild(wrap);
    }

    updateNav();
  }

  /* ── Actualizar nav según sesión ───────────────────── */
  function updateNav() {
    const session  = getSession();
    const desktop  = document.getElementById('ac-nav-slot');
    const mobile   = document.getElementById('ac-mobile-slot');

    if (session) {
      const pts = session.puntos || 0;
      const ini = initials(session.nombre);
      if (desktop) desktop.innerHTML = `
        <button class="ac-nav-user" onclick="AC.open('perfil')">
          ${ini} <span class="ac-pts">★ ${pts} pts</span>
        </button>`;
      if (mobile) mobile.innerHTML = `
        <button class="ac-mobile-btn" onclick="AC.open('perfil')">
          ${session.nombre} — ★ ${pts} pts
        </button>`;
    } else {
      if (desktop) desktop.innerHTML = `
        <button class="ac-nav-login" onclick="AC.open('login')">Iniciar sesión</button>`;
      if (mobile) mobile.innerHTML = `
        <button class="ac-mobile-btn" onclick="AC.open('login')">Iniciar sesión</button>`;
    }
  }

  /* ── Abrir / cerrar modal ──────────────────────────── */
  function open(tab) {
    const session = getSession();
    const overlay = document.getElementById('ac-overlay');
    if (!overlay) return;

    // Si hay sesión y no se pidió tab específico → mostrar perfil
    const targetTab = tab || (session ? 'perfil' : 'login');
    showTab(targetTab);
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    const overlay = document.getElementById('ac-overlay');
    if (overlay) overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  /* ── Cambiar tab ───────────────────────────────────── */
  function showTab(tab) {
    const session = getSession();
    const tabs    = document.getElementById('ac-tabs');
    const panels  = ['login','registro','perfil'];

    panels.forEach(p => {
      const el = document.getElementById('ac-panel-' + p);
      if (el) el.style.display = p === tab ? 'block' : 'none';
    });

    // Tabs solo visibles en login/registro
    if (tabs) tabs.style.display = (tab === 'perfil') ? 'none' : 'flex';

    // Marcar tab activo
    ['login','registro'].forEach(t => {
      const btn = document.getElementById('tab-' + t);
      if (btn) btn.classList.toggle('active', t === tab);
    });

    // Rellenar perfil si corresponde
    if (tab === 'perfil' && session) fillPerfil(session);

    // Limpiar errores
    ['ac-login-error','ac-reg-error','ac-reg-ok'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  }

  /* ── Rellenar datos del perfil ─────────────────────── */
  function fillPerfil(session) {
    const av = document.getElementById('ac-perfil-avatar');
    const nm = document.getElementById('ac-perfil-nombre');
    const em = document.getElementById('ac-perfil-email');
    const pt = document.getElementById('ac-perfil-pts');
    const rs = document.getElementById('ac-perfil-res');
    if (av) av.textContent = initials(session.nombre);
    if (nm) nm.textContent = session.nombre;
    if (em) em.textContent = session.email;
    if (pt) pt.textContent = session.puntos || 0;
    if (rs) rs.textContent = session.reservas || 0;
  }

  /* ── Login ─────────────────────────────────────────── */
  function doLogin(e) {
    e.preventDefault();
    const email  = document.getElementById('ac-login-email').value.trim().toLowerCase();
    const pass   = document.getElementById('ac-login-pass').value;
    const errEl  = document.getElementById('ac-login-error');
    const btn    = document.getElementById('ac-login-btn');
    errEl.textContent = '';

    const users = getUsers();
    const user  = users.find(u => u.email === email);

    if (!user || user.passwordHash !== simpleHash(pass)) {
      errEl.textContent = 'Email o contraseña incorrectos.';
      document.getElementById('ac-login-pass').value = '';
      return;
    }

    btn.disabled = true; btn.textContent = 'Ingresando...';

    const session = { userId: user.id, nombre: user.nombre, email: user.email, puntos: user.puntos, reservas: user.reservas };
    saveSession(session);

    setTimeout(() => {
      btn.disabled = false; btn.textContent = 'Ingresar';
      close();
      updateNav();
    }, 350);
  }

  /* ── Registro ──────────────────────────────────────── */
  function doRegistro(e) {
    e.preventDefault();
    const nombre = document.getElementById('ac-reg-nombre').value.trim();
    const email  = document.getElementById('ac-reg-email').value.trim().toLowerCase();
    const pass   = document.getElementById('ac-reg-pass').value;
    const pass2  = document.getElementById('ac-reg-pass2').value;
    const errEl  = document.getElementById('ac-reg-error');
    const okEl   = document.getElementById('ac-reg-ok');
    const btn    = document.getElementById('ac-reg-btn');
    errEl.textContent = ''; okEl.textContent = '';

    if (pass !== pass2)       { errEl.textContent = 'Las contraseñas no coinciden.'; return; }
    if (pass.length < 6)      { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; return; }

    const users = getUsers();
    if (users.find(u => u.email === email)) {
      errEl.textContent = 'Ya existe una cuenta con ese email.'; return;
    }

    btn.disabled = true; btn.textContent = 'Creando cuenta...';

    const newUser = {
      id: 'u_' + Date.now(),
      nombre, email,
      passwordHash: simpleHash(pass),
      puntos: 0,
      reservas: 0,
      fechaRegistro: new Date().toISOString().split('T')[0]
    };
    users.push(newUser);
    saveUsers(users);

    const session = { userId: newUser.id, nombre: newUser.nombre, email: newUser.email, puntos: 0, reservas: 0 };
    saveSession(session);

    okEl.textContent = '¡Cuenta creada! Bienvenido/a ' + nombre.split(' ')[0] + '.';

    setTimeout(() => {
      btn.disabled = false; btn.textContent = 'Crear cuenta';
      close();
      updateNav();
    }, 800);
  }

  /* ── Logout ────────────────────────────────────────── */
  function doLogout() {
    clearSession();
    close();
    updateNav();
  }

  /* ── Init ──────────────────────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    injectModal();
    injectNav();
  });

  return { open, close, showTab, doLogin, doRegistro, doLogout };

})();
