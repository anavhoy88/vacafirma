// ═══════════════════════════════════════════════════════════════
// pdf-generator.js — VacaFirma 2.0
// pdf-lib: origen (0,0) = esquina INFERIOR izquierda.
// Todas las funciones auxiliares trabajan en coordenadas desde
// la parte SUPERIOR (más natural). Se convierten al llamar a pdf-lib.
// ═══════════════════════════════════════════════════════════════

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
    .replace(/…/g,'...').replace(/[✓]/g,'OK').replace(/[✗✘]/g,'X')
    .replace(/[^\x00-\xFF]/g,'?');
}

function _fmtFechaPDF(v) {
  if (!v) return '-';
  try {
    const d = new Date(String(v).includes('T') ? v : v + 'T00:00:00');
    return d.toLocaleDateString('es-ES', {day:'2-digit',month:'2-digit',year:'numeric'});
  } catch(e) { return String(v); }
}

function _fmtFechaHoraPDF(v) {
  if (!v) return '-';
  try {
    // Firestore Timestamp → tiene .toDate()
    const d = (v && typeof v.toDate === 'function') ? v.toDate() : new Date(v);
    return d.toLocaleString('es-ES', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  } catch(e) { return String(v); }
}

async function generarPDFPermiso(permiso, firmas = [], opciones = {}) {
  const { PDFDocument, rgb, StandardFonts } = PDFLib;

  const doc  = await PDFDocument.create();
  const PW   = 595.28;
  const PH   = 841.89;
  const page = doc.addPage([PW, PH]);

  const fR = await doc.embedFont(StandardFonts.Helvetica);
  const fB = await doc.embedFont(StandardFonts.HelveticaBold);

  // Colores
  const CL = {
    negro:  rgb(0,    0,    0   ),
    gris:   rgb(0.55, 0.55, 0.55),
    grisCl: rgb(0.93, 0.93, 0.93),
    grisHd: rgb(0.84, 0.87, 0.91),
    navy:   rgb(0.13, 0.22, 0.40),
    blanco: rgb(1,    1,    1   ),
    verde:  rgb(0.07, 0.49, 0.17),
    rojo:   rgb(0.72, 0.09, 0.09),
    naranja:rgb(0.60, 0.38, 0.00),
    verdeCl:rgb(0.90, 0.97, 0.90),
    rojoCl: rgb(0.99, 0.91, 0.91),
    altRow: rgb(0.96, 0.96, 0.98),
  };

  // ── Helpers con coordenadas desde ARRIBA ──────────────────────
  // yT = distancia desde el borde superior de la página

  function fillRect(x, yT, w, h, color) {
    page.drawRectangle({ x, y: PH - yT - h, width: w, height: h, color });
  }

  function strokeRect(x, yT, w, h, color, lw = 0.5) {
    page.drawRectangle({ x, y: PH - yT - h, width: w, height: h,
      borderColor: color, borderWidth: lw, opacity: 0 });
  }

  // Texto: x = izquierda, yT = distancia desde arriba hasta la LÍNEA BASE del texto
  function txt(text, x, yT, { sz = 8, f = fR, col = CL.negro, maxW } = {}) {
    const s = sanitizePDF(String(text || ''));
    if (!s) return;
    let out = s;
    if (maxW) {
      while (out.length > 1 && f.widthOfTextAtSize(out + '...', sz) > maxW) out = out.slice(0,-1);
      if (out !== s) out += '...';
    }
    page.drawText(out, { x, y: PH - yT, size: sz, font: f, color: col });
  }

  function hLine(x1, x2, yT, col = CL.gris) {
    page.drawLine({start:{x:x1,y:PH-yT}, end:{x:x2,y:PH-yT}, thickness:0.4, color:col});
  }

  function vLine(x, yT1, yT2, col = CL.gris) {
    page.drawLine({start:{x,y:PH-yT1}, end:{x,y:PH-yT2}, thickness:0.4, color:col});
  }

  // Margen izquierdo y ancho útil
  const ML = 25, MR = 25;
  const UW = PW - ML - MR;  // 545 pt

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 1 — CABECERA  (y: 20 → 80)
  // ══════════════════════════════════════════════════════════════
  let y = 20;  // cursor desde arriba

  // Fondo azul derecho (anchura 195, altura 60)
  fillRect(PW - MR - 195, y, 195, 60, CL.navy);

  // Texto dentro del recuadro azul (línea base = top + offset desde arriba de la caja)
  txt('EJERCITO DEL AIRE Y DEL ESPACIO', PW-MR-190, y+13,  {sz:6.5, f:fB, col:CL.blanco});
  txt('BASE AEREA DE ALBACETE Y ALA 14', PW-MR-190, y+24,  {sz:6.5, col:CL.blanco});
  txt('GRUPO DE FUERZAS AEREAS',         PW-MR-190, y+35,  {sz:6.5, col:CL.blanco});
  txt('IG 10-99',                        PW-MR-190, y+46,  {sz:6.5, col:CL.blanco});
  txt('7a Rev. 20/10/2022',              PW-MR-190, y+56,  {sz:5.5, col:CL.blanco});

  // Título centrado en la zona izquierda
  const tit = sanitizePDF('FICHA DE SOLICITUD DE PERMISOS ANO ' + (permiso.anio || new Date().getFullYear()));
  const titW = fB.widthOfTextAtSize(tit, 10);
  const zonaIzqW = PW - ML - MR - 195 - 10;  // ≈ 325
  txt(tit, ML + Math.max(0, (zonaIzqW - titW) / 2), y + 36, {sz: 10, f: fB});

  strokeRect(ML, y, UW, 60, CL.gris);
  y += 60;

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 2 — DATOS PERSONALES  (y: 80 → 128)
  // ══════════════════════════════════════════════════════════════
  y += 6;
  const emp = permiso.empleado || {};
  const EH  = 42;

  strokeRect(ML, y, UW, EH, CL.gris);
  hLine(ML, ML+UW, y + 21);  // divisor entre las dos filas

  // Fila 1: empleo + DNI
  txt('EMPLEO:',          ML+5,  y+14, {sz:7.5, f:fB});
  txt(emp.empleo||'-',   ML+58,  y+14, {sz:7.5, maxW:155});
  txt('DNI:',            ML+230, y+14, {sz:7.5, f:fB});
  txt(emp.dni||'-',      ML+255, y+14, {sz:7.5});

  // Fila 2: nombre + dependencia
  txt('NOMBRE Y APELLIDOS:', ML+5,  y+34, {sz:7.5, f:fB});
  txt(emp.nombre_completo||'-', ML+120, y+34, {sz:7.5, maxW:100});
  txt('DEPENDENCIA:',    ML+230, y+34, {sz:7.5, f:fB});
  txt(emp.dependencia||'-', ML+307, y+34, {sz:7.5});

  y += EH + 6;

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 3 — TABLA PERMISO
  // ══════════════════════════════════════════════════════════════
  const CH = 16, RH = 18;
  // columnas (posiciones absolutas)
  const tc = [ML, ML+70, ML+140, ML+280, ML+310, ML+440, ML+UW];

  // Cabecera
  fillRect(ML, y, UW, CH, CL.navy);
  const cabLabels = ['FECHA INICIO','FECHA FIN','TIPO DE PERMISO','DIAS','DIRECCION / TEL.','MOTIVO'];
  cabLabels.forEach((lb, i) => txt(lb, tc[i]+3, y+11, {sz:6, f:fB, col:CL.blanco}));
  y += CH;

  // Fila datos
  fillRect(ML, y, UW, RH, CL.grisCl);
  const tipoLabel = (typeof TIPO_LABELS!=='undefined' && TIPO_LABELS[permiso.tipo]) || permiso.tipo || '-';
  const dirTel    = [permiso.direccion, permiso.telefono].filter(Boolean).join(' · ');
  const dataVals  = [
    _fmtFechaPDF(permiso.fecha_inicio),
    _fmtFechaPDF(permiso.fecha_fin),
    tipoLabel,
    String(permiso.dias_habiles||1),
    dirTel||'-',
    permiso.motivo||'-',
  ];
  const dataMaxW = [65,65,135,25,125,130];
  dataVals.forEach((v,i) => txt(v, tc[i]+3, y+12, {sz:7, maxW:dataMaxW[i]}));

  // Bordes
  tc.forEach(x => vLine(x, y-CH, y+RH));
  hLine(ML, ML+UW, y-CH);
  hLine(ML, ML+UW, y);
  hLine(ML, ML+UW, y+RH);
  y += RH + 6;

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 4 — OBSERVACIONES
  // ══════════════════════════════════════════════════════════════
  if (permiso.observaciones) {
    txt('Observaciones:', ML+5, y+10, {sz:7.5, f:fB});
    txt(permiso.observaciones, ML+90, y+10, {sz:7.5, maxW:445});
    y += 18;
  }

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 5 — ESTADO
  // ══════════════════════════════════════════════════════════════
  y += 4;
  const estadoStr = (typeof ESTADO_LABELS!=='undefined' && ESTADO_LABELS[permiso.estado]) || permiso.estado || '';
  const estCol    = permiso.estado === 'aprobada' ? CL.verde
                  : (permiso.estado||'').startsWith('rechazada') ? CL.rojo
                  : CL.naranja;
  strokeRect(ML, y, UW, 20, estCol, 1.2);
  txt('Estado:', ML+6, y+13, {sz:8, f:fB, col:estCol});
  txt(estadoStr, ML+52, y+13, {sz:8, f:fB, col:estCol});
  y += 20;

  if (permiso.motivo_rechazo) {
    y += 4;
    txt('Motivo de rechazo: '+permiso.motivo_rechazo, ML+5, y+10, {sz:7.5, col:CL.rojo, maxW:530});
    y += 16;
  }

  // ══════════════════════════════════════════════════════════════
  // BLOQUE 6 — REGISTRO DE FIRMAS
  // ══════════════════════════════════════════════════════════════
  y += 10;

  // Cabecera azul
  fillRect(ML, y, UW, 18, CL.navy);
  txt('REGISTRO DE FIRMAS ELECTRONICAS', ML+5, y+13, {sz:8, f:fB, col:CL.blanco});
  y += 18;

  // Subencabezado columnas
  // ROL(90) | NOMBRE(170) | DNI(55) | FECHA(110) | RESULTADO(120)
  const fc = {
    rol:    ML,
    nombre: ML+90,
    dni:    ML+260,
    fecha:  ML+315,
    result: ML+425,
    end:    ML+UW,
  };

  fillRect(ML, y, UW, 14, CL.grisHd);
  txt('ROL / CARGO',        fc.rol+4,    y+10, {sz:6.5, f:fB});
  txt('NOMBRE Y APELLIDOS', fc.nombre+4, y+10, {sz:6.5, f:fB});
  txt('DNI',                fc.dni+4,    y+10, {sz:6.5, f:fB});
  txt('FECHA Y HORA',       fc.fecha+4,  y+10, {sz:6.5, f:fB});
  txt('RESULTADO',          fc.result+4, y+10, {sz:6.5, f:fB});

  Object.values(fc).forEach(x => vLine(x, y, y+14));
  hLine(ML, fc.end, y);
  hLine(ML, fc.end, y+14);
  y += 14;

  // ── Construir filas de firma ──────────────────────────────────
  // La firma del empleado siempre va primero
  const fEmp = firmas.find(f => f.rol_firma === 'empleado');

  // Firmantes de cadena: ordenar por indice_cadena (comparar como número)
  const fCadena = firmas
    .filter(f => f.rol_firma !== 'empleado')
    .sort((a, b) => Number(a.indice_cadena ?? 99) - Number(b.indice_cadena ?? 99));

  const cadenaEmails = permiso.cadena_emails || [];
  const numFirm      = cadenaEmails.length;

  const filas = [{ label: 'Interesado', firma: fEmp }];

  if (numFirm > 0) {
    for (let i = 0; i < numFirm; i++) {
      // Comparar con == para tolerar string/number
      const f = fCadena.find(f => Number(f.indice_cadena) === i) || null;
      const lbl = i === numFirm - 1 ? 'Firma final' : ('Firmante ' + (i+1));
      filas.push({ label: lbl, firma: f });
    }
  } else {
    // Legado jefe_seccion / jefe_grupo
    [['jefe_seccion','Jefe de Seccion'],['jefe_grupo','Jefe de Grupo']].forEach(([rol,lbl]) => {
      filas.push({ label: lbl, firma: firmas.find(f => f.rol_firma === rol) || null });
    });
  }

  // ── Dibujar filas ─────────────────────────────────────────────
  const FRH = 26;  // altura fila
  const firmasStartY = y;

  filas.forEach(({ label, firma }, idx) => {
    // Fondo alterno
    fillRect(ML, y, UW, FRH, idx%2===0 ? CL.grisCl : CL.blanco);

    const midTxt = y + FRH/2 + 3;  // línea base del texto centrado verticalmente

    txt(label, fc.rol+4, midTxt, {sz:7.5, f:fB, maxW:84});

    if (firma) {
      const firmante = firma.firmante || {};
      const nombre   = firmante.nombre_completo || firma.nombre_cert || '-';
      const dni      = firmante.dni || firma.dni_cert || '-';
      const fecha    = _fmtFechaHoraPDF(firma.firmado_en);
      const esOK     = firma.accion === 'aprobado';
      const resCol   = esOK ? CL.verde : CL.rojo;

      txt(nombre,            fc.nombre+4, midTxt,   {sz:7.5, maxW:164});
      txt(dni,               fc.dni+4,   midTxt,   {sz:7.5});
      txt(fecha,             fc.fecha+4, midTxt,   {sz:7, maxW:106});
      txt(esOK?'[OK] APROBADO':'[X] RECHAZADO', fc.result+4, midTxt, {sz:7.5, f:fB, col:resCol});

      if (firma.cert_hash) {
        txt('Cert: '+firma.cert_hash.substring(0,22)+'...', fc.nombre+4, midTxt+10, {sz:5.5, col:CL.gris});
      }
    } else if (opciones.paraFirmar) {
      // PDF preparado para firmar: mostrar quién debe firmar en este hueco
      const quien = idx === 0
        ? ((permiso.empleado || {}).nombre_completo || '-')
        : (cadenaEmails[idx - 1] || '-');
      const dniInt = idx === 0 ? ((permiso.empleado || {}).dni || '-') : '-';
      txt(quien,                        fc.nombre+4, midTxt,    {sz:7.5, maxW:164});
      txt('Firma electrónica PAdES',    fc.nombre+4, midTxt+10, {sz:5.5, col:CL.gris});
      txt(dniInt,                       fc.dni+4,    midTxt,    {sz:7.5});
      txt('Ver panel de firmas',        fc.fecha+4,  midTxt,    {sz:7, maxW:106, col:CL.gris});
      txt('VER FIRMAS',                 fc.result+4, midTxt,    {sz:7.5, f:fB, col:CL.gris});
    } else {
      txt('Pendiente de firma', fc.nombre+4, midTxt, {sz:7.5, col:CL.gris});
      txt('PENDIENTE',          fc.result+4, midTxt, {sz:7.5, f:fB, col:CL.gris});
    }

    // Bordes fila
    Object.values(fc).forEach(x => vLine(x, y, y+FRH));
    hLine(ML, fc.end, y);
    hLine(ML, fc.end, y+FRH);

    y += FRH;
  });

  // Borde exterior bloque firmas
  strokeRect(ML, firmasStartY - 32, UW, 32 + filas.length*FRH, CL.gris, 0.7);

  // ══════════════════════════════════════════════════════════════
  // PIE DE PÁGINA
  // ══════════════════════════════════════════════════════════════
  const pieY = PH - 22;
  hLine(ML, ML+UW, PH - 28, CL.gris);
  txt('Documento generado electronicamente por VacaFirma · ' + _fmtFechaHoraPDF(new Date().toISOString()),
      ML, PH-18, {sz:5.5, col:CL.gris});
  txt('ID: '+(permiso.id||'-'), ML+UW-170, PH-18, {sz:5.5, col:CL.gris});

  return new Uint8Array(await doc.save());
}
