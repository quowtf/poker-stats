---
inclusion: fileMatch
fileMatchPattern: 'src/lib/(insights|live-insights).ts'
---

# Insights en vivo (live) — lógica, guía y mantenimiento

Esta capa genera la narrativa que se muestra en el modo live: el **NewsTicker**
(`src/app/live/NewsTicker.tsx`), el **HandSpotlight** (`src/app/live/HandSpotlight.tsx`)
y, en menor medida, el **pregame** (`src/app/api/poker/live/pregame/route.ts`).
Léela antes de tocar `src/lib/insights.ts` o añadir reglas nuevas.

## Principios de diseño

1. **No obvio.** Nunca narrar lo que el jugador ya ve (quién está vivo, quién
   ganó la última mano, eliminaciones obvias). El valor está en patrones que
   nadie calcula mentalmente: rachas, correlaciones, dominio head-to-head,
   récords.
2. **Español, tono de mesa.** Los mensajes van en español, con humor y drama.
   Emojis al inicio como ancla visual. El nickname del jugador tiene prioridad
   sobre el nombre real.
3. **Insights por mano, persistidos.** Cada mano genera 3-5 candidatos que se
   guardan en `session_insights` ligados a `handId`, formando historial.
4. **Degradar con gracia.** Muchos campos son opcionales (`winningHandType`,
   `dealerId`, `sbId`). Una regla sin datos no debe romper; simplemente no emite.

## Pipeline completo

```
POST /api/poker/sessions/[id]/hands                (hand registrada)
  └─ generateInsightsForHand(sessionId, handId)     src/lib/insights.ts
       ├─ carga manos de la sesión + hand_players de la sesión
       ├─ agrega stats por jugador (PlayerSessionStats)
       ├─ genera candidatos con prioridad
       ├─ ordena, selecciona 3-5
       └─ INSERT session_insights (ligado a handId)

GET /api/poker/live                                 src/app/api/poker/live/route.ts
  ├─ SELECT insights de la ÚLTIMA mano (máx 5, order createdAt desc → reverse)
  └─ buildTableInsights() desde ranking/scoreboard  src/lib/live-insights.ts
       └─ merge (mano primero, luego mesa), dedupe por id, cap 7

LivePage  src/app/live/page.tsx
  ├─ HandSpotlight (8s tras cada mano nueva)
  └─ NewsTicker (rotación cada 4s)
```

## Modelo de datos usado

Fuente de verdad: `src/db/schema.ts`.

| Entidad | Campos relevantes |
|---|---|
| `sessions` | `isLive`, `headsUpMode`, `playerCount` |
| `hands` | `handNumber`, `dealerId`, `sbId`, `winningHandType`, `createdAt` |
| `handPlayers` | `participated`, `wentAllIn`, `won`, `eliminated`, `drinks` |
| `substitutions` | `handNumber`, `leftPlayerId`, `revivedPlayerId` |
| `sessionInsights` | `emoji`, `message`, `type`, `handId`, `scope`, `dedupKey` |

> **Convención de la casa: `dealerId` = BIG BLIND (D = BB).** `sbId` = ciego
> chico, sentado a la izquierda del dealer. No es el botón clásico del poker.
> Cualquier insight sobre posición debe decir "BB", nunca "botón".

`insight_type` enum: `streak | rivalry | allIn | prediction | historical |
elimination | milestone`. **Nota:** `elimination` existe en el enum pero hoy no
lo emite ninguna regla.

## Reglas existentes (catálogo, `src/lib/insights.ts`)

