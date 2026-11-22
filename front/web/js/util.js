/* Utilidades del front: llamadas al motor, colores, avisos. */

/* Dos formas de llegar al motor:
 *  - local (py front/app.py): pedidos HTTP a /api/...
 *  - estática (Netlify): el motor corre en el navegador dentro de
 *    js/motor-worker.js (Pyodide). js/modo.js dice cuál se usa. */
const ESTATICO = window.MODO_ESTATICO === true;
let trabajador = null;
let siguienteId = 0;
const pendientes = new Map();

function worker() {
  if (!trabajador) {
    trabajador = new Worker(new URL('./motor-worker.js', import.meta.url));
    trabajador.onmessage = (e) => {
      const m = e.data;
      if (m.tipo === 'progreso') {
        const el = document.getElementById('carga-texto');
        if (el) el.textContent = m.texto;
        return;
      }
      const resolver = pendientes.get(m.id);
      if (resolver) { pendientes.delete(m.id); resolver(m.respuesta); }
    };
  }
  return trabajador;
}

/** Llama una acción del motor (por front/app.py o por el worker de Pyodide). */
export async function motor(accion, params = {}, metodo = 'GET') {
  let datos;
  if (ESTATICO) {
    // GET manda los parámetros como texto (igual que la URL); POST conserva los tipos.
    const p = {};
    for (const [k, v] of Object.entries(params)) p[k] = metodo === 'GET' ? String(v) : v;
    const id = ++siguienteId;
    const texto = await new Promise((resolver) => {
      pendientes.set(id, resolver);
      worker().postMessage({ id, accion, params: p });
    });
    datos = JSON.parse(texto);
  } else {
    let url = '/api/' + accion;
    const opciones = { method: metodo, headers: {} };
    if (metodo === 'GET') {
      const q = new URLSearchParams(params).toString();
      if (q) url += '?' + q;
    } else {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(params);
    }
    const r = await fetch(url, opciones);
    datos = await r.json();
  }
  if (!datos.ok) throw new Error(datos.error || 'Error del motor');
  return datos.resultado;
}

/* Un color por troncal (primera letra de la ruta). */
const PALETA = {
  A: '#2563c9', B: '#2f9e57', C: '#e09b00', D: '#7a42b8', E: '#8a6a3f', F: '#c8102e',
  G: '#1f8fd6', H: '#e0661c', J: '#c2185b', K: '#6b8e23', L: '#00897b', M: '#5462c0',
};
const ZONALES = ['#0e9fb0', '#3d7ea6', '#5f8f7a', '#8a7cc2', '#b07a4a', '#4f9d9d', '#7d8597', '#a0699a'];

export function colorRuta(nombre) {
  if (!nombre) return '#6b7280';
  const c = nombre[0].toUpperCase();
  if (PALETA[c]) return PALETA[c];
  let h = 0;
  for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return ZONALES[h % ZONALES.length];
}

/* Variantes expresas (solo para lo que MUESTRA la app; el motor y los CSV no
 * cambian). En los CSV una misma ruta real viene partida en variantes con
 * sufijo -1, -2… (G11-1, G11-2). Una variante es expresa si todas sus paradas
 * están, en el mismo orden, en otra variante de la misma ruta, y esa otra
 * para en más estaciones entre su primera y su última parada. */
export function rutasExpresas(rutas) {
  const grupos = new Map();
  for (const r of rutas) {
    const m = /^(.+)-\d+$/.exec(r.nombre);
    const base = m ? m[1] : r.nombre;
    if (!grupos.has(base)) grupos.set(base, []);
    grupos.get(base).push(r);
  }
  const expresas = new Set();
  for (const variantes of grupos.values()) {
    for (const a of variantes) {
      if (variantes.some((b) => b !== a && saltaParadas(a.paradas, b.paradas))) expresas.add(a.nombre);
    }
  }
  return expresas;
}

function saltaParadas(a, b) {
  if (a.length < 2) return false;
  const pos = a.map((p) => b.indexOf(p));
  if (pos.some((i) => i < 0)) return false;
  for (let i = 1; i < pos.length; i++) if (pos[i] <= pos[i - 1]) return false;
  return pos[pos.length - 1] - pos[0] + 1 > a.length;
}

/* Nombre real de la ruta, SOLO para mostrar (H75-2 → H75). Al motor siempre
 * se le pasa el código del CSV. Si de una misma ruta se muestran varias
 * variantes (por ejemplo ida y regreso), se agrega "hacia DESTINO". */
const destinos = new Map();        // código → última parada
const variantesVisibles = new Map(); // nombre real → cuántas variantes se muestran

function base(codigo) {
  const m = /^(.+)-\d+$/.exec(codigo);
  return m ? m[1] : codigo;
}

export function registrarRutas(todas, visibles) {
  destinos.clear(); variantesVisibles.clear();
  for (const r of todas) destinos.set(r.nombre, r.paradas[r.paradas.length - 1] || '');
  for (const r of visibles) variantesVisibles.set(base(r.nombre), (variantesVisibles.get(base(r.nombre)) || 0) + 1);
}

export function nombreRuta(codigo) {
  return base(codigo);
}

export function detalleRuta(codigo) {
  return (variantesVisibles.get(base(codigo)) || 0) > 1 && destinos.get(codigo) ? 'hacia ' + destinos.get(codigo) : '';
}

export function chipRuta(nombre, pequeno = false) {
  return `<span class="ruta-chip${pequeno ? ' pequeno' : ''}" style="background:${colorRuta(nombre)}" data-ruta="${esc(nombre)}" title="${esc(nombre)} en los datos">${esc(nombreRuta(nombre))}</span>`;
}

export function esc(t) {
  return String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmt(n) {
  return Number(n).toLocaleString('es-CO');
}

export function pildora(estado) {
  const clase = { ABIERTA: 'abierta', CERRADA: 'cerrada', 'NO EXISTE': 'noexiste' }[estado] || 'noexiste';
  const texto = { ABIERTA: 'Abierta', CERRADA: 'Cerrada', 'NO EXISTE': 'No existe' }[estado] || estado;
  return `<span class="pildora ${clase}">${texto}</span>`;
}

export function aviso(texto, tipo = '') {
  const cont = document.getElementById('avisos');
  const el = document.createElement('div');
  el.className = 'aviso ' + tipo;
  el.textContent = texto;
  cont.appendChild(el);
  setTimeout(() => { el.classList.add('saliendo'); setTimeout(() => el.remove(), 320); }, 2800);
}

export function horaActual() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

export function resaltar(nombre, prefijo) {
  const n = esc(nombre);
  const p = prefijo.length;
  if (p && nombre.toUpperCase().startsWith(prefijo.toUpperCase())) return `<b>${n.slice(0, p)}</b>${n.slice(p)}`;
  return n;
}
