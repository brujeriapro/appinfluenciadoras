-- Vuelve a correr mk_031 para las creadoras que se registraron entre la
-- migración original y el despliegue del código que ya crea las redes solo.
-- Es idempotente: el ON CONFLICT deja quietas las que ya están.
--
-- Vale la pena volver a correrla si alguna vez se ve una creadora sin nivel en
-- el catálogo — significa que no tiene ninguna fila en mk_creadora_redes.

INSERT INTO mk_creadora_redes (creadora_id, red, seguidores, es_principal)
SELECT c.id, 'instagram', c.seguidores_instagram,
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

UPDATE mk_creadora_redes r SET handle = i.instagram_handle
FROM mk_creadoras c JOIN influencers i ON i.id = c.influencer_id
WHERE r.creadora_id = c.id AND r.red = 'instagram'
  AND r.handle IS NULL AND i.instagram_handle IS NOT NULL;
