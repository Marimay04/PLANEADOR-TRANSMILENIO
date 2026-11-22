"""Revisa que motor/ no use nada prohibido por el enunciado.

Lee cada archivo .py de motor/ como árbol de sintaxis (módulo ast) y busca:
dict, set, sorted, .sort(), min/max, `in` sobre colecciones, .index(), .count(),
y cualquier import que no sea csv, time, random o el propio motor.
Correr: py -m unittest discover tests
"""
import ast
import os
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOTOR = os.path.join(RAIZ, "motor")

FUNCIONES_PROHIBIDAS = ["dict", "set", "frozenset", "sorted", "min", "max"]
METODOS_PROHIBIDOS = ["sort", "index", "count"]
MODULOS_PERMITIDOS = ["csv", "time", "random"]


def archivos_del_motor():
    nombres = []
    for nombre in os.listdir(MOTOR):
        if nombre.endswith(".py"):
            nombres.append(nombre)
    return nombres


def esta_en(valor, lista):
    for x in lista:
        if x == valor:
            return True
    return False


def problemas_en(codigo, propios):
    """Devuelve una lista de textos 'línea N: qué encontró'."""
    problemas = []
    for nodo in ast.walk(ast.parse(codigo)):
        linea = getattr(nodo, "lineno", 0)
        if isinstance(nodo, (ast.Dict, ast.DictComp)):
            problemas.append("línea %d: diccionario" % linea)
        elif isinstance(nodo, (ast.Set, ast.SetComp)):
            problemas.append("línea %d: conjunto" % linea)
        elif isinstance(nodo, ast.Call) and isinstance(nodo.func, ast.Name) \
                and esta_en(nodo.func.id, FUNCIONES_PROHIBIDAS):
            problemas.append("línea %d: %s()" % (linea, nodo.func.id))
        elif isinstance(nodo, ast.Call) and isinstance(nodo.func, ast.Attribute) \
                and esta_en(nodo.func.attr, METODOS_PROHIBIDOS):
            problemas.append("línea %d: .%s()" % (linea, nodo.func.attr))
        elif isinstance(nodo, ast.Compare):
            for op in nodo.ops:
                if isinstance(op, (ast.In, ast.NotIn)):
                    problemas.append("línea %d: operador in" % linea)
        elif isinstance(nodo, ast.Import):
            for alias in nodo.names:
                base = alias.name.split(".")[0]
                if not esta_en(base, MODULOS_PERMITIDOS) and not esta_en(base, propios):
                    problemas.append("línea %d: import %s" % (linea, alias.name))
        elif isinstance(nodo, ast.ImportFrom):
            base = (nodo.module or "").split(".")[0]
            if nodo.level == 0 and not esta_en(base, MODULOS_PERMITIDOS) \
                    and not esta_en(base, propios):
                problemas.append("línea %d: from %s import" % (linea, nodo.module))
    return problemas


class TestReglasMotor(unittest.TestCase):
    def test_motor_no_usa_nada_prohibido(self):
        archivos = archivos_del_motor()
        self.assertTrue(len(archivos) > 0, "no se encontró motor/")
        propios = ["motor"]
        for nombre in archivos:
            propios.append(nombre[:-3])
        encontrados = []
        for nombre in archivos:
            with open(os.path.join(MOTOR, nombre), encoding="utf-8") as f:
                for p in problemas_en(f.read(), propios):
                    encontrados.append("motor/%s %s" % (nombre, p))
        self.assertEqual(encontrados, [], "\n" + "\n".join(encontrados))

    def test_el_detector_si_detecta(self):
        """Si alguien rompe el detector, esta prueba avisa."""
        malo = ("import heapq\n"
                "d = {}\n"
                "s = set()\n"
                "x = sorted([3, 1])\n"
                "y = min([1, 2])\n"
                "z = 3 in [1, 2, 3]\n"
                "[1].index(1)\n")
        self.assertEqual(len(problemas_en(malo, ["motor"])), 7)
        bueno = "import csv\nfrom motor.tabla_hash import TablaHash\nfor x in [1, 2]:\n    pass\n"
        self.assertEqual(problemas_en(bueno, ["motor", "tabla_hash"]), [])


if __name__ == "__main__":
    unittest.main()