-- ===========================================================================
-- Creators Manager - mk_005
--
-- Las creadoras ahora pueden registrarse solas. Antes solo entraban por el
-- script de importacion o creadas a mano desde el panel.
--
-- El problema que resuelve esta migracion: el @usuario de una creadora vive en
-- la tabla `influencers` del Programa Creadoras de Brujeria, y por eso
-- mk_creadoras no lo tiene — es lo que impide que un bug en el catalogo filtre
-- la identidad. Una creadora que se registra sola no esta en `influencers`, y
-- meterla ahi contaminaria el programa de Brujeria con gente ajena.
--
-- Solucion: una tabla aparte para lo sensible. El catalogo sigue sin poder
-- filtrar nada, porque el dato simplemente no esta en la tabla que consulta.
-- ===========================================================================

-- -- 1. Datos privados de la creadora -----------------------------------------
-- Solo los lee el panel admin y el endpoint que revela el contacto cuando el
-- pago ya esta retenido. Nunca el catalogo.
CREATE TABLE IF NOT EXISTS mk_creadora_privado (
  creadora_id       UUID PRIMARY KEY REFERENCES mk_creadoras(id) ON DELETE CASCADE,
  nombre_real       TEXT,
  instagram_handle  TEXT,
  tiktok_handle     TEXT,
  documento         TEXT,          -- para facturacion, cuando aplique
  banco             TEXT,          -- donde se le consigna
  tipo_cuenta       TEXT,
  numero_cuenta     TEXT,
  updated_at        TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE mk_creadora_privado ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS mk_creadora_privado_ig_idx ON mk_creadora_privado(instagram_handle);

-- -- 2. En que punto va su perfil ----------------------------------------------
-- `visible` dice si sale en el catalogo. Este campo dice POR QUE no sale, para
-- poder decirselo a ella en su portal en vez de dejarla esperando sin saber.
--
--   nueva       -> se registro, todavia no ha puesto tarifas
--   en_revision -> ya tiene tarifas, esperando que el equipo la apruebe
--   aprobada    -> publicada en el catalogo (visible = true)
--   rechazada   -> no entra al banco; motivo_rechazo explica por que
ALTER TABLE mk_creadoras
  ADD COLUMN IF NOT EXISTS estado_perfil   TEXT DEFAULT 'nueva',
  ADD COLUMN IF NOT EXISTS motivo_rechazo  TEXT,
  ADD COLUMN IF NOT EXISTS origen          TEXT DEFAULT 'registro',  -- registro | importacion | admin
  ADD COLUMN IF NOT EXISTS fecha_revision  TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS mk_creadoras_estado_idx ON mk_creadoras(estado_perfil);

-- Las que ya existen quedan coherentes: las publicadas como aprobadas, y las
-- que vinieron del script de importacion marcadas como tales.
UPDATE mk_creadoras SET estado_perfil = 'aprobada' WHERE visible = true AND estado_perfil = 'nueva';
UPDATE mk_creadoras SET origen = 'importacion' WHERE influencer_id IS NOT NULL AND origen = 'registro';

-- -- 3. Recuperacion de contrasena ---------------------------------------------
-- Sirve para los dos lados. Un token de un solo uso con vencimiento corto.
CREATE TABLE IF NOT EXISTS mk_tokens_reset (
  token       TEXT PRIMARY KEY,
  tipo        TEXT NOT NULL,          -- creadora | marca
  usuario_id  UUID NOT NULL,
  expira_at   TIMESTAMP WITH TIME ZONE NOT NULL,
  usado_at    TIMESTAMP WITH TIME ZONE,
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE mk_tokens_reset ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS mk_tokens_reset_usuario_idx ON mk_tokens_reset(usuario_id);

-- -- 4. Configuracion del registro abierto --------------------------------------
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('registro_creadoras_abierto', 'true'::jsonb,
   'Si esta en false, el formulario publico de registro de creadoras deja de aceptar'),
  ('alcance_minimo_registro', '1000'::jsonb,
   'Seguidores minimos declarados para poder registrarse. Se verifica a mano en la revision.')
ON CONFLICT (clave) DO NOTHING;
