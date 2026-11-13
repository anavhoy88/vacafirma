// ═══════════════════════════════════════════════════════════════
// app.js — VacaFirma 2.0 — Controlador principal
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// EMPLEOS CON 2 FIRMAS (empleado + jefe_seccion, sin jefe_grupo)
// Resto de empleos requieren 3 firmas (+ jefe_grupo)
// ══════════════════════════════════════════════════════════════
const EMPLEOS_DOS_FIRMAS = new Set([
  'comandante',
  'Comandante',
  'COMANDANTE',
]);

/** Devuelve true si el permiso solo necesita firma de jefe_seccion (2 firmas total) */
function esDosFiremas(permiso) {
  const empleo = (permiso.empleado?.empleo || permiso.empleo_peticionario || '').trim().toLowerCase();
  return empleo === 'comandante';
}

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
      if (!state.profile || !state.profile.empleo || !state.profile.dni) {
        mostrarPanel('panelPerfil');
      } else {
        await cargarDashboard();
        mostrarPanel('panelDashboard');
        // Mostrar modal de contraseña solo si el usuario NO tiene proveedor 'password'
        // usuarioSinContrasena() usa Firebase Auth providerData — es la fuente correcta
        if (usuarioSinContrasena() && $('modalContrasena')) {
          $('modalContrasena').classList.remove('hidden');
        }
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
  $('btnNuevoPermiso')   && $('btnNuevoPermiso').addEventListener('click', async () => {
    resetFormulario();
    // Si el peticionario es jefe_seccion, precargar el jefe_grupo como único firmante
    // (el Tcol firmará directamente su solicitud)
    if (state.profile?.rol === 'jefe_seccion') {
      const jefeGrupo = await getJefeGrupo();
      if (jefeGrupo) {
        const lista = $('listaFirmantes');
        if (lista) {
          lista.innerHTML = '';
          anadirFirmante(jefeGrupo.email);
        }
      }
    }
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

  // Formulario cadena de firmantes
  $('btnAnadirFirmante') && $('btnAnadirFirmante').addEventListener('click', () => anadirFirmante());

  // Modal contraseña
  $('btnGuardarContrasena')    && $('btnGuardarContrasena').addEventListener('click', handleGuardarContrasena);
  $('btnCerrarModalContrasena') && $('btnCerrarModalContrasena').addEventListener('click', () => {
    $('modalContrasena').classList.add('hidden');
  });
}

// ══════════════════════════════════════════════════════════════
// CONTRASEÑA — Añadir contraseña a cuenta magic link
// ══════════════════════════════════════════════════════════════

async function handleGuardarContrasena() {
  const pwd1 = $('nuevaContrasena') ? $('nuevaContrasena').value : '';
  const pwd2 = $('nuevaContrasenaConfirm') ? $('nuevaContrasenaConfirm').value : '';
  if (!pwd1 || pwd1.length < 6) {
    toast('La contraseña debe tener al menos 6 caracteres.', 'error');
    return;
  }
  if (pwd1 !== pwd2) {
    toast('Las contraseñas no coinciden.', 'error');
    return;
  }
  const btn = $('btnGuardarContrasena');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
  try {
    await establecerContrasena(pwd1);
    $('modalContrasena').classList.add('hidden');
    toast('✓ Contraseña establecida. Ya puedes acceder con email y contraseña.', 'success');
  } catch (err) {
    toast('Error al guardar la contraseña: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar contraseña'; }
  }
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
  actualizarHeaderAuth();
  // Restaurar botones del panel de login por si quedaron deshabilitados
  const btnLP = $('btnLoginPassword');
  if (btnLP) { btnLP.disabled = false; btnLP.textContent = 'Entrar con contraseña'; }
  const btnML = $('btnSendMagicLink');
  if (btnML) { btnML.disabled = false; btnML.textContent = 'Enviar enlace mágico'; }
  mostrarPanel('panelLogin');
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

// Tab activo para jefe_seccion: 'mis' | 'pendientes'
state.tabActivo = 'mis';

async function cargarDashboard() {
  actualizarHeaderAuth();
  const rol = state.profile ? state.profile.rol : 'empleado';
  console.log('[Dashboard] rol detectado:', rol, '| perfil:', state.profile);

  // Badge de rol
  const badge = $('userRoleBadge');
  if (badge) {
    const rolTexto = { empleado: 'Empleado', jefe_seccion: 'Jefe Intermedio', jefe_grupo: 'Jefe de FFAA' };
    badge.textContent = rolTexto[rol] || rol;
  }

  // Botón nueva solicitud: visible para empleados, jefe_seccion y jefe_grupo
  // (todos pueden crear solicitudes propias)
  const btnNuevo = $('btnNuevoPermiso');
  if (btnNuevo) btnNuevo.style.display = '';

  // Pestañas: visible para jefe_seccion y jefe_grupo (tienen solicitudes propias + pendientes)
  const tabs = $('dashTabs');
  if (tabs) tabs.classList.toggle('hidden', rol === 'empleado');

  try {
    if (rol === 'empleado') {
      state.permisos        = await getMisPermisos(state.user.id);
      state.permisosPropios = null;
      state.permisosPendientes = null;
    } else if (rol === 'jefe_seccion' || rol === 'jefe_grupo') {
      // Ambos roles pueden tener solicitudes propias Y pendientes de firma
      // Usar getPermisosParaFirmante (cadena dinámica) para las pendientes
      const [propios, pendientes] = await Promise.all([
        getMisPermisos(state.user.id),
        getPermisosParaFirmante(state.user.id),
      ]);
      state.permisosPropios    = propios;
      state.permisosPendientes = pendientes;
      // Actualizar badge de pendientes
      const badgeCount = $('tabBadgeCount');
      if (badgeCount) badgeCount.textContent = pendientes.length > 0 ? pendientes.length : '';
      // Mostrar tab activo
      state.permisos = state.tabActivo === 'pendientes' ? pendientes : propios;
    }
    renderTabla();
  } catch (err) {
    toast('Error al cargar solicitudes: ' + err.message, 'error');
  }
}

function cambiarTab(tab) {
  state.tabActivo = tab;
  state.permisos  = (tab === 'pendientes' ? state.permisosPendientes : state.permisosPropios) || [];
  // Estilos de pestañas
  $('tabMisSolicitudes') .classList.toggle('active', tab === 'mis');
  $('tabPendientesFirma').classList.toggle('active', tab === 'pendientes');
  // Título del panel
  const titulo = $('dashboardTitulo');
  if (titulo) titulo.textContent = tab === 'pendientes' ? 'Pendientes de mi firma' : 'Mis solicitudes';
  // Botón nueva solicitud: solo visible en "mis solicitudes"
  const btnNuevo = $('btnNuevoPermiso');
  if (btnNuevo) btnNuevo.style.display = tab === 'pendientes' ? 'none' : '';
  renderTabla();
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
    // Indicador compacto de firmas: empleado + cada firmante de la cadena
    const firmasIconos = renderFirmasCompacto(p);
    return `
      <tr>
        <td>${emp.nombre_completo || '—'}</td>
        <td>${formatFecha(p.fecha_inicio)}</td>
        <td>${formatFecha(p.fecha_fin)}</td>
        <td>${TIPO_LABELS[p.tipo] || p.tipo}</td>
        <td><span class="badge badge-${p.estado}">${ESTADO_LABELS[p.estado] || p.estado}</span></td>
        <td style="white-space:nowrap;">${firmasIconos}</td>
        <td>
          <button class="btn-sm" onclick="abrirDetalle('${p.id}')">Ver</button>
          ${p.pdf_final_url || p.pdf_url
            ? `<button class="btn-sm btn-sm-outline" onclick="descargarPDFPermiso('${p.id}')">PDF</button>`
            : ''}
          ${p.estado === 'borrador'
            ? `<button class="btn-sm btn-sm-danger" onclick="handleEliminarPermiso('${p.id}')">✕</button>`
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

/**
 * Renderiza iconos de firma compactos para la tabla del dashboard.
 * Para permisos con cadena dinámica: empleado + cada eslabón de la cadena.
 * Para permisos legacy: empleado + jefe_seccion [+ jefe_grupo].
 */
function renderFirmasCompacto(permiso) {
  const firmas = permiso.firmas || [];

  // Firma del empleado (siempre primera)
  const firmaEmp = firmas.find(f => f.rol_firma === 'empleado');
  let html = firmaEmp
    ? `<span class="firma-dot aprobado" title="Empleado: firmado">✓</span>`
    : `<span class="firma-dot pendiente" title="Empleado: pendiente">○</span>`;

  if (permiso.cadena_emails && permiso.cadena_emails.length > 0) {
    // Cadena dinámica: un círculo por cada firmante
    const idx = permiso.firma_actual_idx ?? 0;
    permiso.cadena_emails.forEach((email, i) => {
      // Buscar si hay firma registrada con índice_cadena === i
      const f = firmas.find(f => f.indice_cadena === i || (f.rol_firma !== 'empleado' && i < idx));
      const nombre = email.split('@')[0];
      if (i < idx) {
        html += ` → <span class="firma-dot aprobado" title="${nombre}: firmado">✓</span>`;
      } else if (i === idx && ['firmada_empleado', 'en_cadena'].includes(permiso.estado)) {
        html += ` → <span class="firma-dot pendiente blink" title="${nombre}: pendiente">◉</span>`;
      } else {
        html += ` → <span class="firma-dot pendiente" title="${nombre}: en espera">○</span>`;
      }
    });
  } else {
    // Legacy: jefe_seccion y opcionalmente jefe_grupo
    const fJefeSec = firmas.find(f => f.rol_firma === 'jefe_seccion');
    const fJefeGrp = firmas.find(f => f.rol_firma === 'jefe_grupo');
    if (fJefeSec) {
      html += fJefeSec.accion === 'aprobado'
        ? ` → <span class="firma-dot aprobado" title="Jefe Sección: aprobado">✓</span>`
        : ` → <span class="firma-dot rechazado" title="Jefe Sección: rechazado">✗</span>`;
    } else {
      html += ` → <span class="firma-dot pendiente" title="Jefe Sección: pendiente">○</span>`;
    }
    if (permiso.num_firmas !== 2) {
      if (fJefeGrp) {
        html += fJefeGrp.accion === 'aprobado'
          ? ` → <span class="firma-dot aprobado" title="Jefe Grupo: aprobado">✓</span>`
          : ` → <span class="firma-dot rechazado" title="Jefe Grupo: rechazado">✗</span>`;
      } else {
        html += ` → <span class="firma-dot pendiente" title="Jefe Grupo: pendiente">○</span>`;
      }
    }
  }

  return html;
}

const TIPO_LABELS = {
  vacaciones:             'Vacaciones',
  asuntos_particulares:   'Asuntos Particulares',
  dias_adicionales:       'Días Adicionales',
  permiso_extraordinario: 'Permiso Extraordinario',
};

const ESTADO_LABELS = {
  borrador:               'Borrador',
  firmada_empleado:       'En cadena de firmas',
  en_cadena:              'En cadena de firmas',
  aprobada_jefe_seccion:  'Pendiente Jefe Grupo',    // legacy
  rechazada_jefe_seccion: 'Rechazado',               // legacy
  aprobada:               'Aprobado',
  rechazada:              'Rechazado',
};

// ══════════════════════════════════════════════════════════════
// FORMULARIO NUEVO PERMISO
// ══════════════════════════════════════════════════════════════

function resetFormulario() {
  ['tipoPermiso','fechaInicio','fechaFin','diasHabiles',
   'direccion','telefono','motivo','observaciones'].forEach(id => {
    const el = $(id);
    if (el) el.value = '';
  });
  // Limpiar cadena de firmantes y añadir un campo vacío por defecto
  const lista = $('listaFirmantes');
  if (lista) {
    lista.innerHTML = '';
    anadirFirmante();  // arranca con un campo vacío
  }
  toggleMotivo();
}

/** Añade una fila de firmante al formulario, opcionalmente con email prefijado */
function anadirFirmante(email = '') {
  const lista = $('listaFirmantes');
  if (!lista) return;
  const idx = lista.children.length + 1;
  const row = document.createElement('div');
  row.className = 'firmante-row';
  row.style.cssText = 'display:flex;align-items:center;gap:0.5rem;';
  row.innerHTML = `
    <span style="color:var(--muted,#888);font-size:0.82rem;min-width:1.6rem;text-align:right;">${idx}.</span>
    <input type="email" class="firmante-email"
      placeholder="correo@organismo.es"
      value="${email}"
      style="flex:1;padding:0.5rem 0.75rem;border:1px solid var(--border,#ddd);border-radius:6px;font-size:0.9rem;" />
    <button type="button" class="btn-outline btn-rm-firmante"
      title="Eliminar firmante"
      style="padding:0.3rem 0.6rem;font-size:0.85rem;line-height:1;color:var(--red,#c0392b);border-color:var(--red,#c0392b);"
      onclick="this.closest('.firmante-row').remove(); renumerarFirmantes();">✕</button>
  `;
  lista.appendChild(row);
}

/** Renumera los índices de los firmantes tras eliminar uno */
function renumerarFirmantes() {
  const lista = $('listaFirmantes');
  if (!lista) return;
  [...lista.querySelectorAll('.firmante-row')].forEach((row, i) => {
    const span = row.querySelector('span');
    if (span) span.textContent = `${i + 1}.`;
  });
}

/** Devuelve el array de emails de la cadena, en orden */
function getCadenaEmails() {
  const lista = $('listaFirmantes');
  if (!lista) return [];
  return [...lista.querySelectorAll('.firmante-email')]
    .map(el => el.value.trim())
    .filter(Boolean);
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
  const rolPeticionario = state.profile?.rol || 'empleado';

  // Cadena dinámica de firmantes
  const cadenaEmails = getCadenaEmails();

  if (!tipo)                    { toast('Selecciona el tipo de permiso.', 'error'); return; }
  if (!fechaIni)                { toast('Indica la fecha de inicio.',    'error'); return; }
  if (!fechaFin)                { toast('Indica la fecha de fin.',       'error'); return; }
  if (cadenaEmails.length === 0){ toast('Añade al menos un firmante.',    'error'); return; }
  if (tipo === 'permiso_extraordinario' && !motivo) {
    toast('El motivo es obligatorio para permisos extraordinarios.', 'error'); return;
  }

  const btn = $('btnFirmarEnviar');
  btn.disabled = true; btn.textContent = 'Preparando…';

  try {
    // 2. Crear el permiso en la BD (estado borrador) con cadena dinámica
    const datosPermiso = {
      empleado_id:          state.user.id,
      empleo_peticionario:  state.profile?.empleo || '',
      tipo,
      fecha_inicio:         fechaIni,
      fecha_fin:            fechaFin,
      dias_habiles:         diasHab,
      direccion,
      telefono,
      motivo,
      observaciones:        observ,
      rol_peticionario:     rolPeticionario,
      cadena_emails:        cadenaEmails,   // ← nueva cadena dinámica
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

    // 5. Registrar firma criptográfica en Firestore
    btn.textContent = 'Registrando firma…';
    const firmaDoc = await registrarFirma({
      permiso_id:  permiso.id,
      firmante_id: state.user.id,
      rol_firma:   'empleado',
      certInfo,
      accion:      'aprobado',
    });

    // 6. Regenerar PDF con la firma visible
    btn.textContent = 'Generando PDF firmado…';
    const permisoConFirma = {
      ...pdfPermiso,
      estado: 'firmada_empleado',
      firmas: [{ ...firmaDoc, firmante: state.profile }],
    };
    const pdfConFirma = await generarPDFPermiso(permisoConFirma, permisoConFirma.firmas);

    // 7. Subir PDF a Firestore
    btn.textContent = 'Subiendo PDF…';
    const pdfPath = await subirPDF(state.user.id, permiso.id, pdfConFirma, 'empleado');

    // 8. Avanzar la cadena — firma_actual_idx pasa a 0 (primer firmante ya listo para recibir)
    //    La firma del empleado no consume idx; los jefes empiezan desde idx=0.
    await actualizarTrasFirmaEmpleado(permiso.id, pdfPath);

    // 9. Notificar al primero de la cadena
    if (cadenaEmails[0]) {
      notificarFirmante(cadenaEmails[0], state.profile.nombre_completo, permiso, 1, cadenaEmails.length);
    }

    toast('Solicitud enviada y firmada correctamente.', 'success');
    mostrarPanel('panelDashboard');
    await cargarDashboard();

  } catch (err) {
    ocultarModalAutofirma();
    if (err.code === 'CANCELLED') {
      toast('Firma cancelada. La solicitud se ha guardado como borrador.', 'warning');
    } else if (err.code === 'CONNECTION_ERROR') {
      toast('⚠️ AutoFirma no responde. Abre AutoFirma manualmente y vuelve a pulsar "Firmar y enviar".', 'error', 8000);
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

  // ── Estado de firmas ──────────────────────────────────────────
  const firmasEl = $('firmasEstado');
  if (firmasEl) {
    const cadena = permiso.cadena_emails || [];
    const idxActual = permiso.firma_actual_idx ?? 0;

    if (cadena.length > 0) {
      // ── Cadena dinámica ───────────────────────────────────────
      let rows = '';

      // Fila 1: firma del empleado (interesado)
      const fEmp = firmas.find(f => f.rol_firma === 'empleado');
      const empNombre = (permiso.empleado || {}).nombre_completo || '—';
      rows += fEmp
        ? `<div class="firma-row aprobado">
             <span class="firma-dot-lg">✓</span>
             <div><strong>Interesado</strong> · ${empNombre}<br>
               <small>${formatFechaHora(fEmp.firmado_en)}</small></div>
           </div>`
        : `<div class="firma-row pendiente">
             <span class="firma-dot-lg">○</span>
             <div><strong>Interesado</strong> · ${empNombre}<br>
               <small>Pendiente de firma</small></div>
           </div>`;

      // Filas: cada firmante de la cadena
      cadena.forEach((email, i) => {
        // Buscar si ya firmó: o por índice_cadena o por orden temporal (i < idxActual)
        const yaFirmo = i < idxActual || permiso.estado === 'aprobada';
        const esTurnoActual = i === idxActual && ['firmada_empleado','en_cadena'].includes(permiso.estado);
        const nombre = email.split('@')[0];
        const esFinal = i === cadena.length - 1;
        const etiqueta = esFinal ? 'Firma final' : `Firmante ${i + 1}`;

        // Buscar firma registrada (si existe)
        const fCadena = firmas.find(f => f.indice_cadena === i);

        if (yaFirmo && fCadena) {
          rows += `<div class="firma-row ${fCadena.accion}">
            <span class="firma-dot-lg">${fCadena.accion === 'aprobado' ? '✓' : '✗'}</span>
            <div><strong>${etiqueta}</strong> · ${fCadena.firmante?.nombre_completo || nombre}
              <br><small>${formatFechaHora(fCadena.firmado_en)}</small>
              ${fCadena.accion === 'rechazado' && fCadena.motivo_rechazo
                ? `<br><small class="texto-rojo">${fCadena.motivo_rechazo}</small>` : ''}
            </div>
          </div>`;
        } else if (yaFirmo) {
          // Firmó pero sin registro de índice (compatibilidad)
          rows += `<div class="firma-row aprobado">
            <span class="firma-dot-lg">✓</span>
            <div><strong>${etiqueta}</strong> · ${nombre}<br><small>Aprobado</small></div>
          </div>`;
        } else if (esTurnoActual) {
          rows += `<div class="firma-row pendiente" style="border-left:3px solid var(--jade,#2ecc71);">
            <span class="firma-dot-lg" style="color:var(--jade,#2ecc71);">◉</span>
            <div><strong>${etiqueta}</strong> · ${email}<br><small style="color:var(--jade,#2ecc71);">⟵ Pendiente (turno actual)</small></div>
          </div>`;
        } else {
          rows += `<div class="firma-row pendiente" style="opacity:0.6;">
            <span class="firma-dot-lg">○</span>
            <div><strong>${etiqueta}</strong> · ${email}<br><small>En espera</small></div>
          </div>`;
        }
      });

      firmasEl.innerHTML = rows;

    } else {
      // ── Legacy (permisos sin cadena dinámica) ─────────────────
      const roles = permiso.num_firmas === 2
        ? ['empleado', 'jefe_seccion']
        : ['empleado', 'jefe_seccion', 'jefe_grupo'];
      const rolNombres = { empleado: 'Interesado', jefe_seccion: 'Jefe de Sección', jefe_grupo: 'Jefe de Grupo' };
      firmasEl.innerHTML = roles.map(r => {
        const f = firmas.find(f => f.rol_firma === r);
        const firmante = f && f.firmante ? f.firmante : null;
        if (!f) return `<div class="firma-row pendiente">
          <span class="firma-dot-lg">○</span>
          <div><strong>${rolNombres[r]}</strong><br><small>Pendiente de firma</small></div>
        </div>`;
        return `<div class="firma-row ${f.accion}">
          <span class="firma-dot-lg">${f.accion === 'aprobado' ? '✓' : '✗'}</span>
          <div><strong>${rolNombres[r]}</strong>${firmante ? ' · ' + firmante.nombre_completo : ''}
            <br><small>${formatFechaHora(f.firmado_en)}</small>
            ${f.accion === 'rechazado' && f.motivo_rechazo ? `<br><small class="texto-rojo">${f.motivo_rechazo}</small>` : ''}
          </div>
        </div>`;
      }).join('');
    }
  }

  // ── Botón descargar ───────────────────────────────────────────
  const btnDescargar = $('btnDescargarPDF');
  if (btnDescargar) {
    btnDescargar.style.display = (permiso.pdf_url || permiso.pdf_final_url) ? '' : 'none';
  }

  // ── Sección de acción de firma ────────────────────────────────
  const seccionFirma = $('seccionFirmaJefe');
  if (seccionFirma) {
    const cadena = permiso.cadena_emails || [];
    const idxActual = permiso.firma_actual_idx ?? 0;
    const userId = state.user?.id;

    // ¿Es mi turno en la cadena dinámica?
    const esMiTurnoEnCadena =
      cadena.length > 0 &&
      (permiso.cadena_ids || [])[idxActual] === userId &&
      ['firmada_empleado', 'en_cadena'].includes(permiso.estado);

    // Legacy: compatibilidad con permisos sin cadena
    const esJefeDesignadoEnPermiso = permiso.jefe_seccion_id === userId;
    const puedeAprobarComoSeccionLegacy = rol === 'jefe_seccion' && permiso.estado === 'firmada_empleado' && cadena.length === 0;
    const puedeAprobarComoGrupoLegacy  = rol === 'jefe_grupo'   && permiso.estado === 'aprobada_jefe_seccion' && cadena.length === 0;
    const puedeAprobarComoFinalLegacy  = rol === 'jefe_seccion' && permiso.estado === 'aprobada_jefe_seccion' && esJefeDesignadoEnPermiso && cadena.length === 0;

    const puedeAprobar = esMiTurnoEnCadena || puedeAprobarComoSeccionLegacy || puedeAprobarComoGrupoLegacy || puedeAprobarComoFinalLegacy;
    seccionFirma.style.display = puedeAprobar ? '' : 'none';

    const btnAprobar = $('btnAprobar');
    if (btnAprobar) {
      // Determinar si es la firma final
      let esFinal = false;
      let rolFirma = 'jefe_seccion';

      if (esMiTurnoEnCadena) {
        esFinal  = idxActual === cadena.length - 1;
        rolFirma = esFinal ? 'jefe_grupo' : 'jefe_seccion'; // nombre lógico para PDF
        // Guardar índice para usarlo en handleAprobar
        btnAprobar.dataset.indice_cadena = idxActual;
        btnAprobar.dataset.esCadena      = 'true';
      } else {
        // Legacy
        esFinal  = puedeAprobarComoGrupoLegacy || puedeAprobarComoFinalLegacy || (rol === 'jefe_seccion' && permiso.num_firmas === 2);
        rolFirma = (puedeAprobarComoGrupoLegacy || puedeAprobarComoFinalLegacy) ? 'jefe_grupo' : 'jefe_seccion';
        btnAprobar.dataset.esCadena = 'false';
      }

      btnAprobar.dataset.rolFirma = rolFirma;
      btnAprobar.dataset.esFinal  = esFinal ? 'true' : 'false';
      btnAprobar.innerHTML = esFinal
        ? '<span class="sign-icon">✓</span> Aprobar y firmar (firma final)'
        : '<span class="sign-icon">✓</span> Aprobar y firmar con AutoFirma';
    }
  }
}

async function handleAprobar() {
  const permiso  = state.permisoActual;
  if (!permiso)  { toast('No hay solicitud activa.', 'error'); return; }

  const btn         = $('btnAprobar');
  const rolFirma    = btn.dataset.rolFirma    || 'jefe_seccion';
  const esFinal     = btn.dataset.esFinal     === 'true';
  const esCadena    = btn.dataset.esCadena    === 'true';
  const indiceCadena = esCadena ? parseInt(btn.dataset.indice_cadena || '0') : null;

  btn.disabled = true; btn.textContent = 'Abriendo AutoFirma…';

  try {
    // Descargar PDF actual
    const rutaPDF  = permiso.pdf_url;
    const pdfBytes = await descargarPDF(rutaPDF);

    // Cofirmar con AutoFirma
    mostrarModalAutofirma();
    const { pdfFirmado, certInfo } = await cofirmarConAutofirma(pdfBytes, {
      rol:       rolFirma,
      permisoId: permiso.id,
    });
    ocultarModalAutofirma();

    // Registrar firma en Firestore
    btn.textContent = 'Registrando firma…';
    const firmaDoc = await registrarFirma({
      permiso_id:    permiso.id,
      firmante_id:   state.user.id,
      rol_firma:     rolFirma,
      certInfo,
      accion:        'aprobado',
      indice_cadena: indiceCadena, // null para legacy
    });

    // Regenerar PDF con todas las firmas visibles
    btn.textContent = 'Generando PDF firmado…';
    const todasFirmas = await getFirmasDePermiso(permiso.id);
    const estadoVisualizacion = esFinal ? 'aprobada' : 'en_cadena';
    const permisoActualizado  = {
      ...permiso,
      empleado: permiso.empleado || state.profile,
      estado:   estadoVisualizacion,
      firmas:   todasFirmas,
    };
    const pdfConFirmas = await generarPDFPermiso(permisoActualizado, todasFirmas);

    // Subir PDF
    btn.textContent = 'Subiendo PDF…';
    const sufijo  = esFinal ? 'final' : 'parcial';
    const pdfPath = await subirPDF(state.user.id, permiso.id, pdfConFirmas, sufijo);

    // Avanzar cadena o cerrar legacy
    if (esCadena) {
      // Cadena dinámica: avanzar al siguiente firmante
      const { esFinal: yaFinal, siguienteEmail } = await avanzarCadenaFirma(permiso.id, pdfPath);
      if (yaFinal) {
        notificarAprobado(permiso);
      } else if (siguienteEmail) {
        const cadena = permiso.cadena_emails || [];
        const totalFirmantes = cadena.length;
        notificarFirmante(siguienteEmail, state.profile.nombre_completo, permiso, indiceCadena + 2, totalFirmantes);
      }
    } else {
      // Legacy: lógica antigua
      if (esFinal) {
        await aprobarJefeGrupo(permiso.id, pdfPath);
        notificarAprobado(permiso);
      } else {
        await aprobarJefeSeccion(permiso.id, pdfPath);
        const jefeGrupo = await getJefeGrupo();
        if (jefeGrupo) notificarJefe(jefeGrupo.email, state.profile.nombre_completo, permiso, 'grupo');
      }
    }

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

  const btn2 = $('btnAprobar');
  const esCadena     = btn2 && btn2.dataset.esCadena === 'true';
  const indiceCadena = esCadena ? parseInt(btn2.dataset.indice_cadena || '0') : null;

  try {
    // Registrar firma de rechazo (sin PDF, sin AutoFirma)
    await registrarFirma({
      permiso_id:     permiso.id,
      firmante_id:    state.user.id,
      rol_firma:      rolFirma,
      certInfo:       { raw: '', nombre: state.profile.nombre_completo, dni: state.profile.dni, hash: '' },
      accion:         'rechazado',
      motivo_rechazo: motivo,
      indice_cadena:  indiceCadena,
    });

    // Marcar el permiso como rechazado
    await rechazarJefeGrupo(permiso.id, motivo);  // reutilizamos — pone estado='rechazada'

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
  toast('Generando PDF…', 'info');
  try {
    // Intentar recargar desde Firestore para tener firmas actualizadas
    let permisoCompleto = { ...permiso, empleado: permiso.empleado || state.profile };
    let todasFirmas = permiso.firmas || [];

    try {
      const permisoFull = await getPermisoById(permiso.id);
      todasFirmas = permisoFull.firmas || [];
      permisoCompleto = { ...permisoFull, empleado: permisoFull.empleado || state.profile };
      console.log('[PDF] Firmas cargadas de Firestore:', todasFirmas.length);
    } catch (e) {
      console.warn('[PDF] No se pudo recargar de Firestore, usando datos en memoria:', e.message);
      // Usar lo que ya tenemos en state
    }

    console.log('[PDF] Generando con', todasFirmas.length, 'firmas, cadena:', permisoCompleto.cadena_emails);

    const pdfBytes = await generarPDFPermiso(permisoCompleto, todasFirmas);
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `permiso_${permiso.id || 'solicitud'}.pdf`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  } catch (err) {
    console.error('[PDF] Error:', err);
    toast('Error al generar el PDF: ' + err.message, 'error');
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

async function handleEliminarPermiso(permisoId) {
  if (!confirm('¿Eliminar esta solicitud? Esta acción no se puede deshacer.')) return;
  try {
    await eliminarPermiso(permisoId);
    state.permisos = state.permisos.filter(p => p.id !== permisoId);
    renderTabla();
    toast('Solicitud eliminada.', 'success');
  } catch (err) {
    toast('Error al eliminar: ' + err.message, 'error');
  }
}

// ══════════════════════════════════════════════════════════════
// NOTIFICACIONES (mailto)
// ══════════════════════════════════════════════════════════════

/**
 * Notifica al siguiente firmante de la cadena dinámica.
 * @param {string} emailFirmante - Email del firmante a notificar
 * @param {string} nombreEmpleado - Nombre del interesado (empleado)
 * @param {object} permiso - Objeto permiso
 * @param {number} posicion - Posición en la cadena (1-based, para mostrar al usuario)
 * @param {number} totalFirmantes - Total de firmantes en la cadena
 */
function notificarFirmante(emailFirmante, nombreEmpleado, permiso, posicion, totalFirmantes) {
  if (!emailFirmante) return;
  const esFinal = posicion === totalFirmantes;
  const rolLabel = esFinal ? 'Firma final' : `Firmante ${posicion} de ${totalFirmantes}`;
  const appUrl   = window.location.origin + window.location.pathname;
  const asunto   = encodeURIComponent(
    `[VacaFirma] ACCIÓN REQUERIDA — Solicitud de permiso de ${nombreEmpleado}`
  );
  const cuerpo   = encodeURIComponent(
    `Estimado/a firmante (${rolLabel}),\n\n` +
    `${nombreEmpleado} ha enviado una solicitud de permiso que requiere tu firma.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Tipo:    ${TIPO_LABELS[permiso.tipo] || permiso.tipo}\n` +
    `Inicio:  ${formatFecha(permiso.fecha_inicio)}\n` +
    `Fin:     ${formatFecha(permiso.fecha_fin)}\n` +
    `Días:    ${permiso.dias_habiles || '—'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Accede a VacaFirma para revisar y firmar:\n${appUrl}\n\n` +
    `Referencia: ${permiso.id}\n\n` +
    `── Mensaje automático de VacaFirma ──`
  );
  window.location.href = `mailto:${emailFirmante}?subject=${asunto}&body=${cuerpo}`;
  toast(`Solicitud enviada. Notificando a ${emailFirmante}…`, 'success', 7000);
}

function notificarJefe(emailJefe, nombreEmpleado, permiso, etapa) {
  if (!emailJefe) return;
  const rolLabel = etapa === 'seccion' ? 'Jefe de Sección' : 'Jefe de Grupo';
  const appUrl   = window.location.origin + window.location.pathname;
  const asunto = encodeURIComponent(
    `[VacaFirma] ACCIÓN REQUERIDA — Solicitud de permiso de ${nombreEmpleado}`
  );
  const cuerpo = encodeURIComponent(
    `Estimado/a ${rolLabel},\n\n` +
    `${nombreEmpleado} ha firmado electrónicamente una solicitud de permiso que requiere tu aprobación.\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Tipo:    ${TIPO_LABELS[permiso.tipo] || permiso.tipo}\n` +
    `Inicio:  ${formatFecha(permiso.fecha_inicio)}\n` +
    `Fin:     ${formatFecha(permiso.fecha_fin)}\n` +
    `Días:    ${permiso.dias_habiles || '—'}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
    `Para revisar, aprobar o rechazar la solicitud, accede a VacaFirma:\n` +
    `${appUrl}\n\n` +
    `Una vez dentro, busca la solicitud con referencia: ${permiso.id}\n\n` +
    `Si no tienes cuenta en VacaFirma, responde a este correo para que el empleado te facilite el acceso.\n\n` +
    `── Mensaje automático de VacaFirma ──`
  );
  // Abrir cliente de correo con location.href (más fiable que window.open o a.click)
  const mailtoLink = `mailto:${emailJefe}?subject=${asunto}&body=${cuerpo}`;
  window.location.href = mailtoLink;
  toast(`Solicitud enviada. Se ha intentado abrir tu cliente de correo para notificar a ${emailJefe}.`, 'success', 7000);
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

function toast(msg, tipo = 'info', duracion = 5000) {
  const container = $('toastContainer');
  if (!container) { console.log('[Toast]', msg); return; }
  const t = document.createElement('div');
  t.className = `toast toast-${tipo}`;
  t.innerHTML = `<span>${msg}</span><button onclick="this.parentElement.remove()">×</button>`;
  container.appendChild(t);
  setTimeout(() => t.remove(), duracion);
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

// ══════════════════════════════════════════════════════════════
// HELPERS DE ADMIN — invocables desde la consola del navegador
// Uso: await vacaAdmin.setRol('jefe_seccion')
//      await vacaAdmin.reasignarJefe('email@ejemplo.es')
// ══════════════════════════════════════════════════════════════

// Exponer cambiarTab globalmente (usado en onclick del HTML)
window.cambiarTab = cambiarTab;

window.vacaAdmin = {
  async setRol(nuevoRol) {
    if (!state.user) { console.error('No hay sesión activa'); return; }
    await setRolUsuario(state.user.id, nuevoRol);
    state.profile.rol = nuevoRol;
    console.log(`✓ Rol cambiado a "${nuevoRol}" para ${state.user.email}`);
    console.log('Recarga la página para que surta efecto.');
  },
  async setRolEmail(email, nuevoRol) {
    const res = await setRolPorEmail(email, nuevoRol);
    console.log(`✓ Rol cambiado a "${nuevoRol}" para ${email} (id: ${res.id})`);
  },
  async reasignarJefe(emailJefe) {
    const res = await reasignarJefeSecciones(emailJefe);
    console.log(`✓ Reasignados ${res.actualizados} permisos al jefe ${emailJefe} (id: ${res.jefe_id})`);
  },
};
