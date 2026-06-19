# Data Toto Macau

Aplikasi analitik dan prediksi Toto Macau 4D dengan engine AI multi-versi (V1, V3, V4, V5, V6) dan data live otomatis.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/toto-macau run dev` — run the frontend (port 23007)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + Recharts + Wouter
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI contract (source of truth)
- `lib/db/src/schema/` — DB schema: `draw_history`, `prediction_history`, `v4_engine_stats`
- `lib/api-client-react/src/generated/` — generated React Query hooks
- `lib/api-zod/src/generated/` — generated Zod schemas
- `artifacts/api-server/src/` — Express API server
  - `routes/` — lottery, analytics, prediction, prediction-v4/v5/v6, sync
  - `analytics/` — prediction engines (markov, v3, v4, v5, v6)
  - `scheduler.ts` — auto-predict every 30 min for all sessions
- `artifacts/toto-macau/src/` — React frontend
  - `pages/` — Dashboard, Data 2025/2026, Statistik, Analytics, Prediction V1/V3/V4/V5/V6, History, TodayPrediction

## Architecture decisions

- Data scraped from external source on startup and synced every request via `/lottery/macau/sync`
- Scheduler auto-syncs + generates V4 predictions every 30 minutes for 6 draw sessions
- Multi-engine prediction: Markov chain, frequency, gap analysis, trend analysis, deep learning (V4+)
- All engine weights stored in DB (`v4_engine_stats`) and self-adjust based on accuracy
- OpenAPI-first: all types generated from `openapi.yaml` via Orval

## Product

- Dashboard overview with latest draw results and hot number indicators
- Historical data browser for 2025 and 2026 draws
- Advanced analytics: frequency heatmap, Markov chains, pair analysis
- AI prediction engines V1/V3/V4/V5/V6 with accuracy tracking
- Today's prediction with session-based scheduling
- Prediction history and engine accuracy stats

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API server auto-syncs on startup — first boot may take a few seconds while 3000+ rows are inserted
- Scheduler starts on API boot — predictions are generated every 30 minutes automatically
- DB schema has 3 tables: `draw_history`, `prediction_history`, `v4_engine_stats`
- Run `pnpm --filter @workspace/db run push` after any schema changes

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Source: https://github.com/yansihaloho/macau
