# Producto

## Qué es

Poker Stats es una aplicación de estadísticas y *business intelligence* para un grupo de poker casero. El objetivo principal no es gestionar dinero ni operar la mesa, sino **transformar los datos crudos que se recolectan en cada partida en insights, rankings y narrativas divertidas** sobre los jugadores.

La app responde preguntas como:

- ¿Quién es el mejor jugador de la temporada (por puntos, por win rate, por consistencia)?
- ¿Quién es más volátil, quién es más predecible?
- ¿Qué rivalidades son las más parejas? ¿Quién es la "kryptonita" de quién?
- ¿Quién sobrevive más a los all-ins? ¿Quién es el kamikaze?
- ¿Cómo evolucionó una sesión mano a mano?

## Usuarios y roles

- **Admin**: registra datos (jugadores, sesiones, manos, sustituciones). Accede al panel `/admin` y a los endpoints de escritura de la API.
- **Viewer (público)**: consume el dashboard, rankings, perfiles de jugador y recaps. No requiere sesión para leer.
- **API key**: los datos de escritura también se pueden alimentar vía `Authorization: Bearer <ADMIN_API_KEY>` (por ejemplo desde un script o un bot que registre manos en vivo).

## Modelo de datos (mental)

El dato base es la **sesión** (una noche de poker), compuesta por:

- **Jugadores** que participan, cada uno con una posición final (`finishPosition`).
- **Manos** individuales dentro de la sesión, con detalle por jugador: si participó, si fue all-in, si ganó, si fue eliminado, cuántas cervezas tomó.
- **Sustituciones**: cuando alguien se va y cede sus fichas a un eliminado.

De ahí se derivan **dos niveles de estadística**:

1. **Nivel sesión**: puntos, victorias, podios, volatilidad, rivalidades. Basado en `finishPosition`.
2. **Nivel mano**: win rate, all-ins, supervivencia, eliminaciones ("kills"), cervezas. Basado en `hand_players`.

## Principios de producto

- **Divertido primero**: además de las métricas serias, la app genera "etiquetas" con personalidad (El Casino, Eterno Segundo, First Blood, El Sobreviviente, Kryptonita). El tono es de amigos picándose, no de análisis frío.
- **Insights no obvios**: los insights en vivo evitan decir lo que todos ya ven en la mesa (quién fue eliminado). Buscan patrones ocultos: rachas, dominancia head-to-head, correlaciones (cerveza vs win rate).
- **Español como idioma de producto**: títulos, descripciones, etiquetas y mensajes van en español. El código y los identificadores van en inglés.
- **Lectura pública, escritura protegida**: cualquiera puede ver stats; solo admin/API key puede registrar datos.
