-- Pasa lo que ya declararon las creadoras a la tabla nueva.
--
-- Las columnas viejas (seguidores_instagram / seguidores_tiktok) se dejan
-- quietas a propósito: parte del código todavía las lee, y romperlas en la
-- misma migración dejaría el sitio caído hasta que salga el código nuevo. Se
-- retiran cuando ya nada las consulte.
--
-- Solo se migra lo que tiene número mayor que cero. Un 0 en TikTok no significa
-- "tiene TikTok con cero seguidores", significa que no lo llenó.

INSERT INTO mk_creadora_redes (creadora_id, red, seguidores, es_principal)
SELECT c.id, 'instagram', c.seguidores_instagram,
       -- Principal la más grande de las dos; ante empate, Instagram, que es
       -- donde casi todas las marcas colombianas miran primero.
       COALESCE(c.seguidores_instagram, 0) >= COALESCE(c.seguidores_tiktok, 0)
FROM mk_creadoras c
WHERE COALESCE(c.seguidores_instagram, 0) > 0
ON CONFLICT (creadora_id, red) DO NOTHING;

INSERT INTO mk_creadora_redes (creadora_id, red, seguidores, es_principal)
SELECT c.id, 'tiktok', c.seguidores_tiktok,
       COALESCE(c.seguidores_tiktok, 0) > COALESCE(c.seguidores_instagram, 0)
FROM mk_creadoras c
WHERE COALESCE(c.seguidores_tiktok, 0) > 0
ON CONFLICT (creadora_id, red) DO NOTHING;

-- El handle ya existe en el Programa Creadoras: traerlo evita pedírselo otra
-- vez a las 116 que vienen de allá.
UPDATE mk_creadora_redes r
SET handle = i.instagram_handle
FROM mk_creadoras c JOIN influencers i ON i.id = c.influencer_id
WHERE r.creadora_id = c.id AND r.red = 'instagram'
  AND r.handle IS NULL AND i.instagram_handle IS NOT NULL;

UPDATE mk_creadora_redes r
SET handle = i.tiktok_handle
FROM mk_creadoras c JOIN influencers i ON i.id = c.influencer_id
WHERE r.creadora_id = c.id AND r.red = 'tiktok'
  AND r.handle IS NULL AND i.tiktok_handle IS NOT NULL;

-- Comprobación posterior: nadie puede quedar sin principal, sería una creadora
-- sin nivel.
--   SELECT count(*) FROM (SELECT creadora_id, count(*) FILTER (WHERE es_principal) p
--     FROM mk_creadora_redes GROUP BY creadora_id) x WHERE p <> 1;
