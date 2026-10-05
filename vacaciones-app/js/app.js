// ═══════════════════════════════════════════════════════════════
// app.js — VacaFirma 2.0 — Controlador principal
// ═══════════════════════════════════════════════════════════════

// ── Estado global ─────────────────────────────────────────────
let state = {
  session:        null,
  user:           null,
  profile:        null,
  permisos:       [],
  permisoActual:  null,   // permiso abierto en panel de detalle/firma
  pdfBytes:       null,   // PDF generado localmente antes de firmar
};

const $ = id => document.getElementById(id);

// ── INIT ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  onAuthStateChange(async (session) => {
    state.session = session;
    if (session) {
      state.user    = session.user;
      state.profile = await getUserProfile(session.user.id);
      if (!state.profile) {
        mostrarPanel('panelPerfil');
      } else {
        await cargarDashboard();
        mostrarPanel('panelDashboard');
      }
    } else {
      mostrarPanel('panelLogin');
    }
  });

  // Toggle login con contraseña
  const toggle  = $('togglePasswordLogin');
  const section = $('loginPasswordSection');
  if (toggle && section) {
    toggle.addEventListener('click', e => {
      e.preventDefault();
      const abierto = section.style.display !== 'none';
      section.style.display = abierto ? 'none' : 'block';
      toggle.textContent    = abierto ? 'Acceder con contraseña' : 'Usar enlace de acceso';
    });
  }
});

// ── PANELES ───────────────────────────────────────────────────

function mostrarPanel(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.add('hidden'));
  const p = $(id);
  if (p) p.classList.remove('hidden');
}

// ── BIND EVENTS ───────────────────────────────────────────────

function bindEvents() {
  // Auth
  $('btnSendMagicLink')  && $('btnSendMagicLink').addEventListener('click', handleMagicLink);
  $('btnLoginPassword')  && $('btnLoginPassword').addEventListener('click', handleLoginPassword);
  $('loginPassword')     && $('loginPassword').addEventListener('keydown', e => { if (e.key === 'Enter') handleLoginPassword(); });
  $('btnLogin')          && $('btnLogin').addEventListener('click', () => {
    if (state.session) handleLogout(); else mostrarPanel('panelLogin');
  });

  // Perfil (primer acceso)
  $('btnGuardarPerfil')  && $('btnGuardarPerfil').addEventListener('click', handleGuardarPerfil);

  // Dashboard
  $('btnNuevoPermiso')   && $('btnNuevoPermiso').addEventListener('click', () => {
    resetFormulario();
    mostrarPanel('panelFormulario');
  });

  // Formulario nuevo permiso
  $('btnCancelarForm')   && $('btnCancelarForm').addEventListener('click', () => mostrarPanel('panelDashboard'));
  $('btnFirmarEnviar')   && $('btnFirmarEnviar').addEventListener('click', handleFirmarYEnviar);
  $('tipoPermiso')       && $('tipoPermiso').addEventListener('change', toggleMotivo);

  // Panel detalle / firma jefe
  $('btnVolverDetalle')  && $('btnVolverDetalle').addEventListener('click', () => mostrarPanel('panelDashboard'));
  $('btnAprobar')        && $('btnAprobar').addEventListener('click', handleAprobar);
  $('btnRechazar')       && $('btnRechazar').addEventListener('click', toggleRechazar);
  $('btnConfirmarRechazo') && $('btnConfirmarRechazo').addEventListener('click', handleConfirmarRechazo);
  $('btnCancelarRechazo')  && $('btnCancelarRechazo').addEventListener('click', toggleRechazar);
  $('btnDescargarPDF')   && $('btnDescargarPDF').addEventListener('click', handleDescargarPDF);
  $('btnDescargarPDF2')  && $('btnDescargarPDF2').addEventListener('click', handleDescargarPDF);
}

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

