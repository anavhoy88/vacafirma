// ═══════════════════════════════════════════════════════════════
// supabase-client.js — VacaFirma 2.0
// Wrapper de todas las operaciones con Supabase.
// config.js debe cargarse antes (define SUPABASE_URL y SUPABASE_ANON_KEY).
// ═══════════════════════════════════════════════════════════════

const _supabase = window.supabase.createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY
);

// Exponer para módulos que necesiten el cliente directamente
function getSupabaseClient() { return _supabase; }

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

async function enviarMagicLink(email) {
  const { error } = await _supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) throw error;
}

async function loginConContrasena(email, password) {
  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function logout() {
  const { error } = await _supabase.auth.signOut();
  if (error) throw error;
}

function onAuthStateChange(callback) {
  _supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  // Comprobar sesión inicial
  _supabase.auth.getSession().then(({ data: { session } }) => {
    callback(session);
  });
}

// ══════════════════════════════════════════════════════════════
// USER PROFILES
// ══════════════════════════════════════════════════════════════

async function getUserProfile(userId) {
  const { data, error } = await _supabase
    .from('user_profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function createOrUpdateProfile(profile) {
  const { data, error } = await _supabase
    .from('user_profiles')
    .upsert(profile, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getJefeGrupo() {
  const { data, error } = await _supabase
    .from('user_profiles')
    .select('*')
    .eq('rol', 'jefe_grupo')
    .eq('activo', true)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

async function buscarUsuarioPorEmail(email) {
  const { data, error } = await _supabase
    .from('user_profiles')
    .select('*')
    .ilike('email', email.trim())
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

// ══════════════════════════════════════════════════════════════
// PERMISOS — CRUD
// ══════════════════════════════════════════════════════════════

async function crearPermiso(datos) {
  // Intentar resolver el jefe de sección si su email está en el sistema
  let jefe_seccion_id = null;
  if (datos.jefe_seccion_email) {
    const jefe = await buscarUsuarioPorEmail(datos.jefe_seccion_email);
    if (jefe) jefe_seccion_id = jefe.id;
  }

  const { data, error } = await _supabase
    .from('permisos')
    .insert({
      ...datos,
      jefe_seccion_id,
      estado: 'borrador',
      anio: new Date(datos.fecha_inicio).getFullYear()
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getMisPermisos(userId) {
  const { data, error } = await _supabase
    .from('permisos')
    .select(`
      *,
      empleado:user_profiles!permisos_empleado_id_fkey(nombre_completo, empleo, dependencia),
      firmas(*)
    `)
    .eq('empleado_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getPermisosParaJefeSeccion(jefeId) {
  const { data, error } = await _supabase
    .from('permisos')
    .select(`
      *,
      empleado:user_profiles!permisos_empleado_id_fkey(nombre_completo, empleo, dependencia),
      firmas(*)
    `)
    .eq('jefe_seccion_id', jefeId)
    .in('estado', ['firmada_empleado', 'aprobada_jefe_seccion',
                   'rechazada_jefe_seccion', 'aprobada', 'rechazada'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getPermisosParaJefeGrupo() {
  const { data, error } = await _supabase
    .from('permisos')
    .select(`
      *,
      empleado:user_profiles!permisos_empleado_id_fkey(nombre_completo, empleo, dependencia),
      jefe_sec:user_profiles!permisos_jefe_seccion_id_fkey(nombre_completo),
      firmas(*)
    `)
    .in('estado', ['aprobada_jefe_seccion', 'aprobada', 'rechazada'])
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function getPermisoById(id) {
  const { data, error } = await _supabase
    .from('permisos')
    .select(`
      *,
      empleado:user_profiles!permisos_empleado_id_fkey(*),
      jefe_sec:user_profiles!permisos_jefe_seccion_id_fkey(nombre_completo, empleo, email),
      firmas(*, firmante:user_profiles(nombre_completo, empleo, dni))
    `)
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// Actualizar estado y PDF tras firma del empleado
async function actualizarTrasFirmaEmpleado(permisoId, pdfUrl) {
  const { data, error } = await _supabase
    .from('permisos')
    .update({ estado: 'firmada_empleado', pdf_url: pdfUrl })
    .eq('id', permisoId)
    .eq('estado', 'borrador')
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Jefe sección aprueba
async function aprobarJefeSeccion(permisoId, pdfUrl) {
  const { data, error } = await _supabase
    .from('permisos')
    .update({ estado: 'aprobada_jefe_seccion', pdf_url: pdfUrl })
    .eq('id', permisoId)
    .eq('estado', 'firmada_empleado')
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Jefe sección rechaza
async function rechazarJefeSeccion(permisoId, motivo) {
  const { data, error } = await _supabase
    .from('permisos')
    .update({
      estado: 'rechazada_jefe_seccion',
      motivo_rechazo: motivo,
      rechazado_por: 'jefe_seccion'
    })
    .eq('id', permisoId)
    .eq('estado', 'firmada_empleado')
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Jefe grupo aprueba
async function aprobarJefeGrupo(permisoId, pdfFinalUrl) {
  const { data, error } = await _supabase
    .from('permisos')
    .update({ estado: 'aprobada', pdf_final_url: pdfFinalUrl })
    .eq('id', permisoId)
    .eq('estado', 'aprobada_jefe_seccion')
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Jefe grupo rechaza
async function rechazarJefeGrupo(permisoId, motivo) {
  const { data, error } = await _supabase
    .from('permisos')
    .update({
      estado: 'rechazada',
      motivo_rechazo: motivo,
      rechazado_por: 'jefe_grupo'
    })
    .eq('id', permisoId)
    .eq('estado', 'aprobada_jefe_seccion')
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ══════════════════════════════════════════════════════════════
// FIRMAS — registro criptográfico
// ══════════════════════════════════════════════════════════════

async function registrarFirma({ permiso_id, firmante_id, rol_firma, certInfo, accion, motivo_rechazo }) {
  const { data, error } = await _supabase
    .from('firmas')
    .insert({
      permiso_id,
      firmante_id,
      rol_firma,
      nombre_cert:    certInfo.nombre  || '',
      dni_cert:       certInfo.dni     || '',
      cert_b64:       certInfo.raw     || '',
      cert_hash:      certInfo.hash    || '',
      accion,
      motivo_rechazo: motivo_rechazo || null,
      firmado_en:     new Date().toISOString()
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getFirmasDePermiso(permisoId) {
  const { data, error } = await _supabase
    .from('firmas')
    .select('*, firmante:user_profiles(nombre_completo, empleo, dni)')
    .eq('permiso_id', permisoId)
    .order('firmado_en', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ══════════════════════════════════════════════════════════════
// STORAGE — subir y obtener PDFs
// ══════════════════════════════════════════════════════════════

async function subirPDF(userId, permisoId, pdfBytes, sufijo = '') {
  const nombre = `${userId}/${permisoId}${sufijo ? '_' + sufijo : ''}_${Date.now()}.pdf`;
  const { data, error } = await _supabase.storage
    .from('permisos')
    .upload(nombre, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true
    });
  if (error) throw error;
  return data.path;
}

async function getUrlPDF(path) {
  const { data, error } = await _supabase.storage
    .from('permisos')
    .createSignedUrl(path, 60 * 60); // 1 hora de validez
  if (error) throw error;
  return data.signedUrl;
}

async function descargarPDF(path) {
  const { data, error } = await _supabase.storage
    .from('permisos')
    .download(path);
  if (error) throw error;
  return new Uint8Array(await data.arrayBuffer());
}
