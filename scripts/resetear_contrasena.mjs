#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// resetear_contrasena.mjs — SIGESPER-FFAA
// ───────────────────────────────────────────────────────────────
// Restablece la contraseña de un usuario y activa primer_acceso
// para que la app le pida cambiarla al entrar.
//
// Uso:
//   node resetear_contrasena.mjs <email> [nueva_contraseña]
//
// Ejemplos:
//   node resetear_contrasena.mjs jmotmon@mde.es
//   node resetear_contrasena.mjs jmotmon@mde.es MiClave2026.
//
// Si no se indica contraseña, se usa: Minisdef2026.
// ═══════════════════════════════════════════════════════════════

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const email     = process.argv[2];
const nuevaClave = process.argv[3] || 'Minisdef2026.';

if (!email) {
  console.error('❌  Uso: node resetear_contrasena.mjs <email> [nueva_contraseña]');
  process.exit(1);
}

const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error(`❌  Falta serviceAccountKey.json en ${__dirname}`);
  process.exit(1);
}

const serviceAccount = JSON.parse(await readFile(keyPath, 'utf8'));
initializeApp({ credential: cert(serviceAccount) });
const auth = getAuth();
const db   = getFirestore();

console.log(`\n🔑  Restableciendo contraseña de: ${email}`);

try {
  // 1. Obtener usuario
  const user = await auth.getUserByEmail(email);

  // 2. Cambiar contraseña en Firebase Auth
  await auth.updateUser(user.uid, { password: nuevaClave });
  console.log(`  ✓  Contraseña actualizada en Auth`);

  // 3. Marcar primer_acceso: true en Firestore
  await db.collection('user_profiles').doc(user.uid).set(
    { primer_acceso: true },
    { merge: true }
  );
  console.log(`  ✓  primer_acceso marcado en Firestore`);

  console.log(`\n✅  Listo. El usuario puede entrar con:`);
  console.log(`    Email:      ${email}`);
  console.log(`    Contraseña: ${nuevaClave}`);
  console.log(`    La app le pedirá que la cambie al iniciar sesión.\n`);

} catch (err) {
  if (err.code === 'auth/user-not-found') {
    console.error(`❌  No existe ningún usuario con el email: ${email}`);
  } else {
    console.error(`❌  Error: ${err.message}`);
  }
  process.exit(1);
}
