# Plan: Marketplace de Creadoras (CreadoresApp) — Fase 1

**Created:** 2026-08-20
**Status:** Draft
**Request:** Construir CreadoresApp como app nueva `apps/marketplace/` dentro del repo appinfluenciadoras — misma DB Supabase, deploy Railway propio en creadoresapp.com. Fase 1 Colombia: catálogo con identidad oculta (sin marca de agua), acceso de marcas por invitación, flujo de oferta/aceptación, escrow con registro manual de pagos (sin pasarela), panel admin de tratos y comisiones. Cuentas separadas de las de Brujería Capilar. Comisión 20% configurable, flag `es_bruja_embajadora` = 0%.

---

## Overview

### What This Plan Accomplishes

Convierte el banco de Brujas Embajadoras que ya existe en `appinfluenciadoras` en el inventario inicial de un marketplace de dos lados: marcas de belleza colombianas contratan colaboraciones pagas con creadoras cuya identidad permanece oculta hasta que el dinero está retenido, y la plataforma cobra 20% por cada trato cerrado. Al terminar la Fase 1 existe un producto operable de punta a punta — catálogo, oferta, aceptación, escrow manual, liberación de pago y reporte de comisiones — corriendo bajo su propia marca y su propio dominio.

### Why This Matters

Brujería Capilar ya invirtió en reclutar, calificar y fidelizar creadoras: hay perfiles con seguidores, contenidos entregados, scores y niveles de Magia. Hoy ese activo solo sirve para hacer gifting de la propia marca. El marketplace lo convierte en un negocio con ingreso recurrente propio (comisión) que no depende de vender más shampoo, y que se apalanca en un activo que ya está pago. La barrera de entrada del producto es precisamente lo que Brujería ya tiene y una plataforma nueva no: creadoras reales, con historial verificable de entregas.

---

## Current State

### Relevant Existing Structure

| Ruta | Qué es |
|---|---|
| `apps/creadoras/index.js` (2.620 líneas) | App Express del Programa Creadoras: admin, portal influencer, webhooks Tally, cron de seguimiento, UGC |
| `apps/creadoras/supabase.js` (389 líneas) | Capa de acceso a Supabase vía REST API (`supabaseGet/Post/Patch`), sin ORM |
| `apps/creadoras/config.js` | Config centralizada: env vars en producción, JSON local en desarrollo, con validación que aborta el arranque si faltan secretos |
| `apps/creadoras/acuerdo.js` | Texto legal del acuerdo de colaboración como módulo JS con placeholders — patrón a replicar para los términos del marketplace |
| `apps/creadoras/public/*.html` | Frontend React 18 por CDN + Babel standalone, sin build step. `index.html` son 3.044 líneas |
| `apps/creadoras/migrations/*.sql` | Migraciones SQL que se corren a mano en el SQL Editor de Supabase |
| `railway.json` (raíz) | Servicio único: `NIXPACKS` + `npm start` → `node apps/creadoras/index.js` |
| Tabla `influencers` (Supabase) | `nombre, email, telefono, instagram_handle, tiktok_handle, seguidores_instagram, seguidores_tiktok, ciudad, departamento, direccion_envio, tipo_cabello, tier, status, nivel_bruja, score_total, password_hash, codigo_descuento, codigo_ugc, ugc_activa, acuerdo_firmado, notas_equipo, ...` |
| Tablas `contenidos`, `ugc_ventas`, `ugc_pagos`, `ugc_regalos`, `ugc_acuerdos` | Historial de piezas entregadas con score, y el precedente de "registrar un pago manualmente desde admin" |

Patrones establecidos que este plan respeta:

- Auth admin por **Basic Auth** con lista blanca de rutas públicas (`RUTAS_PUBLICAS` + `adminAuth`).
- Auth de usuaria final por **JWT Bearer** (`authMiddleware`) con password hasheada en bcrypt.
- **Rate limit en memoria** sin dependencias (`rateLimit({windowMs, max})`) sobre endpoints públicos de escritura.
- Migraciones SQL numeradas, idempotentes (`IF NOT EXISTS`), corridas a mano en Supabase.
- Sin build step en el frontend.

### Gaps or Problems Being Addressed

1. **No hay concepto de "marca cliente"**: el sistema actual solo conoce creadoras y a Brujería como única contraparte.
2. **No hay identidad oculta**: hoy todo el modelo de datos expone `instagram_handle` sin restricción; el catálogo del marketplace exige lo contrario.
3. **No hay dinero entre terceros**: el módulo UGC paga comisiones de Brujería a creadoras, pero no existe la figura de un tercero que paga y un valor retenido en custodia.
4. **No hay separación de marca**: el frontend actual es morado/místico de Brujería Capilar; CreadoresApp debe leerse como producto B2B independiente.
5. **`influencers` no tiene los campos del catálogo**: falta nicho, engagement y nivel de tarifa. El nicho **no existe en ningún lado** y no se puede derivar — requiere curaduría manual.

---

## Proposed Changes

### Summary of Changes

- Nueva app Express independiente en `apps/marketplace/`, con su propio `package.json`, su propio JWT secret y su propio admin Basic Auth.
- Segundo servicio en Railway (Root Directory = `apps/marketplace`) apuntando a creadoresapp.com. El servicio actual queda intacto.
- 8 tablas nuevas en la **misma** base Supabase, todas con prefijo `mk_`, sin tocar el esquema existente salvo lectura.
- Motor de comisión configurable en base de datos (no en código), con los porcentajes **congelados dentro de cada trato** al momento de crearlo.
- Máquina de estados del trato con transiciones validadas e historial completo de eventos.
- Contacto revelado solo cuando el pago de la marca está registrado como retenido.
- Contenido de muestra re-alojado en Supabase Storage con nombre aleatorio y servido por proxy, sin marca de agua en esta fase.
- Panel admin propio: tratos por estado, comisiones acumuladas, registro de pagos entrantes y salientes, curaduría del catálogo, export CSV para contabilidad.
- Frontend React CDN (mismo patrón, sin build) pero **un archivo por pantalla**, con tokens CSS del sistema visual brutalista Y2K entregado en el handoff de diseño.
- Landing pública portada fielmente del handoff `design_handoff_creadores_app_landing`, servida en la raíz del dominio.
- Pruebas automatizadas (`node:test`) sobre el motor de comisión y la máquina de estados.

### New Files to Create

