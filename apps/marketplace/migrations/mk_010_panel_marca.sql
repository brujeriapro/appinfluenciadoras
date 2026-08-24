-- ===========================================================================
-- Creators Manager - mk_010
--
-- Lo que necesita el panel de marca, segun el handoff de diseno.
--
-- El cambio de fondo esta en como se identifica a una creadora en el catalogo:
-- pasa de un nombre de persona abreviado ("Valeria R.") a un ALIAS DESCRIPTIVO
-- mas un CODIGO ("RIZOS DE MEDELLIN - C-0412").
--
-- No es cosmetico. "Valeria R." insinua una persona: con la ciudad y el nicho
-- al lado, alguien decidido la encuentra. "RIZOS DE MEDELLIN" no apunta a
-- nadie, y el codigo da algo concreto que decir en una conversacion ("me
-- interesa la C-0412") sin nombrar a la persona. El anonimato deja de depender
-- de que el alias este bien escogido.
-- ===========================================================================

-- -- 1. Codigo y alias --------------------------------------------------------
ALTER TABLE mk_creadoras
  ADD COLUMN IF NOT EXISTS codigo             TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS dias_entrega       SMALLINT,   -- promedio, derivado de sus tratos
  ADD COLUMN IF NOT EXISTS audiencia_mujeres  SMALLINT,   -- %, solo con Instagram conectado
  ADD COLUMN IF NOT EXISTS audiencia_pais     SMALLINT;   -- % en su propio pais

COMMENT ON COLUMN mk_creadoras.codigo IS 'C-0412. Identifica sin nombrar: se puede decir en voz alta sin revelar quien es.';
COMMENT ON COLUMN mk_creadoras.nombre_publico IS 'Alias descriptivo del trabajo, no un nombre de persona. Ej: RIZOS DE MEDELLIN.';

CREATE SEQUENCE IF NOT EXISTS mk_creadoras_codigo_seq START 300;

-- Las que ya existen reciben codigo. El alias hay que revisarlo a mano desde el
-- panel: convertir "Valeria R." en algo descriptivo es trabajo de criterio, no
-- de SQL.
UPDATE mk_creadoras
   SET codigo = 'C-' || LPAD(nextval('mk_creadoras_codigo_seq')::text, 4, '0')
 WHERE codigo IS NULL;

-- -- 2. Preseleccion y descarte ------------------------------------------------
-- El triage vive por marca: lo que una descarta no afecta a las demas. Y vive
-- en la base, no en el navegador: una marca que compara veinte perfiles no
-- puede perder su trabajo al recargar.
CREATE TABLE IF NOT EXISTS mk_triage (
  marca_id    UUID REFERENCES mk_marcas(id) ON DELETE CASCADE,
  creadora_id UUID REFERENCES mk_creadoras(id) ON DELETE CASCADE,
  decision    TEXT NOT NULL,          -- preseleccionada | descartada
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (marca_id, creadora_id)
);
ALTER TABLE mk_triage ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS mk_triage_marca_idx ON mk_triage(marca_id, decision);

-- -- 3. Campanas ---------------------------------------------------------------
-- Una campana agrupa propuestas bajo un mismo brief y presupuesto. Sin esto,
-- cada propuesta se escribe desde cero.
CREATE TABLE IF NOT EXISTS mk_campanas (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marca_id          UUID REFERENCES mk_marcas(id) ON DELETE CASCADE,
  nombre            TEXT NOT NULL,
  objetivo          TEXT,                    -- lanzamiento | prueba | ugc | siempre_activa
  brief_base        TEXT,
  entregables       TEXT[],                  -- claves de mk_config.entregables
  fecha_inicio      DATE,
  fecha_fin         DATE,                    -- null = siempre abierta
  producto          TEXT,
  exclusividad      TEXT,
  tope_total        NUMERIC(12,2),           -- presupuesto de toda la campana
  tope_por_creadora NUMERIC(12,2),
  imagen_path       TEXT,                    -- portada, en el bucket de muestras
  estado            TEXT DEFAULT 'activa',   -- activa | pausada | cerrada
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE mk_campanas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS mk_campanas_marca_idx ON mk_campanas(marca_id, estado);

-- De que campana salio cada trato. Nulo = propuesta personalizada.
ALTER TABLE mk_tratos
  ADD COLUMN IF NOT EXISTS campana_id UUID REFERENCES mk_campanas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS mk_tratos_campana_idx ON mk_tratos(campana_id);

-- -- 4. Perfil de la marca -----------------------------------------------------
-- Lo que ve la creadora antes de decidir si acepta. La hipotesis del diseno es
-- que un perfil completo sube la tasa de aceptacion.
ALTER TABLE mk_marcas
  ADD COLUMN IF NOT EXISTS logo_path          TEXT,
  ADD COLUMN IF NOT EXISTS bio                TEXT,
  ADD COLUMN IF NOT EXISTS categoria          TEXT,
  ADD COLUMN IF NOT EXISTS instagram          TEXT,
  ADD COLUMN IF NOT EXISTS tiktok             TEXT,
  ADD COLUMN IF NOT EXISTS que_espera         TEXT,
  ADD COLUMN IF NOT EXISTS libertad_creativa  TEXT,   -- alta | media | guion_cerrado
  ADD COLUMN IF NOT EXISTS contacto_creadoras TEXT;

-- Fotos de producto de la marca. Misma idea que mk_muestras pero del otro lado.
CREATE TABLE IF NOT EXISTS mk_marca_productos (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marca_id     UUID REFERENCES mk_marcas(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  mime         TEXT,
  titulo       TEXT,
  orden        SMALLINT DEFAULT 0,
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE mk_marca_productos ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS mk_marca_productos_idx ON mk_marca_productos(marca_id);

-- -- 5. Configuracion del panel -------------------------------------------------
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('rango_presupuesto', '{"min": 200000, "max": 5000000, "paso": 50000}'::jsonb,
   'Limites del deslizador de presupuesto en el catalogo y en la propuesta'),

  ('rango_tope_campana', '{"min": 1000000, "max": 30000000, "paso": 500000}'::jsonb,
   'Limites del tope total de una campana'),

  ('objetivos_campana', '[
    {"clave":"lanzamiento","nombre":"Lanzamiento"},
    {"clave":"prueba","nombre":"Prueba de producto"},
    {"clave":"ugc","nombre":"Banco de UGC"},
    {"clave":"siempre_activa","nombre":"Siempre activa"}
  ]'::jsonb,
   'Objetivos posibles de una campana'),

  ('max_productos_marca', '8'::jsonb,
   'Cuantas fotos de producto puede subir una marca a su perfil')
ON CONFLICT (clave) DO NOTHING;
