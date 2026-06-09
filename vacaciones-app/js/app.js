// ═══════════════════════════════════════════════════════════════
// app.js — Controlador principal de VacaFirma
// ═══════════════════════════════════════════════════════════════

// ── Estado global ─────────────────────────────────────────────
let state = {
  session:          null,
  user:             null,
  profile:          null,
  solicitudes:      [],
  solicitudActual:  null,
  pdfBytes:         null,     // PDF generado localmente (sin firmar)
  pdfFirmadoBytes:  null,     // PDF con firma del empleado
  firmaEmpleadoOk:  false,
};

// ── Referencias DOM ───────────────────────────────────────────
const $ = id => document.getElementById(id);

const panels = {
  login:      $('panelLogin'),
  dashboard:  $('panelDashboard'),
  formulario: $('panelFormulario'),
  firmaJefe:  $('panelFirmaJefe'),
};

// ── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  initAuth();
});

function initAuth() {
  // Escucha cambios de sesión (incluyendo magic link redirect)
  onAuthStateChange(async (session) => {
    state.session = session;
    if (session) {
      state.user    = session.user;
      state.profile = await getUserProfile(session.user.id);
      mostrarDashboard();
    } else {
      mostrarLogin();
    }
  });
}

// ── BIND EVENTS ───────────────────────────────────────────────

function bindEvents() {
  // Auth
  $('btnSendMagicLink').addEventListener('click', handleMagicLink);
  $('btnLogin').addEventListener('click', () => {
    if (state.session) handleLogout();
    else mostrarLogin();
  });
  $('loginEmail').addEventListener('keydown', e => { if (e.key === 'Enter') handleMagicLink(); });

  // Dashboard
  $('btnNuevaSolicitud').addEventListener('click', () => mostrarFormulario());

  // Formulario
  $('btnVolverDashboard').addEventListener('click', () => mostrarDashboard());
  $('btnCancelar').addEventListener('click', () => mostrarDashboard());
  $('btnPreview').addEventListener('click', actualizarVistaPrevia);
  $('btnGenerarYFirmar').addEventListener('click', handleGenerarYFirmar);
  $('btnEnviar').addEventListener('click', handleEnviarSolicitud);

  // Panel jefe
  $('btnVolverDashboard2').addEventListener('click', () => mostrarDashboard());
  $('btnFirmarJefe').addEventListener('click', handleFirmarJefe);

  // Modal AutoFirma
  $('btnModalCancelar').addEventListener('click', cerrarModalAutofirma);
  $('btnModalReintentar').addEventListener('click', () => {
    cerrarModalAutofirma();
    intentarAbrirAutofirma();
  });
  $('linkDescargaAutofirma') && ($('linkDescargaAutofirma').href = AUTOFIRMA.DOWNLOAD_URL);
}

// ── AUTH HANDLERS ─────────────────────────────────────────────

