# VacaFirma 🖊

Sistema web de solicitud de vacaciones con firma digital cualificada (AutoFirma + DNIe/certificado digital).

---

## Arquitectura

```
Empleado → Rellena formulario web → Genera PDF (pdf-lib)
→ Firma con AutoFirma (PAdES/PKCS#7) → PDF sube a Supabase Storage
→ Jefe 1 co-firma → Jefe 2 co-firma → PDF con 3 firmas cualificadas
```

**Stack:**
- Frontend: HTML + CSS + JS vanilla (sin frameworks)
- Generación PDF: pdf-lib
- Firma digital: AutoFirma (FNMT/MINHAP)
- Auth: Supabase Auth (magic link por email)
- Base de datos: Supabase PostgreSQL
- Storage: Supabase Storage (bucket privado)
- Hosting: Netlify

---

## 🚀 Guía de despliegue paso a paso

### PASO 1 — Crear el proyecto en Supabase

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta / proyecto nuevo.
2. Anota tu **Project URL** y tu **anon/public key** (en Settings → API).

### PASO 2 — Configurar la base de datos

1. En Supabase Dashboard → **SQL Editor** → New Query.
2. Copia el contenido de `sql/schema.sql` y ejecútalo.
3. Comprueba que se han creado las tablas `user_profiles` y `solicitudes_vacaciones`.

### PASO 3 — Crear el bucket de Storage

1. En Supabase Dashboard → **Storage** → New Bucket.
2. Nombre: `vacaciones-pdfs` (exactamente así).
3. Tipo: **Private** (sin acceso público).
4. Las políticas RLS del SQL ya se aplican automáticamente.

### PASO 4 — Configurar AutoFirma en Supabase Auth

1. En Supabase → Authentication → **URL Configuration**.
2. Site URL: `https://tu-proyecto.netlify.app`
3. Redirect URLs: añade `https://tu-proyecto.netlify.app`

### PASO 5 — Editar js/config.js

```javascript
const SUPABASE_CONFIG = {
  url:           'https://TU_PROJECT_ID.supabase.co',  // ← tu URL real
  anonKey:       'TU_ANON_KEY_AQUI',                   // ← tu key real
  storageBucket: 'vacaciones-pdfs',
};
```

### PASO 6 — Subir a GitHub

```bash
git init
git add .
git commit -m "Initial commit — VacaFirma"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/vacafirma.git
git push -u origin main
```

### PASO 7 — Desplegar en Netlify

1. Ve a [netlify.com](https://netlify.com) → Add new site → Import from Git.
2. Conecta tu repositorio de GitHub.
3. **Build settings:**
   - Build command: *(vacío)*
   - Publish directory: `.`
4. Deploy site.

### PASO 8 — Asignar roles a los usuarios

Una vez los jefes se hayan registrado (magic link), asígnales su rol:

```sql
-- En Supabase SQL Editor:
UPDATE public.user_profiles
SET rol = 'jefe_1', nombre_completo = 'Nombre del Jefe 1'
WHERE email = 'jefe1@organismo.es';

UPDATE public.user_profiles
SET rol = 'jefe_2', nombre_completo = 'Nombre del Jefe 2'
WHERE email = 'jefe2@organismo.es';
```

---

## 📋 Flujo de uso

### Empleado
1. Accede con magic link (correo institucional).
2. Pulsa **"+ Nueva solicitud"**.
3. Rellena: fecha inicio, fecha fin, dirección.
4. Pulsa **"Generar PDF y firmar con AutoFirma"**.
5. AutoFirma se abre → selecciona tu DNIe/certificado → confirma.
6. Pulsa **"Enviar solicitud firmada"** → el PDF firmado sube a Supabase.

### Jefe 1
1. Accede con magic link.
2. Ve la solicitud en la tabla con estado "Pte. Jefe 1".
3. Pulsa **"Firmar"** → AutoFirma añade su co-firma al PDF.
4. Estado pasa a "Pte. Jefe 2".

### Jefe 2
1. Ídem — añade la tercera firma.
2. Estado pasa a **"Aprobada"**.
3. El PDF en Supabase Storage tiene 3 firmas PAdES cualificadas.

---

## 🔒 Requisitos para los firmantes

- **AutoFirma** instalado: https://firmaelectronica.gob.es/Home/Descargas.html
- **DNIe** o certificado digital (FNMT, AC CAMERFIRMA, etc.) en un lector o el navegador.
- Navegador moderno (Chrome 90+, Firefox 90+, Edge 90+).
- En algunos equipos, instalar también el **componente de extensión** de AutoFirma para el navegador.

---

## 📁 Estructura del proyecto

```
vacaciones-app/
├── index.html          ← Aplicación principal
├── netlify.toml        ← Config de Netlify (headers de seguridad, redirects)
├── css/
│   └── style.css       ← Todos los estilos
├── js/
│   ├── config.js       ← Configuración Supabase (editar antes de desplegar)
│   ├── supabase-client.js  ← Auth, CRUD y Storage
│   ├── pdf-generator.js    ← Generación del PDF con pdf-lib
│   ├── autofirma.js        ← Integración con AutoFirma
│   └── app.js              ← Controlador principal de la UI
└── sql/
    └── schema.sql      ← Tablas, RLS, triggers de Supabase
```

---

## ⚠️ Notas importantes

### Sobre AutoFirma y HTTPS
AutoFirma expone un servidor local en `https://127.0.0.1:51234`. Para que el navegador permita llamadas a ese endpoint, la app debe estar en HTTPS (Netlify lo hace por defecto) **y** el usuario debe haber aceptado el certificado autofirmado de AutoFirma la primera vez que lo usa.

### Sobre la validez legal
Las firmas generadas son **PAdES (PDF Advanced Electronic Signatures)** con certificados reconocidos por la Administración española. Tienen plena validez legal según el **Reglamento eIDAS** y la **Ley 39/2015**.

### Limitación del preview de PDF
La previsualización en app usa un placeholder por simplicidad. Para renderizado real de PDF en navegador, integra **pdf.js** de Mozilla.

---

## 🛠️ Próximas mejoras posibles

- [ ] Notificaciones por email cuando una solicitud pasa a la siguiente fase (Supabase Edge Functions)
- [ ] Panel de administrador para gestionar roles de usuarios
- [ ] Exportación de solicitudes a Excel
- [ ] Integración con pdf.js para previsualización real en el navegador
- [ ] Verificación del certificado en servidor (Supabase Edge Function + validación OCSP)
