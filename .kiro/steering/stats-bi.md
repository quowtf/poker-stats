---
inclusion: fileMatch
fileMatchPattern: 'src/lib/(stats|ladders|insights|player-profile).ts'
---

# Estadísticas y BI

Esta es la capa central del producto: convertir datos crudos de partidas en métricas, rankings, narrativas e insights. Léela antes de agregar o modificar cualquier estadística.

## Fuentes de datos

Dos niveles de granularidad alimentan todo el BI:

| Nivel | Tabla base | Qué mide | Requisito |
|-------|-----------|----------|-----------|
| Sesión | `session_players` (+ `sessions`) | Posición final de cada jugador en la noche | `finishPosition != null` (sesión cerrada) |
| Mano | `hand_players` (+ `hands`) | Detalle por mano: participó, all-in, ganó, eliminado, cervezas | `participated = true` para la mayoría |

Sustituciones (`substitutions`) modelan que un jugador se va y cede fichas a un eliminado; tenerlas en cuenta al interpretar posiciones.

## Sistema de puntos (canónico)

Por posición final: **1º=10, 2º=7, 3º=5, 4º=3, 5º=2, 6º+=1**.
Bonus de diversión: **cada cerveza suma 0.01 pts**.

Esta función (`positionPoints`) está duplicada en `lib/stats.ts` y `lib/ladders.ts`. Si cambia el sistema de puntos, **actualizar ambos** o extraerlo a un módulo compartido. Mantenerlos sincronizados es obligatorio.

## Métricas existentes

### Nivel sesión (`lib/stats.ts`, `lib/ladders.ts`)
- **Puntos totales** y **puntos por sesión** (eficiencia).
- **Victorias** (1er lugar) y **podios** (top 3).
- **Volatilidad**: desviación estándar de posiciones (mayor = impredecible). Mín 3 sesiones.
- **Consistencia**: misma métrica ordenada al revés (menor σ primero).
- **Position delta**: posición real vs esperada `(tableSize + 1) / 2`. Negativo = mejor de lo esperado (overperformer).
- **Rachas**: `currentWinStreak`, `bestWinStreak`, `currentDryStreak`, `worstDryStreak`.
- **Rivalidades** (`getRivalries`): head-to-head por pares, `closeness` 0–1 (1 = perfectamente pareja). Mín 5 sesiones compartidas.

### Nivel mano (`lib/stats.ts`, `lib/ladders.ts`)
- **Win rate**: manos ganadas ÷ jugadas. Mín 10 manos.
- **All-ins** y **supervivencia all-in** (% de all-ins donde no fue eliminado). Mín 3 all-ins.
- **Kills** (`getKillStats`): el ganador de una mano con eliminados es el "asesino"; deriva Top Killer, La Víctima, El Villano (mata campeones), Kryptonita.
- **Cervezas** y **fold rate**.

### Fun labels (`getFunLabels`, `getHandFunLabels`)
Etiquetas con personalidad en español: El Consistente, El Casino, Eterno Segundo, First Blood, Overperformer/Underperformer, On Fire, La Sequía, El Doble A, El Sobreviviente, El Francotirador, El Vaquero, El Kamikaze, Mano Caliente, Rivalidad, Kryptonita.

## Reglas al agregar o cambiar métricas

1. **Saltar sesiones no cerradas**: siempre `if (row.finishPosition === null) continue;` en agregaciones de nivel sesión.
2. **Agregación en memoria con `Map<playerId, ...>`**, no SQL agregado. Los volúmenes son chicos (poker casero) y la lógica de rachas/deltas es más legible en TS.
3. **Reutilizar los fetchers privados** (`getSessionData`, `getHandData`, `getAllSessionData`, `getAllHandData`) en vez de escribir queries nuevas.
4. **Rankings**: ordenar y luego mapear `rank: i + 1`. Elegir bien el criterio de desempate (ej. puntos, luego puntos/sesión).
5. **Filtros de significancia (mínimos)**: aplicar umbrales para que la métrica no sea ruido (3 sesiones para volatilidad, 10 manos para win rate, 5 sesiones compartidas para rivalidades, 3 all-ins para supervivencia). Documentar el mínimo en la `description`.
6. **Redondeo explícito y consistente**: `Math.round(x * 10) / 10` (1 decimal) o `* 100 / 100` (2). No dejar floats crudos.
7. **Nuevo ladder**: agregar el generador a `LADDER_GENERATORS` en `ladders.ts` y registrarlo en `getAvailableStats()`. Devolver un `LadderResult` completo (`title`, `emoji`, `description` en español, `unit`, `entries`).
8. **Textos en español, código en inglés**: `title`, `description`, `detail` y `player` de las labels van en español; ids de stat en inglés-kebab (`points-per-session`, `all-in-survival`).

## Insights en vivo (`lib/insights.ts`)

`generateInsightsForHand(sessionId, handId)` genera y persiste 3–5 insights por mano en `session_insights`.

Reglas de diseño de insights:
- **No decir lo obvio**: nada de "X fue eliminado" o "quedan N jugadores". Todos lo ven en la mesa.
- **Buscar patrones ocultos**: rachas (calientes/frías/de fold), dominancia head-to-head acumulada, correlaciones (cervezas vs win rate), cambios de liderato, milestones.
- **Priorizar**: cada candidato lleva `priority`; se ordena desc y se eligen 3–5 (más si hay varios con `priority >= 7`).
- **Fallback**: si nada es interesante, un insight simple del ganador de la mano.
- Al agregar un insight nuevo, hacerlo como un `candidate` más con su emoji, mensaje en español, `type` (del enum `insight_type`) y `priority`.

## Verificar cálculos: SOLO con datos mock

**Regla dura: nunca verificar ni probar cálculos contra la base de datos real.** La base ya contiene datos reales de partidas y no deben mezclarse ni corromperse con datos de prueba.

- Validar la lógica de una métrica con **unit tests** que usan **datos mock en archivos JSON o CSV** que simulan las filas de la base (`session_players`, `hand_players`, etc.).
- Los fixtures viven en un directorio de tests (ej. `tests/fixtures/*.json` o `*.csv`), no en la app ni en la base.
- El patrón es: cargar el fixture → pasar las filas a una función de cálculo pura → afirmar el resultado esperado. Esto exige que la lógica de agregación sea **testeable sin base de datos**: separar el *fetch* (que toca `db`) del *cálculo* (que recibe filas planas y devuelve el resultado). Al agregar métricas, escribir la función de cálculo de forma que acepte las filas como argumento.
- **No** usar `npm run db:seed`, `db:reset` ni escribir en la base real para probar. Esos comandos son para entornos locales desechables, no para validar cálculos.

## Al terminar
Correr `npm run lint` y `npm run build`, y los unit tests de la métrica afectada (contra fixtures mock, nunca contra la base real).
