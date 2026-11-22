/* Arranque y paneles de la app. Cada consulta llama un método del motor
   (vía front/app.py); el front solo muestra lo que el motor responde. */

import { Maqueta } from './escena.js';
import { calcularPosiciones } from './layout.js';
import { iniciarHoraPico } from './horapico.js';
import { aviso, chipRuta, colorRuta, detalleRuta, esc, fmt, horaActual, motor, nombreRuta, pildora, registrarRutas, resaltar, rutasExpresas } from './util.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const estado = {
  datos: null,                 // {estaciones, rutas} tal como los da el motor
  recorridos: new Map(),       // ruta -> paradas
  vista: 'viaje',
  viaje: null,                 // último viaje mostrado
  rutaOp: null, reves: false,
  historial: [],               // [{texto, icono, deshecho}]
  kRanking: 8,
  tarjeta: null,
};

const maqueta = new Maqueta($('#escena'), { alSeleccionar: (n) => abrirTarjeta(n) });
maqueta.alInteractuar = () => { if (maqueta.girando) { maqueta.setGiro(false); $('#btn-girar').classList.remove('activo'); } };

/* ================================================================ carga */
async function iniciar() {
  try {
    const datos = await motor('red');
    $('#carga-texto').textContent = 'Ubicando ' + fmt(datos.estaciones.length) + ' estaciones…';
    await new Promise((r) => setTimeout(r, 30));
    guardarDatos(datos);
    const layout = calcularPosiciones(datos.estaciones.map((e) => e.nombre), estado.visibles);
    maqueta.construir({ ...datos, rutas: estado.visibles }, layout);
    $('#resumen-red').textContent = `${fmt(datos.estaciones.length)} estaciones · ${fmt(estado.visibles.length)} rutas`;
    pintarRanking();
    pintarCerradas();
    pintarHistorial();
    sugerirViajeInicial();
    $('#btn-girar').classList.add('activo');
    $('#btn-etiquetas').classList.add('activo');
    setTimeout(() => $('#carga').classList.add('fuera'), 250);
  } catch (e) {
    $('#carga-texto').textContent = 'No se pudo conectar con el motor. ¿Arrancaste con python front/app.py? (' + e.message + ')';
  }
}

function guardarDatos(datos) {
  estado.datos = datos;
  estado.recorridos = new Map(datos.rutas.map((r) => [r.nombre, r.paradas]));
  estado.porNombre = new Map(datos.estaciones.map((e) => [e.nombre, e]));
  // La app no lista las variantes expresas (las que se saltan estaciones de
  // otra variante de la misma ruta). Es solo presentación: el motor y los CSV
  // no cambian, y si el motor propone una en un viaje, se muestra igual.
  estado.expresas = rutasExpresas(datos.rutas);
  estado.visibles = datos.rutas.filter((r) => !estado.expresas.has(r.nombre));
  registrarRutas(datos.rutas, estado.visibles);   // nombres reales (H75-2 → H75)
}

function sugerirViajeInicial() {
  // Deja dos estaciones de ejemplo (las dos con más buses) para invitar a probar
  const top = estado.datos.estaciones.filter((e) => e.estado === 'ABIERTA').sort((a, b) => b.buses - a.buses);
  if (top.length >= 2) { $('#origen').placeholder = 'Ej. ' + top[1].nombre; $('#destino').placeholder = 'Ej. ' + top[0].nombre; }
}

/** Vuelve a pedir la red al motor después de un cambio (R7, R8, R9). */
async function refrescar() {
  const datos = await motor('red');
  guardarDatos(datos);
  maqueta.actualizar({ ...datos, rutas: estado.visibles });
  pintarRanking();
  pintarCerradas();
  actualizarBotonAlternar();
  if (estado.rutaOp) await cargarRecorrido(false);
  else if (estado.vista === 'viaje' && estado.viaje) await planear(true);
  if (estado.tarjeta) abrirTarjeta(estado.tarjeta, false);
}

