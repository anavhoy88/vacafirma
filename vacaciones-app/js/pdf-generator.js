// ═══════════════════════════════════════════════════════════════
// pdf-generator.js — Genera el PDF de solicitud de vacaciones
// Usa pdf-lib (cargado desde CDN en index.html)
// ═══════════════════════════════════════════════════════════════

const { PDFDocument, rgb, StandardFonts, degrees } = PDFLib;

// Colores corporativos (RGB 0-1)
const COLOR = {
  navy:      rgb(0.059, 0.102, 0.180),
  gold:      rgb(0.788, 0.659, 0.298),
  cream:     rgb(0.961, 0.941, 0.910),
  white:     rgb(1, 1, 1),
  textDark:  rgb(0.059, 0.102, 0.180),
  textGray:  rgb(0.353, 0.408, 0.502),
  border:    rgb(0.820, 0.820, 0.820),
  signBg:    rgb(0.95, 0.98, 0.96),
};

/**
 * Genera el PDF de solicitud de vacaciones.
 * @param {Object} datos - { empleadoNombre, fechaInicio, fechaFin, direccion, observaciones }
 * @returns {Uint8Array} - Bytes del PDF generado
 */
async function generarPDF(datos) {
  const doc = await PDFDocument.create();

  // Metadatos
  doc.setTitle('Solicitud de Vacaciones');
  doc.setAuthor(datos.empleadoNombre || 'Empleado');
  doc.setCreator('VacaFirma — Sistema de solicitud con firma digital');
  doc.setCreationDate(new Date());

  // Fuentes estándar (sin necesidad de cargar fuentes externas)
  const fontBold    = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontOblique = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const margin = 50;

  // ── CABECERA ────────────────────────────────────────────────
  // Banda superior navy
  page.drawRectangle({
    x: 0, y: height - 100,
    width, height: 100,
    color: COLOR.navy,
  });

  // Línea dorada
  page.drawRectangle({
    x: 0, y: height - 104,
    width, height: 4,
    color: COLOR.gold,
  });

  // Título
  page.drawText('SOLICITUD DE VACACIONES', {
    x: margin, y: height - 50,
    size: 18,
    font: fontBold,
    color: COLOR.white,
  });

  page.drawText('Sistema de firma digital con certificado electrónico', {
    x: margin, y: height - 72,
    size: 9,
    font: fontOblique,
    color: COLOR.gold,
  });

  // Número de documento / fecha
  const hoy = new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' });
  page.drawText(`Fecha de solicitud: ${hoy}`, {
    x: width - 210, y: height - 50,
    size: 8,
    font: fontRegular,
    color: COLOR.gold,
  });

  // ── SECCIÓN: DATOS DEL EMPLEADO ─────────────────────────────
  let y = height - 140;

  dibujarSectionHeader(page, fontBold, 'DATOS DEL EMPLEADO', margin, y, width - margin * 2);
  y -= 30;

  dibujarCampo(page, fontBold, fontRegular,
    'Nombre completo:', datos.empleadoNombre || '—', margin, y, width - margin * 2);
  y -= 25;

  // ── SECCIÓN: PERÍODO VACACIONAL ─────────────────────────────
  y -= 20;
  dibujarSectionHeader(page, fontBold, 'PERÍODO VACACIONAL', margin, y, width - margin * 2);
  y -= 30;

  const mitad = (width - margin * 2) / 2 - 10;
  dibujarCampo(page, fontBold, fontRegular,
    'Fecha de inicio:', formatearFecha(datos.fechaInicio), margin, y, mitad);
  dibujarCampo(page, fontBold, fontRegular,
    'Fecha de fin:', formatearFecha(datos.fechaFin), margin + mitad + 20, y, mitad);
  y -= 25;

  const dias = calcularDias(datos.fechaInicio, datos.fechaFin);
  dibujarCampo(page, fontBold, fontRegular,
    'Total días naturales:', `${dias} días`, margin, y, width - margin * 2);
  y -= 25;

  // ── SECCIÓN: DIRECCIÓN DURANTE VACACIONES ───────────────────
  y -= 20;
  dibujarSectionHeader(page, fontBold, 'DIRECCIÓN DURANTE EL PERÍODO VACACIONAL', margin, y, width - margin * 2);
  y -= 30;

  // Cuadro de dirección
  page.drawRectangle({
    x: margin, y: y - 15,
    width: width - margin * 2, height: 30,
    color: COLOR.cream,
    borderColor: COLOR.border,
    borderWidth: 1,
  });
  page.drawText(datos.direccion || '—', {
    x: margin + 10, y: y - 6,
    size: 10,
    font: fontRegular,
    color: COLOR.textDark,
  });
  y -= 50;

  // ── SECCIÓN: OBSERVACIONES ───────────────────────────────────
  if (datos.observaciones) {
    y -= 10;
    dibujarSectionHeader(page, fontBold, 'OBSERVACIONES', margin, y, width - margin * 2);
    y -= 30;

    const obsLineas = dividirTexto(datos.observaciones, fontRegular, 10, width - margin * 2 - 20);
    page.drawRectangle({
      x: margin, y: y - (obsLineas.length * 14) - 10,
      width: width - margin * 2, height: obsLineas.length * 14 + 15,
      color: COLOR.cream,
      borderColor: COLOR.border,
      borderWidth: 1,
    });
    obsLineas.forEach((linea, i) => {
      page.drawText(linea, {
        x: margin + 10, y: y - i * 14 - 4,
        size: 10,
        font: fontOblique,
        color: COLOR.textGray,
      });
    });
    y -= obsLineas.length * 14 + 30;
  }

  // ── TABLA DE FIRMAS ─────────────────────────────────────────
  y -= 20;
  dibujarSectionHeader(page, fontBold, 'FIRMAS DIGITALES', margin, y, width - margin * 2);
  y -= 15;

  const colW = (width - margin * 2) / 3;
  const firmaH = 120;

  const firmantes = [
    { titulo: 'EMPLEADO', nombre: datos.empleadoNombre || '—', campo: 'firma_empleado' },
    { titulo: 'JEFE INMEDIATO', nombre: datos.jefe1Nombre || 'Pendiente de asignación', campo: 'firma_jefe1' },
    { titulo: 'JEFE SUPERIOR', nombre: datos.jefe2Nombre || 'Pendiente de asignación', campo: 'firma_jefe2' },
  ];

  firmantes.forEach((f, i) => {
    const x = margin + colW * i;

    // Marco exterior
    page.drawRectangle({
      x, y: y - firmaH,
      width: colW, height: firmaH,
      color: COLOR.white,
      borderColor: COLOR.navy,
      borderWidth: 1.5,
    });

    // Cabecera de columna
    page.drawRectangle({
      x, y: y - 22,
      width: colW, height: 22,
      color: COLOR.navy,
    });

    page.drawText(f.titulo, {
      x: x + 8, y: y - 15,
      size: 8,
      font: fontBold,
      color: COLOR.white,
    });

    // Área de firma (zona en blanco para AutoFirma)
    page.drawRectangle({
      x: x + 8, y: y - firmaH + 30,
      width: colW - 16, height: firmaH - 60,
      color: COLOR.signBg,
      borderColor: COLOR.border,
      borderWidth: 0.5,
      borderDashArray: [3, 3],
    });

    page.drawText('Firma electrónica cualificada', {
      x: x + 12, y: y - 55,
      size: 7,
      font: fontOblique,
      color: COLOR.textGray,
    });

    // Nombre del firmante
    page.drawText(f.nombre, {
      x: x + 8, y: y - firmaH + 18,
      size: 8,
      font: fontRegular,
      color: COLOR.textDark,
      maxWidth: colW - 16,
    });

    // Estado firma
    const estadoTexto = datos[f.campo] ? '✓ Firmado' : 'Pendiente';
    const estadoColor = datos[f.campo] ? rgb(0.18, 0.48, 0.37) : COLOR.textGray;
    page.drawText(estadoTexto, {
      x: x + 8, y: y - firmaH + 6,
      size: 7,
      font: fontBold,
      color: estadoColor,
    });
  });

  y -= firmaH + 20;

  // ── PIE DE PÁGINA ────────────────────────────────────────────
  page.drawRectangle({
    x: 0, y: 0,
    width, height: 35,
    color: COLOR.navy,
  });

  page.drawText('Documento generado electrónicamente • VacaFirma • Las firmas son certificados digitales cualificados (PAdES/PKCS#7)', {
    x: margin, y: 12,
    size: 6.5,
    font: fontOblique,
    color: COLOR.gold,
  });

  // ── MARCA DE AGUA si es borrador ─────────────────────────────
  if (!datos.firma_empleado) {
    page.drawText('BORRADOR', {
      x: 120, y: 400,
      size: 80,
      font: fontBold,
      color: rgb(0.9, 0.9, 0.9),
      opacity: 0.25,
      rotate: degrees(45),
    });
  }

  return await doc.save();
}

