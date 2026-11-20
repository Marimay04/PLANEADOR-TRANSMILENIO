"""R11 · Mediciones del panel de rendimiento (sin interfaz gráfica).

Esto está FUERA del motor: aquí se puede usar cualquier librería. Solo
genera redes sintéticas, llama al motor y mide tiempos; no contiene reglas
del sistema.

Método (el mismo del script del profesor y del Taller 1): correr cada
operación con redes de tamaño n, 2n, 4n, ... y comparar cuánto crece el
tiempo con lo que predice la O grande esperada.
"""
import csv
import math
import os
import random
import shutil
import sys
import tempfile
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if RAIZ not in sys.path:
    sys.path.insert(0, RAIZ)

from motor import Red, simular_fila  # noqa: E402

# --------------------------------------------------------------------------
# Generador de redes sintéticas con el mismo formato de los CSV reales
# --------------------------------------------------------------------------
PARADAS_POR_RUTA = 12
VIAJES_POR_RUTA = 8        # horarios por (ruta, estación): constante al crecer n


def nombre_estacion(i):
    return "EST %06d" % i


def generar_red(carpeta, n, semilla=0):
    """Escribe estaciones.csv, rutas.csv y horarios.csv con n estaciones y
    n // 4 rutas de PARADAS_POR_RUTA paradas. Devuelve la lista de nombres."""
    azar = random.Random(semilla)
    nombres = [nombre_estacion(i) for i in range(n)]
    num_rutas = max(2, n // 4)
    largo = min(PARADAS_POR_RUTA, n)

    with open(os.path.join(carpeta, "estaciones.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["nombre"])
        for nom in nombres:
            w.writerow([nom])

    with open(os.path.join(carpeta, "rutas.csv"), "w", newline="", encoding="utf-8") as fr, \
            open(os.path.join(carpeta, "horarios.csv"), "w", newline="", encoding="utf-8") as fh:
        wr = csv.writer(fr)
        wh = csv.writer(fh)
        wr.writerow(["ruta", "orden", "estacion"])
        wh.writerow(["ruta", "estacion", "hora"])
        for r in range(num_rutas):
            ruta = "R%05d" % r
            paradas = azar.sample(nombres, largo)
            for orden, est in enumerate(paradas, start=1):
                wr.writerow([ruta, orden, est])
            for _ in range(VIAJES_POR_RUTA):
                minuto = azar.randint(5 * 60, 21 * 60)
                for est in paradas:
                    wh.writerow([ruta, est, "%02d:%02d" % (minuto // 60, minuto % 60)])
                    minuto += 2
    return nombres


# --------------------------------------------------------------------------
# Operaciones a medir
# --------------------------------------------------------------------------
# Complejidad esperada en función de n (número de estaciones). Lo que no
# depende de n (k, h, el tamaño del rango) se deja fijo al crecer la red.
MODELOS = {
    "O(1)": lambda n: 1.0,
    "O(log n)": lambda n: math.log2(n),
    "O(n log n)": lambda n: n * math.log2(n),
}

# (clave, nombre visible, O grande esperada, explicación si no coincide)
OPERACIONES = [
    ("carga", "Carga · Red(carpeta)", "O(n log n)",
     "La carga ordena estaciones y horarios con merge sort: O(H log H), con H "
     "proporcional a n. Leer CSV y crear objetos tiene un costo lineal grande "
     "que en redes pequeñas tapa el factor log."),
    ("r1", "R1 · estado", "O(1)",
     "Tabla hash: O(1) promedio. Variaciones pequeñas vienen del caché del "
     "procesador (tablas más grandes caben peor en memoria rápida)."),
    ("r2", "R2 · autocompletar (k=10)", "O(log n)",
     "Búsqueda binaria + recorrer k nombres: O(log n + k). Con k fijo, el log n "
     "crece tan poco que la medición se ve casi constante."),
    ("r3", "R3 · rango (20 nombres)", "O(log n)",
     "Búsqueda binaria + m nombres del rango: O(log n + m). Se mide con m fijo "
     "para aislar el log n."),
    ("r4", "R4 · proximo_bus", "O(1)",
     "Hash + búsqueda binaria en h horarios: O(log h). En la red generada h es "
     "fijo, así que no depende de n."),
    ("r6", "R6 · ranking (k=10)", "O(1)",
     "Top-k sobre el montículo sin modificarlo: O(k log k), independiente de n."),
    ("r7", "R7 · agregar + quitar parada", "O(log n)",
     "Lista enlazada + hash: O(1); reubicar la estación en el montículo del "
     "ranking: O(log n). El log n casi no se nota frente al costo fijo."),
    ("r8", "R8 · cerrar + reabrir", "O(log n)",
     "Hash O(1) + sacar/meter en el montículo O(log n)."),
    ("r9", "R9 · deshacer + rehacer", "O(log n)",
     "Pilas O(1) + operación inversa (cerrar/reabrir) O(log n)."),
    ("r10", "R10 · simular_fila (P = 10n)", "O(n log n)",
     "Merge sort de las llegadas O(P log P) + simulación O(P). Con P = 10n "
     "crece como n log n."),
]


def _cronometrar(fn, repeticiones, intentos=5):
    """Mejor tiempo por llamada (segundos) de 'intentos' tandas. Tomar el
    mínimo reduce el ruido del sistema operativo y del recolector de basura."""
    mejor = None
    for _ in range(intentos):
        t0 = time.perf_counter()
        for i in range(repeticiones):
            fn(i)
        dt = (time.perf_counter() - t0) / repeticiones
        if mejor is None or dt < mejor:
            mejor = dt
    return mejor


def medir_red(n, repeticiones=2000, semilla=0):
    """Genera una red de n estaciones, mide cada operación y devuelve
    {clave: segundos por llamada}."""
    carpeta = tempfile.mkdtemp(prefix="red_%d_" % n)
    try:
        nombres = generar_red(carpeta, n, semilla)
        azar = random.Random(semilla + 1)
        res = {}

        t0 = time.perf_counter()
        red = Red(carpeta)
        res["carga"] = time.perf_counter() - t0

        consultas = [nombres[azar.randrange(n)] for _ in range(repeticiones)]
        res["r1"] = _cronometrar(lambda i: red.estado(consultas[i]), repeticiones)

        prefijos = [c[:-1] for c in consultas]    # ~10 coincidencias cada uno
        res["r2"] = _cronometrar(lambda i: red.autocompletar(prefijos[i], 10), repeticiones)

        inicios = [azar.randrange(max(1, n - 20)) for _ in range(repeticiones)]
        res["r3"] = _cronometrar(
            lambda i: red.rango(nombres[inicios[i]], nombres[min(n - 1, inicios[i] + 19)]),
            repeticiones)

        rutas = []
        for r in range(max(2, n // 4)):
            ruta = "R%05d" % r
            rec = red.recorrido(ruta)
            if len(rec) >= 2:
                rutas.append((ruta, rec))
        pares = []
        for _ in range(repeticiones):
            ruta, rec = rutas[azar.randrange(len(rutas))]
            pares.append((ruta, rec[azar.randrange(len(rec))],
                          "%02d:%02d" % (azar.randint(5, 20), azar.randint(0, 59))))
        res["r4"] = _cronometrar(lambda i: red.proximo_bus(pares[i][1], pares[i][0], pares[i][2]),
                                 repeticiones)

        res["r6"] = _cronometrar(lambda i: red.ranking(10), repeticiones)

        # R7: quitar una parada intermedia y volver a ponerla en su lugar
        ediciones = []
        for _ in range(repeticiones):
            ruta, rec = rutas[azar.randrange(len(rutas))]
            j = azar.randrange(1, len(rec))
            ediciones.append((ruta, rec[j], rec[j - 1]))

        def r7(i):
            ruta, est, antes = ediciones[i]
            red.quitar_parada(ruta, est)
            red.agregar_parada(ruta, est, antes)
        res["r7"] = _cronometrar(r7, repeticiones)

        def r8(i):
            red.cerrar(consultas[i])
            red.reabrir(consultas[i])
        res["r8"] = _cronometrar(r8, repeticiones)

        red.cerrar(consultas[0])

        def r9(i):
            red.deshacer()
            red.rehacer()
        res["r9"] = _cronometrar(r9, repeticiones)

        llegadas = [azar.randint(0, 180) for _ in range(10 * n)]
        # En redes pequeñas una sola simulación dura muy poco: se repite
        # para que el reloj mida algo más grande que el ruido.
        veces = max(1, 50000 // len(llegadas))
        res["r10"] = _cronometrar(lambda i: simular_fila(llegadas, 3, 160), veces, intentos=3)
        return res
    finally:
        shutil.rmtree(carpeta, ignore_errors=True)


def tamanos(base, pasos):
    """[base, 2·base, 4·base, ...] con 'pasos' valores."""
    return [base * (2 ** i) for i in range(pasos)]


def razon_esperada(modelo, n):
    """Cuánto debería multiplicarse el tiempo al pasar de n a 2n."""
    f = MODELOS[modelo]
    return f(2 * n) / f(n)


def veredicto(tiempos, ns, modelo, tolerancia=1.5):
    """Devuelve (coincide, razones, total_medido, total_esperado).

    razones: t(2n)/t(n) medido en cada duplicación (lo que se muestra).
    Para decidir se compara el crecimiento TOTAL, del primer al último
    tamaño, con el que predice el modelo: así el ruido de una sola
    duplicación no decide. Coincide si no crece más de 'tolerancia' veces
    lo esperado (crecer menos de lo esperado no es un problema)."""
    razones = []
    for i in range(1, len(ns)):
        r = tiempos[i] / tiempos[i - 1] if tiempos[i - 1] > 0 else float("inf")
        razones.append(r)
    f = MODELOS[modelo]
    total_esperado = f(ns[-1]) / f(ns[0])
    total_medido = tiempos[-1] / tiempos[0] if tiempos[0] > 0 else float("inf")
    coincide = total_medido <= total_esperado * tolerancia
    return coincide, razones, total_medido, total_esperado


def medir_todo(base=500, pasos=4, repeticiones=2000, progreso=None):
    """Mide todas las operaciones en redes base, 2·base, ... Devuelve
    (ns, {clave: [tiempos]}). 'progreso(i, total, n)' se llama antes de
    cada tamaño (lo usa el panel para mostrar avance)."""
    ns = tamanos(base, pasos)
    tiempos = {}
    for clave, _, _, _ in OPERACIONES:
        tiempos[clave] = []
    for i, n in enumerate(ns):
        if progreso is not None:
            progreso(i, len(ns), n)
        res = medir_red(n, repeticiones)
        for clave in tiempos:
            tiempos[clave].append(res[clave])
    return ns, tiempos


if __name__ == "__main__":
    ns, tiempos = medir_todo(base=250, pasos=4, repeticiones=1000,
                             progreso=lambda i, t, n: print("midiendo n =", n))
    for clave, nombre, modelo, _ in OPERACIONES:
        ok, razones, total, esperado = veredicto(tiempos[clave], ns, modelo)
        print("%-32s %-11s %s  total x%.2f (esperado x%.2f)  %s" % (
            nombre, modelo, " ".join("x%.2f" % r for r in razones), total, esperado,
            "coincide" if ok else "NO coincide"))
