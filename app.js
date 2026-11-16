'use strict';
/* ===== Utilidades ===== */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$ ' + (Number(n) || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = n => (Number(n) || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const fecha = iso => new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const nroRemito = r => String(r.pv).padStart(4, '0') + '-' + String(r.numero).padStart(8, '0');
const r2 = n => Math.round(n * 100) / 100;
const busca = (id, ph, cls = '') => `<div class="busca ${cls}"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></svg><input id="${id}" type="search" placeholder="${ph}" autocomplete="off"></div>`;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}
function parseNum(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[^\d.,-]/g, '');
  if (!s) return 0;
  const c = s.lastIndexOf(','), p = s.lastIndexOf('.');
  if (c > -1 && p > -1) s = c > p ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c > -1) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  return parseFloat(s) || 0;
}
function descargar(blob, nombre) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function modal(html) {
  const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div>' + html + '</div>';
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-cerrar]')) m.remove(); });
  document.body.appendChild(m); return m;
}

/* ===== Datos (guardados en el dispositivo, IndexedDB) ===== */
const store = {
  idb: null,
  open() {
    return new Promise(res => {
      try {
        const r = indexedDB.open('remitos-app', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => { this.idb = r.result; res(); };
        r.onerror = () => res();
      } catch (e) { res(); }
    });
  },
  get(k) {
    if (!this.idb) return Promise.resolve(undefined);
    return new Promise(res => {
      const q = this.idb.transaction('kv').objectStore('kv').get(k);
      q.onsuccess = () => res(q.result); q.onerror = () => res(undefined);
    });
  },
  set(k, v) {
    if (!this.idb) return Promise.resolve();
    return new Promise(res => {
      const t = this.idb.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k);
      t.oncomplete = () => res(); t.onerror = () => res(); t.onabort = () => res();
    });
  }
};
const db = {
  productos: [], clientes: [], remitos: [],
  config: { negocio: '', cuit: '', telefono: '', direccion: '', pv: 1, proximo: 1, logo: '', logoR: 1 },
  draft: { cliente: '', items: [], desc: 0, obs: '' },
  lic: { id: '', clave: '' }
};

