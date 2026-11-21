"""App web del Planeador TransMilenio.

Arrancar desde la raíz del repositorio (no hay que instalar nada):

    python front/app.py            (en Windows también: py front/app.py)
    python front/app.py otra/carpeta/con/csv   (para usar otra red)

Abre el navegador en http://localhost:8000. Este archivo está FUERA del
motor: es solo un puente HTTP. Toda regla del sistema la resuelve el motor;
aquí solo se llaman sus métodos del contrato y se pasan los resultados a
JSON para el navegador.
"""
import csv
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

from motor import Red, simular_fila  # noqa: E402

CARPETA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(RAIZ, "datos")
PUERTO = int(os.environ.get("PUERTO", "8000"))

print("Cargando la red desde", CARPETA, "...")
red = Red(CARPETA)
candado = threading.Lock()      # el motor no es multihilo: una llamada a la vez


def _leer_columna(archivo, columna):
    """Lee una columna de un CSV (solo para saber qué nombres existen;
    el contrato no tiene un método que liste estaciones o rutas)."""
    vistos, salida = set(), []
    with open(os.path.join(CARPETA, archivo), newline="", encoding="utf-8-sig") as f:
        for fila in csv.DictReader(f):
            fila = {k.strip().lower(): v for k, v in fila.items()}
            valor = (fila.get(columna) or "").strip()
            if valor and valor not in vistos:
                vistos.add(valor)
                salida.append(valor)
    return salida


ESTACIONES = _leer_columna("estaciones.csv", "nombre")
RUTAS = _leer_columna("rutas.csv", "ruta")
buses_conocidos = {}    # último valor visto de buses/día (para las cerradas)


def foto_de_la_red():
    """Estado completo para dibujar: estaciones, buses y recorridos."""
    abiertas = red.ranking(len(ESTACIONES))
    for nombre, buses in abiertas:
        buses_conocidos[nombre] = buses
    estaciones = []
    for n in ESTACIONES:
        estaciones.append({"nombre": n, "estado": red.estado(n),
                           "buses": buses_conocidos.get(n, 0)})
    rutas = [{"nombre": r, "paradas": red.recorrido(r)} for r in RUTAS]
    return {"estaciones": estaciones, "rutas": rutas}


def _num_lista(texto):
    return [float(x) if "." in x else int(x)
            for x in texto.replace(";", ",").replace(" ", ",").split(",") if x != ""]


# Cada acción llama exactamente un método del contrato.
ACCIONES = {
    "red": lambda p: foto_de_la_red(),
    "estado": lambda p: red.estado(p["nombre"]),
    "autocompletar": lambda p: red.autocompletar(p.get("prefijo", ""), int(p.get("k", 8))),
    "rango": lambda p: red.rango(p["desde"], p["hasta"]),
    "proximo_bus": lambda p: red.proximo_bus(p["estacion"], p["ruta"], p["hora"]),
    "viaje": lambda p: red.viaje(p["origen"], p["destino"]),
    "ranking": lambda p: red.ranking(int(p.get("k", 10))),
    "recorrido": lambda p: red.recorrido(p["ruta"], p.get("al_reves") in ("1", "true", True)),
    "agregar_parada": lambda p: red.agregar_parada(p["ruta"], p["nueva"], p["despues_de"]),
    "quitar_parada": lambda p: red.quitar_parada(p["ruta"], p["estacion"]),
    "cerrar": lambda p: red.cerrar(p["nombre"]),
    "reabrir": lambda p: red.reabrir(p["nombre"]),
    "deshacer": lambda p: red.deshacer(),
    "rehacer": lambda p: red.rehacer(),
    "simular_fila": lambda p: simular_fila(_num_lista(p["llegadas"]),
                                           int(p["frecuencia"]), int(p["capacidad"])),
}


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