async function handleMagicLink() {
  const email = $('loginEmail').value.trim();
  if (!email) { toast('Introduce tu correo institucional.', 'error'); return; }

  const btn = $('btnSendMagicLink');
  btn.disabled = true;
  btn.querySelector('span').textContent = 'Enviando…';

  try {
    await enviarMagicLink(email);
    $('loginMessage').textContent = `✓ Enlace enviado a ${email}. Revisa tu bandeja de entrada.`;
    $('loginMessage').style.color = 'var(--jade)';
  } catch (err) {
    toast('Error al enviar el enlace: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.querySelector('span').textContent = 'Enviar enlace de acceso';
  }
}

async function handleLogout() {
  await logout();
  state = { session: null, user: null, profile: null, solicitudes: [], solicitudActual: null, pdfBytes: null, pdfFirmadoBytes: null, firmaEmpleadoOk: false };
  mostrarLogin();
}

// ── NAVEGACIÓN ────────────────────────────────────────────────

function mostrarPanel(nombre) {
  Object.values(panels).forEach(p => p.classList.add('hidden'));
  panels[nombre].classList.remove('hidden');
}

function mostrarLogin() {
  $('authStatus').textContent = 'Sin sesión';
  $('btnLogin').textContent   = 'Acceder';
  mostrarPanel('login');
}

async function mostrarDashboard() {
  const email = state.user?.email || '';
  const rol   = state.profile?.rol || ROLES.EMPLEADO;

  $('authStatus').textContent = email;
  $('btnLogin').textContent   = 'Cerrar sesión';
  $('userRoleBadge').textContent = `Rol: ${rol} — ${email}`;

  mostrarPanel('dashboard');
  await cargarSolicitudes();
}

function mostrarFormulario() {
  state.pdfBytes        = null;
  state.pdfFirmadoBytes = null;
  state.firmaEmpleadoOk = false;

  // Resetear campos
  ['fechaInicio','fechaFin','direccion','observaciones'].forEach(id => { $(id).value = ''; });
  $('pdfPreview').innerHTML = '<span class="preview-placeholder">Rellena los datos para previsualizar el PDF</span>';
  setSignStatus('signStatusEmpleado', 'pending', 'Pendiente de firma');
  $('btnEnviar').disabled = true;
  $('btnEnviar').classList.add('disabled');
  $('autofirmaInfo').style.display = 'none';

  mostrarPanel('formulario');
}

function mostrarPanelFirmaJefe(solicitud) {
  state.solicitudActual = solicitud;

  // Detalles
  $('detallesSolicitud').innerHTML = `
    <span class="detail-label">Empleado</span>   <span class="detail-value">${solicitud.empleado_nombre}</span>
    <span class="detail-label">Inicio</span>      <span class="detail-value">${formatearFechaCorta(solicitud.fecha_inicio)}</span>
    <span class="detail-label">Fin</span>         <span class="detail-value">${formatearFechaCorta(solicitud.fecha_fin)}</span>
    <span class="detail-label">Dirección</span>   <span class="detail-value">${solicitud.direccion}</span>
    <span class="detail-label">Estado</span>      <span class="detail-value">${badgeHTML(solicitud.estado)}</span>
  `;

  // Estado de firmas
  const firmas = [
    { label: 'Empleado',       ok: solicitud.firma_empleado },
    { label: 'Jefe inmediato', ok: solicitud.firma_jefe1 },
    { label: 'Jefe superior',  ok: solicitud.firma_jefe2 },
  ];
  $('firmasEstado').innerHTML = firmas.map(f => `
    <div class="firma-row">
      <span class="dot ${f.ok ? 'dot-ok' : 'dot-pending'}"></span>
      <span>${f.label}: ${f.ok ? '<strong>Firmado</strong>' : 'Pendiente'}</span>
    </div>
  `).join('');

  // Estado firma jefe actual
  const miRol = state.profile?.rol;
  const yaFirmé = (miRol === ROLES.JEFE_1 && solicitud.firma_jefe1) ||
                  (miRol === ROLES.JEFE_2 && solicitud.firma_jefe2);

  if (yaFirmé) {
    setSignStatus('signStatusJefe', 'signed', 'Ya has firmado esta solicitud');
    $('btnFirmarJefe').disabled = true;
  } else {
    setSignStatus('signStatusJefe', 'pending', 'Pendiente de tu firma');
    $('btnFirmarJefe').disabled = false;
  }

  mostrarPanel('firmaJefe');
}

// ── CARGA DE SOLICITUDES ──────────────────────────────────────

async function cargarSolicitudes() {
  const tbody = $('tablaSolicitudes');
  tbody.innerHTML = '<tr class="empty-row"><td colspan="9">Cargando…</td></tr>';

  try {
    const rol  = state.profile?.rol || ROLES.EMPLEADO;
    const data = await getSolicitudes(state.user.id, rol);
    state.solicitudes = data;
    renderTabla(data);
  } catch (err) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="9">Error al cargar: ${err.message}</td></tr>`;
  }
}

function renderTabla(solicitudes) {
  const tbody = $('tablaSolicitudes');

  if (!solicitudes.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="9">No hay solicitudes. Crea la primera con el botón superior.</td></tr>';
    return;
  }

  tbody.innerHTML = solicitudes.map(s => `
    <tr>
      <td>${s.empleado_nombre}</td>
      <td>${formatearFechaCorta(s.fecha_inicio)}</td>
      <td>${formatearFechaCorta(s.fecha_fin)}</td>
      <td title="${s.direccion}">${truncar(s.direccion, 30)}</td>
      <td>${badgeHTML(s.estado)}</td>
      <td><span class="firma-cell"><span class="dot ${s.firma_empleado ? 'dot-ok' : 'dot-pending'}"></span>${s.firma_empleado ? 'Firmado' : 'Pendiente'}</span></td>
      <td><span class="firma-cell"><span class="dot ${s.firma_jefe1    ? 'dot-ok' : 'dot-pending'}"></span>${s.firma_jefe1    ? 'Firmado' : 'Pendiente'}</span></td>
      <td><span class="firma-cell"><span class="dot ${s.firma_jefe2    ? 'dot-ok' : 'dot-pending'}"></span>${s.firma_jefe2    ? 'Firmado' : 'Pendiente'}</span></td>
      <td>${accionesHTML(s)}</td>
    </tr>
  `).join('');

  // Bind acciones
  solicitudes.forEach(s => {
    const btnVer = document.querySelector(`[data-ver="${s.id}"]`);
    const btnFirmar = document.querySelector(`[data-firmar="${s.id}"]`);
    const btnDescargar = document.querySelector(`[data-descargar="${s.id}"]`);

    btnVer?.addEventListener('click', () => mostrarPanelFirmaJefe(s));
    btnFirmar?.addEventListener('click', () => mostrarPanelFirmaJefe(s));
    btnDescargar?.addEventListener('click', () => handleDescargarPDF(s));
  });
}

function accionesHTML(s) {
  const rol = state.profile?.rol || ROLES.EMPLEADO;
  const acciones = [];

  if (s.pdf_path) {
    acciones.push(`<button class="link-action" data-descargar="${s.id}">Descargar</button>`);
  }

  const puedeJefe1Firmar = rol === ROLES.JEFE_1 && !s.firma_jefe1 && s.firma_empleado;
  const puedeJefe2Firmar = rol === ROLES.JEFE_2 && !s.firma_jefe2 && s.firma_jefe1;

  if (puedeJefe1Firmar || puedeJefe2Firmar) {
    acciones.push(`<button class="link-action" data-firmar="${s.id}">Firmar</button>`);
  } else if (rol !== ROLES.EMPLEADO) {
    acciones.push(`<button class="link-action" data-ver="${s.id}">Ver</button>`);
  }

  return acciones.join(' · ') || '—';
}

// ── GENERAR Y FIRMAR (EMPLEADO) ───────────────────────────────

async function actualizarVistaPrevia() {
  const datos = getDatosFormulario();
  if (!datos.fechaInicio || !datos.fechaFin || !datos.direccion) {
    toast('Rellena al menos fecha inicio, fecha fin y dirección.', 'error');
    return;
  }

  try {
    const bytes = await generarPDF({
      ...datos,
      empleadoNombre: state.profile?.nombre_completo || state.user?.email,
    });
    state.pdfBytes = bytes;
    mostrarPreviewCanvas(bytes);
  } catch (err) {
    toast('Error generando el PDF: ' + err.message, 'error');
  }
}

async function handleGenerarYFirmar() {
  const datos = getDatosFormulario();
  if (!datos.fechaInicio || !datos.fechaFin || !datos.direccion) {
    toast('Rellena todos los campos obligatorios antes de firmar.', 'error');
    return;
  }

  // 1. Generar PDF
  try {
    state.pdfBytes = await generarPDF({
      ...datos,
      empleadoNombre: state.profile?.nombre_completo || state.user?.email,
    });
    mostrarPreviewCanvas(state.pdfBytes);
  } catch (err) {
    toast('Error generando el PDF: ' + err.message, 'error');
    return;
  }

  // 2. Abrir AutoFirma
  abrirModalAutofirma();

  try {
    const { pdfFirmado, certInfo } = await firmarConAutofirma(state.pdfBytes, {
      rol:          'empleado',
      solicitudId:  'nuevo',
    });

    state.pdfFirmadoBytes = pdfFirmado;
    state.firmaEmpleadoOk = true;

    cerrarModalAutofirma();
    setSignStatus('signStatusEmpleado', 'signed', `Firmado con certificado · ${certInfo.ts || 'ahora'}`);
    $('btnEnviar').disabled = false;
    $('btnEnviar').classList.remove('disabled');
    mostrarPreviewCanvas(pdfFirmado);
    toast('¡PDF firmado correctamente! Ya puedes enviarlo.', 'success');

  } catch (err) {
    cerrarModalAutofirma();

    if (err.code === 'NOT_RUNNING') {
      $('autofirmaInfo').style.display = 'block';
      intentarAbrirAutofirma();
      setSignStatus('signStatusEmpleado', 'error', 'AutoFirma no encontrado — instálalo y vuelve a intentarlo');
    } else if (err.code === 'CANCELLED') {
      setSignStatus('signStatusEmpleado', 'pending', 'Firma cancelada — inténtalo de nuevo');
      toast('Firma cancelada.', 'error');
    } else {
      setSignStatus('signStatusEmpleado', 'error', 'Error: ' + err.message);
      toast('Error al firmar: ' + err.message, 'error');
    }
  }
}

async function handleEnviarSolicitud() {
  if (!state.firmaEmpleadoOk || !state.pdfFirmadoBytes) {
    toast('Firma el documento antes de enviarlo.', 'error');
    return;
  }

  const btn = $('btnEnviar');
  btn.disabled = true;
  btn.textContent = 'Enviando…';

  try {
    const datos = getDatosFormulario();
    const nombre = state.profile?.nombre_completo || state.user?.email;

    // 1. Crear registro en BD
    const solicitud = await crearSolicitud({
      empleadoId:     state.user.id,
      empleadoNombre: nombre,
      fechaInicio:    datos.fechaInicio,
      fechaFin:       datos.fechaFin,
      direccion:      datos.direccion,
      observaciones:  datos.observaciones,
    });

    // 2. Subir PDF firmado a Storage
    const path = buildPDFPath(solicitud.id);
    await subirPDF(path, state.pdfFirmadoBytes);

    // 3. Actualizar registro con ruta PDF y firma empleado
    await actualizarSolicitud(solicitud.id, {
      pdf_path:       path,
      firma_empleado: true,
      estado:         ESTADOS.PENDIENTE_JEFE1,
    });

    toast('¡Solicitud enviada correctamente! Los jefes recibirán notificación.', 'success');
    mostrarDashboard();

  } catch (err) {
    toast('Error al enviar: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Enviar solicitud firmada';
  }
}

// ── FIRMAR JEFE ───────────────────────────────────────────────

async function handleFirmarJefe() {
  const s   = state.solicitudActual;
  const rol = state.profile?.rol;

  if (!s || !s.pdf_path) {
    toast('No hay PDF disponible para firmar.', 'error');
    return;
  }

  abrirModalAutofirma();

  try {
    // 1. Descargar PDF actual de Supabase
    const pdfActual = await descargarPDF(s.pdf_path);
    const pdfBytes  = new Uint8Array(pdfActual);

    // 2. Co-firmar con AutoFirma
    const { pdfFirmado, certInfo } = await cofirmarConAutofirma(pdfBytes, {
      rol:         rol,
      solicitudId: s.id,
    });

    // 3. Subir PDF co-firmado
    await subirPDF(s.pdf_path, pdfFirmado);

    // 4. Actualizar estado en BD
    const esJefe1 = rol === ROLES.JEFE_1;
    const nuevoEstado = esJefe1 ? ESTADOS.PENDIENTE_JEFE2 : ESTADOS.APROBADA;

    await actualizarSolicitud(s.id, {
      [esJefe1 ? 'firma_jefe1' : 'firma_jefe2']: true,
      estado: nuevoEstado,
    });

    cerrarModalAutofirma();
    setSignStatus('signStatusJefe', 'signed', `Firmado · ${certInfo.ts || 'ahora'}`);
    toast('¡Solicitud firmada y aprobada!', 'success');

    setTimeout(() => mostrarDashboard(), 1500);

  } catch (err) {
    cerrarModalAutofirma();

    if (err.code === 'NOT_RUNNING') {
      intentarAbrirAutofirma();
      toast('AutoFirma no está en ejecución. Ábrelo e inténtalo de nuevo.', 'error');
    } else if (err.code === 'CANCELLED') {
      toast('Firma cancelada.', 'error');
    } else {
      toast('Error al firmar: ' + err.message, 'error');
    }
    setSignStatus('signStatusJefe', 'error', 'Error en la firma');
  }
}

// ── DESCARGA ──────────────────────────────────────────────────

async function handleDescargarPDF(solicitud) {
  try {
    const url = await getURLFirmada(solicitud.pdf_path);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = `vacaciones-${solicitud.empleado_nombre}-${solicitud.fecha_inicio}.pdf`;
    a.click();
  } catch (err) {
    toast('Error al descargar: ' + err.message, 'error');
  }
}

// ── UI HELPERS ────────────────────────────────────────────────

function getDatosFormulario() {
  return {
    fechaInicio:   $('fechaInicio').value,
    fechaFin:      $('fechaFin').value,
    direccion:     $('direccion').value.trim(),
    observaciones: $('observaciones').value.trim(),
  };
}

function setSignStatus(id, tipo, texto) {
  const el = $(id);
  el.innerHTML = `<span class="sign-dot ${tipo}"></span><span>${texto}</span>`;
}

function abrirModalAutofirma() {
  $('modalAutofirma').classList.remove('hidden');
  // Reinicia la animación del progress bar
  const fill = $('progressFill');
  fill.style.animation = 'none';
  fill.offsetHeight; // reflow
  fill.style.animation = '';
}

function cerrarModalAutofirma() {
  $('modalAutofirma').classList.add('hidden');
}

async function mostrarPreviewCanvas(pdfBytes) {
  // Renderiza la primera página del PDF como imagen usando pdf-lib
  // Para un render real se usaría pdf.js, aquí mostramos un placeholder visual
  const preview = $('pdfPreview');
  preview.innerHTML = `
    <div style="text-align:center; padding: 1.5rem;">
      <div style="font-size:3rem">📄</div>
      <p style="font-size:0.85rem; color: var(--text-muted); margin-top:0.5rem;">
        PDF generado: ${(pdfBytes.byteLength / 1024).toFixed(1)} KB
      </p>
      <p style="font-size:0.75rem; color: var(--text-light); margin-top:0.25rem;">
        Para previsualizar el documento descárgalo o usa el visor del navegador.
      </p>
      <button onclick="descargarLocalPDF()" style="
        margin-top:1rem; padding:0.4rem 1rem;
        background:var(--navy); color:white;
        border:none; border-radius:6px; cursor:pointer; font-size:0.8rem;">
        Ver PDF
      </button>
    </div>
  `;
}

// Abre el PDF en un modal dentro de la propia página (no navega ni cierra la app)
window.descargarLocalPDF = function() {
  var bytes = state.pdfFirmadoBytes || state.pdfBytes;
  if (!bytes) return;

  if (window._pdfPreviewUrl) URL.revokeObjectURL(window._pdfPreviewUrl);
  var blob = new Blob([bytes], { type: 'application/pdf' });
  window._pdfPreviewUrl = URL.createObjectURL(blob);

  var existing = document.getElementById('pdfViewerOverlay');
  if (existing) existing.remove();

  var overlay = document.createElement('div');
  overlay.id = 'pdfViewerOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;';

  var closeBtn = document.createElement('button');
  closeBtn.textContent = '\u2715 Cerrar';
  closeBtn.style.cssText = 'background:#c9a84c;border:none;color:#0f1a2e;padding:0.4rem 1rem;border-radius:6px;cursor:pointer;font-weight:600;font-family:sans-serif;';
  closeBtn.onclick = function() { document.getElementById('pdfViewerOverlay').remove(); };

  var label = document.createElement('span');
  label.textContent = 'Vista previa del PDF';
  label.style.cssText = 'color:white;font-size:0.9rem;font-family:sans-serif;';

  var topBar = document.createElement('div');
  topBar.style.cssText = 'display:flex;justify-content:space-between;align-items:center;';
  topBar.appendChild(label);
  topBar.appendChild(closeBtn);

  var iframe = document.createElement('iframe');
  iframe.src = window._pdfPreviewUrl;
  iframe.style.cssText = 'flex:1;border:none;border-radius:8px;';

  var inner = document.createElement('div');
  inner.style.cssText = 'width:90%;max-width:900px;height:85vh;display:flex;flex-direction:column;gap:0.75rem;';
  inner.appendChild(topBar);
  inner.appendChild(iframe);

  overlay.appendChild(inner);
  document.body.appendChild(overlay);
};

function badgeHTML(estado) {
  const map = {
    [ESTADOS.BORRADOR]:        ['badge-pending',  'Borrador'],
    [ESTADOS.PENDIENTE_JEFE1]: ['badge-partial',  'Pte. Jefe 1'],
    [ESTADOS.PENDIENTE_JEFE2]: ['badge-partial',  'Pte. Jefe 2'],
    [ESTADOS.APROBADA]:        ['badge-approved', 'Aprobada'],
    [ESTADOS.RECHAZADA]:       ['badge-rejected', 'Rechazada'],
  };
  const [cls, label] = map[estado] || ['badge-pending', estado];
  return `<span class="badge ${cls}">${label}</span>`;
}

function formatearFechaCorta(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function truncar(str, n) {
  return str && str.length > n ? str.slice(0, n) + '…' : (str || '—');
}

function toast(msg, tipo = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `<span>${tipo === 'success' ? '✓' : tipo === 'error' ? '✕' : 'ℹ'}</span><span>${msg}</span>`;
  $('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 4500);
}