/* ===== Versión de prueba y activación ===== */
const PRUEBA_MAX = 5;
const SECRETO = '0eab978cd096fd48b7b252c4d89187fc';
function hash53(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
const limpiar = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const claveDe = id => hash53(SECRETO + '|' + limpiar(id)).toString(36).toUpperCase().padStart(8, '0').slice(-8);
const activa = () => !!db.lic.clave && limpiar(db.lic.clave) === claveDe(db.lic.id);
const restantes = () => Math.max(0, PRUEBA_MAX - db.remitos.length);
const guardar = (...keys) => Promise.all(keys.map(k => store.set(k, db[k])));
const prod = id => db.productos.find(p => p.id === id);

/* ===== Navegación ===== */
let vista = 'nuevo';
const vistas = {};
function ir(v, arg) {
  vista = v;
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#titulo').textContent = db.config.negocio || 'Remitos';
  $('#logo').hidden = !db.config.logo; if (db.config.logo) $('#logo').src = db.config.logo;
  window.scrollTo(0, 0);
  vistas[v](arg);
}
$('#nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ir(b.dataset.v); });

/* ===== Nuevo remito ===== */
let paso = 'productos';
const cantDe = id => (db.draft.items.find(i => i.id === id) || {}).cant || 0;
function setCant(id, cant) {
  const p = prod(id); if (!p) return;
  cant = Math.max(0, r2(Number(cant) || 0));
  const i = db.draft.items.findIndex(x => x.id === id);
  if (cant <= 0) { if (i > -1) db.draft.items.splice(i, 1); }
  else if (i > -1) db.draft.items[i].cant = cant;
  else db.draft.items.push({ id, cant });
  store.set('draft', db.draft);
  pintarLista(); pintarCarrito();
}
function totales() {
  let sub = 0;
  db.draft.items.forEach(i => { const p = prod(i.id); if (p) sub += p.precio * i.cant; });
  sub = r2(sub);
  const d = Math.min(100, Math.max(0, Number(db.draft.desc) || 0));
  const descuento = r2(sub * d / 100);
  return { sub, d, descuento, total: r2(sub - descuento) };
}
function stepper(id, c) {
  return `<div class="stp"><button data-act="menos" aria-label="Quitar uno">−</button>
    <input type="number" inputmode="decimal" min="0" step="any" value="${c}" data-act="cant" aria-label="Cantidad">
    <button data-act="mas" aria-label="Agregar uno">+</button></div>`;
}
function pintarLista() {
  const box = $('#lista'); if (!box) return;
  const q = norm($('#q').value);
  const pal = q.split(/\s+/).filter(Boolean);
  let l = db.productos.filter(p => { const t = norm(p.nombre + ' ' + p.codigo); return pal.every(w => t.includes(w)); });
  const total = l.length; l = l.slice(0, 80);
  if (!db.productos.length) {
    box.innerHTML = `<div class="card"><h2>Todavía no hay productos</h2><p class="mut">Cargá la planilla de Excel con los precios para empezar a hacer remitos.</p><button class="btn pri" id="ir-prod">Cargar productos</button></div>`;
    $('#ir-prod').onclick = () => ir('productos');
  } else {
    box.innerHTML = l.map(p => {
      const c = cantDe(p.id);
      return `<div class="prod ${c ? 'sel' : ''}" data-id="${p.id}">
        <div class="pi"><b>${esc(p.nombre)}</b>${p.codigo ? `<div class="meta">${esc(p.codigo)}</div>` : ''}</div>
        <div class="pr"><div class="pp">${money(p.precio)}</div>
        ${c ? stepper(p.id, c) : `<button class="mas" data-act="mas" aria-label="Agregar ${esc(p.nombre)}">+</button>`}</div>
      </div>`;
    }).join('') + (total > l.length ? `<p class="mut">Se muestran ${l.length} de ${total}. Escribí en el buscador para encontrar el resto.</p>` : '') +
      (!total ? `<p class="mut">Ningún producto coincide con “${esc($('#q').value)}”.</p>` : '');
  }
  const t = totales(), n = db.draft.items.length;
  const b = $('#barra');
  b.style.display = n ? '' : 'none';
  const txt = `<span>${n} producto${n === 1 ? '' : 's'}</span><span class="ver">${money(t.total)} ›</span>`;
  b.innerHTML = txt;
}
function pintarCarrito() {
  const box = $('#cart'); if (!box) return;
  box.innerHTML = db.draft.items.length ? db.draft.items.map(i => {
    const p = prod(i.id); if (!p) return '';
    return `<div class="citem" data-id="${p.id}"><div class="pi"><b>${esc(p.nombre)}</b>
      <div class="meta"><span>${money(p.precio)} c/u</span><span class="imp">${money(p.precio * i.cant)}</span></div></div>${stepper(p.id, i.cant)}</div>`;
  }).join('') : `<div class="vacio">Agregá productos desde la lista y aparecen acá.</div>`;
  const t = totales();
  $('#tot').innerHTML = (t.descuento ? `<div class="sub"><span>Subtotal</span><span>${money(t.sub)}</span></div>
    <div class="sub"><span>Descuento ${num(t.d)}%</span><span>− ${money(t.descuento)}</span></div>` : '') +
    `<div class="tot"><span>Total</span><span>${money(t.total)}</span></div>`;
}
function accionCant(e) {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const id = el.closest('[data-id]').dataset.id, a = el.dataset.act;
  if (e.type === 'click' && a === 'mas') setCant(id, cantDe(id) + 1);
  else if (e.type === 'click' && a === 'menos') setCant(id, cantDe(id) - 1);
  else if (e.type === 'change' && a === 'cant') setCant(id, parseNum(el.value));
}
vistas.nuevo = () => {
  const d = db.draft;
  $('#view').innerHTML = `<div class="nuevo" data-paso="${paso}">
    <section class="col-prod">
      ${activa() ? '' : `<div class="aviso">${restantes() ? `Versión de prueba: ${restantes() === 1 ? 'queda 1 remito' : 'quedan ' + restantes() + ' remitos'} de ${PRUEBA_MAX}.` : 'La prueba terminó. Activá la app en Ajustes para seguir haciendo remitos.'}</div>`}
      ${busca('q', 'Buscar producto o código')}
      <div id="lista" style="margin-top:12px"></div>
    </section>
    <section class="col-cart">
      <button class="btn sm volver" id="volver" style="margin-bottom:14px">‹ Seguir agregando</button>
      <div class="papel">
      <div class="papel-cab"><h2>Remito</h2><div><span class="nro">N° ${nroRemito({ pv: db.config.pv, numero: db.config.proximo })}</span><small>${fecha(new Date())}</small></div></div>
      <label>Cliente<input id="cli" list="dl-cli" placeholder="Nombre del comercio" value="${esc(d.cliente)}" autocomplete="off"></label>
      <datalist id="dl-cli">${db.clientes.map(c => `<option value="${esc(c.nombre)}">`).join('')}</datalist>
      <div id="cart"></div>
      <div class="row" style="margin-top:12px">
        <label style="width:120px">Descuento %<input id="desc" type="number" inputmode="decimal" min="0" max="100" value="${d.desc || ''}" placeholder="0"></label>
        <label class="grow">Observaciones<input id="obs" value="${esc(d.obs)}" placeholder="Opcional"></label>
      </div>
      <div id="tot"></div>
      <button class="btn pri big" id="confirmar">Confirmar remito</button>
      </div>
      <button class="btn sm red" id="vaciar" style="margin-top:14px">Vaciar remito</button>
    </section>
    <button class="barra" id="barra"></button>
  </div>`;
  const setPaso = p => { paso = p; $('.nuevo').dataset.paso = p; window.scrollTo(0, 0); };
  $('#q').addEventListener('input', pintarLista);
  $('#lista').addEventListener('click', accionCant); $('#lista').addEventListener('change', accionCant);
  $('#cart').addEventListener('click', accionCant); $('#cart').addEventListener('change', accionCant);
  $('#barra').addEventListener('click', () => setPaso('carrito'));
  $('#volver').addEventListener('click', () => setPaso('productos'));
  $('#cli').addEventListener('input', e => { d.cliente = e.target.value; store.set('draft', d); });
  $('#obs').addEventListener('input', e => { d.obs = e.target.value; store.set('draft', d); });
  $('#desc').addEventListener('input', e => { d.desc = parseNum(e.target.value); store.set('draft', d); pintarCarrito(); pintarLista(); });
  $('#vaciar').addEventListener('click', () => {
    if (!d.items.length || confirm('¿Vaciar el remito en curso?')) { db.draft = { cliente: '', items: [], desc: 0, obs: '' }; store.set('draft', db.draft); paso = 'productos'; ir('nuevo'); }
  });
  $('#confirmar').addEventListener('click', confirmar);
  pintarLista(); pintarCarrito();
};
async function confirmar() {
  const d = db.draft, nombre = d.cliente.trim();
  if (!activa() && !restantes()) {
    const m = modal(`<h2>La prueba terminó</h2><p>La versión de prueba permite hacer ${PRUEBA_MAX} remitos. Para seguir, activá la app con tu clave. Los remitos que ya hiciste quedan guardados.</p>
      <div class="row"><button class="btn pri grow" id="ir-act">Activar la app</button><button class="btn" data-cerrar>Cerrar</button></div>`);
    $('#ir-act', m).onclick = () => { m.remove(); ir('ajustes'); };
    return;
  }
  if (!d.items.length) return toast('Agregá al menos un producto');
  if (!nombre) { toast('Falta el nombre del cliente'); $('#cli').focus(); return; }
  let cli = db.clientes.find(c => norm(c.nombre) === norm(nombre));
  if (!cli) { cli = { id: uid(), nombre, direccion: '', telefono: '', cuit: '' }; db.clientes.push(cli); }
  const t = totales();
  const r = {
    id: uid(), pv: db.config.pv, numero: db.config.proximo, fecha: new Date().toISOString(),
    cliente: { ...cli }, obs: d.obs.trim(), subtotal: t.sub, descPct: t.d, descuento: t.descuento, total: t.total, anulado: false,
    items: d.items.map(i => { const p = prod(i.id); return { pid: p.id, codigo: p.codigo, nombre: p.nombre, precio: p.precio, cant: i.cant }; })
  };
  db.remitos.unshift(r); db.config.proximo++;
  db.draft = { cliente: '', items: [], desc: 0, obs: '' }; paso = 'productos';
  await guardar('remitos', 'clientes', 'config', 'draft');
  ir('hecho', r);
}
vistas.hecho = r => {
  document.querySelector('#nav [data-v=nuevo]').classList.add('on');
  $('#view').innerHTML = `<div class="card listo"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="24"/><path d="M14 25l7 7 13-15"/></svg>
    <h2>Remito guardado</h2><span class="nro">N° ${nroRemito(r)}</span>
    <p><b>${esc(r.cliente.nombre)}</b><br><span class="pp" style="font-size:30px">${money(r.total)}</span></p>

    <button class="btn pri big" id="comp">Enviar PDF por WhatsApp</button>
    <div class="row" style="margin-top:10px;justify-content:center">
      <button class="btn" id="desc-pdf">Descargar PDF</button>
      <button class="btn" id="otro">Nuevo remito</button></div></div>`;
  $('#comp').onclick = () => compartir(r);
  $('#desc-pdf').onclick = () => bajarPDF(r);
  $('#otro').onclick = () => ir('nuevo');
};

/* ===== PDF ===== */
function hacerPDF(r) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const c = db.config, M = 14, W = 210, R = W - M;
  let y = 18, x0 = M;
  if (c.logo) {
    let h = 22, w = h * (c.logoR || 1); if (w > 45) { w = 45; h = w / (c.logoR || 1); }
    try { doc.addImage(c.logo, 'JPEG', M, 10, w, h); x0 = M + w + 5; } catch (e) { /* imagen inválida: sigue sin logo */ }
  }
  doc.setFont('helvetica', 'bold').setFontSize(17).text(c.negocio || 'Remito', x0, y);
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  [c.direccion, c.telefono && 'Tel.: ' + c.telefono, c.cuit && 'CUIT: ' + c.cuit].filter(Boolean).forEach(l => { y += 5; doc.text(String(l), x0, y); });
  doc.setDrawColor(60).rect(R - 62, 10, 62, 24);
  doc.setFont('helvetica', 'bold').setFontSize(14).text('REMITO', R - 31, 17, { align: 'center' });
  doc.setFontSize(11).text('N° ' + nroRemito(r), R - 31, 23.5, { align: 'center' });
  doc.setFont('helvetica', 'normal').setFontSize(10).text('Fecha: ' + fecha(r.fecha), R - 31, 29.5, { align: 'center' });
  y = Math.max(y, 34) + 8;
  doc.setDrawColor(200).line(M, y - 5, R, y - 5);
  doc.setFont('helvetica', 'bold').setFontSize(11).text('Cliente: ' + r.cliente.nombre, M, y);
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  const extra = [r.cliente.direccion, r.cliente.telefono && 'Tel.: ' + r.cliente.telefono, r.cliente.cuit && 'CUIT: ' + r.cliente.cuit].filter(Boolean).join('  ·  ');
  if (extra) { y += 5; doc.text(extra, M, y); }
  if (r.anulado) { doc.setTextColor(200, 0, 0).setFont('helvetica', 'bold').setFontSize(13).text('ANULADO', R, y, { align: 'right' }); doc.setTextColor(0); }
  y += 7;
  const X = { cant: M + 16, cod: M + 19, desc: M + 46, pu: R - 30, imp: R - 1 };
  const cabecera = () => {
    doc.setFillColor(235).rect(M, y - 4.5, R - M, 7, 'F');
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(0);
    doc.text('Cant.', X.cant, y, { align: 'right' }); doc.text('Código', X.cod, y); doc.text('Descripción', X.desc, y);
    doc.text('P. unit.', X.pu, y, { align: 'right' }); doc.text('Importe', X.imp, y, { align: 'right' });
    y += 7; doc.setFont('helvetica', 'normal');
  };
  cabecera();
  r.items.forEach(i => {
    const lineas = doc.splitTextToSize(String(i.nombre), X.pu - 26 - X.desc);
    const h = lineas.length * 4.4 + 2;
    if (y + h > 272) { doc.addPage(); y = 18; cabecera(); }
    doc.text(num(i.cant), X.cant, y, { align: 'right' });
    doc.text(String(i.codigo || '').slice(0, 14), X.cod, y);
    doc.text(lineas, X.desc, y);
    doc.text(money(i.precio), X.pu, y, { align: 'right' });
    doc.text(money(i.precio * i.cant), X.imp, y, { align: 'right' });
    y += h; doc.setDrawColor(225).line(M, y - 3.6, R, y - 3.6);
  });
  if (y > 240) { doc.addPage(); y = 20; }
  y += 3;
  if (r.descuento) {
    doc.setFontSize(10).text('Subtotal', X.pu, y, { align: 'right' }); doc.text(money(r.subtotal), X.imp, y, { align: 'right' }); y += 5.5;
    doc.text('Descuento ' + num(r.descPct) + '%', X.pu, y, { align: 'right' }); doc.text('- ' + money(r.descuento), X.imp, y, { align: 'right' }); y += 7;
  }
  doc.setFont('helvetica', 'bold').setFontSize(13).text('TOTAL', X.pu, y, { align: 'right' }); doc.text(money(r.total), X.imp, y, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(9.5);
  if (r.obs) { y += 9; doc.text(doc.splitTextToSize('Observaciones: ' + r.obs, R - M), M, y); }
  doc.setDrawColor(90).line(R - 62, 276, R, 276);
  doc.setFontSize(9).text('Recibí conforme', R - 31, 280.5, { align: 'center' });
  doc.setTextColor(110).text('Documento no válido como factura', M, 280.5);
  if (!activa()) {
    for (let i = 1; i <= doc.getNumberOfPages(); i++) {
      doc.setPage(i); doc.saveGraphicsState();
      try { doc.setGState(new doc.GState({ opacity: 0.16 })); } catch (e) { /* sin transparencia */ }
      doc.setFont('helvetica', 'bold').setFontSize(54).setTextColor(200, 16, 46);
      const mt = 'VERSIÓN DE PRUEBA', k = doc.getTextWidth(mt) / 2 * Math.SQRT1_2;
      doc.text(mt, 105 - k, 150 + k, { angle: 45 });
      doc.restoreGraphicsState();
    }
  }
  return doc;
}
const nombrePDF = r => `Remito ${nroRemito(r)} - ${r.cliente.nombre.replace(/[\\/:*?"<>|]/g, '')}.pdf`;
function bajarPDF(r) { descargar(hacerPDF(r).output('blob'), nombrePDF(r)); }
async function compartir(r) {
  const file = new File([hacerPDF(r).output('blob')], nombrePDF(r), { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Remito ' + nroRemito(r) }); } catch (e) { /* cancelado */ }
  } else { descargar(file, file.name); toast('Este equipo no permite compartir directo: se descargó el PDF para adjuntarlo'); }
}

/* ===== Historial ===== */
vistas.remitos = () => {
  $('#view').innerHTML = `${busca('qr', 'Buscar por cliente o número')}<div id="lr" style="margin-top:12px"></div>`;
  const pintar = () => {
    const q = norm($('#qr').value);
    const l = db.remitos.filter(r => norm(r.cliente.nombre + ' ' + nroRemito(r)).includes(q)).slice(0, 150);
    $('#lr').innerHTML = l.length ? l.map(r => `<div class="card ${r.anulado ? 'anulado' : ''}" data-id="${r.id}">
      <div class="rem-cab"><b>${esc(r.cliente.nombre)}</b><span class="pp">${money(r.total)}</span></div>
      <div class="meta"><span class="nro" style="font-size:16px">N° ${nroRemito(r)}</span><span>${fecha(r.fecha)}</span><span>${r.items.length} producto${r.items.length === 1 ? '' : 's'}</span>${r.anulado ? '<span class="tag">Anulado</span>' : ''}</div>
      <div class="row" style="margin-top:12px"><button class="btn sm pri" data-a="comp">Enviar</button><button class="btn sm" data-a="pdf">PDF</button>
      <button class="btn sm" data-a="ver">Ver detalle</button>${r.anulado ? '' : '<button class="btn sm red" data-a="anular">Anular</button>'}</div></div>`).join('')
      : `<div class="card mut">${db.remitos.length ? 'Ningún remito coincide con la búsqueda.' : 'Los remitos que confirmes van a quedar guardados acá, para reenviarlos o anularlos.'}</div>`;
  };
  $('#qr').addEventListener('input', pintar);
  $('#lr').addEventListener('click', async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const r = db.remitos.find(x => x.id === b.closest('[data-id]').dataset.id);
    if (b.dataset.a === 'comp') compartir(r);
    if (b.dataset.a === 'pdf') bajarPDF(r);
    if (b.dataset.a === 'ver') modal(`<h2>Remito N° ${nroRemito(r)}</h2><p>${esc(r.cliente.nombre)} · ${fecha(r.fecha)}</p>
      <table><tr><th>Cant.</th><th>Producto</th><th>Importe</th></tr>${r.items.map(i => `<tr><td>${num(i.cant)}</td><td>${esc(i.nombre)}</td><td>${money(i.precio * i.cant)}</td></tr>`).join('')}</table>
      ${r.descuento ? `<p class="mut">Descuento ${num(r.descPct)}%: − ${money(r.descuento)}</p>` : ''}<div class="tot"><span>Total</span><span>${money(r.total)}</span></div>
      ${r.obs ? `<p class="mut">${esc(r.obs)}</p>` : ''}<button class="btn big" data-cerrar>Cerrar</button>`);
    if (b.dataset.a === 'anular' && confirm(`¿Anular el remito ${nroRemito(r)}? Queda guardado, marcado como anulado.`)) {
      r.anulado = true;
      await guardar('remitos'); pintar(); toast('Remito anulado');
    }
  });
  pintar();
};

/* ===== Productos ===== */
vistas.productos = () => {
  $('#view').innerHTML = `<div class="row">${busca('qp', 'Buscar producto', 'grow')}
    <button class="btn pri" id="np">+ Producto</button><button class="btn" id="imp">Importar Excel</button>
    <input type="file" id="fx" accept=".xlsx,.xls,.csv,.ods" hidden></div>
    <p class="mut" id="resumen"></p><div id="lp"></div>`;
  const pintar = () => {
    const q = norm($('#qp').value);
    const l = db.productos.filter(p => norm(p.nombre + ' ' + p.codigo).includes(q));
    $('#resumen').textContent = `${db.productos.length} productos en la lista`;
    $('#lp').innerHTML = l.slice(0, 200).map(p => `<div class="prod" data-id="${p.id}" style="cursor:pointer">
      <div class="pi"><b>${esc(p.nombre)}</b>${p.codigo ? `<div class="meta">${esc(p.codigo)}</div>` : ''}</div>
      <div class="pp">${money(p.precio)}</div></div>`).join('')
      || `<div class="card mut">${db.productos.length ? 'Ningún producto coincide con la búsqueda.' : 'Tocá “Importar Excel” y elegí la planilla de precios. También podés cargar productos de a uno.'}</div>`;
  };
  $('#qp').addEventListener('input', pintar);
  $('#np').onclick = () => editarProducto(null, pintar);
  $('#imp').onclick = () => $('#fx').click();
  $('#fx').onchange = e => { if (e.target.files[0]) importarExcel(e.target.files[0], pintar); e.target.value = ''; };
  $('#lp').addEventListener('click', e => { const d = e.target.closest('[data-id]'); if (d) editarProducto(prod(d.dataset.id), pintar); });
  pintar();
};
function editarProducto(p, alGuardar) {
  const n = !p; p = p || { id: uid(), codigo: '', nombre: '', precio: 0 };
  const m = modal(`<h2>${n ? 'Nuevo producto' : 'Editar producto'}</h2>
    <label>Descripción<input id="f-n" value="${esc(p.nombre)}"></label>
    <label>Código<input id="f-c" value="${esc(p.codigo)}"></label>
    <label>Precio<input id="f-p" type="number" inputmode="decimal" step="any" value="${p.precio || ''}"></label>
    <div class="row"><button class="btn pri grow" id="f-ok">Guardar</button><button class="btn" data-cerrar>Cancelar</button>
    ${n ? '' : '<button class="btn red" id="f-del">Eliminar</button>'}</div>`);
  $('#f-ok', m).onclick = async () => {
    const nombre = $('#f-n', m).value.trim(); if (!nombre) return toast('Falta la descripción');
    Object.assign(p, { nombre, codigo: $('#f-c', m).value.trim(), precio: parseNum($('#f-p', m).value) });
    if (n) db.productos.push(p);
    db.productos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    await guardar('productos'); m.remove(); alGuardar();
  };
  if (!n) $('#f-del', m).onclick = async () => {
    if (!confirm('¿Eliminar este producto?')) return;
    db.productos = db.productos.filter(x => x.id !== p.id);
    db.draft.items = db.draft.items.filter(i => i.id !== p.id);
    await guardar('productos', 'draft'); m.remove(); alGuardar();
  };
}

/* ===== Importar planilla de Excel ===== */
async function importarExcel(file, alTerminar) {
  let wb;
  try { wb = XLSX.read(await file.arrayBuffer()); } catch (e) { return toast('No se pudo leer el archivo'); }
  const CAMPOS = [['nombre', 'Descripción *', /desc|producto|nombre|detalle|art[ií]culo|item/i], ['codigo', 'Código', /c[oó]d|sku|ref/i],
    ['precio', 'Precio *', /precio|importe|valor|pvp|lista|\$/i]];
  const m = modal(`<h2>Importar planilla</h2>
    <label>Hoja<select id="i-h">${wb.SheetNames.map(n => `<option>${esc(n)}</option>`).join('')}</select></label>
    <p class="mut">Indicá qué columna de la planilla corresponde a cada dato.</p>
    <div id="i-map"></div>
    <label class="chk"><input type="radio" name="modo" value="act" checked>Actualizar precios y agregar los nuevos</label>
    <label class="chk"><input type="radio" name="modo" value="rep">Reemplazar toda la lista</label>
    <div id="i-prev" style="overflow:auto;margin:10px 0"></div>
    <div class="row"><button class="btn pri grow" id="i-ok">Importar</button><button class="btn" data-cerrar>Cancelar</button></div>`);
  let rows = [], hi = 0, cols = [];
  const leerHoja = () => {
    rows = XLSX.utils.sheet_to_json(wb.Sheets[$('#i-h', m).value], { header: 1, defval: '', raw: true });
    let best = -1; hi = -1;
    rows.slice(0, 25).forEach((r, i) => {
      const sc = CAMPOS.filter(c => r.some(x => typeof x === 'string' && c[2].test(x))).length;
      if (sc > best && sc >= 2) { best = sc; hi = i; }
    });
    const ancho = Math.max(0, ...rows.slice(0, 50).map(r => r.length));
    cols = Array.from({ length: ancho }, (_, i) => (hi > -1 && String(rows[hi][i] ?? '').trim()) || 'Columna ' + XLSX.utils.encode_col(i));
    const usados = new Set();
    $('#i-map', m).innerHTML = '<div class="row">' + CAMPOS.map(([k, lbl, re]) => {
      let g = hi > -1 ? cols.findIndex((c, i) => !usados.has(i) && re.test(c)) : -1;
      if (g > -1) usados.add(g);
      return `<label class="grow">${lbl}<select data-k="${k}"><option value="-1">— no tiene —</option>${cols.map((c, i) => `<option value="${i}" ${i === g ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`;
    }).join('') + '</div>';
    previa();
  };
  const leer = () => {
    const ix = {}; m.querySelectorAll('[data-k]').forEach(s => ix[s.dataset.k] = +s.value);
    const out = [];
    rows.slice(hi + 1).forEach(r => {
      const nombre = ix.nombre > -1 ? String(r[ix.nombre] ?? '').trim() : '';
      if (!nombre) return;
      const pr = ix.precio > -1 ? r[ix.precio] : '';
      if (ix.precio > -1 && pr === '' ) return;
      out.push({ nombre, codigo: ix.codigo > -1 ? String(r[ix.codigo] ?? '').trim() : '', precio: r2(parseNum(pr)) });
    });
    return { ix, out };
  };
  const previa = () => {
    const { out } = leer();
    $('#i-prev', m).innerHTML = out.length ? `<p class="mut">${out.length} productos encontrados. Primeros:</p><table><tr><th>Código</th><th>Descripción</th><th>Precio</th></tr>` +
      out.slice(0, 5).map(p => `<tr><td>${esc(p.codigo)}</td><td>${esc(p.nombre)}</td><td>${money(p.precio)}</td></tr>`).join('') + '</table>'
      : '<p class="bad">Elegí al menos la columna de descripción y la de precio.</p>';
  };
  $('#i-h', m).onchange = leerHoja; $('#i-map', m).addEventListener('change', previa);
  $('#i-ok', m).onclick = async () => {
    const { ix, out } = leer();
    if (ix.nombre < 0 || ix.precio < 0 || !out.length) return toast('Faltan columnas o no hay productos');
    const rep = m.querySelector('[name=modo]:checked').value === 'rep';
    if (rep && db.productos.length && !confirm('Se va a reemplazar toda la lista de productos actual. ¿Continuar?')) return;
    let nuevos = 0, act = 0;
    if (rep) { db.productos = []; db.draft.items = []; }
    const porCod = new Map(), porNom = new Map();
    db.productos.forEach(p => { if (p.codigo) porCod.set(norm(p.codigo), p); porNom.set(norm(p.nombre), p); });
    out.forEach(o => {
      const p = (o.codigo && porCod.get(norm(o.codigo))) || porNom.get(norm(o.nombre));
      if (p) { p.precio = o.precio; p.nombre = o.nombre; if (o.codigo) p.codigo = o.codigo; act++; }
      else { const n = { id: uid(), codigo: o.codigo, nombre: o.nombre, precio: o.precio }; db.productos.push(n); if (n.codigo) porCod.set(norm(n.codigo), n); porNom.set(norm(n.nombre), n); nuevos++; }
    });
    db.productos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    await guardar('productos', 'draft'); m.remove(); alTerminar();
    toast(`${nuevos} productos nuevos, ${act} actualizados`);
  };
  leerHoja();
}

/* ===== Clientes ===== */
vistas.clientes = () => {
  $('#view').innerHTML = `<div class="row">${busca('qc', 'Buscar cliente', 'grow')}<button class="btn pri" id="nc">+ Cliente</button></div><div id="lc" style="margin-top:10px"></div>`;
  const pintar = () => {
    const q = norm($('#qc').value);
    $('#lc').innerHTML = db.clientes.filter(c => norm(c.nombre).includes(q)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map(c => `<div class="prod" data-id="${c.id}" style="cursor:pointer"><div class="pi"><b>${esc(c.nombre)}</b><div class="meta">${[c.direccion, c.telefono].filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('') || '<span>Tocá para completar dirección y teléfono</span>'}</div></div></div>`).join('')
      || `<div class="card mut">Los clientes se guardan solos cuando les hacés el primer remito.</div>`;
  };
  const editar = c => {
    const n = !c; c = c || { id: uid(), nombre: '', direccion: '', telefono: '', cuit: '' };
    const m = modal(`<h2>${n ? 'Nuevo cliente' : 'Editar cliente'}</h2>
      <label>Nombre / comercio<input id="c-n" value="${esc(c.nombre)}"></label><label>Dirección<input id="c-d" value="${esc(c.direccion)}"></label>
      <div class="row"><label class="grow">Teléfono<input id="c-t" inputmode="tel" value="${esc(c.telefono)}"></label><label class="grow">CUIT<input id="c-c" value="${esc(c.cuit)}"></label></div>
      <div class="row"><button class="btn pri grow" id="c-ok">Guardar</button><button class="btn" data-cerrar>Cancelar</button>${n ? '' : '<button class="btn red" id="c-del">Eliminar</button>'}</div>`);
    $('#c-ok', m).onclick = async () => {
      const nombre = $('#c-n', m).value.trim(); if (!nombre) return toast('Falta el nombre');
      Object.assign(c, { nombre, direccion: $('#c-d', m).value.trim(), telefono: $('#c-t', m).value.trim(), cuit: $('#c-c', m).value.trim() });
      if (n) db.clientes.push(c);
      await guardar('clientes'); m.remove(); pintar();
    };
    if (!n) $('#c-del', m).onclick = async () => { if (confirm('¿Eliminar este cliente? Sus remitos se conservan.')) { db.clientes = db.clientes.filter(x => x.id !== c.id); await guardar('clientes'); m.remove(); pintar(); } };
  };
  $('#qc').addEventListener('input', pintar);
  $('#nc').onclick = () => editar(null);
  $('#lc').addEventListener('click', e => { const d = e.target.closest('[data-id]'); if (d) editar(db.clientes.find(c => c.id === d.dataset.id)); });
  pintar();
};

/* ===== Ajustes ===== */
vistas.ajustes = () => {
  const c = db.config;
  $('#view').innerHTML = `<div class="card"><h2>Datos que salen en el remito</h2>
    <label>Nombre del negocio<input data-c="negocio" value="${esc(c.negocio)}"></label>
    <label>Dirección<input data-c="direccion" value="${esc(c.direccion)}"></label>
    <div class="row"><label class="grow">Teléfono<input data-c="telefono" value="${esc(c.telefono)}"></label><label class="grow">CUIT<input data-c="cuit" value="${esc(c.cuit)}"></label></div>
    <div class="row"><label class="grow">Punto de venta<input data-c="pv" type="number" min="1" value="${c.pv}"></label><label class="grow">Próximo número<input data-c="proximo" type="number" min="1" value="${c.proximo}"></label></div>
    <label>Logo del negocio (sale en la app y en el remito)</label>
    <div class="row">${c.logo ? `<img src="${c.logo}" alt="Logo" style="height:48px;max-width:140px;object-fit:contain">` : ''}
      <button class="btn sm" id="lg">${c.logo ? 'Cambiar logo' : 'Elegir imagen'}</button>${c.logo ? '<button class="btn sm red" id="lgx">Quitar</button>' : ''}
      <input type="file" id="flg" accept="image/*" hidden></div></div>
  <div class="card"><h2>Licencia</h2>${activa() ? '<p>App activada. Sin límite de remitos.</p>' : `
    <p>Versión de prueba: usaste ${Math.min(PRUEBA_MAX, db.remitos.length)} de ${PRUEBA_MAX} remitos. Los PDF salen con la marca “Versión de prueba”.</p>
    <p>Código de este equipo: <b style="font-size:20px;letter-spacing:.08em">${db.lic.id}</b><br><span class="mut">Pasale este código a quien te vendió la app para recibir tu clave.</span></p>
    <div class="row"><input id="clave" class="grow" placeholder="Clave de activación" autocomplete="off" autocapitalize="characters"><button class="btn pri" id="act">Activar</button></div>`}</div>
  <div class="card"><h2>Copia de seguridad</h2>
    <p class="mut">Todo se guarda solo en este dispositivo. Hacé una copia seguido (por ejemplo al terminar el día) y guardala en WhatsApp, Drive o mail. También sirve para pasar los datos a otro equipo.</p>
    <div class="row"><button class="btn pri" id="bk">Guardar copia</button><button class="btn" id="rs">Restaurar copia</button><input type="file" id="frs" accept=".json,application/json" hidden></div></div>
  <div class="card"><h2>Exportar a Excel</h2>
    <div class="row"><button class="btn" id="xv">Ventas (remitos)</button><button class="btn" id="xs">Lista de precios</button></div></div>
  <p class="mut" id="almac"></p>`;
  $('#view').addEventListener('change', async e => {
    const k = e.target.dataset.c; if (!k) return;
    if (k === 'pv' || k === 'proximo') c[k] = Math.max(1, parseInt(e.target.value) || 1);
    else c[k] = e.target.value.trim();
    await guardar('config'); $('#titulo').textContent = c.negocio || 'Remitos'; toast('Guardado');
  });
  if ($('#act')) $('#act').onclick = async () => {
    if (limpiar($('#clave').value) !== claveDe(db.lic.id)) return toast('La clave no corresponde a este equipo');
    db.lic.clave = limpiar($('#clave').value); await guardar('lic'); ir('ajustes'); toast('App activada');
  };
  $('#lg').onclick = () => $('#flg').click();
  $('#flg').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const img = new Image();
    img.onload = async () => {
      const k = Math.min(1, 400 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, cv.width, cv.height); g.drawImage(img, 0, 0, cv.width, cv.height);
      c.logo = cv.toDataURL('image/jpeg', 0.9); c.logoR = cv.width / cv.height;
      await guardar('config'); ir('ajustes'); toast('Logo guardado');
    };
    img.onerror = () => toast('No se pudo leer la imagen');
    img.src = URL.createObjectURL(f);
  };
  if ($('#lgx')) $('#lgx').onclick = async () => { c.logo = ''; await guardar('config'); ir('ajustes'); };
  const hoy = new Date().toISOString().slice(0, 10);
  $('#bk').onclick = async () => {
    const file = new File([JSON.stringify({ app: 'remitos', v: 1, fecha: new Date().toISOString(), productos: db.productos, clientes: db.clientes, remitos: db.remitos, config: db.config })], `copia-remitos-${hoy}.json`, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: 'Copia de seguridad' }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    descargar(file, file.name);
  };
  $('#rs').onclick = () => $('#frs').click();
  $('#frs').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'remitos' || !Array.isArray(d.productos)) throw 0;
      if (!confirm(`La copia es del ${fecha(d.fecha)} y tiene ${d.productos.length} productos y ${d.remitos.length} remitos. Va a reemplazar TODO lo que hay en este dispositivo. ¿Continuar?`)) return;
      db.productos = d.productos; db.clientes = d.clientes || []; db.remitos = d.remitos || []; Object.assign(db.config, d.config || {});
      db.draft = { cliente: '', items: [], desc: 0, obs: '' };
      await guardar('productos', 'clientes', 'remitos', 'config', 'draft'); toast('Copia restaurada'); ir('ajustes');
    } catch (err) { toast('El archivo no es una copia válida'); }
  };
  const xlsx = (filas, hoja, nombre) => { const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), hoja); XLSX.writeFile(wb, nombre); };
  $('#xv').onclick = () => {
    const f = []; db.remitos.forEach(r => r.items.forEach(i => f.push({ Remito: nroRemito(r), Fecha: fecha(r.fecha), Cliente: r.cliente.nombre, Estado: r.anulado ? 'Anulado' : 'OK', Código: i.codigo, Producto: i.nombre, Cantidad: i.cant, 'Precio unit.': i.precio, Importe: r2(i.precio * i.cant), 'Desc. % remito': r.descPct, 'Total remito': r.total })));
    f.length ? xlsx(f, 'Ventas', `ventas-${hoy}.xlsx`) : toast('No hay remitos para exportar');
  };
  $('#xs').onclick = () => db.productos.length ? xlsx(db.productos.map(p => ({ Código: p.codigo, Descripción: p.nombre, Precio: p.precio })), 'Precios', `precios-${hoy}.xlsx`) : toast('No hay productos');
  $('#almac').textContent = store.idb ? '' : '⚠️ Este navegador no permite guardar datos (¿modo incógnito?). Lo que cargues se pierde al cerrar.';
};

/* ===== Inicio ===== */
(async function () {
  await store.open();
  for (const k of ['productos', 'clientes', 'remitos', 'config', 'draft', 'lic']) {
    const v = await store.get(k);
    if (v !== undefined) db[k] = (k === 'config' || k === 'draft' || k === 'lic') ? Object.assign(db[k], v) : v;
  }
  db.draft.items = (db.draft.items || []).filter(i => prod(i.id));
  if (!db.lic.id) { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; db.lic.id = Array.from(crypto.getRandomValues(new Uint8Array(6)), b => A[b % A.length]).join(''); await store.set('lic', db.lic); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const red = () => $('#estado').textContent = navigator.onLine ? '' : 'Sin conexión';
  addEventListener('online', red); addEventListener('offline', red); red();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  ir(db.productos.length ? 'nuevo' : 'productos');
})();
