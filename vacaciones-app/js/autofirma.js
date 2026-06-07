// ═══════════════════════════════════════════════════════════════
// autofirma.js — Integración con AutoFirma usando autoscript.js oficial
//
// La integración correcta con AutoFirma 1.9 se hace a través de
// autoscript.js (librería oficial del MINHAP/FNMT), que gestiona
// internamente el puerto aleatorio y el protocolo WebSocket.
//
// autoscript.js se carga dinámicamente desde la CDN oficial.
// ═══════════════════════════════════════════════════════════════

const AUTOFIRMA = {
  // URL de descarga de AutoFirma
  DOWNLOAD_URL: 'https://firmaelectronica.gob.es/Home/Descargas.html',
  // URL oficial de autoscript.js (librería de integración del Gobierno)
  AUTOSCRIPT_URL: 'https://administracionelectronica.gob.es/ctt/resources/Soluciones/138/descargas/autoscript.js',
  // Timeout en ms
  TIMEOUT: 60000,
};

// ── CARGA DINÁMICA DE AUTOSCRIPT.JS ───────────────────────────

let autoscriptCargado = false;

function cargarAutoscript() {
  return new Promise((resolve, reject) => {
    if (autoscriptCargado && typeof AutoScript !== 'undefined') {
      resolve();
      return;
    }

    // Intentar con la URL oficial
    const script = document.createElement('script');
    script.src = AUTOFIRMA.AUTOSCRIPT_URL;
    script.onload = () => {
      autoscriptCargado = true;
      resolve();
    };
    script.onerror = () => {
      // Fallback: cargar desde CDN alternativa del CTT
      const script2 = document.createElement('script');
      script2.src = 'https://sede.carm.es/cryptoApplet/ayuda/recursos/autoscript.js';
      script2.onload = () => { autoscriptCargado = true; resolve(); };
      script2.onerror = () => reject(new AutofirmaError(
        'No se pudo cargar la librería de AutoFirma. Comprueba tu conexión.',
        'LOAD_ERROR'
      ));
      document.head.appendChild(script2);
    };
    document.head.appendChild(script);
  });
}

// ── API PÚBLICA ───────────────────────────────────────────────

/**
 * Firma un PDF con AutoFirma (primera firma — empleado).
 * @param {Uint8Array} pdfBytes
 * @param {Object}     opciones  { rol, solicitudId }
 * @returns {Promise<{pdfFirmado: Uint8Array, certInfo: Object}>}
 */
async function firmarConAutofirma(pdfBytes, opciones = {}) {
  const { rol = 'empleado', solicitudId = 'nuevo' } = opciones;

  await cargarAutoscript();

  const pdfBase64 = uint8ArrayToBase64(pdfBytes);
  const extraParams = buildExtraParams(rol, solicitudId);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AutofirmaError('Tiempo de espera agotado. Inténtalo de nuevo.', 'TIMEOUT'));
    }, AUTOFIRMA.TIMEOUT);

    try {
      AutoScript.sign(
        pdfBase64,           // Datos en base64
        'SHA512withRSA',     // Algoritmo
        'PAdES',             // Formato de firma
        extraParams,         // Parámetros adicionales
        // Callback de éxito
        function(signatureB64, certB64) {
          clearTimeout(timer);
          resolve({
            pdfFirmado: base64ToUint8Array(signatureB64),
            certInfo:   { raw: certB64 || '', ts: new Date().toISOString() },
          });
        },
        // Callback de error
        function(errorType, errorMessage) {
          clearTimeout(timer);
          if (errorType === 'es.gob.afirma.core.AOCancelledOperationException' ||
              errorMessage?.toLowerCase().includes('cancel')) {
            reject(new AutofirmaError('Firma cancelada por el usuario.', 'CANCELLED'));
          } else {
            reject(new AutofirmaError(
              `Error de AutoFirma [${errorType}]: ${errorMessage}`,
              'API_ERROR'
            ));
          }
        }
      );
    } catch (e) {
      clearTimeout(timer);
      reject(new AutofirmaError('Error al invocar AutoFirma: ' + e.message, 'INVOKE_ERROR'));
    }
  });
}

/**
 * Co-firma un PDF ya firmado (jefe 1 o jefe 2).
 */
async function cofirmarConAutofirma(pdfBytes, opciones = {}) {
  const { rol = 'jefe_1', solicitudId = '' } = opciones;

  await cargarAutoscript();

  const pdfBase64 = uint8ArrayToBase64(pdfBytes);
  const extraParams = buildExtraParams(rol, solicitudId);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AutofirmaError('Tiempo de espera agotado.', 'TIMEOUT'));
    }, AUTOFIRMA.TIMEOUT);

    try {
      AutoScript.coSign(
        pdfBase64,
        'SHA512withRSA',
        'PAdES',
        extraParams,
        function(signatureB64, certB64) {
          clearTimeout(timer);
          resolve({
            pdfFirmado: base64ToUint8Array(signatureB64),
            certInfo:   { raw: certB64 || '', ts: new Date().toISOString() },
          });
        },
        function(errorType, errorMessage) {
          clearTimeout(timer);
          if (errorType?.includes('Cancel') || errorMessage?.toLowerCase().includes('cancel')) {
            reject(new AutofirmaError('Firma cancelada.', 'CANCELLED'));
          } else {
            reject(new AutofirmaError(
              `Error [${errorType}]: ${errorMessage}`,
              'API_ERROR'
            ));
          }
        }
      );
    } catch (e) {
      clearTimeout(timer);
      reject(new AutofirmaError('Error al invocar AutoFirma: ' + e.message, 'INVOKE_ERROR'));
    }
  });
}

/**
 * Comprueba si AutoFirma está disponible en el sistema.
 * Con autoscript.js esto se gestiona automáticamente.
 */
async function checkAutofirma() {
  try {
    await cargarAutoscript();
    return typeof AutoScript !== 'undefined';
  } catch {
    return false;
  }
}

/** Intenta abrir AutoFirma vía protocolo afirma:// */
function intentarAbrirAutofirma() {
  window.location.href = 'afirma://service';
}

// ── HELPERS ──────────────────────────────────────────────────

function buildExtraParams(rol, solicitudId) {
  const posX = obtenerPosicionX(rol);
  // Formato requerido por autoscript.js: pares clave=valor separados por \n
  return [
    'signingCertificateV2=true',
    `signatureReason=Solicitud de vacaciones - ${rol}`,
    `signatureContactInfo=VacaFirma - ${solicitudId}`,
    'signaturePage=last',
    `signaturePositionOnPageLowerLeftX=${posX}`,
    'signaturePositionOnPageLowerLeftY=95',
    `signaturePositionOnPageUpperRightX=${posX + 160}`,
    'signaturePositionOnPageUpperRightY=165',
  ].join('\n');
}

function obtenerPosicionX(rol) {
  return { 'empleado': 52, 'jefe_1': 249, 'jefe_2': 446 }[rol] || 52;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

class AutofirmaError extends Error {
  constructor(message, code) {
    super(message);
    this.name  = 'AutofirmaError';
    this.code  = code;
  }
}
