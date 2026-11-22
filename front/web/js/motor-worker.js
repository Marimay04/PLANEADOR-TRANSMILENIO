/* Versión estática (Netlify): el motor corre en el navegador con Pyodide.
 *
 * Este worker descarga Python (Pyodide), copia a su sistema de archivos el
 * paquete motor/, front/acciones.py y los tres CSV (los publica el script
 * front/construir_netlify.py en py/), crea la red y responde cada pedido
 * del front con el mismo formato JSON que el servidor local (front/app.py).
 * Es el mismo código del motor: aquí no hay ninguna regla del sistema.
 */
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/';
importScripts(PYODIDE + 'pyodide.js');

const BASE = new URL('../py/', self.location).href;   // archivos publicados
const RAIZ = '/home/pyodide/app';                     // dónde quedan en Pyodide

function progreso(texto) { self.postMessage({ tipo: 'progreso', texto }); }

async function bajar(ruta) {
  const r = await fetch(BASE + ruta);
  if (!r.ok) throw new Error('No se pudo descargar ' + ruta);
  return new Uint8Array(await r.arrayBuffer());
}

const listo = (async () => {
  progreso('Descargando Python para el navegador…');
  const py = await loadPyodide({ indexURL: PYODIDE });

  progreso('Descargando el motor y los datos…');
  const lista = new TextDecoder().decode(await bajar('archivos.txt'))
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const contenidos = await Promise.all(lista.map(bajar));
  lista.forEach((ruta, i) => {
    const destino = RAIZ + '/' + ruta;
    py.FS.mkdirTree(destino.slice(0, destino.lastIndexOf('/')));
    py.FS.writeFile(destino, contenidos[i]);
  });

  progreso('Cargando la red en el motor…');
  py.runPython(`
import sys
sys.path[:0] = ["${RAIZ}", "${RAIZ}/front"]
from acciones import App
app = App("${RAIZ}/datos")
`);
  return py.globals.get('app').llamar_json;
})();

listo.catch((e) => progreso('No se pudo cargar el motor: ' + e.message));

self.onmessage = async (e) => {
  const { id, accion, params } = e.data;
  let respuesta;
  try {
    if (accion === 'panel') {
      respuesta = JSON.stringify({
        ok: false,
        error: 'El panel de rendimiento (R11) se abre en la versión local: py front/panel_rendimiento.py',
      });
    } else {
      const llamar = await listo;
      respuesta = llamar(accion, JSON.stringify(params || {}));
    }
  } catch (err) {
    respuesta = JSON.stringify({ ok: false, error: String(err && err.message || err) });
  }
  self.postMessage({ id, respuesta });
};