| File Path | Purpose |
|---|---|
| `apps/marketplace/package.json` | Dependencias propias (express, cors, bcrypt, jsonwebtoken, node-fetch, nodemailer) y `start` |
| `apps/marketplace/railway.json` | Config de deploy del segundo servicio Railway |
| `apps/marketplace/config.js` | Env vars del marketplace con validación de arranque (secretos propios, distintos a los de Brujería) |
| `apps/marketplace/index.js` | Servidor Express: monta middlewares, routers y estáticos. Debe quedar delgado (< 200 líneas) |
| `apps/marketplace/db.js` | Capa Supabase REST reutilizando el patrón de `apps/creadoras/supabase.js`, con helpers genéricos |
| `apps/marketplace/auth.js` | Middlewares: `adminAuth` (Basic), `marcaAuth` y `creadoraAuth` (JWT con audiencia distinta), `rateLimit` |
| `apps/marketplace/comisiones.js` | Motor de cálculo de comisión y tarifas sugeridas. Función pura, sin I/O |
| `apps/marketplace/tratos.js` | Máquina de estados del trato: transiciones válidas, quién puede ejecutarlas, efectos secundarios |
| `apps/marketplace/catalogo.js` | Router `/api/catalogo/*` — listado y detalle con identidad oculta garantizada en la capa de datos |
| `apps/marketplace/marcas.js` | Router `/api/marcas/*` — registro por invitación, login, perfil, aceptación de términos |
| `apps/marketplace/creadoras.js` | Router `/api/creadoras/*` — login, perfil, tratos recibidos, aceptar/rechazar, entregar |
| `apps/marketplace/admin.js` | Router `/api/admin/*` — tratos, pagos, curaduría de catálogo, config, export |
| `apps/marketplace/media.js` | Proxy de muestras: `/media/:muestra_id` sirve el binario desde Supabase Storage sin exponer la ruta real |
| `apps/marketplace/notificaciones.js` | Envío de emails transaccionales del marketplace (remitente propio, no el de Brujería) |
| `apps/marketplace/terminos.js` | Texto de términos y condiciones con cláusula de no-circunvalación, versionado. Patrón de `acuerdo.js` |
| `apps/marketplace/migrations/mk_001_init.sql` | Crea las 8 tablas `mk_*` + índices |
| `apps/marketplace/migrations/mk_002_seed_config.sql` | Semillas de `mk_config`: comisiones, niveles de tarifa, plazo de no-circunvalación |
| `apps/marketplace/scripts/importar_creadoras.js` | Importa Brujas Embajadoras elegibles a `mk_creadoras` como borradores no visibles |
| `apps/marketplace/public/css/tokens.css` | Sistema visual Creadores.app: negro/lima/magenta/azul, Martian Mono + Space Mono, radio 0 |
| `apps/marketplace/public/index.html` | Landing pública portada del handoff de diseño |
| `apps/marketplace/public/catalogo.html` | Pantallas 1 y 2: tarjeta de creadora + catálogo con filtros |
| `apps/marketplace/public/registro.html` | Pantalla 4: registro/onboarding de marca + aceptación de términos |
| `apps/marketplace/public/trato.html` | Pantalla 6: línea de tiempo del trato (vista marca) |
| `apps/marketplace/public/creadora.html` | Pantalla 5: portal de la creadora, mobile-first |
| `apps/marketplace/public/admin.html` | Panel admin (Módulo 5) |
| `apps/marketplace/test/comisiones.test.js` | Pruebas del motor de comisión, incluido el caso bruja embajadora |
| `apps/marketplace/test/tratos.test.js` | Pruebas de la máquina de estados y de las reglas de revelación de contacto |
| `apps/marketplace/README.md` | Setup, env vars, cómo correr local, cómo aplicar migraciones |

### Files to Modify

| File Path | Changes |
|---|---|
| `CLAUDE.md` (appinfluenciadoras) | Nueva sección "Marketplace de Creadoras (CreadoresApp)" + `apps/marketplace/` en Workspace Structure |
| `package.json` (raíz) | Agregar script `start:marketplace` como alternativa por si Railway no usa Root Directory |
| `.gitignore` | Ignorar `apps/marketplace/node_modules/` y `apps/marketplace/.env` |
| `README.md` (appinfluenciadoras) | Mencionar que el repo aloja dos apps desplegadas por separado |

### Files to Delete (if any)

Ninguno. Este plan es puramente aditivo — no toca el código del Programa Creadoras.

---

## Design Decisions

### Key Decisions Made

1. **App separada, base de datos compartida.** `apps/marketplace/` no importa nada de `apps/creadoras/`. Comparten la instancia de Supabase (para no migrar creadoras ni duplicar su historial) pero ni una línea de código. Razón: CreadoresApp es marca independiente con usuarios externos; meterlo en un `index.js` de 2.620 líneas cuyo admin es Basic Auth de Brujería mezcla dos productos con audiencias, identidades y riesgos distintos. Si mañana CreadoresApp se separa como sociedad propia, se saca el directorio completo.

2. **Cuentas propias, tanto de marca como de creadora.** Tabla `mk_creadoras` con su propio `email` y `password_hash`, y un `influencer_id` **opcional** que apunta a la creadora de Brujería cuando viene de ahí. Razón: además de la instrucción explícita de la usuaria, esto permite que el marketplace incorpore creadoras que nunca fueron Brujas Embajadoras — que es a dónde va el negocio. El JWT del marketplace usa un secreto distinto (`MK_JWT_SECRET`), de modo que un token de un sistema jamás vale en el otro.

3. **El handle no vive en la tabla del catálogo.** `mk_creadoras` guarda `nombre_publico` (alias), nunca `instagram_handle`. El handle se lee de `influencers` únicamente en dos lugares: el panel admin y el endpoint de revelación de contacto. Razón: es un control estructural, no una regla de presentación. Si un endpoint del catálogo tuviera un bug de `select: '*'`, no habría nada sensible que filtrar. Es la defensa más barata y más fuerte del modelo de negocio.

4. **Muestras re-alojadas en Supabase Storage con nombre aleatorio, servidas por proxy.** Nunca se sirve la URL del CDN de Instagram/TikTok: esas URLs contienen identificadores que permiten llegar al perfil. `/media/:id` valida la sesión, resuelve el `storage_path` y hace stream del binario con `Content-Disposition: inline`. Razón: sin marca de agua, el proxy es lo único que separa "ver la pieza" de "identificar a la creadora". La arquitectura queda lista para insertar el watermark después sin tocar el frontend — solo el pipeline de subida.

5. **Los porcentajes de comisión se congelan dentro del trato.** `mk_config` define los vigentes, pero al crear un trato se copian a `mk_tratos.comision_marca_pct` / `comision_creadora_pct` y todos los valores se derivan de esa copia. Razón: si dentro de seis meses se sube la comisión al 25%, los tratos ya cerrados no pueden cambiar de valor retroactivamente — eso corrompería la contabilidad y sería indefendible ante una marca.

6. **El contacto se revela cuando el pago está retenido, no al aceptar.** El estado `aceptado` calcula el total y muestra "pendiente de pago"; el estado `pago_retenido` (que solo puede marcar el admin al confirmar la transferencia) dispara `contacto_revelado_at` y abre los datos de contacto para ambos lados. Razón: la sección de modelo de negocio de la spec lo fija así ("Revelar contacto solo al aceptar el trato, una vez el pago de la marca queda retenido") y es lo único que hace exigible la cláusula de no-circunvalación. La spec del Módulo 3 sugiere revelarlo al aceptar; se resuelve la contradicción a favor del modelo de negocio, y se deja `revelar_contacto_en` en `mk_config` para poder cambiarlo sin desplegar.

