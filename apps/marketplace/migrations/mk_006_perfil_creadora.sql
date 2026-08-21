-- ===========================================================================
-- Creadores.app - mk_006
--
-- La creadora completa su propio perfil: nicho, redes, bio y su trabajo. El
-- equipo pasa de llenar datos a solo revisar y aprobar.
--
-- Ademas se prepara el terreno para la verificacion de metricas via Instagram:
-- hoy los seguidores los declara ella, manana vendran de Meta. El campo que
-- distingue una cosa de otra se agrega desde ya para no tener que migrar
-- despues, aunque la conexion todavia no exista.
-- ===========================================================================

-- -- 1. De donde salen las metricas -------------------------------------------
--   declarado  -> lo escribio ella (unico valor posible hoy)
--   verificado -> vino de la API de Meta con su autorizacion
--
-- La landing promete "metricas reales, no capturas". Mientras todo sea
-- declarado, esa promesa no se cumple; este campo es lo que permitira
-- distinguirlo en el catalogo en vez de mentir por igual sobre todas.
ALTER TABLE mk_creadoras
  ADD COLUMN IF NOT EXISTS fuente_metricas     TEXT DEFAULT 'declarado',
  ADD COLUMN IF NOT EXISTS fecha_verificacion  TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS perfil_completo_at  TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN mk_creadoras.fuente_metricas IS 'declarado | verificado. Verificado = vino de la API de Meta.';

-- Cuenta de Instagram/TikTok conectada, cuando exista la integracion.
ALTER TABLE mk_creadora_privado
  ADD COLUMN IF NOT EXISTS ig_user_id        TEXT,
  ADD COLUMN IF NOT EXISTS ig_token          TEXT,
  ADD COLUMN IF NOT EXISTS ig_token_expira   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS ig_tipo_cuenta    TEXT;   -- BUSINESS | CREATOR | PERSONAL

CREATE INDEX IF NOT EXISTS mk_creadoras_fuente_idx ON mk_creadoras(fuente_metricas);

-- -- 2. Quien subio cada pieza --------------------------------------------------
-- Ahora la creadora sube su propio trabajo; antes solo el equipo.
ALTER TABLE mk_muestras
  ADD COLUMN IF NOT EXISTS subida_por  TEXT DEFAULT 'admin',   -- creadora | admin
  ADD COLUMN IF NOT EXISTS titulo      TEXT,                   -- "Reel para X marca"
  ADD COLUMN IF NOT EXISTS origen_url  TEXT;                   -- de que post salio, uso interno

COMMENT ON COLUMN mk_muestras.origen_url IS 'Post del que salio la pieza. USO INTERNO: nunca se sirve al catalogo, delataria el perfil.';

-- -- 3. Limites --------------------------------------------------------------
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('max_muestras_por_creadora', '6'::jsonb,
   'Cuantas piezas de muestra puede tener publicadas una creadora'),
  ('instagram_conexion_activa', 'false'::jsonb,
   'Enciende el boton de conectar Instagram. En false hasta que la app de Meta pase revision.')
ON CONFLICT (clave) DO NOTHING;
