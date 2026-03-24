# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## What This Is

This is a **Claude Workspace Template** — a structured environment designed for working with Claude Code as a powerful agent assistant across sessions. The user will spin up fresh Claude Code sessions repeatedly, using `/prime` at the start of each to load essential context without bloat.

**This file (CLAUDE.md) is the foundation.** It is automatically loaded at the start of every session. Keep it current — it is the single source of truth for how Claude should understand and operate within this workspace.

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
├── scripts/               # Automation scripts
│   ├── config.json        # Property list: all Hopco + competitor properties
│   ├── requirements.txt   # Python dependencies
│   ├── run.py             # Main pipeline orchestrator
│   ├── scraper.py         # Booking.com Playwright scraper
│   ├── scraper_direct.py  # Direct booking engine scraper
│   ├── data_store.py      # CSV data store read/write
│   ├── report_generator.py # Excel report builder
│   ├── import_historical.py # One-time historical data importer
│   ├── SETUP.md           # First-time setup (competitor analysis)
│   └── influencers/       # Influencer management system
│       ├── config_influencers.json  # Credentials, kit SKUs, tier rules, scoring weights
│       ├── supabase_client.py       # Supabase read/write wrapper
│       ├── shopify_client.py        # Shopify $0 draft order creator
│       ├── tier_calculator.py       # Nano/Micro/Macro tier assignment
│       ├── scoring.py               # Content score formula (0-100)
│       ├── nivel_bruja.py           # Bruja level from cumulative score
│       ├── crear_envio.py           # Phase 1: create Shopify orders for registered influencers
│       ├── calcular_scores.py       # Phase 2: score delivered content
│       ├── seguimiento.py           # Phase 3: send reminders to late influencers
│       ├── webhook_receiver.py      # HTTP server for Tally.so webhook submissions
│       ├── requirements_influencers.txt
│       └── SETUP_INFLUENCERS.md     # Full setup guide
├── apps/
│   └── creadoras/         # App web de gestión del Programa Creadoras
│       ├── index.js       # Servidor Express — API REST + sirve el frontend
│       ├── supabase.js    # Cliente Supabase en JS (fetch directo a REST API)
│       ├── shopify.js     # Cliente Shopify — token OAuth + consulta órdenes
│       ├── package.json   # Dependencias: express, node-fetch, cors
│       ├── README.md      # Instrucciones de instalación y uso
│       └── public/
│           └── index.html # Frontend React 18 CDN — Dashboard, Influencers, Contenidos, ROI
├── reference/             # Templates, examples, reusable patterns
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
| `scripts/influencers/` | Influencer program automation — Supabase, Shopify, scoring, reminders. |
| `scripts/influencers/` | Influencer program automation — Supabase, Shopify, scoring, reminders. |
| `apps/creadoras/` | Web app — admin dashboard for managing the influencer program. |
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

Automated Python system for managing the influencer gifting program for Brujería Capilar (B2C hair care brand). Replaces the 100% manual process with a pipeline that centralizes data in Supabase, automates $0 Shopify orders (which trigger existing Shopify→Effi and Shopify→Siigo integrations), and lets influencers report their own content autonomously.

**Context:** `context/programa-creadoras.md` — program rules, kits, Bruja levels, scoring formula, DM templates.

**Setup:** `scripts/influencers/SETUP_INFLUENCERS.md` — step-by-step configuration guide.

### Pipeline Phases

| Phase | Script | When to Run |
|---|---|---|
| Registration | `webhook_receiver.py` | Always running (or via Make.com) — receives Tally.so form submissions |
| Shipping | `crear_envio.py` | When new influencers have status "Registrada" — creates $0 Shopify orders |
| Scoring | `calcular_scores.py` | When content has been delivered — calculates scores and Bruja levels |
| Follow-up | `seguimiento.py` | Weekly — sends email reminders to influencers past their deadline |

### Quick Start

```bash
cd scripts/influencers/
pip install -r requirements_influencers.txt

# Fill credentials first (see SETUP_INFLUENCERS.md)

python crear_envio.py --dry-run    # preview pending shipments
python crear_envio.py              # process shipments (creates Shopify orders)
python calcular_scores.py          # score delivered content
python seguimiento.py --preview    # preview pending reminders
python seguimiento.py              # send reminder emails
```

### Key Configuration

`scripts/influencers/config_influencers.json` — Supabase URL + service_role_key, Shopify client_id + client_secret (OAuth auto-refresh), Siigo username + access_key, kit tier limits, available product SKUs, scoring weights, Gmail credentials.

**IMPORTANT — before first run:** Replace placeholder SKUs in config with real Shopify SKUs (Admin → Products → each product → SKU field).

### Tiers & Kits

Kits are flexible — influencer chooses their own products, quantity capped by tier. Products chosen are stored in `skus_pedidos[]` in Supabase before running `crear_envio.py`.

| Tier | Followers | Kit | Products to Choose |
|---|---|---|---|
| Nano | <10K | Kit Básico | 1 |
| Micro | 10K–100K | Kit Estándar | 2 |
| Macro | >100K | Kit Premium | 3+ |

**Inventory in Siigo**: `crear_envio.py` calls Siigo API directly to create a FV NoElectronic document (document_type_id 28599, discount 100%, no DIAN stamp) that decrements inventory for each SKU sent. This is separate from the Shopify→Siigo connector (which is bypassed for gifting orders tagged `influencer-gifting`).

### Bruja Levels (Gamification)

Semilla (0-20) → Aprendiz (21-50) → Practicante (51-100) → Experta (101-200) → Gran Bruja (201+)

---

## App de Gestión Creadoras

Web app (Node.js + Express + React CDN) para administrar el Programa Creadoras. Lee datos de Supabase y ventas de Shopify. Sin build step — corre desde `node index.js`.

### Vistas

| Vista | Función |
|---|---|
| Dashboard | Stats globales: influencers por status, kits enviados, costo total, score promedio |
| Influencers | Tabla completa con filtros por status/tier/nivel. Click → detalle |
| Detalle | Datos, contenidos, scores, editar status, asignar código de descuento, notas |
| Contenidos | Todas las piezas entregadas con scores y links |
| ROI | Selector de período: ventas Shopify vs costo kits → ROI global del programa |

### Quick Start

```bash
# Primer uso: agregar columna en Supabase SQL Editor:
# ALTER TABLE influencers ADD COLUMN IF NOT EXISTS codigo_descuento text;

cd apps/creadoras/
npm install
node index.js
# → http://localhost:3030
```

### Stack

- Backend: Node.js + Express, lee `scripts/influencers/config_influencers.json` para credenciales
- Frontend: React 18 CDN + Babel standalone (sin build step)
- DB: Supabase REST API directa
- Ventas: Shopify Admin API 2024-01 con OAuth client_credentials

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
