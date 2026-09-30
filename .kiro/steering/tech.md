# Stack y convenciones técnicas

## Stack

- **Framework**: Next.js 15 (App Router) con React 19 y TypeScript.
- **Base de datos**: PostgreSQL (Neon serverless, `@neondatabase/serverless`).
- **ORM**: Drizzle ORM + drizzle-kit para migraciones.
- **Auth**: NextAuth v5 (beta) con provider de credenciales (email + password), estrategia JWT. Passwords con `bcryptjs`.
- **Validación**: Zod en toda entrada de API.
- **UI**: Tailwind CSS v4 (vía `@tailwindcss/postcss`).
- **Charts**: Chart.js + react-chartjs-2.

## Comandos

```bash
npm run dev          # servidor de desarrollo (NO ejecutar en background del agente; correr manual)
npm run build        # build de producción
npm run lint         # eslint / next lint
npm run db:generate  # genera migraciones desde el schema (drizzle-kit generate)
npm run db:migrate   # aplica migraciones (tsx scripts/migrate.ts)
npm run db:studio    # drizzle studio
npm run db:seed      # siembra datos de ejemplo (tsx scripts/seed.ts)
npm run db:reset     # resetea la base (tsx scripts/reset.ts)
```

> Nota para el agente: `npm run dev` y `db:studio` son procesos largos; sugiérelos al usuario en vez de ejecutarlos en primer plano.

## Convenciones de código

- **Idioma**: identificadores, tipos, funciones y comentarios de código en **inglés**. Textos de cara al usuario (títulos, descripciones, etiquetas, insights) en **español**.
- **Imports**: alias `@/` apunta a `src/`. Usar `@/db`, `@/lib/...`, etc.
- **Tipos**: exportar tipos junto a las funciones que los producen (`export type LeaderboardEntry = ...` justo antes de `getLeaderboard`). Preferir `type` sobre `interface` para shapes de datos.
- **Números derivados**: redondear resultados de stats de forma explícita y consistente (`Math.round(x * 10) / 10` para 1 decimal, `* 100 / 100` para 2). Mantener el mismo patrón que ya existe en `lib/stats.ts` y `lib/ladders.ts`.
- **Fechas**: `sessions.playedAt` es un `date` en modo string (`YYYY-MM-DD`). Ordenar por `playedAt` y desempatar con `createdAt`.

## Base de datos

- El schema vive en `src/db/schema.ts` y es la fuente de verdad. Toda tabla nueva o cambio de columna se hace ahí primero.
- Tras editar el schema: `npm run db:generate` y luego `npm run db:migrate`.
- IDs son `uuid` con `defaultRandom()`.
- Borrados: relaciones hijas de una sesión usan `onDelete: "cascade"`; referencias a `players` usan `onDelete: "restrict"` para no perder historial.
- Enums de dominio (`hand_type`, `user_role`, `insight_type`) se definen con `pgEnum` y se acompañan de tablas de labels/strength en el mismo archivo (`HAND_TYPE_LABELS`, `HAND_TYPE_STRENGTH`).

## Auth y autorización

- `src/middleware.ts` protege `/admin/*` (requiere sesión con rol `admin`) y `/api/poker/*` en métodos de escritura (requiere API key válida o sesión admin). Las lecturas `GET` de la API son públicas.
- Para checks dentro de route handlers usar `isAdmin(request)` o `validateApiKey(request)` de `@/lib/auth`.
- Nunca loguear ni exponer `ADMIN_API_KEY`, `passwordHash` ni valores de `.env.local`.

## API

- Los endpoints de dominio viven bajo `src/app/api/poker/`.
- Validar siempre el body con el schema de Zod correspondiente en `src/lib/validations.ts` antes de tocar la base.
- Devolver errores como JSON `{ error: "..." }` con el status HTTP apropiado (400 validación, 401 no autenticado, 403 sin permiso, 404 no encontrado).

## Verificación

- Tras cambios, correr `npm run lint` y `npm run build` antes de dar por terminada la tarea.
- No agregar tests salvo que se pidan explícitamente.
