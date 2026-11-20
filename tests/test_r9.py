"""Pruebas de R9 (deshacer / rehacer). Correr: py -m unittest discover tests"""
import os
import sys
import unittest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

from motor import Red  # noqa: E402

DATOS = os.path.join(RAIZ, "datos")


class TestR9(unittest.TestCase):
    def setUp(self):
        self.red = Red(DATOS)
        self.ruta = "1-1"
        self.orig = self.red.recorrido(self.ruta)

    # -- historial vacío --
    def test_sin_historial(self):
        self.assertIsNone(self.red.deshacer())
        self.assertIsNone(self.red.rehacer())

    def test_operacion_fallida_no_se_registra(self):
        self.assertFalse(self.red.cerrar("NO EXISTE ESTA"))
        self.assertFalse(self.red.reabrir("CALLE 26"))          # ya abierta
        self.assertFalse(self.red.quitar_parada("RUTA FALSA", "CALLE 26"))
        self.assertFalse(self.red.agregar_parada(self.ruta, "CALLE 26", "NO ESTA"))
        self.assertFalse(self.red.agregar_parada(self.ruta, "CALLE 26", None))
        self.assertIsNone(self.red.deshacer())

    # -- cerrar / reabrir --
    def test_cerrar_deshacer_rehacer(self):
        top = self.red.ranking(1)[0][0]
        self.red.cerrar(top)
        self.assertEqual(self.red.deshacer(), ("cerrar", top))
        self.assertEqual(self.red.estado(top), "ABIERTA")
        self.assertEqual(self.red.ranking(1)[0][0], top)        # vuelve al ranking
        self.assertEqual(self.red.rehacer(), ("cerrar", top))
        self.assertEqual(self.red.estado(top), "CERRADA")
        self.assertNotEqual(self.red.ranking(1)[0][0], top)
        self.assertEqual(self.red.autocompletar(top, 5), [])

    def test_reabrir_se_deshace(self):
        self.red.cerrar("CALLE 26")
        self.red.reabrir("CALLE 26")
        self.assertEqual(self.red.deshacer(), ("reabrir", "CALLE 26"))
        self.assertEqual(self.red.estado("CALLE 26"), "CERRADA")

    # -- edición de rutas --
    def test_agregar_parada(self):
        self.red.agregar_parada(self.ruta, "CALLE 26", self.orig[0])
        self.assertEqual(self.red.deshacer(),
                         ("agregar_parada", self.ruta, "CALLE 26", self.orig[0]))
        self.assertEqual(self.red.recorrido(self.ruta), self.orig)
        self.red.rehacer()
        self.assertEqual(self.red.recorrido(self.ruta)[1], "CALLE 26")

    def test_quitar_parada_del_medio_inicio_y_final(self):
        for est in (self.orig[1], self.orig[0], self.orig[-1]):
            self.red.quitar_parada(self.ruta, est)
            self.assertEqual(self.red.deshacer(), ("quitar_parada", self.ruta, est))
            self.assertEqual(self.red.recorrido(self.ruta), self.orig)
            self.assertEqual(self.red.recorrido(self.ruta, al_reves=True),
                             self.orig[::-1])

    def test_quitar_parada_restaura_buses(self):
        antes = self.red.ranking(200)
        self.red.quitar_parada(self.ruta, self.orig[0])
        self.red.deshacer()
        self.assertEqual(self.red.ranking(200), antes)

    def test_vaciar_ruta_y_reconstruir(self):
        for est in self.orig:
            self.red.quitar_parada(self.ruta, est)
        self.assertEqual(self.red.recorrido(self.ruta), [])
        for _ in self.orig:
            self.red.deshacer()
        self.assertEqual(self.red.recorrido(self.ruta), self.orig)
        for _ in self.orig:
            self.red.rehacer()
        self.assertEqual(self.red.recorrido(self.ruta), [])

    # -- orden y cambio nuevo --
    def test_orden_correcto(self):
        self.red.cerrar("CALLE 26")
        self.red.quitar_parada(self.ruta, self.orig[1])
        self.red.cerrar("CALLE 72")
        self.assertEqual(self.red.deshacer()[1], "CALLE 72")
        self.assertEqual(self.red.deshacer()[0], "quitar_parada")
        self.assertEqual(self.red.deshacer()[1], "CALLE 26")
        self.assertIsNone(self.red.deshacer())
        self.assertEqual(self.red.rehacer()[1], "CALLE 26")
        self.assertEqual(self.red.rehacer()[0], "quitar_parada")
        self.assertEqual(self.red.rehacer()[1], "CALLE 72")
        self.assertIsNone(self.red.rehacer())

    def test_cambio_nuevo_borra_rehacer(self):
        self.red.cerrar("CALLE 26")
        self.red.deshacer()
        self.red.cerrar("CALLE 72")
        self.assertIsNone(self.red.rehacer())
        self.assertEqual(self.red.estado("CALLE 26"), "ABIERTA")

    def test_rehacer_no_borra_el_resto_de_rehacer(self):
        self.red.cerrar("CALLE 26")
        self.red.cerrar("CALLE 72")
        self.red.deshacer()
        self.red.deshacer()
        self.red.rehacer()
        self.assertEqual(self.red.rehacer(), ("cerrar", "CALLE 72"))


class TestBordesR1aR8(unittest.TestCase):
    """Regresión: bordes que no deben romperse con los cambios de R9."""

    @classmethod
    def setUpClass(cls):
        cls.red = Red(DATOS)

    def test_estacion_inexistente(self):
        self.assertEqual(self.red.estado("ESTACION FALSA"), "NO EXISTE")
        self.assertIsNone(self.red.proximo_bus("ESTACION FALSA", "1-1", "08:00"))
        self.assertIsNone(self.red.viaje("ESTACION FALSA", "CALLE 26"))

    def test_horario_fuera_de_servicio(self):
        self.assertIsNone(self.red.proximo_bus("UNIVERSIDADES", "1-1", "23:59"))

    def test_origen_igual_a_destino(self):
        self.assertIsNone(self.red.viaje("CALLE 26", "CALLE 26"))

    def test_prefijo_sin_coincidencias(self):
        self.assertEqual(self.red.autocompletar("ZZZ", 5), [])


if __name__ == "__main__":
    unittest.main()