7. **Sin marca de agua en esta fase, por decisión explícita.** Se acepta que una búsqueda inversa de imagen puede identificar a una creadora a partir de una pieza publicada. Se mitiga parcialmente sirviendo por proxy y sin handle. La tabla `mk_muestras` ya incluye `storage_path` separado del original para que agregar el watermark después sea un cambio de un solo módulo.

8. **Escrow como estado contable, no como cuenta bancaria.** No hay integración de pagos. `mk_pagos` registra movimientos con dirección (`entrada` = marca→plataforma, `salida` = plataforma→creadora), método y referencia. El "dinero retenido" es la suma de entradas de tratos que aún no tienen salida. Razón: con pilotos de bajo volumen, un registro manual bien auditado vale lo mismo que una integración y cuesta una fracción.

9. **Un archivo HTML por pantalla, no un monolito.** Se mantiene React por CDN sin build (patrón del repo, cero fricción de despliegue), pero cada pantalla es su propio archivo con `tokens.css` compartido. Razón: `index.html` con 3.044 líneas es la lección aprendida; y los mockups van a llegar por pantalla, así que la estructura del código debe corresponder uno a uno con la entrega del diseño.

10. **Pruebas solo donde hay dinero.** `node:test` sobre `comisiones.js` y `tratos.js`. No se testea el CRUD. Razón: un error de redondeo en la comisión o una transición de estado inválida que libere un pago son los dos únicos bugs de este sistema que cuestan plata real.

11. **La identidad visual es la del handoff de diseño, no la de la spec inicial.** La spec de arranque pedía índigo profundo + Inter + fondo blanco (tono B2B sobrio). El diseño entregado en Claude Design es lo contrario: **brutalismo digital / Y2K editorial** — negro `#0E0E0E`, lima `#D6FF00`, magenta `#FF2E9A`, azul `#2323F0`, dos monoespaciadas (Martian Mono + Space Mono), `border-radius: 0` sin excepción, sin sombras, sin gradientes, bordes duros de 2px. Manda el handoff: es la decisión más reciente y viene resuelta a alta fidelidad con valores exactos. Todas las pantallas del producto se construyen sobre ese sistema.

12. **La marca se escribe `CREADORES.APP`.** El handoff usa ese lockup en logo, header y footer. Se adopta en toda la interfaz y en el remitente de los correos. El dominio natural es `creadores.app`.

13. **La landing pública es parte de la Fase 1.** El handoff entregó la landing completa (10 bloques) antes que las 6 pantallas de producto, así que se porta primero y se sirve como raíz del sitio. Sus CTAs (`SOY MARCA`, `SOY CREADORA`) enlazan a los flujos de registro reales. Los datos que la landing muestra como fijos (métricas del hero, 8 tarjetas del banco) se sirven desde el backend vía `GET /api/landing`, no hardcodeados, para que dejen de mentir en cuanto haya datos reales.

### Alternatives Considered

- **Extender `apps/creadoras/index.js` directamente** (lectura literal de la spec). Rechazado: acopla el producto externo al interno, obliga a compartir el admin Basic Auth de Brujería, y hace que un despliegue del marketplace pueda tumbar el pipeline de gifting.
- **Repo nuevo separado.** Rechazado por ahora: duplicaría el acceso a Supabase y partiría el contexto de trabajo en dos, sin beneficio real mientras el equipo sea el mismo. La estructura elegida permite hacerlo después con un `git subtree split`.
- **Reutilizar la tabla `influencers` como catálogo directamente.** Rechazado: mezcla el estado del programa de gifting (`status: Producto Enviado`) con el estado comercial del marketplace, y pone el handle a un `select: '*'` de distancia del catálogo público.
- **Marca de agua desde el día uno.** Descartado por decisión de la usuaria para no frenar el arranque. Documentado como deuda técnica consciente en Notas.
- **Wompi/ePayco en Fase 1.** Descartado por decisión de la usuaria; además el punto pendiente con la contadora (quién factura el 100%) debe resolverse antes de mover volumen.

### Open Questions

Ninguna de estas bloquea el arranque de la implementación; se necesitan antes de los pasos indicados.

1. **Nicho de cada creadora** (bloquea el Paso 12, curaduría). El dato no existe en `influencers` y no es derivable. Propuesta: partir de una lista cerrada (`rizos`, `cuidado capilar`, `maquillaje`, `skincare`, `lifestyle`, `maternidad`, `fitness`, `moda`) y que el admin la asigne al revisar cada perfil. ¿Se aprueba esa lista o hay otra taxonomía preferida?
2. **Rangos de alcance a mostrar** (bloquea el Paso 12). Propuesta: `1K–10K`, `10K–50K`, `50K–100K`, `100K+`. Mostrar rango en vez de número exacto también dificulta identificar a la creadora.
3. **Niveles de tarifa sugerida en COP** (bloquea el Paso 4, semillas). Hacen falta valores iniciales para `inicial` / `medio` / `top`. Son configurables después, pero la primera semilla necesita números.
4. ~~Dominio~~ **Resuelto**: el DNS aún no está comprado. Todo corre sobre la URL `.up.railway.app` hasta que se adquiera. El handoff de diseño usa `CREADORES.APP` como marca, así que el dominio a comprar es **creadores.app** (o `creadoresapp.com` como alterno). El paso de despliegue omite la configuración de dominio.
5. **Email remitente del marketplace**: se necesita una cuenta distinta a `brujeriapro@gmail.com` para que los correos no lleguen firmados por Brujería. Bloquea el Paso 17.
6. **Plazo de no-circunvalación**: la spec dice "6-12 meses". Propuesta: 12 meses. Bloquea el Paso 16 (texto legal).

---

## Step-by-Step Tasks

### Fase A — Backend y datos (no depende de los mockups)

### Step 1: Crear el esqueleto de la app

Crear el directorio y la configuración base del servicio, sin lógica de negocio todavía.

**Actions:**

- Crear `apps/marketplace/package.json` con `name: "creadoresapp"`, `start: "node index.js"`, `test: "node --test test/"` y dependencias: `express@^4.18.2`, `cors@^2.8.5`, `bcrypt@^5.1.1`, `jsonwebtoken@^9.0.2`, `node-fetch@^2.7.0`, `nodemailer@^6.9.9`.
- Crear `apps/marketplace/railway.json` copiando la forma del de la raíz (`NIXPACKS`, `startCommand: "npm start"`, `restartPolicyType: "ON_FAILURE"`).
- Crear `apps/marketplace/config.js` siguiendo el patrón de `apps/creadoras/config.js`: lee solo de `process.env` (sin fallback a JSON local, porque este servicio nace en producción), y **aborta el arranque** si falta `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MK_JWT_SECRET` o `MK_ADMIN_PASS`.
- Agregar a `.gitignore`: `apps/marketplace/node_modules/` y `apps/marketplace/.env`.
- Agregar `"start:marketplace": "node apps/marketplace/index.js"` al `package.json` de la raíz.

**Files affected:**

- `apps/marketplace/package.json`, `apps/marketplace/railway.json`, `apps/marketplace/config.js`, `.gitignore`, `package.json`

---