| Emoji | Regla | Umbral | Prioridad | Tipo |
|---|---|---|---|---|
| 🔥 | Hot streak | ganador con 3+ wins seguidos | `streak*4` | streak |
| 🥶 | Cold streak | vivo con 5+ manos sin ganar y 5+ jugadas | `min(loss,10)` | streak |
| 🪑 | Fold streak | vivo con 3+ folds seguidos | `fold+2` | streak |
| 🐊 | All-in + ganó | ganó la mano habiendo ido all-in | 8 | allIn |
| 😰 | All-in sobrevivido | all-in, vivo, participó | 6 | allIn |
| 🛡️/⚠️ | Tasa de supervivencia all-in | 4+ all-ins en la noche | 5 | allIn |
| 👑 | Nuevo líder | ganador pasa a líder y supera al 2.º | 10 | prediction |
| ⚡ | Brecha cerrada | líder y 2.º a 1 mano | 7 | prediction |
| 🧿 | Dominio head-to-head | ganador venció a alguien 3+ veces | 6 | rivalry |
| 🍺 | Cerveza + gana | 4+ cervezas y winrate ≥30% | 5 | milestone |
| 🫠 | Cerveza + pierde | 5+ cervezas y winrate ≤10% | 6 | milestone |
| 📊 | Disparidad de winrate | 2.5× el promedio y 4+ wins, desde mano 8 | 5 | historical |
| 🍀/🌈/👑 | Primera mano rara de la noche | `four_of_a_kind` / `straight_flush` / `royal_flush`, primera vez en la sesión | 8 | historical |
| 🎰 | Mejor mano de la noche | fuerza ≥ escalera y supera el máximo previo | 9 | historical |
| 🃏 | Ladrón | gana con `high_card` o `pair` | 5 | historical |
| 🎨 | Tercer color | 3er `flush` de la noche | 5 | milestone |
| 🪙 | Máquina del BB | ganador es BB (dealer) y 3+ wins desde el BB | 6 | streak |
| 💸 | Peaje del SB | vivo con 3+ manos de SB y 0 wins como SB | 5 | streak |
| 🎯 | Comodín de posición | gana desde BB y SB | 6 | historical |
| 🧟 | Revivido | sustitución en la mano actual, 1ª vez | 7 | historical |
| ⚰️ | Doble vida | revivido 2+ veces, sustitución en la mano actual | 7 | historical |
| 🐢 | Mano eterna | última mano > 3× mediana y ≥ 2 min | 5 | historical |
| ⚡ | Racha rápida | últimos 3 intervalos < 60% de la mediana | 4 | historical |
| ⏱️/🐌 | Tendencia de ritmo | 5 recientes > 1.5× o < 0.6× del ritmo global | 4 | historical |
| ⭐ | Hito 5 manos | ganador llega a 5 wins | 6 | milestone |
| 🌟 | Hito 10 manos | ganador llega a 10 wins | 8 | milestone |
| 🃏 | Fallback | nada interesante → narra al ganador | 1 | historical |

### Insights de mesa (`src/lib/live-insights.ts`)

Se calculan en cada poll de `/api/poker/live`, **no se persisten** y usan
`scope: "table"`. Ids estables `table:<regla>[:playerId]`.

| Emoji | Regla | Condición |
|---|---|---|
| 🔮 | Aviso de heads-up | `aliveCount === 3` |
| ⚔️ | Heads-up alcanzado | `aliveCount === 2` |
| 📉 | Empate arriba | top-2 vivos con mismos `handsWon` (>0) |
| 👻 | Fantasma | vivo con `handsFolded >= 5` |
| 💀 | Verdugo | `topKiller.kills >= 3` |
| 🎰 | Dominio | líder ≥3 botes y ventaja ≥5 sobre el último vivo |
| 💥 | Festival de all-ins | `totalAllIns >= 8` |
| 🧪 | Kryptonita presente | `kryptonite` de un vivo también está vivo |
| ☠️ | Nemesis presente | sin kryptonita, `nemesis` de un vivo también vivo |
| 🔥 | Racha histórica | vivo viene de ganar 2+ noches seguidas |
| 🏅 | Noche histórica | vivo con `handsWon >= 8` |

Los perfiles históricos (`getPlayerProfile`) se cargan a partir de la mano 5 y se
refrescan cada 5 manos (`PROFILE_MIN_HANDS`, `PROFILE_REFRESH_EVERY_HANDS` en
`live/route.ts`). La caché es por instancia (`profileCache`) y
`profileRefreshAt` guarda la última mano refrescada por sesión. Solo se piden
para jugadores vivos. Se resuelven con `Promise.allSettled`: un fallo de perfil
no rompe el live.

Fusión en `live/route.ts`: mano primero, mesa después, dedupe por `id`, descarte
de temas ya cubiertos por la mano, cap 7.

