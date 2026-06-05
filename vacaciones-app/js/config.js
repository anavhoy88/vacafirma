// ═══════════════════════════════════════════════════════════════
// config.js — Configuración de Supabase
// IMPORTANTE: Sustituye estos valores por los de tu proyecto Supabase
// ═══════════════════════════════════════════════════════════════

const SUPABASE_CONFIG = {
  // Ve a: Supabase Dashboard → Settings → API → Project URL
  url: 'https://zqzmmnvkerwtnuwlvvmx.supabase.co',

  // Ve a: Supabase Dashboard → Settings → API → anon/public key
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxem1tbnZrZXJ3dG51d2x2dm14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDI0MzcsImV4cCI6MjA5NjIxODQzN30.g38bxkGiY0XDAD7WQpMP6n-JZ0UGqzzJIe1MgMo6JZs',

  // Nombre del bucket en Supabase Storage (créalo como privado)
  storageBucket: 'vacaciones-pdfs',
};

// URL base de la aplicación (para los magic links de Supabase Auth)
// En desarrollo: http://localhost:3000
// En producción: https://tu-proyecto.netlify.app
const APP_URL = window.location.origin;

// Roles de usuario — se almacenan en la tabla user_profiles
const ROLES = {
  EMPLEADO: 'empleado',
  JEFE_1:   'jefe_1',
  JEFE_2:   'jefe_2',
  ADMIN:    'admin',
};

// Estados posibles de una solicitud
const ESTADOS = {
  BORRADOR:         'borrador',
  PENDIENTE_JEFE1:  'pendiente_jefe1',
  PENDIENTE_JEFE2:  'pendiente_jefe2',
  APROBADA:         'aprobada',
  RECHAZADA:        'rechazada',
};
