// ═══════════════════════════════════════════════════════════════
// pdf-generator.js — VacaFirma 2.0
// Genera el PDF de solicitud de permiso fiel al modelo oficial
// del Ejército del Aire y del Espacio.
// Requiere pdf-lib cargado antes en la página.
// ═══════════════════════════════════════════════════════════════

// ── ETIQUETAS DE TIPO DE PERMISO ─────────────────────────────
const TIPO_LABELS = {
  vacaciones:              'Vacaciones',
  asuntos_particulares:    'Asuntos Particulares',
  dias_adicionales:        'Días Adicionales',
  permiso_extraordinario:  'Permiso Extraordinario',
};

// ── ETIQUETAS DE ESTADO ───────────────────────────────────────
const ESTADO_LABELS = {
  borrador:               'Borrador',
  firmada_empleado:       'Firmado por interesado',
  aprobada_jefe_seccion:  'Aprobado por Jefe de Sección',
  rechazada_jefe_seccion: 'Rechazado por Jefe de Sección',
  aprobada:               'APROBADO',
  rechazada:              'RECHAZADO',
};

// ── COLORES ───────────────────────────────────────────────────
const COL = {
  negro:     [0,   0,   0  ],
  gris:      [0.4, 0.4, 0.4],
  grisCelda: [0.95,0.95,0.95],
  grisCab:   [0.15,0.25,0.45],   // azul oscuro para cabeceras
  blanco:    [1,   1,   1  ],
  verde:     [0.1, 0.5, 0.2],
  rojo:      [0.7, 0.1, 0.1],
  amarillo:  [0.6, 0.4, 0.0],
};

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────

/**
 * Genera el PDF de solicitud de permiso.
 *
 * @param {Object} permiso  - Fila de la tabla permisos (con .empleado y .firmas)
 * @param {Array}  firmas   - Array de firmas registradas (puede estar vacío)
 * @returns {Uint8Array}    - Bytes del PDF generado
 */
