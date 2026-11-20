"""Pruebas de R7 (editar rutas). Correr: py -m unittest discover tests"""
import os
import sys
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from motor import Red  # noqa: E402

DATOS = os.path.join(RAIZ, "datos")


class TestR7(unittest.TestCase):
    def setUp(self):
        self.red = Red(DATOS)
        self.ruta = "1-1"
        self.orig = self.red.recorrido(self.ruta)

    # -- recorrido --
    def test_recorrido_ida(self):
        self.assertEqual(self.orig, ["UNIVERSIDADES", "RECINTO FERIAL",
                                     "EL TIEMPO - MALOKA", "PORTAL ELDORADO"])

    def test_recorrido_vuelta_es_la_ida_al_reves(self):
        vuelta = self.red.recorrido(self.ruta, al_reves=True)
        esperado = []
        i = len(self.orig) - 1
        while i >= 0:
            esperado.append(self.orig[i])
            i = i - 1
        self.assertEqual(vuelta, esperado)

    def test_recorrido_ruta_inexistente(self):
        self.assertEqual(self.red.recorrido("RUTA FALSA"), [])
        self.assertEqual(self.red.recorrido("RUTA FALSA", al_reves=True), [])

    # -- agregar_parada --
    def test_agregar_en_la_mitad(self):
        self.assertTrue(self.red.agregar_parada(self.ruta, "CAN", "RECINTO FERIAL"))
        self.assertEqual(self.red.recorrido(self.ruta),
                         ["UNIVERSIDADES", "RECINTO FERIAL", "CAN",
                          "EL TIEMPO - MALOKA", "PORTAL ELDORADO"])
        self.assertEqual(self.red.recorrido(self.ruta, al_reves=True),
                         ["PORTAL ELDORADO", "EL TIEMPO - MALOKA", "CAN",
                          "RECINTO FERIAL", "UNIVERSIDADES"])

    def test_agregar_despues_de_la_ultima(self):
        ultima = self.orig[len(self.orig) - 1]
        self.assertTrue(self.red.agregar_parada(self.ruta, "SENA", ultima))
        ida = self.red.recorrido(self.ruta)
        self.assertEqual(ida[len(ida) - 1], "SENA")
        self.assertEqual(self.red.recorrido(self.ruta, al_reves=True)[0], "SENA")

    def test_agregar_casos_que_fallan(self):
        self.assertFalse(self.red.agregar_parada("RUTA FALSA", "CAN", "UNIVERSIDADES"))
        self.assertFalse(self.red.agregar_parada(self.ruta, "CAN", "NO ESTA"))
        self.assertFalse(self.red.agregar_parada(self.ruta, "NO EXISTE", "UNIVERSIDADES"))
        self.assertFalse(self.red.agregar_parada(self.ruta, "RECINTO FERIAL", "UNIVERSIDADES"))  # ya está
        self.assertEqual(self.red.recorrido(self.ruta), self.orig)  # nada cambió

    # -- quitar_parada --
    def test_quitar_en_la_mitad(self):
        self.assertTrue(self.red.quitar_parada(self.ruta, "RECINTO FERIAL"))
        self.assertEqual(self.red.recorrido(self.ruta),
                         ["UNIVERSIDADES", "EL TIEMPO - MALOKA", "PORTAL ELDORADO"])

    def test_quitar_primera_y_ultima(self):
        self.assertTrue(self.red.quitar_parada(self.ruta, "UNIVERSIDADES"))
        self.assertTrue(self.red.quitar_parada(self.ruta, "PORTAL ELDORADO"))
        self.assertEqual(self.red.recorrido(self.ruta),
                         ["RECINTO FERIAL", "EL TIEMPO - MALOKA"])
        self.assertEqual(self.red.recorrido(self.ruta, al_reves=True),
                         ["EL TIEMPO - MALOKA", "RECINTO FERIAL"])

    def test_vaciar_ruta_y_volver_a_llenar(self):
        for estacion in self.orig:
            self.assertTrue(self.red.quitar_parada(self.ruta, estacion))
        self.assertEqual(self.red.recorrido(self.ruta), [])
        self.assertEqual(self.red.recorrido(self.ruta, al_reves=True), [])
        self.assertFalse(self.red.quitar_parada(self.ruta, "UNIVERSIDADES"))

    def test_quitar_casos_que_fallan(self):
        self.assertFalse(self.red.quitar_parada("RUTA FALSA", "UNIVERSIDADES"))
        self.assertFalse(self.red.quitar_parada(self.ruta, "CAN"))  # no está en la ruta
        self.assertEqual(self.red.recorrido(self.ruta), self.orig)

    def test_quitar_y_volver_a_agregar(self):
        self.assertTrue(self.red.quitar_parada(self.ruta, "RECINTO FERIAL"))
        self.assertTrue(self.red.agregar_parada(self.ruta, "RECINTO FERIAL", "UNIVERSIDADES"))
        self.assertEqual(self.red.recorrido(self.ruta), self.orig)

    # -- R7 afecta a R4 (proximo_bus) y R6 (ranking) --
    def test_quitar_parada_afecta_proximo_bus(self):
        self.assertIsNotNone(self.red.proximo_bus("RECINTO FERIAL", self.ruta, "10:00"))
        self.red.quitar_parada(self.ruta, "RECINTO FERIAL")
        self.assertIsNone(self.red.proximo_bus("RECINTO FERIAL", self.ruta, "10:00"))

    def test_quitar_parada_resta_buses_del_ranking(self):
        def buses(nombre):
            for par in self.red.ranking(1000):
                if par[0] == nombre:
                    return par[1]
            return None
        antes = buses("RECINTO FERIAL")
        self.red.quitar_parada(self.ruta, "RECINTO FERIAL")
        despues = buses("RECINTO FERIAL")
        self.assertLess(despues, antes)
        self.red.agregar_parada(self.ruta, "RECINTO FERIAL", "UNIVERSIDADES")
        self.assertEqual(buses("RECINTO FERIAL"), antes)


if __name__ == "__main__":
    unittest.main()