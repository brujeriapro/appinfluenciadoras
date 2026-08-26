-- Las vistas promedio van por red, no en dos columnas fijas.
--
-- mk_023 las creo como vistas_promedio_ig y vistas_promedio_tk, que es el mismo
-- error que ya corrigio mk_030 con los seguidores: solo entiende dos redes, y
-- quien vive de YouTube no tiene donde ponerlas. Se cambian ahora porque estan
-- vacias (221 creadoras, cero datos) y no las lee ningun codigo.
--
-- Por que las vistas importan mas que los seguidores: se pueden comprar
-- seguidores, pero es mucho mas dificil comprar vistas sostenidas. Para una
-- marca que va a pagar, "cuanta gente ve de verdad cada publicacion" responde
-- la pregunta que los seguidores solo insinuan. Por eso el catalogo las muestra
-- en lugar del nivel cuando existen.

ALTER TABLE mk_creadora_redes
  ADD COLUMN IF NOT EXISTS vistas_promedio INTEGER CHECK (vistas_promedio >= 0);

ALTER TABLE mk_creadoras DROP COLUMN IF EXISTS vistas_promedio_ig;
ALTER TABLE mk_creadoras DROP COLUMN IF EXISTS vistas_promedio_tk;

-- La columna nueva va al final: CREATE OR REPLACE no deja meterla en medio ni
-- renombrar las que ya existen.
--
-- Las vistas si viajan al catalogo, a diferencia de los seguidores exactos: son
-- el dato que decide una contratacion y no sirven para encontrar a nadie,
-- porque no aparecen escritas en su perfil publico.
CREATE OR REPLACE VIEW mk_redes_publicas AS
SELECT
  r.creadora_id,
  r.red,
  r.es_principal,
  r.seguidores,
  mk_tier_de(r.seguidores) AS tier,
  r.vistas_promedio
FROM mk_creadora_redes r;
