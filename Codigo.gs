/**
 * Muestras · backend en Google Apps Script
 *
 * Guarda todo en la planilla a la que está vinculado este script:
 *   Cajas, Productos, Stock y Movimientos (una hoja cada uno).
 * Las fotos van a una carpeta de Drive ("Muestras · fotos").
 *
 * Regla de la casa (igual que Brief POP): la app NUNCA borra filas.
 * Un producto que se devuelve queda con cantidad 0 en Stock y su
 * movimiento registrado en Movimientos.
 *
 * Primera vez: ejecutá la función configurar() desde el editor.
 */

const HOJAS = {
  Cajas:       ['id', 'nombre', 'lugar', 'creado', 'por'],
  Productos:   ['codigo', 'nombre', 'marca', 'cliente', 'proyecto', 'alto', 'ancho', 'prof', 'peso', 'foto', 'creado', 'actualizado', 'por'],
  Stock:       ['codigo', 'caja', 'cant', 'at'],
  Movimientos: ['at', 'tipo', 'codigo', 'nombre', 'desde', 'hacia', 'cant', 'nota', 'por'],
  Prestamos:   ['id', 'codigo', 'nombre', 'cant', 'desde', 'a', 'hasta', 'nota', 'por', 'at', 'devuelto', 'vuelveA', 'devueltoPor'],
};
const MOVS_A_ENVIAR = 400;   // los últimos N movimientos que viajan a la app

/* ───────────── Entradas web ───────────── */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.api === 'get') return json_(getData());
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Muestras')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const fns = { getData, guardarCaja, guardarProducto, ingresar, mover, transaccion, devolverPrestamo, subirFoto, historial, buscarEAN, fotoDeTienda, diagTiendas };
    const fn = fns[body.fn];
    if (!fn) throw new Error('Función desconocida: ' + body.fn);
    return json_(fn.apply(null, body.args || []));
  } catch (err) {
    return json_({ error: String((err && err.message) || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ───────────── Configuración inicial ───────────── */

function configurar() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(HOJAS).forEach(function (nombre) {
    let sh = ss.getSheetByName(nombre);
    if (!sh) sh = ss.insertSheet(nombre);
    const cols = HOJAS[nombre];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    // Todo como texto: así los códigos de barras no pierden ceros ni se vuelven 7,79E+12.
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  });
  const hoja1 = ss.getSheetByName('Hoja 1') || ss.getSheetByName('Sheet1');
  if (hoja1 && hoja1.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(hoja1);
  carpetaFotos_();
  bump_();
  return 'Listo';
}

function carpetaFotos_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('CARPETA_FOTOS');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const f = DriveApp.createFolder('Muestras · fotos');
  props.setProperty('CARPETA_FOTOS', f.getId());
  return f;
}

/* ───────────── Lectura ───────────── */

function hoja_(nombre) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(nombre);
  if (!sh && nombre === 'Prestamos') {          // hojas nuevas se crean solas
    sh = ss.insertSheet(nombre);
    const cols = HOJAS[nombre];
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  }
  return sh;
}

function filas_(nombre) {
  const sh = hoja_(nombre);
  if (!sh) throw new Error('Falta la hoja "' + nombre + '". Ejecutá configurar().');
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const cols = HOJAS[nombre];
  return sh.getRange(2, 1, n, cols.length).getDisplayValues().map(function (r, i) {
    const o = { _fila: i + 2 };
    cols.forEach(function (c, k) { o[c] = r[k]; });
    return o;
  });
}

function limpiar_(o) { const c = Object.assign({}, o); delete c._fila; return c; }

function getData() {
  const movs = filas_('Movimientos');
  return {
    rev: PropertiesService.getScriptProperties().getProperty('rev') || '0',
    cajas: filas_('Cajas').map(limpiar_),
    productos: filas_('Productos').map(limpiar_),
    stock: filas_('Stock').map(function (s) { return { codigo: s.codigo, caja: s.caja, cant: Number(s.cant) || 0, at: Number(s.at) || 0 }; }),
    movs: movs.slice(-MOVS_A_ENVIAR).reverse().map(function (m) { const x = limpiar_(m); x.at = Number(x.at) || 0; x.cant = Number(x.cant) || 0; return x; }),
    salidas: ultimasSalidas_(movs),
    prestamos: filas_('Prestamos').filter(function (p) { return !p.devuelto; }).map(function (p) { const x = limpiar_(p); x.cant = Number(x.cant) || 0; x.at = Number(x.at) || 0; return x; }),
  };
}

/** Por producto, la última vez que salió del estudio (devuelto, usado o descartado). */
function ultimasSalidas_(movs) {
  const out = {};
  movs.forEach(function (m) {
    if (['devolver', 'usada', 'descartar'].indexOf(m.tipo) < 0) return;
    const at = Number(m.at) || 0;
    if (!out[m.codigo] || out[m.codigo].at <= at) out[m.codigo] = { tipo: m.tipo, at: at, por: m.por || '', cant: Number(m.cant) || 0 };
  });
  return out;
}

function historial(codigo) {
  codigo = String(codigo || '');
  return filas_('Movimientos').filter(function (m) { return m.codigo === codigo; }).reverse()
    .map(function (m) { const x = limpiar_(m); x.at = Number(x.at) || 0; x.cant = Number(x.cant) || 0; return x; });
}

/* ───────────── Escritura (siempre con candado) ───────────── */

function conCandado_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { const r = fn(); bump_(); SpreadsheetApp.flush(); return r; }
  finally { lock.releaseLock(); }
}
function bump_() { PropertiesService.getScriptProperties().setProperty('rev', String(Date.now())); }

function escribir_(nombre, obj, fila) {
  const sh = hoja_(nombre);
  const cols = HOJAS[nombre];
  const valores = [cols.map(function (c) { return obj[c] === undefined || obj[c] === null ? '' : String(obj[c]); })];
  const f = fila || sh.getLastRow() + 1;
  sh.getRange(f, 1, 1, cols.length).setNumberFormat('@').setValues(valores);
}

function texto_(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max || 200); }

