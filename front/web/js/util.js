/* Utilidades del front: llamadas al motor, colores, avisos. */

/** Llama una acción del motor a través de front/app.py. */
export async function motor(accion, params = {}, metodo = 'GET') {
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
  const datos = await r.json();
  if (!datos.ok) throw new Error(datos.error || 'Error del motor');
  return datos.resultado;
}

/* Un color por troncal (primera letra de la ruta). */
const PALETA = {
  A: '#2563c9', B: '#2f9e57', C: '#e09b00', D: '#7a42b8', E: '#8a6a3f', F: '#d7192d',
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

export function chipRuta(nombre, pequeno = false) {
  return `<span class="ruta-chip${pequeno ? ' pequeno' : ''}" style="background:${colorRuta(nombre)}" data-ruta="${esc(nombre)}">${esc(nombre)}</span>`;
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
