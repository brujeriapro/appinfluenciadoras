-- Una creadora tiene las redes que tiene, no dos columnas fijas.
--
-- Hasta hoy el perfil solo entendía Instagram y TikTok, y el resultado se ve en
-- los datos: 185 de 192 llenaron las dos. No es que todas trabajen ambas — es
-- que el formulario no ofrecía otra salida, así que rellenaron. Con una tabla
-- puede declarar solo la que de verdad trabaja, y sumar YouTube, Kwai o las que
-- vengan sin tocar el esquema.
--
-- OJO CON EL HANDLE. Aquí sí se guarda —hace falta para verificarla— pero es lo
-- que delataría su identidad en el catálogo, que es la promesa central del
-- producto. Por eso el catálogo NO lee esta tabla: lee la vista
-- mk_redes_publicas (mk_032), que no tiene la columna. Es la misma protección
-- estructural que ya mantiene instagram_handle fuera de mk_creadoras.

CREATE TABLE IF NOT EXISTS mk_creadora_redes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creadora_id  UUID NOT NULL REFERENCES mk_creadoras(id) ON DELETE CASCADE,
  red          TEXT NOT NULL,
  handle       TEXT,
  seguidores   INTEGER CHECK (seguidores >= 0),
  -- Su red principal: la que trabaja de verdad y de la que sale su nivel.
  es_principal BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (creadora_id, red)
);

ALTER TABLE mk_creadora_redes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_redes_creadora ON mk_creadora_redes (creadora_id);

-- Una sola principal por creadora. Sin esto, dos principales harían que el
-- nivel dependiera del orden en que Postgres devuelva las filas: la misma
-- creadora saldría micro o nano según el día.
CREATE UNIQUE INDEX IF NOT EXISTS idx_redes_una_principal
  ON mk_creadora_redes (creadora_id) WHERE es_principal;