function guardarCaja(c) {
  return conCandado_(function () {
    const nombre = texto_(c.nombre, 80).toUpperCase().replace(/\s*-\s*/g, ' - ');
    if (!nombre) throw new Error('La caja necesita un nombre.');
    const cajas = filas_('Cajas');
    const id = texto_(c.id, 40) || ('c-' + Utilities.getUuid().slice(0, 8));
    if (cajas.some(function (x) { return x.id !== id && x.nombre.toLowerCase() === nombre.toLowerCase(); }))
      throw new Error('Ya hay una caja con ese nombre.');
    const ant = cajas.filter(function (x) { return x.id === id; })[0];
    escribir_('Cajas', {
      id: id, nombre: nombre, lugar: texto_(c.lugar, 80),
      creado: ant ? ant.creado : Date.now(), por: ant ? ant.por : texto_(c.por, 60),
    }, ant && ant._fila);
    const d = getData(); d.id = id; return d;
  });
}

function upsertProducto_(p, por) {
  const codigo = texto_(p.codigo, 60);
  if (!codigo) throw new Error('Falta el código del producto.');
  if (!texto_(p.nombre)) throw new Error('Falta el nombre del producto.');
  const ant = filas_('Productos').filter(function (x) { return x.codigo === codigo; })[0];
  const o = {};
  HOJAS.Productos.forEach(function (k) { o[k] = ant ? ant[k] : ''; });
  ['nombre', 'marca', 'cliente', 'proyecto', 'alto', 'ancho', 'prof', 'peso', 'foto'].forEach(function (k) {
    if (p[k] !== undefined) o[k] = texto_(p[k]);
  });
  o.codigo = codigo;
  o.actualizado = Date.now();
  if (ant && ant.foto && o.foto !== ant.foto) tirarFoto_(ant.foto); // la foto vieja ya no se usa
  if (!ant) { o.creado = Date.now(); o.por = texto_(por, 60); }
  escribir_('Productos', o, ant && ant._fila);
  return o;
}

