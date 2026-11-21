"""Pruebas de R10 (simular_fila). Correr: py -m unittest discover tests"""
import os
import random
import sys
import time
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from motor import Red, simular_fila  # noqa: E402,F401  (import del contrato)


def simular_ingenuo(llegadas, frecuencia, capacidad):
    """Versión lenta y obvia para comparar (aquí, fuera del motor, sí se
    puede usar sorted): recorre bus por bus sin saltarse ninguno."""
    orden = sorted(range(len(llegadas)), key=lambda i: (llegadas[i], i))
    esperas = [None] * len(llegadas)
    pos = 0
    bus = 1
    while pos < len(orden):
        salida = bus * frecuencia
        suben = 0
        while pos < len(orden) and suben < capacidad and llegadas[orden[pos]] <= salida:
            esperas[orden[pos]] = salida
            pos += 1
            suben += 1
        bus += 1
    return esperas


class TestR10(unittest.TestCase):
    def test_ejemplo_del_enunciado(self):
        self.assertEqual(simular_fila([30, 5, 5, 70], 60, 2), [120, 60, 60, 120])

    def test_ejemplo_basico(self):
        # buses en 5, 10, 15; cupo 2
        self.assertEqual(simular_fila([0, 1, 2, 3, 4], 5, 2), [5, 5, 10, 10, 15])

    def test_llegadas_desordenadas(self):
        self.assertEqual(simular_fila([4, 0, 3, 1, 2], 5, 2), [15, 5, 10, 5, 10])

    def test_llega_justo_a_la_salida(self):
        self.assertEqual(simular_fila([5], 5, 1), [5])

    def test_empate_respeta_orden_de_la_lista(self):
        self.assertEqual(simular_fila([2, 2, 2], 5, 2), [5, 5, 10])

    def test_buses_vacios_entre_llegadas(self):
        self.assertEqual(simular_fila([0, 100], 5, 10), [5, 100])

    def test_cupo_sobra(self):
        self.assertEqual(simular_fila([1, 2, 3], 10, 100), [10, 10, 10])

    def test_horas_en_texto(self):
        # 07:00 = 420 min; buses cada 15 -> sale a las 420
        self.assertEqual(simular_fila(["07:00", "07:01"], 15, 1), [420, 435])

    # -- bordes --
    def test_lista_vacia(self):
        self.assertEqual(simular_fila([], 5, 2), [])

    def test_frecuencia_o_capacidad_invalida(self):
        self.assertIsNone(simular_fila([1, 2], 0, 2))
        self.assertIsNone(simular_fila([1, 2], 5, 0))
        self.assertIsNone(simular_fila([1, 2], -3, 2))
        self.assertIsNone(simular_fila(None, 5, 2))

    def test_llegada_invalida(self):
        self.assertIsNone(simular_fila(["no es hora"], 5, 2))

    def test_igual_a_la_version_ingenua(self):
        azar = random.Random(7)
        for _ in range(300):
            n = azar.randint(1, 60)
            llegadas = [azar.randint(0, 120) for _ in range(n)]
            f = azar.randint(1, 15)
            c = azar.randint(1, 8)
            self.assertEqual(simular_fila(llegadas, f, c),
                             simular_ingenuo(llegadas, f, c))

    def test_cientos_de_miles(self):
        azar = random.Random(1)
        llegadas = [azar.randint(0, 180) for _ in range(200000)]
        t = time.perf_counter()
        salidas = simular_fila(llegadas, 3, 160)
        dt = time.perf_counter() - t
        self.assertEqual(len(salidas), 200000)
        neg = 0
        for s, l in zip(salidas, llegadas):
            if s < l:          # nadie puede salir antes de llegar
                neg += 1
        self.assertEqual(neg, 0)
        self.assertLess(dt, 20)   # margen amplio; en la práctica unos pocos segundos


if __name__ == "__main__":
    unittest.main()
