-- ===========================================================================
-- Creadores.app - mk_008
--
-- Los seguidores se piden por red, no en un total.
--
-- Por que importa: una marca que quiere TikTok necesita saber si la audiencia
-- esta ahi o en Instagram. Un total de 60.000 puede ser 58.000 en Instagram y
-- 2.000 en TikTok, y para esa marca no sirve.
--
-- alcance_total pasa a ser DERIVADO: la suma de las dos redes. Se conserva
-- porque el catalogo filtra por rango sin cruzar columnas, y porque el nivel de
-- alcance se calcula sobre el alcance combinado.
-- ===========================================================================

ALTER TABLE mk_creadoras
  ADD COLUMN IF NOT EXISTS seguidores_instagram INTEGER,
  ADD COLUMN IF NOT EXISTS seguidores_tiktok    INTEGER,
  ADD COLUMN IF NOT EXISTS rango_instagram      TEXT,
  ADD COLUMN IF NOT EXISTS rango_tiktok         TEXT;

COMMENT ON COLUMN mk_creadoras.alcance_total IS 'Derivado: seguidores_instagram + seguidores_tiktok. No editar a mano.';
COMMENT ON COLUMN mk_creadoras.rango_instagram IS 'Rango visible en el catalogo. La cifra exacta nunca se muestra.';

-- Las que ya estan declararon un total sin desglose. Se asume Instagram, que
-- es de donde viene el grueso, y queda para que ellas lo corrijan desde su
-- portal. Es preferible un dato aproximado y editable a uno vacio.
UPDATE mk_creadoras
   SET seguidores_instagram = alcance_total
 WHERE seguidores_instagram IS NULL
   AND alcance_total IS NOT NULL
   AND alcance_total > 0;