function guardarProducto(p, por) {
  return conCandado_(function () { upsertProducto_(p, por); return getData(); });
}

function sumarStock_(codigo, caja, delta) {
  const st = filas_('Stock').filter(function (s) { return s.codigo === codigo && s.caja === caja; })[0];
  const cur = st ? Number(st.cant) || 0 : 0;
  const n = cur + delta;
  if (n < 0) throw new Error('No hay tantas unidades en esa caja (hay ' + cur + ').');
  escribir_('Stock', { codigo: codigo, caja: caja, cant: n, at: Date.now() }, st && st._fila);
}

function cajaExiste_(id) { return filas_('Cajas').some(function (c) { return c.id === id; }); }

/** Ingreso de un producto (nuevo o ya cargado) a una caja. */
function ingresar(d) {
  return conCandado_(function () {
    const cant = Math.floor(Number(d.cant));
    if (!(cant > 0)) throw new Error('La cantidad tiene que ser mayor a 0.');
    if (!cajaExiste_(d.caja)) throw new Error('Esa caja no existe.');
    let nombre;
    if (d.producto) nombre = upsertProducto_(d.producto, d.por).nombre;
    const codigo = texto_(d.producto ? d.producto.codigo : d.codigo, 60);
    if (!nombre) {
      const p = filas_('Productos').filter(function (x) { return x.codigo === codigo; })[0];
      if (!p) throw new Error('Ese producto no está cargado.');
      nombre = p.nombre;
    }
    sumarStock_(codigo, d.caja, cant);
    escribir_('Movimientos', { at: Date.now(), tipo: d.producto && d.nuevo ? 'ingreso' : 'agregar', codigo: codigo, nombre: nombre, desde: '', hacia: d.caja, cant: cant, nota: '', por: texto_(d.por, 60) });
    const r = getData(); r.codigo = codigo; return r;
  });
}

/** Mover entre cajas, devolver al cliente o descartar. */
function mover(d) {
  return conCandado_(function () {
    const tipo = ['mover', 'devolver', 'descartar'].indexOf(d.tipo) >= 0 ? d.tipo : null;
    if (!tipo) throw new Error('Acción desconocida.');
    const cant = Math.floor(Number(d.cant));
    if (!(cant > 0)) throw new Error('La cantidad tiene que ser mayor a 0.');
    const codigo = texto_(d.codigo, 60);
    const p = filas_('Productos').filter(function (x) { return x.codigo === codigo; })[0];
    if (!p) throw new Error('Ese producto no está cargado.');
    if (tipo === 'mover') {
      if (!cajaExiste_(d.hacia)) throw new Error('La caja de destino no existe.');
      if (d.hacia === d.desde) throw new Error('El destino es la misma caja.');
    }
    sumarStock_(codigo, d.desde, -cant);
    if (tipo === 'mover') sumarStock_(codigo, d.hacia, cant);
    escribir_('Movimientos', { at: Date.now(), tipo: tipo, codigo: codigo, nombre: p.nombre, desde: d.desde, hacia: tipo === 'mover' ? d.hacia : '', cant: cant, nota: texto_(d.nota, 200), por: texto_(d.por, 60) });
    return getData();
  });
}

/** Recibe una foto en base64 (ya achicada por la app) y devuelve su id de Drive.
 *  Si viene `reemplaza` (la foto anterior de esa misma carga), la manda a la papelera,
 *  salvo que algún producto guardado todavía la use. */
function subirFoto(base64, mime, nombre, reemplaza) {
  const bytes = Utilities.base64Decode(String(base64));
  if (bytes.length > 4 * 1024 * 1024) throw new Error('La foto es muy pesada.');
  const blob = Utilities.newBlob(bytes, mime || 'image/jpeg', texto_(nombre, 80) || ('muestra-' + Date.now() + '.jpg'));
  const file = carpetaFotos_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  if (reemplaza && reemplaza !== file.getId()) {
    const enUso = filas_('Productos').some(function (p) { return p.foto === reemplaza; });
    if (!enUso) tirarFoto_(reemplaza);
  }
  return { id: file.getId() };
}

