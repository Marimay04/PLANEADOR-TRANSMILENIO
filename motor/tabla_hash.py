class TablaHash:
    """Tabla hash con encadenamiento. Mapa nombre (str) -> valor (no None).

    - Cubetas: un arreglo de listas; cada cubeta guarda pares [nombre, valor].
    - El número de cubetas es potencia de 2, así la cubeta de un nombre es
      hash(nombre) & (cubetas - 1): los últimos bits del hash, sin dividir.
    - El número del nombre lo calcula hash() de Python. Hace lo mismo que
      recorrer las letras (h = h*31 + letra) pero en C, y el texto lo guarda
      la primera vez, así que en las consultas siguientes no se recalcula.
      (dict y set están prohibidos; hash() no: la tabla sigue siendo nuestra.)
    - Cuando hay más nombres que cubetas, se duplican y se recoloca todo.
    """

    def __init__(self):
        self.cubetas = [[] for i in range(16)]
        self.mascara = 15          # cubetas - 1
        self.n = 0

    def get(self, nombre):
        """Valor del nombre, o None si no existe. O(1) promedio."""
        for par in self.cubetas[hash(nombre) & self.mascara]:
            if par[0] == nombre:
                return par[1]
        return None

    def put(self, nombre, valor):
        """Inserta el nombre o, si ya existe, le cambia el valor. O(1) promedio."""
        cubeta = self.cubetas[hash(nombre) & self.mascara]
        for par in cubeta:
            if par[0] == nombre:
                par[1] = valor
                return
        cubeta.append([nombre, valor])
        self.n = self.n + 1
        if self.n > self.mascara:
            self._crecer()

    def _crecer(self):
        """Duplica las cubetas y recoloca todo (rehash). O(n), pero ocurre
        cada vez que n se duplica, así que en promedio cada put sigue O(1)."""
        total = (self.mascara + 1) * 2
        nuevas = [[] for i in range(total)]
        m = total - 1
        for cubeta in self.cubetas:
            for par in cubeta:
                nuevas[hash(par[0]) & m].append(par)
        self.cubetas = nuevas
        self.mascara = m
