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
  const preview = $('pdfPreview');
  preview.innerHTML = '<span class="preview-placeholder">Cargando vista previa…</span>';

  try {
    // Cargar pdf.js desde CDN si no está ya disponible
    if (!window.pdfjsLib) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }

    const pdfDoc = await window.pdfjsLib.getDocument({ data: pdfBytes }).promise;
    const numPages = pdfDoc.numPages;

    // Contenedor scrollable
    preview.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'width:100%;overflow-y:auto;display:flex;flex-direction:column;align-items:center;gap:8px;padding:8px 0;box-sizing:border-box;';

    for (let i = 1; i <= numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const scale = (preview.clientWidth - 24) / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale: Math.max(scale, 0.5) });

      const canvas = document.createElement('canvas');
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      canvas.style.cssText = 'max-width:100%;box-shadow:0 1px 4px rgba(0,0,0,0.15);border-radius:2px;';

      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      wrapper.appendChild(canvas);
    }

    // Botón de descarga bajo el preview
    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:center;padding:8px 0 4px;';
    const btn = document.createElement('button');
    btn.textContent = '⬇ Descargar PDF';
    btn.style.cssText = 'padding:0.35rem 1rem;background:var(--navy);color:white;border:none;border-radius:6px;cursor:pointer;font-size:0.8rem;';
    btn.onclick = descargarLocalPDF;
    btnRow.appendChild(btn);
    wrapper.appendChild(btnRow);

    preview.appendChild(wrapper);

  } catch (err) {
    console.error('Error renderizando PDF:', err);
    preview.innerHTML = '<span class="preview-placeholder">No se pudo mostrar la vista previa.</span>';
  }
}

// Descarga el PDF directamente sin navegar ni cerrar la app
window.descargarLocalPDF = function() {
  var bytes = state.pdfFirmadoBytes || state.pdfBytes;
  if (!bytes) return;

  try {
    if (window._pdfPreviewUrl) {
      URL.revokeObjectURL(window._pdfPreviewUrl);
      window._pdfPreviewUrl = null;
    }
    var blob = new Blob([bytes], { type: 'application/pdf' });
    var url = URL.createObjectURL(blob);
    window._pdfPreviewUrl = url;