/** Manda a la papelera de Drive una foto, solo si está en la carpeta de fotos de la app.
 *  (La papelera guarda los archivos 30 días, por si hace falta recuperar alguno.) */
function tirarFoto_(id) {
  try {
    const carpeta = carpetaFotos_().getId();
    const f = DriveApp.getFileById(String(id));
    const padres = f.getParents();
    while (padres.hasNext()) { if (padres.next().getId() === carpeta) { f.setTrashed(true); return true; } }
  } catch (e) {}
  return false;
}

/** Limpieza de una sola vez: corré esta función desde el editor (botón Ejecutar)
 *  y manda a la papelera las fotos de la carpeta que ningún producto usa. */
function limpiarFotos() {
  const usadas = {};
  filas_('Productos').forEach(function (p) { if (p.foto) usadas[p.foto] = 1; });
  const it = carpetaFotos_().getFiles(); let n = 0;
  while (it.hasNext()) { const f = it.next(); if (!usadas[f.getId()]) { f.setTrashed(true); n++; } }
  Logger.log('Fotos mandadas a la papelera: ' + n);
  return n;
}

/** Movimiento con varios productos a la vez, como en BoxHero.
 *  d = { tipo: 'ingresar'|'sacar'|'mover'|'prestar', items: [{codigo, cant, desde}],
 *        caja (destino para ingresar/mover), motivo (sacar: devolver|usada|descartar),
 *        a, hasta (prestar), nota, por } */
function transaccion(d) {
  return conCandado_(function () {
    const tipo = ['ingresar', 'sacar', 'mover', 'prestar'].indexOf(d.tipo) >= 0 ? d.tipo : null;
    if (!tipo) throw new Error('Tipo de movimiento desconocido.');
    const items = (d.items || []).filter(function (x) { return Math.floor(Number(x.cant)) > 0; });
    if (!items.length) throw new Error('No hay productos para registrar.');
    if ((tipo === 'ingresar' || tipo === 'mover') && !cajaExiste_(d.caja)) throw new Error('Elegí la caja.');
    if (tipo === 'prestar' && !texto_(d.a)) throw new Error('Falta a quién se presta.');
    const prods = {}; filas_('Productos').forEach(function (p) { prods[p.codigo] = p; });
    const motivo = ['devolver', 'usada', 'descartar'].indexOf(d.motivo) >= 0 ? d.motivo : 'descartar';
    const nota = texto_(d.nota, 200), por = texto_(d.por, 60), ahora = Date.now();
    // primero validar todo, después escribir (para no dejar movimientos a medias)
    items.forEach(function (x) {
      x.codigo = texto_(x.codigo, 60); x.cant = Math.floor(Number(x.cant));
      if (!prods[x.codigo]) throw new Error('El producto ' + x.codigo + ' no está cargado.');
      if (tipo !== 'ingresar') {
        const st = filas_('Stock').filter(function (s) { return s.codigo === x.codigo && s.caja === x.desde; })[0];
        const hay = st ? Number(st.cant) || 0 : 0;
        if (hay < x.cant) throw new Error('De ' + prods[x.codigo].nombre + ' hay ' + hay + ' en esa caja.');
        if (tipo === 'mover' && x.desde === d.caja) throw new Error(prods[x.codigo].nombre + ': el destino es la misma caja.');
      }
    });
    items.forEach(function (x, i) {
      const nombre = prods[x.codigo].nombre;
      if (tipo === 'ingresar') sumarStock_(x.codigo, d.caja, x.cant);
      else sumarStock_(x.codigo, x.desde, -x.cant);
      if (tipo === 'mover') sumarStock_(x.codigo, d.caja, x.cant);
      let notaMov = nota, tipoMov = { ingresar: 'agregar', mover: 'mover', prestar: 'prestar', sacar: motivo }[tipo];
      if (tipo === 'prestar') {
        notaMov = 'a ' + texto_(d.a, 60) + (d.hasta ? ', hasta ' + texto_(d.hasta, 10) : '') + (nota ? '. ' + nota : '');
        escribir_('Prestamos', { id: 'p-' + ahora + '-' + i, codigo: x.codigo, nombre: nombre, cant: x.cant, desde: x.desde,
          a: texto_(d.a, 60), hasta: texto_(d.hasta, 10), nota: nota, por: por, at: ahora, devuelto: '', vuelveA: '', devueltoPor: '' });
      }
      escribir_('Movimientos', { at: ahora, tipo: tipoMov, codigo: x.codigo, nombre: nombre,
        desde: tipo === 'ingresar' ? '' : x.desde, hacia: (tipo === 'ingresar' || tipo === 'mover') ? d.caja : '',
        cant: x.cant, nota: notaMov, por: por });
    });
    return getData();
  });
}

