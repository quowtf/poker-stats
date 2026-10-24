# Plan de implementación — Insights live del NewsTicker

> Estado: pendiente de implementar. Este documento es la especificación.
> Ver también: `.kiro/steering/insights-live.md` (guía para agentes).

## 1. Objetivo

Mejorar la calidad y variedad de los insights que se muestran en el modo live
(`src/app/live/NewsTicker.tsx` y `src/app/live/HandSpotlight.tsx`) aprovechando
datos que ya existen en la base pero que hoy no se narran, y añadiendo un nivel
de insights "de mesa" (rolling) para que el ticker no se estanque cuando la
última mano fue sosa.

## 2. Diagnóstico del estado actual

Flujo hoy:

```
POST /api/poker/sessions/[id]/hands
  └─ generateInsightsForHand(sessionId, handId)   (src/lib/insights.ts)
       └─ INSERT en session_insights (3-5 filas, ligadas a handId)

GET /api/poker/live                                  (src/app/api/poker/live/route.ts)
  └─ SELECT session_insights WHERE handId = lastHand  (máx 5)

LivePage (src/app/live/page.tsx)
  └─ NewsTicker / HandSpotlight reciben `insights`
```

Problemas:

1. **Solo la última mano.** Si la mano no disparó ningún candidato, el ticker
   muestra el fallback genérico o queda vacío. No hay narrativa de mesa que
   persista entre manos.
2. **Datos sin usar:** `hands.winningHandType`, `hands.dealerId` / `hands.sbId`,
   tabla `substitutions`, ritmo de `drinks`, cadencia temporal (`hands.createdAt`).
3. **Repetición:** reglas como "lleva N manos sin ganar" disparan en cada mano
   consecutiva con mensajes casi idénticos. No hay cooldown ni deduplicación.
4. **Monotonía de prioridad:** la selección `candidates.sort(priority).slice(0,5)`
   puede inundar el set con varias variantes de streak.
5. **Histórico desconectado:** el pregame (`live/pregame/route.ts`) sí usa
   `getPlayerProfile`; el ticker live es 100% sesión actual, así que nunca narra
   récords personales en vivo.

## 3. Alcance

Dentro:
- Añadir reglas nuevas a `src/lib/insights.ts`.
- Añadir generación de insights "de mesa" en el endpoint live.
- Sistema de scope (`hand` | `table`) y cooldown/anti-repetición.
- Ajustes mínimos en `NewsTicker` (scope opcional, evitar reset innecesario).
- Migración de DB para `session_insights` (ver §6).
- Regex/validación: nada, los insights son server-generated.

Fuera:
- No se cambia el esquema de captura de manos (el admin sigue enviando los
  mismos campos). Todas las reglas nuevas usan datos existentes.
- No se toca el pregame show salvo reutilización de helpers.

## 4. Cambios por fase

Las fases están ordenadas por impacto/esfuerzo y son independientes entre sí.
Se recomienda un commit por fase.

### Fase 0 — Infraestructura: scope + dedup/cooldown **(implementado)**

**Motivo:** sin esto, añadir reglas empeora la repetición.

`src/db/schema.ts` → `sessionInsights`:

