# Planeador de viajes TransMilenio

Proyecto final de **Estructuras de Datos y Algoritmos** (Universidad de La Sabana). Con la red real de TransMilenio, la app permite buscar estaciones, planear un viaje, saber a qué hora pasa el siguiente bus y operar la red: cerrar estaciones, editar rutas y deshacer cambios.

El proyecto tiene dos partes:

- **`motor/`**: toda la lógica, en Python. Cada estructura de datos la programamos nosotros; dentro del motor no se usa `dict`, `set`, `sorted`, `.sort()`, `min`/`max` sobre colecciones, `x in lista`, `.index()`, `.count()` ni librerías externas. Solo se importa `csv`.
- **`front/`**: la app web y el panel de rendimiento. Únicamente llaman a los métodos del motor y muestran lo que devuelven.

## Integrantes y requisitos

| Integrante | Requisitos |
|---|---|
| Marco Vargas | R1, R2, R3, R8 |
| Juan Diego Castillo | R4, R5, R6 |
| Mariana Mayorga | R7, R12 |
| Sebastian Pereira | R9, R10, R11 |

El detalle de lo que hizo cada uno está en [integrantes.md](integrantes.md).

## Ejecución

No hay que instalar nada: todo funciona con Python 3.10 o superior y su librería estándar. Los comandos se corren desde la carpeta raíz del repositorio.

**App web**

```bash
py front/app.py
```

Se abre en `http://localhost:8000` (en macOS o Linux: `python3 front/app.py`). Para usar otra red con los mismos tres CSV: `py front/app.py ruta/a/la/carpeta`.

**Versión en línea (Netlify)**

