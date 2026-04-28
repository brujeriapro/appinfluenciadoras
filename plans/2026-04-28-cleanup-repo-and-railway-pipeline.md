# Plan: Limpiar el repo y consolidar el pipeline en Railway

**Created:** 2026-04-28
**Status:** Draft
**Request:** Que la herramienta deje de depender del computador de la usuaria — repo limpio para que la socia colabore desde su Claude Code, y pipeline del Programa Creadoras corriendo 100% en Railway.

---

## Overview

### What This Plan Accomplishes

Deja el repositorio en un estado limpio y reproducible (sin `node_modules` ni archivos de sistema versionados, con `.gitignore` correcto, y todos los cambios pendientes legítimos commiteados), saca la app de atención al cliente del workspace (es proyecto aparte), archiva los scripts Python deprecados, y configura el cron job de Railway que dispara el seguimiento semanal — para que la socia pueda clonar el repo en su Claude Code y empezar a colaborar sin fricciones.

### Why This Matters

Dos personas no pueden colaborar en un repo donde cada `npm install` ensucia 686 archivos de `node_modules` ni donde los `._*` de macOS chocan con cada pull. Un negocio que depende de "mi compu prendida" tampoco escala: el seguimiento de influencers tiene que correr en Railway o no corre. Este plan cierra ambas brechas en una sola pasada y deja el repo listo para que la socia clone y trabaje desde el primer día con su propio Claude Code, sin instalar nada local.

---

## Current State

### Relevant Existing Structure

