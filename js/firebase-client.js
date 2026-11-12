// ═══════════════════════════════════════════════════════════════
// firebase-client.js — VacaFirma 2.0
// Reemplaza supabase-client.js usando Firebase como backend.
// Las funciones exportadas mantienen la misma firma para que
// app.js no necesite cambios.
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  updatePassword,
  reauthenticateWithCredential,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
  getBytes,
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

// ── Inicialización ─────────────────────────────────────────────
// La config se lee de js/firebase-config.js (excluido de git).
// Si no existe ese archivo, se usa la config embebida como fallback.

const firebaseConfig = (typeof window.__FIREBASE_CONFIG__ !== 'undefined')
  ? window.__FIREBASE_CONFIG__
  : {
      apiKey:            "AIzaSyAKyL_elQeUfxfYeyPcpmI4Mlq7UTy3DxY",
      authDomain:        "vacafirma.firebaseapp.com",
      projectId:         "vacafirma",
      storageBucket:     "vacafirma.firebasestorage.app",
      messagingSenderId: "352797871816",
      appId:             "1:352797871816:web:508aaed15e857bde7c1ffd",
    };

const _app     = initializeApp(firebaseConfig);
const _auth    = getAuth(_app);
const _db      = getFirestore(_app);
const _storage = getStorage(_app);

// URL de la app (para magic link y redirección)
const APP_URL = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

async function enviarMagicLink(email) {
  const actionCodeSettings = {
    url: APP_URL,
    handleCodeInApp: true,
  };
  await sendSignInLinkToEmail(_auth, email, actionCodeSettings);
  // Guardamos el email para usarlo cuando el usuario vuelve con el link
  window.localStorage.setItem('vacafirma_emailForSignIn', email);
}

async function loginConContrasena(email, password) {
  const result = await signInWithEmailAndPassword(_auth, email, password);
  return result;
}

async function logout() {
  await signOut(_auth);
}

