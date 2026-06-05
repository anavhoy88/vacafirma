// ═══════════════════════════════════════════════════════════════
// supabase-client.js — Toda la lógica de Supabase
// ═══════════════════════════════════════════════════════════════

const { createClient } = supabase;
const sb = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// ── AUTH ──────────────────────────────────────────────────────

async function enviarMagicLink(email) {
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: APP_URL },
  });
  if (error) throw error;
}

async function getSession() {
  const { data } = await sb.auth.getSession();
  return data.session;
}

async function getUser() {
  const { data } = await sb.auth.getUser();
  return data.user;
}

async function logout() {
  await sb.auth.signOut();
}

// Obtiene el perfil (nombre + rol) del usuario actual
async function getUserProfile(userId) {
  const { data, error } = await sb
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) return null;
  return data;
}

// ── SOLICITUDES ───────────────────────────────────────────────

async function crearSolicitud({ empleadoId, empleadoNombre, fechaInicio, fechaFin, direccion, observaciones }) {
  const { data, error } = await sb
    .from('solicitudes_vacaciones')
    .insert([{
      empleado_id:     empleadoId,
      empleado_nombre: empleadoNombre,
      fecha_inicio:    fechaInicio,
      fecha_fin:       fechaFin,
      direccion,
      observaciones,
      estado:          ESTADOS.BORRADOR,
      firma_empleado:  false,
      firma_jefe1:     false,
      firma_jefe2:     false,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getSolicitudes(userId, rol) {
  let query = sb.from('solicitudes_vacaciones').select('*').order('created_at', { ascending: false });

  if (rol === ROLES.EMPLEADO) {
    query = query.eq('empleado_id', userId);
  }
  // Jefes ven todas las pendientes de su firma o ya procesadas

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function getSolicitudById(id) {
  const { data, error } = await sb
    .from('solicitudes_vacaciones')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

async function actualizarSolicitud(id, campos) {
  const { data, error } = await sb
    .from('solicitudes_vacaciones')
    .update(campos)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── STORAGE ───────────────────────────────────────────────────

// Sube el PDF firmado a Supabase Storage
// path: e.g. "solicitudes/uuid-solicitud/firma-empleado.pdf"
async function subirPDF(path, pdfBytes) {
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });

  const { data, error } = await sb.storage
    .from(SUPABASE_CONFIG.storageBucket)
    .upload(path, blob, {
      contentType: 'application/pdf',
      upsert: true,           // sobreescribe si ya existe (para re-firmas)
    });

  if (error) throw error;
  return data;
}

// Descarga el PDF actual de una solicitud
async function descargarPDF(path) {
  const { data, error } = await sb.storage
    .from(SUPABASE_CONFIG.storageBucket)
    .download(path);
  if (error) throw error;
  return await data.arrayBuffer();
}

// Genera URL firmada (válida 1 hora) para que el jefe descargue/vea el PDF
async function getURLFirmada(path, expiracion = 3600) {
  const { data, error } = await sb.storage
    .from(SUPABASE_CONFIG.storageBucket)
    .createSignedUrl(path, expiracion);
  if (error) throw error;
  return data.signedUrl;
}

// Construye el path en Storage para una solicitud
function buildPDFPath(solicitudId, version = 'current') {
  return `solicitudes/${solicitudId}/${version}.pdf`;
}

// ── LISTENER AUTH ─────────────────────────────────────────────

// Llama al callback cuando cambia el estado de autenticación
function onAuthStateChange(callback) {
  sb.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
}