/** Vuelve un préstamo a una caja. */
function devolverPrestamo(d) {
  return conCandado_(function () {
    const p = filas_('Prestamos').filter(function (x) { return x.id === d.id; })[0];
    if (!p) throw new Error('No encontré ese préstamo.');
    if (p.devuelto) throw new Error('Ese préstamo ya se devolvió.');
    if (!cajaExiste_(d.caja)) throw new Error('Elegí a qué caja vuelve.');
    sumarStock_(p.codigo, d.caja, Number(p.cant) || 0);
    p.devuelto = Date.now(); p.vuelveA = d.caja; p.devueltoPor = texto_(d.por, 60);
    escribir_('Prestamos', p, p._fila);
    escribir_('Movimientos', { at: Date.now(), tipo: 'devolucion', codigo: p.codigo, nombre: p.nombre, desde: '', hacia: d.caja,
      cant: Number(p.cant) || 0, nota: 'lo tenía ' + p.a, por: texto_(d.por, 60) });
    return getData();
  });
}


/* ============ Búsqueda del código en tiendas online ============
 * Súper: Carrefour, Jumbo, Disco, Vea, Día y ChangoMás. Farmacia, skin care y maquillaje: Farmacity.
 * Todas tienen un catálogo público (VTEX) que se puede consultar por código de barras.
 * Primero se pregunta por el código exacto y, si nadie lo tiene, se hace una búsqueda por texto.
 * Lo encontrado se guarda 6 horas en caché; lo no encontrado, solo 20 minutos. */
const TIENDAS_ = [
  ['Carrefour', 'https://www.carrefour.com.ar'],
  ['Farmacity', 'https://www.farmacity.com'],
  ['Jumbo', 'https://www.jumbo.com.ar'],
  ['Día', 'https://diaonline.supermercadosdia.com.ar'],
  ['Disco', 'https://www.disco.com.ar'],
  ['Vea', 'https://www.vea.com.ar'],
  ['ChangoMás', 'https://www.masonline.com.ar']
];
const CABECERAS_ = {
  'Accept': 'application/json',
  'Accept-Language': 'es-AR,es;q=0.9',
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
};

function pedidosTiendas_(ean, porTexto) {
  return TIENDAS_.map(function (t) {
    const url = porTexto
      ? t[1] + '/api/io/_v/api/intelligent-search/product_search/?query=' + ean + '&count=5'
      : t[1] + '/api/catalog_system/pub/products/search?fq=alternateIds_Ean:' + ean;
    return { url: url, muteHttpExceptions: true, followRedirects: true, headers: CABECERAS_ };
  });
}

function leerProducto_(texto, ean, porTexto) {
  let j = JSON.parse(texto);
  const lista = porTexto ? (j && j.products) || [] : j || [];
  for (let k = 0; k < lista.length; k++) {
    const p = lista[k], items = p.items || [];
    const it = items.filter(function (x) { return String(x.ean) === ean || (x.referenceId || []).some(function (r) { return String(r.Value) === ean; }); })[0];
    if (porTexto && !it) continue;               // en la búsqueda por texto, solo si el código coincide
    const item = it || items[0] || {};
    const imgs = (item.images || []).map(function (i) { return i.imageUrl; }).filter(String);
    let nombre = String(item.nameComplete || p.productName || '').trim();
    if (items.length > 1 && item.name && nombre.indexOf(item.name) < 0) nombre += ' ' + item.name; // tono o variante
    if (!nombre) continue;
    return { nombre: nombre, marca: String(p.brand || '').trim(), imagen: imgs[0] || '', imagenes: imgs.slice(0, 4) };
  }
  return null;
}