### Step 2: Escribir la migración del esquema

Crear las 8 tablas del marketplace. Todas con prefijo `mk_` para convivir sin ambigüedad con las tablas del programa de gifting en la misma base.

**Actions:**

- Crear `apps/marketplace/migrations/mk_001_init.sql`, idempotente (`CREATE TABLE IF NOT EXISTS`), con:

  - **`mk_config`** — `clave TEXT PRIMARY KEY`, `valor JSONB NOT NULL`, `descripcion TEXT`, `updated_at TIMESTAMPTZ DEFAULT now()`.

  - **`mk_marcas`** — `id UUID PK DEFAULT gen_random_uuid()`, `nombre_empresa TEXT NOT NULL`, `nombre_contacto TEXT NOT NULL`, `email TEXT UNIQUE NOT NULL`, `password_hash TEXT`, `whatsapp TEXT`, `nit TEXT`, `ciudad TEXT`, `estado TEXT DEFAULT 'activa'` (`activa` | `suspendida`), `codigo_invitacion TEXT`, `terminos_version TEXT`, `terminos_aceptados_at TIMESTAMPTZ`, `terminos_ip TEXT`, `created_at`.

  - **`mk_creadoras`** — `id UUID PK`, `influencer_id UUID REFERENCES influencers(id) ON DELETE SET NULL`, `nombre_publico TEXT NOT NULL`, `email TEXT UNIQUE NOT NULL`, `password_hash TEXT`, `whatsapp TEXT`, `ciudad TEXT`, `nicho TEXT[]`, `alcance_total INTEGER`, `rango_alcance TEXT`, `engagement_pct NUMERIC(5,2)`, `nivel_tarifa TEXT`, `tarifa_min NUMERIC(12,2)`, `tarifa_max NUMERIC(12,2)`, `es_bruja_embajadora BOOLEAN DEFAULT false`, `visible BOOLEAN DEFAULT false`, `bio_corta TEXT`, `colaboraciones_completadas INTEGER DEFAULT 0`, `created_at`. **Sin columna de handle, a propósito.**

  - **`mk_muestras`** — `id UUID PK`, `creadora_id UUID REFERENCES mk_creadoras(id) ON DELETE CASCADE`, `tipo TEXT` (`imagen` | `video`), `storage_path TEXT NOT NULL`, `mime TEXT`, `orden SMALLINT DEFAULT 0`, `created_at`.

  - **`mk_tratos`** — `id UUID PK`, `codigo TEXT UNIQUE`, `marca_id UUID REFERENCES mk_marcas(id)`, `creadora_id UUID REFERENCES mk_creadoras(id)`, `estado TEXT NOT NULL DEFAULT 'solicitado'`, `brief TEXT NOT NULL`, `entregables TEXT`, `fecha_entrega_esperada DATE`, `monto_creadora NUMERIC(12,2) NOT NULL`, `comision_marca_pct NUMERIC(5,2) NOT NULL`, `comision_creadora_pct NUMERIC(5,2) NOT NULL`, `comision_marca_valor NUMERIC(12,2)`, `comision_creadora_valor NUMERIC(12,2)`, `comision_total_valor NUMERIC(12,2)`, `total_a_pagar_marca NUMERIC(12,2)`, `neto_a_recibir_creadora NUMERIC(12,2)`, `contacto_revelado_at TIMESTAMPTZ`, `fecha_solicitud`, `fecha_respuesta`, `fecha_pago_marca`, `fecha_entrega`, `fecha_aprobacion`, `fecha_pago_creadora`, `fecha_cierre`, `motivo_rechazo TEXT`, `motivo_cancelacion TEXT`, `created_at`, `updated_at`.

  - **`mk_trato_eventos`** — `id UUID PK`, `trato_id UUID REFERENCES mk_tratos(id) ON DELETE CASCADE`, `estado_anterior TEXT`, `estado_nuevo TEXT`, `actor TEXT` (`marca` | `creadora` | `admin` | `sistema`), `actor_id UUID`, `nota TEXT`, `created_at`.

  - **`mk_pagos`** — `id UUID PK`, `trato_id UUID REFERENCES mk_tratos(id)`, `direccion TEXT NOT NULL` (`entrada` | `salida`), `monto NUMERIC(12,2) NOT NULL`, `metodo TEXT`, `referencia TEXT`, `fecha DATE`, `registrado_por TEXT`, `notas TEXT`, `created_at`.

  - **`mk_entregas`** — `id UUID PK`, `trato_id UUID REFERENCES mk_tratos(id) ON DELETE CASCADE`, `url_contenido TEXT`, `notas_creadora TEXT`, `estado TEXT DEFAULT 'en_revision'` (`en_revision` | `aprobada` | `cambios_solicitados`), `feedback_marca TEXT`, `created_at`.

- Índices: `mk_tratos(marca_id)`, `mk_tratos(creadora_id)`, `mk_tratos(estado)`, `mk_trato_eventos(trato_id)`, `mk_pagos(trato_id)`, `mk_muestras(creadora_id)`, `mk_creadoras(visible)`.

**Files affected:**

- `apps/marketplace/migrations/mk_001_init.sql`

---

### Step 3: Crear la capa de acceso a datos

**Actions:**

- Crear `apps/marketplace/db.js` replicando el patrón de `apps/creadoras/supabase.js`: `BASE_URL` = `${SUPABASE_URL}/rest/v1`, headers con `apikey` + `Authorization` + `Prefer: return=representation`.
- Exponer helpers genéricos `get(tabla, params)`, `post(tabla, data)`, `patch(tabla, filtros, data)` y encima de ellos las funciones con nombre por dominio (`getCreadorasVisibles`, `getTratoById`, `insertTrato`, `insertEvento`, `getPagosDeTrato`, ...).
- **Regla explícita en el módulo**: las funciones que sirven al catálogo hacen `select` con lista de columnas enumerada, nunca `*`. Dejar el comentario que explique por qué.
- `getContactoCreadora(creadora_id)` — única función que hace el join hacia `influencers` para traer `instagram_handle`, `telefono` y `email`. Documentar que solo puede llamarse desde `admin.js` y desde el endpoint de trato con `contacto_revelado_at` no nulo.

**Files affected:**

- `apps/marketplace/db.js`

---

### Step 4: Semillas de configuración

**Actions:**

- Crear `apps/marketplace/migrations/mk_002_seed_config.sql` con `INSERT ... ON CONFLICT (clave) DO NOTHING`:
  - `comision_marca_pct` → `12`
  - `comision_creadora_pct` → `8`
  - `revelar_contacto_en` → `"pago_retenido"`
  - `plazo_no_circunvalacion_meses` → `12` (confirmar, Open Question 6)
  - `moneda` → `"COP"`
  - `niveles_tarifa` → JSON con `inicial` / `medio` / `top`, cada uno `{min, max}` (valores de la Open Question 3)
  - `rangos_alcance` → JSON con los cortes de la Open Question 2
  - `nichos` → JSON array con la taxonomía de la Open Question 1
- En `db.js`, agregar `getConfig()` con caché en memoria de 60 s e invalidación al escribir desde admin.

