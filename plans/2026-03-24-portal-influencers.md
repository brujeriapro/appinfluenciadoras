# Plan: Portal de Influencers — Vista Propia con Login

**Created:** 2026-03-24
**Status:** Implemented
**Request:** Crear interfaz para influencers en la app Creadoras con login (email+contraseña), dashboard personal y acceso a historial de contenidos y ventas.

---

## Overview

### What This Plan Accomplishes

Agrega un portal separado en `/influencer` donde cada influencer puede iniciar sesión con su email y una contraseña que crea la primera vez. Una vez autenticada, ve su dashboard personal: nivel bruja, progreso, historial de contenidos, código de descuento y ventas atribuidas. Todo dentro de la misma app Express existente.

### Why This Matters

El equipo necesita que las influencers tengan visibilidad autónoma de su avance en el programa sin depender de reportes manuales. Esto aumenta el engagement y reduce preguntas al equipo.

---

## Current State

### Relevant Existing Structure

- `apps/creadoras/index.js` — Express server con endpoints admin
- `apps/creadoras/supabase.js` — cliente Supabase (fetch directo)
- `apps/creadoras/config.js` — lee credenciales de env vars o JSON local
- `apps/creadoras/public/index.html` — frontend React CDN solo admin
- `apps/creadoras/package.json` — dependencias: express, node-fetch, cors
- Supabase tabla `influencers`: id, nombre, email, instagram_handle, tier, nivel_bruja, status, codigo_descuento, fecha_envio, kit_asignado
- Supabase tabla `contenidos`: id, influencer_id, fecha_submision, tipo_contenido, url_contenido, score_contenido
- Endpoint existente: `GET /api/roi/influencer/:id` — ventas por código de descuento

### Gaps or Problems Being Addressed

- No existe portal para influencers
- No hay sistema de autenticación
- Las influencers no tienen visibilidad de su progreso
- La tabla `influencers` no tiene columna `password_hash`

---

## Proposed Changes

### Summary of Changes

- Agregar columna `password_hash` en Supabase tabla `influencers`
- Agregar `bcrypt` y `jsonwebtoken` como dependencias
- Agregar `JWT_SECRET` como variable de entorno
- Crear 3 endpoints de autenticación en `index.js`
- Crear 2 endpoints de datos para influencers autenticadas
- Crear middleware de autenticación JWT
- Crear `apps/creadoras/public/influencer.html` — portal completo React CDN
- Actualizar `package.json` con nuevas dependencias
- Actualizar `config.js` para incluir `JWT_SECRET` y `tally_form_contenido_url`
- Actualizar `CLAUDE.md` con la nueva vista

### New Files to Create

| File Path | Purpose |
| --- | --- |
| `apps/creadoras/public/influencer.html` | Portal de influencers — landing, login, dashboard |

### Files to Modify

| File Path | Changes |
| --- | --- |
| `apps/creadoras/index.js` | Agregar endpoints auth + datos influencer |
| `apps/creadoras/supabase.js` | Agregar `getInfluencerByEmail`, `updatePasswordHash` |
| `apps/creadoras/config.js` | Agregar `jwt_secret` y `tally_form_contenido_url` |
| `apps/creadoras/package.json` | Agregar bcrypt y jsonwebtoken |
| `CLAUDE.md` | Documentar nueva vista portal influencers |

### Files to Delete

Ninguno.

---

## Design Decisions

### Key Decisions Made

1. **Archivo HTML separado (`influencer.html`)**: Mantiene el portal de influencers completamente separado del admin. El servidor Express sirve `/influencer` → `influencer.html`. Sin contaminar `index.html`.

2. **JWT en localStorage**: Sin cookies ni sesiones server-side. El token se guarda en `localStorage` del browser. Simple y compatible con el stack actual sin librerías adicionales.

3. **Primera vez sin contraseña**: Si el email existe en Supabase pero `password_hash` es null, se le pide crear una contraseña. Si ya tiene `password_hash`, se le pide ingresarla. Flujo en 2 pasos desde el frontend.

4. **bcrypt en el servidor**: El hash se hace en el servidor (nunca en el cliente). Se usa `bcrypt.hash(password, 10)` para guardar y `bcrypt.compare` para verificar.

5. **JWT_SECRET como env var**: No hardcodeado. En local se lee del config JSON (campo `jwt_secret`) o de variable de entorno.

6. **Niveles Bruja calculados del frontend**: La lógica de niveles (Semilla 0-20, Aprendiz 21-50, etc.) se implementa en el frontend de `influencer.html` para no duplicar lógica en el servidor.

### Alternatives Considered

- **Supabase Auth**: Más robusto pero requiere cambiar la arquitectura. El stack actual usa REST API directa, agregar Supabase Auth complicaría el setup.
- **Sesiones Express (express-session)**: Requiere más infraestructura (Redis o similar en Railway). JWT stateless es más simple.
- **Misma `index.html`**: Mezclaría admin con influencer y complicaría el routing.

