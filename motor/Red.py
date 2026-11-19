import csv

from .tabla_hash import TablaHash
from .ordenamiento import merge_sort, primera_posicion

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
        # R2 y R3: todos los nombres en orden alfabético (abiertas y cerradas)
        self._nombres_ordenados = []
        self._cargar_estaciones(_ruta(carpeta, "estaciones.csv"))

    def _cargar_estaciones(self, archivo):
        nombres = []
        with open(archivo, newline="", encoding="utf-8") as f:
            primera = True
            for fila in csv.reader(f):
                if primera:  # encabezado
                    primera = False
                    continue
                if len(fila) == 0 or fila[0] == "":
                    continue
                self._estaciones.put(fila[0], True)
                nombres.append(fila[0])
        # Se ordena una sola vez al cargar: O(n log n)
        self._nombres_ordenados = merge_sort(nombres)

    # ---- R1 ----
    def estado(self, nombre):
        """'abierta', 'cerrada' o 'no existe'. O(1) promedio."""
        valor = self._estaciones.get(nombre)
        if valor is None:
            return NO_EXISTE
        if valor:
            return ABIERTA
        return CERRADA

    def _esta_abierta(self, nombre):
        return self._estaciones.get(nombre) is True

    # ---- R2 ----
    def autocompletar(self, prefijo, k):
        """Hasta k estaciones abiertas que empiezan por prefijo, en orden alfabético.
        O(log n + recorridas), n = número de estaciones."""
        resultado = []
        if k <= 0:
            return resultado
        lista = self._nombres_ordenados
        i = primera_posicion(lista, prefijo)  # primer nombre >= prefijo
        while i < len(lista) and len(resultado) < k:
            nombre = lista[i]
            if not nombre.startswith(prefijo):  # ya pasamos los que empiezan así
                break
            if self._esta_abierta(nombre):
                resultado.append(nombre)
            i = i + 1
        return resultado

    # ---- R3 ----
    def rango(self, desde, hasta):
        """Estaciones abiertas con desde <= nombre <= hasta, en orden alfabético.
        O(log n + m), n = número de estaciones, m = nombres dentro del rango."""
        resultado = []
        lista = self._nombres_ordenados
        i = primera_posicion(lista, desde)
        while i < len(lista) and lista[i] <= hasta:
            if self._esta_abierta(lista[i]):
                resultado.append(lista[i])
            i = i + 1
        return resultado

    # ---- R8 ----
    def cerrar(self, nombre):
        """Cierra la estación. True si cambió; False si no existe o ya estaba cerrada. O(1) promedio."""
        return self._cambiar_estado(nombre, False)

    def reabrir(self, nombre):
        """Reabre la estación. True si cambió; False si no existe o ya estaba abierta. O(1) promedio."""
        return self._cambiar_estado(nombre, True)

    def _cambiar_estado(self, nombre, abierta):
        actual = self._estaciones.get(nombre)
        if actual is None:      # no existe: no se crea
            return False
        if actual == abierta:   # ya estaba así: no hay cambio
            return False
        self._estaciones.put(nombre, abierta)
        return True