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
  // Inicializa AutoScript con el origen de la página actual
  AutoScript.cargarAppAfirma(window.location.origin);
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
  // Coordenadas medidas directamente del PDF generado (puntos PDF, origen abajo-izq)
  // Cuadros de firma: Empleado x=58-207, Jefe1 x=223-372, Jefe2 x=388-537, Y=322-382
  // Coordenadas medidas del PDF (origen abajo-izquierda).
  // AutoFirma aplica un offset de ~102 pts (alto del encabezado) por lo que
  // se suman 102 a lly/ury para que la firma caiga en el cuadro correcto.
  var coords = {
    'empleado': { llx: 58,  lly: 424, urx: 207, ury: 484 },
    'jefe_1':   { llx: 223, lly: 424, urx: 372, ury: 484 },
    'jefe_2':   { llx: 388, lly: 424, urx: 537, ury: 484 }
  };
  var c = coords[rol] || coords['empleado'];
  return [
    'signingCertificateV2=true',
    'signatureReason=Solicitud de vacaciones - ' + rol,
    'signatureContactInfo=VacaFirma - ' + solicitudId,
    'signaturePage=last',
    'signaturePositionOnPageLowerLeftX=' + c.llx,
    'signaturePositionOnPageLowerLeftY=' + c.lly,
    'signaturePositionOnPageUpperRightX=' + c.urx,
    'signaturePositionOnPageUpperRightY=' + c.ury
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