### Open Questions

Ninguna — el plan está listo para implementar.

---

## Step-by-Step Tasks

### Step 1: Agregar columna `password_hash` en Supabase

Ejecutar en el SQL Editor de Supabase:

```sql
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS password_hash text;
```

**Acciones:**
- Ir a Supabase → SQL Editor
- Ejecutar el comando SQL de arriba
- Verificar que la columna aparece en la tabla

**Files affected:** Ninguno (cambio en Supabase)

---

### Step 2: Actualizar `package.json` con nuevas dependencias

**Acciones:**
- Agregar `"bcrypt": "^5.1.1"` a dependencies
- Agregar `"jsonwebtoken": "^9.0.2"` a dependencies

**Contenido final de `apps/creadoras/package.json`:**
```json
{
  "name": "creadoras-app",
  "version": "1.0.0",
  "description": "App de gestión — Programa Creadoras Brujería Capilar",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "node-fetch": "^2.7.0",
    "cors": "^2.8.5",
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2"
  }
}
```

**Files affected:** `apps/creadoras/package.json`

---

### Step 3: Actualizar `config.js` para agregar JWT_SECRET y Tally URL

Agregar al objeto de configuración (tanto en la rama de env vars como en la rama local) los campos `jwt_secret` y `tally_contenido_url`.

**Cambios en `apps/creadoras/config.js`:**

En la rama de env vars (cuando `process.env.SUPABASE_URL` está definido), agregar:
```js
jwt_secret: process.env.JWT_SECRET || 'dev-secret-local',
tally_contenido_url: process.env.TALLY_CONTENIDO_URL || 'https://tally.so/r/rjEZdo',
tally_registro_url: process.env.TALLY_REGISTRO_URL || '',
```

En la rama local (cuando lee el JSON), el JSON ya tiene `email.tally_form_contenido_url`. Agregar accesos:
```js
jwt_secret: process.env.JWT_SECRET || localConfig?.jwt_secret || 'dev-secret-local',
tally_contenido_url: process.env.TALLY_CONTENIDO_URL || localConfig?.email?.tally_form_contenido_url || 'https://tally.so/r/rjEZdo',
tally_registro_url: process.env.TALLY_REGISTRO_URL || localConfig?.tally_registro_url || '',
```

**Files affected:** `apps/creadoras/config.js`

---

### Step 4: Agregar funciones en `supabase.js`

Agregar dos funciones nuevas al final de `supabase.js` (antes del `module.exports`):

```js
async function getInfluencerByEmail(email) {
  const results = await supabaseGet('influencers', {
    email: `eq.${email}`,
    limit: 1,
    select: '*',
  });
  return results[0] || null;
}

async function updatePasswordHash(id, password_hash) {
  return supabasePatch('influencers', { id }, { password_hash });
}
```

Agregar ambas funciones al `module.exports`.

**Files affected:** `apps/creadoras/supabase.js`

---

### Step 5: Agregar endpoints en `index.js`

Agregar al inicio del archivo (después de los requires existentes):
```js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
```

Agregar función helper de autenticación middleware:
```js
function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  try {
    const payload = jwt.verify(auth.slice(7), config.jwt_secret);
    req.influencerId = payload.id;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}
```

Agregar los siguientes endpoints nuevos en `index.js` (antes del catch-all `app.get('*', ...)`):

