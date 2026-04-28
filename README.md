# Brujería Capilar — Workspace de operaciones

Repo del **Programa Creadoras** (gifting de influencers): dashboard admin, webhooks de Tally, scoring automático de contenido y seguimiento por email.

## Para colaborar

1. Asegúrate de tener acceso al [repo en GitHub](https://github.com/brujeriapro/appinfluenciadoras).
2. Clona y abre en Claude Code:

   ```bash
   git clone https://github.com/brujeriapro/appinfluenciadoras.git
   cd appinfluenciadoras
   ```

3. Abre la carpeta en Claude Code y corre `/prime` para que cargue el contexto.
4. Edita, commitea y pushea — Railway redeploya solo en cada push a `main`.

## Estructura

- **`apps/creadoras/`** — App Node (Express + React CDN). Dashboard admin, webhooks, scoring, cron de seguimiento. Desplegada en Railway.
- **`scripts/`** — Análisis de competencia (Python). El subfolder `influencers/_legacy/` tiene los scripts Python deprecados del pipeline (su lógica ya está en `apps/creadoras/`).
- **`context/`** — Información del negocio, estrategia y datos.
- **`plans/`** — Planes de implementación creados con `/create-plan`.

## Producción

- App de creadoras en Railway: autodeploy en cada push a `main`.
- Cron de seguimiento: Railway dispara `POST /api/cron/seguimiento` cada lunes 9am Bogotá.
- Webhooks de Tally: configurados en Tally.so apuntando al dominio de Railway.

## Más contexto

Lee [CLAUDE.md](CLAUDE.md) para el detalle completo del workspace y cómo trabajar con Claude Code aquí.
