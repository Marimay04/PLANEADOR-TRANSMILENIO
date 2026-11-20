"""Estructuras para R4 (próximo bus), R5 (viaje) y R6 (ranking).

Sin dict, set, sorted, .sort(), min/max, `in`/index/count sobre listas,
ni bisect/heapq/collections/functools.
"""
from .tabla_hash import TablaHash


class InfoEstacion:
    """Datos extra de una estación para R5 y R6.
    (Si está abierta o cerrada sigue guardado en Red._estaciones, R1.)"""

    def __init__(self, nombre):
        self.nombre = nombre
        self.buses = 0       # R6: buses por día que pasan por aquí
        self.pos_heap = -1   # R6: posición en el montículo (-1 = cerrada)
        self.nodos = []      # R5: nodos de las rutas donde aparece


class NodoRuta:
    """Nodo de la lista doblemente enlazada de una ruta."""

    def __init__(self, ruta, info):
        self.ruta = ruta     # nombre de la ruta
        self.info = info     # InfoEstacion
        self.ant = None
        self.sig = None


class Ruta:
    """Lista doblemente enlazada + tabla hash estación -> nodo."""

    def __init__(self, nombre):
        self.nombre = nombre
        self.cabeza = None
        self.cola = None
        self.nodo_de = TablaHash()   # nombre estación -> NodoRuta

    def agregar_al_final(self, nodo):
        if self.cola is None:
            self.cabeza = nodo
            self.cola = nodo
        else:
            nodo.ant = self.cola
            self.cola.sig = nodo
            self.cola = nodo
        self.nodo_de.put(nodo.info.nombre, nodo)
        nodo.info.nodos.append(nodo)


class Horario:
    """Horas de una ruta en una estación, ordenadas (R4)."""

    def __init__(self):
        self.minutos = []   # enteros, ordenados
        self.textos = []    # "HH:MM", en el mismo orden


# ----------------------------------------------------------------------
# R6 · Montículo máximo indexado
# ----------------------------------------------------------------------
def va_antes(a, b):
    """a va antes que b en el ranking: más buses; si empatan, alfabético."""
    if a.buses != b.buses:
        return a.buses > b.buses
    return a.nombre < b.nombre


class HeapRanking:
    """Max-heap de InfoEstacion abiertas. Cada estación guarda su posición
    (pos_heap), así se puede sacar o reubicar en O(log n)."""

    def __init__(self, estaciones):
        self.a = []
        for e in estaciones:
            e.pos_heap = len(self.a)
            self.a.append(e)
        i = len(self.a) // 2 - 1          # heapify: O(n)
        while i >= 0:
            self._bajar(i)
            i = i - 1

    def _cambiar(self, i, j):
        a = self.a
        a[i], a[j] = a[j], a[i]
        a[i].pos_heap = i
        a[j].pos_heap = j

    def _subir(self, i):
        while i > 0:
            p = (i - 1) // 2
            if va_antes(self.a[i], self.a[p]):
                self._cambiar(i, p)
                i = p
            else:
                break

    def _bajar(self, i):
        n = len(self.a)
        while True:
            izq = 2 * i + 1
            if izq >= n:
                break
            m = izq
            der = izq + 1
            if der < n and va_antes(self.a[der], self.a[izq]):
                m = der
            if va_antes(self.a[m], self.a[i]):
                self._cambiar(i, m)
                i = m
            else:
                break

    def insertar(self, e):
        """Reabrir. O(log n)."""
        e.pos_heap = len(self.a)
        self.a.append(e)
        self._subir(e.pos_heap)

    def sacar(self, e):
        """Cerrar. O(log n)."""
        i = e.pos_heap
        if i < 0:
            return
        ultimo = len(self.a) - 1
        if i != ultimo:
            self._cambiar(i, ultimo)
        self.a.pop()
        e.pos_heap = -1
        if i < len(self.a):
            self._subir(i)
            self._bajar(i)

    def actualizar(self, e):
        """Después de cambiar e.buses. O(log n)."""
        if e.pos_heap >= 0:
            self._subir(e.pos_heap)
            self._bajar(e.pos_heap)

    def top_k(self, k):
        """Las k primeras SIN modificar el montículo. O(k log k).

        Heap auxiliar de posiciones del montículo principal: empieza con la
        raíz; cada vez que se saca una posición se meten sus dos hijos.
        Nunca tiene más de k+1 elementos, así que no depende de n."""
        a = self.a
        resultado = []
        if k <= 0 or len(a) == 0:
            return resultado
        aux = [0]
        while len(aux) > 0 and len(resultado) < k:
            top = aux[0]
            ultimo = aux.pop()
            if len(aux) > 0:              # bajar en el auxiliar
                aux[0] = ultimo
                i = 0
                n = len(aux)
                while True:
                    izq = 2 * i + 1
                    if izq >= n:
                        break
                    m = izq
                    if izq + 1 < n and va_antes(a[aux[izq + 1]], a[aux[izq]]):
                        m = izq + 1
                    if va_antes(a[aux[m]], a[aux[i]]):
                        aux[i], aux[m] = aux[m], aux[i]
                        i = m
                    else:
                        break
            resultado.append((a[top].nombre, a[top].buses))
            for h in (2 * top + 1, 2 * top + 2):   # meter hijos
                if h < len(a):
                    aux.append(h)
                    j = len(aux) - 1
                    while j > 0:
                        p = (j - 1) // 2
                        if va_antes(a[aux[j]], a[aux[p]]):
                            aux[j], aux[p] = aux[p], aux[j]
                            j = p
                        else:
                            break
        return resultado