/* ================================================================ pestañas */
function moverIndicador() {
  const activa = $('.pestanas button.activa'), ind = $('.pestanas-indicador');
  ind.style.width = activa.offsetWidth + 'px';
  ind.style.transform = `translateX(${activa.offsetLeft - 4}px)`;
}
$$('.pestanas button').forEach((b) => b.addEventListener('click', () => irA(b.dataset.vista)));

function irA(vista) {
  estado.vista = vista;
  $$('.pestanas button').forEach((b) => b.classList.toggle('activa', b.dataset.vista === vista));
  $$('.vista').forEach((v) => v.classList.toggle('activa', v.id === 'vista-' + vista));
  moverIndicador();
  maqueta.limpiarResaltado();
  if (vista === 'viaje' && estado.viaje) maqueta.mostrarViaje(estado.viaje, estado.recorridos);
  if (vista === 'operar' && estado.rutaOp) maqueta.mostrarRuta(estado.rutaOp, estado.recorridos.get(estado.rutaOp) || []);
  if (vista === 'horapico') maqueta.vistaGeneral();
}
addEventListener('resize', moverIndicador);
requestAnimationFrame(moverIndicador);

/* ================================================================ autocompletado */
const fuentes = {
  // R2: el motor devuelve hasta k abiertas que empiezan por el prefijo
  abiertas: async (t) => (await motor('autocompletar', { prefijo: t, k: 8 })).map((n) => ({ valor: n })),
  // Para cerrar/reabrir también hacen falta las cerradas
  todas: async (t) => {
    const abiertas = await motor('autocompletar', { prefijo: t, k: 8 });
    const cerradas = estado.datos.estaciones.filter((e) => e.estado !== 'ABIERTA' && e.nombre.startsWith(t)).slice(0, 4);
    return [...abiertas.map((n) => ({ valor: n })), ...cerradas.map((e) => ({ valor: e.nombre, extra: 'cerrada' }))];
  },
  rutas: async (t) => estado.visibles.filter((r) => r.nombre.toUpperCase().startsWith(t)).slice(0, 10)
    .map((r) => ({ valor: r.nombre, extra: [detalleRuta(r.nombre), r.paradas.length + ' paradas'].filter(Boolean).join(' · '), ruta: true })),
};

function autocompletar(campo, alElegir) {
  const input = $('input', campo), lista = $('.sugerencias', campo);
  const fuente = fuentes[campo.dataset.auto];
  let items = [], marcada = -1, turno = 0;
  // cerrar también invalida respuestas del motor que aún no llegan
  const cerrar = () => { turno++; lista.classList.remove('visible'); marcada = -1; };
  const elegir = (v) => { input.value = v; cerrar(); input.classList.remove('error'); alElegir?.(v); };
  const pintar = (t) => {
    if (!items.length) {
      lista.innerHTML = t ? `<li class="vacio">Nada abierto empieza por «${esc(t)}»</li>` : '';
    } else {
      lista.innerHTML = items.map((it, i) => `<li data-i="${i}" class="${i === marcada ? 'marcada' : ''}">
        <span>${it.ruta ? chipRuta(it.valor, true) : resaltar(it.valor, t)}</span>
        ${it.extra ? `<span class="tenue" style="font-size:12px;color:var(--tenue)">${esc(it.extra)}</span>` : ''}</li>`).join('')
        + (campo.dataset.auto !== 'rutas' ? '<li class="pie">red.autocompletar(prefijo, k) · R2</li>' : '');
    }
    // solo si el campo sigue activo (la respuesta del motor puede llegar tarde)
    lista.classList.toggle('visible', document.activeElement === input && !!(t || items.length));
  };
  input.addEventListener('input', async () => {
    const t = input.value.toUpperCase().trimStart();
    const mio = ++turno;
    if (!t) { items = []; cerrar(); return; }
    try { const r = await fuente(t); if (mio !== turno) return; items = r; marcada = -1; pintar(t); } catch { /* sin conexión */ }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && items.length) { marcada = (marcada + 1) % items.length; pintar(input.value.toUpperCase()); e.preventDefault(); }
    else if (e.key === 'ArrowUp' && items.length) { marcada = (marcada - 1 + items.length) % items.length; pintar(input.value.toUpperCase()); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (marcada >= 0 && items[marcada]) elegir(items[marcada].valor);
      else { cerrar(); input.value = input.value.toUpperCase().trim(); alElegir?.(input.value, true); }
      e.preventDefault();
    } else if (e.key === 'Escape') cerrar();
  });
  lista.addEventListener('mousedown', (e) => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    e.preventDefault(); elegir(items[+li.dataset.i].valor);
  });
  input.addEventListener('blur', () => setTimeout(cerrar, 120));
}

