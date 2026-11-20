import csv

from .tabla_hash import TablaHash
from .ordenamiento import merge_sort, primera_posicion
from .estructuras_viaje import InfoEstacion, NodoRuta, Ruta, Horario, HeapRanking

# El contrato pide exactamente estos textos (en mayúsculas).
ABIERTA = "ABIERTA"
CERRADA = "CERRADA"
NO_EXISTE = "NO EXISTE"


def _ruta(carpeta, archivo):
    if carpeta.endswith("/") or carpeta.endswith("\\"):
        return carpeta + archivo
    return carpeta + "/" + archivo


def _leer_csv(archivo):
    """Devuelve (encabezado, filas) como listas. Sin DictReader (es un dict)."""
    encabezado = None
    filas = []
    with open(archivo, newline="", encoding="utf-8-sig") as f:
        for fila in csv.reader(f):
            if encabezado is None:
                encabezado = []
                for c in fila:
                    encabezado.append(c.strip().lower())
            elif len(fila) > 0:
                filas.append(fila)
    return encabezado, filas


def _columna(encabezado, nombre):
    """Posición de una columna recorriendo el encabezado (sin .index())."""
    for i in range(len(encabezado)):
        if encabezado[i] == nombre:
            return i
    raise ValueError("falta la columna " + nombre)


def _a_minutos(hhmm):
    """'HH:MM' -> minutos desde las 00:00. Acepta horas >= 24 (p.ej. 25:10)."""
    partes = hhmm.strip().split(":")
    return int(partes[0]) * 60 + int(partes[1])


