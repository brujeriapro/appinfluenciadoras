-- Perfil de contenido de una creadora, resumido desde el análisis de sus piezas.
--
-- "Domina un formato" no es una opinión: es que ese formato aparece en al menos
-- un tercio de sus piezas analizadas. Con menos que eso, decir que lo domina
-- sería inflar un dato que la marca va a usar para decidir a quién le paga.
--
-- Se exigen al menos 2 piezas analizadas para afirmar nada. Con una sola no hay
-- patrón, hay una anécdota.

CREATE OR REPLACE VIEW mk_perfil_contenido AS
WITH conteos AS (
  SELECT creadora_id, 'formato' AS dim, formato AS valor, count(*) AS n
  FROM mk_analisis_pieza WHERE formato IS NOT NULL GROUP BY creadora_id, formato
  UNION ALL
  SELECT creadora_id, 'escenario', escenario, count(*)
  FROM mk_analisis_pieza WHERE escenario IS NOT NULL GROUP BY creadora_id, escenario
  UNION ALL
  SELECT creadora_id, 'produccion', produccion, count(*)
  FROM mk_analisis_pieza WHERE produccion IS NOT NULL GROUP BY creadora_id, produccion
  UNION ALL
  SELECT creadora_id, 'luz', luz, count(*)
  FROM mk_analisis_pieza WHERE luz IS NOT NULL GROUP BY creadora_id, luz
),
totales AS (
  SELECT creadora_id, count(*) AS piezas,
         round(avg(calidad_tecnica), 1)           AS calidad,
         count(*) FILTER (WHERE producto_visible) AS con_producto,
         count(*) FILTER (WHERE subtitulos)       AS con_subtitulos
  FROM mk_analisis_pieza GROUP BY creadora_id
),
rank AS (
  SELECT c.*, t.piezas,
         round(100.0 * c.n / t.piezas) AS pct,
         row_number() OVER (PARTITION BY c.creadora_id, c.dim ORDER BY c.n DESC, c.valor) AS pos
  FROM conteos c JOIN totales t ON t.creadora_id = c.creadora_id
)
SELECT
  t.creadora_id,
  t.piezas  AS piezas_analizadas,
  t.calidad AS calidad_tecnica,
  t.con_producto,
  t.con_subtitulos,
  -- Solo lo que de verdad se repite: un tercio de sus piezas o más.
  (SELECT array_agg(valor ORDER BY n DESC)
     FROM rank r WHERE r.creadora_id = t.creadora_id AND r.dim = 'formato'
       AND r.pct >= 33 AND t.piezas >= 2)                    AS formatos,
  (SELECT array_agg(valor ORDER BY n DESC)
     FROM rank r WHERE r.creadora_id = t.creadora_id AND r.dim = 'escenario'
       AND r.pct >= 33 AND t.piezas >= 2)                    AS escenarios,
  (SELECT valor FROM rank r WHERE r.creadora_id = t.creadora_id
     AND r.dim = 'produccion' AND r.pos = 1)                 AS produccion,
  (SELECT valor FROM rank r WHERE r.creadora_id = t.creadora_id
     AND r.dim = 'luz' AND r.pos = 1)                        AS luz
FROM totales t;
