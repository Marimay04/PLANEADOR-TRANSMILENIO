"""Pruebas de R11 (mediciones del panel). Correr: py -m unittest discover tests"""
import os
import shutil
import sys
import tempfile
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
sys.path.insert(0, os.path.join(RAIZ, "front"))

import rendimiento as rd  # noqa: E402
from motor import Red  # noqa: E402


class TestGenerador(unittest.TestCase):
    def test_red_generada_carga_en_el_motor(self):
        carpeta = tempfile.mkdtemp()
        try:
            nombres = rd.generar_red(carpeta, 80, semilla=3)
            red = Red(carpeta)
            self.assertEqual(len(nombres), 80)
            self.assertEqual(red.estado(nombres[0]), "ABIERTA")
            self.assertEqual(red.estado("NO EXISTE"), "NO EXISTE")
            self.assertEqual(len(red.recorrido("R00000")), rd.PARADAS_POR_RUTA)
            self.assertEqual(len(red.ranking(5)), 5)
        finally:
            shutil.rmtree(carpeta, ignore_errors=True)

    def test_tamanos_duplican(self):
        self.assertEqual(rd.tamanos(100, 4), [100, 200, 400, 800])


class TestVeredicto(unittest.TestCase):
    def test_lineal_no_es_constante(self):
        ok, razones, total, esperado = rd.veredicto([1, 2, 4, 8], [100, 200, 400, 800], "O(1)")
        self.assertFalse(ok)
        self.assertEqual(razones, [2, 2, 2])
        self.assertEqual(esperado, 1.0)

    def test_constante_con_ruido_coincide(self):
        ok, _, _, _ = rd.veredicto([1.0, 1.2, 0.9, 1.1], [100, 200, 400, 800], "O(1)")
        self.assertTrue(ok)

    def test_cuadratico_no_es_n_log_n(self):
        ok, _, _, _ = rd.veredicto([1, 4, 16, 64], [100, 200, 400, 800], "O(n log n)")
        self.assertFalse(ok)


class TestMedicion(unittest.TestCase):
    def test_mide_todas_las_operaciones(self):
        ns, tiempos = rd.medir_todo(base=60, pasos=2, repeticiones=50)
        self.assertEqual(ns, [60, 120])
        for clave, _, modelo, _ in rd.OPERACIONES:
            self.assertEqual(len(tiempos[clave]), 2)
            self.assertGreater(tiempos[clave][0], 0)
            self.assertIn(modelo, rd.MODELOS)


if __name__ == "__main__":
    unittest.main()
