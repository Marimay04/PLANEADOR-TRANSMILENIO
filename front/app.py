"""App web del Planeador TransMilenio.

Arrancar desde la raíz del repositorio (no hay que instalar nada):

    python front/app.py            (en Windows también: py front/app.py)
    python front/app.py otra/carpeta/con/csv   (para usar otra red)

Abre el navegador en http://localhost:8000. Este archivo está FUERA del
motor: es solo un puente HTTP. Toda regla del sistema la resuelve el motor;
aquí solo se llaman sus métodos del contrato y se pasan los resultados a
JSON para el navegador.
"""
import json
import os
import subprocess
import sys
import threading
import webbrowser
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
WEB = os.path.join(AQUI, "web")
if RAIZ not in sys.path:
    sys.path.insert(0, RAIZ)

# Las acciones están en front/acciones.py para que la versión de Netlify
# (motor en el navegador con Pyodide) use exactamente el mismo código.
from acciones import App  # noqa: E402

CARPETA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "datos")
PUERTO = int(os.environ.get("PUERTO", "8000"))

print("Cargando la red desde", CARPETA, "...")
app = App(CARPETA)
ESTACIONES = app.estaciones
RUTAS = app.rutas
ACCIONES = app.acciones
candado = threading.Lock()      # el motor no es multihilo: una llamada a la vez


class Manejador(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB, **kw)

    def log_message(self, *a):      # consola limpia
        pass

    def _json(self, codigo, dato):
        cuerpo = json.dumps(dato, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(cuerpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(cuerpo)

    def _api(self, accion, params):
        if accion == "panel":
            subprocess.Popen([sys.executable, os.path.join(AQUI, "panel_rendimiento.py")],
                             cwd=RAIZ)
            return self._json(200, {"ok": True, "resultado": True})
        f = ACCIONES.get(accion)
        if f is None:
            return self._json(404, {"ok": False, "error": "acción desconocida"})
        try:
            with candado:
                resultado = f(params)
            self._json(200, {"ok": True, "resultado": resultado})
        except KeyError as e:
            self._json(400, {"ok": False, "error": "falta el parámetro %s" % e})
        except Exception as e:      # el front muestra el error sin romperse
            self._json(400, {"ok": False, "error": str(e)})

    def do_GET(self):
        url = urlparse(self.path)
        if url.path.startswith("/api/"):
            params = {k: v[0] for k, v in parse_qs(url.query).items()}
            return self._api(url.path[5:], params)
        return super().do_GET()

    def do_POST(self):
        url = urlparse(self.path)
        largo = int(self.headers.get("Content-Length", "0") or 0)
        try:
            params = json.loads(self.rfile.read(largo) or b"{}")
        except ValueError:
            params = {}
        if url.path.startswith("/api/"):
            return self._api(url.path[5:], params)
        self._json(404, {"ok": False})


def main():
    servidor = ThreadingHTTPServer(("127.0.0.1", PUERTO), Manejador)
    url = "http://localhost:%d" % PUERTO
    print("Listo: %d estaciones, %d rutas." % (len(ESTACIONES), len(RUTAS)))
    print("Abre", url, " (Ctrl+C para salir)")
    if os.environ.get("SIN_NAVEGADOR") != "1":
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nHasta luego.")


if __name__ == "__main__":
    main()