class Red:
    def __init__(self, carpeta):
        # R1: nombre -> True (abierta) / False (cerrada)
        self._estaciones = TablaHash()
        # R2 y R3: todos los nombres en orden alfabético (abiertas y cerradas)
        self._nombres_ordenados = []
        # R5 y R6: nombre -> InfoEstacion (buses, posición en el heap, nodos)
        self._info = TablaHash()
        # R5 y R7: nombre de ruta -> Ruta (lista doblemente enlazada)
        self._rutas = TablaHash()
        # R4: "ruta|estacion" -> Horario (horas ordenadas)
        self._horarios = TablaHash()
        # R9: dos pilas (listas usadas como arreglo, el tope es el final).
        # Cada elemento es [descripcion, anterior]; 'anterior' solo lo usa
        # quitar_parada para saber dónde volver a poner la estación.
        self._hechos = []       # cambios que se pueden deshacer
        self._deshechos = []    # cambios deshechos que se pueden rehacer

        self._cargar_estaciones(_ruta(carpeta, "estaciones.csv"))
        self._cargar_rutas(_ruta(carpeta, "rutas.csv"))
        self._cargar_horarios(_ruta(carpeta, "horarios.csv"))

        # R6: montículo con todas las estaciones (al cargar todas están abiertas)
        todas = []
        for nombre in self._nombres_ordenados:
            todas.append(self._info.get(nombre))
        self._heap = HeapRanking(todas)

    def _cargar_estaciones(self, archivo):
        nombres = []
        with open(archivo, newline="", encoding="utf-8-sig") as f:
            primera = True
            for fila in csv.reader(f):
                if primera:  # encabezado
                    primera = False
                    continue
                if len(fila) == 0 or fila[0] == "":
                    continue
                nombre = fila[0].strip()
                self._estaciones.put(nombre, True)
                self._info.put(nombre, InfoEstacion(nombre))
                nombres.append(nombre)
        # Se ordena una sola vez al cargar: O(n log n)
        self._nombres_ordenados = merge_sort(nombres)

    def _cargar_rutas(self, archivo):
        """Agrupa las filas por ruta, las ordena por 'orden' y arma cada
        ruta como lista doblemente enlazada. O(F log F), F = filas."""
        enc, filas = _leer_csv(archivo)
        c_ruta = _columna(enc, "ruta")
        c_orden = _columna(enc, "orden")
        c_est = _columna(enc, "estacion")
        grupos = TablaHash()        # ruta -> lista de (orden, estacion)
        nombres_rutas = []
        for fila in filas:
            r = fila[c_ruta].strip()
            grupo = grupos.get(r)
            if grupo is None:
                grupo = []
                grupos.put(r, grupo)
                nombres_rutas.append(r)
            grupo.append((int(fila[c_orden]), fila[c_est].strip()))
        for r in nombres_rutas:
            ruta = Ruta(r)
            self._rutas.put(r, ruta)
            for par in merge_sort(grupos.get(r)):
                info = self._info.get(par[1])
                if info is None or ruta.nodo_de.get(par[1]) is not None:
                    continue    # estación desconocida o repetida en la ruta
                ruta.agregar_al_final(NodoRuta(r, info))

    def _cargar_horarios(self, archivo):
        """Agrupa las horas por (ruta, estación) y ordena cada grupo una vez.
        También cuenta los buses por día de cada estación (R6).
        O(H log H), H = filas de horarios.csv."""
        enc, filas = _leer_csv(archivo)
        c_ruta = _columna(enc, "ruta")
        c_est = _columna(enc, "estacion")
        c_hora = _columna(enc, "hora")
        creados = []
        for fila in filas:
            r = fila[c_ruta].strip()
            nombre = fila[c_est].strip()
            hora = fila[c_hora].strip()
            clave = r + "|" + nombre
            h = self._horarios.get(clave)
            if h is None:
                h = Horario()
                self._horarios.put(clave, h)
                creados.append(h)
            h.textos.append(hora)
            info = self._info.get(nombre)
            if info is not None:
                info.buses = info.buses + 1
        for h in creados:
            pares = []
            for t in h.textos:
                pares.append((_a_minutos(t), t))
            pares = merge_sort(pares)
            h.minutos = []
            h.textos = []
            for p in pares:
                h.minutos.append(p[0])
                h.textos.append(p[1])

    # ---- R1 ----
    def estado(self, nombre):
        """'ABIERTA', 'CERRADA' o 'NO EXISTE'. O(1) promedio."""
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

    # ---- R4 ----
    def proximo_bus(self, estacion, ruta, hora):
        """Hora 'HH:MM' del siguiente bus de esa ruta en esa estación
        (un bus a la misma hora cuenta), o None si no hay más ese día.
        Tabla hash para hallar las horas de (ruta, estación) en O(1) promedio
        y búsqueda binaria en ellas: O(log h), h = horarios de esa ruta en
        esa estación. No depende del número de estaciones."""
        if not self._esta_abierta(estacion):
            return None             # no existe o está cerrada
        r = self._rutas.get(ruta)
        if r is None or r.nodo_de.get(estacion) is None:
            return None             # ruta inexistente o ya no para ahí
        h = self._horarios.get(ruta + "|" + estacion)
        if h is None:
            return None
        try:
            m = _a_minutos(hora)
        except (ValueError, IndexError, AttributeError):
            return None
        i = primera_posicion(h.minutos, m)    # primer horario >= hora
        if i >= len(h.minutos):
            return None
        return h.textos[i]

    # ---- R5 ----
    def viaje(self, origen, destino):
        """Lista de tramos (ruta, sube_en, baja_en): 1 si es directo, 2 si hay
        transbordo; el que recorra menos paradas (en empate, el directo).
        None si no hay viaje.

        1) Desde cada aparición de destino se camina HACIA ATRÁS por su ruta
           y se guarda en una tabla hash, por estación, la menor distancia a
           destino y con qué ruta.
        2) Desde cada aparición de origen se camina HACIA ADELANTE: si se
           llega a destino es directo; si la estación está abierta y está en
           la tabla con otra ruta, es un transbordo de d1 + d2 paradas.
        O(L) promedio, L = suma de las longitudes de las rutas que pasan por
        origen y por destino."""
        if not self._esta_abierta(origen) or not self._esta_abierta(destino):
            return None
        if origen == destino:
            return None
        info_o = self._info.get(origen)
        info_d = self._info.get(destino)

        # Paso 1: hacia atrás desde destino
        hacia_destino = TablaHash()     # estación -> [distancia, ruta]
        for nodo in info_d.nodos:
            d = 0
            p = nodo.ant
            while p is not None:
                d = d + 1
                previo = hacia_destino.get(p.info.nombre)
                if previo is None:
                    hacia_destino.put(p.info.nombre, [d, nodo.ruta])
                elif d < previo[0]:
                    previo[0] = d
                    previo[1] = nodo.ruta
                p = p.ant

        # Paso 2: hacia adelante desde origen
        mejor = None
        mejor_paradas = -1
        for nodo in info_o.nodos:
            r1 = nodo.ruta
            d = 0
            p = nodo.sig
            while p is not None:
                d = d + 1
                nombre = p.info.nombre
                if p.info is info_d:
                    if mejor is None or d < mejor_paradas or \
                            (d == mejor_paradas and len(mejor) == 2):
                        mejor = [(r1, origen, destino)]
                        mejor_paradas = d
                    break           # seguir más allá solo alarga el viaje
                if self._esta_abierta(nombre):      # se puede transbordar
                    dato = hacia_destino.get(nombre)
                    if dato is not None and dato[1] != r1:
                        total = d + dato[0]
                        if mejor is None or total < mejor_paradas:
                            mejor = [(r1, origen, nombre),
                                     (dato[1], nombre, destino)]
                            mejor_paradas = total
                p = p.sig
        return mejor

    # ---- R6 ----
    def ranking(self, k):
        """Lista de (nombre, buses_por_dia) de las k estaciones abiertas con
        más buses, de mayor a menor (empate: alfabético).
        Montículo máximo indexado: consulta O(k log k), no depende de n."""
        if k is None or k <= 0:
            return []
        return self._heap.top_k(k)

    def _r6_sumar_buses(self, info, delta):
        """Cambia los buses de una estación y la reubica en el heap. O(log n)."""
        if delta != 0:
            info.buses = info.buses + delta
            self._heap.actualizar(info)

    def _buses_de(self, ruta, estacion):
        h = self._horarios.get(ruta + "|" + estacion)
        if h is None:
            return 0
        return len(h.textos)

    # ---- R7 (base que usan R5 y R6) ----
    def agregar_parada(self, ruta, nueva, despues_de):
        """True si agregó 'nueva' justo después de 'despues_de'. O(1) promedio
        (+ O(log n) del ranking). Si cambió algo queda en el historial (R9)."""
        if despues_de is None:
            return False        # la API pública siempre pide una parada previa
        if not self._agregar(ruta, nueva, despues_de):
            return False
        self._registrar(("agregar_parada", ruta, nueva, despues_de), None)
        return True

    def _agregar(self, ruta, nueva, despues_de):
        """Inserta 'nueva' después de 'despues_de' (None = al inicio de la
        ruta, solo lo usa deshacer). No toca el historial. O(1) promedio."""
        r = self._rutas.get(ruta)
        info = self._info.get(nueva)
        if r is None or info is None or r.nodo_de.get(nueva) is not None:
            return False
        nodo = NodoRuta(ruta, info)
        if despues_de is None:              # al inicio
            nodo.sig = r.cabeza
            if r.cabeza is not None:
                r.cabeza.ant = nodo
            else:
                r.cola = nodo
            r.cabeza = nodo
        else:
            anterior = r.nodo_de.get(despues_de)
            if anterior is None:
                return False
            nodo.ant = anterior
            nodo.sig = anterior.sig
            if anterior.sig is not None:
                anterior.sig.ant = nodo
            else:
                r.cola = nodo
            anterior.sig = nodo
        r.nodo_de.put(nueva, nodo)
        info.nodos.append(nodo)
        # R6: si esa ruta tenía horarios ahí (se quitó y se vuelve a poner)
        # recupera sus buses; si es nueva, no tiene horarios y suma 0.
        self._r6_sumar_buses(info, self._buses_de(ruta, nueva))
        return True

    def quitar_parada(self, ruta, estacion):
        """True si la quitó, False si no estaba. O(1) promedio + O(rutas de
        esa estación) para sacarla de su lista de nodos. Si cambió algo queda
        en el historial (R9) junto con la parada anterior, para deshacerlo."""
        anterior = self._quitar(ruta, estacion)
        if anterior is False:
            return False
        self._registrar(("quitar_parada", ruta, estacion), anterior)
        return True

    def _quitar(self, ruta, estacion):
        """Saca la estación de la ruta sin tocar el historial. Devuelve el
        nombre de la parada que tenía antes (None si era la primera) o False
        si no estaba."""
        r = self._rutas.get(ruta)
        if r is None:
            return False
        nodo = r.nodo_de.get(estacion)
        if nodo is None:
            return False
        anterior = None
        if nodo.ant is not None:
            anterior = nodo.ant.info.nombre
        if nodo.ant is not None:
            nodo.ant.sig = nodo.sig
        else:
            r.cabeza = nodo.sig
        if nodo.sig is not None:
            nodo.sig.ant = nodo.ant
        else:
            r.cola = nodo.ant
        r.nodo_de.put(estacion, None)   # get() devuelve None = ya no está
        info = nodo.info
        quedan = []
        for x in info.nodos:
            if x is not nodo:
                quedan.append(x)
        info.nodos = quedan
        # R6: los buses de esa ruta ya no pasan por esta estación
        self._r6_sumar_buses(info, -self._buses_de(ruta, estacion))
        return anterior

    def recorrido(self, ruta, al_reves=False):
        """Nombres en orden ([] si la ruta no existe). O(m), m = paradas."""
        resultado = []
        r = self._rutas.get(ruta)
        if r is None:
            return resultado
        if al_reves:
            p = r.cola
            while p is not None:
                resultado.append(p.info.nombre)
                p = p.ant
        else:
            p = r.cabeza
            while p is not None:
                resultado.append(p.info.nombre)
                p = p.sig
        return resultado

    # ---- R8 ----
    def cerrar(self, nombre):
        """Cierra la estación. True si cambió; False si no existe o ya estaba cerrada. O(log n)."""
        if not self._cambiar_estado(nombre, False):
            return False
        self._registrar(("cerrar", nombre), None)
        return True

    def reabrir(self, nombre):
        """Reabre la estación. True si cambió; False si no existe o ya estaba abierta. O(log n)."""
        if not self._cambiar_estado(nombre, True):
            return False
        self._registrar(("reabrir", nombre), None)
        return True

    def _cambiar_estado(self, nombre, abierta):
        actual = self._estaciones.get(nombre)
        if actual is None:      # no existe: no se crea
            return False
        if actual == abierta:   # ya estaba así: no hay cambio
            return False
        self._estaciones.put(nombre, abierta)
        # R6: una estación cerrada sale del ranking; al reabrir vuelve. O(log n)
        info = self._info.get(nombre)
        if abierta:
            self._heap.insertar(info)
        else:
            self._heap.sacar(info)
        return True

    # ---- R9 ----
    # Dos pilas: _hechos (para deshacer) y _deshechos (para rehacer).
    # Cada cambio guarda su descripción; deshacer aplica la operación inversa
    # con los métodos internos (_cambiar_estado, _agregar, _quitar), que ya
    # mantienen al día la tabla hash, las rutas y el montículo del ranking.

    def _registrar(self, descripcion, anterior):
        """Apila un cambio nuevo y borra lo que había para rehacer. O(1)."""
        self._hechos.append([descripcion, anterior])
        self._deshechos = []

    def deshacer(self):
        """Deshace el último cambio (cerrar, reabrir, agregar_parada o
        quitar_parada). Devuelve su descripción, por ejemplo
        ("cerrar", "CALLE 26") o ("quitar_parada", ruta, estacion), o None si
        no hay nada que deshacer.
        O(1) de la pila + lo que cueste la operación inversa (O(log n) por el
        ranking; n = estaciones abiertas)."""
        if len(self._hechos) == 0:
            return None
        cambio = self._hechos.pop()
        d = cambio[0]
        tipo = d[0]
        if tipo == "cerrar":
            self._cambiar_estado(d[1], True)
        elif tipo == "reabrir":
            self._cambiar_estado(d[1], False)
        elif tipo == "agregar_parada":
            self._quitar(d[1], d[2])
        else:                               # quitar_parada
            self._agregar(d[1], d[2], cambio[1])
        self._deshechos.append(cambio)
        return d

    def rehacer(self):
        """Vuelve a aplicar el último cambio deshecho y devuelve su
        descripción, o None si no hay nada que rehacer (o si un cambio nuevo
        borró lo que había). Misma complejidad que deshacer."""
        if len(self._deshechos) == 0:
            return None
        cambio = self._deshechos.pop()
        d = cambio[0]
        tipo = d[0]
        if tipo == "cerrar":
            self._cambiar_estado(d[1], False)
        elif tipo == "reabrir":
            self._cambiar_estado(d[1], True)
        elif tipo == "agregar_parada":
            self._agregar(d[1], d[2], d[3])
        else:                               # quitar_parada
            cambio[1] = self._quitar(d[1], d[2])
        self._hechos.append(cambio)         # sin borrar _deshechos
        return d