**Files affected:**

- `apps/marketplace/migrations/mk_002_seed_config.sql`, `apps/marketplace/db.js`

---

### Step 5: Motor de comisión

Función pura, sin acceso a base de datos, para que sea testeable y auditable de un vistazo.

**Actions:**

- Crear `apps/marketplace/comisiones.js` con `calcularTrato({ monto, comision_marca_pct, comision_creadora_pct, es_bruja_embajadora })` que devuelva:

  ```
  si es_bruja_embajadora → ambos pct pasan a 0
  comision_marca_valor    = redondear(monto * pct_marca / 100)
  comision_creadora_valor = redondear(monto * pct_creadora / 100)
  total_a_pagar_marca     = monto + comision_marca_valor
  neto_a_recibir_creadora = monto - comision_creadora_valor
  comision_total_valor    = comision_marca_valor + comision_creadora_valor
  ```

- Redondeo al peso entero (COP no usa decimales). Usar `Math.round` sobre el valor de la comisión, nunca sobre el total, para que `total = monto + comision` cierre exacto siempre.
- Exportar también `nivelTarifaPorAlcance(alcance, niveles)` y `rangoAlcance(alcance, rangos)`.

**Files affected:**

- `apps/marketplace/comisiones.js`

---

### Step 6: Máquina de estados del trato

**Actions:**

- Crear `apps/marketplace/tratos.js` con el grafo de transiciones como dato, no como `if`s dispersos:

  | Desde | Hacia | Quién puede |
  |---|---|---|
  | `solicitado` | `aceptado` | creadora |
  | `solicitado` | `rechazado` | creadora |
  | `solicitado` | `cancelado` | marca, admin |
  | `aceptado` | `pago_retenido` | admin |
  | `aceptado` | `cancelado` | marca, admin |
  | `pago_retenido` | `entregado` | creadora |
  | `pago_retenido` | `cancelado` | admin |
  | `entregado` | `aprobado` | marca, admin |
  | `entregado` | `pago_retenido` | marca (pide cambios: vuelve atrás) |
  | `aprobado` | `pagado` | admin |
  | `pagado` | `cerrado` | admin, sistema |

- `puedeTransicionar(estadoActual, estadoNuevo, actor)` → boolean. Cualquier transición fuera de la tabla se rechaza con 409, no con 500.
- `aplicarTransicion(trato, estadoNuevo, actor, datos)` — escribe el nuevo estado, sella la fecha correspondiente, inserta la fila en `mk_trato_eventos` y devuelve el trato actualizado. **Toda** escritura de estado pasa por aquí; ningún router modifica `estado` directamente.
- Efecto especial: al entrar a `pago_retenido`, si `mk_config.revelar_contacto_en === 'pago_retenido'`, sellar `contacto_revelado_at`. Si el valor de config es `'aceptado'`, sellarlo al entrar a `aceptado`.
- Guarda dura: pasar a `pagado` exige que exista al menos un `mk_pagos` con `direccion='salida'` para ese trato. Pasar a `pago_retenido` exige uno con `direccion='entrada'`.

**Files affected:**

- `apps/marketplace/tratos.js`

---

### Step 7: Autenticación y middlewares

**Actions:**

- Crear `apps/marketplace/auth.js` con:
  - `adminAuth` — Basic Auth contra `MK_ADMIN_USER` / `MK_ADMIN_PASS`, aplicado solo al router `/api/admin/*` y a `/admin.html` (a diferencia del app de Brujería, aquí **no** se aplica globalmente con lista blanca: se aplica por router, que es menos propenso a errores).
  - `firmarToken(sujeto, tipo)` — JWT con `MK_JWT_SECRET`, claim `tipo` = `marca` | `creadora`, expiración 30 días.
  - `marcaAuth` / `creadoraAuth` — verifican el Bearer y además que `payload.tipo` corresponda. Un token de creadora en una ruta de marca devuelve 401.
  - `rateLimit({windowMs, max})` — copiar la implementación en memoria de `apps/creadoras/index.js`.
- Aplicar `rateLimit({max: 5})` a login, registro y creación de solicitudes.

**Files affected:**

- `apps/marketplace/auth.js`

---

### Step 8: Router de catálogo

**Actions:**

- Crear `apps/marketplace/catalogo.js` con:
  - `GET /api/catalogo` (requiere `marcaAuth`) — lista de creadoras con `visible = true`. Filtros por query: `nicho`, `rango_alcance`, `nivel_tarifa`, `ciudad`. Devuelve por creadora: `id`, `nombre_publico`, `nicho`, `rango_alcance`, `engagement_pct`, `nivel_tarifa`, `tarifa_min`, `tarifa_max`, `bio_corta`, `colaboraciones_completadas`, y los `id` de sus muestras. **Nunca** `influencer_id`, ni ciudad exacta si se decide que también identifica.
  - `GET /api/catalogo/:id` — detalle, mismos campos.
  - `GET /api/catalogo/filtros` — valores disponibles para poblar los selectores, leídos de `mk_config`.
- El catálogo exige sesión de marca: no hay vista pública anónima en Fase 1.

**Files affected:**

- `apps/marketplace/catalogo.js`

---

### Step 9: Proxy de medios

**Actions:**

- Crear `apps/marketplace/media.js` con `GET /media/:muestra_id`:
  - Exige `marcaAuth` o `creadoraAuth` (token por header o por query `?t=` para poder usarlo en `<img src>`).
  - Resuelve `storage_path`, descarga de Supabase Storage con la service key y hace stream de la respuesta.
  - Headers: `Content-Type` desde `mime`, `Content-Disposition: inline`, `Cache-Control: private, max-age=300`, `X-Content-Type-Options: nosniff`.
  - Nunca devuelve ni redirige a la URL firmada de Storage.
- Crear el bucket `mk-muestras` en Supabase como **privado**.

**Files affected:**

- `apps/marketplace/media.js`

---

### Step 10: Router de marcas

**Actions:**

- Crear `apps/marketplace/marcas.js`:
  - `POST /api/marcas/registro` — recibe `nombre_empresa`, `nombre_contacto`, `email`, `whatsapp`, `password`, `codigo_invitacion`, `acepta_terminos`. Valida el código contra `MK_CODIGOS_INVITACION` (lista separada por comas en env). Rechaza si `acepta_terminos !== true`. Hashea con bcrypt(10). Sella `terminos_version`, `terminos_aceptados_at` y `terminos_ip` (de `x-forwarded-for`). Devuelve JWT.
  - `POST /api/marcas/login` — email + password → JWT.
  - `GET /api/marcas/me` — perfil.
  - `GET /api/marcas/tratos` — tratos de esa marca con su estado y montos.
  - `POST /api/marcas/tratos` — crea la solicitud: valida que la creadora esté visible, lee los pct vigentes de `mk_config`, aplica `calcularTrato`, **congela** los pct en la fila, genera `codigo` legible (`CR-000123` por secuencia), inserta y registra el evento inicial.
  - `POST /api/marcas/tratos/:id/aprobar` — de `entregado` a `aprobado`.
  - `POST /api/marcas/tratos/:id/cambios` — de `entregado` a `pago_retenido` con `feedback_marca`.
  - `GET /api/marcas/tratos/:id` — detalle + timeline de eventos + contacto de la creadora **solo si** `contacto_revelado_at` no es nulo.