```ts
export const insightScopeEnum = pgEnum("insight_scope", ["hand", "table"]);

export const sessionInsights = pgTable("session_insights", {
  id: uuid("id").defaultRandom().primaryKey(),
  sessionId: uuid("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
  handId: uuid("hand_id").references(() => hands.id, { onDelete: "cascade" }),
  scope: insightScopeEnum("scope").notNull().default("hand"),
  dedupKey: varchar("dedup_key", { length: 120 }),   // p.ej. "fold_streak:<playerId>"
  emoji: varchar("emoji", { length: 10 }).notNull(),
  message: text("message").notNull(),
  type: insightTypeEnum("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

Migración:

```bash
npm run db:generate   # genera 0003_*.sql
npm run db:migrate
```

`dedupKey` es nullable para filas existentes (retrocompatible). No hace falta
backfill: las filas viejas simplemente no participan del cooldown.

**Cooldown (anti-repetición):** en `generateInsightsForHand`, antes de persistir,
se leen los últimos 200 insights de la sesión, se mapea cada `handId` a su
`handNumber` y se guarda el último `handNumber` visto por `dedupKey`. Un
candidato se descarta si su clave apareció dentro de su ventana
(`currentHandNumber - lastHand <= cooldownHands`). La ventana por defecto es 5
manos (`DEFAULT_COOLDOWN_HANDS`). Cada regla puede fijar la suya.

Candidato tipado (`src/lib/insights.ts`):

```ts
type InsightCandidate = InsightInput & {
  priority: number;
  scope?: "hand" | "table";
  dedupKey?: string;
  cooldownHands?: number;
};
```

Reglas existentes ya migradas a `dedupKey` + cooldown:

| Regla | `dedupKey` | Cooldown |
|---|---|---|
| Hot streak | `hot_streak:<playerId>` | 3 |
| Cold streak | `cold_streak:<playerId>` | 6 |
| Fold streak | `fold_streak:<playerId>` | 4 |
| All-in survival | `allin_survival:<playerId>` | 6 |
| Drinks (gana/pierde) | `drinks_win:` / `drinks_loss:<playerId>` | 8 |
| Win-rate disparity | `wr_disparity:<playerId>` | 8 |

Las reglas transitorias (all-in de la mano, líder, brecha, hitos, head-to-head)
no llevan `dedupKey`: son eventos de una sola mano.

**Criterio de aceptación:** dos manos consecutivas con el mismo jugador en
"fold streak" no producen el mismo mensaje seguido.

### Fase 1 — Tipo de mano ganadora (mayor impacto, dato ya persistido) **(implementado)**

**Datos:** `hands.winningHandType` (enum `hand_type`, ya se guarda en
`hands/route.ts` línea 106) y `HAND_TYPE_LABELS` / `HAND_TYPE_STRENGTH` en
`src/db/schema.ts`.

Hoy `insights.ts` hace `select` de `hands` sin traer `winningHandType`
(línea 26-30). Añadirlo:

```ts
const sessionHands = await db
  .select({ id: hands.id, handNumber: hands.handNumber, winningHandType: hands.winningHandType })
  .from(hands)
  .where(eq(hands.sessionId, sessionId))
  .orderBy(asc(hands.handNumber));
