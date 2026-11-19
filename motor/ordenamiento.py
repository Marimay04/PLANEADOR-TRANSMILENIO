


def merge_sort(lista):
    """Devuelve una lista nueva con los elementos ordenados. O(n log n)."""
    if len(lista) <= 1:
        return lista
    mitad = len(lista) // 2
    izquierda = merge_sort(lista[:mitad])
    derecha = merge_sort(lista[mitad:])
    return _mezclar(izquierda, derecha)


def _mezclar(a, b):
    """Une dos listas ya ordenadas en una sola ordenada. O(len(a) + len(b))."""
    resultado = []
    i = 0
    j = 0
    while i < len(a) and j < len(b):
        if a[i] <= b[j]:
            resultado.append(a[i])
            i = i + 1
        else:
            resultado.append(b[j])
            j = j + 1
    while i < len(a):
        resultado.append(a[i])
        i = i + 1
    while j < len(b):
        resultado.append(b[j])
        j = j + 1
    return resultado


def primera_posicion(lista, valor):
    """Búsqueda binaria: índice del primer elemento >= valor
    (len(lista) si todos son menores). La lista debe estar ordenada. O(log n)."""
    bajo = 0
    alto = len(lista)
    while bajo < alto:
        medio = (bajo + alto) // 2
        if lista[medio] < valor:
            bajo = medio + 1
        else:
            alto = medio
    return bajo