## Algoritmo de selección

```ts
candidates.sort((a, b) => b.priority - a.priority);
const highPriority = candidates.filter(c => c.priority >= 7);
const count = Math.min(5, Math.max(3, highPriority.length + 1));
const selected = candidates.slice(0, count);
if (selected.length === 0) { /* fallback ganador */ }
```

Garantiza mínimo 3, máximo 5. Si hay muchas reglas de prioridad ≥7, se cortan
las de menor prioridad. **Debilidad conocida:** puede seleccionar 5 variantes
del mismo tema (varios streaks). Ver "Mejoras futuras".

## Cómo añadir una regla

1. Definir el `emoji`, `message` (español, nickname primero), `type` (debe ser
   uno del enum) y `priority` (0-10; reservar ≥8 para drama: líder, hitos
   grandes).
2. Insertar el candidato en el array `candidates` dentro de
   `generateInsightsForHand`.
3. Usar `playerStats` (agregado ya calculado) o filtrar `currentHandPlayers` /
   `sessionHands` / `allHandPlayers`. Evitar queries nuevas si el dato ya está
   cargado.
4. Si la regla puede repetirse en manos consecutivas, asignar `dedupKey` y
   `cooldownHands` (ver Fase 0 del plan).
5. Probar con una sesión real o datos seed. Revisar que no rompa con campos
   null.

### Plantilla

```ts
// 🎯 Ejemplo: ganó 3 manos seguidas desde el botón
if (winnerStats && winnerStats.winStreak >= 3 && winner?.playerId && winnerIsDealer) {
  candidates.push({
    emoji: "🪙",
    message: `${winnerName} encadena ${winnerStats.winStreak} desde el botón`,
    type: "streak",
    priority: 7,
    dedupKey: `dealer_win:${winner.playerId}`,
    cooldownHands: 4,
  });
}
```

## Anti-repetición (dedup / cooldown)

Problema real: reglas como fold/cold streak se disparan en cada mano mientras la
condición siga viva, generando mensajes casi idénticos. Solución implementada en
`src/lib/insights.ts`:

- `dedupKey` estable por regla + entidad, p.ej. `fold_streak:<playerId>`,
  `best_hand`, `pace`.
- Antes de seleccionar, se leen los últimos 200 insights de la sesión, se mapea
  `handId → handNumber` y se registra el último `handNumber` por `dedupKey`.
- Un candidato se descarta si su clave apareció dentro de su ventana:
  `currentHandNumber - lastHand <= cooldownHands` (defecto 5).
- Ventanas actuales: hot 3, fold 4, cold 6, all-in survival 6, drinks 8,
  win-rate disparity 8.
- Los insights de mesa (`live-insights.ts`) usan `id` fijo derivado del
  `dedupKey`; el merge en `live/route.ts` deduplica por ese id.
- **Entre fuentes:** cada insight de mesa tiene `theme`; el merge descarta los
  de mesa cuyo tema ya cubre un insight de la mano (derivado de su `dedupKey`
  con `themeOfHandInsight`). Ej.: 🪑 fold streak vs 👻 fantasma.

Al añadir una regla repetible, **siempre** asignar `dedupKey` y una
`cooldownHands` razonable. Sin ellos, el ticker se llenará de variantes del
mismo mensaje.

## Scope

- `scope: "hand"` — generado por mano, persistido, va al spotlight y al ticker.
- `scope: "table"` — generado al vuelo en el endpoint live, solo ticker.
- El `HandSpotlight` debe mostrar únicamente `scope !== "table"`.

## Debugging

- **No aparecen insights:** ¿la mano se registró con `handPlayers` no vacío? El
  generador itera `sessionHands`; sin manos no hay nada. Revisar logs
  `"Error generating insights:"` en el POST.
- **Aparecen pocos:** el fallback solo dispara con 0 seleccionados; con 1-2
  candidatos el `count` baja a 3 y `slice` los incluye, así que menos de 3 es
  raro pero posible.
- **El ticker se queda pegado:** `live/route.ts` trae insights de la última mano
  + los de mesa (`live-insights.ts`). Si la última mano no generó insights, los
  de mesa mantienen el ticker vivo. Si aun así queda vacío, revisar
  `buildTableInsights` y que `ranking`/`scoreboard` lleguen con datos.