/* ================================================================ VIAJE (R4, R5) */
autocompletar($('#origen').closest('.campo'), () => $('#destino').value || $('#destino').focus());
autocompletar($('#destino').closest('.campo'), (v, enter) => { if (enter || $('#origen').value) planear(); });
$('#btn-planear').addEventListener('click', () => planear());
$('#btn-intercambiar').addEventListener('click', () => {
  const o = $('#origen'), d = $('#destino');
  [o.value, d.value] = [d.value, o.value];
  if (o.value && d.value) planear();
});

async function planear(silencioso = false) {
  const o = $('#origen').value.toUpperCase().trim(), d = $('#destino').value.toUpperCase().trim();
  const hora = $('#hora-viaje').value || horaActual();
  const caja = $('#resultado-viaje');
  if (!o || !d) { if (!silencioso) aviso('Escribe el origen y el destino'); return; }
  $('#origen').value = o; $('#destino').value = d;

  const [eo, ed, tramos] = await Promise.all([motor('estado', { nombre: o }), motor('estado', { nombre: d }), motor('viaje', { origen: o, destino: d })]);
  $('#origen').classList.toggle('error', eo !== 'ABIERTA');
  $('#destino').classList.toggle('error', ed !== 'ABIERTA');

  if (!tramos || !tramos.length) {
    estado.viaje = null;
    maqueta.limpiarResaltado();
    let por = 'No hay un viaje directo ni con un solo transbordo entre estas estaciones.';
    if (eo !== 'ABIERTA') por = `«${esc(o)}» ${eo === 'CERRADA' ? 'está cerrada: nadie sube ahí' : 'no existe en la red'}.`;
    else if (ed !== 'ABIERTA') por = `«${esc(d)}» ${ed === 'CERRADA' ? 'está cerrada: nadie baja ahí' : 'no existe en la red'}.`;
    else if (o === d) por = 'El origen y el destino son la misma estación.';
    caja.innerHTML = `<div class="vacio-grande"><b>Sin viaje posible</b>${por}</div>
      <p class="metodo"><code>red.viaje("${esc(o)}", "${esc(d)}")</code> devolvió <code>None</code>.</p>`;
    return;
  }

  estado.viaje = tramos;
  const paradasDe = (ruta, a, b) => {
    const p = estado.recorridos.get(ruta) || [];
    const i = p.indexOf(a), j = p.indexOf(b);
    return i >= 0 && j > i ? p.slice(i, j + 1) : [a, b];
  };
  const segs = tramos.map(([r, a, b]) => paradasDe(r, a, b));
  const total = segs.reduce((s, x) => s + x.length - 1, 0);

  // R4 para cada tramo: el primero a la hora elegida, el segundo desde esa salida
  const buses = [];
  let desde = hora;
  for (const [r, a] of tramos) {
    const h = await motor('proximo_bus', { estacion: a, ruta: r, hora: desde });
    buses.push(h);
    if (h) desde = h;
  }

  let html = `<div class="resumen-viaje">
      <div class="dato"><b>${total}</b><span>paradas</span></div>
      <div class="dato"><b>${tramos.length}</b><span>${tramos.length === 1 ? 'bus directo' : 'buses'}</span></div>
      <div class="dato"><b>${buses[0] || '—'}</b><span>primer bus</span></div>
    </div><ol class="itinerario">`;
  tramos.forEach(([ruta, sube, baja], k) => {
    const color = colorRuta(ruta), seg = segs[k];
    html += `<li class="parada-it ${k === 0 ? '' : 'transbordo'}"><div class="eje"><i class="punto"></i></div>
      <div><div class="nombre">${esc(sube)}</div><div class="detalle">${k === 0 ? 'Sube aquí' : 'Transbordo: cambia de bus'}</div></div></li>
      <li class="tramo-it"><div class="eje"><i style="background:${color}"></i></div><div class="caja">
        <div class="tramo-cabeza">${chipRuta(ruta)}<span class="tenue">${seg.length - 1} ${seg.length === 2 ? 'parada' : 'paradas'} · hasta ${esc(baja)}</span></div>
        <div class="bus-proximo"><svg class="reloj" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
          ${buses[k] ? `<span>Próximo bus <b>${buses[k]}</b>${k ? '<small> · desde la salida del primero</small>' : ''}</span>` : `<span>No hay más buses de esta ruta después de las ${esc(k ? (buses[k - 1] || hora) : hora)}</span>`}</div>
        ${seg.length > 2 ? `<button class="desplegar" data-k="${k}">Ver ${seg.length - 2} ${seg.length === 3 ? 'parada intermedia' : 'paradas intermedias'} ▾</button>
          <ul class="paradas-intermedias" hidden>${seg.slice(1, -1).map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      </div></li>`;
  });
  html += `<li class="parada-it final"><div class="eje"><i class="punto"></i></div>
      <div><div class="nombre">${esc(tramos[tramos.length - 1][2])}</div><div class="detalle">Llegaste</div></div></li></ol>
    <p class="metodo">Viaje: <code>red.viaje()</code> · próximo bus: <code>red.proximo_bus()</code> (búsqueda binaria en los horarios).</p>`;
  caja.innerHTML = html;
  $$('.desplegar', caja).forEach((b) => b.addEventListener('click', () => {
    const ul = b.nextElementSibling; ul.hidden = !ul.hidden;
    b.textContent = b.textContent.replace(ul.hidden ? '▴' : '▾', ul.hidden ? '▾' : '▴');
  }));
  if (estado.vista === 'viaje') maqueta.mostrarViaje(tramos, estado.recorridos);
}

/* ================================================================ ESTACIONES (R1, R2, R3, R6) */
autocompletar($('#buscar-estacion').closest('.campo'), (v) => buscarEstacion(v));

async function buscarEstacion(nombre) {
  const caja = $('#estado-busqueda');
  if (!nombre) { caja.innerHTML = ''; return; }
  const e = await motor('estado', { nombre });           // R1
  caja.innerHTML = `<div style="display:flex;align-items:center;gap:10px;margin-top:4px">${pildora(e)}
    <span class="tenue" style="font-size:12px;color:var(--tenue)"><code style="font-family:var(--mono)">red.estado()</code> · R1</span></div>`;
  if (e !== 'NO EXISTE') abrirTarjeta(nombre);
}

$$('.k-control .mini').forEach((b) => b.addEventListener('click', () => {
  estado.kRanking = Math.min(30, Math.max(1, estado.kRanking + Number(b.dataset.k)));
  $('#k-ranking').textContent = estado.kRanking;
  pintarRanking();
}));

async function pintarRanking() {
  const lista = await motor('ranking', { k: estado.kRanking });     // R6
  const max = lista.length ? lista[0][1] : 1;
  $('#lista-ranking').innerHTML = lista.map(([n, b]) => `<li data-n="${esc(n)}">
      <div><div class="nom">${esc(n)}</div><div class="barra-r" style="width:${Math.max(4, (b / max) * 100)}%"></div></div>
      <span class="num">${fmt(b)}</span></li>`).join('') || '<li class="vacio">No hay estaciones abiertas</li>';
  $$('#lista-ranking li[data-n]').forEach((li) => li.addEventListener('click', () => abrirTarjeta(li.dataset.n)));
}

$('#btn-rango').addEventListener('click', listarRango);
[$('#rango-desde'), $('#rango-hasta')].forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') listarRango(); }));

async function listarRango() {
  const desde = $('#rango-desde').value.toUpperCase().trim(), hasta = $('#rango-hasta').value.toUpperCase().trim();
  $('#rango-desde').value = desde; $('#rango-hasta').value = hasta;
  const lista = await motor('rango', { desde, hasta });              // R3
  $('#resultado-rango').innerHTML = `<span class="contador">${lista.length} ${lista.length === 1 ? 'estación abierta' : 'estaciones abiertas'} entre «${esc(desde)}» y «${esc(hasta)}»</span>`
    + lista.map((n) => `<button class="chip" data-n="${esc(n)}">${esc(n)}</button>`).join('');
  $$('#resultado-rango .chip').forEach((c) => c.addEventListener('click', () => abrirTarjeta(c.dataset.n)));
  maqueta.volarA(lista);
}

/* ================================================================ TARJETA DE ESTACIÓN */
function rutasQuePasanPor(nombre) {
  const r = [];
  for (const [ruta, paradas] of estado.recorridos) if (!estado.expresas.has(ruta) && paradas.includes(nombre)) r.push(ruta);
  return r.sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));
}

async function abrirTarjeta(nombre, volar = true) {
  const e = await motor('estado', { nombre });
  if (e === 'NO EXISTE') { aviso(`«${nombre}» no existe`, 'error'); return; }
  estado.tarjeta = nombre;
  const info = estado.porNombre.get(nombre) || { buses: 0 };
  const abiertas = estado.datos.estaciones.filter((x) => x.estado === 'ABIERTA').sort((a, b) => b.buses - a.buses || a.nombre.localeCompare(b.nombre));
  const puesto = abiertas.findIndex((x) => x.nombre === nombre) + 1;
  const rutas = rutasQuePasanPor(nombre);
  const abierta = e === 'ABIERTA';

  $('#tarjeta-contenido').innerHTML = `
    <h2>${esc(nombre)}</h2>${pildora(e)}
    <div class="metricas">
      <div class="dato"><b>${fmt(info.buses)}</b><span>buses al día</span></div>
      <div class="dato"><b>${abierta && puesto ? '#' + puesto : '—'}</b><span>en el ranking</span></div>
    </div>
    <h4>Rutas que paran aquí · ${new Set(rutas.map(nombreRuta)).size}</h4>
    <div class="rutas-est">${rutas.filter((r, i) => rutas.findIndex((x) => nombreRuta(x) === nombreRuta(r)) === i).map((r) => chipRuta(r, true)).join('') || '<span class="tenue" style="color:var(--tenue)">Ninguna</span>'}</div>
    ${rutas.length ? `<h4>Próximo bus · R4</h4>
    <div class="proximo">
      <select id="tj-ruta">${rutas.map((r) => `<option value="${esc(r)}">${esc(nombreRuta(r))}${detalleRuta(r) ? ' · ' + esc(detalleRuta(r)) : ''}</option>`).join('')}</select>
      <input id="tj-hora" type="time" value="${$('#hora-viaje').value || horaActual()}">
    </div>
    <div class="bus-proximo" id="tj-bus">…</div>` : ''}
    <div class="acciones-tarjeta">
      <button class="boton-secundario" id="tj-desde" ${abierta ? '' : 'disabled'}>Salir de aquí</button>
      <button class="boton-secundario" id="tj-hasta" ${abierta ? '' : 'disabled'}>Llegar aquí</button>
      <button class="boton-secundario ancho ${abierta ? 'peligro' : 'exito'}" id="tj-alternar">${abierta ? 'Cerrar estación' : 'Reabrir estación'}</button>
    </div>`;
  $('#tarjeta').hidden = false;

  const consultar = async () => {
    const r = $('#tj-ruta').value, h = $('#tj-hora').value;
    const bus = await motor('proximo_bus', { estacion: nombre, ruta: r, hora: h });
    const reloj = '<svg class="reloj" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
    $('#tj-bus').innerHTML = reloj + '<span>' + (bus
      ? `El ${chipRuta(r, true)} pasa a las <b>${bus}</b>`
      : (abierta ? `No hay más buses del ${chipRuta(r, true)} después de las ${esc(h)}` : 'Estación cerrada: ningún bus para aquí')) + '</span>';
  };
  if (rutas.length) { consultar(); $('#tj-ruta').addEventListener('change', consultar); $('#tj-hora').addEventListener('change', consultar); }
  $$('#tarjeta-contenido .rutas-est .ruta-chip').forEach((c) => c.addEventListener('click', () => {
    irA('operar'); $('#ruta-op').value = c.dataset.ruta; estado.reves = false; marcarSentido(); cargarRecorrido();
  }));
  $('#tj-desde').addEventListener('click', () => { irA('viaje'); $('#origen').value = nombre; if ($('#destino').value) planear(); else $('#destino').focus(); });
  $('#tj-hasta').addEventListener('click', () => { irA('viaje'); $('#destino').value = nombre; if ($('#origen').value) planear(); else $('#origen').focus(); });
  $('#tj-alternar').addEventListener('click', () => alternarEstacion(nombre));
  maqueta.seleccionar(nombre, volar);
}

$('#cerrar-tarjeta').addEventListener('click', () => { $('#tarjeta').hidden = true; estado.tarjeta = null; maqueta.seleccionar(null); });

/* ================================================================ OPERAR (R7, R8, R9) */
autocompletar($('#ruta-op').closest('.campo'), () => { estado.reves = false; marcarSentido(); cargarRecorrido(); });
$$('#sentido button').forEach((b) => b.addEventListener('click', () => {
  estado.reves = b.dataset.reves === '1'; marcarSentido(); if ($('#ruta-op').value) cargarRecorrido(false);
}));
function marcarSentido() { $$('#sentido button').forEach((b) => b.classList.toggle('activo', (b.dataset.reves === '1') === estado.reves)); }

const ICONO_MAS = '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>';
const ICONO_X = '<svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>';

async function cargarRecorrido(volar = true) {
  const ruta = $('#ruta-op').value.toUpperCase().trim();
  $('#ruta-op').value = ruta;
  const caja = $('#recorrido');
  const paradas = await motor('recorrido', { ruta, al_reves: estado.reves ? '1' : '0' });   // R7
  if (!paradas.length) {
    estado.rutaOp = null; maqueta.limpiarResaltado();
    caja.innerHTML = `<div class="vacio-grande"><b>Ruta sin recorrido</b>«${esc(ruta)}» no existe o no tiene paradas.</div>`;
    return;
  }
  estado.rutaOp = ruta;
  const color = colorRuta(ruta);
  const editable = !estado.reves;
  const detalle = estado.reves ? '' : detalleRuta(ruta);
  caja.innerHTML = `<div class="recorrido-cabeza">${chipRuta(ruta)}<span>${detalle ? esc(detalle) + ' · ' : ''}${paradas.length} paradas · ${estado.reves ? 'al revés' : 'ida'}</span></div>
    <ol class="linea-ruta" style="--color-ruta:${color}">${paradas.map((n) => {
      const cerrada = estado.porNombre.get(n)?.estado !== 'ABIERTA';
      return `<li data-n="${esc(n)}"><div class="estacion-ruta ${cerrada ? 'cerrada' : ''}">
        <span class="nodo"><i></i></span><span class="nom">${esc(n)}</span>
        ${editable ? `<span class="acciones"><button class="agregar" title="Agregar una parada después de ${esc(n)}">${ICONO_MAS}</button>
        <button class="quitar" title="Quitar ${esc(n)} de la ruta">${ICONO_X}</button></span>` : ''}</div></li>`;
    }).join('')}</ol>
    ${editable ? '' : '<p class="metodo">Para editar, vuelve al sentido de ida: así «después de» es claro.</p>'}`;

  $$('.linea-ruta li', caja).forEach((li) => {
    const n = li.dataset.n;
    $('.nom', li).addEventListener('click', () => abrirTarjeta(n));
    $('.quitar', li)?.addEventListener('click', async () => {
      if (await motor('quitar_parada', { ruta, estacion: n }, 'POST')) {
        registrar(`Quitar ${n} de ${ruta}`, '−'); aviso(`${n} ya no es parada de ${ruta}`); await refrescar();
      }
    });
    $('.agregar', li)?.addEventListener('click', () => abrirInsertar(li, ruta, n));
  });
  if (estado.vista === 'operar') {
    const ida = estado.recorridos.get(ruta) || paradas;
    if (volar) maqueta.mostrarRuta(ruta, ida);
    else { maqueta.mostrarRuta(ruta, ida); }
  }
}

function abrirInsertar(li, ruta, despues) {
  $$('.insertar').forEach((x) => x.remove());
  const div = document.createElement('div');
  div.className = 'insertar';
  div.innerHTML = `<div class="campo auto" data-auto="todas"><input placeholder="Nueva parada después de ${esc(despues)}" autocomplete="off"><ul class="sugerencias"></ul></div>
    <button class="boton-secundario">Agregar</button>`;
  li.appendChild(div);
  const input = $('input', div);
  const agregar = async (v) => {
    const nueva = (v || input.value).toUpperCase().trim();
    if (!nueva) return;
    const ok = await motor('agregar_parada', { ruta, nueva, despues_de: despues }, 'POST');
    if (ok) { registrar(`Agregar ${nueva} en ${ruta}`, '+'); aviso(`${nueva} agregada después de ${despues}`); await refrescar(); }
    else aviso(`No se pudo: «${nueva}» no existe o ya está en ${ruta}`, 'error');
  };
  autocompletar($('.campo', div), (v) => agregar(v));
  $('button.boton-secundario', div).addEventListener('click', () => agregar());
  input.focus();
}

autocompletar($('#estacion-op').closest('.campo'), () => actualizarBotonAlternar());
$('#estacion-op').addEventListener('input', () => actualizarBotonAlternar());
$('#btn-alternar').addEventListener('click', () => {
  const n = $('#estacion-op').value.toUpperCase().trim();
  if (n) alternarEstacion(n);
});
function actualizarBotonAlternar() {
  const n = $('#estacion-op').value.toUpperCase().trim();
  const e = estado.porNombre?.get(n);
  const b = $('#btn-alternar');
  const cerrada = e && e.estado !== 'ABIERTA';
  b.textContent = cerrada ? 'Reabrir' : 'Cerrar';
  b.className = 'boton-secundario ' + (cerrada ? 'exito' : 'peligro');
}

async function alternarEstacion(nombre) {
  const e = await motor('estado', { nombre });                      // R1
  if (e === 'NO EXISTE') { aviso(`«${nombre}» no existe`, 'error'); return; }
  const accion = e === 'ABIERTA' ? 'cerrar' : 'reabrir';
  if (await motor(accion, { nombre }, 'POST')) {                    // R8
    registrar(`${accion === 'cerrar' ? 'Cerrar' : 'Reabrir'} ${nombre}`, accion === 'cerrar' ? '⨯' : '✓');
    aviso(`${nombre} ${accion === 'cerrar' ? 'cerrada: sale del ranking y de las búsquedas' : 'reabierta'}`);
    await refrescar();
  }
}

function pintarCerradas() {
  const cerradas = estado.datos.estaciones.filter((e) => e.estado !== 'ABIERTA');
  $('#cerradas').innerHTML = cerradas.length
    ? `<span class="contador">${cerradas.length} cerrada${cerradas.length > 1 ? 's' : ''} · toca para reabrir</span>` + cerradas.map((e) => `<button class="chip" data-n="${esc(e.nombre)}">${esc(e.nombre)} <span class="x">↺</span></button>`).join('')
    : '<span class="contador">Todas las estaciones están abiertas.</span>';
  $$('#cerradas .chip').forEach((c) => c.addEventListener('click', () => alternarEstacion(c.dataset.n)));
}

/* Historial: refleja las dos pilas del motor (R9) */
function registrar(texto, icono) {
  estado.historial = estado.historial.filter((h) => !h.deshecho);   // un cambio nuevo borra lo que había para rehacer
  estado.historial.push({ texto, icono, deshecho: false });
  pintarHistorial();
}
function pintarHistorial() {
  const h = estado.historial;
  $('#historial').innerHTML = h.length
    ? [...h].reverse().map((x) => `<li class="${x.deshecho ? 'deshecho' : ''}"><span class="ic">${x.icono}</span>${esc(x.texto)}</li>`).join('')
    : '<li class="vacio">Sin cambios todavía. Cierra una estación o edita una ruta.</li>';
  const hayDeshacer = h.some((x) => !x.deshecho), hayRehacer = h.some((x) => x.deshecho);
  for (const id of ['#btn-deshacer', '#btn-deshacer-2']) $(id).disabled = !hayDeshacer;
  for (const id of ['#btn-rehacer', '#btn-rehacer-2']) $(id).disabled = !hayRehacer;
}

async function deshacer() {
  if (!(await motor('deshacer', {}, 'POST'))) { aviso('No hay nada que deshacer'); return; }
  const ult = [...estado.historial].reverse().find((x) => !x.deshecho);
  if (ult) { ult.deshecho = true; aviso('Deshecho: ' + ult.texto); }
  pintarHistorial(); await refrescar();
}
async function rehacer() {
  if (!(await motor('rehacer', {}, 'POST'))) { aviso('No hay nada que rehacer'); return; }
  const prim = estado.historial.find((x) => x.deshecho);
  if (prim) { prim.deshecho = false; aviso('Rehecho: ' + prim.texto); }
  pintarHistorial(); await refrescar();
}
$('#btn-deshacer').addEventListener('click', deshacer);
$('#btn-deshacer-2').addEventListener('click', deshacer);
$('#btn-rehacer').addEventListener('click', rehacer);
$('#btn-rehacer-2').addEventListener('click', rehacer);
addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); deshacer(); }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); rehacer(); }
});

/* ================================================================ escena y barra */
$('#btn-etiquetas').addEventListener('click', (e) => {
  const v = !e.currentTarget.classList.contains('activo');
  e.currentTarget.classList.toggle('activo', v); maqueta.setEtiquetas(v);
});
$('#btn-girar').addEventListener('click', (e) => {
  const v = !maqueta.girando; maqueta.setGiro(v); e.currentTarget.classList.toggle('activo', v);
});
$('#btn-centrar').addEventListener('click', () => maqueta.vistaGeneral());
$('#btn-panel').addEventListener('click', async () => {
  try { await motor('panel', {}, 'POST'); aviso('Se abrió el panel de rendimiento (R11) en otra ventana'); }
  catch (e) { aviso(e.message || 'No se pudo abrir el panel', 'error'); }
});

iniciarHoraPico();
iniciar();