```

Reglas candidatas:

- 🎰 **Mano más fuerte de la noche.** Si `winningHandType` del ganador tiene
  `HAND_TYPE_STRENGTH >= 5` (escalera o mejor) y supera a todo lo anterior:
  `"{winner} se lleva el bote con {LABEL} — la mano más fuerte de la noche"`.
  dedupKey `best_hand`, cooldown 0 (solo cuando mejora el récord, naturalmente
  autorregulado).
- 🌈 **Hito de tipo.** Primera aparición de `straight_flush` / `royal_flush` /
  `four_of_a_kind` en la sesión:
  `"Primera {LABEL} de la noche, cortesía de {winner}"`. dedupKey
  `first_type:<type>`.
- 🃏 **Ladrón / robo descarado.** Ganar con `high_card` o `pair`:
  `"{winner} se lleva el bote con carta alta. Robo descarado."` dedupKey
  `thief:<playerId>`, cooldown 6.
- 🎨 **Acumulado de color.** Si el ganador es el 3.º color de la noche:
  `"{winner}: 3er color de la noche"`. dedupKey `flush_tally`, cooldown 3.

**Criterio de aceptación:** registrar una mano con `winningHandType = straight`
produce insight de mano fuerte; `high_card` produce insight de ladrón.

### Fase 2 — Posición: big blind / small blind **(implementado)**

**Datos:** `hands.dealerId` (= **BB** por convención de la casa), `hands.sbId`.
Ya disponibles en `insights.ts` al ampliar el select de `sessionHands`.

> **Convención de la casa:** `dealerId` representa el **big blind (D = BB)**, no
> el botón clásico. `sbId` es el ciego chico, sentado a la izquierda del dealer.
> Los mensajes deben decir "BB", nunca "botón".

Reglas:

- 🪙 **Máquina del BB.** `winsAsDealer >= 3` (manos donde `dealerId === playerId`
  y `won === true`) y el ganador actual es el BB de la mano:
  `"{winner} gana por {n}ª vez desde el BB esta noche"`. dedupKey
  `bb_win:<playerId>`, cooldown 4.
- 💸 **Peaje del SB.** `handsAsSb >= 3` y 0 victorias como SB:
  `"{player} paga ciego chico y sigue sin cobrar — el SB le pesa"`.
  dedupKey `sb_tax:<playerId>`, cooldown 8.
- 🎯 **Comodín de posición.** Gana al menos una vez desde el BB y otra desde el
  SB: `"{winner} saca botes desde el BB y desde el SB"`. dedupKey
  `any_position:<playerId>`, cooldown 6.

> Nota: `sbId` puede ser null en sesiones viejas; la regla debe saltar si falta
> el dato.

> Nota: `sbId` puede ser null en sesiones viejas; la regla debe saltar si falta
> el dato.

### Fase 3 — Revividos / zombies **(implementado)**

**Datos:** tabla `substitutions` (`sessionId`, `handNumber`, `leftPlayerId`,
`revivedPlayerId`). Se cargan con dos `alias` de `players` para resolver nombres
en una sola query.

Reglas (se narra la sustitución en la siguiente mano registrada):

> **Ojo con el off-by-one:** `substitute/route.ts` guarda
> `handNumber = count(hands)` (manos ya registradas). Una sustitución hecha tras
> la mano N queda con `handNumber = N` y aplica en la mano N+1. Por eso el match
> acepta `sub.handNumber === currentHandNumber - 1` **o** `=== currentHandNumber`.

- 🧟 **Volvió de la muerte.** Sustitución que aplica a la mano actual y primera
  vez que reviven a ese jugador:
  `"{revived} volvió de la muerte: {reviver} le pasó fichas"`. dedupKey
  `revival:<revivedId>:<sub.handNumber>`, cooldown 0.
- ⚰️ **Doble vida.** Si el jugador ya fue revivido 2+ veces en la noche:
  `"{revived} ya va por su {n}ª vida esta noche — {reviver} lo revivió otra vez"`.
  Mismo dedupKey, cooldown 0.

Se emite un solo candidato por sustitución (⚰️ sustituye a 🧟 cuando `n >= 2`)
para no duplicar el mismo evento.

### Fase 4 — Ritmo y tiempo **(implementado)**

**Datos:** `hands.createdAt` (añadido al select de `sessionHands`). Se calculan
los intervalos entre manos consecutivas y su mediana.

> `createdAt` es el momento de registro, no el del reparto real. Estas reglas son
> aproximadas y por eso llevan prioridad baja (4-5).

Reglas:

- 🐢 **Mano eterna.** El intervalo de la mano actual > 3× la mediana y ≥ 2 min:
  `"La última mano duró {n} min — la mesa se durmió"`. dedupKey `slow_hand`,
  cooldown 5.
- ⚡ **Racha rápida.** Los últimos 3 intervalos < 60% de la mediana:
  `"3 manos seguidas a toda velocidad"`. dedupKey `fast_streak`, cooldown 6.
- ⏱️/🐌 **Tendencia de ritmo.** Ritmo de las últimas 5 manos vs ritmo global:
  si > 1.5× y ≥ 30 manos/hora → `"La mesa aceleró: {n} manos/hora en las últimas
  5"`; si < 0.6× y el global ≥ 15 → `"La mesa se enfrió: {n} manos/hora en las
  últimas 5"`. dedupKey `pace`, cooldown 10.

> Desviación respecto al borrador original: no se compara con la mediana de
> sesiones históricas (evita una query pesada por mano). Se usa tendencia
> intra-sesión.

### Fase 5 — Insights de mesa (rolling) **(implementado)**

**Motivo:** el ticker no debe depender solo de la última mano.

Módulo `src/lib/live-insights.ts`:

```ts
export type TableInsight = {
  id: string;        // id estable: "table:<dedupKey>"
  emoji: string;
  message: string;
  type: "streak" | "rivalry" | "allIn" | "prediction" | "historical" | "milestone";
  scope: "table";
};

export function buildTableInsights(input: {
  ranking: RankingEntry[];
  scoreboard: ScoreboardData;
  handCount: number;
  aliveCount: number;
}): TableInsight[];
```

