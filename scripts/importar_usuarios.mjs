#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// importar_usuarios.mjs — SIGESPER-FFAA
// ───────────────────────────────────────────────────────────────
// Lee el Excel de usuarios (usuarios_vacafirma.xlsx) y crea:
//   • Una cuenta en Firebase Authentication (email + contraseña temporal)
//   • Un documento en Firestore user_profiles/{uid}
//
// Uso:
//   node importar_usuarios.mjs usuarios_vacafirma.xlsx
//
// Requisitos (instalar una sola vez):
//   npm install xlsx firebase-admin
//
// Necesita el fichero de credenciales de servicio de Firebase:
//   - Descárgalo desde Firebase Console → Configuración del proyecto
//     → Cuentas de servicio → Generar nueva clave privada
//   - Guárdalo como serviceAccountKey.json en la misma carpeta
// ═══════════════════════════════════════════════════════════════

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Contraseña temporal ───────────────────────────────────────
const CONTRASENA_TEMPORAL = 'Minisdef2026.';

// ── Comprobar argumentos ──────────────────────────────────────
const excelPath = process.argv[2];
if (!excelPath) {
  console.error('❌  Uso: node importar_usuarios.mjs <ruta_al_excel>');
  process.exit(1);
}
if (!existsSync(excelPath)) {
  console.error(`❌  No se encuentra el fichero: ${excelPath}`);
  process.exit(1);
}

// ── Cargar credenciales Firebase ──────────────────────────────
const keyPath = path.join(__dirname, 'serviceAccountKey.json');
if (!existsSync(keyPath)) {
  console.error(`❌  Falta el fichero de credenciales: ${keyPath}`);
  console.error('    Descárgalo desde Firebase Console → Configuración → Cuentas de servicio.');
  process.exit(1);
}

// ── Importar dependencias ─────────────────────────────────────
let XLSX, admin;
try {
  XLSX  = (await import('xlsx')).default;
  admin = (await import('firebase-admin')).default;
} catch (e) {
  console.error('❌  Dependencias no instaladas. Ejecuta: npm install xlsx firebase-admin');
  process.exit(1);
}

// ── Inicializar Firebase Admin ────────────────────────────────
const serviceAccount = JSON.parse(await readFile(keyPath, 'utf8'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const auth = admin.auth();
const db   = admin.firestore();

// ── Leer Excel ────────────────────────────────────────────────
const wb   = XLSX.readFile(excelPath);
const ws   = wb.Sheets['USUARIOS'];
if (!ws) {
  console.error('❌  No se encuentra la hoja "USUARIOS" en el Excel.');
  process.exit(1);
}

const filas = XLSX.utils.sheet_to_json(ws, { defval: '' });

// Filtrar fila de ejemplo (email contiene "ejemplo" o está vacía)
const usuarios = filas.filter(f => {
  const email = (f['email'] || '').toString().trim().toLowerCase();
  return email && email !== 'juan.garcia@ejercito.es' && !email.includes('ejemplo');
});

if (!usuarios.length) {
  console.error('❌  No se encontraron usuarios en el Excel (¿está vacío?)');
  process.exit(1);
}

console.log(`\n📋  Usuarios encontrados: ${usuarios.length}`);
console.log(`🔑  Contraseña temporal: ${CONTRASENA_TEMPORAL}\n`);

// ── Importar ──────────────────────────────────────────────────
let ok = 0, errores = 0;

for (const fila of usuarios) {
  const email          = (fila['email']          || '').toString().trim().toLowerCase();
  const nombre_completo = (fila['nombre_completo'] || '').toString().trim();
  const dni            = (fila['dni']             || '').toString().trim().toUpperCase();
  const empleo         = (fila['empleo']          || '').toString().trim();
  const rol            = (fila['rol']             || 'empleado').toString().trim();
  const seccion        = (fila['seccion']         || '').toString().trim();

  if (!email) { console.warn('  ⚠️  Fila sin email, saltando.'); errores++; continue; }

  const rolesValidos = ['empleado', 'jefe_seccion', 'jefe_grupo'];
  const rolFinal = rolesValidos.includes(rol) ? rol : 'empleado';
  if (!rolesValidos.includes(rol)) {
    console.warn(`  ⚠️  Rol inválido "${rol}" para ${email} → asignado "empleado"`);
  }

  process.stdout.write(`  ➤  ${email} … `);

  try {
    // 1. Crear (o recuperar) usuario en Firebase Auth
    let uid;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
      // Si ya existe, actualizar contraseña temporal igualmente
      await auth.updateUser(uid, { password: CONTRASENA_TEMPORAL });
      process.stdout.write('[Auth: ya existía, contraseña actualizada] ');
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        const newUser = await auth.createUser({
          email,
          password: CONTRASENA_TEMPORAL,
          displayName: nombre_completo,
          emailVerified: false,
        });
        uid = newUser.uid;
        process.stdout.write('[Auth: creado] ');
      } else {
        throw e;
      }
    }

    // 2. Crear / actualizar perfil en Firestore
    const perfil = {
      email,
      nombre_completo,
      dni,
      empleo,
      rol: rolFinal,
      activo: true,
      primer_acceso: true,   // ← fuerza cambio de contraseña en primer login
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (seccion) perfil.seccion = seccion;

    await db.collection('user_profiles').doc(uid).set(perfil, { merge: true });
    process.stdout.write('[Firestore: OK]\n');
    ok++;

  } catch (err) {
    process.stdout.write(`\n    ❌  Error: ${err.message}\n`);
    errores++;
  }
}

console.log(`\n✅  Importación completada: ${ok} usuarios OK, ${errores} errores.`);
if (ok > 0) {
  console.log(`\nℹ️  Todos los usuarios importados tienen:`);
  console.log(`    • Contraseña temporal: ${CONTRASENA_TEMPORAL}`);
  console.log(`    • primer_acceso: true → la app les pedirá cambiarla al entrar por primera vez`);
}
console.log('');
