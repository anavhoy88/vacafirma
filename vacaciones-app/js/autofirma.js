// ═══════════════════════════════════════════════════════════════
// autofirma.js — Integración con AutoFirma 1.9 (FNMT/MINHAP)
//
// AutoFirma 1.9 usa WebSockets en wss://127.0.0.1:8080
// Protocolo: mensajes JSON con operaciones sign/cosign
// ═══════════════════════════════════════════════════════════════

const AUTOFIRMA = {
  // AutoFirma 1.9 usa WebSocket seguro en el puerto 8080
  WS_URL:       'wss://127.0.0.1:8080/afirma',
  // Timeout en ms para cada operación de firma
  TIMEOUT:      60000,
  // URL de descarga
  DOWNLOAD_URL: 'https://firmaelectronica.gob.es/Home/Descargas.html',
  // ID de transacción incremental
  _txId: 0,
  nextTxId() { return ++this._txId; },
};

// ── API PÚBLICA ───────────────────────────────────────────────

/**
 * Firma un PDF con AutoFirma 1.9 (primera firma — empleado).
 * @param {Uint8Array} pdfBytes
 * @param {Object}     opciones  { rol, solicitudId }
 * @returns {Promise<{pdfFirmado: Uint8Array, certInfo: Object}>}
 */
async function firmarConAutofirma(pdfBytes, opciones = {}) {
  const { rol = 'empleado', solicitudId = 'nuevo' } = opciones;

  const mensaje = {
    operation:   'sign',
    algorithm:   'SHA512withRSA',
    format:      'PAdES',
    data:        uint8ArrayToBase64(pdfBytes),
    extraParams: buildExtraParams(rol, solicitudId),
  };

  const resultado = await enviarMensajeWS(mensaje);
  return {
    pdfFirmado: base64ToUint8Array(resultado.data),
    certInfo:   { raw: resultado.cert || '', ts: new Date().toISOString() },
  };
}

/**
 * Co-firma un PDF ya firmado (jefe 1 o jefe 2).
 */
async function cofirmarConAutofirma(pdfBytes, opciones = {}) {
  const { rol = 'jefe_1', solicitudId = '' } = opciones;

  const mensaje = {
    operation:   'cosign',
    algorithm:   'SHA512withRSA',
    format:      'PAdES',
    data:        uint8ArrayToBase64(pdfBytes),
    extraParams: buildExtraParams(rol, solicitudId),
  };

  const resultado = await enviarMensajeWS(mensaje);
  return {
    pdfFirmado: base64ToUint8Array(resultado.data),
    certInfo:   { raw: resultado.cert || '', ts: new Date().toISOString() },
  };
}

/**
 * Comprueba si AutoFirma está activo intentando abrir el WebSocket.
 */
async function checkAutofirma() {
  return new Promise((resolve) => {
    try {
      const ws = new WebSocket(AUTOFIRMA.WS_URL);
      const timer = setTimeout(() => { ws.close(); resolve(false); }, 3000);
      ws.onopen  = () => { clearTimeout(timer); ws.close(); resolve(true); };
      ws.onerror = () => { clearTimeout(timer); resolve(false); };
    } catch {
      resolve(false);
    }
  });
}

/** Intenta abrir AutoFirma vía protocolo afirma:// */
function intentarAbrirAutofirma() {
  window.location.href = 'afirma://service';
}

// ── NÚCLEO: COMUNICACIÓN WEBSOCKET ────────────────────────────

/**
 * Abre el WebSocket con AutoFirma 1.9, envía el mensaje y espera respuesta.
 */
function enviarMensajeWS(mensaje) {
  return new Promise((resolve, reject) => {
    let ws;
    const txId    = AUTOFIRMA.nextTxId();
    const payload = JSON.stringify({ ...mensaje, id: txId });

    // Timeout global de la operación
    const timer = setTimeout(() => {
      ws && ws.close();
      reject(new AutofirmaError('Tiempo de espera agotado. Inténtalo de nuevo.', 'TIMEOUT'));
    }, AUTOFIRMA.TIMEOUT);

    try {
      ws = new WebSocket(AUTOFIRMA.WS_URL);
    } catch (e) {
      clearTimeout(timer);
      reject(new AutofirmaError('No se pudo conectar con AutoFirma: ' + e.message, 'NOT_RUNNING'));
      return;
    }

    ws.onopen = () => {
      // Una vez abierto el WebSocket, enviamos el mensaje de firma
      ws.send(payload);
    };

    ws.onmessage = (event) => {
      clearTimeout(timer);
      ws.close();

      let respuesta;
      try {
        respuesta = JSON.parse(event.data);
      } catch {
        reject(new AutofirmaError('Respuesta inválida de AutoFirma.', 'PARSE_ERROR'));
        return;
      }

      // AutoFirma devuelve error en el campo "error" o "result" === "CANCEL"
      if (respuesta.result === 'CANCEL' || respuesta.cancelled) {
        reject(new AutofirmaError('Firma cancelada por el usuario.', 'CANCELLED'));
        return;
      }

      if (respuesta.error || respuesta.result === 'ERROR') {
        const msg = respuesta.errorMessage || respuesta.error || 'Error desconocido';
        reject(new AutofirmaError('AutoFirma devolvió error: ' + msg, 'API_ERROR'));
        return;
      }

      if (!respuesta.data) {
        reject(new AutofirmaError('AutoFirma no devolvió el documento firmado.', 'EMPTY_RESPONSE'));
        return;
      }

      resolve(respuesta);
    };

    ws.onerror = (event) => {
      clearTimeout(timer);
      // Si el WS no puede conectar, AutoFirma no está corriendo
      reject(new AutofirmaError(
        'AutoFirma no está en ejecución o no está accesible.',
        'NOT_RUNNING'
      ));
    };

    ws.onclose = (event) => {
      // Si se cierra sin haber resuelto/rechazado, fue una desconexión inesperada
      clearTimeout(timer);
    };
  });
}

// ── HELPERS ──────────────────────────────────────────────────

function buildExtraParams(rol, solicitudId) {
  const posX = obtenerPosicionX(rol);
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
    this.name = 'AutofirmaError';
    this.code = code;
  }
}
