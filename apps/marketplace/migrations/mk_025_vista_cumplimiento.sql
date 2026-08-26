-- Historial de cumplimiento por creadora: la mitad de la promesa del producto
-- que dice "te decimos si cumple".
--
-- Es una vista y no columnas guardadas a propósito: el historial cambia cada
-- vez que alguien entrega, y una columna que hay que recalcular se desactualiza
-- en silencio. Con 167 creadoras el costo de calcularla en vivo es irrelevante.
--
-- Dos fuentes, porque la historia de una creadora viene de dos lados:
--   · Programa Creadoras (gifting) — recibió kit, ¿publicó?
--   · Marketplace (tratos pagos)   — ¿entregó dentro del plazo pactado?
--
-- Reglas explícitas, para que el sello sea defendible frente a una creadora
-- que pregunte por qué le aparece lo que le aparece:
--
--   A TIEMPO (gifting)  → publicó dentro de 30 días de despachado el kit.
--                         La mediana real de la base es 20 días, así que 30 es
--                         un plazo holgado, no una trampa.
--   A TIEMPO (trato)    → entregó en o antes de fecha_entrega_esperada.
--   INCUMPLIDA          → pasaron más de 45 días desde el envío y nunca publicó.
--   NO SE CUENTA        → ella reportó que el paquete no llegó. No se castiga a
--                         nadie por una falla de la transportadora.
--
-- La vista devuelve solo conteos y el id de la creadora: nada que permita
-- identificarla. Por eso puede viajar al catálogo sin romper la regla de
-- identidad oculta.

CREATE OR REPLACE VIEW mk_cumplimiento AS
WITH gifting AS (
  SELECT
    m.id AS creadora_id,
    CASE WHEN i.fecha_envio IS NOT NULL
          AND COALESCE(i.paquete_no_llego, false) = false THEN 1 ELSE 0 END AS kit_recibido,
    (SELECT min(c.fecha_submision)::date FROM contenidos c WHERE c.influencer_id = i.id) AS entrega,
    (SELECT count(*) FROM contenidos c WHERE c.influencer_id = i.id)                     AS piezas,
    i.fecha_envio,
    COALESCE(i.paquete_no_llego, false) AS paquete_perdido
  FROM mk_creadoras m
  JOIN influencers i ON i.id = m.influencer_id
),
g AS (
  SELECT
    creadora_id,
    CASE WHEN entrega IS NOT NULL THEN 1 ELSE 0 END AS entregada,
    CASE WHEN entrega IS NOT NULL AND fecha_envio IS NOT NULL
         THEN (entrega - fecha_envio) END                                       AS dias,
    CASE WHEN entrega IS NOT NULL AND fecha_envio IS NOT NULL
          AND (entrega - fecha_envio) <= 30 THEN 1 ELSE 0 END                   AS a_tiempo,
    CASE WHEN entrega IS NULL AND kit_recibido = 1 AND paquete_perdido = false
          AND fecha_envio < current_date - 45 THEN 1 ELSE 0 END                 AS incumplida,
    piezas
  FROM gifting
),
t AS (
  SELECT
    creadora_id,
    count(*) FILTER (WHERE estado IN ('aprobado','pagado','cerrado'))            AS tratos_completados,
    count(*) FILTER (WHERE estado IN ('aprobado','pagado','cerrado')
                       AND fecha_entrega IS NOT NULL
                       AND fecha_entrega_esperada IS NOT NULL
                       AND fecha_entrega::date <= fecha_entrega_esperada)        AS tratos_a_tiempo,
    count(*) FILTER (WHERE estado = 'pago_retenido'
                       AND fecha_entrega_esperada < current_date)                AS tratos_vencidos
  FROM mk_tratos GROUP BY creadora_id
)
SELECT
  m.id AS creadora_id,

  COALESCE(g.entregada, 0) + COALESCE(t.tratos_completados, 0)        AS entregas,
  COALESCE(g.a_tiempo, 0)  + COALESCE(t.tratos_a_tiempo, 0)           AS entregas_a_tiempo,
  COALESCE(g.incumplida, 0) + COALESCE(t.tratos_vencidos, 0)          AS incumplidas,
  g.dias                                                              AS dias_primera_entrega,
  COALESCE(g.piezas, 0)                                               AS piezas_publicadas,

  -- Nivel de confianza. Nunca inventa: sin datos dice que no hay datos.
  CASE
    WHEN COALESCE(g.entregada,0) + COALESCE(t.tratos_completados,0) >= 3 THEN 'comprobado'
    WHEN COALESCE(g.entregada,0) + COALESCE(t.tratos_completados,0) >= 1 THEN 'parcial'
    WHEN COALESCE(g.incumplida,0) + COALESCE(t.tratos_vencidos,0)   >= 1 THEN 'pendiente'
    ELSE 'sin_historial'
  END                                                                 AS confianza
FROM mk_creadoras m
LEFT JOIN g ON g.creadora_id = m.id
LEFT JOIN t ON t.creadora_id = m.id;
