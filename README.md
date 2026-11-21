# Planeador de viajes TransMilenio

Proyecto final (último corte) de **Estructuras de Datos y Algoritmos**. Grupo de 4 personas.
Un planeador de viajes que usa la red real de TransMilenio: buscar estaciones, planear viajes, saber a qué hora pasa el siguiente bus y operar la red (cerrar estaciones, editar rutas, deshacer).

> **Si eres Claude (u otra IA) leyendo esto:** este archivo es el contexto completo del proyecto. Lee primero la sección [Instrucciones para la IA](#instrucciones-para-la-ia) y respétala en todo el trabajo.

---

## Tabla de contenido

1. [Instrucciones para la IA](#instrucciones-para-la-ia)
2. [Visión general](#visión-general)
3. [La regla central del proyecto](#la-regla-central-del-proyecto)
4. [Arquitectura](#arquitectura)
5. [Datos (CSV)](#datos-csv)
6. [Reglas del motor: qué se puede y qué no](#reglas-del-motor-qué-se-puede-y-qué-no)
7. [Contrato del motor (API fija)](#contrato-del-motor-api-fija)
8. [Requisitos R1 a R12](#requisitos-r1-a-r12)
9. [Rendimiento: cómo se mide](#rendimiento-cómo-se-mide)
10. [Día de la entrega](#día-de-la-entrega)
11. [Rúbrica](#rúbrica)
12. [Entregables y estructura del repositorio](#entregables-y-estructura-del-repositorio)
13. [Cómo arrancar la app](#cómo-arrancar-la-app)
14. [Decisiones de diseño (R12)](#decisiones-de-diseño-r12)
15. [Estado del proyecto](#estado-del-proyecto)
16. [Integrantes](#integrantes)

---

## Instrucciones para la IA

Usar IA es **permitido y esperado** en este proyecto, incluido el día del cambio sorpresa. Pero lo que se evalúa es que **cada decisión sea de los estudiantes y que la entiendan**: en la sustentación individual defienden el código aunque lo haya propuesto la IA. Por eso:

1. **No impongas la estructura de datos ni el algoritmo.** El enunciado dice *qué* hacer, nunca *cómo*. Cuando un requisito pida una decisión, presenta 2 o 3 opciones con sus ventajas, desventajas y O grande (diciendo qué es `n`), y deja que el grupo elija. Documenta la elección en [Decisiones de diseño](#decisiones-de-diseño-r12).
2. **Explica lo que escribes.** Acompaña el código con una explicación breve de por qué funciona y cuál es su complejidad, para que el estudiante pueda defenderlo oralmente y modificarlo en vivo.
3. **Respeta estrictamente las [reglas del motor](#reglas-del-motor-qué-se-puede-y-qué-no).** Dentro de `motor/` está prohibido usar `sorted`, `.sort()`, `min`, `max` sobre colecciones, `x in lista`, `.index()`, `.count()`, y los módulos `bisect`, `heapq`, `collections`, `functools` o cualquier librería externa. Si algo prohibido aparece en un requisito, ese requisito pierde los puntos de resultados y de rendimiento aunque pase las pruebas. Antes de entregar código del motor, **revísalo contra esta lista**.
4. **Respeta el contrato.** Los nombres y firmas de la [API del motor](#contrato-del-motor-api-fija) son fijos. Un nombre o firma distinta cuenta como requisito no hecho.
5. **Nada amarrado a los datos del grupo.** Las pruebas del profesor usan **otra red**, mucho más grande, con el mismo formato de CSV. No hardcodees nombres de estaciones, rutas ni tamaños.
6. **Cuida los bordes**: estación inexistente, estación cerrada, ruta inexistente, prefijo vacío o sin coincidencias, `k` mayor que lo disponible, origen igual a destino, deshacer sin historial, rehacer después de un cambio nuevo, etc.
7. **Piensa en complejidad siempre.** Cada operación (salvo R5) debe crecer como la mejor opción vista en el curso. Evita recorridos lineales donde el volumen/frecuencia sugiere algo mejor, y evita trabajo repetido en consultas frecuentes.
8. **El motor es independiente del front.** Toda regla del sistema vive en `motor/`; una regla escrita en el front no cuenta. El front solo llama al motor.
9. **Mantén este README al día**: cuando el grupo tome una decisión o cambie algo importante, actualiza [Decisiones de diseño](#decisiones-de-diseño-r12) y [Estado del proyecto](#estado-del-proyecto).
10. Responde en **español**, con el mismo tono claro y didáctico del curso.

---

## Visión general

El proyecto tiene **tres piezas**:

| Pieza | Descripción | Dónde está la nota |
|---|---|---|
| **La app** | Web o de escritorio, la eligen los estudiantes. Solo llama al motor. | Poco peso |
| **El motor** | Paquete Python escrito por los estudiantes. Aquí vive toda la lógica. | Casi toda la nota |
| **Los datos** | La red real de TransMilenio convertida a tres CSV. | Conversión: parte de la entrega |

Flujo de datos:

```
GTFS de TransMilenio (julio 2021, zip ~54 MB)
        │
        ▼
Script de conversión (cualquier librería, pandas permitido, parte de la entrega)
        │
        ▼
estaciones.csv · rutas.csv · horarios.csv
        │
        ▼
Motor (paquete motor/, Python, solo stdlib limitada)
        │
        ▼
App (web o escritorio, cualquier librería)
```

---

## La regla central del proyecto

> **El profesor dice qué tiene que hacer el sistema. Nunca cómo.**

Qué estructura de datos y qué algoritmo usar en cada requisito lo deciden los estudiantes, y **esa decisión es lo que más pesa en la nota**. Los requisitos traen pistas de volumen y frecuencia ("la consulta que más se usa", "cientos de miles de pasajeros", "cambia poco", "todo el tiempo"), pero ninguno nombra una estructura. Si algo funciona pero no saben defender por qué lo hicieron así, no está aprendido.

---

## Arquitectura

```
motor/          ← toda la lógica de R1 a R10 (reglas estrictas, ver abajo)
front/          ← la app (web o escritorio), solo llama al motor
conversion/     ← script GTFS → CSV
datos/          ← los tres CSV ya generados
```

(La organización interna de `motor/` es libre: los archivos que quieran.)

---

## Datos (CSV)

El motor **solo lee estos tres archivos** y recibe la carpeta que los contiene en `Red(carpeta)`.

### `estaciones.csv`

```
nombre
```

- Nombres en **MAYÚSCULAS, sin tildes y sin repetidos**.

### `rutas.csv`

```
ruta, orden, estacion
```

- Cada fila dice que la `estacion` ocupa la posición `orden` dentro de la `ruta`.
- **Cada ruta va en un solo sentido.** El recorrido "al revés" (`al_reves=True`) se obtiene recorriendo la misma ruta en sentido contrario.

### `horarios.csv`

```
ruta, estacion, hora
```

- Horas en formato `HH:MM`.
- El GTFS trae horas como `25:10` (pasada la medianoche del mismo día de servicio). **El grupo decide cómo manejarlo y lo explica en este README** (ver [Decisiones de diseño](#decisiones-de-diseño-r12)).

### Fuente

GTFS real de TransMilenio, julio de 2021: un zip de ~54 MB con paradas, rutas, viajes y horarios. La conversión es trabajo de datos (no del curso): se puede usar IA y pandas.

> ⚠️ Las pruebas del profesor usan **otra red con el mismo formato, mucho más grande**.

---

## Reglas del motor: qué se puede y qué no

Todo lo que resuelve un requisito vive en el paquete `motor/`. **Fuera del motor** (front y conversión) se puede usar **cualquier librería**.

### ✅ Permitido dentro de `motor/`

- `list` **como arreglo**
- `str` y sus métodos
- Recorrer con `for x in lista`
- Los módulos `csv`, `time` y `random`

### ❌ Prohibido dentro de `motor/`

- `dict` y `set` (y por lo tanto `csv.DictReader`)
- `sorted`, `.sort()`, `min` y `max` sobre colecciones
- `x in lista`, `.index()` y `.count()` para **buscar dentro de una lista**
- Los módulos `bisect`, `heapq`, `collections`, `functools`
- Cualquier librería externa

**Idea detrás de las prohibiciones:** que los estudiantes **implementen las estructuras ellos mismos**. Si un requisito usa algo prohibido, **no recibe puntos de resultados ni de rendimiento**, aunque pase las pruebas.

### Checklist antes de entregar código en `motor/`

- [ ] Sin `sorted`, `.sort()`, `min`, `max` sobre colecciones
- [ ] Sin `x in lista`, `.index()`, `.count()` sobre listas
- [ ] Sin imports de `bisect`, `heapq`, `collections`, `functools` ni librerías externas
- [ ] Solo `csv`, `time`, `random` como módulos importados
- [ ] Nada depende del tamaño o contenido de la red del grupo

---

## Contrato del motor (API fija)

El script de calificación hace `from motor import Red, simular_fila` y llama **exactamente** lo siguiente. Un nombre o firma distinta cuenta como requisito no hecho.

| Requisito | Llamada |
|---|---|
| Carga | `Red(carpeta)` |
| R1 | `red.estado(nombre)` |
| R2 | `red.autocompletar(prefijo, k)` |
| R3 | `red.rango(desde, hasta)` |
| R4 | `red.proximo_bus(estacion, ruta, hora)` |
| R5 | `red.viaje(origen, destino)` |
| R6 | `red.ranking(k)` |
| R7 | `red.agregar_parada(ruta, nueva, despues_de)` |
| R7 | `red.quitar_parada(ruta, estacion)` |
| R7 | `red.recorrido(ruta, al_reves=False)` |
| R8 | `red.cerrar(nombre)` · `red.reabrir(nombre)` |
| R9 | `red.deshacer()` · `red.rehacer()` |
| R10 | `simular_fila(llegadas, frecuencia, capacidad)` |

**Notas importantes:**

- `simular_fila` es una **función suelta**, fuera de la clase `Red`.
- Lo que devuelve cada llamada y sus reglas exactas está en **el enunciado completo** del profesor (PDF/documento aparte). La presentación solo muestra las firmas.

> ### Qué devuelve cada método (enunciado oficial)

| Método | Req. | Devuelve |
|---|---|---|
| `Red(carpeta)` | carga | La red cargada desde los tres CSV, todas las estaciones abiertas. Solo se mide cuánto tarda. |
| `red.estado(nombre)` | R1 | `"ABIERTA"`, `"CERRADA"` o `"NO EXISTE"` |
| `red.autocompletar(prefijo, k)` | R2 | Lista de hasta k estaciones abiertas que empiezan por el prefijo, en orden alfabético (`[]` si no hay) |
| `red.rango(desde, hasta)` | R3 | Lista de estaciones abiertas entre los dos nombres (inclusive), en orden alfabético |
| `red.proximo_bus(estacion, ruta, hora)` | R4 | La hora `HH:MM` del siguiente bus de esa ruta en esa estación, o `None` si no hay más ese día |
| `red.viaje(origen, destino)` | R5 | Lista de tramos `(ruta, sube_en, baja_en)`: 1 tramo si es directo, 2 si hay transbordo; el viaje que recorra menos paradas. `None` si no hay viaje |
| `red.ranking(k)` | R6 | Lista de `(nombre, buses_por_dia)` de las k estaciones abiertas con más buses, de mayor a menor |
| `red.agregar_parada(ruta, nueva, despues_de)` | R7 | `True` si la agregó justo después de `despues_de`, `False` si no se pudo |
| `red.quitar_parada(ruta, estacion)` | R7 | `True` si la quitó, `False` si no estaba |
| `red.recorrido(ruta, al_reves=False)` | R7 | Lista de nombres en orden (`[]` si la ruta no existe) |
| `red.cerrar(nombre)` / `red.reabrir(nombre)` | R8 | `True` si cambió el estado, `False` si no existe o ya estaba así |
| `red.deshacer()` / `red.rehacer()` | R9 | `True` si deshizo o rehizo algo, `False` si no había nada |
| `simular_fila(llegadas, frecuencia, capacidad)` | R10 | Recibe segundos de llegada, segundos entre buses y cupo por bus. Devuelve, en el mismo orden de `llegadas`, el segundo en que salió el bus de cada persona. Los buses salen en `frecuencia`, `2*frecuencia`, … y la gente sube en orden de llegada |

- El motor devuelve listas, tuplas, textos, números o booleanos; **nunca diccionarios ni conjuntos**.
- Ejemplo de R10: `simular_fila([30, 5, 5, 70], 60, 2)` → `[120, 60, 60, 120]`.
- El profesor mide el rendimiento en redes de **10.000, 20.000, 40.000 y 80.000 estaciones** (todas las operaciones menos R5).

---

## Requisitos R1 a R12

### Consultar estaciones

**R1 · Buscar una estación** — `red.estado(nombre)`
El usuario escribe un nombre **exacto** y el sistema dice si la estación **existe** y si está **abierta**. Es **la consulta que más se usa** en la app.

**R2 · Autocompletar** — `red.autocompletar(prefijo, k)`
Mientras el usuario escribe (ej. «CAL»), mostrar **hasta `k`** estaciones **abiertas** que **empiezan por ese texto**, en **orden alfabético**.

**R3 · Listar un rango** — `red.rango(desde, hasta)`
Todas las estaciones **abiertas** entre dos nombres, en **orden alfabético**. Ej.: de «CALLE 26» a «CALLE 80».

### Viajar

**R4 · Próximo bus** — `red.proximo_bus(estacion, ruta, hora)`
Dada una estación, una ruta y una hora, decir **a qué hora pasa el siguiente bus de esa ruta**. Las troncales pasan **cientos de veces al día**.

**R5 · Planear un viaje** — `red.viaje(origen, destino)`
Entre dos estaciones: el viaje **directo o con un solo transbordo** que pase por **menos paradas**. Debe decir **qué ruta tomar, dónde bajarse y dónde cambiar**.
Es el requisito más difícil: no hay un algoritmo del curso que lo resuelva tal cual; hay que **combinar** lo aprendido. **R5 no se mide en rendimiento.**

**R6 · Ranking** — `red.ranking(k)`
Las `k` estaciones **abiertas** por donde pasan **más buses al día**. Se consulta **muy seguido** y **cambia poco**: solo cuando se cierra, se reabre o se edita algo.

### Operar la red

**R7 · Editar rutas** — `red.agregar_parada(...)`, `red.quitar_parada(...)`, `red.recorrido(...)`
Los operadores **agregan una parada entre dos existentes** o **quitan una**, **todo el tiempo**. También ven el **recorrido de una ruta en los dos sentidos**.

**R8 · Cerrar y reabrir estaciones** — `red.cerrar(nombre)`, `red.reabrir(nombre)`
Una estación cerrada **no aparece** en búsquedas, autocompletado, rangos ni ranking, y **nadie sube, baja ni transborda ahí**. R8 toca todo lo anterior (R1 a R6).

**R9 · Deshacer y rehacer** — `red.deshacer()`, `red.rehacer()`
Cualquier **cierre, reapertura o edición de ruta** se deshace y se rehace **en el orden correcto**. Un cambio nuevo **borra lo que había para rehacer**.

**R10 · Fila de abordaje** — `simular_fila(llegadas, frecuencia, capacidad)`
Simular hora pico: los buses salen cada cierto tiempo con **cupo limitado** y la gente sube **en orden de llegada**. Son **cientos de miles de pasajeros**.

### Demostrar que lo entienden

**R11 · Panel de rendimiento**
Una vista de la app que **corre cada operación con redes de tamaño creciente** y **grafica cómo crece el tiempo**, junto a la complejidad que el grupo esperaba. Si la medición no coincide con lo esperado, **la explicación va ahí mismo**.

**R12 · README de decisiones**
Para **cada requisito de R1 a R10**: qué estructura y qué algoritmo usaron, qué otra opción consideraron y por qué la descartaron, y la **O grande de cada operación, diciendo qué es `n`**. Es la evidencia de que cada decisión fue del grupo. → Ver [Decisiones de diseño](#decisiones-de-diseño-r12).

---

## Rendimiento: cómo se mide

El script de calificación **duplica el tamaño de la red y mide**:

1. Corre cada operación sobre una red de tamaño `n` y mide.
2. Corre lo mismo sobre una red de tamaño `2n` y vuelve a medir.
3. Compara: ¿creció como debía?
4. Si no, el requisito pierde los puntos de rendimiento.

Es el mismo método del **Taller 1**: duplicar `n` y mirar qué pasa (si al duplicar se duplica → lineal; si se multiplica por 4 → cuadrático; etc.).

- **Cada operación, menos R5**, tiene que crecer como **la mejor opción vista en el curso** para ese problema. Cuál es esa opción lo decide el grupo.
- **R5 no se mide** porque no hay una opción del curso con la cual compararlo.

---

## Día de la entrega

Una sola sesión, en clase:

| Parte | Duración | Qué pasa |
|---|---|---|
| **Cambio sorpresa** | 45 min | Todos los grupos a la vez. Cada grupo recibe **un requisito nuevo** (no se anuncia antes) y lo agrega a su motor con las mismas herramientas del proyecto, **IA incluida**. El script lo verifica al terminar. |
| **Sustentación individual** | 10 min por persona | Cada uno responde sobre **un requisito que no hizo** (según `integrantes.md`) y hace **un cambio en vivo** sobre el código. La nota es individual. |

Un motor que entienden recibe el requisito nuevo en minutos; uno que no entienden, no alcanza. Por eso el código debe ser **modular, legible y entendido por todos**.

---

## Rúbrica

**100 puntos: 75 del grupo, 25 individuales.**

| Criterio | Cómo se mide | Puntos |
|---|---|---|
| Resultados del motor | R1 a R10 correctos con una red que no conocen, bordes incluidos | 20 |
| Rendimiento | Al duplicar la red, cada operación menos R5 crece como debe | 10 |
| Decisiones y panel | R11 y R12: decisiones justificadas y mediciones coherentes | 20 |
| Cambio sorpresa | Lo verifica el script al terminar los 45 minutos | 15 |
| App y datos | Arranca con un comando y la conversión del GTFS funciona | 5 |
| Historial de Git | Commits de todos a lo largo del proyecto | 5 |
| Sustentación | Individual, sobre un requisito que no hizo | 25 |

Un requisito que pasa las pruebas usando algo prohibido dentro de `motor/` **no recibe puntos de resultados ni de rendimiento**.

---

## Entregables y estructura del repositorio

Se entrega **un solo link: el repositorio del grupo** (GitHub o GitLab, con acceso para el profesor).

| Entregable | Contenido |
|---|---|
| `motor/` | El paquete con el contrato completo |
| El front | Web o de escritorio, el que hayan elegido |
| La conversión | El script GTFS → tres CSV, **y** los CSV ya generados |
| `README.md` | Las decisiones (R12) y el **comando único** para arrancar la app |
| `integrantes.md` | Nombres y **qué requisitos hizo cada uno** (de ahí sale sobre cuál sustenta cada persona) |

**Git desde la primera semana.** El historial cuenta: tienen que verse **commits de todos los integrantes a lo largo del proyecto**, no un solo commit al final.

**Grupos:** 3 o 4 personas. No se aceptan grupos de 2 ni de 5.

Estructura sugerida (ajustable):

```
.
├── README.md
├── integrantes.md
├── motor/
│   ├── __init__.py          # exporta Red y simular_fila
│   └── ...                  # archivos libres
├── front/
│   └── ...
├── conversion/
│   └── convertir_gtfs.py
└── datos/
    ├── estaciones.csv
    ├── rutas.csv
    └── horarios.csv
```

---

## Cómo arrancar la app

**Requisitos:** Python 3.10 o superior. **No hay que instalar nada**: el motor, la app web y el panel solo usan la librería estándar de Python.

Desde la **raíz del repositorio**:

```bash
python front/app.py
```

Arranca la app web y abre el navegador en **http://localhost:8000**. En Windows también funciona `py front/app.py`. Para detenerla: `Ctrl + C` en la terminal.

Opciones:

```bash
python front/app.py otra/carpeta/con/csv    # usar otra red (misma estructura de los tres CSV)
```

- Por defecto lee la red de `datos/` (`estaciones.csv`, `rutas.csv`, `horarios.csv`).
- Para usar otro puerto, definir la variable de entorno `PUERTO` antes de arrancar (por ejemplo `PUERTO=8080` en Git Bash).

Otros comandos (también desde la raíz):

```bash
python front/panel_rendimiento.py      # R11: panel de rendimiento (ventana de escritorio)
python -m unittest discover tests      # pruebas automáticas de R7, R9, R10 y R11
```

---

## Decisiones de diseño (R12)

> Esta sección es **parte de la nota (R12)**. Para cada requisito: estructura y algoritmo elegidos, alternativa considerada y por qué se descartó, y la O grande de cada operación **diciendo qué es `n`**.

### Plantilla por requisito

```
### R# · Nombre
- **Estructura elegida:**
- **Algoritmo elegido:**
- **Alternativa considerada y por qué se descartó:**
- **Complejidad (O grande) y qué es n:**
    - operación 1: O(...), n = ...
    - operación 2: O(...), n = ...
- **Por qué esta decisión encaja con las pistas del enunciado (volumen/frecuencia):**
- **Bordes manejados:**
```

### Estado de decisiones

| Req. | Estructura | Algoritmo | Responsable | Estado |
|---|---|---|---|---|
| R1 | Tabla hash propia con encadenamiento (nombre → abierta/cerrada) | Hash del nombre y búsqueda en su cubeta | Marco Vargas | ✅ |
| R2 | Arreglo de nombres ordenado alfabéticamente | Búsqueda binaria del primer nombre ≥ prefijo y avance mientras empiece por él | Marco Vargas | ✅ |
| R3 | Arreglo de nombres ordenado alfabéticamente (el mismo de R2) | Búsqueda binaria de `desde` y avance hasta pasar `hasta` | Marco Vargas | ✅ |
| R4 | Tabla hash `ruta\|estacion` → arreglo de horas ordenado | Búsqueda binaria | | ✅ |
| R5 | Rutas como listas doblemente enlazadas + tabla hash | Dos barridos (atrás desde destino, adelante desde origen) | | ✅ |
| R6 | Montículo máximo indexado | top-k con montículo auxiliar | | ✅ |
| R7 | Lista doblemente enlazada por ruta + tabla hash estación → nodo | Enlazar/desenlazar el nodo encontrado con la tabla hash | Mariana Mayorga | ✅ |
| R8 | La tabla hash de R1 (nombre → abierta/cerrada) + el montículo de R6 | Cambiar el valor en la tabla hash; cada consulta revisa si la estación está abierta | Marco Vargas | ✅ |
| R9 | Dos pilas (listas como arreglo) | Apilar el cambio; deshacer = aplicar la operación inversa | Sebastian Pereira | ✅ |
| R10 | Cola FIFO sobre arreglo con índice al frente | Merge sort de llegadas + simulación bus a bus saltando buses vacíos | Sebastian Pereira | ✅ |

### Decisiones transversales

- **Horas mayores a 24:00 del GTFS (ej. `25:10`):** el motor convierte cada hora a minutos (`25:10` → 1510), así que una hora como `25:10` queda después de `23:59`, en el mismo día de servicio, y se devuelve tal como viene en el CSV. Los CSV actuales de `datos/` no traen horas ≥ 24. _(Grupo: confirmar qué hace el script de conversión.)_
- **Interacción entre R8/R9 y el resto** (cerrar estación afecta R1–R6; todo se puede deshacer): cerrar una estación **no la borra** de ninguna estructura; solo cambia su valor en la tabla hash de R1, y cada requisito pregunta "¿está abierta?" en O(1) antes de usarla. La única estructura que sí se actualiza es el montículo del ranking (R6). Detalle en [R8](#r8--cerrar-y-reabrir-estaciones--redcerrarnombre-redreabrirnombre).

### Decisiones por requisito

_(Completar con la plantilla de arriba a medida que el grupo decida.)_
### Estructura que comparten R1, R2 y R3

Las estaciones **nunca se crean ni se borran** después de cargar la red: solo se cierran y se reabren (R8). Por eso se guardan en dos estructuras que se arman una sola vez al cargar:

1. Una **tabla hash** (`Red._estaciones`): nombre → `True` (abierta) / `False` (cerrada). Responde "¿existe y está abierta?" sin recorrer nada.
2. Un **arreglo con todos los nombres ordenados alfabéticamente** (`Red._nombres_ordenados`), ordenado una vez con el `merge_sort` del grupo: **O(n log n)** al cargar, *n* = número de estaciones. Guarda abiertas y cerradas; cerrar o reabrir no lo cambia, solo cambia el valor en la tabla hash.

### R1 · Buscar una estación — `red.estado(nombre)`

- **Estructura:** tabla hash propia (`motor/tabla_hash.py`) con **encadenamiento**: un arreglo de cubetas, y cada cubeta es una lista de pares `[nombre, valor]`. El nombre se convierte en número con `h = h * 31 + código de la letra` y se usa el residuo entre el número de cubetas. Cuando hay más nombres que cubetas, se duplican las cubetas y se recoloca todo (rehash), así cada cubeta queda con muy pocos elementos.
- **Algoritmo:** calcular la cubeta del nombre y buscarlo solo dentro de ella. Si no está → `"NO EXISTE"`; si está, `"ABIERTA"` o `"CERRADA"` según su valor.
- **O grande:** **O(1) promedio**, *n* = número de estaciones (no depende de *n*). Peor caso O(n), si todos los nombres cayeran en la misma cubeta. Crear la tabla al cargar: O(n).
- **Alternativas descartadas:**
  - **Recorrer la lista de estaciones:** O(n) por consulta.
  - **Búsqueda binaria en el arreglo ordenado:** O(log n). Funciona, pero R1 es la consulta **más usada** de la app, y la tabla hash la deja en O(1).
  - **Árbol binario de búsqueda (AVL):** O(log n) y más complejo; su ventaja (el orden) aquí no se necesita, porque el orden ya lo da el arreglo de R2/R3.
- **Por qué encaja con el enunciado:** "es la consulta que más se usa" → la operación más rápida posible.
- **Bordes:** nombre inexistente → `"NO EXISTE"`; estación cerrada → `"CERRADA"`.

### R2 · Autocompletar — `red.autocompletar(prefijo, k)`

- **Estructura:** el arreglo de nombres ordenado alfabéticamente.
- **Algoritmo:** en un arreglo ordenado, todos los nombres que empiezan por el mismo prefijo quedan **seguidos**. Entonces:
  1. Búsqueda binaria (`primera_posicion` en `motor/ordenamiento.py`) del primer nombre ≥ `prefijo`.
  2. Desde ahí se avanza mientras el nombre empiece por el prefijo, guardando solo los abiertos (consultando la tabla hash de R1), hasta tener `k`.
- **O grande:** **O(log n + c)**, *n* = número de estaciones, *c* = nombres revisados después de la búsqueda (como máximo *k* abiertos más los cerrados que se salten en ese tramo). No recorre toda la lista.
- **Alternativas descartadas:**
  - **Recorrer todas las estaciones y luego ordenar:** O(n log n) en cada tecla que escribe el usuario.
  - **Trie (árbol de prefijos):** encontrar el prefijo es O(largo del prefijo), pero ocupa mucha más memoria y es más difícil de programar. Como las estaciones no cambian, el arreglo ordenado con búsqueda binaria da casi lo mismo.
  - **Árbol AVL:** también O(log n + k), pero solo convendría si se agregaran o borraran estaciones, y eso no pasa.
- **Por qué encaja con el enunciado:** pide "en orden alfabético" → el arreglo ya está en ese orden, no hay que ordenar en cada consulta.
- **Bordes:** `k ≤ 0` → `[]`; prefijo sin coincidencias → `[]`; `k` mayor que las que hay → devuelve las que hay; las cerradas no aparecen.

### R3 · Listar un rango — `red.rango(desde, hasta)`

- **Estructura:** el mismo arreglo ordenado de R2.
- **Algoritmo:** búsqueda binaria del primer nombre ≥ `desde`, y se avanza mientras el nombre sea ≤ `hasta`, guardando solo los abiertos.
- **O grande:** **O(log n + m)**, *n* = número de estaciones, *m* = nombres dentro del rango (hay que devolverlos todos, así que no se puede menos).
- **Alternativas descartadas:**
  - **Recorrer todas las estaciones:** O(n) aunque el rango sea pequeño, y además habría que ordenar el resultado.
  - **Árbol AVL con recorrido en orden:** también O(log n + m), pero más complejo y sin ventaja, porque las estaciones no cambian.
- **Por qué encaja con el enunciado:** pide el rango "en orden alfabético", y en el arreglo ordenado el rango es un tramo seguido.
- **Bordes:** `desde` y `hasta` no tienen que existir como estaciones; si `desde > hasta` → `[]`; incluye a `desde` y `hasta` si existen y están abiertas; las cerradas no aparecen.

### R4 · Próximo bus — `red.proximo_bus(estacion, ruta, hora)`

- **Estructura:** la `TablaHash` del grupo (encadenamiento) con clave `"ruta|estacion"` → arreglo de horas en minutos, **ordenado una sola vez al cargar** con el `merge_sort` del grupo.
- **Algoritmo:** búsqueda binaria del primer horario `>= hora`. Un bus que pasa exactamente a la hora pedida cuenta como siguiente.
- **O grande:** O(1) promedio (hash) + **O(log h)**, donde *h* = número de horarios de esa ruta en esa estación. No depende de *n* (estaciones). Carga: O(H log H), H = filas de horarios.csv.
- **Descartado:** recorrer todos los horarios (O(h) por consulta) y un BST (también O(log h), pero las horas no cambian nunca, así que un arreglo ordenado es más simple y más rápido).
- **Bordes:** estación inexistente o cerrada, ruta inexistente, estación que ya no está en la ruta o sin más buses ese día → `None`.

### R5 · Viaje — `red.viaje(origen, destino)`

- **Estructura:** cada ruta es una lista doblemente enlazada; cada estación guarda los nodos de las rutas por donde pasa.
- **Algoritmo (dos barridos):**
  1. Desde cada aparición de `destino` se camina **hacia atrás** por su ruta y se guarda en una tabla hash, por estación, la menor distancia hasta `destino` y por cuál ruta.
  2. Desde cada aparición de `origen` se camina **hacia adelante**: si se llega a `destino` es viaje directo; si la estación está abierta y aparece en la tabla con **otra** ruta, es un transbordo con `d1 + d2` paradas.
  Se queda el de menos paradas; si empatan, gana el directo.
- **O grande:** **O(L)** promedio, donde *L* = suma de longitudes de las rutas que pasan por origen y destino. No recorre toda la red.
- **Descartado:** BFS sobre todo el grafo de estaciones (cuenta paradas, pero no limita a un solo transbordo y recorre mucho más) y probar todos los pares de rutas (O(R²)).
- **Decisiones:** las estaciones cerradas no sirven para subir, bajar ni transbordar, pero el bus sigue pasando por ellas y cuentan como paradas recorridas. `origen == destino`, estación inexistente o cerrada, o sin viaje → `None`.

### R6 · Ranking — `red.ranking(k)`

- **Estructura:** **montículo máximo indexado** con las estaciones abiertas; cada estación guarda su posición en el arreglo del montículo.
  Buses por día de una estación = filas de horarios.csv de las rutas que hoy pasan por ella.
- **Consulta:** se sacan las k mejores **sin modificar** el montículo, con un montículo auxiliar de índices (arranca en la raíz y, al sacar un nodo, mete sus dos hijos) → **O(k log k)**, independiente de *n*.
- **Actualizaciones:** `cerrar` saca la estación del montículo, `reabrir` la inserta, y `quitar_parada`/`agregar_parada` cambian sus buses y la reubican: **O(log n)** cada una, *n* = estaciones abiertas.
- **Desempate:** más buses primero; si empatan, orden alfabético.
- **Descartado:** recorrer todo y ordenar en cada consulta (O(n log n)); un arreglo ordenado mantenido (consulta O(k) pero cerrar/reabrir O(n) por los corrimientos, y `cerrar` también se mide).

### Interacción de R4–R6 con R7 y R8
- `cerrar` saca la estación del montículo y `reabrir` la vuelve a meter (O(log n)).
- `quitar_parada` resta a la estación los buses de esa ruta; `agregar_parada` se los devuelve si esa ruta tenía horarios ahí (una parada nueva sin horarios suma 0).
- `deshacer`/`rehacer` (R9) usan los mismos métodos internos que `cerrar`, `reabrir`, `agregar_parada` y `quitar_parada`, así que el ranking sigue al día.

### R7 · Editar rutas — `red.agregar_parada(ruta, nueva, despues_de)`, `red.quitar_parada(ruta, estacion)`, `red.recorrido(ruta, al_reves=False)`

- **Estructura:** cada ruta es una **lista doblemente enlazada** (`Ruta` en `motor/estructuras_viaje.py`) con `cabeza` y `cola`; cada nodo (`NodoRuta`) apunta a la parada anterior (`ant`) y a la siguiente (`sig`). Cada ruta tiene además una **tabla hash** `nodo_de` (estación → nodo) para encontrar cualquier parada sin recorrer la ruta. Las rutas se buscan por nombre en otra tabla hash (`Red._rutas`).
- **Algoritmo:**
  - `agregar_parada`: se busca en `nodo_de` el nodo de `despues_de` y se enlaza el nodo nuevo entre él y su siguiente (cuatro enlaces). Si era la última, el nuevo pasa a ser la `cola`.
  - `quitar_parada`: se busca el nodo en `nodo_de` y se une su anterior con su siguiente. Si era la `cabeza` o la `cola`, se actualizan.
  - `recorrido`: desde la `cabeza` siguiendo `sig`; con `al_reves=True`, desde la `cola` siguiendo `ant`.
- **O grande:**
  - `agregar_parada`: **O(1)** promedio (tabla hash + enlaces) + O(log n) para reubicar la estación en el montículo del ranking (R6), *n* = estaciones abiertas.
  - `quitar_parada`: **O(1)** promedio + O(r) para sacar el nodo de la lista de nodos de la estación (*r* = rutas que pasan por esa estación, lo usa R5) + O(log n) del ranking.
  - `recorrido`: **O(m)**, *m* = paradas de la ruta (hay que devolverlas todas).
  - Carga: O(F log F), *F* = filas de `rutas.csv` (se ordena cada ruta por `orden` con el `merge_sort` del grupo).
- **Alternativas descartadas:**
  - **Arreglo (`list`) por ruta:** insertar o quitar en la mitad obliga a correr todos los elementos de la derecha, y encontrar la estación es una búsqueda lineal: O(m) por operación.
  - **Lista simplemente enlazada:** no permite recorrer al revés directamente y, para quitar un nodo, hay que recorrer desde la cabeza buscando su anterior: O(m).
  - **Lista doble sin tabla hash:** enlazar es O(1), pero encontrar `despues_de` sería recorrer la ruta: O(m).
- **Por qué encaja con el enunciado:** los operadores editan "todo el tiempo" → cada edición debe ser barata (O(1)); "ven el recorrido en los dos sentidos" → el enlace `ant` permite la vuelta sin copiar ni invertir la lista.
- **Bordes:** ruta inexistente, `despues_de` que no está en la ruta, estación nueva que ya está en la ruta (no se repite) o que no existe en `estaciones.csv`, y `despues_de = None` → `False` sin cambiar nada (insertar al inicio solo lo usa `deshacer`). Quitar una estación que no está → `False`. Quitar la primera, la última o vaciar la ruta funciona. `recorrido` de una ruta inexistente → `[]`. Las estaciones cerradas siguen apareciendo en `recorrido` (el bus pasa por ahí aunque nadie suba ni baje).
- **Relación con otros requisitos:** quitar una parada hace que `proximo_bus` (R4) devuelva `None` para esa ruta y estación, y le resta sus buses en el ranking (R6); agregarla de nuevo se los devuelve. Las operaciones que sí cambian algo se registran para `deshacer`/`rehacer` (R9). Pruebas: `tests/test_r7.py`.

### R8 · Cerrar y reabrir estaciones — `red.cerrar(nombre)`, `red.reabrir(nombre)`

- **Estructura:** la **misma tabla hash de R1** (`Red._estaciones`): nombre → `True` (abierta) / `False` (cerrada). Cerrar o reabrir solo cambia ese valor; la estación **no se borra** del arreglo ordenado (R2/R3), ni de las rutas (R5/R7), ni de los horarios (R4). La única estructura que se modifica además es el **montículo del ranking** (R6).
- **Algoritmo** (`_cambiar_estado`, compartido por `cerrar` y `reabrir`):
  1. Buscar el valor actual en la tabla hash.
  2. Si no existe → `False` (**no se crea**: un `put` directo insertaría una estación nueva).
  3. Si ya estaba en ese estado → `False` (no hubo cambio, así que tampoco se registra en el historial de R9).
  4. Si no, guardar el nuevo valor, sacar la estación del montículo (al cerrar) o volver a insertarla (al reabrir), y registrar el cambio para `deshacer` (R9).
- **Cómo lo respeta cada requisito** (todos preguntan `_esta_abierta(nombre)`, que es un `get` O(1) en la tabla hash):

  | Req. | Qué pasa con una estación cerrada |
  |---|---|
  | R1 | `estado` devuelve `"CERRADA"` |
  | R2 / R3 | se salta al recorrer el arreglo ordenado: no aparece |
  | R4 | `proximo_bus` devuelve `None`: nadie sube ahí |
  | R5 | no puede ser origen, destino ni estación de transbordo; el bus sí pasa por ella y cuenta como parada recorrida |
  | R6 | sale del montículo: no aparece en el ranking |
  | R7 | sigue en `recorrido`, porque la ruta físicamente pasa por ahí |

- **O grande** (*n* = número de estaciones):
  - `cerrar` / `reabrir`: **O(log n)**. La parte de la tabla hash es O(1) promedio; el log n viene de sacar o insertar la estación en el montículo del ranking (*n* = estaciones abiertas). Registrar en el historial de R9 es O(1).
  - Saber si una estación está abierta (lo usan R1–R6): **O(1)** promedio.
- **Alternativas descartadas:**
  - **Borrar la estación de todas las estructuras al cerrar:** sacarla del arreglo ordenado obliga a correr los elementos, O(n), y reabrir obligaría a reinsertarla en su lugar y reconstruir sus rutas y horarios. Además deshacer (R9) sería mucho más complicado.
  - **Una lista aparte con las estaciones cerradas:** saber si una estación está cerrada sería buscar en esa lista, O(c) con *c* = cerradas, y `x in lista` está prohibido en el motor.
  - **Recalcular el ranking en cada consulta, filtrando las cerradas:** O(n log n) por consulta, y el ranking "se consulta muy seguido".
- **Por qué encaja con el enunciado:** "R8 y R9 tocan todo lo anterior": con una sola pregunta O(1) (`¿está abierta?`) todos los requisitos respetan el cierre sin duplicar datos, y como no se borra nada, reabrir y deshacer son inmediatos.
- **Debilidad conocida:** en R2 y R3 las cerradas se saltan una por una. Si hay muchas cerradas seguidas dentro del tramo recorrido, la consulta revisa más nombres (por eso su costo es O(log n + c), no O(log n + k)).
- **Bordes:** estación inexistente → `False` y no se crea; cerrar una cerrada o reabrir una abierta → `False` y no se registra en R9; al reabrir vuelve a aparecer en todas las consultas y en el ranking con los mismos buses; `deshacer` de un cierre la reabre y viceversa.
- **Responsables:** Marco Vargas (`cerrar`, `reabrir`, `_cambiar_estado`); la conexión con el montículo del ranking la hizo Juan Diego Castillo (R6) y el registro en el historial Sebastian Pereira (R9).

### R9 · Deshacer y rehacer — `red.deshacer()`, `red.rehacer()`

- **Estructura:** **dos pilas** hechas con listas usadas como arreglo (el tope es el final; solo `append` y `pop()` del final): `_hechos` y `_deshechos`.
- **Algoritmo:** cada `cerrar`, `reabrir`, `agregar_parada` o `quitar_parada` **que sí cambió algo** (devolvió `True`) se apila en `_hechos` y **vacía** `_deshechos` (un cambio nuevo borra lo que había para rehacer). `deshacer` saca el tope de `_hechos`, aplica la **operación inversa** y lo pasa a `_deshechos`; `rehacer` hace lo contrario. Las pilas garantizan el orden correcto (último en entrar, primero en salir).
  - Inversas: `cerrar` ↔ `reabrir`; `agregar_parada` ↔ `quitar_parada`. Para deshacer un `quitar_parada` se guarda **cuál era la parada anterior** (o `None` si era la primera de la ruta) y se vuelve a insertar ahí.
  - Las inversas usan métodos internos (`_cambiar_estado`, `_agregar`, `_quitar`) que no tocan el historial, así deshacer no se registra como un cambio nuevo.
- **Retorno (contrato):** `True` si deshizo/rehizo algo, `False` si no había nada.
- **O grande:** O(1) para mover el cambio entre pilas + el costo de la operación inversa: **O(log n)** (*n* = estaciones abiertas) por reubicar la estación en el montículo del ranking. `quitar_parada` suma O(r), *r* = rutas que pasan por esa estación.
- **Descartado:**
  - Guardar una **copia de toda la red** en cada cambio: deshacer sería trivial, pero cada cambio costaría O(n + tamaño de las rutas) en tiempo y memoria, y los operadores editan "todo el tiempo".
  - Una **sola lista con un índice** de posición actual: funciona igual, pero borrar lo de rehacer obliga a recortar la lista; con dos pilas es solo reiniciar `_deshechos`.
- **Bordes:** historial vacío → `False`; operaciones fallidas (estación inexistente, ya cerrada, parada que no está, ruta inexistente) no se registran; deshacer/rehacer varias veces seguidas respeta el orden; quitar la primera o la última parada de una ruta, o vaciarla, también se deshace.

### R10 · Fila de abordaje — `simular_fila(llegadas, frecuencia, capacidad)`

**Formato (según el enunciado):** `llegadas` son los segundos de llegada (no necesariamente ordenados), `frecuencia` los segundos entre buses y `capacidad` el cupo por bus. Los buses salen en `frecuencia`, `2·frecuencia`, …; quien llega justo en el segundo de salida alcanza a subir. **Devuelve, en el mismo orden de `llegadas`, el segundo en que salió el bus de cada persona.** Ejemplo del enunciado: `simular_fila([30, 5, 5, 70], 60, 2)` → `[120, 60, 60, 120]`.

- **Estructura:** **cola FIFO** propia (`motor/fila.py`, clase `Cola`) sobre una lista con un índice al frente: `encolar` = `append`, `desencolar` = avanzar el índice. Ambas O(1).
- **Algoritmo:**
  1. Se arman pares `(segundo, posición)` y se ordenan con el `merge_sort` del grupo. La posición desempata (llegan al mismo segundo → va primero el que aparece antes) y permite devolver las salidas en el orden original.
  2. Bus por bus: entran a la cola todos los que llegaron hasta la salida del bus y suben hasta `capacidad`, en orden de llegada. Si la cola queda vacía, se **salta directo** al primer bus que sale después de la siguiente llegada (no se recorren buses vacíos).
- **O grande** (*P* = pasajeros): ordenar **O(P log P)**; simular **O(P)**, porque cada pasajero entra y sale de la cola una sola vez y solo se procesan buses que llevan gente (≤ *P*). Total **O(P log P)**. Si la lista ya viniera ordenada, la simulación sola es lineal.
- **Descartado:**
  - `list.pop(0)` como cola: cada salida corre toda la lista, O(P) → O(P²) en total. Con cientos de miles de pasajeros no termina a tiempo.
  - Recorrer **todos** los buses del día uno por uno: O(P + B) con *B* = buses, y si la frecuencia es muy pequeña frente al horario *B* puede ser mucho mayor que *P*.
  - Una cola de prioridad (montículo) por minuto de llegada: también O(P log P), pero más compleja que ordenar una sola vez, porque las llegadas se conocen todas desde el inicio.
- **Bordes:** lista vacía → `[]`; `frecuencia` o `capacidad` ≤ 0, `None` o una llegada inválida → `None`; huecos largos sin pasajeros; empates; llegadas desordenadas.

### R11 · Panel de rendimiento — `py front/panel_rendimiento.py`

- **Dónde:** `front/rendimiento.py` genera las redes y mide, sin interfaz (así se puede probar); `front/panel_rendimiento.py` es la ventana tkinter (rojo, amarillo y blanco). Solo usa la librería estándar. Está fuera de `motor/`: no contiene reglas del sistema, solo llama al motor.
- **Cómo mide:** el mismo método del script del profesor. Genera redes sintéticas con el formato de los CSV, de *n*, 2*n*, 4*n*… estaciones (n // 4 rutas de 12 paradas, 8 viajes por ruta). Corre cada operación muchas veces con entradas al azar y se queda con la mejor de 5 tandas para quitar ruido. Lo que no depende de *n* (k = 10, rangos de 20 nombres, horarios por estación) queda fijo.
- **Qué muestra:** una tabla con la O grande esperada, el crecimiento total medido contra el esperado y si coinciden. Al elegir una operación aparece la gráfica de tiempo contra *n* (línea roja = medido, punteada = la curva esperada escalada al primer punto), la razón t(2n)/t(n) de cada duplicación y la explicación. Si no coincide, la explicación aparece ahí mismo, como pide el enunciado.
- **Criterio "coincide":** el crecimiento total, del primer al último tamaño, no supera 1,5 veces el esperado. Se compara el total y no cada duplicación porque en redes pequeñas una sola duplicación tiene mucho ruido.
- **R5 no se mide** (lo dice el enunciado); aparece en la tabla como "no se mide".
- **Resultado actual** (n = 250 → 2000): todas las operaciones coinciden. Las O(1) y O(log n) se ven casi planas. La carga y `simular_fila` crecen un poco menos que n log n porque en redes pequeñas pesan más los costos fijos de Python.


---

## Estado del proyecto

- [ ] Repositorio creado, con acceso para el profesor
- [ ] Script de conversión GTFS → CSV funcionando
- [ ] CSV generados en `datos/`
- [ ] `Red(carpeta)` carga los tres CSV
- [ ] R1 · R2 · R3
- [x] R4 · R5 · R6
- [ ] R7 · R8 · R9 · R10 _(R9 y R10 listos; falta documentar R7 y R8)_
- [x] R11 · Panel de rendimiento (`py front/panel_rendimiento.py`)
- [x] Pruebas: `py -m unittest discover tests`
- [ ] R12 · Decisiones documentadas
- [ ] App arranca con un solo comando
- [ ] `integrantes.md` completo
- [ ] Revisión de reglas prohibidas en `motor/`
- [ ] Prueba con una red más grande (generada por el grupo) para verificar rendimiento y que nada está amarrado a los datos

---

## Integrantes

Ver [`integrantes.md`](integrantes.md) para los nombres y qué requisitos hizo cada uno.