// ── HELPERS ──────────────────────────────────────────────────

function dibujarSectionHeader(page, font, texto, x, y, w) {
  page.drawRectangle({
    x, y: y - 4,
    width: w, height: 22,
    color: rgb(0.059, 0.102, 0.180),
    borderRadius: 2,
  });
  page.drawText(texto, {
    x: x + 10, y: y + 3,
    size: 9,
    font,
    color: rgb(1, 1, 1),
    letterSpacing: 0.5,
  });
}

function dibujarCampo(page, fontBold, fontRegular, etiqueta, valor, x, y, w) {
  page.drawText(etiqueta, {
    x, y,
    size: 8,
    font: fontBold,
    color: rgb(0.353, 0.408, 0.502),
  });
  const etqW = fontBold.widthOfTextAtSize(etiqueta, 8);
  page.drawText(valor, {
    x: x + etqW + 6, y,
    size: 9,
    font: fontRegular,
    color: rgb(0.059, 0.102, 0.180),
    maxWidth: w - etqW - 6,
  });
}

function formatearFecha(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${parseInt(d)} de ${meses[parseInt(m)-1]} de ${y}`;
}

function calcularDias(ini, fin) {
  if (!ini || !fin) return 0;
  const d1 = new Date(ini), d2 = new Date(fin);
  return Math.max(0, Math.round((d2 - d1) / (1000 * 60 * 60 * 24)) + 1);
}

function dividirTexto(texto, font, size, maxW) {
  const palabras = texto.split(' ');
  const lineas = [];
  let linea = '';
  for (const p of palabras) {
    const prueba = linea ? linea + ' ' + p : p;
    if (font.widthOfTextAtSize(prueba, size) > maxW) {
      if (linea) lineas.push(linea);
      linea = p;
    } else {
      linea = prueba;
    }
  }
  if (linea) lineas.push(linea);
  return lineas;
}