La misma app se publica como sitio estático: el motor corre dentro del navegador con [Pyodide](https://pyodide.org) (Python compilado para el navegador), así que es exactamente el mismo código de `motor/`. Netlify lee `netlify.toml` y en cada despliegue ejecuta `python3 front/construir_netlify.py`, que arma la carpeta `dist/` con la interfaz, el motor y los CSV. La primera carga tarda unos segundos mientras descarga Pyodide. El panel de rendimiento (R11) solo funciona en la versión local.

**Panel de rendimiento (R11)**

```bash
py front/panel_rendimiento.py
```

**Pruebas**

```bash
py -m unittest discover tests
```

**El motor desde Python**

```python
from motor import Red, simular_fila

red = Red("datos")
red.estado("RICAURTE")                    # 'ABIERTA'
red.autocompletar("CAL", 3)               # ['CALLE 100', 'CALLE 106', 'CALLE 127']
red.viaje("PORTAL NORTE", "PORTAL USME")  # [('8-3', 'PORTAL NORTE', 'TOBERIN'), ('H72-1', 'TOBERIN', 'PORTAL USME')]
red.ranking(3)                            # [('RICAURTE', 4446), ('PORTAL NORTE', 3282), ('BANDERAS', 3038)]
simular_fila([30, 5, 5, 70], 60, 2)       # [120, 60, 60, 120]
```

## API del motor

| Llamada | Req. | Retorno |
|---|---|---|
| `Red(carpeta)` | — | Carga `estaciones.csv`, `rutas.csv` y `horarios.csv`; todas las estaciones empiezan abiertas |
| `red.estado(nombre)` | R1 | `"ABIERTA"`, `"CERRADA"` o `"NO EXISTE"` |
| `red.autocompletar(prefijo, k)` | R2 | Hasta `k` estaciones abiertas que empiezan por `prefijo`, en orden alfabético |
| `red.rango(desde, hasta)` | R3 | Estaciones abiertas entre `desde` y `hasta` (ambos incluidos), en orden alfabético |
| `red.proximo_bus(estacion, ruta, hora)` | R4 | Hora `"HH:MM"` del siguiente bus, o `None` |
| `red.viaje(origen, destino)` | R5 | Lista de tramos `(ruta, sube_en, baja_en)` (uno si es directo, dos si hay transbordo), o `None` |
| `red.ranking(k)` | R6 | Lista de `(nombre, buses_por_dia)` de mayor a menor |
| `red.agregar_parada(ruta, nueva, despues_de)` | R7 | `True` / `False` |
| `red.quitar_parada(ruta, estacion)` | R7 | `True` / `False` |
| `red.recorrido(ruta, al_reves=False)` | R7 | Lista de estaciones en orden (`[]` si la ruta no existe) |
| `red.cerrar(nombre)`, `red.reabrir(nombre)` | R8 | `True` si cambió el estado |
| `red.deshacer()`, `red.rehacer()` | R9 | `True` si había algo que deshacer o rehacer |
| `simular_fila(llegadas, frecuencia, capacidad)` | R10 | Segundo de salida del bus de cada pasajero, en el orden de `llegadas` |

Entradas inválidas (estación o ruta que no existe, hora mal escrita, `k ≤ 0`, rango al revés, origen igual a destino, historial vacío, frecuencia o capacidad no positivas) devuelven `[]`, `None` o `False` según el método, sin lanzar errores.

## Estructuras implementadas

| Estructura | Archivo | La usan |
|---|---|---|
| Tabla hash con encadenamiento | `motor/tabla_hash.py` | R1, R4, R5, R7, R8 |
| Merge sort y búsqueda binaria | `motor/ordenamiento.py` | Carga, R2, R3, R4, R10 |
| Lista doblemente enlazada por ruta | `motor/estructuras_viaje.py` | R5, R7 |
| Montículo máximo indexado | `motor/estructuras_viaje.py` | R6, R8 |
| Dos pilas | `motor/Red.py` | R9 |
| Cola FIFO | `motor/fila.py` | R10 |

## Decisiones de diseño (R12)

En cada requisito: qué usamos, cómo funciona, qué otra opción pensamos y por qué no la elegimos, su complejidad (diciendo qué es *n*) y cuánto creció el tiempo al duplicar la red (ver [Rendimiento](#rendimiento-r11)).

### R1 · Buscar una estación
- **Qué usamos:** una tabla hash propia. Las cubetas son un arreglo y cada cubeta es una lista de pares `[nombre, abierta]`. El nombre se convierte en número con `hash()` de Python (está en C y el texto guarda el resultado, así que no se recalcula; `dict` y `set` siguen sin usarse) y la cubeta se elige con los últimos bits de ese número, porque la cantidad de cubetas es potencia de 2. Cuando hay más nombres que cubetas, las cubetas se duplican y todo se reacomoda.
- **Cómo funciona:** se calcula la cubeta del nombre y se busca solo ahí. Si no aparece, la estación no existe; si aparece, su valor dice si está abierta o cerrada.
- **Otra opción:** buscar con búsqueda binaria en el arreglo ordenado, que es O(log n). La descartamos porque R1 es la consulta que más se usa y la tabla hash la resuelve en tiempo constante.
- **Complejidad:** O(1) en promedio, con *n* = número de estaciones.
- **Al duplicar la red:** ×1,09.

### R2 · Autocompletar
- **Qué usamos:** un arreglo con todos los nombres en orden alfabético. Se ordena una sola vez al cargar con nuestro merge sort, porque las estaciones nunca se crean ni se borran.
- **Cómo funciona:** los nombres que empiezan igual quedan juntos en el arreglo. Una búsqueda binaria encuentra el primero que es ≥ al prefijo y desde ahí se avanza, guardando solo los abiertos, hasta tener `k` o hasta que el nombre ya no empiece por el prefijo.
- **Otra opción:** un trie (árbol de prefijos). Es muy bueno para prefijos, pero no ayuda con R3 y ocupa mucha más memoria; el arreglo ordenado sirve para los dos requisitos.
- **Complejidad:** O(log n + k), con *n* = número de estaciones.
- **Al duplicar la red:** ×1,18.

### R3 · Listar un rango
- **Qué usamos:** el mismo arreglo ordenado de R2.
- **Cómo funciona:** búsqueda binaria del primer nombre ≥ `desde` y se avanza mientras el nombre sea ≤ `hasta`, guardando los abiertos.
- **Otra opción:** recorrer todas las estaciones, filtrar y ordenar el resultado: O(n log n) por consulta.
- **Complejidad:** O(log n + m), con *n* = número de estaciones y *m* = nombres dentro del rango.
- **Al duplicar la red:** ×1,13.

### R4 · Próximo bus
- **Qué usamos:** una tabla hash con clave `"ruta|estacion"` que guarda las horas de esa ruta en esa estación, pasadas a minutos y ordenadas al cargar.
- **Cómo funciona:** búsqueda binaria de la primera hora ≥ la hora pedida. Si la estación está cerrada, la ruta no para ahí o ya no hay más buses, devuelve `None`.
- **Otra opción:** recorrer las horas una por una, O(h). Las troncales pasan cientos de veces al día, así que conviene la búsqueda binaria.
- **Complejidad:** O(log h), con *h* = horas de esa ruta en esa estación. No depende del tamaño de la red.
- **Al duplicar la red:** ×0,97.

### R5 · Planear un viaje
- **Qué usamos:** las rutas como listas doblemente enlazadas; cada estación sabe en qué nodos de qué rutas aparece.
- **Cómo funciona:** primero se recorre hacia atrás cada ruta que llega al destino, anotando en una tabla hash a cuántas paradas queda cada estación del destino y por cuál ruta. Luego se recorre hacia adelante cada ruta que sale del origen: si llega al destino es un viaje directo; si pasa por una estación abierta anotada con otra ruta, es un viaje con transbordo. Se elige el de menos paradas y, si empatan, el directo.
- **Otra opción:** un BFS sobre toda la red. Explora muchas más estaciones de las necesarias y no limita el viaje a un solo transbordo.
- **Complejidad:** O(L), con *L* = suma de las longitudes de las rutas que pasan por el origen y por el destino. El enunciado no lo mide en rendimiento.

### R6 · Ranking
- **Qué usamos:** un montículo máximo con las estaciones abiertas, ordenado por buses al día (y alfabéticamente si empatan). Cada estación recuerda su posición en el montículo.
- **Cómo funciona:** las `k` primeras se sacan sin modificar el montículo, usando uno auxiliar pequeño que empieza en la raíz. Cuando se cierra, reabre o edita algo, solo se mueve la estación afectada.
- **Otra opción:** contar y ordenar todas las estaciones en cada consulta, O(n log n). El ranking se consulta muy seguido y cambia poco, así que conviene tenerlo siempre listo.
- **Complejidad:** consulta O(k log k); cada cambio O(log n), con *n* = estaciones abiertas.
- **Al duplicar la red:** ×1,01.

### R7 · Editar rutas
- **Qué usamos:** una lista doblemente enlazada por ruta y, en cada ruta, una tabla hash estación → nodo.
- **Cómo funciona:** la tabla hash encuentra el nodo sin recorrer la ruta y se cambian sus enlaces para agregar o quitar la parada. El recorrido normal va de la cabeza siguiendo `sig`; el recorrido al revés va de la cola siguiendo `ant`.
- **Otra opción:** guardar cada ruta en un arreglo. Insertar o quitar en la mitad obliga a correr los demás elementos, O(m), y los operadores editan rutas todo el tiempo.
- **Complejidad:** agregar y quitar O(1) en promedio, más O(log n) para actualizar el ranking; recorrido O(m), con *m* = paradas de la ruta.
- **Al duplicar la red:** agregar + quitar ×1,12; recorrido ×1,10.

### R8 · Cerrar y reabrir estaciones
- **Qué usamos:** la tabla hash de R1 (nombre → abierta o cerrada) y el montículo de R6.
- **Cómo funciona:** cerrar cambia el valor de la estación en la tabla hash y la saca del montículo; reabrir hace lo contrario. La estación no se borra de ninguna otra estructura: los demás requisitos preguntan si está abierta (O(1)) antes de usarla. Si la estación no existe o ya estaba en ese estado, devuelve `False` y no cambia nada.

  | Requisito | Con una estación cerrada |
  |---|---|
  | R1 | `estado` dice `"CERRADA"` |
  | R2, R3 | No aparece |
  | R4 | `proximo_bus` devuelve `None` |
  | R5 | No se puede subir, bajar ni transbordar ahí |
  | R6 | No aparece en el ranking |
  | R7 | Sigue en el recorrido, porque el bus pasa por ahí |

- **Otra opción:** borrar la estación de todas las estructuras al cerrarla. Sacarla del arreglo ordenado cuesta O(n) y reabrirla obligaría a reconstruir sus rutas y horarios.
- **Complejidad:** O(log n) por el montículo; la parte de la tabla hash es O(1). *n* = número de estaciones.
- **Al duplicar la red:** ×1,07.

### R9 · Deshacer y rehacer
- **Qué usamos:** dos pilas, una con los cambios hechos y otra con los deshechos.
- **Cómo funciona:** cada cierre, reapertura o edición que sí cambió algo entra en la pila de hechos y vacía la de deshechos. Deshacer saca el último cambio, aplica la operación contraria y lo pasa a la otra pila; rehacer hace lo inverso. Al quitar una parada se guarda cuál era la anterior para poder ponerla de nuevo en su lugar.
- **Otra opción:** guardar una copia completa de la red en cada cambio. Deshacer sería fácil, pero cada cambio costaría O(n) en tiempo y memoria.
- **Complejidad:** O(1) por la pila más el costo de la operación contraria (O(log n) por el ranking).
- **Al duplicar la red:** ×1,05.

### R10 · Fila de abordaje
- **Qué usamos:** nuestro merge sort y una cola FIFO sobre un arreglo con un índice al frente (encolar y desencolar en O(1)).
- **Cómo funciona:** se ordenan los pasajeros por segundo de llegada (y por su posición en la lista si llegan al mismo tiempo). Luego, bus por bus, entran a la cola los que ya llegaron y suben hasta llenar el cupo. Si la cola está vacía, se salta directo al bus que sirve al siguiente pasajero, sin simular buses vacíos.
- **Otra opción:** usar `list.pop(0)` como cola. Cada salida corre toda la lista, así que con cientos de miles de pasajeros el total sería O(P²).
- **Complejidad:** O(P log P), con *P* = pasajeros (por ordenar); la simulación en sí es O(P).
- **Al duplicar los pasajeros:** ×2,43.

## Rendimiento (R11)

El panel (`py front/panel_rendimiento.py`) genera redes de prueba de tamaño creciente con el mismo formato de los CSV, corre cada operación del motor, grafica el tiempo junto a la curva que esperábamos y explica cualquier diferencia ahí mismo.

Medimos también con los tamaños que usa el profesor: redes de 10.000, 20.000, 40.000 y 80.000 estaciones. El valor es el promedio de cuánto se multiplica el tiempo cada vez que la red se duplica (≈ 1: no depende del tamaño; ≈ 2: lineal).

| Operación | Esperado | Al duplicar |
|---|---|---|
| Cargar la red | O(n log n) | ×2,15 |
| R1 `estado` | O(1) | ×1,09 |
| R2 `autocompletar` (k = 5) | O(log n + k) | ×1,18 |
| R3 `rango` (~10 resultados) | O(log n + m) | ×1,13 |
| R4 `proximo_bus` | O(log h) | ×0,97 |
| R6 `ranking` (k = 10) | O(k log k) | ×1,01 |
| R7 `agregar_parada` + `quitar_parada` | O(log n) | ×1,12 |
| R7 `recorrido` | O(m) | ×1,10 |
| R8 `cerrar` + `reabrir` | O(log n) | ×1,07 |
| R9 `deshacer` + `rehacer` | O(log n) | ×1,05 |
| R10 `simular_fila` | O(P log P) | ×2,43 |

R5 no aparece porque el enunciado no lo mide.

## Manejo de los datos

- Usamos los tres CSV de TransMilenio entregados para el proyecto (`datos/`).
- El motor no supone que los archivos vengan ordenados: ordena las paradas de cada ruta por la columna `orden` y las horas por minutos.
- Si `rutas.csv` nombra una estación que no está en `estaciones.csv`, o repite una estación dentro de la misma ruta, esa fila se ignora.
- Las horas mayores a 24 (como `25:10`) se interpretan como parte del mismo día de servicio, después de las `23:59`. Los CSV actuales no traen ninguna.
- Cada fila de `horarios.csv` cuenta como un bus para el ranking de R6.
