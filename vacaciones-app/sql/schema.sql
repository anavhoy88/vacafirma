-- ═══════════════════════════════════════════════════════════════
-- VacaFirma — Schema de Supabase
-- Ejecuta este SQL en: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- ── 1. PERFILES DE USUARIO ────────────────────────────────────
-- Extiende auth.users con nombre completo y rol
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id               UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_completo  TEXT NOT NULL DEFAULT '',
  email            TEXT,
  rol              TEXT NOT NULL DEFAULT 'empleado'
                     CHECK (rol IN ('empleado','jefe_1','jefe_2','admin')),
  activo           BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger: crear perfil automáticamente cuando un usuario se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, nombre_completo)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── 2. SOLICITUDES DE VACACIONES ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.solicitudes_vacaciones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empleado_nombre  TEXT NOT NULL,

  -- Datos del período
  fecha_inicio     DATE NOT NULL,
  fecha_fin        DATE NOT NULL,
  direccion        TEXT NOT NULL,
  observaciones    TEXT,

  -- Estado del flujo
  estado           TEXT NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador','pendiente_jefe1','pendiente_jefe2','aprobada','rechazada')),

  -- Firmas (booleano: ¿se ha firmado?)
  firma_empleado   BOOLEAN DEFAULT false,
  firma_jefe1      BOOLEAN DEFAULT false,
  firma_jefe2      BOOLEAN DEFAULT false,

  -- Timestamps de firma (para auditoría)
  firmado_empleado_at  TIMESTAMPTZ,
  firmado_jefe1_at     TIMESTAMPTZ,
  firmado_jefe2_at     TIMESTAMPTZ,

  -- Info del certificado (JSON con datos extraídos del X.509)
  cert_empleado    JSONB,
  cert_jefe1       JSONB,
  cert_jefe2       JSONB,

  -- Ruta del PDF en Supabase Storage
  pdf_path         TEXT,

  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Índices útiles
CREATE INDEX IF NOT EXISTS idx_solicitudes_empleado ON public.solicitudes_vacaciones(empleado_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_estado   ON public.solicitudes_vacaciones(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_fecha    ON public.solicitudes_vacaciones(fecha_inicio);

-- Trigger: actualiza updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_solicitudes_updated_at ON public.solicitudes_vacaciones;
CREATE TRIGGER trg_solicitudes_updated_at
  BEFORE UPDATE ON public.solicitudes_vacaciones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger: registra timestamp de firma cuando cambia a true
CREATE OR REPLACE FUNCTION public.registrar_timestamps_firma()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.firma_empleado = true AND OLD.firma_empleado = false THEN
    NEW.firmado_empleado_at = NOW();
  END IF;
  IF NEW.firma_jefe1 = true AND OLD.firma_jefe1 = false THEN
    NEW.firmado_jefe1_at = NOW();
  END IF;
  IF NEW.firma_jefe2 = true AND OLD.firma_jefe2 = false THEN
    NEW.firmado_jefe2_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_firma_timestamps ON public.solicitudes_vacaciones;
CREATE TRIGGER trg_firma_timestamps
  BEFORE UPDATE ON public.solicitudes_vacaciones
  FOR EACH ROW EXECUTE FUNCTION public.registrar_timestamps_firma();

-- ── 3. ROW LEVEL SECURITY (RLS) ───────────────────────────────
-- IMPORTANTE: activa RLS para proteger los datos

ALTER TABLE public.user_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solicitudes_vacaciones  ENABLE ROW LEVEL SECURITY;

-- Perfiles: cada usuario ve y edita solo el suyo
CREATE POLICY "perfil_propio_select" ON public.user_profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "perfil_propio_update" ON public.user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Solicitudes: empleado ve solo las suyas
CREATE POLICY "solicitud_empleado_select" ON public.solicitudes_vacaciones
  FOR SELECT USING (auth.uid() = empleado_id);

CREATE POLICY "solicitud_empleado_insert" ON public.solicitudes_vacaciones
  FOR INSERT WITH CHECK (auth.uid() = empleado_id);

-- Solicitudes: jefes ven todas (ajusta según tu estructura organizativa)
CREATE POLICY "solicitud_jefes_select" ON public.solicitudes_vacaciones
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND rol IN ('jefe_1', 'jefe_2', 'admin')
    )
  );

-- Jefes pueden actualizar para firmar
CREATE POLICY "solicitud_jefes_update" ON public.solicitudes_vacaciones
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid()
      AND rol IN ('jefe_1', 'jefe_2', 'admin')
    )
  );

-- Empleado puede actualizar su propia solicitud (para subir el PDF firmado)
CREATE POLICY "solicitud_empleado_update" ON public.solicitudes_vacaciones
  FOR UPDATE USING (auth.uid() = empleado_id);

-- ── 4. STORAGE — Bucket de PDFs ───────────────────────────────
-- Ejecuta esto DESPUÉS de crear el bucket "vacaciones-pdfs" en el Dashboard
-- Storage → New Bucket → nombre: "vacaciones-pdfs" → Private (sin acceso público)

-- Política: empleado puede subir su propio PDF
CREATE POLICY "storage_empleado_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'vacaciones-pdfs'
    AND auth.uid() IS NOT NULL
  );

-- Política: empleado y jefes pueden leer
CREATE POLICY "storage_autenticados_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'vacaciones-pdfs'
    AND auth.uid() IS NOT NULL
  );

-- Política: empleado y jefes pueden actualizar (co-firma)
CREATE POLICY "storage_autenticados_update" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'vacaciones-pdfs'
    AND auth.uid() IS NOT NULL
  );

-- ── 5. DATOS DE EJEMPLO (OPCIONAL) ───────────────────────────
-- Descomenta para insertar datos de prueba tras crear los usuarios

/*
-- Primero asigna roles a los usuarios (copia los UUIDs desde Authentication → Users)
UPDATE public.user_profiles
SET rol = 'jefe_1', nombre_completo = 'Juan García López'
WHERE email = 'jefe1@organismo.es';

UPDATE public.user_profiles
SET rol = 'jefe_2', nombre_completo = 'María Martínez Ruiz'
WHERE email = 'jefe2@organismo.es';

UPDATE public.user_profiles
SET nombre_completo = 'Carlos Fernández Pérez'
WHERE email = 'empleado@organismo.es';
*/
