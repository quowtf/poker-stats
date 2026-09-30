# Estructura del proyecto

## Árbol general

```
src/
├── app/                    # Next.js App Router
│   ├── admin/              # Panel de administración (protegido, rol admin)
│   │   ├── login/
│   │   ├── players/        # alta/edición de jugadores
│   │   └── sessions/       # alta de sesiones, registro de manos
│   ├── api/
│   │   ├── auth/           # NextAuth + registro
│   │   ├── health/
│   │   └── poker/          # API de dominio (players, sessions, hands, stats, live)
│   ├── dashboard/          # UI pública de lectura
│   │   ├── players/[id]/   # perfil de jugador
│   │   ├── sessions/[id]/  # detalle de sesión + gráfico
│   │   └── stats/[stat]/   # ladder/ranking por métrica
│   ├── live/               # vista en vivo de la sesión activa
│   ├── layout.tsx
│   ├── page.tsx
│   └── providers.tsx
├── db/
│   ├── index.ts            # cliente Drizzle
│   ├── schema.ts           # FUENTE DE VERDAD del modelo de datos
│   └── migrations/         # generadas por drizzle-kit
├── lib/                    # lógica de negocio (capa de stats/BI)
│   ├── auth.ts             # NextAuth config + helpers (isAdmin, validateApiKey)
│   ├── stats.ts            # agregaciones nivel sesión y mano, fun labels, kills
│   ├── ladders.ts          # generadores de rankings por métrica
│   ├── insights.ts         # insights en vivo por mano (persistidos)
│   ├── player-profile.ts   # stats detalladas de un jugador
│   └── validations.ts      # schemas Zod
├── types/
│   └── next-auth.d.ts      # augmentación de tipos de sesión
└── middleware.ts           # autorización de rutas
```

## Dónde va cada cosa

- **Nueva métrica / ranking**: agregar un generador al objeto `LADDER_GENERATORS` en `src/lib/ladders.ts` y registrarlo en `getAvailableStats()`. Cada generador devuelve un `LadderResult` con `entries` ya rankeadas.
- **Nueva stat agregada (leaderboard, advanced, hand-level)**: `src/lib/stats.ts`. Seguir el patrón: fetch de datos → agregación en `Map<playerId, ...>` → construir array tipado → ordenar.
- **Nueva "fun label"**: `getFunLabels` / `getHandFunLabels` en `src/lib/stats.ts`. Cada label es `{ emoji, title, player, description }` en español.
- **Nuevo insight en vivo**: `src/lib/insights.ts`, dentro de `generateInsightsForHand` como un nuevo *candidate* con su `priority`.
- **Cambio de modelo de datos**: `src/db/schema.ts` primero, luego migración.
- **Nuevo endpoint**: bajo `src/app/api/poker/`, validando con Zod y respetando la autorización del middleware.
- **Nueva pantalla de lectura**: bajo `src/app/dashboard/`.

## Patrones de la capa de stats

- Cada archivo de `lib/` que hace stats define **funciones de fetch privadas** (`getSessionData`, `getHandData`, `getAllSessionData`) reutilizadas por varias métricas.
- Las agregaciones se hacen **en memoria con `Map`**, no con SQL agregado, porque los volúmenes son pequeños (poker casero) y la lógica de rachas/deltas es más clara en TS.
- Siempre **saltar sesiones no cerradas**: `if (row.finishPosition === null) continue;`.
- Los rankings ordenan y luego asignan `rank: i + 1`.
- Filtros de mínimos para que las métricas sean significativas (ej. `>= 3` sesiones para volatilidad, `>= 10` manos para win rate, `>= 5` sesiones compartidas para rivalidades).
