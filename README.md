# Pflegedienst Schichtplanung (Wunschplan)

React SPA fuer Wunschdienstplanung mit Supabase, GitHub Pages und Edge Functions.

## Setup

1. Node.js 20+ installieren.
2. Abhaengigkeiten installieren:
   - `npm install`
3. `.env.example` nach `.env` kopieren und Werte setzen.
4. Dev-Server starten:
   - `npm run dev`

## Deployment

- `vite.config.ts` nutzt `base: "/Wunschplan/"` fuer GitHub Pages.
- Workflow: `.github/workflows/deploy.yml`
- Benoetigte Secrets:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## Supabase

- Migration: `supabase/migrations/20260324070000_initial_schema.sql`
- Edge Function: `supabase/functions/generate-schedule/index.ts`

## Hinweise

- Routing laeuft mit `HashRouter`.
- RLS ist zwingend erforderlich, da der Anon Key im Browser verwendet wird.
- Der Admin-Algorithmus ist als Basisversion implementiert und kann um Ruhezeiten/weitere Regeln erweitert werden.
