// ═══════════════════════════════════════════════════════════════
// pdf-generator.js — VacaFirma 2.0
// Layout rediseñado completamente. Coordenadas en puntos PDF.
// pdf-lib: origen (0,0) = esquina inferior izquierda.
// ═══════════════════════════════════════════════════════════════

// Convierte caracteres especiales a ASCII compatible con Helvetica/WinAnsi
function sanitizePDF(str) {
  if (!str) return '';
  return String(str)
    .replace(/[ÀÁÂÃÄÅ]/g,'A').replace(/[àáâãäå]/g,'a')
    .replace(/[ÈÉÊË]/g,'E').replace(/[èéêë]/g,'e')
    .replace(/[ÌÍÎÏ]/g,'I').replace(/[ìíîï]/g,'i')
    .replace(/[ÒÓÔÕÖ]/g,'O').replace(/[òóôõö]/g,'o')
    .replace(/[ÙÚÛÜ]/g,'U').replace(/[ùúûü]/g,'u')
    .replace(/Ñ/g,'N').replace(/ñ/g,'n')
    .replace(/Ç/g,'C').replace(/ç/g,'c')
    .replace(/[ªº]/g,'.').replace(/[·•]/g,'-')
    .replace(/[—–]/g,'-').replace(/[""]/g,'"').replace(/['']/g,"'")
    .replace(/…/g,'...').replace(/✓/g,'OK').replace(/[✗✘]/g,'X')
    .replace(/[^\x00-\xFF]/g,'?');
}

