-- Clasificación de creadoras por lo que de verdad venden.
--
-- El corte importante es el de 3.000: por debajo de eso nadie está comprando
-- alcance. Lo que compra es contenido para usar en los canales de la marca y en
-- pauta, que es un trabajo distinto, se produce distinto y se cobra distinto.
-- Llamar "nano influencer" a alguien con 800 seguidores obliga a la marca a
-- evaluarla con la vara equivocada, y a ella a competir en una liga que no es
-- la suya.
--
-- UGC no es el escalón de las que no llegaron: es una categoría con demanda
-- propia y creciente. Al crearse esta migración eran 74 de 192 perfiles.
--
-- El nivel sale de la RED PRINCIPAL, no de la suma ni del máximo. Quien tiene
-- 40.000 en TikTok es micro en TikTok, y la marca que quiere TikTok necesita
-- ver ese número, no un promedio que no aplica a nada.
--
-- Los cortes están aquí y también en mk_config.tiers (mk_033). Son la misma
-- verdad en dos sitios y no avisan cuando se separan: si se mueve uno, mover
-- el otro.

CREATE OR REPLACE FUNCTION mk_tier_de(seguidores INTEGER)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $func$
  SELECT CASE
    WHEN seguidores IS NULL  THEN NULL
    WHEN seguidores <   3000 THEN 'ugc'
    WHEN seguidores <  10000 THEN 'nano'
    WHEN seguidores <  50000 THEN 'micro'
    WHEN seguidores < 200000 THEN 'media'
    ELSE                          'macro'
  END
$func$;

-- Redes de una creadora tal como puede verlas una marca.
--
-- Sin handle. No es descuido: el handle es exactamente lo que rompería la
-- identidad oculta del catálogo, así que no existe en el camino por donde el
-- catálogo lee. Si algún día un `select *` se cuela, aquí no hay nada que
-- filtrar.
CREATE OR REPLACE VIEW mk_redes_publicas AS
SELECT
  r.creadora_id,
  r.red,
  r.es_principal,
  r.seguidores,
  mk_tier_de(r.seguidores) AS tier
FROM mk_creadora_redes r;

-- Un renglón por creadora con su red principal ya resuelta, para no repetir el
-- mismo JOIN en cada consulta del catálogo.
CREATE OR REPLACE VIEW mk_clasificacion AS
SELECT
  c.id                       AS creadora_id,
  p.red                      AS red_principal,
  p.seguidores               AS seguidores_principal,
  mk_tier_de(p.seguidores)   AS tier,
  -- Cuántas redes declaró: le dice a la marca si es de una sola plataforma o
  -- si puede publicar en varias con el mismo trato.
  (SELECT count(*) FROM mk_creadora_redes r WHERE r.creadora_id = c.id) AS redes_declaradas,
  (SELECT array_agg(r.red ORDER BY r.seguidores DESC NULLS LAST)
     FROM mk_creadora_redes r WHERE r.creadora_id = c.id)               AS redes
FROM mk_creadoras c
LEFT JOIN mk_creadora_redes p ON p.creadora_id = c.id AND p.es_principal;