async function generarPDFPermiso(permiso, firmas = []) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  // Fuentes
  const fontReg  = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // ── Helpers de dibujo ────────────────────────────────────────

  function rgb3(arr) { return rgb(arr[0], arr[1], arr[2]); }

  function rect(x, y, w, h, fill, stroke) {
    if (fill)   page.drawRectangle({ x, y, width: w, height: h, color: rgb3(fill) });
    if (stroke) page.drawRectangle({ x, y, width: w, height: h, borderColor: rgb3(stroke), borderWidth: 0.5, color: rgb(1,1,1,0) });
  }

  function txt(text, x, y, { size = 8, font = fontReg, color = COL.negro, maxWidth } = {}) {
    if (!text) return;
    const s = String(text);
    let display = s;
    if (maxWidth && font.widthOfTextAtSize(s, size) > maxWidth) {
      // Truncar con ellipsis
      let t = s;
      while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxWidth) {
        t = t.slice(0, -1);
      }
      display = t + '…';
    }
    page.drawText(display, { x, y, size, font, color: rgb3(color) });
  }

  function lineh(x1, y, x2) {
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.5, color: rgb3(COL.gris) });
  }

  function linev(x, y1, y2) {
    page.drawLine({ start: { x, y: y1 }, end: { x, y: y2 }, thickness: 0.5, color: rgb3(COL.gris) });
  }

  // ── 1. CABECERA INSTITUCIONAL ─────────────────────────────

  const TOP = height - 20;

  // Bloque organismo (derecha)
  rect(380, TOP - 50, 195, 50, COL.grisCab, null);
  txt('EJÉRCITO DEL AIRE Y DEL ESPACIO',    386, TOP - 12, { size: 7, font: fontBold, color: COL.blanco });
  txt('BASE AÉREA DE ALBACETE Y ALA 14',    386, TOP - 22, { size: 7, color: COL.blanco });
  txt('GRUPO DE FUERZAS AÉREAS',            386, TOP - 32, { size: 7, color: COL.blanco });
  txt('IG 10-99',                           386, TOP - 42, { size: 7, color: COL.blanco });
  txt('7ª Rev. 20/10/2022',                 386, TOP - 52, { size: 6, color: COL.blanco });

  // Título central
  txt('FICHA DE SOLICITUD DE PERMISOS AÑO ' + (permiso.anio || new Date().getFullYear()),
      120, TOP - 18, { size: 11, font: fontBold });

  // Datos del interesado
  const emp = permiso.empleado || {};
  rect(20, TOP - 85, 555, 32, null, COL.gris);
  txt('EMPLEO:',          25, TOP - 60, { size: 8, font: fontBold });
  txt(emp.empleo || '',   80, TOP - 60, { size: 8 });
  txt('DNI:',            260, TOP - 60, { size: 8, font: fontBold });
  txt(emp.dni || '',     285, TOP - 60, { size: 8 });

  txt('NOMBRE Y APELLIDOS:', 25, TOP - 75, { size: 8, font: fontBold });
  txt(emp.nombre_completo || '', 130, TOP - 75, { size: 8 });
  txt('DEPENDENCIA:', 260, TOP - 75, { size: 8, font: fontBold });
  txt(emp.dependencia || '', 335, TOP - 75, { size: 8 });

  // ── 2. TABLA DE DATOS DEL PERMISO ────────────────────────

  const T_TOP  = TOP - 100;   // y superior de la tabla
  const T_LEFT = 20;
  const T_W    = 555;

  // Columnas (x inicio de cada una)
  const cols = {
    inicio:    T_LEFT,          // Fecha inicio
    fin:       T_LEFT + 60,     // Fecha fin
    tipo:      T_LEFT + 120,    // Tipo de permiso
    dias:      T_LEFT + 250,    // Días hábiles
    dir:       T_LEFT + 290,    // Dirección / Teléfono
    motivo:    T_LEFT + 430,    // Motivo/Leyenda
    end:       T_LEFT + T_W,
  };

  const ROW_H = 16;

  // Cabecera de la tabla
  rect(T_LEFT, T_TOP - ROW_H, T_W, ROW_H, COL.grisCab, null);
  const cabY = T_TOP - ROW_H + 5;
  txt('FECHA INICIO',  cols.inicio  + 3, cabY, { size: 7, font: fontBold, color: COL.blanco });
  txt('FECHA FIN',     cols.fin     + 3, cabY, { size: 7, font: fontBold, color: COL.blanco });
  txt('TIPO DE PERMISO', cols.tipo  + 3, cabY, { size: 7, font: fontBold, color: COL.blanco });
  txt('DÍAS',          cols.dias    + 3, cabY, { size: 7, font: fontBold, color: COL.blanco });
  txt('DIRECCIÓN / TELÉFONO', cols.dir + 3, cabY, { size: 7, font: fontBold, color: COL.blanco });
  txt('MOTIVO',        cols.motivo  + 3, cabY, { size: 7, font: fontBold, color: COL.blanco });

  // Separadores de columna en cabecera
  [cols.fin, cols.tipo, cols.dias, cols.dir, cols.motivo, cols.end].forEach(x => {
    linev(x, T_TOP - ROW_H, T_TOP);
  });

  // Fila de datos
  const ROW_Y = T_TOP - ROW_H * 2;
  rect(T_LEFT, ROW_Y, T_W, ROW_H, COL.grisCelda, null);
  const dataY = ROW_Y + 5;

  const fInicio = formatFecha(permiso.fecha_inicio);
  const fFin    = formatFecha(permiso.fecha_fin);

  txt(fInicio,                        cols.inicio  + 3, dataY, { size: 8 });
  txt(fFin,                           cols.fin     + 3, dataY, { size: 8 });
  txt(TIPO_LABELS[permiso.tipo] || permiso.tipo,
                                      cols.tipo    + 3, dataY, { size: 8, maxWidth: 125 });
  txt(String(permiso.dias_habiles || 1), cols.dias + 3, dataY, { size: 8 });
  txt((permiso.direccion || '') + (permiso.telefono ? ' · ' + permiso.telefono : ''),
                                      cols.dir     + 3, dataY, { size: 7, maxWidth: 135 });
  txt(permiso.motivo || '',           cols.motivo  + 3, dataY, { size: 7, maxWidth: 140 });

  // Borde completo de la tabla
  lineh(T_LEFT, T_TOP, cols.end);
  lineh(T_LEFT, T_TOP - ROW_H, cols.end);
  lineh(T_LEFT, ROW_Y, cols.end);
  lineh(T_LEFT, ROW_Y - ROW_H, cols.end);  // fondo fila datos
  [cols.inicio, cols.fin, cols.tipo, cols.dias, cols.dir, cols.motivo, cols.end].forEach(x => {
    linev(x, T_TOP, ROW_Y - ROW_H + ROW_H); // ≈ T_TOP a ROW_Y
    linev(x, ROW_Y, ROW_Y - ROW_H);
  });
  // Borde exterior
  page.drawRectangle({
    x: T_LEFT, y: ROW_Y - ROW_H, width: T_W,
    height: ROW_H * 2 + ROW_H,
    borderColor: rgb3(COL.gris), borderWidth: 0.7,
    color: rgb(1,1,1,0)
  });

  // Observaciones (si hay)
  let curY = ROW_Y - ROW_H - 10;
  if (permiso.observaciones) {
    txt('Observaciones:', T_LEFT, curY, { size: 8, font: fontBold });
    txt(permiso.observaciones, T_LEFT + 80, curY, { size: 8, maxWidth: 470 });
    curY -= 18;
  }

  // Estado de la solicitud
  const estadoColor = permiso.estado === 'aprobada'  ? COL.verde
                    : permiso.estado.startsWith('rechazada') ? COL.rojo
                    : COL.amarillo;
  curY -= 5;
  rect(T_LEFT, curY - 14, T_W, 18, null, estadoColor);
  txt('Estado:', T_LEFT + 5, curY - 10, { size: 8, font: fontBold, color: estadoColor });
  txt(ESTADO_LABELS[permiso.estado] || permiso.estado,
      T_LEFT + 45, curY - 10, { size: 8, font: fontBold, color: estadoColor });

  if (permiso.motivo_rechazo) {
    curY -= 22;
    txt('Motivo de rechazo: ' + permiso.motivo_rechazo,
        T_LEFT + 5, curY, { size: 8, color: COL.rojo, maxWidth: 540 });
  }

  // ── 3. SECCIÓN DE FIRMAS ──────────────────────────────────

  curY -= 35;
  const F_TOP = curY;

  // Título sección firmas
  rect(T_LEFT, F_TOP, T_W, 16, COL.grisCab, null);
  txt('REGISTRO DE FIRMAS ELECTRÓNICAS', T_LEFT + 5, F_TOP + 5,
      { size: 8, font: fontBold, color: COL.blanco });

  curY = F_TOP - 16;

  // Cabecera columnas firmas
  const FC = {
    rol:    T_LEFT,
    nombre: T_LEFT + 90,
    dni:    T_LEFT + 260,
    fecha:  T_LEFT + 310,
    accion: T_LEFT + 410,
    end:    T_LEFT + T_W,
  };

  rect(T_LEFT, curY - 14, T_W, 14, [0.85, 0.88, 0.92], null);
  const fcabY = curY - 10;
  txt('ROL',          FC.rol    + 3, fcabY, { size: 7, font: fontBold });
  txt('NOMBRE Y APELLIDOS', FC.nombre + 3, fcabY, { size: 7, font: fontBold });
  txt('DNI',          FC.dni    + 3, fcabY, { size: 7, font: fontBold });
  txt('FECHA Y HORA', FC.fecha  + 3, fcabY, { size: 7, font: fontBold });
  txt('RESULTADO',    FC.accion + 3, fcabY, { size: 7, font: fontBold });

  [FC.nombre, FC.dni, FC.fecha, FC.accion, FC.end].forEach(x => {
    linev(x, curY, curY - 14);
  });
  lineh(T_LEFT, curY, FC.end);
  lineh(T_LEFT, curY - 14, FC.end);

  curY -= 14;

  // Filas de firmas existentes
  const rolesOrden = ['empleado', 'jefe_seccion', 'jefe_grupo'];
  const rolLabels  = {
    empleado:    'Interesado',
    jefe_seccion:'Jefe de Sección',
    jefe_grupo:  'Jefe de Grupo',
  };

  rolesOrden.forEach(rol => {
    const firma = firmas.find(f => f.rol_firma === rol);
    const FH = 22;

    const fillColor = firma
      ? (firma.accion === 'aprobado' ? [0.93, 0.98, 0.93] : [0.99, 0.93, 0.93])
      : [0.98, 0.98, 0.98];

    rect(T_LEFT, curY - FH, T_W, FH, fillColor, null);
    const fY = curY - FH / 2 - 3;

    txt(rolLabels[rol], FC.rol + 3, fY, { size: 8, font: fontBold, maxWidth: 83 });

    if (firma) {
      const firmante = firma.firmante || {};
      txt(firmante.nombre_completo || firma.nombre_cert || '',
          FC.nombre + 3, fY, { size: 8, maxWidth: 165 });
      txt(firmante.dni || firma.dni_cert || '',
          FC.dni    + 3, fY, { size: 8 });
      txt(formatFechaHora(firma.firmado_en),
          FC.fecha  + 3, fY, { size: 7 });

      const accionColor = firma.accion === 'aprobado' ? COL.verde : COL.rojo;
      const accionTxt   = firma.accion === 'aprobado' ? '✓ APROBADO' : '✗ RECHAZADO';
      txt(accionTxt, FC.accion + 3, fY, { size: 8, font: fontBold, color: accionColor });

      // Ref. certificado (segunda línea)
      if (firma.cert_hash) {
        txt('Cert: ' + firma.cert_hash.substring(0, 24) + '…',
            FC.nombre + 3, fY - 10, { size: 6, color: COL.gris });
      }
    } else {
      txt('Pendiente de firma', FC.nombre + 3, fY, { size: 8, color: COL.gris });
    }

    // Líneas de la fila
    [FC.nombre, FC.dni, FC.fecha, FC.accion, FC.end].forEach(x => {
      linev(x, curY, curY - FH);
    });
    linev(T_LEFT, curY, curY - FH);
    lineh(T_LEFT, curY,      FC.end);
    lineh(T_LEFT, curY - FH, FC.end);

    curY -= FH;
  });

  // Borde exterior tabla firmas
  page.drawRectangle({
    x: T_LEFT, y: curY, width: T_W,
    height: F_TOP - curY,
    borderColor: rgb3(COL.gris), borderWidth: 0.7,
    color: rgb(1,1,1,0)
  });

  // ── 4. PIE DE PÁGINA ─────────────────────────────────────

  const pieY = 25;
  lineh(T_LEFT, pieY + 14, T_LEFT + T_W);
  txt('Documento generado electrónicamente por VacaFirma · ' + formatFechaHora(new Date().toISOString()),
      T_LEFT, pieY + 4, { size: 6, color: COL.gris });
  txt('ID: ' + (permiso.id || ''), T_LEFT + T_W - 220, pieY + 4, { size: 6, color: COL.gris });

  // ── SERIALIZAR ───────────────────────────────────────────
  const pdfBytes = await doc.save();
  return new Uint8Array(pdfBytes);
}

// ── HELPERS DE FECHA ─────────────────────────────────────────

function formatFecha(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatFechaHora(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