async function handleMagicLink() {
  const email = $('loginEmail').value.trim();
  if (!email) { toast('Introduce tu correo.', 'error'); return; }
  const btn = $('btnSendMagicLink');
  btn.disabled = true;
  try {
    await enviarMagicLink(email);
    $('loginMessage').textContent = `✓ Enlace enviado a ${email}. Revisa tu bandeja.`;
    $('loginMessage').style.color = 'var(--jade, green)';
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleLoginPassword() {
  const email    = $('loginEmail').value.trim();
  const password = $('loginPassword') ? $('loginPassword').value : '';
  if (!email || !password) { toast('Introduce correo y contraseña.', 'error'); return; }
  const btn = $('btnLoginPassword');
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
  try {
    await loginConContrasena(email, password);
    // onAuthStateChange se encarga del resto
  } catch (err) {
    toast('Error: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar con contraseña'; }
  }
}

async function handleLogout() {
  await logout();
  state = { session: null, user: null, profile: null, permisos: [], permisoActual: null, pdfBytes: null };
  mostrarPanel('panelLogin');
  actualizarHeaderAuth();
}

// ── Header auth ───────────────────────────────────────────────

function actualizarHeaderAuth() {
  const authStatus = $('authStatus');
  const btnLogin   = $('btnLogin');
  if (state.profile) {
    if (authStatus) authStatus.textContent = state.profile.nombre_completo;
    if (btnLogin)   btnLogin.textContent   = 'Cerrar sesión';
  } else {
    if (authStatus) authStatus.textContent = 'Sin sesión';
    if (btnLogin)   btnLogin.textContent   = 'Acceder';
  }
}

// ══════════════════════════════════════════════════════════════
// PERFIL (primer acceso)
// ══════════════════════════════════════════════════════════════

async function handleGuardarPerfil() {
  const nombre      = $('perfilNombre').value.trim();
  const empleo      = $('perfilEmpleo').value.trim();
  const dni         = $('perfilDNI').value.trim();
  const dependencia = $('perfilDependencia').value.trim();

  if (!nombre || !empleo || !dni) {
    toast('Nombre, empleo y DNI son obligatorios.', 'error'); return;
  }

  const btn = $('btnGuardarPerfil');
  btn.disabled = true; btn.textContent = 'Guardando…';

  try {
    state.profile = await createOrUpdateProfile({
      id:            state.user.id,
      nombre_completo: nombre,
      empleo,
      dni,
      dependencia,
      email:         state.user.email,
      rol:           'empleado',
    });
    actualizarHeaderAuth();
    await cargarDashboard();
    mostrarPanel('panelDashboard');
  } catch (err) {
    toast('Error al guardar perfil: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar y continuar';
  }
}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════

async function cargarDashboard() {
  actualizarHeaderAuth();
  const rol = state.profile ? state.profile.rol : 'empleado';

  // Badge de rol
  const badge = $('userRoleBadge');
  if (badge) {
    const rolTexto = { empleado: 'Empleado', jefe_seccion: 'Jefe de Sección', jefe_grupo: 'Jefe de Grupo' };
    badge.textContent = rolTexto[rol] || rol;
  }

  // Mostrar botón nueva solicitud solo para empleados
  const btnNuevo = $('btnNuevoPermiso');
  if (btnNuevo) btnNuevo.style.display = rol === 'empleado' ? '' : 'none';

  try {
    if (rol === 'empleado') {
      state.permisos = await getMisPermisos(state.user.id);
    } else if (rol === 'jefe_seccion') {
      state.permisos = await getPermisosParaJefeSeccion(state.user.id);
    } else if (rol === 'jefe_grupo') {
      state.permisos = await getPermisosParaJefeGrupo();
    }
    renderTabla();
  } catch (err) {
    toast('Error al cargar solicitudes: ' + err.message, 'error');
  }
}

function renderTabla() {
  const tbody = $('tablaSolicitudes');
  if (!tbody) return;

  if (!state.permisos.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No hay solicitudes.</td></tr>';
    return;
  }

  tbody.innerHTML = state.permisos.map(p => {
    const emp = p.empleado || {};
    return `
      <tr>
        <td>${emp.nombre_completo || '—'}</td>
        <td>${formatFecha(p.fecha_inicio)}</td>
        <td>${formatFecha(p.fecha_fin)}</td>
        <td>${TIPO_LABELS[p.tipo] || p.tipo}</td>
        <td><span class="badge badge-${p.estado}">${ESTADO_LABELS[p.estado] || p.estado}</span></td>
        <td>${firmaIcono(p.firmas, 'empleado')}</td>
        <td>${firmaIcono(p.firmas, 'jefe_seccion')}</td>
        <td>${firmaIcono(p.firmas, 'jefe_grupo')}</td>
        <td>
          <button class="btn-sm" onclick="abrirDetalle('${p.id}')">Ver</button>
          ${p.pdf_final_url || p.pdf_url
            ? `<button class="btn-sm btn-sm-outline" onclick="descargarPDFPermiso('${p.id}')">PDF</button>`
            : ''}
        </td>
      </tr>`;
  }).join('');
}

function firmaIcono(firmas, rol) {
  if (!firmas) return '–';
  const f = firmas.find(f => f.rol_firma === rol);
  if (!f)                      return '<span class="firma-dot pendiente" title="Pendiente">○</span>';
  if (f.accion === 'aprobado') return '<span class="firma-dot aprobado"  title="Aprobado">✓</span>';
  return                              '<span class="firma-dot rechazado" title="Rechazado">✗</span>';
}

const TIPO_LABELS = {
  vacaciones:             'Vacaciones',
  asuntos_particulares:   'Asuntos Particulares',
  dias_adicionales:       'Días Adicionales',
  permiso_extraordinario: 'Permiso Extraordinario',
};

const ESTADO_LABELS = {
  borrador:               'Borrador',
  firmada_empleado:       'Pendiente Jefe Sección',
  aprobada_jefe_seccion:  'Pendiente Jefe Grupo',
  rechazada_jefe_seccion: 'Rechazado por Jefe Sección',
  aprobada:               'Aprobado',
  rechazada:              'Rechazado',
};

// ══════════════════════════════════════════════════════════════
// FORMULARIO NUEVO PERMISO
// ══════════════════════════════════════════════════════════════

function resetFormulario() {
  ['tipoPermiso','fechaInicio','fechaFin','diasHabiles',
   'direccion','telefono','motivo','observaciones','emailJefe'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });
  toggleMotivo();
}

function toggleMotivo() {
  const tipo = $('tipoPermiso') ? $('tipoPermiso').value : '';
  const wrap = $('motivoWrap');
  if (wrap) wrap.style.display = tipo === 'permiso_extraordinario' ? '' : 'none';
}

async function handleFirmarYEnviar() {
  // 1. Validar campos
  const tipo       = $('tipoPermiso').value;
  const fechaIni   = $('fechaInicio').value;
  const fechaFin   = $('fechaFin').value;
  const diasHab    = parseInt($('diasHabiles').value) || 1;
  const direccion  = $('direccion').value.trim();
  const telefono   = $('telefono').value.trim();
  const motivo     = $('motivo')   ? $('motivo').value.trim()   : '';
  const observ     = $('observaciones') ? $('observaciones').value.trim() : '';
  const emailJefe  = $('emailJefe').value.trim();

  if (!tipo)       { toast('Selecciona el tipo de permiso.', 'error'); return; }
  if (!fechaIni)   { toast('Indica la fecha de inicio.',    'error'); return; }
  if (!fechaFin)   { toast('Indica la fecha de fin.',       'error'); return; }
  if (!emailJefe)  { toast('Indica el correo del jefe de sección.', 'error'); return; }
  if (tipo === 'permiso_extraordinario' && !motivo) {
    toast('El motivo es obligatorio para permisos extraordinarios.', 'error'); return;
  }

  const btn = $('btnFirmarEnviar');
  btn.disabled = true; btn.textContent = 'Preparando…';

  try {
    // 2. Crear el permiso en la BD (estado borrador)
    const datosPermiso = {
      empleado_id:        state.user.id,
      tipo,
      fecha_inicio:       fechaIni,
      fecha_fin:          fechaFin,
      dias_habiles:       diasHab,
      direccion,
      telefono,
      motivo,
      observaciones:      observ,
      jefe_seccion_email: emailJefe,
    };
    const permiso = await crearPermiso(datosPermiso);
    state.permisoActual = permiso;

    // 3. Generar PDF
    btn.textContent = 'Generando PDF…';
    const pdfPermiso = { ...permiso, empleado: state.profile, firmas: [] };
    state.pdfBytes   = await generarPDFPermiso(pdfPermiso, []);

    // 4. Firmar con AutoFirma
    btn.textContent = 'Abriendo AutoFirma…';
    mostrarModalAutofirma();
    const { pdfFirmado, certInfo } = await firmarConAutofirma(state.pdfBytes, {
      rol:       'empleado',
      permisoId: permiso.id,
    });
    ocultarModalAutofirma();

    // 5. Subir PDF firmado a Storage
    btn.textContent = 'Subiendo PDF…';
    const pdfPath = await subirPDF(state.user.id, permiso.id, pdfFirmado, 'empleado');

    // 6. Actualizar estado en BD
    await actualizarTrasFirmaEmpleado(permiso.id, pdfPath);

    // 7. Registrar firma criptográfica
    await registrarFirma({
      permiso_id:  permiso.id,
      firmante_id: state.user.id,
      rol_firma:   'empleado',
      certInfo,
      accion:      'aprobado',
    });

    // 8. Notificar al jefe de sección por email
    notificarJefe(emailJefe, state.profile.nombre_completo, permiso, 'seccion');

    toast('Solicitud enviada y firmada correctamente.', 'success');
    mostrarPanel('panelDashboard');
    await cargarDashboard();

  } catch (err) {
    ocultarModalAutofirma();
    if (err.code === 'CANCELLED') {
      toast('Firma cancelada. La solicitud se ha guardado como borrador.', 'warning');
    } else {
      toast('Error: ' + err.message, 'error');
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Firmar y enviar';
  }
}

// ══════════════════════════════════════════════════════════════
// DETALLE Y FIRMA DE JEFES
// ══════════════════════════════════════════════════════════════

async function abrirDetalle(permisoId) {
  try {
    const permiso = await getPermisoById(permisoId);
    state.permisoActual = permiso;
    renderDetalle(permiso);
    mostrarPanel('panelDetalle');
  } catch (err) {
    toast('Error al abrir la solicitud: ' + err.message, 'error');
  }
}

function renderDetalle(permiso) {
  const emp    = permiso.empleado    || {};
  const firmas = permiso.firmas      || [];
  const rol    = state.profile ? state.profile.rol : 'empleado';

  // Datos
  const detalle = $('detallePermiso');
  if (detalle) {
    detalle.innerHTML = `
      <div class="detalle-grid">
        <div class="detalle-item"><span class="detalle-label">Interesado</span><span>${emp.nombre_completo || '—'}</span></div>
        <div class="detalle-item"><span class="detalle-label">Empleo</span><span>${emp.empleo || '—'}</span></div>
        <div class="detalle-item"><span class="detalle-label">Dependencia</span><span>${emp.dependencia || '—'}</span></div>
        <div class="detalle-item"><span class="detalle-label">Tipo</span><span>${TIPO_LABELS[permiso.tipo] || permiso.tipo}</span></div>
        <div class="detalle-item"><span class="detalle-label">Inicio</span><span>${formatFecha(permiso.fecha_inicio)}</span></div>
        <div class="detalle-item"><span class="detalle-label">Fin</span><span>${formatFecha(permiso.fecha_fin)}</span></div>
        <div class="detalle-item"><span class="detalle-label">Días hábiles</span><span>${permiso.dias_habiles}</span></div>
        <div class="detalle-item"><span class="detalle-label">Dirección</span><span>${permiso.direccion || '—'}</span></div>
        <div class="detalle-item"><span class="detalle-label">Teléfono</span><span>${permiso.telefono || '—'}</span></div>
        ${permiso.motivo ? `<div class="detalle-item detalle-full"><span class="detalle-label">Motivo</span><span>${permiso.motivo}</span></div>` : ''}
        ${permiso.observaciones ? `<div class="detalle-item detalle-full"><span class="detalle-label">Observaciones</span><span>${permiso.observaciones}</span></div>` : ''}
        <div class="detalle-item detalle-full"><span class="detalle-label">Estado</span>
          <span class="badge badge-${permiso.estado}">${ESTADO_LABELS[permiso.estado] || permiso.estado}</span>
        </div>
        ${permiso.motivo_rechazo ? `<div class="detalle-item detalle-full"><span class="detalle-label">Motivo rechazo</span><span class="texto-rojo">${permiso.motivo_rechazo}</span></div>` : ''}
      </div>
    `;
  }

  // Estado de firmas
  const firmasEl = $('firmasEstado');
  if (firmasEl) {
    const roles = ['empleado','jefe_seccion','jefe_grupo'];
    const rolNombres = { empleado: 'Interesado', jefe_seccion: 'Jefe de Sección', jefe_grupo: 'Jefe de Grupo' };
    firmasEl.innerHTML = roles.map(r => {
      const f = firmas.find(f => f.rol_firma === r);
      const firmante = f && f.firmante ? f.firmante : null;
      if (!f) return `
        <div class="firma-row pendiente">
          <span class="firma-dot-lg">○</span>
          <div><strong>${rolNombres[r]}</strong><br><small>Pendiente de firma</small></div>
        </div>`;
      return `
        <div class="firma-row ${f.accion}">
          <span class="firma-dot-lg">${f.accion === 'aprobado' ? '✓' : '✗'}</span>
          <div>
            <strong>${rolNombres[r]}</strong>${firmante ? ' · ' + firmante.nombre_completo : ''}
            <br><small>${formatFechaHora(f.firmado_en)}</small>
            ${f.accion === 'rechazado' && f.motivo_rechazo ? `<br><small class="texto-rojo">${f.motivo_rechazo}</small>` : ''}
          </div>
        </div>`;
    }).join('');
  }

  // Mostrar/ocultar sección descarga empleado
  const seccionDesc = $('seccionDescargaEmpleado');

  // Mostrar/ocultar botones de acción según rol y estado
  const seccionFirma = $('seccionFirmaJefe');
  const btnDescargar = $('btnDescargarPDF');

  // Botón descargar: si hay PDF disponible
  if (btnDescargar) {
    btnDescargar.style.display = (permiso.pdf_url || permiso.pdf_final_url) ? '' : 'none';
  }

  // Sección firma: solo para jefes, y solo si el estado corresponde
  if (seccionFirma) {
    const puedeAprobar =
      (rol === 'jefe_seccion' && permiso.estado === 'firmada_empleado') ||
      (rol === 'jefe_grupo'   && permiso.estado === 'aprobada_jefe_seccion');

    seccionFirma.style.display = puedeAprobar ? '' : 'none';

    const rolFirma = rol === 'jefe_grupo' ? 'jefe_grupo' : 'jefe_seccion';
    const btnAprobar = $('btnAprobar');
    if (btnAprobar) btnAprobar.dataset.rolFirma = rolFirma;
  }
}

async function handleAprobar() {
  const permiso  = state.permisoActual;
  if (!permiso)  { toast('No hay solicitud activa.', 'error'); return; }

  const rolFirma = $('btnAprobar').dataset.rolFirma || 'jefe_seccion';
  const btn      = $('btnAprobar');
  btn.disabled   = true; btn.textContent = 'Abriendo AutoFirma…';

  try {
    // Descargar el PDF actual de Storage
    const rutaPDF  = permiso.pdf_url;
    const pdfBytes = await descargarPDF(rutaPDF);

    // Cofirmar
    mostrarModalAutofirma();
    const { pdfFirmado, certInfo } = await cofirmarConAutofirma(pdfBytes, {
      rol:       rolFirma,
      permisoId: permiso.id,
    });
    ocultarModalAutofirma();

    // Subir PDF cofirmado
    const sufijo  = rolFirma === 'jefe_grupo' ? 'final' : 'jefe_sec';
    const pdfPath = await subirPDF(state.user.id, permiso.id, pdfFirmado, sufijo);

    // Actualizar estado
    if (rolFirma === 'jefe_seccion') {
      await aprobarJefeSeccion(permiso.id, pdfPath);
      // Notificar al jefe de grupo
      const jefeGrupo = await getJefeGrupo();
      if (jefeGrupo) notificarJefe(jefeGrupo.email, state.profile.nombre_completo, permiso, 'grupo');
    } else {
      await aprobarJefeGrupo(permiso.id, pdfPath);
      // Notificar al empleado que ha sido aprobado
      notificarAprobado(permiso);
    }

    // Registrar firma
    await registrarFirma({
      permiso_id:  permiso.id,
      firmante_id: state.user.id,
      rol_firma:   rolFirma,
      certInfo,
      accion:      'aprobado',
    });

    toast('Solicitud aprobada y firmada.', 'success');
    mostrarPanel('panelDashboard');
    await cargarDashboard();

  } catch (err) {
    ocultarModalAutofirma();
    if (err.code === 'CANCELLED') {
      toast('Firma cancelada.', 'warning');
    } else {
      toast('Error al firmar: ' + err.message, 'error');
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Aprobar y firmar';
  }
}

function toggleRechazar() {
  const wrap = $('rechazarWrap');
  if (wrap) wrap.style.display = wrap.style.display === 'none' ? '' : 'none';
}

async function handleConfirmarRechazo() {
  const permiso = state.permisoActual;
  if (!permiso) return;

  const motivo = $('motivoRechazo').value.trim();
  if (!motivo) { toast('Escribe el motivo del rechazo.', 'error'); return; }

  const rolFirma = $('btnAprobar').dataset.rolFirma || 'jefe_seccion';
  const btn      = $('btnConfirmarRechazo');
  btn.disabled   = true; btn.textContent = 'Procesando…';

  try {
    if (rolFirma === 'jefe_seccion') {
      await rechazarJefeSeccion(permiso.id, motivo);
    } else {
      await rechazarJefeGrupo(permiso.id, motivo);
    }

    // Registrar firma de rechazo (sin PDF, sin AutoFirma)
    await registrarFirma({
      permiso_id:     permiso.id,
      firmante_id:    state.user.id,
      rol_firma:      rolFirma,
      certInfo:       { raw: '', nombre: state.profile.nombre_completo, dni: state.profile.dni, hash: '' },
      accion:         'rechazado',
      motivo_rechazo: motivo,
    });

    // Notificar al empleado del rechazo
    notificarRechazo(permiso, motivo, rolFirma);

    toast('Solicitud rechazada.', 'success');
    mostrarPanel('panelDashboard');
    await cargarDashboard();

  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar rechazo';
  }
}

// ══════════════════════════════════════════════════════════════
// DESCARGA DE PDF
// ══════════════════════════════════════════════════════════════

async function handleDescargarPDF() {
  const permiso = state.permisoActual;
  if (!permiso) return;
  const ruta = permiso.pdf_final_url || permiso.pdf_url;
  if (!ruta) { toast('No hay PDF disponible aún.', 'error'); return; }
  try {
    const url = await getUrlPDF(ruta);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    toast('Error al obtener el PDF: ' + err.message, 'error');
  }
}

async function descargarPDFPermiso(permisoId) {
  try {
    const permiso = await getPermisoById(permisoId);
    const ruta    = permiso.pdf_final_url || permiso.pdf_url;
    if (!ruta) { toast('No hay PDF disponible.', 'error'); return; }
    const url = await getUrlPDF(ruta);
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// NOTIFICACIONES (mailto)
// ══════════════════════════════════════════════════════════════

function notificarJefe(emailJefe, nombreEmpleado, permiso, etapa) {
  if (!emailJefe) return;
  const esPrimero = etapa === 'seccion';
  const asunto = encodeURIComponent(
    `[VacaFirma] Solicitud de ${nombreEmpleado} pendiente de tu firma`
  );
  const cuerpo = encodeURIComponent(
    `Hola,\n\n${nombreEmpleado} ha enviado una solicitud de permiso que necesita tu aprobación.\n\n` +
    `Tipo: ${TIPO_LABELS[permiso.tipo] || permiso.tipo}\n` +
    `Período: ${formatFecha(permiso.fecha_inicio)} → ${formatFecha(permiso.fecha_fin)}\n\n` +
    `Accede a VacaFirma para revisarla y firmarla:\n${window.location.origin}\n\n` +
    `Referencia: ${permiso.id}\n`
  );
  window.open(`mailto:${emailJefe}?subject=${asunto}&body=${cuerpo}`, '_blank');
}

function notificarAprobado(permiso) {
  // Notificar al empleado que su solicitud ha sido aprobada completamente
  const emp = permiso.empleado || {};
  if (!emp.email) return;
  const asunto = encodeURIComponent('[VacaFirma] Tu solicitud ha sido aprobada');
  const cuerpo = encodeURIComponent(
    `Tu solicitud de permiso ha sido aprobada por todos los firmantes.\n\n` +
    `Período: ${formatFecha(permiso.fecha_inicio)} → ${formatFecha(permiso.fecha_fin)}\n\n` +
    `Puedes descargar el documento firmado en:\n${window.location.origin}\n`
  );
  window.open(`mailto:${emp.email}?subject=${asunto}&body=${cuerpo}`, '_blank');
}

function notificarRechazo(permiso, motivo, rolFirma) {
  const emp = permiso.empleado || {};
  if (!emp.email) return;
  const quienRechaza = rolFirma === 'jefe_grupo' ? 'el Jefe de Grupo' : 'el Jefe de Sección';
  const asunto = encodeURIComponent('[VacaFirma] Tu solicitud ha sido rechazada');
  const cuerpo = encodeURIComponent(
    `Tu solicitud de permiso ha sido rechazada por ${quienRechaza}.\n\n` +
    `Período: ${formatFecha(permiso.fecha_inicio)} → ${formatFecha(permiso.fecha_fin)}\n` +
    `Motivo: ${motivo}\n\n` +
    `Puedes acceder a VacaFirma para más detalles:\n${window.location.origin}\n`
  );
  window.open(`mailto:${emp.email}?subject=${asunto}&body=${cuerpo}`, '_blank');
}

// ══════════════════════════════════════════════════════════════
// MODAL AUTOFIRMA
// ══════════════════════════════════════════════════════════════

function mostrarModalAutofirma() {
  const modal = $('modalAutofirma');
  if (modal) modal.classList.remove('hidden');
}

function ocultarModalAutofirma() {
  const modal = $('modalAutofirma');
  if (modal) modal.classList.add('hidden');
}

// ══════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════

function toast(msg, tipo = 'info') {
  const container = $('toastContainer');
  if (!container) { console.log('[Toast]', msg); return; }
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

// ══════════════════════════════════════════════════════════════
// HELPERS DE FECHA
// ══════════════════════════════════════════════════════════════

function formatFecha(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr + (isoStr.includes('T') ? '' : 'T00:00:00'));
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(isoStr) {
  if (!isoStr) return '—';
  return new Date(isoStr).toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
