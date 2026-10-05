// ═══════════════════════════════════════════════════════════════
// autofirma.js — VacaFirma 2.0
// Integración con AutoFirma usando autoscript.js v1.6.5
// ═══════════════════════════════════════════════════════════════

const AUTOFIRMA = {
  DOWNLOAD_URL: 'https://firmaelectronica.gob.es/Home/Descargas.html',
  TIMEOUT_MS:   120000,
};

let _autoscriptInicializado = false;

function inicializarAutoscript() {
  if (_autoscriptInicializado) return;
  if (typeof AutoScript === 'undefined') {
    throw new AutofirmaError('autoscript.js no está cargado.', 'LOAD_ERROR');
  }
  AutoScript.cargarAppAfirma(window.location.origin);
  _autoscriptInicializado = true;
}

// Firma PAdES invisible (sin coordenadas de posición).
// El registro visual de cada firma lo gestiona el PDF generado.
function buildExtraParams(rol, permisoId) {
  return [
    'signingCertificateV2=true',
    'signatureReason=Solicitud de permiso — ' + rol,
    'signatureContactInfo=VacaFirma — ' + permisoId,
    'signaturePage=all',
  ].join('\n');
}

// ── FIRMA INICIAL (empleado) ──────────────────────────────────

async function firmarConAutofirma(pdfBytes, opciones) {
  const rol       = (opciones && opciones.rol)       || 'empleado';
  const permisoId = (opciones && opciones.permisoId) || 'nuevo';
  inicializarAutoscript();

  const pdfBase64   = uint8ArrayToBase64(pdfBytes);
  const extraParams = buildExtraParams(rol, permisoId);

  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(new AutofirmaError('Tiempo de espera agotado.', 'TIMEOUT'));
    }, AUTOFIRMA.TIMEOUT_MS);

    AutoScript.sign(
      pdfBase64, 'SHA512withRSA', 'PAdES', extraParams,
      function(signatureB64, certB64) {
        clearTimeout(timer);
        resolve({ pdfFirmado: base64ToUint8Array(signatureB64), certInfo: parseCertInfo(certB64) });
      },
      function(errorType, errorMessage) {
        clearTimeout(timer);
        var msg = errorMessage || errorType || 'Error desconocido';
        if (String(errorType).indexOf('Cancel') !== -1) {
          reject(new AutofirmaError('Firma cancelada por el usuario.', 'CANCELLED'));
        } else {
          reject(new AutofirmaError(msg, 'API_ERROR'));
        }
      }
    );
  });
}

// ── COFIRMA (jefes) ───────────────────────────────────────────

async function cofirmarConAutofirma(pdfBytes, opciones) {
  var rol       = (opciones && opciones.rol)       || 'jefe_seccion';
  var permisoId = (opciones && opciones.permisoId) || '';
  inicializarAutoscript();

  var pdfBase64   = uint8ArrayToBase64(pdfBytes);
  var extraParams = buildExtraParams(rol, permisoId);

  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(new AutofirmaError('Tiempo de espera agotado.', 'TIMEOUT'));
    }, AUTOFIRMA.TIMEOUT_MS);

    AutoScript.coSign(
      pdfBase64, null, 'SHA512withRSA', 'PAdES', extraParams,
      function(signatureB64, certB64) {
        clearTimeout(timer);
        resolve({ pdfFirmado: base64ToUint8Array(signatureB64), certInfo: parseCertInfo(certB64) });
      },
      function(errorType, errorMessage) {
        clearTimeout(timer);
        var msg = errorMessage || errorType || 'Error desconocido';
        if (String(errorType).indexOf('Cancel') !== -1) {
          reject(new AutofirmaError('Firma cancelada por el usuario.', 'CANCELLED'));
        } else {
          reject(new AutofirmaError(msg, 'API_ERROR'));
        }
      }
    );
  });
}

// ── PARSEO DE CERTIFICADO ─────────────────────────────────────

function parseCertInfo(certB64) {
  if (!certB64) return { raw: '', nombre: '', dni: '', hash: '' };
  var nombre = '', dni = '', hash = '';
  try {
    var raw  = atob(certB64.replace(/\s/g, ''));
    var text = raw.replace(/[^\x20-\x7E\xC0-\xFF]/g, ' ');
    var cnMatch = text.match(/CN=([^,\x00]+)/i);
    if (cnMatch) nombre = cnMatch[1].trim().replace(/\s+/g, ' ').substring(0, 60);
    var snMatch = text.match(/SERIALNUMBER=([^,\x00]+)/i) || text.match(/2\.5\.4\.5=([^,\x00]+)/i);
    if (snMatch) dni = snMatch[1].trim().replace(/\s+/g, '').substring(0, 15);
    hash = fnvHash(certB64);
  } catch(e) {
    console.warn('[AutoFirma] No se pudo parsear el certificado:', e);
  }
  return { raw: certB64, nombre: nombre, dni: dni, hash: hash };
}

function fnvHash(str) {
  var h = 0x811c9dc5;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193)) >>> 0;
  }
  return h.toString(16).padStart(8, '0').repeat(5);
}

// ── HELPERS BASE64 ────────────────────────────────────────────

function uint8ArrayToBase64(bytes) {
  var binary = '';
  var chunk  = 8192;
  for (var i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  var clean  = base64.replace(/\s/g, '');
  var binary = atob(clean);
  var bytes  = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── ERROR ─────────────────────────────────────────────────────

function AutofirmaError(message, code) {
  this.name    = 'AutofirmaError';
  this.message = message;
  this.code    = code;
}
AutofirmaError.prototype = Object.create(Error.prototype);
