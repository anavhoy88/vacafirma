// ═══════════════════════════════════════════════════════════════
// autofirma.js — Integración con AutoFirma (FNMT/MINHAP)
//
// AutoFirma expone un servidor local en el puerto 51234 (por defecto).
// La comunicación se hace via fetch() con protocolo propio.
// Documentación oficial: https://firmaelectronica.gob.es/Home/Descargas.html
// ═══════════════════════════════════════════════════════════════

const AUTOFIRMA = {
  // Puerto por defecto del servidor local de AutoFirma
  PORT: 51234,
  // URL base del servidor AutoFirma
  get BASE_URL() { return `https://127.0.0.1:${this.PORT}`; },
  // Timeout en ms para cada llamada
  TIMEOUT: 30000,
  // URL de descarga de AutoFirma
  DOWNLOAD_URL: 'https://firmaelectronica.gob.es/Home/Descargas.html',
};

/**
 * Verifica si AutoFirma está en ejecución en el equipo local.
 * @returns {Promise<boolean>}
 */
async function checkAutofirma() {
  try {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000);

    const res = await fetch(`${AUTOFIRMA.BASE_URL}/service/version`, {
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Firma un PDF usando AutoFirma con el certificado seleccionado por el usuario.
 *
 * El flujo es:
 * 1. Convierte el PDF a base64
 * 2. Llama a AutoFirma via su API REST local
 * 3. Devuelve el PDF firmado en PAdES (PDF Advanced Electronic Signature)
 *
 * @param {Uint8Array} pdfBytes - Bytes del PDF a firmar
 * @param {Object}     opciones
 * @param {string}     opciones.rol       - 'empleado' | 'jefe_1' | 'jefe_2'
 * @param {string}     opciones.solicitudId - UUID de la solicitud
 * @returns {Promise<{pdfFirmado: Uint8Array, certificadoInfo: Object}>}
 */
async function firmarConAutofirma(pdfBytes, opciones = {}) {
  const { rol = 'empleado', solicitudId = '' } = opciones;

  // 1. Verificar que AutoFirma está activo
  const activo = await checkAutofirma();
  if (!activo) {
    throw new AutofirmaError(
      'AutoFirma no está en ejecución. Ábrelo desde el menú de inicio o descárgalo.',
      'NOT_RUNNING'
    );
  }

  // 2. Convertir PDF a base64
  const pdfBase64 = uint8ArrayToBase64(pdfBytes);

  // 3. Construir el payload para AutoFirma
  // Usamos firma PAdES (embebida en PDF), formato BES (Basic Electronic Signature)
  const payload = {
    data:      pdfBase64,
    algorithm: 'SHA512withRSA',   // Recomendado para certificados modernos
    format:    'PAdES',            // PDF Advanced Electronic Signature
    extraParams: [
      // Visibilidad de la firma en el PDF
      'signingCertificateV2=true',
      `signatureReason=Solicitud de vacaciones - ${rol}`,
      `signatureContactInfo=VacaFirma - ${solicitudId}`,
      'signaturePage=last',
      // Posición del sello visible en el PDF (esquina inferior izquierda de la columna correspondiente)
      `signaturePositionOnPageLowerLeftX=${obtenerPosicionX(rol)}`,
      `signaturePositionOnPageLowerLeftY=95`,
      `signaturePositionOnPageUpperRightX=${obtenerPosicionX(rol) + 160}`,
      `signaturePositionOnPageUpperRightY=165`,
    ].join('\n'),
  };

  // 4. Llamar a AutoFirma
  let response;
  try {
    response = await fetchConTimeout(
      `${AUTOFIRMA.BASE_URL}/service/sign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      AUTOFIRMA.TIMEOUT
    );
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AutofirmaError('La operación de firma ha tardado demasiado. Inténtalo de nuevo.', 'TIMEOUT');
    }
    throw new AutofirmaError('Error de comunicación con AutoFirma: ' + err.message, 'NETWORK');
  }

  if (!response.ok) {
    const texto = await response.text().catch(() => 'Sin detalles');
    if (response.status === 0 || texto.includes('cancel')) {
      throw new AutofirmaError('El usuario ha cancelado la firma.', 'CANCELLED');
    }
    throw new AutofirmaError(`AutoFirma devolvió error ${response.status}: ${texto}`, 'API_ERROR');
  }

  // 5. Procesar respuesta
  const resultado = await response.json();

  if (!resultado.data) {
    throw new AutofirmaError('AutoFirma no devolvió el documento firmado.', 'EMPTY_RESPONSE');
  }

  const pdfFirmado = base64ToUint8Array(resultado.data);

  // 6. Extraer información básica del certificado usado
  const certInfo = extraerInfoCertificado(resultado.cert || null);

  return { pdfFirmado, certInfo };
}

/**
 * Añade una firma adicional (co-firma) a un PDF ya firmado.
 * Equivalente a firmarConAutofirma pero usando el endpoint /cosign.
 */
async function cofirmarConAutofirma(pdfFirmadoBytes, opciones = {}) {
  const { rol = 'jefe_1', solicitudId = '' } = opciones;

  const activo = await checkAutofirma();
  if (!activo) {
    throw new AutofirmaError('AutoFirma no está en ejecución.', 'NOT_RUNNING');
  }

  const pdfBase64 = uint8ArrayToBase64(pdfFirmadoBytes);

  const payload = {
    data:      pdfBase64,
    algorithm: 'SHA512withRSA',
    format:    'PAdES',
    extraParams: [
      'signingCertificateV2=true',
      `signatureReason=Aprobación de vacaciones - ${rol}`,
      `signatureContactInfo=VacaFirma - ${solicitudId}`,
      'signaturePage=last',
      `signaturePositionOnPageLowerLeftX=${obtenerPosicionX(rol)}`,
      `signaturePositionOnPageLowerLeftY=95`,
      `signaturePositionOnPageUpperRightX=${obtenerPosicionX(rol) + 160}`,
      `signaturePositionOnPageUpperRightY=165`,
    ].join('\n'),
  };

  let response;
  try {
    response = await fetchConTimeout(
      `${AUTOFIRMA.BASE_URL}/service/cosign`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      AUTOFIRMA.TIMEOUT
    );
  } catch (err) {
    throw new AutofirmaError('Error de comunicación con AutoFirma: ' + err.message, 'NETWORK');
  }

  if (!response.ok) {
    const texto = await response.text().catch(() => '');
    if (texto.includes('cancel')) throw new AutofirmaError('Firma cancelada.', 'CANCELLED');
    throw new AutofirmaError(`Error ${response.status}`, 'API_ERROR');
  }

  const resultado = await response.json();
  if (!resultado.data) throw new AutofirmaError('Respuesta vacía de AutoFirma.', 'EMPTY_RESPONSE');

  const pdfFirmado = base64ToUint8Array(resultado.data);
  const certInfo   = extraerInfoCertificado(resultado.cert || null);

  return { pdfFirmado, certInfo };
}

// ── HELPERS ──────────────────────────────────────────────────

// Posición X del sello de firma según el rol (3 columnas en el PDF)
function obtenerPosicionX(rol) {
  const posiciones = {
    'empleado': 52,
    'jefe_1':   249,
    'jefe_2':   446,
  };
  return posiciones[rol] || 52;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes   = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function extraerInfoCertificado(certBase64) {
  if (!certBase64) return { nombre: 'Desconocido', nif: '' };
  // En producción real se usaría pkijs/asn1js para parsear el certificado X.509
  // Aquí devolvemos la info cruda para que el servidor la valide
  return {
    raw:    certBase64,
    nombre: 'Obtenido de certificado',
    ts:     new Date().toISOString(),
  };
}

async function fetchConTimeout(url, opciones, ms) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

// Error personalizado de AutoFirma
class AutofirmaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AutofirmaError';
    this.code = code;
  }
}

// Intenta abrir AutoFirma via protocolo afirma://
function intentarAbrirAutofirma() {
  window.location.href = 'afirma://service';
  // Si no funciona, el usuario verá el botón de descarga
}
