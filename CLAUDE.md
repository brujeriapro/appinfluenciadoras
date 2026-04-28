# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What This Is

This is a **shared workspace** for Brujería Capilar's Programa Creadoras (gifting de influencers). Múltiples colaboradoras (la fundadora y su socia) trabajan sobre este repo desde sus propios Claude Code, clonando el repo de GitHub. Para nuevas colaboradoras, el entry point humano es [README.md](README.md); este archivo (CLAUDE.md) es el contexto que Claude carga automáticamente en cada sesión.

**This file (CLAUDE.md) is the foundation.** It is automatically loaded at the start of every session. Keep it current — it is the single source of truth for how Claude should understand and operate within this workspace.

**Onboarding rápido para colaboradoras nuevas:** clonar el repo, abrir en Claude Code, correr `/prime`. El pipeline corre 100% en Railway — no se necesita instalación local salvo para debugging puntual.

---

## The Claude-User Relationship

Claude operates as an **agent assistant** with access to the workspace folders, context files, commands, and outputs. The relationship is:

- **User**: Defines goals, provides context about their role/function, and directs work through commands
- **Claude**: Reads context, understands the user's objectives, executes commands, produces outputs, and maintains workspace consistency

Claude should always orient itself through `/prime` at session start, then act with full awareness of who the user is, what they're trying to achieve, and how this workspace supports that.

---

## Workspace Structure

```
.
├── CLAUDE.md              # This file — core context, always loaded
├── .claude/
│   └── commands/          # Slash commands Claude can execute
│       ├── prime.md                   # /prime — session initialization
│       ├── create-plan.md             # /create-plan — create implementation plans
│       ├── implement.md               # /implement — execute plans
│       └── competitor-analysis.md     # /competitor-analysis — run or interpret competitor analysis
├── context/               # Background context about the user and project
│   ├── personal-info.md   # CEO role and responsibilities
│   ├── business-info.md   # Hopco properties, markets, revenue management manual
│   ├── strategy.md        # 2026–2027 strategic priorities
│   ├── current-data.md    # KPI definitions and data sources
│   ├── programa-creadoras.md  # Influencer program rules, kits, Bruja levels, scoring
│   └── Analisis competencia - *.xlsx  # Historical competitor data files
├── plans/                 # Implementation plans created by /create-plan
├── outputs/
│   ├── competitor-analysis/
│   │   ├── data/          # raw_data.csv — accumulated daily scrape history
│   │   └── reports/       # competitor-analysis-YYYY-MM-DD.xlsx — daily Excel reports
│   └── influencers/
│       ├── envios_log.csv # Log of all gifting orders created via Shopify
│       └── scores_log.csv # Log of all content scores calculated
├── scripts/               # Automation scripts (Python)
│   ├── config.json        # Property list: all Hopco + competitor properties
│   ├── requirements.txt   # Python dependencies (competitor analysis)
│   ├── run.py             # Main pipeline orchestrator
│   ├── scraper.py         # Booking.com Playwright scraper
│   ├── scraper_direct.py  # Direct booking engine scraper
│   ├── data_store.py      # CSV data store read/write
│   ├── report_generator.py # Excel report builder
│   ├── import_historical.py # One-time historical data importer
│   ├── SETUP.md           # First-time setup (competitor analysis)
│   └── influencers/
│       ├── config_influencers.json  # Credentials (gitignored — local fallback only)
│       └── _legacy/                 # Scripts Python deprecados — lógica portada a apps/creadoras/
├── apps/
│   └── creadoras/         # App Node del Programa Creadoras (desplegada en Railway)
├── reference/             # Templates, examples, reusable patterns
├── README.md              # Onboarding entry point para colaboradoras
└── shell-aliases.md       # Shell aliases reference
```

**Key directories:**

| Directory    | Purpose                                                                             |
| ------------ | ----------------------------------------------------------------------------------- |
| `context/`   | Who the user is, their role, current priorities, strategies. Read by `/prime`.      |
| `plans/`     | Detailed implementation plans. Created by `/create-plan`, executed by `/implement`. |
| `outputs/competitor-analysis/` | Daily Excel reports and accumulated scrape data. |
| `outputs/influencers/` | Gifting order log and content score log for the influencer program. |
| `scripts/`   | Competitor analysis automation — scraper, report generator, config.                 |
| `scripts/influencers/_legacy/` | Scripts Python archivados del pipeline (lógica ahora en `apps/creadoras/`). |
| `apps/creadoras/` | App Node del Programa Creadoras — dashboard admin, webhooks Tally, scoring, cron. Desplegada en Railway. |
| `reference/` | Helpful docs, templates and patterns to assist in various workflows.                |