function _fmtFechaPDF(isoStr) {
  if (!isoStr) return '-';
  try {
    const d = new Date(isoStr + (String(isoStr).includes('T') ? '' : 'T00:00:00'));
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch(e) { return String(isoStr); }
}

function _fmtFechaHoraPDF(isoStr) {
  if (!isoStr) return '-';
  try {
    return new Date(isoStr).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch(e) { return String(isoStr); }
}

async function generarPDFPermiso(permiso, firmas = []) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  // A4 en puntos: 595.28 x 841.89
  const page = doc.addPage([595.28, 841.89]);
  const W = 595.28;
  const H = 841.89;

  const fReg  = await doc.embedFont(StandardFonts.Helvetica);
  const fBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // ── Helpers ──────────────────────────────────────────────────
  const c = {
    negro:   rgb(0,    0,    0   ),
    gris:    rgb(0.5,  0.5,  0.5 ),
    grisCl:  rgb(0.92, 0.92, 0.92),
    grisHd:  rgb(0.85, 0.87, 0.91),
    navy:    rgb(0.13, 0.22, 0.40),
    blanco:  rgb(1,    1,    1   ),
    verde:   rgb(0.08, 0.50, 0.18),
    rojo:    rgb(0.72, 0.10, 0.10),
    naranja: rgb(0.60, 0.38, 0.00),
    verdeCl: rgb(0.90, 0.97, 0.90),
    rojoCl:  rgb(0.99, 0.91, 0.91),
    grisFilaCl: rgb(0.97, 0.97, 0.97),
  };

  // Rellena un rectángulo. y = borde SUPERIOR (lo convertimos internamente)
  function box(x, yTop, w, h, fill, border) {
    const yPDF = H - yTop - h;  // convertir a coordenadas pdf-lib
    if (fill)   page.drawRectangle({ x, y: yPDF, width: w, height: h, color: fill });
    if (border) page.drawRectangle({ x, y: yPDF, width: w, height: h,
                   borderColor: border, borderWidth: 0.5,
                   color: rgb(1,1,1,0) });
  }

  // Dibuja texto. y = posición SUPERIOR de la línea base aprox
  function t(text, x, yTop, { sz = 8, f = fReg, col = c.negro, maxW } = {}) {
    const s = sanitizePDF(String(text || ''));
    if (!s) return;
    let out = s;
    if (maxW) {
      while (out.length > 1 && f.widthOfTextAtSize(out + '...', sz) > maxW) out = out.slice(0,-1);
      if (out !== s) out += '...';
    }
    page.drawText(out, { x, y: H - yTop, size: sz, font: f, color: col });
  }

  // Línea horizontal. y = posición desde arriba
  function lh(x1, x2, yTop, col = c.gris) {
    page.drawLine({ start:{x:x1, y:H-yTop}, end:{x:x2, y:H-yTop},
                    thickness:0.4, color: col });
  }

  // Línea vertical
  function lv(x, yTop1, yTop2, col = c.gris) {
    page.drawLine({ start:{x, y:H-yTop1}, end:{x, y:H-yTop2},
                    thickness:0.4, color: col });
  }

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 1 — CABECERA
  // Zona: y 20..90 (altura 70)
  // ══════════════════════════════════════════════════════════════
  const CAB_Y = 20;   // top de la cabecera
  const CAB_H = 60;

  // Título centrado en la zona izquierda (20..370)
  const titulo = sanitizePDF('FICHA DE SOLICITUD DE PERMISOS ANO ' + (permiso.anio || new Date().getFullYear()));
  const tW = fBold.widthOfTextAtSize(titulo, 10);
  t(titulo, 20 + (350 - tW) / 2, CAB_Y + 36, { sz: 10, f: fBold });

  // Recuadro azul derecha (375..575)
  box(375, CAB_Y, 200, CAB_H, c.navy, null);
  t('EJERCITO DEL AIRE Y DEL ESPACIO', 381, CAB_Y + 13, { sz: 6.5, f: fBold, col: c.blanco });
  t('BASE AEREA DE ALBACETE Y ALA 14', 381, CAB_Y + 24, { sz: 6.5, col: c.blanco });
  t('GRUPO DE FUERZAS AEREAS',         381, CAB_Y + 35, { sz: 6.5, col: c.blanco });
  t('IG 10-99',                        381, CAB_Y + 46, { sz: 6.5, col: c.blanco });
  t('7a Rev. 20/10/2022',              381, CAB_Y + 56, { sz: 5.5, col: c.blanco });

  // Borde exterior cabecera
  box(20, CAB_Y, 555, CAB_H, null, c.gris);

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 2 — DATOS PERSONALES
  // Zona: y 90..130 (altura 40, dos filas de 20)
  // ══════════════════════════════════════════════════════════════
  const EMP_Y = CAB_Y + CAB_H + 8;  // 88
  const EMP_H = 42;
  const emp = permiso.empleado || {};

  box(20, EMP_Y, 555, EMP_H, null, c.gris);

  // Fila 1
  t('EMPLEO:',         26, EMP_Y + 14, { sz: 7.5, f: fBold });
  t(emp.empleo || '-', 76, EMP_Y + 14, { sz: 7.5, maxW: 170 });
  t('DNI:',           260, EMP_Y + 14, { sz: 7.5, f: fBold });
  t(emp.dni   || '-', 285, EMP_Y + 14, { sz: 7.5 });

  // Fila 2
  t('NOMBRE Y APELLIDOS:',         26, EMP_Y + 30, { sz: 7.5, f: fBold });
  t(emp.nombre_completo || '-',   145, EMP_Y + 30, { sz: 7.5, maxW: 100 });
  t('DEPENDENCIA:',               260, EMP_Y + 30, { sz: 7.5, f: fBold });
  t(emp.dependencia || '-',       340, EMP_Y + 30, { sz: 7.5 });

  // Divisor entre filas
  lh(20, 575, EMP_Y + 20);

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 3 — TABLA DE DATOS DEL PERMISO
  // ══════════════════════════════════════════════════════════════
  const TAB_Y = EMP_Y + EMP_H + 8;  // ≈ 138
  const TAB_H_CAB = 16;
  const TAB_H_ROW = 18;

  // Columnas: inicio | fin | tipo | días | dirección/tel | motivo
  const C0 = 20, C1 = 95, C2 = 165, C3 = 300, C4 = 325, C5 = 460, C6 = 575;

  // Cabecera azul
  box(C0, TAB_Y, 555, TAB_H_CAB, c.navy, null);
  const tcy = TAB_Y + 11;
  t('FECHA INICIO',      C0+3, tcy, { sz: 6.5, f: fBold, col: c.blanco });
  t('FECHA FIN',         C1+3, tcy, { sz: 6.5, f: fBold, col: c.blanco });
  t('TIPO DE PERMISO',   C2+3, tcy, { sz: 6.5, f: fBold, col: c.blanco });
  t('DIAS',              C3+3, tcy, { sz: 6.5, f: fBold, col: c.blanco });
  t('DIRECCION / TEL.',  C4+3, tcy, { sz: 6.5, f: fBold, col: c.blanco });
  t('MOTIVO',            C5+3, tcy, { sz: 6.5, f: fBold, col: c.blanco });

  // Fila de datos
  const DATO_Y = TAB_Y + TAB_H_CAB;
  box(C0, DATO_Y, 555, TAB_H_ROW, c.grisCl, null);
  const dy = DATO_Y + 12;
  t(_fmtFechaPDF(permiso.fecha_inicio),          C0+3, dy, { sz: 7.5 });
  t(_fmtFechaPDF(permiso.fecha_fin),             C1+3, dy, { sz: 7.5 });
  t((typeof TIPO_LABELS !== 'undefined' ? TIPO_LABELS[permiso.tipo] : null) || permiso.tipo || '-',
                                                  C2+3, dy, { sz: 7.5, maxW: 128 });
  t(String(permiso.dias_habiles || 1),           C3+3, dy, { sz: 7.5 });
  const dirTel = [permiso.direccion, permiso.telefono].filter(Boolean).join(' · ');
  t(dirTel,                                       C4+3, dy, { sz: 7, maxW: 130 });
  t(permiso.motivo || '-',                        C5+3, dy, { sz: 7, maxW: 110 });

  // Bordes tabla
  const tabBot = DATO_Y + TAB_H_ROW;
  [C0,C1,C2,C3,C4,C5,C6].forEach(x => lv(x, TAB_Y, tabBot));
  lh(C0, C6, TAB_Y);
  lh(C0, C6, DATO_Y);
  lh(C0, C6, tabBot);

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 4 — OBSERVACIONES (opcional)
  // ══════════════════════════════════════════════════════════════
  let curY = tabBot + 8;

  if (permiso.observaciones) {
    t('Observaciones:', 26, curY + 10, { sz: 7.5, f: fBold });
    t(permiso.observaciones, 110, curY + 10, { sz: 7.5, maxW: 450 });
    curY += 20;
  }

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 5 — ESTADO
  // ══════════════════════════════════════════════════════════════
  curY += 4;
  const EST_H = 20;
  const estadoStr = (typeof ESTADO_LABELS !== 'undefined' ? ESTADO_LABELS[permiso.estado] : null) || permiso.estado || '';
  const estadoCol = permiso.estado === 'aprobada' ? c.verde
                  : (permiso.estado || '').startsWith('rechazada') ? c.rojo
                  : c.naranja;

  // Borde coloreado
  page.drawRectangle({
    x: 20, y: H - curY - EST_H, width: 555, height: EST_H,
    borderColor: estadoCol, borderWidth: 1.2,
    color: rgb(1,1,1,0)
  });
  t('Estado:', 28, curY + 13, { sz: 8, f: fBold, col: estadoCol });
  t(estadoStr, 72, curY + 13, { sz: 8, f: fBold, col: estadoCol });

  if (permiso.motivo_rechazo) {
    curY += EST_H + 4;
    t('Motivo de rechazo: ' + permiso.motivo_rechazo, 26, curY + 11, { sz: 7.5, col: c.rojo, maxW: 530 });
    curY += 16;
  } else {
    curY += EST_H;
  }

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 6 — REGISTRO DE FIRMAS ELECTRÓNICAS
  // ══════════════════════════════════════════════════════════════
  curY += 10;
  const FH_CAB = 18;
  const FH_SUB = 14;  // subencabezado de columnas
  const FH_ROW = 26;  // altura de cada fila de firma

  // Cabecera azul
  box(20, curY, 555, FH_CAB, c.navy, null);
  t('REGISTRO DE FIRMAS ELECTRONICAS', 26, curY + 13, { sz: 8, f: fBold, col: c.blanco });
  curY += FH_CAB;

  // Columnas de firmas
  const FA = 20,   // ROL
        FB = 110,  // NOMBRE
        FC = 285,  // DNI
        FD = 335,  // FECHA/HORA
        FE = 445,  // RESULTADO
        FF = 575;

  // Subencabezado gris
  box(FA, curY, 555, FH_SUB, c.grisHd, null);
  const shy = curY + 10;
  t('ROL / CARGO',       FA+4, shy, { sz: 6.5, f: fBold });
  t('NOMBRE Y APELLIDOS',FB+4, shy, { sz: 6.5, f: fBold });
  t('DNI',               FC+4, shy, { sz: 6.5, f: fBold });
  t('FECHA Y HORA',      FD+4, shy, { sz: 6.5, f: fBold });
  t('RESULTADO',         FE+4, shy, { sz: 6.5, f: fBold });

  [FA,FB,FC,FD,FE,FF].forEach(x => lv(x, curY, curY + FH_SUB));
  lh(FA, FF, curY);
  lh(FA, FF, curY + FH_SUB);
  curY += FH_SUB;

  // ── Construir filas ─────────────────────────────────────────
  const firmaEmpleado = firmas.find(f => f.rol_firma === 'empleado');
  const firmasCadena  = firmas
    .filter(f => f.rol_firma !== 'empleado')
    .sort((a, b) => (a.indice_cadena ?? 99) - (b.indice_cadena ?? 99));

  const cadenaEmails = permiso.cadena_emails || [];
  const numFirmantes = cadenaEmails.length;

  function labelCadena(idx, total) {
    if (total === 0) return 'Firmante';
    if (idx === total - 1) return 'Firma final';
    return 'Firmante ' + (idx + 1);
  }

  const filas = [{ label: 'Interesado', firma: firmaEmpleado }];

  if (numFirmantes > 0) {
    for (let i = 0; i < numFirmantes; i++) {
      const firma = firmasCadena.find(f => f.indice_cadena === i) || null;
      filas.push({ label: labelCadena(i, numFirmantes), firma });
    }
  } else {
    // Legacy
    ['jefe_seccion', 'jefe_grupo'].forEach(rol => {
      const labels = { jefe_seccion: 'Jefe de Seccion', jefe_grupo: 'Jefe de Grupo' };
      filas.push({ label: labels[rol], firma: firmas.find(f => f.rol_firma === rol) || null });
    });
  }

  // ── Dibujar cada fila ────────────────────────────────────────
  filas.forEach(({ label, firma }, idx) => {
    const fillColor = idx % 2 === 0 ? c.grisFilaCl : c.blanco;
    box(FA, curY, 555, FH_ROW, fillColor, null);

    // Centro vertical de la fila
    const midY = curY + FH_ROW / 2 + 3;

    t(label, FA+4, midY, { sz: 7.5, f: fBold, maxW: 86 });

    if (firma) {
      const firmante = firma.firmante || {};
      const nombre   = firmante.nombre_completo || firma.nombre_cert || '-';
      const dni      = firmante.dni || firma.dni_cert || '-';
      const fechaStr = _fmtFechaHoraPDF(firma.firmado_en);
      const esOK     = firma.accion === 'aprobado';

      t(nombre,   FB+4, midY,   { sz: 7.5, maxW: 170 });
      t(dni,      FC+4, midY,   { sz: 7.5 });
      t(fechaStr, FD+4, midY,   { sz: 7, maxW: 106 });

      const resCol = esOK ? c.verde : c.rojo;
      const resTxt = esOK ? '[OK] APROBADO' : '[X] RECHAZADO';
      t(resTxt, FE+4, midY, { sz: 7.5, f: fBold, col: resCol });

      // Hash del certificado (línea pequeña debajo si hay espacio)
      if (firma.cert_hash) {
        const hashStr = 'Cert: ' + firma.cert_hash.substring(0, 20) + '...';
        t(hashStr, FB+4, midY + 10, { sz: 5.5, col: c.gris });
      }
    } else {
      t('Pendiente de firma', FB+4, midY, { sz: 7.5, col: c.gris });
      t('-',                  FC+4, midY, { sz: 7.5, col: c.gris });
      t('-',                  FD+4, midY, { sz: 7.5, col: c.gris });
      t('PENDIENTE',          FE+4, midY, { sz: 7.5, f: fBold, col: c.gris });
    }

    // Bordes fila
    [FA,FB,FC,FD,FE,FF].forEach(x => lv(x, curY, curY + FH_ROW));
    lh(FA, FF, curY);
    lh(FA, FF, curY + FH_ROW);

    curY += FH_ROW;
  });

  // Borde exterior sección firmas
  const firmasTopY = curY - filas.length * FH_ROW - FH_SUB - FH_CAB;
  page.drawRectangle({
    x: 20, y: H - curY,
    width: 555,
    height: filas.length * FH_ROW + FH_SUB + FH_CAB,
    borderColor: c.gris, borderWidth: 0.7,
    color: rgb(1,1,1,0)
  });

  // ══════════════════════════════════════════════════════════════
  // PIE DE PÁGINA
  // ══════════════════════════════════════════════════════════════
  lh(20, 575, H - 25, c.gris);
  t('Documento generado electronicamente por VacaFirma · ' + _fmtFechaHoraPDF(new Date().toISOString()),
    22, H - 18, { sz: 5.5, col: c.gris });
  t('ID: ' + (permiso.id || '-'), 400, H - 18, { sz: 5.5, col: c.gris });

  const pdfBytes = await doc.save();
  return new Uint8Array(pdfBytes);
}
