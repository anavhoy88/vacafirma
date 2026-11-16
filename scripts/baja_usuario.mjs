#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// baja_usuario.mjs — SIGESPER-FFAA
// ───────────────────────────────────────────────────────────────
// Gestiona la baja de un usuario:
//   1. Pone activo: false en su perfil de Firestore
//   2. Elimina todas sus solicitudes pendientes (no terminadas)
//   3. Deshabilita su cuenta en Firebase Authentication
//
// Uso:
//   node baja_usuario.mjs <email>
//   node baja_usuario.mjs garcia.perez@ejercitodelaire.es
//
// Requisitos (instalar una sola vez en la carpeta scripts/):
//   npm install firebase-admin
//
// Necesita el fichero de credenciales de servicio de Firebase:
//   - Descárgalo desde Firebase Console → Configuración del proyecto
//     → Cuentas de servicio → Generar nueva clave privada
//   - Guárdalo como serviceAccountKey.json en la misma carpeta que este script
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ── Credenciales ───────────────────────────────────────────────
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
} catch {
  console.error('❌ No se encuentra serviceAccountKey.json en la carpeta scripts/');
  console.error('   Descárgalo desde Firebase Console → Configuración → Cuentas de servicio');
  process.exit(1);
}

const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db   = admin.firestore();
const auth = admin.auth();

// ── Estados pendientes (no terminales) ─────────────────────────
const ESTADOS_PENDIENTES = [
  'borrador',
  'firmada_empleado',
  'en_cadena',
  'aprobada_jefe_seccion',
];

// ── Main ───────────────────────────────────────────────────────
const email = process.argv[2];
if (!email) {
  console.error('Uso: node baja_usuario.mjs <email>');
  process.exit(1);
}

console.log(`\n🔍 Buscando usuario: ${email}`);

// 1. Buscar el usuario en Firebase Auth
let userRecord;
try {
  userRecord = await auth.getUserByEmail(email);
} catch {
  console.error(`❌ No existe ningún usuario con email: ${email}`);
  process.exit(1);
}

const uid = userRecord.uid;
console.log(`   UID: ${uid}`);
console.log(`   Nombre: ${userRecord.displayName || '(sin nombre)'}`);

// Confirmación
console.log('\n⚠️  Se va a realizar lo siguiente:');
console.log('   1. Marcar el perfil como inactivo (activo: false)');
console.log('   2. Eliminar todas sus solicitudes pendientes');
console.log('   3. Deshabilitar su cuenta de acceso\n');

// 2. Marcar perfil como inactivo
console.log('📝 Desactivando perfil en Firestore...');
const perfilRef = db.collection('user_profiles').doc(uid);
const perfilSnap = await perfilRef.get();
if (!perfilSnap.exists()) {
  console.warn('   ⚠️  No tiene perfil en user_profiles (puede que nunca haya entrado a la app)');
} else {
  await perfilRef.update({
    activo: false,
    baja_fecha: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log('   ✅ Perfil marcado como inactivo');
}

// 3. Eliminar solicitudes pendientes
console.log('\n🗑️  Buscando solicitudes pendientes...');
let eliminadas = 0;
let batch = db.batch();
let enBatch = 0;

for (const estado of ESTADOS_PENDIENTES) {
  const snap = await db.collection('permisos')
    .where('empleado_id', '==', uid)
    .where('estado', '==', estado)
    .get();

  for (const docSnap of snap.docs) {
    // Eliminar también las subcolecciones de firmas
    const firmasSnap = await docSnap.ref.collection('firmas').get();
    for (const firmaDoc of firmasSnap.docs) {
      batch.delete(firmaDoc.ref);
      enBatch++;
      if (enBatch >= 400) { await batch.commit(); batch = db.batch(); enBatch = 0; }
    }
    batch.delete(docSnap.ref);
    enBatch++;
    eliminadas++;
    console.log(`   🗑️  Eliminando permiso ${docSnap.id} (estado: ${estado})`);
    if (enBatch >= 400) { await batch.commit(); batch = db.batch(); enBatch = 0; }
  }
}

if (enBatch > 0) await batch.commit();

if (eliminadas === 0) {
  console.log('   ℹ️  No tenía solicitudes pendientes');
} else {
  console.log(`   ✅ ${eliminadas} solicitud(es) eliminada(s)`);
}

// 4. Deshabilitar cuenta en Firebase Auth
console.log('\n🔐 Deshabilitando cuenta de acceso...');
await auth.updateUser(uid, { disabled: true });
console.log('   ✅ Cuenta deshabilitada');

console.log(`\n✅ Baja completada para ${email}\n`);
process.exit(0);