---

## Commands

### /prime

**Purpose:** Initialize a new session with full context awareness.

Run this at the start of every session. Claude will:

1. Read CLAUDE.md and context files
2. Summarize understanding of the user, workspace, and goals
3. Confirm readiness to assist

### /create-plan [request]

**Purpose:** Create a detailed implementation plan before making changes.

Use when adding new functionality, commands, scripts, or making structural changes. Produces a thorough plan document in `plans/` that captures context, rationale, and step-by-step tasks.

Example: `/create-plan add a competitor analysis command`

### /implement [plan-path]

**Purpose:** Execute a plan created by /create-plan.

Reads the plan, executes each step in order, validates the work, and updates the plan status.

Example: `/implement plans/2026-01-28-competitor-analysis-command.md`

### /competitor-analysis [action]

**Purpose:** Run, interpret, or manage the automated competitor analysis pipeline.

Actions: `run` | `interpret` | `status` | `import` | `add competitor [name]` | `setup`

- `run` — Scrape all configured properties (Booking.com or direct booking engine, per property config) and generate the daily Excel report
- `interpret` — Read the most recent data and provide revenue management insights
- `status` — Show system health: last run, records count, unconfigured URLs
- `import` — Run the historical data import (one-time, preserves 2025–2026 manual records)
- `setup` — Display first-time setup instructions from `scripts/SETUP.md`

Example: `/competitor-analysis interpret`

---

## Competitor Analysis System

Automated Python system that scrapes Booking.com and direct hotel booking engines daily to track competitor and Hopco property occupancy and rates across 4 markets.

### Markets Tracked

| Market | Hopco Properties | Competitors |
|---|---|---|
| Guatapé | Porto (16), Boato (15), Bubble (7), Bliiss Glamping (5) | La Pausa, Tau House, Bosko, Levit, Mylos, Viajero |
| Medellín | Hotel 79 Poblado (21) | Nomadic, Hotel selis, Muuk, Nakúa, Origen, Stanza, Wake Living, 1616 Hotel |
| Pereira | Cerritos Mall | To be configured |
| El Salvador | Ecos suites el zonte (28) | Hotel puro surf, Hotel Michanti, Beach Break, El xalli, Esencia nativa, Palo verde |

### Methodology

Occupancy % = (Total Rooms − Available Rooms) / Total Rooms × 100

Each property has a designated `data_source` in `config.json`:
- `"booking"` — scraped from Booking.com (most properties)
- `"direct"` — scraped from the property's own booking engine (Cloudbeds, LobbyPMS, direct-book.com) where Booking.com inventory is limited

Rates are the min/max advertised for each date on the active source.

### Before First Scraper Run (required)

1. Verify URLs in `scripts/config.json` (Cerritos Mall still marked `VERIFY:`)
2. Add Cerritos Mall total room count
3. Add Pereira competitors

### Quick Start

```bash
cd scripts/
source venv/bin/activate
python import_historical.py   # first time only — loads 2025-2026 history
python run.py --report-only   # test with historical data
python run.py                 # live scrape + report
```

Reports saved to: `outputs/competitor-analysis/reports/competitor-analysis-YYYY-MM-DD.xlsx`

---

## Sistema de Gestión de Influencers — Programa Creadoras Brujería Capilar

Sistema para administrar el programa de gifting de influencers de Brujería Capilar (marca B2C de cuidado capilar). Centraliza datos en Supabase, automatiza órdenes Shopify $0 (que disparan las integraciones Shopify→Effi y Shopify→Siigo), y permite a las influencers reportar su propio contenido. **Toda la lógica corre en Node** (`apps/creadoras/`), desplegada en Railway. Los scripts Python originales viven archivados en `scripts/influencers/_legacy/` solo como referencia.

**Context:** `context/programa-creadoras.md` — program rules, kits, niveles de Magia, scoring formula, DM templates.

### Pipeline Phases (corre en `apps/creadoras/`, desplegado en Railway)

| Fase          | Endpoint / archivo                       | Trigger                                      |
| ------------- | ---------------------------------------- | -------------------------------------------- |
| Registro      | `POST /api/webhooks/registro`            | Tally form submission → webhook              |
| Envío         | UI admin en dashboard + `shopify.js`     | Admin elige productos y crea draft order $0  |
| Scoring       | `POST /api/webhooks/contenido`           | Tally form submission → cálculo automático   |
| Seguimiento   | `POST /api/cron/seguimiento`             | Railway cron (lunes 14:00 UTC = 9am Bogotá)  |

