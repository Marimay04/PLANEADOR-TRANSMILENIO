"""R10 · Fila de abordaje en hora pico.

Sin dict, set, sorted, .sort(), min/max, `in`/index/count sobre listas,
ni bisect/heapq/collections/functools.
"""
from .ordenamiento import merge_sort


class Cola:
    """Cola FIFO sobre un arreglo (list) con un índice al frente.

    encolar agrega al final y desencolar avanza el frente, así las dos son
    O(1). (list.pop(0) sería O(n) porque corre todos los elementos.)"""

    def __init__(self):
        self.datos = []
        self.frente = 0

    def vacia(self):
        """O(1)."""
        return self.frente >= len(self.datos)

    def encolar(self, x):
        """O(1) amortizado."""
        self.datos.append(x)

    def desencolar(self):
        """Saca el primero que llegó. O(1). Supone que no está vacía."""
        x = self.datos[self.frente]
        self.frente = self.frente + 1
        return x

    def tamano(self):
        """O(1)."""
        return len(self.datos) - self.frente


def _a_minutos(t):
    """Número -> el mismo número; 'HH:MM' -> minutos desde las 00:00."""
    if isinstance(t, str):
        partes = t.strip().split(":")
        return int(partes[0]) * 60 + int(partes[1])
    return t


def _primer_bus_desde(t, frecuencia):
    """Número k del primer bus (sale en k * frecuencia, k >= 1) que sale en
    el minuto t o después. O(1)."""
    k = int(t // frecuencia)
    if k * frecuencia < t:
        k = k + 1
    if k < 1:
        k = 1
    return k


def simular_fila(llegadas, frecuencia, capacidad):
    """Simula la fila de una estación en hora pico.

    - llegadas: minuto en que llega cada pasajero (números, o textos 'HH:MM').
      No tiene que venir ordenada.
    - frecuencia: cada cuántos minutos sale un bus. Los buses salen en
      frecuencia, 2*frecuencia, 3*frecuencia, ...
    - capacidad: cupos de cada bus.

    Los pasajeros suben en orden de llegada (FIFO); quien llega justo en el
    minuto de salida alcanza a subir; si dos llegan al mismo minuto, va
    primero el que aparece antes en la lista.

    Devuelve una lista con la espera en minutos de cada pasajero (minuto de
    salida de su bus - minuto de llegada), en el MISMO orden de `llegadas`.
    [] si no hay pasajeros; None si frecuencia o capacidad no son positivas
    o alguna llegada no es válida.

    O grande, con P = pasajeros:
      - ordenar las llegadas con merge sort: O(P log P)
      - simular: O(P). Cada pasajero entra y sale de la cola una sola vez, y
        cuando la cola queda vacía se salta directo al bus de la siguiente
        llegada, así que solo se procesan buses que llevan gente (<= P).
      Total: O(P log P)."""
    if llegadas is None or frecuencia is None or capacidad is None:
        return None
    if frecuencia <= 0 or capacidad <= 0:
        return None
    p = len(llegadas)
    if p == 0:
        return []

    # 1) Ordenar por (minuto, posición original). La posición desempata y
    #    permite devolver las esperas en el orden de la lista recibida.
    pares = []
    i = 0
    for t in llegadas:
        try:
            pares.append((_a_minutos(t), i))
        except (ValueError, IndexError, TypeError, AttributeError):
            return None
        i = i + 1
    pares = merge_sort(pares)

    # 2) Simular bus por bus.
    esperas = [0] * p
    cola = Cola()
    siguiente = 0      # próximo pasajero (en orden de llegada) por entrar a la fila
    ultimo_bus = 0
    while siguiente < p or not cola.vacia():
        if cola.vacia():
            # Nadie esperando: el próximo bus útil es el primero que sale
            # cuando llega el siguiente pasajero (salta buses vacíos).
            bus = _primer_bus_desde(pares[siguiente][0], frecuencia)
            if bus <= ultimo_bus:
                bus = ultimo_bus + 1
        else:
            bus = ultimo_bus + 1
        salida = bus * frecuencia

        # Entran a la fila todos los que llegaron hasta la salida.
        while siguiente < p and pares[siguiente][0] <= salida:
            cola.encolar(siguiente)
            siguiente = siguiente + 1

        # Suben hasta 'capacidad' pasajeros, en orden de llegada.
        suben = 0
        while suben < capacidad and not cola.vacia():
            j = cola.desencolar()
            esperas[pares[j][1]] = salida - pares[j][0]
            suben = suben + 1
        ultimo_bus = bus

    return esperas
