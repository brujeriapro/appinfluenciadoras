# Setup — Sistema de Gestión de Influencers

**Programa Creadoras Brujería Capilar**

Este documento cubre la configuración completa del sistema desde cero.
Tiempo estimado: ~45 minutos la primera vez.

---

## Paso 1: Crear base de datos en Supabase

### 1.1 Crear cuenta y proyecto

1. Ir a [supabase.com](https://supabase.com) → **Start for free**
2. Crear proyecto: nombre `programa-creadoras-brujeriacapilar`
3. Elegir región: **South America (São Paulo)** (más cercana a Colombia)
4. Guardar contraseña del proyecto en lugar seguro
5. Esperar ~2 minutos mientras Supabase provisiona la base de datos

### 1.2 Actualizar tabla contenidos (si ya la creaste antes)

Si ya ejecutaste el SQL de creación de tablas, corre este ALTER para agregar la columna `fecha_publicacion`:

```sql
ALTER TABLE contenidos ADD COLUMN IF NOT EXISTS fecha_publicacion date;
```

### 1.3 Crear las tablas (primera vez)

En Supabase → **SQL Editor** → **New query** → pegar y ejecutar:

```sql
-- Tabla de influencers
CREATE TABLE influencers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text,
  email text,
  telefono text,
  instagram_handle text,
  tiktok_handle text,
  seguidores_instagram integer,
  seguidores_tiktok integer,
  engagement_rate_pct numeric,
  ciudad text,
  departamento text,
  direccion_envio text,
  tier text,
  kit_asignado text,
  status text DEFAULT 'Registrada',
  fecha_contacto date,
  fecha_registro timestamptz DEFAULT now(),
  fecha_envio date,
  shopify_order_id text,
  skus_pedidos text[],
  numero_guia text,
  score_total numeric DEFAULT 0,
  nivel_bruja text DEFAULT 'Bruja Semilla',
  notas_equipo text,
  created_at timestamptz DEFAULT now()
);

-- Tabla de contenidos
CREATE TABLE contenidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  influencer_id uuid REFERENCES influencers(id) ON DELETE CASCADE,
  url_contenido text,
  plataforma text,
  tipo_contenido text,
  vistas integer,
  likes integer,
  alcance integer,
  guardados integer,
  fecha_publicacion date,
  screenshot_url text,
  score_contenido numeric,
  calificacion_equipo integer CHECK (calificacion_equipo BETWEEN 1 AND 5),
  fecha_submision timestamptz DEFAULT now(),
  notas_equipo text
);

-- Tabla de kits
CREATE TABLE kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text UNIQUE,
  tier text,
  skus text[],
  descripcion text,
  valor_retail_cop integer
);

-- Insertar kits iniciales (actualizar SKUs reales después)
INSERT INTO kits (nombre, tier, skus, descripcion, valor_retail_cop) VALUES
  ('Kit Básico',   'Nano',  ARRAY['TERMO-001', 'MANT-001'],
   'Termoprotector + Mantequilla Capilar', 80000),
  ('Kit Estándar', 'Micro', ARRAY['TERMO-001', 'MANT-001', 'RIZOS-001'],
   'Termoprotector + Mantequilla + Crema Rizos 3en1', 130000),
  ('Kit Premium',  'Macro', ARRAY['TERMO-001', 'MANT-001', 'RIZOS-001', 'SHAM-001', 'HMW-001'],
   'Kit completo + Shampoo + Hair Magic Wand', 220000);

-- Índices para búsquedas frecuentes
CREATE INDEX idx_influencers_status ON influencers(status);
CREATE INDEX idx_influencers_email ON influencers(email);
CREATE INDEX idx_contenidos_influencer ON contenidos(influencer_id);
CREATE INDEX idx_contenidos_score_null ON contenidos(score_contenido) WHERE score_contenido IS NULL;
```

### 1.3 Copiar credenciales

En Supabase → **Settings** → **API**:
- Copiar **Project URL** (ej: `https://abcdefgh.supabase.co`)
- Copiar **service_role key** (NO la anon key — los scripts necesitan acceso completo)

---

## Paso 2: Crear App Privada en Shopify

1. Ir a Shopify Admin → **Settings** → **Apps and sales channels** → **Develop apps**
2. Hacer clic en **Create an app** → Nombre: `Programa Creadoras`
3. En la app creada → **Configuration** → **Admin API access scopes**
4. Habilitar los siguientes scopes:
   - `write_draft_orders` — crear draft orders
   - `write_orders` — completar órdenes
   - `read_products` — buscar variant IDs por SKU
5. Hacer clic en **Save** → luego **Install app**
6. En la app → **API credentials**:
   - Copiar **Client ID** (formato: `89f94455...`)
   - Copiar **Client secret** (formato: `shpss_...`)

> **Nota**: El script usa el flujo OAuth `client_credentials` para obtener un token de acceso automáticamente. No se necesita un `access_token` estático. El token se renueva solo cada 24h.

---

## Paso 3: Llenar config_influencers.json

Abrir `scripts/influencers/config_influencers.json` y reemplazar los valores placeholder:

```json
{
  "supabase": {
    "url": "https://TU-PROYECTO.supabase.co",          <- pegar Project URL
    "service_role_key": "sb_secret_..."                <- pegar service_role key
  },
  "shopify": {
    "shop_name": "brujeriacapilar",                    <- confirmar nombre de la tienda
    "client_id": "89f944...",                          <- pegar Client ID
    "client_secret": "shpss_..."                       <- pegar Client secret
  },
  "siigo": {
    "username": "usuario@empresa.co",                  <- email de usuario API Siigo
    "access_key": "ODQ0NWM1..."                        <- access key de Siigo
  }
}
```

### Configurar productos disponibles y kits

Los kits ahora son flexibles: la influencer elige sus productos. La config define cuántos puede elegir:

```json
"kits": {
  "Kit Básico":   { "productos": 1, "note": "Nano - influencer elige 1 producto" },
  "Kit Estándar": { "productos": 2, "note": "Micro - influencer elige 2 productos" },
  "Kit Premium":  { "productos": 3, "note": "Macro - influencer elige 3 o más productos" }
},
"productos_disponibles": {
  "Termoprotector Capilar":  "BRTP0001",
  "Mascarilla Hechizo Total": "BRMA0001"
}
```

Los SKUs deben coincidir exactamente con los SKUs en Shopify Admin → Products. Los SKUs elegidos por cada influencer se guardan en la columna `skus_pedidos` de Supabase.

---

## Paso 4: Instalar dependencias Python

```bash
cd scripts/influencers/

# Crear entorno virtual (recomendado)
python -m venv venv
venv\Scripts\activate       # Windows

# Instalar dependencias
pip install -r requirements_influencers.txt
```

---

## Paso 5: Configurar formularios en Tally.so

### 5.1 Formulario de Registro

1. Ir a [tally.so](https://tally.so) → **New form**
2. Título: `Programa Creadoras — Brujería Capilar`
3. Agregar campos:

| Campo | Tipo | Requerido |
|---|---|---|
| Nombre Completo | Text | ✓ |
| Email | Email | ✓ |
| Teléfono/WhatsApp | Phone | ✓ |
| Instagram | Text | ✓ |
| TikTok | Text | |
| Seguidores Instagram | Number | ✓ |
| Seguidores TikTok | Number | |
| Engagement Rate | Dropdown: `<1%` / `1-3%` / `3-6%` / `>6%` | ✓ |
| Ciudad | Text | ✓ |
| Departamento | Dropdown (departamentos CO) | ✓ |
| Dirección de Envío | Long Text | ✓ |
| Acepto crear contenido en 30 días | Checkbox | ✓ |
| Acepto que Brujería Capilar pueda repostear | Checkbox | ✓ |
| Confirmo que mis datos son verídicos | Checkbox | ✓ |

4. En **Settings** → **Integrations** → **Webhooks**:
   - Webhook URL: `https://TU-NGROK-URL.ngrok.io` (o URL pública del receptor)
   - Method: POST

### 5.2 Formulario de Entrega de Contenido

1. Nuevo form → Título: `Entrega tu Contenido — Brujería Capilar`
2. El nombre del formulario **debe contener** la palabra `contenido` o `entrega` para que el webhook lo identifique correctamente.
3. Campos:

| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| Email | Email | ✓ | Debe coincidir con el email de registro |
| URL del Contenido | URL | ✓ | Link directo al post/video |
| Plataforma | Dropdown: `Instagram` / `TikTok` | ✓ | |
| Tipo de contenido | Dropdown: `Reel` / `Story` / `Post` / `Video` | ✓ | Video = TikTok nativo |
| Fecha de publicación | Date | ✓ | Para verificar cumplimiento del plazo de 30 días |
| Vistas | Number | ✓ | |
| Likes | Number | ✓ | |
| Guardados | Number | ✓ | **Requerido** — vale 20% del score. En Instagram: "Guardados". En TikTok: "Favoritos". |
| Alcance | Number | | Opcional — para referencia, no afecta el score |
| Screenshot de métricas | File Upload | ✓ | Captura de pantalla de las métricas del post |

> **IMPORTANTE sobre Guardados:** Este campo es requerido porque representa el 20% del score. Si la influencer no lo reporta, el sistema redistribuye ese peso automáticamente, pero el score puede quedar por debajo del potencial real del contenido. Pedirlo requerido evita eso.

4. En **Settings** → **Integrations** → **Webhooks**: mismo URL receptor que el formulario de registro.

3. Copiar la URL pública del formulario → guardar en `config_influencers.json` → `email.tally_form_contenido_url`
4. Configurar webhook → mismo URL receptor

### 5.3 Correr el receptor de webhooks

```bash
# Instalar ngrok: https://ngrok.com/download
# En una terminal:
python webhook_receiver.py

# En otra terminal:
ngrok http 8765
# Copiar la URL https://xxx.ngrok.io → pegar en Tally webhook URL
```

---

## Paso 6: Configurar Gmail para recordatorios

1. Ir a tu cuenta Gmail → **Seguridad** → **Verificación en dos pasos** (debe estar activa)
2. Ir a **Contraseñas de aplicaciones** → crear nueva → App: `Correo`, Dispositivo: `Windows`
3. Copiar la contraseña de 16 caracteres generada
4. En `config_influencers.json`:
   ```json
   "email": {
     "provider": "gmail",
     "sender": "tu.email@gmail.com",
     "app_password": "xxxx xxxx xxxx xxxx",
     "tally_form_contenido_url": "https://tally.so/r/ID_DEL_FORM"
   }
   ```

---

## Paso 7: Primera ejecución y verificación

### Verificar conexión a Supabase

```bash
cd scripts/influencers/
python -c "from supabase_client import SupabaseClient; c = SupabaseClient(); print('Supabase OK:', len(c.get_influencers_by_status('Registrada')), 'registradas')"
```

### Verificar SKUs de Shopify

```bash
python -c "from shopify_client import ShopifyClient; c = ShopifyClient(); print('Shopify OK:', c.get_variant_id_for_sku('TU-SKU-REAL'))"
```

### Dry run del pipeline completo

```bash
python crear_envio.py --dry-run
```

Si sale el mensaje "No hay influencers con status 'Registrada'", agregar un registro de prueba en Supabase (Table Editor → influencers → Insert row) y volver a correr.

### Verificar recordatorios

```bash
python seguimiento.py --preview
```

---

## Verificación del webhook Tally (opcional)

```bash
python webhook_receiver.py --test
```

Muestra cómo se parsearía un registro de prueba sin necesidad de HTTP.

---

## Validación final Fase 1

- [ ] Tablas creadas en Supabase con datos de prueba visibles en Table Editor
- [ ] `crear_envio.py --dry-run` muestra el payload correcto sin errores
- [ ] SKU real resuelve a un variant_id válido en Shopify
- [ ] Orden $0 de prueba aparece en Shopify Admin (verificar que Effi la recibe)
- [ ] `seguimiento.py --preview` funciona sin errores

---

## Automatización opcional (Windows Task Scheduler)

Para correr `seguimiento.py` automáticamente cada semana:

1. Abrir **Task Scheduler** (Programador de tareas)
2. **Create Basic Task** → Nombre: `Recordatorios Influencers`
3. Trigger: **Weekly** → día y hora deseados
4. Action: **Start a program**
   - Program: `C:\ruta\a\scripts\influencers\venv\Scripts\python.exe`
   - Arguments: `C:\ruta\a\scripts\influencers\seguimiento.py`
5. Guardar tarea

Para `calcular_scores.py`: misma lógica, correr diariamente si hay contenido frecuente.

---

## Preguntas frecuentes

**¿La orden $0 de Shopify puede crear conflictos contables en Siigo?**
Las órdenes se etiquetan con `influencer-gifting` y pueden filtrarse en Siigo. El valor contable de la donación debe ser el costo del producto, no $0. Confirmar con el contador cómo clasificar estas órdenes.

**¿Qué pasa si una influencer se registra dos veces?**
El webhook_receiver.py verifica por email antes de insertar. Si el email ya existe, actualiza el registro en lugar de duplicarlo.

**¿Cómo agrego una influencer manualmente sin pasar por Tally?**
En Supabase → Table Editor → influencers → Insert row. O desde Python:
```python
from supabase_client import SupabaseClient
c = SupabaseClient()
c.insert_influencer({"nombre": "Ana López", "email": "ana@email.com", ...})
```
