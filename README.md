# Search Job Agent

AI-powered job application assistant for the Australian market.

## Stack

- **Frontend**: Next.js, TypeScript, TailwindCSS
- **Backend**: Express, Node.js
- **Database**: PostgreSQL + Prisma
- **AI**: OpenAI API
- **Queue-ready**: Redis (docker-compose)

## Quick Start

```bash
# 1. Copy environment
cp .env.example .env

# 2. Start Postgres + Redis
docker compose up -d

# 3. Install dependencies
pnpm install

# 4. Setup database
pnpm db:push
pnpm db:seed

# 5. Run dev servers
pnpm dev
```

- Web UI: http://localhost:3000
- API: http://localhost:4000/api/health

Default API secret: `change-me` (set in `.env` and `NEXT_PUBLIC_API_SECRET`).

## Features

- APS Jobs search (with sample fallback)
- Manual job import
- JD analysis (OpenAI or rule-based fallback)
- Tailored resume + cover letter generation
- **Dual master resumes**: AI / Agent Engineer + Software Developer (auto-selected per job)
- Files saved to `storage/applications/{Company}_{JobTitle}/`
- Application tracking with CSV/Excel export

## Monorepo Structure

```
apps/web          Next.js frontend
apps/api          Express API
packages/db       Prisma schema
packages/shared   Schemas, scoring, storage, documents
packages/agents/* Isolated agents with input/output schemas
```
