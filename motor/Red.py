import csv

from .tabla_hash import TablaHash

ABIERTA = "abierta"
CERRADA = "cerrada"
NO_EXISTE = "no existe"


def _ruta(carpeta, archivo):
    if carpeta.endswith("/") or carpeta.endswith("\\"):
        return carpeta + archivo
    return carpeta + "/" + archivo


class Red:
    def __init__(self, carpeta):
        # R1: nombre -> True (abierta) / False (cerrada)
        self._estaciones = TablaHash()
        self._cargar_estaciones(_ruta(carpeta, "estaciones.csv"))

    def _cargar_estaciones(self, archivo):
        with open(archivo, newline="", encoding="utf-8") as f:
            primera = True
            for fila in csv.reader(f):
                if primera:  # encabezado
                    primera = False
                    continue
                if len(fila) == 0 or fila[0] == "":
                    continue
                self._estaciones.put(fila[0], True)

    # ---- R1 ----
    def estado(self, nombre):
        """'abierta', 'cerrada' o 'no existe'. O(1) promedio."""
        valor = self._estaciones.get(nombre)
        if valor is None:
            return NO_EXISTE
        if valor:
            return ABIERTA
        return CERRADA