def hash_texto(clave):
    h = 0
    for c in clave:
        h = h * 31 + ord(c)
    return h


class TablaHash:
    """Tabla hash con encadenamiento. Mapa nombre (str) -> valor (no None)."""

    def __init__(self):
        self.cubetas = [[] for i in range(16)]
        self.n = 0

    def get(self, nombre):
        """Valor del nombre, o None si no existe. O(1) promedio."""
        i = hash_texto(nombre) % len(self.cubetas)
        for par in self.cubetas[i]:
            if par[0] == nombre:
                return par[1]
        return None

    def put(self, nombre, valor):
        """Inserta el nombre o, si ya existe, le cambia el valor."""
        i = hash_texto(nombre) % len(self.cubetas)
        for par in self.cubetas[i]:
            if par[0] == nombre:
                par[1] = valor
                return
        self.cubetas[i].append([nombre, valor])
        self.n = self.n + 1
        if self.n > len(self.cubetas):
            self._crecer()

    def _crecer(self):
        """Duplica las cubetas y recoloca todo (rehash)."""
        nuevas = [[] for i in range(len(self.cubetas) * 2)]
        for cubeta in self.cubetas:
            for par in cubeta:
                nuevas[hash_texto(par[0]) % len(nuevas)].append(par)
        self.cubetas = nuevas