> Los scripts Python en `scripts/influencers/_legacy/` están archivados — solo para referencia. La lógica activa vive en Node. Ver [scripts/influencers/_legacy/README.md](scripts/influencers/_legacy/README.md) para el mapeo Python → Node.

### Key Configuration

`scripts/influencers/config_influencers.json` (gitignored) — Supabase URL + service_role_key, Shopify client_id + client_secret, Siigo username + access_key, kit tier limits, scoring weights, Gmail credentials. Solo se usa como fallback en desarrollo local; en producción todo viene de env vars en Railway.

### Tiers & Kits

Kits flexibles — la influencer elige productos, cantidad capada por tier. Los productos elegidos se asignan desde el dashboard admin antes de crear la orden Shopify.

| Tier | Followers | Kit | Productos a elegir |
|---|---|---|---|
| Nano | <10K | Kit Básico | 1 |
| Micro | 10K–100K | Kit Estándar | 2 |
| Macro | >100K | Kit Premium | 3+ |

**Inventario en Siigo**: La app Node llama directamente a la API de Siigo para crear un documento FV NoElectronic (document_type_id 28599, discount 100%, sin estampa DIAN) que descuenta inventario por SKU enviado. Esto es independiente del conector Shopify→Siigo (que se bypassea para órdenes con tag `influencer-gifting`).

### Niveles de Magia (Gamificación)

Semilla (0-20) → Aprendiz (21-50) → Practicante (51-100) → Experta (101-200) → Gran Maga (201+)

---

## App de Gestión Creadoras

Web app (Node.js + Express + React CDN) para administrar el Programa Creadoras. Sin build step — corre desde `node index.js`. **Producción:** Railway, autodeploy en cada push a `main`.

### Vistas

| Vista | Función |
|---|---|
| Dashboard | Stats globales: influencers por status, kits enviados, costo total, score promedio |
| Influencers | Tabla completa con filtros por status/tier/nivel. Click → detalle |
| Detalle | Datos, contenidos, scores, editar status, asignar código de descuento, notas |
| Contenidos | Todas las piezas entregadas con scores y links |
| ROI | Selector de período: ventas Shopify vs costo kits → ROI global del programa |
| Portal Influencer (`/influencer`) | Landing pública, login (email+contraseña), dashboard personal con nivel de Magia, progreso, contenidos y ventas |

### Stack

- Backend: Node.js + Express. Lee env vars en producción; cae a `scripts/influencers/config_influencers.json` solo en desarrollo local.
- Frontend: React 18 CDN + Babel standalone (sin build step)
- DB: Supabase REST API directa
- Ventas: Shopify Admin API 2024-01 con OAuth client_credentials
- Email: Nodemailer + Gmail (recordatorios de seguimiento)

### Local dev (opcional, solo para debugging)

```bash
cd apps/creadoras/
npm install
node index.js   # → http://localhost:3030
```

Requiere `scripts/influencers/config_influencers.json` con credenciales válidas (no incluido en repo). Para trabajo normal, edita en Claude Code, commitea y pushea — Railway redeploya solo.

---

## Critical Instruction: Maintain This File

**Whenever Claude makes changes to the workspace, Claude MUST consider whether CLAUDE.md needs updating.**

After any change — adding commands, scripts, workflows, or modifying structure — ask:

1. Does this change add new functionality users need to know about?
2. Does it modify the workspace structure documented above?
3. Should a new command be listed?
4. Does context/ need new files to capture this?

If yes to any, update the relevant sections. This file must always reflect the current state of the workspace so future sessions have accurate context.

**Examples of changes requiring CLAUDE.md updates:**

- Adding a new slash command → add to Commands section
- Creating a new output type → document in Workspace Structure or create a section
- Adding a script → document its purpose and usage
- Changing workflow patterns → update relevant documentation

---

## For Users Downloading This Template

To customize this workspace to your own needs, fill in your context documents in `context/` and modify as needed. Then use `/create-plan` to plan out and `/implement` to execute any structural changes. This ensures everything stays in sync — especially CLAUDE.md, which must always reflect the current state of the workspace.

---

## Session Workflow

1. **Start**: Run `/prime` to load context
2. **Work**: Use commands or direct Claude with tasks
3. **Plan changes**: Use `/create-plan` before significant additions
4. **Execute**: Use `/implement` to execute plans
5. **Maintain**: Claude updates CLAUDE.md and context/ as the workspace evolves

---

## Notes

- Keep context minimal but sufficient — avoid bloat
- Plans live in `plans/` with dated filenames for history
- Outputs are organized by type/purpose in `outputs/`
- Reference materials go in `reference/` for reuse
