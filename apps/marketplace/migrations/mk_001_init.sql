-- ===========================================================================
-- Creadores.app - esquema inicial del marketplace
-- Correr en el SQL Editor de Supabase. Idempotente: se puede repetir sin dano.
--
-- Convencion: TODAS las tablas del marketplace llevan prefijo mk_. Conviven en
-- la misma base que el Programa Creadoras de Brujeria Capilar, que NO se toca.
-- La unica relacion con el esquema existente es mk_creadoras.influencer_id,
-- que apunta a influencers(id) y solo se lee.
-- ===========================================================================

-- -- 1. Configuracion del marketplace (clave/valor) --------------------------
-- Comisiones, niveles de tarifa y reglas de negocio viven aqui, no en el codigo.
CREATE TABLE IF NOT EXISTS mk_config (
  clave        TEXT PRIMARY KEY,
  valor        JSONB NOT NULL,
  descripcion  TEXT,
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- -- 2. Marcas clientes -----------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_marcas (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre_empresa         TEXT NOT NULL,
  nombre_contacto        TEXT NOT NULL,
  email                  TEXT UNIQUE NOT NULL,
  password_hash          TEXT,
  whatsapp               TEXT,
  nit                    TEXT,
  ciudad                 TEXT,
  sitio_web              TEXT,
  estado                 TEXT DEFAULT 'activa',      -- activa | suspendida
  codigo_invitacion      TEXT,
  -- Constancia de aceptacion de terminos: sin esto la clausula de
  -- no-circunvalacion no es exigible.
  terminos_version       TEXT,
  terminos_aceptados_at  TIMESTAMP WITH TIME ZONE,
  terminos_ip            TEXT,
  notas_admin            TEXT,
  created_at             TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- -- 3. Creadoras del catalogo -----------------------------------------------
-- OJO: esta tabla NO tiene columna de handle, a proposito. El instagram_handle
-- vive en influencers y solo se lee desde el panel admin o cuando el trato ya
-- tiene el pago retenido. Asi, un bug de "select *" en el catalogo no puede
-- filtrar la identidad de nadie.
CREATE TABLE IF NOT EXISTS mk_creadoras (
  id                         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id              UUID REFERENCES influencers(id) ON DELETE SET NULL,
  nombre_publico             TEXT NOT NULL,          -- alias, nunca el handle
  email                      TEXT UNIQUE NOT NULL,
  password_hash              TEXT,
  whatsapp                   TEXT,
  ciudad                     TEXT,
  nicho                      TEXT[],                 -- curado a mano desde admin
  alcance_total              INTEGER,                -- suma de seguidores, uso interno
  rango_alcance              TEXT,                   -- lo que ve la marca: 10K-50K
  engagement_pct             NUMERIC(5,2),
  nivel_tarifa               TEXT,                   -- inicial | medio | top
  tarifa_min                 NUMERIC(12,2),
  tarifa_max                 NUMERIC(12,2),
  entregable_tipico          TEXT,                   -- REEL+STORY, RESENA UGC...
  es_bruja_embajadora        BOOLEAN DEFAULT false,  -- comision 0%
  visible                    BOOLEAN DEFAULT false,  -- entra al catalogo tras curaduria
  bio_corta                  TEXT,
  colaboraciones_completadas INTEGER DEFAULT 0,
  notas_admin                TEXT,
  created_at                 TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mk_creadoras_visible_idx    ON mk_creadoras(visible);
CREATE INDEX IF NOT EXISTS mk_creadoras_influencer_idx ON mk_creadoras(influencer_id);

-- -- 4. Piezas de contenido de muestra ---------------------------------------
-- storage_path apunta a un objeto en el bucket privado con nombre aleatorio.
-- Nunca se guarda ni se sirve la URL original del CDN de Instagram o TikTok:
-- esas URLs llevan identificadores que permiten llegar al perfil.
CREATE TABLE IF NOT EXISTS mk_muestras (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creadora_id   UUID REFERENCES mk_creadoras(id) ON DELETE CASCADE,
  tipo          TEXT DEFAULT 'imagen',   -- imagen | video
  storage_path  TEXT NOT NULL,
  mime          TEXT,
  orden         SMALLINT DEFAULT 0,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mk_muestras_creadora_idx ON mk_muestras(creadora_id);

-- -- 5. Tratos (colaboraciones) ----------------------------------------------
-- Los porcentajes de comision se COPIAN aqui al crear el trato y nunca se
-- recalculan: si manana cambia la comision, los tratos viejos conservan la suya.
CREATE TABLE IF NOT EXISTS mk_tratos (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo                   TEXT UNIQUE,             -- CR-000123, legible para soporte
  marca_id                 UUID REFERENCES mk_marcas(id),
  creadora_id              UUID REFERENCES mk_creadoras(id),
  estado                   TEXT NOT NULL DEFAULT 'solicitado',
  brief                    TEXT NOT NULL,
  entregables              TEXT,
  fecha_entrega_esperada   DATE,

  monto_creadora           NUMERIC(12,2) NOT NULL,  -- acordado, antes de comision
  comision_marca_pct       NUMERIC(5,2) NOT NULL,   -- congelado al crear
  comision_creadora_pct    NUMERIC(5,2) NOT NULL,   -- congelado al crear
  comision_marca_valor     NUMERIC(12,2),
  comision_creadora_valor  NUMERIC(12,2),
  comision_total_valor     NUMERIC(12,2),
  total_a_pagar_marca      NUMERIC(12,2),
  neto_a_recibir_creadora  NUMERIC(12,2),

  contacto_revelado_at     TIMESTAMP WITH TIME ZONE,

  fecha_solicitud          TIMESTAMP WITH TIME ZONE DEFAULT now(),
  fecha_respuesta          TIMESTAMP WITH TIME ZONE,
  fecha_pago_marca         TIMESTAMP WITH TIME ZONE,
  fecha_entrega            TIMESTAMP WITH TIME ZONE,
  fecha_aprobacion         TIMESTAMP WITH TIME ZONE,
  fecha_pago_creadora      TIMESTAMP WITH TIME ZONE,
  fecha_cierre             TIMESTAMP WITH TIME ZONE,

  motivo_rechazo           TEXT,
  motivo_cancelacion       TEXT,
  created_at               TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at               TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mk_tratos_marca_idx    ON mk_tratos(marca_id);
CREATE INDEX IF NOT EXISTS mk_tratos_creadora_idx ON mk_tratos(creadora_id);
CREATE INDEX IF NOT EXISTS mk_tratos_estado_idx   ON mk_tratos(estado);

-- Secuencia para el codigo legible CR-000001
CREATE SEQUENCE IF NOT EXISTS mk_tratos_codigo_seq START 1;

-- -- 6. Historial de eventos del trato ---------------------------------------
-- Toda transicion de estado deja huella: quien, cuando, desde donde y hacia donde.
CREATE TABLE IF NOT EXISTS mk_trato_eventos (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trato_id         UUID REFERENCES mk_tratos(id) ON DELETE CASCADE,
  estado_anterior  TEXT,
  estado_nuevo     TEXT,
  actor            TEXT,   -- marca | creadora | admin | sistema
  actor_id         UUID,
  nota             TEXT,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mk_trato_eventos_trato_idx ON mk_trato_eventos(trato_id);

-- -- 7. Pagos (escrow manual) ------------------------------------------------
-- direccion = entrada  -> la marca pago a la plataforma (dinero retenido)
-- direccion = salida   -> la plataforma pago a la creadora (dinero liberado)
-- El dinero en custodia es la suma de entradas sin salida correspondiente.
CREATE TABLE IF NOT EXISTS mk_pagos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trato_id        UUID REFERENCES mk_tratos(id) ON DELETE CASCADE,
  direccion       TEXT NOT NULL,          -- entrada | salida
  monto           NUMERIC(12,2) NOT NULL,
  metodo          TEXT,                   -- transferencia | nequi | bancolombia
  referencia      TEXT,
  fecha           DATE,
  registrado_por  TEXT,
  notas           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mk_pagos_trato_idx ON mk_pagos(trato_id);

-- -- 8. Entregas de contenido ------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_entregas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trato_id        UUID REFERENCES mk_tratos(id) ON DELETE CASCADE,
  url_contenido   TEXT,
  notas_creadora  TEXT,
  estado          TEXT DEFAULT 'en_revision',  -- en_revision | aprobada | cambios_solicitados
  feedback_marca  TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mk_entregas_trato_idx ON mk_entregas(trato_id);