**Files affected:**

- `apps/marketplace/marcas.js`

---

### Step 11: Router de creadoras

**Actions:**

- Crear `apps/marketplace/creadoras.js`:
  - `POST /api/creadoras/login`, `POST /api/creadoras/set-password` (primer ingreso con token de invitación por email), `POST /api/creadoras/forgot-password`.
  - `GET /api/creadoras/me` — perfil de catálogo propio (la creadora sí ve cómo se la está mostrando).
  - `GET /api/creadoras/tratos` — solicitudes recibidas, con el **neto que recibiría** ya calculado y visible antes de aceptar. La creadora nunca debe aceptar sin ver su neto.
  - `POST /api/creadoras/tratos/:id/aceptar` y `/rechazar` (con `motivo_rechazo`).
  - `POST /api/creadoras/tratos/:id/entregar` — crea `mk_entregas` con `url_contenido` y transiciona a `entregado`.
  - `GET /api/creadoras/tratos/:id` — detalle + contacto de la marca si ya se reveló.

**Files affected:**

- `apps/marketplace/creadoras.js`

---

### Step 12: Router admin y curaduría del catálogo

**Actions:**

- Crear `apps/marketplace/admin.js` (todo bajo `adminAuth`):
  - `GET /api/admin/tratos?estado=` — todos los tratos, con marca y creadora resueltas.
  - `GET /api/admin/resumen` — totales por estado, dinero retenido (entradas sin salida), comisión acumulada del mes y total, tratos que llevan más de N días en el mismo estado.
  - `POST /api/admin/tratos/:id/pago-entrada` — registra el pago de la marca (`monto`, `metodo`, `referencia`, `fecha`) y transiciona a `pago_retenido`.
  - `POST /api/admin/tratos/:id/pago-salida` — registra el pago a la creadora y transiciona a `pagado`. Rechaza si el trato no está en `aprobado`.
  - `POST /api/admin/tratos/:id/cerrar`, `POST /api/admin/tratos/:id/cancelar`.
  - `GET|POST|PATCH /api/admin/creadoras` — alta y edición del perfil de catálogo: `nicho`, `nivel_tarifa`, `tarifa_min/max`, `bio_corta`, `es_bruja_embajadora`, `visible`. **Aquí es donde se hace la curaduría** de las Open Questions 1 y 2.
  - `POST /api/admin/creadoras/:id/muestras` — subir pieza a Storage (multipart o base64), guardar `mk_muestras`.
  - `GET|PATCH /api/admin/config` — leer y editar `mk_config` (comisiones y niveles) sin desplegar.
  - `GET /api/admin/export/comisiones.csv?desde=&hasta=` — CSV para la contadora: código de trato, marca, NIT, creadora, fecha de cierre, monto base, comisión marca, comisión creadora, comisión total, total cobrado, neto pagado.

**Files affected:**

- `apps/marketplace/admin.js`

---

### Step 13: Servidor principal

**Actions:**

- Crear `apps/marketplace/index.js`: `express.json()`, `cors()`, monta `catalogo`, `marcas`, `creadoras`, `media`, y `admin` (este último detrás de `adminAuth`), sirve `public/` como estático, `GET /health` que responde `{ok:true, version}`, y un manejador de errores final que loguea y devuelve `{error}` sin stack trace.
- Objetivo explícito: que este archivo no pase de 200 líneas. Toda la lógica vive en los routers.

**Files affected:**

- `apps/marketplace/index.js`

---

### Step 14: Pruebas

**Actions:**

- `apps/marketplace/test/comisiones.test.js`:
  - 12% + 8% sobre $1.000.000 → marca paga $1.120.000, creadora recibe $920.000, comisión total $200.000.
  - `es_bruja_embajadora: true` → marca paga exactamente el monto, creadora recibe exactamente el monto, comisión 0.
  - Montos que no dividen exacto (ej. $333.333) → `total_a_pagar_marca - monto === comision_marca_valor` siempre.
  - Cambiar los pct de config no altera un trato ya creado (se prueba pasando los pct congelados).
- `apps/marketplace/test/tratos.test.js`:
  - Toda transición fuera de la tabla se rechaza.
  - Una creadora no puede aprobar su propia entrega; una marca no puede marcar `pagado`.
  - `contacto_revelado_at` sigue nulo en `solicitado` y en `aceptado` (con la config por defecto), y se sella en `pago_retenido`.
  - No se puede pasar a `pagado` sin un `mk_pagos` de salida.
- Correr con `npm test` desde `apps/marketplace/`.

**Files affected:**

- `apps/marketplace/test/comisiones.test.js`, `apps/marketplace/test/tratos.test.js`

---

### Step 15: Importación de las Brujas Embajadoras

**Actions:**

- Crear `apps/marketplace/scripts/importar_creadoras.js`:
  - Lee `influencers` con `status` en (`Calificada`, `Contenido Entregado`) o `ugc_activa = true` — o sea, las que ya demostraron que entregan.
  - Por cada una inserta en `mk_creadoras`: `influencer_id`, `nombre_publico` = primer nombre + inicial (no el handle), `email`, `whatsapp` = teléfono, `ciudad`, `alcance_total` = `seguidores_instagram + seguidores_tiktok`, `rango_alcance` derivado, `es_bruja_embajadora: true`, `visible: false`.
  - `colaboraciones_completadas` = número de filas en `contenidos` con score no nulo.
  - Idempotente: si ya existe una `mk_creadoras` con ese `influencer_id`, actualiza en vez de duplicar.
  - Modo `--dry-run` que imprime qué haría sin escribir.
- **No inventa nicho ni engagement**: quedan nulos y el admin los completa en el Paso 12. Un catálogo con nichos inventados es peor que uno incompleto.
- Ninguna creadora entra al catálogo automáticamente: `visible = false` hasta que un humano revise el perfil.

**Files affected:**

- `apps/marketplace/scripts/importar_creadoras.js`

---

### Step 16: Términos y condiciones

**Actions:**

- Crear `apps/marketplace/terminos.js` siguiendo el patrón de `apps/creadoras/acuerdo.js`: texto como plantilla JS + CSS propio, y una constante `TERMINOS_VERSION` (ej. `"2026-08-v1"`) que se guarda en `mk_marcas.terminos_version`.
- Cláusulas mínimas: objeto del servicio, comisión y cómo se cobra, escrow y momento de liberación, propiedad del contenido, **no-circunvalación** (contratar directo a una creadora conocida por la plataforma dentro de N meses causa igual la comisión), tratamiento de datos (Ley 1581 de 2012), limitación de responsabilidad, ley colombiana.
- Servir en `GET /terminos` para poder enlazarlo desde el registro.
- Marcar en el archivo con un comentario visible que el texto debe ser revisado por la abogada antes de operar con marcas externas.