function onAuthStateChange(callback) {
  // Primero comprobamos si la URL actual es un magic link
  if (isSignInWithEmailLink(_auth, window.location.href)) {
    let email = window.localStorage.getItem('vacafirma_emailForSignIn');
    if (!email) {
      // Si no tenemos el email guardado, pedirlo
      email = window.prompt('Introduce tu correo para confirmar el acceso:');
    }
    if (email) {
      signInWithEmailLink(_auth, email, window.location.href)
        .then(() => {
          window.localStorage.removeItem('vacafirma_emailForSignIn');
          // Limpiar el hash/query de la URL sin recargar
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(err => console.error('Error al procesar magic link:', err));
    }
  }

  onAuthStateChanged(_auth, (user) => {
    // Adaptamos el objeto user de Firebase al formato que espera app.js
    // (que espera un "session" con session.user.id y session.user.email)
    if (user) {
      callback({
        user: {
          id:    user.uid,
          email: user.email,
        }
      });
    } else {
      callback(null);
    }
  });
}

// ══════════════════════════════════════════════════════════════
// USER PROFILES
// ══════════════════════════════════════════════════════════════

// Mapeo de valores históricos de rol → valor canónico interno
const _ROL_CANON = {
  'empleado':        'empleado',
  'Empleado':        'empleado',
  'jefe_seccion':    'jefe_seccion',
  'Jefe de Sección': 'jefe_seccion',
  'Jefe de Seccion': 'jefe_seccion',
  'jefe intermedio': 'jefe_seccion',
  'Jefe Intermedio': 'jefe_seccion',
  'jefe_grupo':      'jefe_grupo',
  'Jefe de FFAA':    'jefe_grupo',
  'Jefe de Grupo':   'jefe_grupo',
  'jefe de grupo':   'jefe_grupo',
};

function _normalizarRol(rol) {
  return _ROL_CANON[rol] || rol || 'empleado';
}

async function getUserProfile(userId) {
  const snap = await getDoc(doc(_db, 'user_profiles', userId));
  if (!snap.exists()) return null;
  const data = snap.data();
  // Normalizar rol al leer para que el código siempre vea 'empleado'|'jefe_seccion'|'jefe_grupo'
  return { id: snap.id, ...data, rol: _normalizarRol(data.rol) };
}

async function createOrUpdateProfile(profile) {
  const { id, ...datos } = profile;
  datos.updated_at = serverTimestamp();
  if (!datos.created_at) datos.created_at = serverTimestamp();
  await setDoc(doc(_db, 'user_profiles', id), datos, { merge: true });
  return { id, ...datos };
}

async function getJefeGrupo() {
  // Buscar por todos los valores posibles del rol (normalizados o históricos)
  const valoresRol = ['jefe_grupo', 'Jefe de FFAA', 'Jefe de Grupo', 'jefe de grupo'];
  for (const valor of valoresRol) {
    const q = query(
      collection(_db, 'user_profiles'),
      where('rol', '==', valor),
      where('activo', '==', true)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      const data = d.data();
      return { id: d.id, ...data, rol: 'jefe_grupo' };
    }
  }
  return null;
}

async function buscarUsuarioPorEmail(email) {
  const q = query(
    collection(_db, 'user_profiles'),
    where('email', '==', email.trim().toLowerCase())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = d.data();
  return { id: d.id, ...data, rol: _normalizarRol(data.rol) };
}

// Helper: enriquece permisos con perfiles de empleado y jefe_sec
async function _enriquecerConPerfiles(permisos) {
  if (!permisos.length) return permisos;
  const ids = [...new Set([
    ...permisos.map(p => p.empleado_id),
    ...permisos.map(p => p.jefe_seccion_id).filter(Boolean),
  ])];
  // Firestore no tiene IN de más de 30 — suficiente para este caso
  const perfiles = {};
  await Promise.all(ids.map(async id => {
    const snap = await getDoc(doc(_db, 'user_profiles', id));
    if (snap.exists()) {
      const d = snap.data();
      perfiles[id] = { id: snap.id, ...d, rol: _normalizarRol(d.rol) };
    }
  }));
  return permisos.map(p => ({
    ...p,
    empleado:  perfiles[p.empleado_id]    || {},
    jefe_sec:  perfiles[p.jefe_seccion_id] || {},
  }));
}

// ══════════════════════════════════════════════════════════════
// PERMISOS — CRUD
// ══════════════════════════════════════════════════════════════

// Empleos que solo necesitan 2 firmas (empleado + jefe_seccion)
const _EMPLEOS_DOS_FIRMAS = new Set(['comandante']);

async function crearPermiso(datos) {
  let jefe_seccion_id = null;
  if (datos.jefe_seccion_email) {
    const jefe = await buscarUsuarioPorEmail(datos.jefe_seccion_email);
    if (jefe) jefe_seccion_id = jefe.id;
  }

  const empleoLower = (datos.empleo_peticionario || '').trim().toLowerCase();
  const num_firmas  = _EMPLEOS_DOS_FIRMAS.has(empleoLower) ? 2 : 3;

  const permiso = {
    ...datos,
    jefe_seccion_id,
    num_firmas,
    estado:     'borrador',
    anio:       new Date(datos.fecha_inicio).getFullYear(),
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  };

  const ref = await addDoc(collection(_db, 'permisos'), permiso);
  return { id: ref.id, ...permiso };
}

async function getMisPermisos(userId) {
  // Sin orderBy para evitar índice compuesto — ordenamos en memoria
  const q = query(
    collection(_db, 'permisos'),
    where('empleado_id', '==', userId)
  );
  const snap = await getDocs(q);
  const permisos = await Promise.all(snap.docs.map(async d => {
    const permiso = { id: d.id, ...d.data() };
    // Cargar firmas
    const firmasSnap = await getDocs(collection(_db, 'permisos', d.id, 'firmas'));
    permiso.firmas = firmasSnap.docs.map(f => ({ id: f.id, ...f.data() }));
    return permiso;
  }));
  // Ordenar por fecha desc en memoria
  permisos.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
  // Enriquecer con perfil del propio empleado (para columna Empleado y PDF)
  return await _enriquecerConPerfiles(permisos);
}

async function getPermisosParaJefeSeccion(jefeId) {
  // Sin orderBy para evitar índice compuesto — ordenamos en memoria
  const q = query(
    collection(_db, 'permisos'),
    where('jefe_seccion_id', '==', jefeId)
  );
  const snap = await getDocs(q);
  const estados = ['firmada_empleado','aprobada_jefe_seccion','rechazada_jefe_seccion','aprobada','rechazada'];
  const permisos = await Promise.all(
    snap.docs
      .filter(d => estados.includes(d.data().estado))
      .map(async d => {
        const permiso = { id: d.id, ...d.data() };
        const firmasSnap = await getDocs(collection(_db, 'permisos', d.id, 'firmas'));
        permiso.firmas = firmasSnap.docs.map(f => ({ id: f.id, ...f.data() }));
        return permiso;
      })
  );
  permisos.sort((a, b) => (b.created_at?.seconds || 0) - (a.created_at?.seconds || 0));
  return await _enriquecerConPerfiles(permisos);
}

async function getPermisosParaJefeGrupo() {
  const estados = ['aprobada_jefe_seccion', 'aprobada', 'rechazada'];
  // Firestore no permite OR en where, hacemos 3 queries
  // Sin orderBy para evitar índice compuesto — ordenamos en memoria después
  const resultados = await Promise.all(estados.map(estado =>
    getDocs(query(collection(_db, 'permisos'), where('estado', '==', estado)))
  ));
  console.log('[JefeGrupo] Resultados por estado:',
    estados.map((e, i) => `${e}: ${resultados[i].size} docs`).join(', '));
  const permisos = await Promise.all(
    resultados.flatMap(snap => snap.docs).map(async d => {
      const permiso = { id: d.id, ...d.data() };
      const firmasSnap = await getDocs(collection(_db, 'permisos', d.id, 'firmas'));
      permiso.firmas = firmasSnap.docs.map(f => ({ id: f.id, ...f.data() }));
      return permiso;
    })
  );
  console.log('[JefeGrupo] Total permisos cargados:', permisos.length);
  // Ordenar por fecha desc
  permisos.sort((a, b) => {
    const ta = a.created_at?.seconds || 0;
    const tb = b.created_at?.seconds || 0;
    return tb - ta;
  });
  return await _enriquecerConPerfiles(permisos);
}

async function getPermisoById(id) {
  const snap = await getDoc(doc(_db, 'permisos', id));
  if (!snap.exists()) throw new Error('Permiso no encontrado');
  const permiso = { id: snap.id, ...snap.data() };

  // Cargar firmas (subcolección)
  const firmasSnap = await getDocs(collection(_db, 'permisos', id, 'firmas'));
  permiso.firmas = firmasSnap.docs.map(f => ({ id: f.id, ...f.data() }));

  // Enriquecer perfiles
  const ids = [...new Set([
    permiso.empleado_id,
    permiso.jefe_seccion_id,
    ...permiso.firmas.map(f => f.firmante_id),
  ].filter(Boolean))];

  const perfiles = {};
  await Promise.all(ids.map(async uid => {
    const pSnap = await getDoc(doc(_db, 'user_profiles', uid));
    if (pSnap.exists()) perfiles[uid] = { id: pSnap.id, ...pSnap.data() };
  }));

  return {
    ...permiso,
    empleado:  perfiles[permiso.empleado_id]    || {},
    jefe_sec:  perfiles[permiso.jefe_seccion_id] || {},
    firmas: permiso.firmas.map(f => ({
      ...f,
      firmante: perfiles[f.firmante_id] || {},
    })),
  };
}

async function _actualizarPermiso(permisoId, campos) {
  await updateDoc(doc(_db, 'permisos', permisoId), {
    ...campos,
    updated_at: serverTimestamp(),
  });
  return getPermisoById(permisoId);
}

async function actualizarTrasFirmaEmpleado(permisoId, pdfUrl) {
  return _actualizarPermiso(permisoId, { estado: 'firmada_empleado', pdf_url: pdfUrl });
}

async function aprobarJefeSeccion(permisoId, pdfUrl) {
  return _actualizarPermiso(permisoId, { estado: 'aprobada_jefe_seccion', pdf_url: pdfUrl });
}

async function rechazarJefeSeccion(permisoId, motivo) {
  return _actualizarPermiso(permisoId, {
    estado: 'rechazada_jefe_seccion',
    motivo_rechazo: motivo,
    rechazado_por: 'jefe_seccion',
  });
}

async function aprobarJefeGrupo(permisoId, pdfFinalUrl) {
  return _actualizarPermiso(permisoId, { estado: 'aprobada', pdf_final_url: pdfFinalUrl });
}

async function rechazarJefeGrupo(permisoId, motivo) {
  return _actualizarPermiso(permisoId, {
    estado: 'rechazada',
    motivo_rechazo: motivo,
    rechazado_por: 'jefe_grupo',
  });
}

// ══════════════════════════════════════════════════════════════
// FIRMAS — registro criptográfico
// ══════════════════════════════════════════════════════════════

async function registrarFirma({ permiso_id, firmante_id, rol_firma, certInfo, accion, motivo_rechazo }) {
  const firma = {
    permiso_id,
    firmante_id,
    rol_firma,
    nombre_cert:    certInfo.nombre || '',
    dni_cert:       certInfo.dni    || '',
    cert_b64:       certInfo.raw    || '',
    cert_hash:      certInfo.hash   || '',
    accion,
    motivo_rechazo: motivo_rechazo || null,
    firmado_en:     new Date().toISOString(),
  };
  // Guardamos en subcolección permisos/{id}/firmas
  const ref = await addDoc(collection(_db, 'permisos', permiso_id, 'firmas'), firma);
  return { id: ref.id, ...firma };
}

async function getFirmasDePermiso(permisoId) {
  const snap = await getDocs(collection(_db, 'permisos', permisoId, 'firmas'));
  const firmas = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Enriquecer con perfil del firmante
  const ids = [...new Set(firmas.map(f => f.firmante_id).filter(Boolean))];
  const perfiles = {};
  await Promise.all(ids.map(async uid => {
    const pSnap = await getDoc(doc(_db, 'user_profiles', uid));
    if (pSnap.exists()) perfiles[uid] = { id: pSnap.id, ...pSnap.data() };
  }));
  return firmas.map(f => ({ ...f, firmante: perfiles[f.firmante_id] || {} }));
}

// ══════════════════════════════════════════════════════════════
// ══ ADMIN — Gestión de roles y reasignación ══════════════════

async function setRolUsuario(userId, nuevoRol) {
  await updateDoc(doc(_db, 'user_profiles', userId), { rol: nuevoRol });
}

// Reasigna jefe_seccion_id en permisos donde quedó null pero el email coincide
async function reasignarJefeSecciones(emailJefe) {
  const jefe = await buscarUsuarioPorEmail(emailJefe);
  if (!jefe) throw new Error('No se encontró usuario con email: ' + emailJefe);
  const q = query(
    collection(_db, 'permisos'),
    where('jefe_seccion_email', '==', emailJefe)
  );
  const snap = await getDocs(q);
  const sinId = snap.docs.filter(d => !d.data().jefe_seccion_id);
  await Promise.all(sinId.map(d => updateDoc(d.ref, { jefe_seccion_id: jefe.id })));
  return { jefe_id: jefe.id, actualizados: sinId.length };
}

// ══ ADMIN — Borrado de permisos ══════════════════════════════

async function eliminarPermiso(permisoId) {
  // Borrar subcolección de firmas primero
  const firmasSnap = await getDocs(collection(_db, 'permisos', permisoId, 'firmas'));
  await Promise.all(firmasSnap.docs.map(d => deleteDoc(d.ref)));
  // Borrar el documento principal
  await deleteDoc(doc(_db, 'permisos', permisoId));
}

// PDF — almacenado en Firestore como base64 (evita CORS de Storage)
// El "path" que devolvemos es "firestore:{permisoId}:{campo}" para
// que app.js pueda seguir llamando a getUrlPDF / descargarPDF con
// la misma interfaz.
// ══════════════════════════════════════════════════════════════

async function subirPDF(userId, permisoId, pdfBytes, sufijo = '') {
  // Convertir Uint8Array → base64 (en trozos para evitar stack overflow en PDFs grandes)
  const bytes = new Uint8Array(pdfBytes);
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const base64 = btoa(binary);
  const campo  = sufijo === 'final' ? 'pdf_b64_final' : 'pdf_b64';
  await updateDoc(doc(_db, 'permisos', permisoId), {
    [campo]: base64,
    updated_at: serverTimestamp(),
  });
  // Devolvemos un pseudo-path reconocible
  return `firestore:${permisoId}:${campo}`;
}

async function getUrlPDF(path) {
  // Si es un pseudo-path de Firestore, generamos un blob URL
  if (path && path.startsWith('firestore:')) {
    const bytes = await descargarPDF(path);
    const blob  = new Blob([bytes], { type: 'application/pdf' });
    return URL.createObjectURL(blob);
  }
  // Fallback: intentar Storage (puede fallar por CORS)
  const storageRef = ref(_storage, path);
  return await getDownloadURL(storageRef);
}

async function descargarPDF(path) {
  if (path && path.startsWith('firestore:')) {
    const [, permisoId, campo] = path.split(':');
    const snap = await getDoc(doc(_db, 'permisos', permisoId));
    if (!snap.exists()) throw new Error('Permiso no encontrado');
    const base64 = snap.data()[campo];
    if (!base64) throw new Error('PDF no disponible');
    // Decodificar base64 → Uint8Array
    const binary = atob(base64);
    const bytes  = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  // Fallback: Storage
  const storageRef = ref(_storage, path);
  const buffer = await getBytes(storageRef);
  return new Uint8Array(buffer);
}

// ══════════════════════════════════════════════════════════════
// CONTRASEÑA — establecer / cambiar desde dentro de la sesión
// ══════════════════════════════════════════════════════════════

/** Devuelve true si el usuario actual NO tiene contraseña (solo magic link) */
function usuarioSinContrasena() {
  const user = _auth.currentUser;
  if (!user) return false;
  return !user.providerData.some(p => p.providerId === 'password');
}

/**
 * Vincula contraseña a una cuenta que solo tiene magic link.
 * Llama a linkWithCredential; si ya tiene contraseña, hace updatePassword.
 */
async function establecerContrasena(nuevaContrasena) {
  const user = _auth.currentUser;
  if (!user) throw new Error('No hay sesión activa.');
  const credential = EmailAuthProvider.credential(user.email, nuevaContrasena);
  // Intentar vincular (si ya tiene password, linkWithCredential falla → updatePassword)
  try {
    await linkWithCredential(user, credential);
  } catch (err) {
    if (err.code === 'auth/provider-already-linked' || err.code === 'auth/email-already-in-use') {
      await updatePassword(user, nuevaContrasena);
    } else {
      throw err;
    }
  }
}

// Admin: cambiar rol a cualquier usuario por email
async function setRolPorEmail(email, nuevoRol) {
  const usuario = await buscarUsuarioPorEmail(email);
  if (!usuario) throw new Error('No se encontró usuario con email: ' + email);
  await updateDoc(doc(_db, 'user_profiles', usuario.id), { rol: nuevoRol });
  return { id: usuario.id, email, nuevoRol };
}

// ══════════════════════════════════════════════════════════════
// EXPONER FUNCIONES COMO GLOBALES
// (app.js se carga como script clásico y las llama directamente)
// ══════════════════════════════════════════════════════════════

Object.assign(window, {
  // Auth
  enviarMagicLink,
  loginConContrasena,
  logout,
  onAuthStateChange,
  // Perfiles
  getUserProfile,
  createOrUpdateProfile,
  getJefeGrupo,
  buscarUsuarioPorEmail,
  // Permisos
  crearPermiso,
  getMisPermisos,
  getPermisosParaJefeSeccion,
  getPermisosParaJefeGrupo,
  getPermisoById,
  actualizarTrasFirmaEmpleado,
  aprobarJefeSeccion,
  rechazarJefeSeccion,
  aprobarJefeGrupo,
  rechazarJefeGrupo,
  // Firmas
  registrarFirma,
  getFirmasDePermiso,
  // Storage
  subirPDF,
  getUrlPDF,
  descargarPDF,
  // Admin
  eliminarPermiso,
  setRolUsuario,
  setRolPorEmail,
  reasignarJefeSecciones,
  establecerContrasena,
});
