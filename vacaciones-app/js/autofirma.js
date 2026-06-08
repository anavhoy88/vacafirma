// ═══════════════════════════════════════════════════════════════
// autofirma.js — Integración con AutoFirma usando autoscript.js
//
// autoscript.js debe estar cargado antes que este fichero.
// Se inicializa con cargarAppAfirma() antes de firmar.
// ═══════════════════════════════════════════════════════════════

const AUTOFIRMA = {
  DOWNLOAD_URL: 'https://firmaelectronica.gob.es/Home/Descargas.html',
  TIMEOUT: 120000,
};

// ── INICIALIZACIÓN ────────────────────────────────────────────

let _autoscriptInicializado = false;

function inicializarAutoscript() {
  if (_autoscriptInicializado) return;
  if (typeof AutoScript === 'undefined') {
    throw new AutofirmaError('autoscript.js no está cargado.', 'LOAD_ERROR');
  }
  // Inicializa AutoScript sin applet (usa la app nativa instalada)
  AutoScript.cargarAppAfirma('');
  _autoscriptInicializado = true;
}

// ── API PÚBLICA ───────────────────────────────────────────────

async function firmarConAutofirma(pdfBytes, opciones = {}) {
  const { rol = 'empleado', solicitudId = 'nuevo' } = opciones;

  inicializarAutoscript();

  const pdfBase64    = uint8ArrayToBase64(pdfBytes);
  const extraParams  = buildExtraParams(rol, solicitudId);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AutofirmaError('Tiempo de espera agotado.', 'TIMEOUT'));
    }, AUTOFIRMA.TIMEOUT);

    AutoScript.sign(
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
        if (errorType && errorType.indexOf('Cancel') !== -1) {
          reject(new AutofirmaError('Firma cancelada.', 'CANCELLED'));
        } else {
          reject(new AutofirmaError(
            (errorMessage || errorType || 'Error desconocido'),
            'API_ERROR'
          ));
        }
      }
    );
  });
}

async function cofirmarConAutofirma(pdfBytes, opciones = {}) {
  const { rol = 'jefe_1', solicitudId = '' } = opciones;

  inicializarAutoscript();

  const pdfBase64   = uint8ArrayToBase64(pdfBytes);
  const extraParams = buildExtraParams(rol, solicitudId);

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AutofirmaError('Tiempo de espera agotado.', 'TIMEOUT'));
    }, AUTOFIRMA.TIMEOUT);

    AutoScript.coSign(
      pdfBase64,
      null,           // datos originales — null para PAdES (ya están en el PDF)
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
        if (errorType && errorType.indexOf('Cancel') !== -1) {
          reject(new AutofirmaError('Firma cancelada.', 'CANCELLED'));
        } else {
          reject(new AutofirmaError(
            (errorMessage || errorType || 'Error desconocido'),
            'API_ERROR'
          ));
        }
      }
    );
  });
}

async function checkAutofirma() {
  return typeof AutoScript !== 'undefined';
}

function intentarAbrirAutofirma() {
  window.location.href = 'afirma://service';
}

// ── HELPERS ──────────────────────────────────────────────────

function buildExtraParams(rol, solicitudId) {
  const posX = { 'empleado': 52, 'jefe_1': 249, 'jefe_2': 446 }[rol] || 52;
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

function uint8ArrayToBase64(bytes) {
  let binary = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const clean  = base64.replace(/\s/g, '');
  const binary = atob(clean);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

class AutofirmaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AutofirmaError';
    this.code = code;
  }
}