**Files affected:**

- `apps/marketplace/terminos.js`

---

### Step 17: Notificaciones

**Actions:**

- Crear `apps/marketplace/notificaciones.js` con Nodemailer y credenciales propias (`MK_SMTP_USER` / `MK_SMTP_PASS`), remitente "CreadoresApp" — no el Gmail de Brujería (Open Question 5).
- Plantillas: nueva solicitud para la creadora, solicitud aceptada/rechazada para la marca, pago confirmado con contacto revelado (a ambos), contenido entregado para la marca, contenido aprobado para la creadora, pago liberado para la creadora.
- Envío no bloqueante: si el correo falla, se loguea y la transición **igual se completa**. Un correo caído no puede dejar un trato en estado inconsistente.
- WhatsApp queda fuera en Fase 1: el admin copia el mensaje desde el panel si quiere avisar por ese canal.

**Files affected:**

- `apps/marketplace/notificaciones.js`

---

### Fase B — Frontend

### Step 18: Sistema visual y landing pública

**Fuente:** `~/Downloads/Marketplace de creadoras Brujería/design_handoff_creadores_app_landing/` — el `.dc.html` es la fuente de verdad para valores exactos; los screenshots son referencia visual. `support.js` e `image-slot.js` **no se portan**.

**Actions:**

- Crear `apps/marketplace/public/css/tokens.css` con el sistema completo: los 5 colores estructurales y sus variantes `-shade`, las dos familias monoespaciadas cargadas de Google Fonts, la escala tipográfica con `clamp()`, y las reglas duras del sistema (`border-radius: 0` global, sin sombras, bordes 2px).
- Crear `apps/marketplace/public/index.html` portando los 10 bloques en orden: ticker superior, header sticky, hero, banco de creadoras (marquesina), sección azul de razones, sección lima "cómo funciona" + mock de app, ticker inferior, precios, sección "para creadoras", CTA final y footer.
- Detalles del sistema que no se pueden perder al portar:
  - Texto resaltado **en escalera** (márgenes crecientes por línea) en el hero y en el bloque de misión.
  - Grillas con bordes compartidos: `border-top` + `border-left` en el contenedor, `border-right` + `border-bottom` en cada celda.
  - Tarjetas de creadora con doble marco: `border: 2px solid #0E0E0E` + `outline: 2px solid <color de la tarjeta>`.
  - Rupturas deliberadas del patrón: la tercera celda de "cómo funciona" invertida (fondo negro, texto lima) y las píldoras de engagement de @MAKEUPSOFI y @JULIAGLOSS en otro color. **Se mantienen**: son lo que evita que la grilla se sienta mecánica.
  - Tres cuadrados de 8px (no círculos) en la barra de título del mock de app.
  - Etiquetas eyebrow entre llaves `{ASÍ}`, índices entre llaves `{1}`.
- **Corregir del prototipo** (el handoff lo señala):
  - `line-height ≥ 1.0` en cualquier titular en mayúsculas con Ñ o tildes — `CAMPAÑA`, `COMISIÓN`, `PELUQUERÍA` colisionan con la línea superior por debajo de 0.95.
  - `@media (prefers-reduced-motion: reduce)` deteniendo las tres marquesinas.
  - Nav colapsado bajo 1024px (a ~1500px el ítem `[CREADORAS]` salta de línea).
  - Marquesina del banco: pausa en hover y scroll horizontal táctil en móvil, porque las tarjetas serán clicables al perfil.
- Crear `GET /api/landing` que sirva los porcentajes de comisión desde `mk_config` y las creadoras destacadas desde `mk_creadoras` (`visible = true`, con muestra). Mientras no haya creadoras curadas, devuelve las 8 tarjetas de ejemplo del diseño marcadas con `demo: true`, y la landing muestra un aviso discreto en el panel admin — no en la página — de que el banco sigue en modo demostración.
- Conectar los CTAs: `SOY MARCA` / `PUBLICAR CAMPAÑA` → `/registro.html`; `SOY CREADORA` / `CREAR MI PERFIL` → `/creadora.html`; `TÉRMINOS` → `/terminos`.
- Las 13 imágenes son placeholders. Usar bloques de color plano del tono `-shade` correspondiente hasta que haya fotos reales con derechos de uso.

**Files affected:**

- `apps/marketplace/public/css/tokens.css`, `apps/marketplace/public/index.html`, `apps/marketplace/landing.js`

---


### Step 19: Pantallas del lado marca

**Requiere:** mockups 1, 2 y 3 (tarjeta de creadora, catálogo con filtros, modal de solicitud).

**Actions:**

- Crear `apps/marketplace/public/css/tokens.css` con el sistema visual del handoff (ver Decisión 11): variables de color, familias tipográficas, escala con `clamp()`, y las reglas duras (radio 0, sin sombras, bordes 2px).
- Crear `apps/marketplace/public/catalogo.html` (React CDN, mismo patrón sin build): tarjeta de creadora, grilla, filtros por nicho y rango de alcance, y el modal de solicitud con brief, monto (con las tarifas sugeridas del nivel) y fecha esperada. El modal debe mostrar el desglose en vivo: *monto acordado + comisión = total a pagar*.
- Reproducir fielmente los mockups entregados en vez de reinterpretar. Donde falte mockup, usar tokens y dejar la estructura simple.
- Las muestras se muestran vía `/media/:id?t=<token>`, con `pointer-events` y menú contextual deshabilitados sobre la imagen (fricción mínima, no seguridad real — está documentado).

**Files affected:**

- `apps/marketplace/public/css/tokens.css`, `apps/marketplace/public/catalogo.html`

---

### Step 20: Registro de marca, portal de creadora y timeline

**Requiere:** mockups 4, 5 y 6.

**Actions:**

- `apps/marketplace/public/registro.html` — onboarding de marca con código de invitación, checkbox de términos enlazando a `/terminos`, y estado de error claro cuando el código no es válido.
- `apps/marketplace/public/creadora.html` — **mobile-first**: lista de solicitudes recibidas, detalle con brief y neto a recibir bien visible, botones aceptar/rechazar, y formulario de entrega. Es la pantalla que más se va a usar desde el celular.
- `apps/marketplace/public/trato.html` — línea de tiempo de los 7 estados con el hito actual destacado; el acento cálido solo aparece en "aprobado" y "pagado".
- `apps/marketplace/public/admin.html` — tablero por estado, resumen de dinero retenido y comisiones, formularios de registro de pagos, curaduría de catálogo y botón de export CSV.

**Files affected:**

- `apps/marketplace/public/registro.html`, `creadora.html`, `trato.html`, `admin.html`

---

### Fase C — Despliegue y documentación

### Step 21: Desplegar el segundo servicio

**Actions:**