**POST /api/auth/check-email** — verifica si el email existe y si ya tiene contraseña:
```js
app.post('/api/auth/check-email', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });
  try {
    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado en el programa' });
    res.json({ exists: true, hasPassword: !!influencer.password_hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**POST /api/auth/set-password** — crea contraseña por primera vez:
```js
app.post('/api/auth/set-password', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  try {
    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado' });
    if (influencer.password_hash) return res.status(400).json({ error: 'Ya tienes una contraseña. Usa iniciar sesión.' });
    const hash = await bcrypt.hash(password, 10);
    await supabase.updatePasswordHash(influencer.id, hash);
    const token = jwt.sign({ id: influencer.id, email: influencer.email }, config.jwt_secret, { expiresIn: '30d' });
    res.json({ token, nombre: influencer.nombre });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**POST /api/auth/login** — login con contraseña existente:
```js
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email y contraseña requeridos' });
  try {
    const influencer = await supabase.getInfluencerByEmail(email.toLowerCase().trim());
    if (!influencer) return res.status(404).json({ error: 'Email no registrado' });
    if (!influencer.password_hash) return res.status(400).json({ error: 'Aún no tienes contraseña. Usa "primera vez".' });
    const ok = await bcrypt.compare(password, influencer.password_hash);
    if (!ok) return res.status(401).json({ error: 'Contraseña incorrecta' });
    const token = jwt.sign({ id: influencer.id, email: influencer.email }, config.jwt_secret, { expiresIn: '30d' });
    res.json({ token, nombre: influencer.nombre });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**GET /api/influencer/me** — datos del dashboard (autenticado):
```js
app.get('/api/influencer/me', authMiddleware, async (req, res) => {
  try {
    const influencer = await supabase.getInfluencerById(req.influencerId);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    const contenidos = await supabase.getContenidos(req.influencerId);
    // No exponer password_hash al cliente
    const { password_hash, ...safe } = influencer;
    res.json({ ...safe, contenidos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**GET /api/influencer/ventas** — ventas atribuidas (autenticado):
```js
app.get('/api/influencer/ventas', authMiddleware, async (req, res) => {
  try {
    const influencer = await supabase.getInfluencerById(req.influencerId);
    if (!influencer) return res.status(404).json({ error: 'No encontrada' });
    if (!influencer.codigo_descuento) {
      return res.json({ atribuido: 0, mensaje: 'Sin código de descuento asignado aún' });
    }
    const ventas = await shopify.getVentas(null, null, influencer.codigo_descuento);
    res.json({
      codigo_descuento: influencer.codigo_descuento,
      ventasAtribuidas: ventas.totalVentas,
      ordenesAtribuidas: ventas.totalOrdenes,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
```

**GET /api/influencer/tally-urls** — URLs de Tally (público, para el frontend):
```js
app.get('/api/influencer/tally-urls', (req, res) => {
  res.json({
    contenido: config.tally_contenido_url,
    registro: config.tally_registro_url,
  });
});
```

Agregar ruta para servir el portal:
```js
app.get('/influencer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'influencer.html'));
});
app.get('/influencer/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'influencer.html'));
});
```
Estas rutas deben ir **antes** del catch-all `app.get('*', ...)`.

**Files affected:** `apps/creadoras/index.js`

---

### Step 6: Crear `apps/creadoras/public/influencer.html`

Crear el archivo HTML completo con React CDN + Babel. Mismos colores/estilo que `index.html`.

**Estructura de vistas:**
1. `LandingPage` — se muestra cuando no hay token en localStorage
2. `LoginPage` — flujo de login en pasos
3. `Dashboard` — vista principal autenticada

**Lógica de niveles bruja (en el frontend):**
```js
const NIVELES = [
  { nombre: 'Bruja Semilla',     min: 0,   max: 20  },
  { nombre: 'Bruja Aprendiz',    min: 21,  max: 50  },
  { nombre: 'Bruja Practicante', min: 51,  max: 100 },
  { nombre: 'Bruja Experta',     min: 101, max: 200 },
  { nombre: 'Gran Bruja',        min: 201, max: null },
];

function getNivel(score) {
  return NIVELES.find(n => score >= n.min && (n.max === null || score <= n.max)) || NIVELES[0];
}

function getProgresoNivel(score) {
  const nivel = getNivel(score);
  const next = NIVELES[NIVELES.indexOf(nivel) + 1];
  if (!next) return { pct: 100, falta: 0, next: null };
  const rango = next.min - nivel.min;
  const avance = score - nivel.min;
  return { pct: Math.round((avance / rango) * 100), falta: next.min - score, next: next.nombre };
}
```

**Contenido completo del archivo `influencer.html`:**

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mi Portal — Brujería Capilar Creadoras</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f0a1e; --bg2: #1a1035; --bg3: #241848; --border: #3d2d6e;
      --purple: #7C3AED; --purple-light: #a855f7; --purple-dark: #2D1B69;
      --text: #f0ebff; --text-muted: #9580c0;
      --green: #22c55e; --yellow: #eab308; --gold: #f59e0b; --red: #ef4444;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: var(--bg); color: var(--text); min-height: 100vh; font-size: 14px;
    }

    /* LANDING */
    .landing {
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; justify-content: center; padding: 40px 20px; text-align: center;
    }
    .landing-logo { font-size: 48px; margin-bottom: 16px; }
    .landing h1 { font-size: 28px; font-weight: 800; color: var(--purple-light); margin-bottom: 8px; }
    .landing p { color: var(--text-muted); font-size: 15px; margin-bottom: 40px; max-width: 400px; }
    .landing-btns { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }

    /* LOGIN CARD */
    .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .login-card {
      background: var(--bg2); border: 1px solid var(--border); border-radius: 16px;
      padding: 32px; width: 100%; max-width: 420px;
    }
    .login-card h2 { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
    .login-card .subtitle { color: var(--text-muted); font-size: 13px; margin-bottom: 24px; }
    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 6px; }
    .field input {
      width: 100%; background: var(--bg3); border: 1px solid var(--border);
      color: var(--text); padding: 10px 14px; border-radius: 8px; font-size: 14px; outline: none;
    }
    .field input:focus { border-color: var(--purple); }

    /* BUTTONS */
    .btn {
      padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer;
      font-size: 14px; font-weight: 600; transition: all 0.15s; width: 100%;
    }
    .btn-primary { background: var(--purple); color: white; }
    .btn-primary:hover { background: var(--purple-light); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-secondary {
      background: transparent; color: var(--text-muted); border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: var(--bg3); color: var(--text); }
    .btn-outline { background: transparent; color: var(--purple-light); border: 2px solid var(--purple); width: auto; padding: 12px 28px; font-size: 15px; }
    .btn-outline:hover { background: var(--purple); color: white; }

    /* ALERTS */
    .alert-error { color: #fca5a5; background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; }
    .alert-success { color: #86efac; background: #052e16; border: 1px solid #166534; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; }

    /* DASHBOARD NAV */
    .top-bar {
      background: var(--bg2); border-bottom: 1px solid var(--border);
      padding: 0 24px; display: flex; align-items: center; justify-content: space-between;
      height: 56px; position: sticky; top: 0; z-index: 100;
    }
    .top-bar .brand { font-weight: 700; font-size: 15px; color: var(--purple-light); }
    .top-bar .brand span { color: var(--text-muted); font-weight: 400; font-size: 13px; margin-left: 8px; }
    .top-bar .logout { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 13px; padding: 6px 12px; border-radius: 6px; }
    .top-bar .logout:hover { background: var(--bg3); color: var(--text); }

    /* DASHBOARD LAYOUT */
    .dash { padding: 28px; max-width: 900px; margin: 0 auto; }
    .dash h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .dash .sub { color: var(--text-muted); font-size: 13px; margin-bottom: 28px; }

    /* PROFILE CARD */
    .profile-card {
      background: var(--bg2); border: 1px solid var(--border); border-radius: 12px;
      padding: 24px; margin-bottom: 20px;
      display: grid; grid-template-columns: 1fr 1fr; gap: 20px;
    }
    @media (max-width: 600px) { .profile-card { grid-template-columns: 1fr; } }
    .profile-card .info-row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .profile-card .info-row:last-child { border-bottom: none; }
    .profile-card .info-label { color: var(--text-muted); }
    .profile-card .info-val { font-weight: 500; }
    .profile-card h3 { font-size: 13px; font-weight: 600; color: var(--purple-light); margin-bottom: 12px; }

    /* NIVEL PROGRESS */
    .nivel-section {
      background: var(--bg2); border: 1px solid var(--border); border-radius: 12px;
      padding: 20px; margin-bottom: 20px;
    }
    .nivel-section h3 { font-size: 13px; font-weight: 600; color: var(--purple-light); margin-bottom: 16px; }
    .nivel-name { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .nivel-score { font-size: 13px; color: var(--text-muted); margin-bottom: 12px; }
    .progress-bar-bg { height: 10px; background: var(--bg3); border-radius: 5px; overflow: hidden; margin-bottom: 6px; }
    .progress-bar-fill { height: 100%; background: linear-gradient(90deg, var(--purple), var(--purple-light)); border-radius: 5px; transition: width 0.5s; }
    .progress-label { font-size: 12px; color: var(--text-muted); }
    .progress-label strong { color: var(--text); }

    /* CARDS GRID */
    .cards-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .mini-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
    .mini-card .label { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
    .mini-card .value { font-size: 24px; font-weight: 700; }
    .mini-card .value.purple { color: var(--purple-light); }
    .mini-card .value.green { color: var(--green); }
    .mini-card .value.gold { color: var(--gold); }

    /* CONTENIDOS TABLE */
    .section-card { background: var(--bg2); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; margin-bottom: 20px; }
    .section-card-header { padding: 16px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; }
    .section-card-header h3 { font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; padding: 10px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); border-bottom: 1px solid var(--border); }
    tbody tr { border-bottom: 1px solid var(--border); }
    tbody tr:last-child { border-bottom: none; }
    tbody td { padding: 10px 16px; font-size: 13px; }
    .td-muted { color: var(--text-muted); }

    /* BADGE */
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 500; }
    .badge-semilla     { background: #052e16; color: #86efac; }
    .badge-aprendiz    { background: #1e3a5f; color: #93c5fd; }
    .badge-practicante { background: #3b0764; color: #d8b4fe; }
    .badge-experta     { background: #2D1B69; color: #a855f7; }
    .badge-gran        { background: #451a03; color: #fcd34d; }
    .badge-nano  { background: #1f2937; color: #9ca3af; }
    .badge-micro { background: #3b0764; color: #d8b4fe; }
    .badge-macro { background: #2D1B69; color: #a855f7; }

    /* SCORE BAR */
    .score-bar { display: flex; align-items: center; gap: 8px; }
    .score-bar-bg { flex: 1; height: 5px; background: var(--bg3); border-radius: 3px; overflow: hidden; }
    .score-bar-fill { height: 100%; background: var(--purple); border-radius: 3px; }
    .score-num { font-size: 12px; color: var(--text-muted); width: 32px; text-align: right; }

    /* CTA SUBIR */
    .cta-subir {
      background: linear-gradient(135deg, var(--purple-dark), #1a0a3e);
      border: 1px solid var(--purple); border-radius: 12px;
      padding: 24px; text-align: center; margin-bottom: 20px;
    }
    .cta-subir h3 { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
    .cta-subir p { color: var(--text-muted); font-size: 13px; margin-bottom: 16px; }
    .cta-subir a { display: inline-block; background: var(--purple); color: white; padding: 10px 28px; border-radius: 8px; font-weight: 600; text-decoration: none; font-size: 14px; }
    .cta-subir a:hover { background: var(--purple-light); }

    .empty-state { text-align: center; padding: 32px; color: var(--text-muted); font-size: 13px; }
    .loading { text-align: center; padding: 60px; color: var(--text-muted); }
    .divider { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); text-align: center; }
    .divider button { background: none; border: none; color: var(--text-muted); font-size: 12px; cursor: pointer; text-decoration: underline; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect } = React;

    // ── NIVELES ────────────────────────────────────────────────────
    const NIVELES = [
      { nombre: 'Bruja Semilla',     min: 0,   max: 20,  badge: 'semilla'     },
      { nombre: 'Bruja Aprendiz',    min: 21,  max: 50,  badge: 'aprendiz'    },
      { nombre: 'Bruja Practicante', min: 51,  max: 100, badge: 'practicante' },
      { nombre: 'Bruja Experta',     min: 101, max: 200, badge: 'experta'     },
      { nombre: 'Gran Bruja',        min: 201, max: null, badge: 'gran'       },
    ];
    function getNivel(score) {
      const s = score || 0;
      return NIVELES.find(n => s >= n.min && (n.max === null || s <= n.max)) || NIVELES[0];
    }
    function getProgreso(score) {
      const s = score || 0;
      const idx = NIVELES.findIndex(n => s >= n.min && (n.max === null || s <= n.max));
      const nivel = NIVELES[idx];
      const next = NIVELES[idx + 1];
      if (!next) return { pct: 100, falta: 0, next: null };
      const rango = next.min - nivel.min;
      const avance = s - nivel.min;
      return { pct: Math.min(100, Math.round((avance / rango) * 100)), falta: next.min - s, next: next.nombre };
    }

    // ── UTILS ──────────────────────────────────────────────────────
    const getToken = () => localStorage.getItem('inf_token');
    const setToken = (t) => localStorage.setItem('inf_token', t);
    const clearToken = () => localStorage.removeItem('inf_token');

    async function apiFetch(path, opts = {}) {
      const token = getToken();
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const res = await fetch(path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      return data;
    }

    const fmt = (n) => n != null ? Number(n).toLocaleString('es-CO') : '—';
    const fmtCOP = (n) => n != null ? `$${Number(n).toLocaleString('es-CO')}` : '—';
    const fmtDate = (s) => s ? new Date(s).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

    // ── LANDING ────────────────────────────────────────────────────
    function LandingPage({ onLogin, tallyRegistro }) {
      return (
        <div className="landing">
          <div className="landing-logo">🧙‍♀️</div>
          <h1>Programa Creadoras</h1>
          <p>Brujería Capilar — Tu espacio para ver tu avance, tus contenidos y tus ventas.</p>
          <div className="landing-btns">
            {tallyRegistro && (
              <a href={tallyRegistro} target="_blank" rel="noopener noreferrer">
                <button className="btn btn-outline">Registrarme</button>
              </a>
            )}
            <button className="btn btn-primary" style={{width:'auto',padding:'12px 28px',fontSize:'15px'}} onClick={onLogin}>
              Iniciar Sesión
            </button>
          </div>
        </div>
      );
    }

    // ── LOGIN ──────────────────────────────────────────────────────
    function LoginPage({ onSuccess, onBack }) {
      const [step, setStep] = useState('email'); // email | set-password | login
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [password2, setPassword2] = useState('');
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState('');

      async function handleEmail(e) {
        e.preventDefault();
        if (!email) return;
        setLoading(true); setError('');
        try {
          const data = await apiFetch('/api/auth/check-email', {
            method: 'POST',
            body: JSON.stringify({ email }),
          });
          setStep(data.hasPassword ? 'login' : 'set-password');
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }

      async function handleSetPassword(e) {
        e.preventDefault();
        if (password !== password2) { setError('Las contraseñas no coinciden'); return; }
        if (password.length < 6) { setError('Mínimo 6 caracteres'); return; }
        setLoading(true); setError('');
        try {
          const data = await apiFetch('/api/auth/set-password', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          setToken(data.token);
          onSuccess(data.nombre);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }

      async function handleLogin(e) {
        e.preventDefault();
        setLoading(true); setError('');
        try {
          const data = await apiFetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          });
          setToken(data.token);
          onSuccess(data.nombre);
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }

      return (
        <div className="login-wrap">
          <div className="login-card">
            <h2>🧙‍♀️ Iniciar Sesión</h2>
            <p className="subtitle">
              {step === 'email' && 'Ingresa tu email de registro'}
              {step === 'set-password' && 'Crea tu contraseña (primera vez)'}
              {step === 'login' && 'Ingresa tu contraseña'}
            </p>
            {error && <div className="alert-error">{error}</div>}

            {step === 'email' && (
              <form onSubmit={handleEmail}>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required />
                </div>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Verificando...' : 'Continuar →'}
                </button>
                <div className="divider">
                  <button type="button" onClick={onBack}>← Volver</button>
                </div>
              </form>
            )}

            {step === 'set-password' && (
              <form onSubmit={handleSetPassword}>
                <div className="field">
                  <label>Crear Contraseña</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" required />
                </div>
                <div className="field">
                  <label>Confirmar Contraseña</label>
                  <input type="password" value={password2} onChange={e => setPassword2(e.target.value)} placeholder="Repite la contraseña" required />
                </div>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Guardando...' : 'Crear Contraseña y Entrar'}
                </button>
                <div className="divider">
                  <button type="button" onClick={() => setStep('email')}>← Cambiar email</button>
                </div>
              </form>
            )}

            {step === 'login' && (
              <form onSubmit={handleLogin}>
                <div className="field">
                  <label>Contraseña</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Tu contraseña" required autoFocus />
                </div>
                <button className="btn btn-primary" type="submit" disabled={loading}>
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
                <div className="divider">
                  <button type="button" onClick={() => setStep('email')}>← Cambiar email</button>
                </div>
              </form>
            )}
          </div>
        </div>
      );
    }

    // ── DASHBOARD ──────────────────────────────────────────────────
    function Dashboard({ nombre, onLogout, tallyContenido }) {
      const [data, setData] = useState(null);
      const [ventas, setVentas] = useState(null);
      const [loading, setLoading] = useState(true);
      const [error, setError] = useState('');

      useEffect(() => {
        Promise.all([
          apiFetch('/api/influencer/me'),
          apiFetch('/api/influencer/ventas').catch(() => null),
        ]).then(([me, v]) => {
          setData(me);
          setVentas(v);
        }).catch(e => {
          if (e.message.includes('401') || e.message.toLowerCase().includes('autorizado') || e.message.toLowerCase().includes('token')) {
            clearToken(); onLogout();
          } else {
            setError(e.message);
          }
        }).finally(() => setLoading(false));
      }, []);

      if (loading) return <><TopBar nombre={nombre} onLogout={onLogout} /><div className="loading">Cargando tu perfil...</div></>;
      if (error) return <><TopBar nombre={nombre} onLogout={onLogout} /><div className="dash"><div className="alert-error">{error}</div></div></>;

      const inf = data;
      const contenidos = data.contenidos || [];
      const scoreAcum = contenidos.reduce((s, c) => s + (c.score_contenido || 0), 0);
      const nivel = getNivel(scoreAcum);
      const progreso = getProgreso(scoreAcum);
      const tierMap = { 'Nano': 'nano', 'Micro': 'micro', 'Macro': 'macro' };

      return (
        <>
          <TopBar nombre={inf.nombre} onLogout={onLogout} />
          <div className="dash">
            <h1>Hola, {inf.nombre?.split(' ')[0]} 👋</h1>
            <p className="sub">Bienvenida a tu portal del Programa Creadoras</p>

            {/* CTA SUBIR CONTENIDO */}
            {inf.status === 'Producto Enviado' && (
              <div className="cta-subir">
                <h3>¡Ya tienes tu kit! Sube tu contenido</h3>
                <p>Comparte tu reseña y gana puntos para subir de nivel bruja.</p>
                <a href={tallyContenido || 'https://tally.so/r/rjEZdo'} target="_blank" rel="noopener noreferrer">
                  Subir Contenido →
                </a>
              </div>
            )}

            {/* STATS RÁPIDAS */}
            <div className="cards-grid">
              <div className="mini-card">
                <div className="label">Score Acumulado</div>
                <div className="value purple">{scoreAcum.toFixed(1)}</div>
              </div>
              <div className="mini-card">
                <div className="label">Contenidos Subidos</div>
                <div className="value">{contenidos.length}</div>
              </div>
              <div className="mini-card">
                <div className="label">Ventas Atribuidas</div>
                <div className="value green">{ventas ? fmtCOP(ventas.ventasAtribuidas) : '—'}</div>
              </div>
            </div>

            {/* NIVEL BRUJA */}
            <div className="nivel-section">
              <h3>Tu Nivel Bruja</h3>
              <div className="nivel-name">
                <span className={`badge badge-${nivel.badge}`}>{nivel.nombre}</span>
              </div>
              <div className="nivel-score" style={{marginTop:8}}>Score acumulado: <strong>{scoreAcum.toFixed(1)} pts</strong></div>
              <div className="progress-bar-bg">
                <div className="progress-bar-fill" style={{ width: `${progreso.pct}%` }} />
              </div>
              {progreso.next ? (
                <div className="progress-label">
                  Faltan <strong>{progreso.falta} pts</strong> para llegar a <strong>{progreso.next}</strong>
                </div>
              ) : (
                <div className="progress-label">¡Eres <strong>Gran Bruja</strong>! Nivel máximo alcanzado 🌟</div>
              )}
            </div>

            {/* PERFIL */}
            <div className="profile-card">
              <div>
                <h3>Tu Perfil</h3>
                <div className="info-row"><span className="info-label">Instagram</span><span className="info-val">@{inf.instagram_handle || '—'}</span></div>
                <div className="info-row"><span className="info-label">Tier</span><span className="info-val"><span className={`badge badge-${tierMap[inf.tier] || 'nano'}`}>{inf.tier || '—'}</span></span></div>
                <div className="info-row"><span className="info-label">Kit recibido</span><span className="info-val">{inf.kit_asignado || '—'}</span></div>
                <div className="info-row"><span className="info-label">Fecha envío</span><span className="info-val">{fmtDate(inf.fecha_envio)}</span></div>
              </div>
              <div>
                <h3>Tu Código de Descuento</h3>
                {inf.codigo_descuento ? (
                  <>
                    <div style={{fontSize:24,fontWeight:800,color:'var(--purple-light)',margin:'12px 0',letterSpacing:2}}>{inf.codigo_descuento}</div>
                    <div className="info-row"><span className="info-label">Ventas generadas</span><span className="info-val" style={{color:'var(--green)'}}>{ventas ? fmtCOP(ventas.ventasAtribuidas) : '—'}</span></div>
                    <div className="info-row"><span className="info-label">Órdenes</span><span className="info-val">{ventas ? fmt(ventas.ordenesAtribuidas) : '—'}</span></div>
                  </>
                ) : (
                  <div style={{color:'var(--text-muted)',fontSize:13,marginTop:12}}>
                    Tu código de descuento se asignará pronto. ¡Mantente atenta!
                  </div>
                )}
                <div style={{marginTop:16}}>
                  <a href={tallyContenido || 'https://tally.so/r/rjEZdo'} target="_blank" rel="noopener noreferrer"
                     style={{display:'inline-block',background:'var(--purple)',color:'white',padding:'8px 20px',borderRadius:8,fontWeight:600,fontSize:13,textDecoration:'none'}}>
                    Subir Contenido
                  </a>
                </div>
              </div>
            </div>

            {/* HISTORIAL CONTENIDOS */}
            <div className="section-card">
              <div className="section-card-header">
                <h3>Mis Contenidos</h3>
                <span style={{fontSize:12,color:'var(--text-muted)'}}>{contenidos.length} piezas</span>
              </div>
              {contenidos.length === 0 ? (
                <div className="empty-state">Aún no has subido contenido. ¡Anímate!</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Score</th>
                      <th>Link</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contenidos.map(c => (
                      <tr key={c.id}>
                        <td className="td-muted">{fmtDate(c.fecha_submision)}</td>
                        <td>{c.tipo_contenido || '—'}</td>
                        <td>
                          {c.score_contenido != null ? (
                            <div className="score-bar">
                              <div className="score-bar-bg">
                                <div className="score-bar-fill" style={{width:`${Math.min(c.score_contenido,100)}%`}} />
                              </div>
                              <span className="score-num">{c.score_contenido.toFixed(1)}</span>
                            </div>
                          ) : <span className="td-muted">Pendiente</span>}
                        </td>
                        <td>
                          {c.url_contenido
                            ? <a href={c.url_contenido} target="_blank" rel="noopener noreferrer" style={{color:'var(--purple-light)'}}>Ver</a>
                            : '—'
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      );
    }

    function TopBar({ nombre, onLogout }) {
      return (
        <nav className="top-bar">
          <div className="brand">🧙‍♀️ Creadoras <span>Brujería Capilar</span></div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:13,color:'var(--text-muted)'}}>{nombre}</span>
            <button className="logout" onClick={onLogout}>Salir</button>
          </div>
        </nav>
      );
    }

    // ── APP ────────────────────────────────────────────────────────
    function App() {
      const [view, setView] = useState(getToken() ? 'dashboard' : 'landing');
      const [nombre, setNombre] = useState('');
      const [tallyContenido, setTallyContenido] = useState('');
      const [tallyRegistro, setTallyRegistro] = useState('');

      useEffect(() => {
        fetch('/api/influencer/tally-urls')
          .then(r => r.json())
          .then(d => { setTallyContenido(d.contenido || ''); setTallyRegistro(d.registro || ''); })
          .catch(() => {});
      }, []);

      function onLoginSuccess(n) {
        setNombre(n);
        setView('dashboard');
      }

      function onLogout() {
        clearToken();
        setView('landing');
        setNombre('');
      }

      if (view === 'landing') return <LandingPage onLogin={() => setView('login')} tallyRegistro={tallyRegistro} />;
      if (view === 'login') return <LoginPage onSuccess={onLoginSuccess} onBack={() => setView('landing')} />;
      return <Dashboard nombre={nombre} onLogout={onLogout} tallyContenido={tallyContenido} />;
    }

    ReactDOM.createRoot(document.getElementById('root')).render(<App />);
  </script>
</body>
</html>
```

**Files affected:** `apps/creadoras/public/influencer.html` (crear nuevo)

---

### Step 7: Verificar el endpoint `shopify.getVentas` sin fechas

El endpoint `/api/influencer/ventas` llama `shopify.getVentas(null, null, codigo)`. Verificar que `shopify.js` maneja `desde=null` y `hasta=null` correctamente — si filtra por fecha, no debería requerir fechas cuando se busca por código.

Leer `apps/creadoras/shopify.js` y ajustar `getVentas` si es necesario para que cuando `desde` y `hasta` sean null, no aplique filtro de fechas.

**Files affected:** `apps/creadoras/shopify.js` (posiblemente)

---

### Step 8: Instalar dependencias localmente y en Railway

**Localmente:**
```bash
cd apps/creadoras
npm install
```

**En Railway:** agregar variable de entorno `JWT_SECRET` con un valor secreto aleatorio (ej: una cadena de 32+ caracteres).

**Files affected:** `apps/creadoras/package.json`, `apps/creadoras/node_modules/`

---

### Step 9: Commit y push a GitHub

```bash
git add apps/creadoras/package.json apps/creadoras/public/influencer.html apps/creadoras/index.js apps/creadoras/supabase.js apps/creadoras/config.js
git commit -m "Add influencer portal with auth"
git push
```

Railway desplegará automáticamente.

---

### Step 10: Actualizar CLAUDE.md

Agregar en la sección "Vistas" de la App de Gestión Creadoras:

| Vista | Función |
|---|---|
| Portal Influencer (`/influencer`) | Landing, login (email+contraseña), dashboard personal con nivel bruja, contenidos y ventas |

---

## Connections & Dependencies

### Files That Reference This Area

- `apps/creadoras/index.js` — agrega endpoints nuevos
- `apps/creadoras/supabase.js` — agrega funciones de auth
- `CLAUDE.md` — documenta la nueva vista

### Updates Needed for Consistency

- Agregar `JWT_SECRET` en Railway variables
- Ejecutar SQL en Supabase para agregar columna `password_hash`

### Impact on Existing Workflows

Ningún impacto en la vista admin. Los nuevos endpoints `/api/auth/*` y `/api/influencer/*` son completamente separados de los endpoints admin existentes.

---

## Validation Checklist

- [ ] Columna `password_hash` existe en Supabase tabla `influencers`
- [ ] `bcrypt` y `jsonwebtoken` instalados (`npm install` en apps/creadoras)
- [ ] `JWT_SECRET` agregado en Railway variables
- [ ] `GET /influencer` sirve `influencer.html`
- [ ] `POST /api/auth/check-email` retorna `{exists, hasPassword}` correctamente
- [ ] Primera vez: `set-password` guarda hash y retorna token
- [ ] Login: verifica contraseña y retorna token
- [ ] `GET /api/influencer/me` retorna datos del influencer con JWT válido
- [ ] Dashboard muestra nombre, nivel, progreso, contenidos, código y ventas
- [ ] Botón "Subir Contenido" abre Tally correctamente
- [ ] Botón "Registrarme" en landing aparece si hay URL configurada
- [ ] Logout limpia token y regresa a landing

---

## Success Criteria

1. Una influencer puede ir a `/influencer`, ingresar su email, crear contraseña y ver su dashboard
2. En el dashboard ve su nivel bruja actual, barra de progreso, historial de contenidos y ventas del código
3. El portal es completamente independiente de la vista admin — no rompe nada existente

---

## Notes

- El score acumulado se calcula sumando todos los `score_contenido` de la tabla `contenidos` para esa influencer. No requiere columna `score_acumulado` en `influencers`.
- `JWT_SECRET` debe ser un string secreto y aleatorio. En local puede ser cualquier string. En Railway debe ser uno fijo (no regenerar en cada deploy).
- Si una influencer olvida su contraseña, por ahora el equipo admin puede limpiar `password_hash` en Supabase directamente. Un flujo de recuperación puede agregarse en el futuro.
- El botón "Registrarme" solo aparece si `TALLY_REGISTRO_URL` está configurada en Railway (o localmente).