Reglas (derivadas de agregados que `live/route.ts` ya calcula):

- 🔮 **Aviso de heads-up.** `aliveCount === 3`:
  `"Si cae uno más, quedan 2 — se acerca el heads-up"`. id `table:headsup_warning`.
- ⚔️ **Heads-up alcanzado.** `aliveCount === 2`:
  `"Heads-up: {a} vs {b}"`. id `table:headsup`.
- 📉 **Empate arriba.** Los dos primeros vivos con los mismos `handsWon` (>0):
  `"{a} y {b} empatados arriba — nadie suelta el liderato"`. id `table:top_tie`.
- 👻 **Fantasma.** Vivo con `handsFolded >= 5`:
  `"{player} lleva {n} manos sin entrar — el fantasma de la mesa"`.
  id `table:ghost:<playerId>`.
- 💀 **Verdugo.** `scoreboard.topKiller.kills >= 3`:
  `"{killer} suma {n} eliminaciones esta noche"`. id `table:killer:<playerId>`.
- 🎰 **Dominio.** Líder con ≥3 botes y ventaja ≥5 sobre el último vivo:
  `"{leader} le saca {n} botes al último — dominio total"`. id `table:dominance`.
- 💥 **Festival de all-ins.** `totalAllIns >= 8`:
  `"Noche de all-ins: {n} ya"`. id `table:allin_fest`.

Fusión en `live/route.ts`:

```ts
const tableInsights = buildTableInsights({ ranking, scoreboard, handCount, aliveCount });
const mergedInsights = [...handInsights, ...tableInsights]
  .filter(/* dedupe por id */)
  .slice(0, 7);
```

Los de mano van primero ("lo que acaba de pasar"), luego los de mesa. Cap de 7
para no alargar la cola de rotación. No se persisten.

**Anti-repetición entre fuentes:** cada insight tiene un `theme` (derivado del
`dedupKey` en los de mano). Antes de fusionar se descartan los de mesa cuyo
`theme` ya cubre un insight de la mano (p.ej. 🪑 fold streak vs 👻 fantasma).
Los de mesa se ordenan por prioridad de tema para que los más dramáticos
(heads-up, verdugo, rivalidad, hitos) no se corten por el cap.

### Fase 6 — Histórico live (récords personales) **(implementado)**

**Datos:** `getPlayerProfile` (`src/lib/player-profile.ts`), reutilizado del
pregame. Solo se consulta para jugadores **vivos** y cuando ya hay manos
(`sessionHands.length > 0`); el pregame cubre el caso sin manos.

**Caché / cadencia:** `getPlayerProfile` hace varias queries por jugador. En
`live/route.ts` los perfiles **no** se piden en cada poll: se cargan a partir de
la mano 5 (`PROFILE_MIN_HANDS`) y se refrescan cada 5 manos
(`PROFILE_REFRESH_EVERY_HANDS`). La caché es por instancia
(`profileCache`) y `profileRefreshAt` guarda la última mano refrescada por
sesión. Los datos históricos no cambian durante una sesión live, así que la
frescura es de sobra.

`buildTableInsights` recibe `profiles?: PlayerProfile[]` (opcional) y añade:

- 🧪 **Kryptonita presente.** Si la `kryptonite` de un jugador vivo también está
  viva: `"{player} tiene a su kryptonita en la mesa: {kryptonite}"`.
  id `table:kryptonite:<playerId>`. Solo se emite una.
- ☠️ **Nemesis presente.** Si no hubo kryptonita y el `nemesis` de un vivo está
  vivo: `"{player} tiene a su nemesis en la mesa: {nemesis}"`.
  id `table:nemesis:<playerId>`. Solo una.
- 🔥 **Racha histórica.** Jugador vivo que viene de ganar 2+ noches seguidas:
  `"{player} viene de ganar {n} noches seguidas"`. id
  `table:hist_streak:<playerId>`.
