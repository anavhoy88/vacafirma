#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// crear_usuario.mjs — SIGESPER-FFAA
// ───────────────────────────────────────────────────────────────
// Crea un usuario en Firebase Auth + Firestore desde la línea
// de comandos, sin necesidad de Excel.
//
// Uso:
//   node crear_usuario.mjs <email> <nombre_completo> <dni> <empleo> <rol> [seccion]
//
// Roles válidos: empleado | jefe_seccion | jefe_grupo
//
// Ejemplos:
//   node crear_usuario.mjs prueba@mde.es "PRUEBA USUARIO, Test" 00000001B Sargento empleado CIS
//   node crear_usuario.mjs jperez@ea.mde.es "PÉREZ GARCÍA, Juan" 12345678A "Cabo 1º" jefe_seccion Administración
//
// Contraseña temporal por defecto: Minisdef2026.
// Se puede cambiar con la variable CONTRASENA al ejecutar:
//   CONTRASENA=OtraClave2026. node crear_usuario.mjs ...  (Linux/Mac)
//   $env:CONTRASENA="OtraClave2026."; node crear_usuario.mjs ...  (PowerShell)
// ═══════════════════════════════════════════════════════════════

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Argumentos ────────────────────────────────────────────────
const [email, nombre_completo, dni, empleo, rol, seccion] = process.argv.slice(2);

if (!email || !nombre_completo || !dni || !empleo || !rol) {
  console.error(`
❌  Faltan argumentos.

Uso:
  node crear_usuario.mjs <email> <nombre_completo> <dni> <empleo> <rol> [seccion]

Roles válidos: empleado | jefe_seccion | jefe_grupo

Ejemplos:
  node crear_usuario.mjs prueba@mde.es "PRUEBA, Test" 00000001B Sargento empleado CIS
  node crear_usuario.mjs jperez@ea.mde.es "PÉREZ, Juan" 12345678A "Cabo 1º" jefe_seccion Admin
`);
  process.exit(1);
}

const rolesValidos = ['empleado', 'jefe_seccion', 'jefe_grupo'];
if (!rolesValidos.includes(rol)) {
  console.error(`❌  Rol inválido: "${rol}". Usa: empleado | jefe_seccion | jefe_grupo`);
  process.exit(1);
}

const dominiosPermitidos = ['ea.mde.es', 'mde.es'];
const dominio = (email.split('@')[1] || '').toLowerCase();
if (!dominiosPermitidos.includes(dominio)) {
  console.warn(`⚠️  Aviso: el dominio "@${dominio}" no está en la lista permitida (@ea.mde.es, @mde.es).`);
  console.warn('    El usuario no podrá entrar en la app a menos que se amplíe la lista de dominios.\n');
}

const CONTRASENA = process.env.CONTRASENA || 'Minisdef2026.';

// ── Credenciales Firebase ─────────────────────────────────────
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error(`❌  Falta serviceAccountKey.json en ${__dirname}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(await readFile(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db   = getFirestore();

// ── Crear usuario ─────────────────────────────────────────────
console.log(`\n👤  Creando usuario: ${email}`);
console.log(`    Nombre:   ${nombre_completo}`);
console.log(`    DNI:      ${dni.toUpperCase()}`);
console.log(`    Empleo:   ${empleo}`);
console.log(`    Rol:      ${rol}`);
if (seccion) console.log(`    Sección:  ${seccion}`);
console.log(`    Clave:    ${CONTRASENA}\n`);

try {
  // 1. Auth: crear o actualizar
  let uid;
  try {
    const existing = await auth.getUserByEmail(email.toLowerCase());
    uid = existing.uid;
    await auth.updateUser(uid, { password: CONTRASENA, displayName: nombre_completo });
    console.log(`  ✓  Auth: usuario ya existía → contraseña actualizada (uid: ${uid.slice(0,8)}…)`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      const newUser = await auth.createUser({
        email: email.toLowerCase(),
        password: CONTRASENA,
        displayName: nombre_completo,
        emailVerified: false,
      });
      uid = newUser.uid;
      console.log(`  ✓  Auth: usuario creado (uid: ${uid.slice(0,8)}…)`);
    } else {
      throw e;
    }
  }

  // 2. Firestore: crear/actualizar perfil
  const perfil = {
    email:          email.toLowerCase(),
    nombre_completo,
    dni:            dni.toUpperCase(),
    empleo,
    rol,
    activo:         true,
    primer_acceso:  true,
    updated_at:     FieldValue.serverTimestamp(),
  };
  if (seccion) perfil.seccion = seccion;

  await db.collection('user_profiles').doc(uid).set(perfil, { merge: true });
  console.log(`  ✓  Firestore: perfil guardado`);

  console.log(`
✅  Usuario listo.
    Email:      ${email.toLowerCase()}
    Contraseña: ${CONTRASENA}
    La app pedirá cambio de contraseña en el primer acceso.
`);

} catch (err) {
  console.error(`\n❌  Error: ${err.message}`);
  process.exit(1);
}