function buscarEAN(ean) {
  ean = String(ean || '').replace(/\D/g, '');
  if (!/^\d{8,14}$/.test(ean)) return null;
  const cache = CacheService.getScriptCache(), clave = 'ean2_' + ean;
  const guardado = cache.get(clave);
  if (guardado) { const g = JSON.parse(guardado); return g && g.nombre ? g : null; }
  let res = null, sinFoto = null;
  [false, true].forEach(function (porTexto) {
    if (res) return;
    let resp = [];
    try { resp = UrlFetchApp.fetchAll(pedidosTiendas_(ean, porTexto)); } catch (e) { return; }
    for (let i = 0; i < resp.length && !res; i++) {
      try {
        if (resp[i].getResponseCode() !== 200) continue;
        const p = leerProducto_(resp[i].getContentText(), ean, porTexto);
        if (!p) continue;
        p.fuente = TIENDAS_[i][0];
        if (p.imagen) res = p; else if (!sinFoto) sinFoto = p;
      } catch (e) {}
    }
  });
  res = res || sinFoto;
  try { cache.put(clave, JSON.stringify(res || {}), res ? 21600 : 1200); } catch (e) {}
  return res;
}

/** Diagnóstico: qué le contesta cada tienda a Google. Lo usa la pantalla "Probar fotos" de la app. */
function diagTiendas(ean) {
  ean = String(ean || '7790895000997').replace(/\D/g, '');
  let resp = [];
  try { resp = UrlFetchApp.fetchAll(pedidosTiendas_(ean, false)); }
  catch (e) { return [{ tienda: 'Todas', codigo: 0, txt: String(e && e.message || e).slice(0, 160) }]; }
  return resp.map(function (r, i) {
    const c = r.getResponseCode(); let txt = '';
    try { const p = c === 200 ? leerProducto_(r.getContentText(), ean, false) : null; txt = p ? p.nombre + (p.imagen ? ' (con foto)' : '') : String(r.getContentText()).replace(/\s+/g, ' ').slice(0, 90); } catch (e) { txt = 'respuesta rara'; }
    return { tienda: TIENDAS_[i][0], codigo: c, txt: txt };
  });
}

/** Baja la foto del producto desde la tienda y la guarda en la carpeta de fotos. */
function fotoDeTienda(url, nombre, reemplaza) {
  url = String(url || '');
  if (!/^https:\/\/[a-z0-9.-]+\.(vtexassets\.com|vteximg\.com\.br|openfoodfacts\.org|openbeautyfacts\.org)\//i.test(url)) throw new Error('Esa foto no es de una tienda conocida.');
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('No se pudo bajar la foto.');
  const blob = r.getBlob();
  if (blob.getBytes().length > 4 * 1024 * 1024) throw new Error('La foto es muy pesada.');
  blob.setName(texto_(nombre, 80) || ('muestra-' + Date.now() + '.jpg'));
  const file = carpetaFotos_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  if (reemplaza && reemplaza !== file.getId()) {
    const enUso = filas_('Productos').some(function (p) { return p.foto === reemplaza; });
    if (!enUso) tirarFoto_(reemplaza);
  }
  return { id: file.getId() };
}

/** Para probar desde el editor (Ejecutar): busca un shampoo y un maquillaje y muestra el resultado.
 *  La primera vez Google te pide permiso para que el script se conecte a sitios externos. */
function probarBusqueda() {
  Logger.log(JSON.stringify(diagTiendas('7790895000997'), null, 1));
  Logger.log(JSON.stringify(buscarEAN('7891000359983')));
  Logger.log(JSON.stringify(buscarEAN('7501006721133')));
}