- **Ledger de análisis rápido (SQL):**

  ```sql
  SELECT hand_id, emoji, message, type
  FROM session_insights
  WHERE session_id = '<id>'
  ORDER BY created_at DESC
  LIMIT 50;
  ```

- **Ver qué candidatos se descartaron:** no hay trazas hoy. Al depurar, añadir
  temporalmente un `console.log(candidates.map(c => [c.priority, c.message]))`
  antes del `sort`.

## Bugs conocidos / trampas

1. **`averageWinRate` en "Win rate disparity"** (líneas ~287-291) divide por
   `currentHandNumber` de forma confusa y mezcla winrate por jugador con
   "wins totales / nº vivos / manos". Revisar la fórmula si el insight sale
   disparatado.
2. **`eliminated` se infiere** en `hands/route.ts`: `wentAllIn && !won &&
   participated`. Sin chips reales, "eliminado" es aproximado. Cualquier regla
   basada en eliminación hereda esa imprecisión.
3. **`isEliminated` se acumula hacia atrás:** un jugador marcado eliminado en
   `playerStats` queda eliminado aunque el bucle procese manos anteriores. Ojo
   al evaluar reglas "solo vivos" en manos tempranas.
4. **Timestamps de hands** son de registro, no del reparto real. Reglas de
   tiempo (Fase 4) son aproximadas.
5. **`dealerId`/`sbId` pueden ser null** en sesiones viejas o mal capturadas.
6. **Repetición de `positionPoints`/labels:** hay lógica duplicada entre
   `stats.ts`, `ladders.ts` y `player-profile.ts`. No añadir una cuarta copia:
   importar de `stats.ts` / `db/schema.ts`.
7. **Off-by-one en `substitutions.handNumber`:** `substitute/route.ts` lo guarda
   como `count(hands)` (manos ya registradas), así que una sustitución tras la
   mano N tiene `handNumber = N` y aplica en N+1. Las reglas de revival aceptan
   `N` o `N+1`; si cambia la semántica del endpoint, revisar ese match.
8. **`dealerId` = BB, no botón:** convención de la casa. No narrar "botón".
9. **Cadencia de perfiles:** `live/route.ts` carga perfiles desde la mano 5 y
   los refresca cada 5 manos. Si cambias stats históricos y no ves el hint en
   vivo, espera al siguiente múltiplo de 5 o reinicia el servidor. En serverless
   la caché es por instancia, no global.

## Mejoras futuras

- **Cupo por categoría:** limitar a 1 streak + 1 allIn + 1 tipo-de-mano + 1 drama
  por selección, para evitar monotematismo.
- **Recencia ponderada:** dar más peso a reglas que no han salido en N manos
  (ya cubierto en parte por cooldown).
- **Récords personales reales:** hoy el histórico no guarda "mejor noche en
  botes". Añadir ese agregado al perfil permitiría "a 1 del récord personal".
- **Machine-readable keys:** persistir `dedupKey` para métricas de "qué reglas
  disparan más" y detectar reglas muertas.
- **Balance emocional:** alternar humor (🍺/🫠) y drama (👑/💀) en el set final.
- Hecho: insights de tipo de mano, narrativa BB/SB, revividos y tipo `Insight`
  compartido (`src/app/live/types.ts`).

## Archivos relacionados

- `src/lib/insights.ts` — generador por mano (núcleo).
- `src/lib/live-insights.ts` — generador de insights de mesa (rolling).
- `src/app/api/poker/live/route.ts` — endpoint que sirve al live.
- `src/app/api/poker/live/pregame/route.ts` — insights predictivos históricos.
- `src/app/api/poker/sessions/[id]/hands/route.ts` — dispara el generador.
- `src/app/live/{NewsTicker,HandSpotlight,page}.tsx` — UI.
- `src/app/live/types.ts` — tipo `Insight` compartido (scope hand/table).
- `docs/insights-live-plan.md` — plan de implementación detallado.
- `.kiro/steering/stats-bi.md` — capa de stats/BI general.
