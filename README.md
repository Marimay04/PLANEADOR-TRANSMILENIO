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
- `dict` y `set`

### ❌ Prohibido dentro de `motor/`

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

> 📌 **TODO (grupo):** pegar aquí o enlazar el enunciado completo con los formatos exactos de retorno de cada método (qué tipo devuelve `estado`, formato de la lista de `viaje`, qué pasa con entradas inválidas, etc.). Hasta que esté aquí, la IA no debe inventar formatos de retorno: debe preguntar.

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

> 📌 **TODO (grupo):** escribir aquí el **comando único** que arranca la app, por ejemplo:
>
> ```bash
> # ejemplo, reemplazar por el comando real
> python front/app.py
> ```
>
> Incluir también cómo generar los CSV desde el GTFS y cómo instalar dependencias del front/conversión (nunca del motor).

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
| R1 | _pendiente_ | _pendiente_ | | ⬜ |
| R2 | _pendiente_ | _pendiente_ | | ⬜ |
| R3 | _pendiente_ | _pendiente_ | | ⬜ |
| R4 | _pendiente_ | _pendiente_ | | ⬜ |
| R5 | _pendiente_ | _pendiente_ | | ⬜ |
| R6 | _pendiente_ | _pendiente_ | | ⬜ |
| R7 | _pendiente_ | _pendiente_ | | ⬜ |
| R8 | _pendiente_ | _pendiente_ | | ⬜ |
| R9 | _pendiente_ | _pendiente_ | | ⬜ |
| R10 | _pendiente_ | _pendiente_ | | ⬜ |

### Decisiones transversales

- **Horas mayores a 24:00 del GTFS (ej. `25:10`):** _pendiente: qué hace el grupo y por qué._
- **Interacción entre R8/R9 y el resto** (cerrar estación afecta R1–R6; todo se puede deshacer): _pendiente._

### Decisiones por requisito

_(Completar con la plantilla de arriba a medida que el grupo decida.)_

---

## Estado del proyecto

- [ ] Repositorio creado, con acceso para el profesor
- [ ] Script de conversión GTFS → CSV funcionando
- [ ] CSV generados en `datos/`
- [ ] `Red(carpeta)` carga los tres CSV
- [ ] R1 · R2 · R3
- [ ] R4 · R5 · R6
- [ ] R7 · R8 · R9 · R10
- [ ] R11 · Panel de rendimiento
- [ ] R12 · Decisiones documentadas
- [ ] App arranca con un solo comando
- [ ] `integrantes.md` completo
- [ ] Revisión de reglas prohibidas en `motor/`
- [ ] Prueba con una red más grande (generada por el grupo) para verificar rendimiento y que nada está amarrado a los datos

---

## Integrantes

Ver [`integrantes.md`](integrantes.md) para los nombres y qué requisitos hizo cada uno.
