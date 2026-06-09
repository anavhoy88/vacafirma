// autofirma.js — Integracion con AutoFirma usando autoscript.js
// autoscript.js debe estar cargado antes que este fichero en index.html

var AUTOFIRMA = {
  DOWNLOAD_URL: 'https://firmaelectronica.gob.es/Home/Descargas.html',
  TIMEOUT: 120000
};

function firmarConAutofirma(pdfBytes, opciones) {
  opciones = opciones || {};
  var rol = opciones.rol || 'empleado';
  var solicitudId = opciones.solicitudId || 'nuevo';

  if (typeof AutoScript === 'undefined') {
    return Promise.reject(new AutofirmaError('autoscript.js no esta cargado.', 'LOAD_ERROR'));
  }

  AutoScript.cargarAppAfirma(window.location.origin);

  var pdfBase64 = uint8ArrayToBase64(pdfBytes);
  var extraParams = buildExtraParams(rol, solicitudId);

  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
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
          certInfo: { raw: certB64 || '', ts: new Date().toISOString() }
        });
      },
      function(errorType, errorMessage) {
        clearTimeout(timer);
        if (errorType && errorType.indexOf('Cancel') !== -1) {
          reject(new AutofirmaError('Firma cancelada.', 'CANCELLED'));
        } else {
          reject(new AutofirmaError(errorMessage || errorType || 'Error desconocido', 'API_ERROR'));
        }
      }
    );
  });
}

function cofirmarConAutofirma(pdfBytes, opciones) {
  opciones = opciones || {};
  var rol = opciones.rol || 'jefe_1';
  var solicitudId = opciones.solicitudId || '';

  if (typeof AutoScript === 'undefined') {
    return Promise.reject(new AutofirmaError('autoscript.js no esta cargado.', 'LOAD_ERROR'));
  }

  AutoScript.cargarAppAfirma(window.location.origin);

  var pdfBase64 = uint8ArrayToBase64(pdfBytes);
  var extraParams = buildExtraParams(rol, solicitudId);

  return new Promise(function(resolve, reject) {
    var timer = setTimeout(function() {
      reject(new AutofirmaError('Tiempo de espera agotado.', 'TIMEOUT'));
    }, AUTOFIRMA.TIMEOUT);

    AutoScript.coSign(
      pdfBase64,
      null,
      'SHA512withRSA',
      'PAdES',
      extraParams,
      function(signatureB64, certB64) {
        clearTimeout(timer);
        resolve({
          pdfFirmado: base64ToUint8Array(signatureB64),
          certInfo: { raw: certB64 || '', ts: new Date().toISOString() }
        });
      },
      function(errorType, errorMessage) {
        clearTimeout(timer);
        if (errorType && errorType.indexOf('Cancel') !== -1) {
          reject(new AutofirmaError('Firma cancelada.', 'CANCELLED'));
        } else {
          reject(new AutofirmaError(errorMessage || errorType || 'Error desconocido', 'API_ERROR'));
        }
      }
    );
  });
}

function checkAutofirma() {
  return Promise.resolve(typeof AutoScript !== 'undefined');
}

function intentarAbrirAutofirma() {
  window.location.href = 'afirma://service';
}

function buildExtraParams(rol, solicitudId) {
  var posX = { 'empleado': 52, 'jefe_1': 249, 'jefe_2': 446 }[rol] || 52;
  return [
    'signingCertificateV2=true',
    'signatureReason=Solicitud de vacaciones - ' + rol,
    'signatureContactInfo=VacaFirma - ' + solicitudId,
    'signaturePage=last',
    'signaturePositionOnPageLowerLeftX=' + posX,
    'signaturePositionOnPageLowerLeftY=95',
    'signaturePositionOnPageUpperRightX=' + (posX + 160),
    'signaturePositionOnPageUpperRightY=165'
  ].join('\n');
}

function uint8ArrayToBase64(bytes) {
  var binary = '';
  var chunk = 8192;
  for (var i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64) {
  var clean = base64.replace(/\s/g, '');
  var binary = atob(clean);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function AutofirmaError(message, code) {
  this.name = 'AutofirmaError';
  this.message = message;
  this.code = code;
}
AutofirmaError.prototype = Object.create(Error.prototype);
