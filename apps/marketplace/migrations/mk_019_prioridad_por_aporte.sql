-- ===========================================================================
-- Creators Manager - mk_019
--
-- Prioridad: lo que gana una creadora por traer a otras al banco.
--
-- Existe para que la promesa que se le hace sea cierta. Sirve para dos cosas
-- concretas, y solo para esas dos:
--
--   1. Desempate en el catalogo. El orden principal sigue siendo lo que le
--      importa a la marca -colaboraciones cumplidas-; entre perfiles
--      equivalentes sale antes quien aporto al banco. Al reves le estariamos
--      mostrando peores opciones primero a quien paga.
--
--   2. Orden de acceso a las campanas cuando se abra a las marcas. Ver primero
--      es elegir primero, y eso vale sin costar dinero.
--
-- Sube solo cuando la referida queda PUBLICADA, no cuando se registra: asi
-- nadie invita por invitar y el volumen no se come la calidad del banco.
-- ===========================================================================

ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS prioridad INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS mk_creadoras_prioridad_idx
  ON mk_creadoras (prioridad DESC) WHERE visible = true;

COMMENT ON COLUMN mk_creadoras.prioridad IS
  'Puntos por aportar al banco. Desempata el catalogo y ordena el acceso a campanas.';

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('prioridad_por_referida', '10'::jsonb,
   'Cuanta prioridad gana una creadora por cada referida que queda publicada')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