- 🏅 **Noche histórica.** Jugador vivo con `handsWon >= 8`:
  `"{player} con {n} botes — noche histórica"`. id
  `table:big_night:<playerId>`. Regla de sesión, no depende de perfiles.

> v1 deliberadamente conservadora: no se compara con el récord personal real
> (el perfil no guarda "mejor noche en botes"). Umbral fijo 8. Ver mejoras
> futuras en la guía de agentes.

### Fase 7 — UI: NewsTicker **(implementado)**

**Nuevo — `src/app/live/types.ts`:**

```ts
export type InsightScope = "hand" | "table";
export type Insight = {
  id: string;
  emoji: string;
  message: string;
  type: string;
  scope?: InsightScope;
  createdAt?: string;
};
```

`NewsTicker`, `HandSpotlight` y `page.tsx` importan este tipo (se eliminaron las
tres copias locales).

`src/app/live/NewsTicker.tsx`:

1. **Sin reset innecesario.** Se calcula una firma `insights.map(i => i.id).join("|")`
   y solo se vuelve al índice 0 cuando cambia. Antes, cada poll (10s) reseteaba
   la rotación.
2. **Clamp del índice.** `insights[index] ?? insights[0] ?? null` evita un frame
   vacío si el set encoge.
3. **Sin badge de scope.** Se probó "La mano" / "La mesa", pero no aportaba:
   el jugador no necesita saber de dónde sale el insight. El `scope` se mantiene
   en los datos solo para filtrar el spotlight.
4. `HandSpotlight` sigue mostrando solo insights de mano (filtro en `page.tsx`).

## 5. Contratos y tipos

Tipo compartido propuesto (`src/app/live/types.ts`):

```ts
export type Insight = {
  id: string;
  emoji: string;
  message: string;
  type: string;
  scope?: "hand" | "table";
  createdAt?: string; // los de mesa no lo traen
};
```

## 6. Migración de base de datos

Única migración necesaria: Fase 0.

- Nuevo enum `insight_scope`.
- Columnas `scope` (default `hand`, not null) y `dedupKey` (varchar 120, nullable).

Generar con drizzle-kit y aplicar con el script `db:migrate`. Verificar el SQL
generado antes de aplicar (drizzle-kit a veces reescribe enums).

No hay migración de datos.

## 7. Verificación

Pruebas manuales (no hay suite de tests en el repo):

1. Sesión live con ≥ 8 manos simuladas vía `POST .../hands`.
2. Comprobar `session_insights`: variedad de reglas, sin mensajes idénticos
   consecutivos (`SELECT message FROM session_insights ORDER BY created_at`).
3. `GET /api/poker/live`: confirmar que llegan insights de mano + de mesa,
   total ≤ 7, sin ids duplicados.
4. UI: abrir `/live`, verificar rotación, que no parpadea al refrescar cada 10s,
   y que el spotlight muestra solo insights de mano.
5. Casos borde: sesión sin manos (pregame intacto), sesión con 1 jugador vivo,
   `sbId`/`dealerId` null, `winningHandType` null.

## 8. Orden de commits sugerido

1. `feat(db): add scope and dedup_key to session_insights`
2. `feat(insights): cooldown/dedup helper + scope plumbing`
3. `feat(insights): winning hand type rules`
4. `feat(insights): dealer/SB position rules`
5. `feat(insights): revival rules from substitutions`
6. `feat(insights): pace/time rules`
7. `feat(live): table-level rolling insights merged into ticker`
8. `feat(insights): historical kryptonite + big-night hints`
9. `refactor(live): shared Insight type + ticker no-reset`

## 9. Riesgos y decisiones abiertas

- **Coste por request:** Fase 6 añade queries de perfil. Cachear o mover a
  pregame si el endpoint se degrada.
- **Precisión temporal:** `createdAt` es de registro, no de reparto real.
  Mantener reglas de tiempo en prioridad baja.
- **Enum hand_type:** `winningHandType` es opcional; en muchas sesiones el admin
  puede no capturarlo. Las reglas de Fase 1 deben degradar con gracia.
- **Duplicación de `HandStats`/labels:** `stats.ts` y `player-profile.ts` ya
  duplican cálculos; no añadir una tercera copia en `insights.ts` — reutilizar.