- Aplicar `mk_001_init.sql` y `mk_002_seed_config.sql` en el SQL Editor de Supabase.
- Crear el bucket privado `mk-muestras`.
- En Railway, crear un **servicio nuevo** sobre el mismo repo con **Root Directory = `apps/marketplace`**. El servicio existente del Programa Creadoras no se toca.
- Variables de entorno del servicio nuevo: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (los mismos), `MK_JWT_SECRET` (nuevo, distinto al de Brujería), `MK_ADMIN_USER`, `MK_ADMIN_PASS`, `MK_CODIGOS_INVITACION`, `MK_SMTP_USER`, `MK_SMTP_PASS`, `MK_BASE_URL`.
- Verificar `GET /health`. El dominio queda pendiente de compra (Open Question 4): el servicio opera sobre su URL `.up.railway.app`.

**Files affected:**

- Ninguno en el repo (configuración de infraestructura)

---

### Step 22: Documentación

**Actions:**

- Crear `apps/marketplace/README.md`: qué es, cómo correr local, lista completa de env vars, cómo aplicar migraciones, cómo correr las pruebas, y la advertencia de que el texto legal está pendiente de revisión.
- Actualizar `CLAUDE.md` de appinfluenciadoras: agregar `apps/marketplace/` al árbol de Workspace Structure, agregarlo a la tabla de Key Directories, y una sección "Marketplace de Creadoras (CreadoresApp)" con el flujo, los estados del trato, la regla de identidad oculta y la de congelar comisiones.
- Actualizar `README.md` del repo: el repo aloja dos apps desplegadas por separado.
- Nota para el workspace principal (Ettos): agregar `appinfluenciadoras/apps/marketplace/` a su `CLAUDE.md`, que hoy no documenta este repo.

**Files affected:**

- `apps/marketplace/README.md`, `CLAUDE.md`, `README.md`

---

## Connections & Dependencies

### Files That Reference This Area

- `apps/creadoras/cerebro-connector.js` — expone un snapshot de solo lectura a El Cerebro. Cuando el marketplace tenga tratos reales, conviene exponer un snapshot equivalente (comisión acumulada, tratos activos) para que aparezca en el hub. **Fuera de alcance de este plan**, anotado como siguiente paso.
- Tabla `influencers` — el marketplace la **lee** (vía `influencer_id`) pero no la escribe nunca. Cualquier cambio de esquema en el programa de gifting que renombre `instagram_handle`, `seguidores_*` o `telefono` rompería `getContactoCreadora` y el script de importación.

### Updates Needed for Consistency

- `CLAUDE.md` de appinfluenciadoras (obligatorio — es la instrucción crítica del repo).
- `CLAUDE.md` del workspace Ettos: hoy no menciona appinfluenciadoras en absoluto, y ahora aloja dos productos.
- Memoria del proyecto: registrar que CreadoresApp existe, dónde vive y cuál es su decisión arquitectónica base.

### Impact on Existing Workflows

- **Ninguno sobre el Programa Creadoras.** No se modifica `apps/creadoras/`, ni su servicio de Railway, ni sus tablas. El único acoplamiento es de lectura sobre `influencers`.
- Riesgo compartido: ambos servicios usan la misma `service_role_key` de Supabase. Si se rota, hay que actualizarla en los dos servicios de Railway.
- Nueva carga operativa para el equipo: registrar cada pago entrante y saliente en el panel admin. Sin ese registro manual, los tratos se quedan trabados — es el precio consciente de no tener pasarela.

---

## Validation Checklist

- [ ] Las 8 tablas `mk_*` existen en Supabase y ninguna tabla existente fue alterada
- [ ] `npm test` pasa en `apps/marketplace/` (comisiones y máquina de estados)
- [ ] `GET /health` responde 200 en el servicio nuevo de Railway
- [ ] El servicio del Programa Creadoras sigue respondiendo con normalidad después del despliegue
- [ ] `GET /api/catalogo` sin token devuelve 401
- [ ] Ninguna respuesta de `/api/catalogo/*` contiene `instagram_handle`, `tiktok_handle`, `telefono`, `email` ni `influencer_id` — verificado leyendo el JSON crudo
- [ ] Un token de creadora rechazado (401) en un endpoint de marca, y viceversa
- [ ] `contacto_revelado_at` sigue nulo tras aceptar, y se sella al registrar el pago de entrada
- [ ] Un trato con `es_bruja_embajadora` cobra exactamente el monto acordado, sin recargo
- [ ] Cambiar `comision_marca_pct` en `mk_config` no altera los valores de un trato ya creado
- [ ] Intentar marcar `pagado` sin registrar el pago de salida devuelve 409
- [ ] `/media/:id` sin token devuelve 401, y con token no expone la URL de Storage en ninguna cabecera
- [ ] El export CSV abre en Excel con las columnas de comisión correctas
- [ ] `CLAUDE.md` refleja la nueva estructura

---

## Success Criteria

1. Una marca invitada se registra, acepta términos, navega el catálogo con filtros y envía una solicitud a una creadora sin haber visto en ningún momento un handle, un teléfono o un email de esa creadora.
2. La creadora recibe el aviso, ve el neto que le quedaría antes de decidir, acepta desde el celular, y el contacto entre ambas partes se abre únicamente después de que el admin registra el pago de la marca.
3. El trato recorre los 7 estados hasta `cerrado`, con cada transición registrada en `mk_trato_eventos` con actor y fecha.
4. El panel admin muestra en todo momento cuánto dinero está retenido, cuánta comisión se ha acumulado y qué tratos están estancados.
5. Una Bruja Embajadora con el flag activo cierra un trato sin que se le descuente nada y sin recargo a la marca.
6. El export CSV del período se le puede entregar a Paula sin edición manual.
7. El Programa Creadoras sigue operando exactamente igual que antes del cambio.

---

## Notes

### Deuda técnica consciente

- **Sin marca de agua** (decisión de la usuaria): una búsqueda inversa de imagen sobre una pieza del catálogo puede llevar al perfil de la creadora. El proxy de medios y la ausencia de handle mitigan pero no eliminan el riesgo. `mk_muestras.storage_path` está separado del original justamente para que agregar el watermark después sea un cambio contenido en el pipeline de subida — sin tocar frontend ni esquema.
- **Sin pasarela** (decisión de la usuaria): todo el escrow depende de la disciplina del equipo para registrar pagos. Si el volumen crece, `mk_pagos` ya tiene la forma que necesitaría una conciliación automática con Wompi.
- **Estados sin bloqueo optimista**: dos admins simultáneos podrían registrar dos pagos de salida sobre el mismo trato. Con un equipo de una o dos personas es aceptable; si crece, agregar `updated_at` como precondición en el PATCH.

### Pendiente no técnico que sí bloquea el volumen

Antes de operar con marcas externas en volumen real hay que cerrar con Paula: quién factura el 100%, si la creadora necesita RUT y si aplica retención en la fuente sobre el pago de salida. El sistema no lo impide, pero los campos `nit` en `mk_marcas` y el export CSV están puestos pensando en que esa conversación va a exigir trazabilidad.

### Siguientes fases (no en este plan)

- Marca de agua en el pipeline de subida.
- Registro público abierto para marcas + verificación.
- Snapshot hacia El Cerebro.
- Disbursement automático a creadoras.
- Verificación de audiencia real (seguidores falsos) — solo si marcas más grandes lo exigen.