- **Repo remoto:** `https://github.com/brujeriapro/appinfluenciadoras.git` (rama `main`, en sync con `origin`).
- **App Node ya desplegada en Railway:** `apps/creadoras/` con `railway.json` (NIXPACKS) y `package.json` raíz que arranca con `node apps/creadoras/index.js`.
- **Config con env vars + fallback a JSON local:** patrón ya implementado en [apps/creadoras/config.js](apps/creadoras/config.js).
- **Pipeline Node-nativo (commit ec34dda, 2026-04-23):**
  - `POST /api/webhooks/registro` — recibe Tally, calcula tier, crea influencer en Supabase ([index.js:237](apps/creadoras/index.js#L237))
  - `POST /api/webhooks/contenido` — recibe métricas, calcula score y nivel ([index.js:289](apps/creadoras/index.js#L289))
  - `POST /api/cron/seguimiento` — protegido por `x-cron-secret`, listo para que Railway lo llame ([index.js:352](apps/creadoras/index.js#L352))
- **Scripts Python deprecados pero presentes:** [scripts/influencers/](scripts/influencers/) — `crear_envio.py`, `calcular_scores.py`, `seguimiento.py`, `webhook_receiver.py`, etc. Toda su lógica ya vive en Node.
- **Carpeta intrusa que NO pertenece al workspace:** `apps/atencion-cliente/` — bot WhatsApp+Instagram. Es proyecto **separado** del Programa Creadoras y no debe vivir aquí.
- **Secretos:** `scripts/influencers/config_influencers.json` está gitignored. Las apps Node leen env vars en Railway.
- **`.gitignore` actual:** una sola línea (`scripts/influencers/config_influencers.json`).
- **La socia ya tiene Claude Code instalado** — solo necesita clonar el repo y abrirlo.

### Gaps or Problems Being Addressed

1. **Repo ensuciado:** 650 archivos de `node_modules` trackeados + 36 archivos `._*` de macOS + `portfolio.db` vacío + `.claude/scheduled_tasks.lock`. Cada `npm install` o `git pull` genera ruido y conflictos.
2. **Cambios pendientes sin push:** `CLAUDE.md`, `context/strategy.md`, `.claude/settings.local.json` modificados.
3. **App ajena en el workspace:** `apps/atencion-cliente/` está físicamente dentro del repo, lista para colarse al primer `git add` descuidado, y referenciada en CLAUDE.md como si fuera parte del workspace.
4. **Cron de seguimiento sin disparar:** el endpoint `POST /api/cron/seguimiento` existe pero nadie lo llama. El comentario en el código dice "Railway cron → POST cada lunes", pero el cron job no está configurado (o no se sabe si lo está).
5. **Scripts Python obsoletos confunden:** mantenerlos en `scripts/influencers/` raíz da la falsa impresión de que son parte del pipeline activo. La memoria del proyecto (38 días) todavía los referencia como vivos.
6. **CLAUDE.md describe estado obsoleto:** documenta scripts Python como pipeline vivo, documenta atencion-cliente como parte del workspace.
7. **No hay README raíz para la socia** — sin un punto de entrada claro, va a tener que leer CLAUDE.md (17KB) para entender el repo.

---

## Proposed Changes

### Summary of Changes

- Mover `apps/atencion-cliente/` físicamente fuera del workspace (a una carpeta hermana en `C:\Users\andre\Downloads\atencion-cliente\`) — es proyecto aparte.
- Reescribir `.gitignore` para excluir `node_modules/`, archivos macOS, `__pycache__/`, locks y artefactos de build.
- `git rm -r --cached` para sacar ~686 archivos basura del index.
- Mover scripts Python deprecados a `scripts/influencers/_legacy/` con README de mapeo Python → Node.
- Borrar `portfolio.db` (vacío).
- Commitear y pushear cambios pendientes legítimos: `CLAUDE.md`, `context/strategy.md`.
- Configurar Railway cron job que llama `POST /api/cron/seguimiento` cada lunes.
- Crear README raíz mínimo orientado a la socia.
- Actualizar [CLAUDE.md](CLAUDE.md): scripts Python archivados, eliminar sección de atencion-cliente, documentar cron de Railway, agregar nota de onboarding.
- Actualizar memoria de Claude (`project_influencers.md`) con el estado real post-port a Node.

### New Files to Create

| File Path                                          | Purpose                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `README.md` (raíz)                                 | Onboarding mínimo: clonar, abrir en Claude Code, listo. Apunta a CLAUDE.md.            |
| `scripts/influencers/_legacy/README.md`            | Explica que los scripts Python están archivados y dónde vive la lógica ahora (Node).   |

### Files to Modify

| File Path                            | Changes                                                                                                                                                                                                  |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.gitignore`                         | Reescritura completa: `node_modules/`, `.DS_Store`, `._*`, `*.log`, `.env`, `__pycache__/`, `*.pyc`, `venv/`, `.claude/scheduled_tasks.lock`, `portfolio.db`, `~$*.xlsx`, `outputs/.../raw_data.csv`. |
| `CLAUDE.md`                          | (a) Eliminar sección "Bot de Atención al Cliente"; (b) marcar scripts Python como deprecados; (c) tabla "Pipeline Phases" con endpoints Node activos; (d) breve nota de onboarding (clonar + abrir en Claude Code). |
| `context/strategy.md`                | Ya está modificado — revisar contenido y commitear si está OK.                                                                                                                                            |

### Files / Folders to Move (out of workspace)

| Origen                                              | Destino                                                          | Razón                                                       |
| --------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| `apps/atencion-cliente/` (carpeta completa)         | `C:\Users\andre\Downloads\atencion-cliente\`                     | Proyecto aparte — no pertenece al workspace del Programa Creadoras. |

### Files to Move (archive within workspace)

| Origen                                                  | Destino                                                          | Razón                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `scripts/influencers/crear_envio.py`                    | `scripts/influencers/_legacy/crear_envio.py`                     | Lógica portada a `apps/creadoras/index.js` (auto-envío desde dashboard) |
| `scripts/influencers/calcular_scores.py`                | `scripts/influencers/_legacy/calcular_scores.py`                 | Lógica portada a `apps/creadoras/scoring.js` + webhook de contenido    |
| `scripts/influencers/seguimiento.py`                    | `scripts/influencers/_legacy/seguimiento.py`                     | Lógica portada a `apps/creadoras/email.js` + cron endpoint              |
| `scripts/influencers/webhook_receiver.py`               | `scripts/influencers/_legacy/webhook_receiver.py`                | Reemplazado por `POST /api/webhooks/registro` y `/api/webhooks/contenido` |
| `scripts/influencers/scoring.py`                        | `scripts/influencers/_legacy/scoring.py`                         | Reemplazado por `apps/creadoras/scoring.js`                            |
| `scripts/influencers/nivel_bruja.py`                    | `scripts/influencers/_legacy/nivel_bruja.py`                     | Lógica integrada en `scoring.js`                                       |
| `scripts/influencers/tier_calculator.py`                | `scripts/influencers/_legacy/tier_calculator.py`                 | Lógica integrada en `apps/creadoras/index.js`                          |
| `scripts/influencers/shopify_client.py`                 | `scripts/influencers/_legacy/shopify_client.py`                  | Reemplazado por `apps/creadoras/shopify.js`                            |
| `scripts/influencers/siigo_client.py`                   | `scripts/influencers/_legacy/siigo_client.py`                    | Reemplazado por `apps/creadoras/siigo.js`                              |
| `scripts/influencers/supabase_client.py`                | `scripts/influencers/_legacy/supabase_client.py`                 | Reemplazado por `apps/creadoras/supabase.js`                           |
| `scripts/influencers/limpiar_supabase.py`               | `scripts/influencers/_legacy/limpiar_supabase.py`                | Utilidad de testing — preservar pero archivar                          |
| `scripts/influencers/requirements_influencers.txt`      | `scripts/influencers/_legacy/requirements_influencers.txt`       | Solo aplica a los scripts archivados                                   |
| `scripts/influencers/SETUP_INFLUENCERS.md`              | `scripts/influencers/_legacy/SETUP_INFLUENCERS.md`               | Setup obsoleto del flujo Python                                        |

> Nota: `scripts/influencers/config_influencers.json` se queda donde está (sigue en `.gitignore`) porque la app Node lo lee como fallback en desarrollo local vía `require('../../scripts/influencers/config_influencers.json')`.

### Files to Delete

- `portfolio.db` (vacío, 0 bytes — artefacto residual del proyecto Polymarket bot que vive aparte).
- `.claude/scheduled_tasks.lock` (archivo de runtime de Claude Code — no debe versionarse).

---

## Design Decisions

### Key Decisions Made

1. **`apps/atencion-cliente/` sale físicamente del workspace.**
   *Rationale:* Es un proyecto aparte (bot de atención al cliente para WhatsApp/Instagram), no tiene nada que ver con el Programa Creadoras. Mantenerlo dentro confunde a Claude, contamina el repo, y arriesga que algún día se cuele al `git add`. La movemos a una carpeta hermana en `C:\Users\andre\Downloads\atencion-cliente\` y la usuaria decide después qué hacer con ella (su propio repo, etc.).

2. **Archivar scripts Python en `_legacy/` en vez de borrar.**
   *Rationale:* La lógica está portada a Node y verificada en producción, pero los scripts sirven como referencia histórica y backup de debugging. Costo de mantenerlos en `_legacy/`: cero. Costo de borrarlos: si mañana hay que reconstruir algo, toca volver al git log.

3. **La socia no necesita setup local — usa Claude Code + Railway.**
   *Rationale:* La socia ya tiene Claude Code instalado. Su flujo es: `git clone` → abrir en Claude Code → editar → commit → push → Railway redeploya solo. Para probar, usa la URL de Railway. No necesita instalar Node.js, no necesita el JSON de secretos, no necesita configurar nada local. Si en algún momento puntual necesita correr local, le pasamos el JSON por canal seguro como excepción.

4. **Cron de seguimiento usa Railway Cron Jobs nativos.**
   *Rationale:* Railway soporta cron schedules nativos. No necesitamos GitHub Actions ni un scheduler externo. El endpoint ya existe protegido por `x-cron-secret`.

5. **No tocar `config_influencers.json` ni el flujo de fallback dev/prod.**
   *Rationale:* El patrón `process.env.X || localConfig?.x` ya funciona y la usuaria sigue pudiendo correr local con el JSON. Cambiarlo ahora es alcance fuera del plan.

6. **`.gitignore` agresivo pero conservador con `package-lock.json`.**
   *Rationale:* `package-lock.json` se versiona (lockfile reproducible). Se ignoran solo `node_modules/`, locks ad-hoc y artefactos.

7. **README raíz mínimo, no exhaustivo.**
   *Rationale:* La socia ya tiene Claude Code y va a leer CLAUDE.md de todas formas. El README solo necesita decirle "clona y abre en Claude Code" y apuntar al resto.

### Alternatives Considered

- **Mover scripts Python a Railway como cron jobs Python.** Rechazado porque ya no se usan — duplicaría infraestructura para lógica muerta.
- **Mantener `apps/atencion-cliente/` en el mismo repo.** Rechazado por la usuaria — es proyecto aparte.
- **Borrar `apps/atencion-cliente/` directamente.** Rechazado: tiene código no commiteado en ningún repo (atrapado solo en disco). Hay que preservarlo movido a una ubicación clara.
- **GitHub Actions cron en vez de Railway cron.** Rechazado: Railway lo hace nativo y el código ya está ahí.
- **Reescribir histórico con `bfg-repo-cleaner`.** Rechazado: rompe los clones y obliga a coordinación. `git rm --cached` es suficiente.

### Open Questions

1. **¿Hay un cron job de Railway ya configurado para `seguimiento`?**
   - **Acción durante implementación:** la usuaria revisa el dashboard de Railway. Si existe, validar que apunte al endpoint correcto. Si no, crearlo con schedule `0 14 * * 1` (lunes 9am Bogotá = 14:00 UTC).

2. **¿Los webhooks de Tally apuntan a Railway o a localhost/ngrok?**
   - **Acción durante implementación:** la usuaria revisa Tally.so → Forms → Integrations. Si apuntan a localhost, hay que actualizarlos al dominio de Railway.

---

## Step-by-Step Tasks

Execute these tasks in order during implementation.

### Step 1: Sacar `apps/atencion-cliente/` del workspace

**Pre-condición:** confirmar que ningún archivo de `apps/atencion-cliente/` está trackeado en git (debe estar todo como untracked).

**Actions:**

- Verificar que la carpeta está completamente untracked: `git ls-files apps/atencion-cliente | wc -l` debe retornar 0.
- Mover físicamente la carpeta entera fuera del workspace:

```bash
mv "apps/atencion-cliente" "../atencion-cliente"
```

- Verificar que `apps/` ahora solo contiene `creadoras/`:

```bash
ls apps/
```

- Si la carpeta `apps/` queda vacía, dejarla vacía (la app de creadoras sigue ahí).

**Files affected:**

- `apps/atencion-cliente/` → `../atencion-cliente/` (fuera del workspace).

---

### Step 2: Borrar archivos residuales

**Actions:**

- Borrar `portfolio.db` (0 bytes, artefacto del proyecto Polymarket que vive aparte):

```bash
rm portfolio.db
```

- Borrar `.claude/scheduled_tasks.lock` (runtime de Claude Code):

```bash
rm .claude/scheduled_tasks.lock
```

**Files affected:**

- `portfolio.db` (borrado)
- `.claude/scheduled_tasks.lock` (borrado)

---

### Step 3: Reescribir `.gitignore`

**Actions:**

- Sobrescribir [.gitignore](.gitignore) con este contenido:

```
# Dependencies
node_modules/
__pycache__/
*.pyc
venv/
.venv/

# Secrets & local config
.env
.env.local
.env.*.local
scripts/influencers/config_influencers.json

# OS / Editor cruft
.DS_Store
._*
Thumbs.db
*.swp
*~

# Logs & runtime
*.log
.claude/scheduled_tasks.lock

# Build / artifacts
dist/
build/
*.tsbuildinfo

# Generated data
portfolio.db
outputs/competitor-analysis/data/raw_data.csv
~$*.xlsx
*.xlsx.tmp
```

**Files affected:**

- `.gitignore`

---

### Step 4: Sacar archivos basura del index de git

**Actions:**

- Ejecutar `git rm -r --cached` para todo lo que ahora coincide con el nuevo `.gitignore`:

```bash
git rm -r --cached apps/creadoras/node_modules 2>/dev/null
git ls-files | grep -E '(^|/)\._' | xargs -I {} git rm --cached "{}"
git ls-files | grep -E '\.DS_Store$' | xargs -I {} git rm --cached "{}"
```

- (Los archivos `portfolio.db` y `.claude/scheduled_tasks.lock` ya se borraron en Step 2; si estuvieran trackeados, también caen acá.)

- Verificar con `git status` que solo quedan los archivos legítimos como modificados/eliminados.

**Files affected:**

- ~686 archivos saliendo del index (node_modules + ._* + macOS cruft).

---

### Step 5: Mover scripts Python a `_legacy/`

**Actions:**

- Crear carpeta `scripts/influencers/_legacy/`.
- Mover los 13 archivos listados en la tabla "Files to Move (archive)" usando `git mv`:

```bash
mkdir -p scripts/influencers/_legacy
cd scripts/influencers
for f in crear_envio.py calcular_scores.py seguimiento.py webhook_receiver.py \
         scoring.py nivel_bruja.py tier_calculator.py \
         shopify_client.py siigo_client.py supabase_client.py \
         limpiar_supabase.py requirements_influencers.txt SETUP_INFLUENCERS.md; do
  [ -f "$f" ] && git mv "$f" "_legacy/$f"
done
cd ../..
```

- Verificar que `config_influencers.json` se quede en `scripts/influencers/` (no en `_legacy/`) para que la app Node lo encuentre como fallback local.

**Files affected:**

- 13 archivos movidos a `scripts/influencers/_legacy/`.

---

### Step 6: Crear `scripts/influencers/_legacy/README.md`

**Actions:**

- Crear archivo con este contenido:

```markdown
# Legacy — Scripts Python del Programa Creadoras

> **Estos scripts están archivados.** La lógica vive ahora en la app Node `apps/creadoras/`.

## Por qué se archivaron

El commit `ec34dda` (2026-04-23) portó todo el pipeline a Node para consolidar el sistema en un solo servicio Railway. Los scripts Python ya no se ejecutan en producción.

## Mapeo Python → Node

| Python (legacy)           | Node (activo)                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `webhook_receiver.py`     | `POST /api/webhooks/registro` y `/api/webhooks/contenido` en `apps/creadoras/index.js` |
| `crear_envio.py`          | Auto-envío en `apps/creadoras/index.js` + `shopify.js`                                |
| `calcular_scores.py`      | Webhook de contenido + `apps/creadoras/scoring.js`                                    |
| `seguimiento.py`          | `POST /api/cron/seguimiento` + `apps/creadoras/email.js`                              |
| `scoring.py`              | `apps/creadoras/scoring.js`                                                           |
| `nivel_bruja.py`          | Integrado en `scoring.js`                                                             |
| `tier_calculator.py`      | Integrado en `apps/creadoras/index.js`                                                |
| `shopify_client.py`       | `apps/creadoras/shopify.js`                                                           |
| `siigo_client.py`         | `apps/creadoras/siigo.js`                                                             |
| `supabase_client.py`      | `apps/creadoras/supabase.js`                                                          |
| `limpiar_supabase.py`     | (utilidad de testing, sin equivalente en Node)                                        |

## Cuándo usarlos

Solo para debugging puntual o como referencia. Si vas a agregar una feature, hazlo en la app Node.

## Cómo correrlos (si necesitas)

```bash
cd scripts/influencers/_legacy
pip install -r requirements_influencers.txt
python <script>.py --dry-run
```

Los scripts siguen leyendo de `../config_influencers.json` (un nivel arriba).
```

**Files affected:**

- `scripts/influencers/_legacy/README.md` (nuevo).

---

### Step 7: Crear `README.md` raíz para la socia

**Actions:**

- Crear `README.md` (raíz) con este contenido:

```markdown
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

- App de creadoras en Railway: `https://<dominio-railway>` (autodeploy en cada push a `main`).
- Cron de seguimiento: Railway dispara `POST /api/cron/seguimiento` cada lunes 9am Bogotá.
- Webhooks de Tally: configurados en Tally.so apuntando al dominio de Railway.

## Más contexto

Lee [CLAUDE.md](CLAUDE.md) para el detalle completo del workspace y cómo trabajar con Claude Code aquí.
```

**Files affected:**

- `README.md` (nuevo).

---

### Step 8: Actualizar `CLAUDE.md`

**Actions:**

Editar [CLAUDE.md](CLAUDE.md) con estos cambios concretos:

- **Eliminar la sección completa "Bot de Atención al Cliente — Brujería Capilar"** (proyecto aparte, ya no vive aquí).
- **En "Workspace Structure":** quitar la entrada `apps/atencion-cliente/` y todo su detalle.
- **En la sección "Sistema de Gestión de Influencers — Programa Creadoras Brujería Capilar"**, reemplazar la tabla "Pipeline Phases" por:

```markdown
### Pipeline Phases (corre en `apps/creadoras/`, desplegado en Railway)

| Fase          | Endpoint / archivo                       | Trigger                                      |
| ------------- | ---------------------------------------- | -------------------------------------------- |
| Registro      | `POST /api/webhooks/registro`            | Tally form submission → webhook              |
| Envío         | UI admin en dashboard + `shopify.js`     | Admin elige productos y crea draft order $0  |
| Scoring       | `POST /api/webhooks/contenido`           | Tally form submission → cálculo automático   |
| Seguimiento   | `POST /api/cron/seguimiento`             | Railway cron (lunes 14:00 UTC)               |

> Los scripts Python en `scripts/influencers/_legacy/` están archivados — solo para referencia. La lógica activa vive en Node.
```

- **Eliminar la sección "Quick Start" de los scripts Python** (los comandos `python crear_envio.py --dry-run`, etc.) o reemplazarla con una nota de que está deprecada y apuntar a `_legacy/README.md`.
- **Agregar al inicio una nota corta** de que el repo es colaborativo (usuaria + socia) y que la entrada para colaboradoras nuevas es el `README.md` raíz.
- **Verificar** que las referencias a paths siguen siendo correctas tras los cambios (no debe quedar mención a `apps/atencion-cliente/` ni a `scripts/influencers/crear_envio.py` en raíz).

**Files affected:**

- `CLAUDE.md`

---

### Step 9: Commitear todo en commits separados y pushear

**Actions:**

Hacer commits atómicos para que el histórico sea legible:

```bash
# Commit 1: gitignore + cleanup
git add .gitignore
git commit -m "Reescribir .gitignore: excluir node_modules, archivos macOS y artefactos"

# Commit 2: sacar archivos basura del index
git add -u  # captura los rm --cached
git commit -m "Sacar node_modules y archivos de sistema del control de versiones"

# Commit 3: archivar scripts Python
git add scripts/influencers/_legacy
git commit -m "Archivar scripts Python en _legacy/ — lógica portada a apps/creadoras"

# Commit 4: README raíz
git add README.md
git commit -m "Agregar README raíz para onboarding de colaboradoras"

# Commit 5: actualizar CLAUDE.md y strategy
git add CLAUDE.md context/strategy.md
git commit -m "Actualizar CLAUDE.md y strategy: pipeline en Node, sin bot de atención"

# Push
git push origin main
```

**Files affected:** todos los anteriores.

---

### Step 10: Verificar y configurar cron en Railway

**Pre-condición:** acceso al dashboard de Railway. Esta parte es manual del lado de la usuaria.

**Actions:**

- Abrir Railway → servicio `creadoras-app`.
- **Verificar si ya existe un cron schedule:** Settings → Cron Schedule.
  - Si existe: validar que apunte a `POST /api/cron/seguimiento` con el header `x-cron-secret` correcto.
  - Si no existe: crear uno con schedule `0 14 * * 1` (lunes 14:00 UTC = 9am Bogotá).
- **Validar env vars en Railway:** confirmar que `TALLY_WEBHOOK_SECRET` está configurada (el código la usa para validar el cron secret en [index.js:355](apps/creadoras/index.js#L355)).
- **Disparar el cron manualmente una vez** para validar el flujo:

```bash
curl -X POST -H "x-cron-secret: <valor-de-TALLY_WEBHOOK_SECRET>" \
  https://<dominio-railway>/api/cron/seguimiento
```

Debe retornar `{ ok: true, total: N, resultados: [...] }`.

**Files affected:** ninguno en código — toda la configuración es en el dashboard de Railway.

---

### Step 11: Verificar webhooks de Tally

**Pre-condición:** acceso al dashboard de Tally.so.

**Actions:**

- Abrir Tally.so → form de registro de creadoras → Integrations → Webhooks.
- Verificar que la URL apunta a `https://<dominio-railway>/api/webhooks/registro`.
- Repetir para el form de entrega de contenido → debe apuntar a `/api/webhooks/contenido`.
- Si alguna apunta a localhost o ngrok, actualizar a la URL de Railway.

**Files affected:** ninguno en código.

---

### Step 12: Validación end-to-end

**Actions:**

- `git status` debe mostrar working tree limpio.
- `git ls-files | grep node_modules` debe retornar 0 resultados.
- `git ls-files | grep -E '\._'` debe retornar 0 resultados.
- Abrir el repo en GitHub web y verificar que `apps/atencion-cliente/` NO aparece.
- App de creadoras en Railway: `curl https://<dominio>/` debe responder 200.
- Cron de Railway: ejecutar manualmente y validar respuesta JSON.
- Submit de prueba al form de Tally → verificar que aparece en Supabase como nueva influencer.

**Files affected:** ninguno.

---

### Step 13: Actualizar memoria de Claude

**Actions:**

- Actualizar `C:\Users\andre\.claude\projects\c--Users-andre-Downloads-Workspace-Ettos\memory\project_influencers.md` para reflejar:
  - Pipeline corre 100% en Node (`apps/creadoras/`), no en Python.
  - Scripts Python archivados en `_legacy/`.
  - Cron de seguimiento configurado en Railway.
  - Repo es colaborativo (usuaria + socia).
  - `apps/atencion-cliente/` salió del workspace — es proyecto aparte.

- También revisar si `project_atencion_cliente.md` debe ajustarse para reflejar que ya no vive en este workspace.

**Files affected:**

- `memory/project_influencers.md` (memoria de Claude, fuera del repo).
- `memory/project_atencion_cliente.md` (memoria de Claude, fuera del repo).

---

### Step 14: Onboarding de la socia (manual, fuera del plan automatizado)

**Actions sugeridas para la usuaria:**

- Invitar a la socia como collaborator en el [repo de GitHub](https://github.com/brujeriapro/appinfluenciadoras).
- Compartir el link al repo y decirle: "clónalo y ábrelo en Claude Code, corre `/prime`, listo".
- Si en algún momento puntual ella necesita correr local, pasarle el JSON de secretos por canal seguro (Bitwarden, 1Password, mensaje cifrado).

**Files affected:** ninguno.

---

## Connections & Dependencies

### Files That Reference This Area

- [CLAUDE.md](CLAUDE.md) — describe pipeline Python y app de atención al cliente; hay que actualizar.
- `memory/project_influencers.md` — describe estado pre-port; hay que actualizar.
- `memory/project_atencion_cliente.md` — refleja que el bot vive en este workspace; hay que ajustar.
- [apps/creadoras/config.js](apps/creadoras/config.js) — lee `config_influencers.json` como fallback, no se cambia.

### Updates Needed for Consistency

- `CLAUDE.md` (Step 8).
- Memoria del proyecto (Step 13).
- `context/strategy.md` debería marcar "Automatización del Programa Creadoras" como completada o ajustar el alcance.

### Impact on Existing Workflows

- **`/prime`:** seguirá funcionando — solo cambia el contenido que lee.
- **`/competitor-analysis`:** sin impacto (los scripts de competencia no se tocan).
- **Deploy a Railway:** seguirá automático en cada push a `main`. Sin cambios.
- **Trabajo de la socia:** clona, abre en su Claude Code, edita, commitea, pushea. Sin instalación local.

---

## Validation Checklist

How to verify the implementation is complete and correct:

- [ ] `apps/atencion-cliente/` ya no existe dentro del workspace; está en `C:\Users\andre\Downloads\atencion-cliente\`.
- [ ] `git status` muestra working tree limpio después de los commits.
- [ ] `git ls-files | grep node_modules` retorna 0 resultados.
- [ ] `git ls-files | grep -E '\._'` retorna 0 resultados.
- [ ] `git ls-files | grep atencion-cliente` retorna 0 resultados.
- [ ] `scripts/influencers/_legacy/` existe con los 13 archivos archivados + README.
- [ ] `scripts/influencers/config_influencers.json` sigue presente localmente y NO trackeado.
- [ ] `portfolio.db` ya no existe.
- [ ] `README.md` raíz existe y describe el flujo simple (clonar + abrir en Claude Code).
- [ ] `CLAUDE.md` ya no menciona `apps/atencion-cliente/`, refleja pipeline en Node.
- [ ] `creadoras-app` sigue arriba en Railway tras el push (sin downtime).
- [ ] Cron de Railway configurado con schedule `0 14 * * 1` para `/api/cron/seguimiento`.
- [ ] Llamada manual al cron retorna `{ ok: true, total: N, resultados: [...] }`.
- [ ] Webhooks de Tally apuntan al dominio de Railway.
- [ ] Memoria de Claude actualizada.

---

## Success Criteria

The implementation is complete when:

1. **El repo está limpio:** sin `node_modules`, sin archivos `._*`, sin `apps/atencion-cliente/`, con `.gitignore` correcto y todos los cambios pendientes en GitHub.
2. **El pipeline corre 100% en Railway sin tocar el computador de la usuaria:** webhooks de Tally entrando a Railway, cron de seguimiento ejecutándose lunes a las 9am Bogotá.
3. **La socia puede colaborar sin instalar nada:** `git clone` + abrir en Claude Code + `/prime` → entiende el workspace y empieza a trabajar.
4. **El histórico técnico está claro:** scripts Python archivados con un README que explica dónde vive ahora cada cosa.
5. **CLAUDE.md y la memoria reflejan la realidad** — la siguiente sesión de Claude (suya o de la socia) entiende el estado actual sin asumir que los scripts Python están vivos ni que el bot de atención al cliente vive aquí.

---

## Notes

- **Riesgo principal:** Step 1 (mover `apps/atencion-cliente/` fuera del workspace) — si por algún descuido había código modificado en otra ubicación que dependiera de esta carpeta, queda roto. Mitigación: verificar antes de mover que ningún proceso ni Railway service apunta a esa ruta.
- **Reversibilidad:** todo es reversible.
  - El `mv` se puede deshacer con otro `mv`.
  - Los scripts Python no se borran, se mueven (`git mv`).
  - La única acción no-reversible es borrar `portfolio.db`, pero está vacío.
- **Lo que este plan NO toca:**
  - La lógica del scoring, kits, niveles de Magia, etc. (eso está estable).
  - El sistema de competitor-analysis (sin relación).
  - La automatización logística Effi (proyecto separado).
  - El bot de atención al cliente (movido fuera, fuera de alcance).
- **Próximos pasos lógicos tras este plan:**
  - Documentar runbook para resolver bugs en producción.
  - Hookup de monitoring/alertas (Sentry o similar) para errores en Railway.
  - Resolver `forecast de demanda` que la usuaria mencionó como dolor en `business-info.md` (otro proyecto).
