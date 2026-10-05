// ═══════════════════════════════════════════════════════════════
// config.js — VacaFirma 2.0
// ═══════════════════════════════════════════════════════════════

// Exponer en window para que supabase-client.js los lea
window.SUPABASE_URL      = 'https://zqzmmnvkerwtnuwlvvmx.supabase.co';
window.SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpxem1tbnZrZXJ3dG51d2x2dm14Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDI0MzcsImV4cCI6MjA5NjIxODQzN30.g38bxkGiY0XDAD7WQpMP6n-JZ0UGqzzJIe1MgMo6JZs';

// Nombre del bucket en Supabase Storage (privado)
// NOTA: el schema.sql crea el bucket 'permisos'.
// Si ya tenías 'vacaciones-pdfs' y quieres conservarlo,
// cambia esta línea y ajusta el nombre en supabase-client.js también.
window.STORAGE_BUCKET = 'permisos';
