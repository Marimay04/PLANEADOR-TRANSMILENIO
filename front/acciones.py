"""Acciones de la app: traduce cada pedido del front a un método del contrato.

Lo usan las dos formas de correr la app:
  - front/app.py (servidor local: py front/app.py)
  - front/web/js/motor-worker.js (Netlify: el motor corre en el navegador con Pyodide)

Está FUERA del motor: no contiene reglas del sistema, solo llama a Red y
simular_fila y prepara los resultados para el navegador.
"""
import csv
import json
import os

from motor import Red, simular_fila


def _num_lista(texto):
    return [float(x) if "." in x else int(x)
            for x in texto.replace(";", ",").replace(" ", ",").split(",") if x != ""]


class App:
    def __init__(self, carpeta):
        self.carpeta = carpeta
        self.red = Red(carpeta)
        self.estaciones = self._leer_columna("estaciones.csv", "nombre")
        self.rutas = self._leer_columna("rutas.csv", "ruta")
        self.buses_conocidos = {}   # último valor visto de buses/día (para las cerradas)
        red = self.red
        # Cada acción llama exactamente un método del contrato.
        self.acciones = {
            "red": lambda p: self.foto_de_la_red(),
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

    def _leer_columna(self, archivo, columna):
        """Lee una columna de un CSV (solo para saber qué nombres existen;
        el contrato no tiene un método que liste estaciones o rutas)."""
        vistos, salida = set(), []
        with open(os.path.join(self.carpeta, archivo), newline="", encoding="utf-8-sig") as f:
            for fila in csv.DictReader(f):
                fila = {k.strip().lower(): v for k, v in fila.items()}
                valor = (fila.get(columna) or "").strip()
                if valor and valor not in vistos:
                    vistos.add(valor)
                    salida.append(valor)
        return salida

    def foto_de_la_red(self):
        """Estado completo para dibujar: estaciones, buses y recorridos."""
        for nombre, buses in self.red.ranking(len(self.estaciones)):
            self.buses_conocidos[nombre] = buses
        estaciones = []
        for n in self.estaciones:
            estaciones.append({"nombre": n, "estado": self.red.estado(n),
                               "buses": self.buses_conocidos.get(n, 0)})
        rutas = [{"nombre": r, "paradas": self.red.recorrido(r)} for r in self.rutas]
        return {"estaciones": estaciones, "rutas": rutas}

    def llamar_json(self, accion, params_json):
        """Ejecuta una acción y devuelve la respuesta como texto JSON, con el
        mismo formato que el servidor local: {"ok": ..., "resultado"/"error": ...}."""
        f = self.acciones.get(accion)
        if f is None:
            return json.dumps({"ok": False, "error": "acción desconocida"})
        try:
            resultado = f(json.loads(params_json or "{}"))
            return json.dumps({"ok": True, "resultado": resultado}, ensure_ascii=False)
        except KeyError as e:
            return json.dumps({"ok": False, "error": "falta el parámetro %s" % e}, ensure_ascii=False)
        except Exception as e:
            return json.dumps({"ok": False, "error": str(e)}, ensure_ascii=False)
