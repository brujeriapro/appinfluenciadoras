-- Catálogo de redes y de niveles, en configuración y no en el código.
--
-- Va aquí para que abrir una red nueva —o cambiar una etiqueta— sea editar una
-- fila, no desplegar. Es la misma razón por la que ya viven aquí los nichos y
-- los entregables.
--
-- OJO: los cortes numéricos de `tiers` están duplicados en mk_tier_de()
-- (mk_032). Cambiar uno sin el otro deja la interfaz diciendo una cosa y la
-- base clasificando otra, sin ningún error visible.

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('redes', '[
    {"clave":"instagram","nombre":"Instagram","arroba":true,"url":"https://instagram.com/"},
    {"clave":"tiktok","nombre":"TikTok","arroba":true,"url":"https://tiktok.com/@"},
    {"clave":"youtube","nombre":"YouTube","arroba":true,"url":"https://youtube.com/@"},
    {"clave":"facebook","nombre":"Facebook","arroba":false,"url":"https://facebook.com/"},
    {"clave":"kwai","nombre":"Kwai","arroba":true,"url":"https://kwai.com/@"},
    {"clave":"pinterest","nombre":"Pinterest","arroba":false,"url":"https://pinterest.com/"},
    {"clave":"twitch","nombre":"Twitch","arroba":false,"url":"https://twitch.tv/"},
    {"clave":"linkedin","nombre":"LinkedIn","arroba":false,"url":"https://linkedin.com/in/"}
  ]'::jsonb,
   'Redes que una creadora puede declarar en su perfil'),

  ('tiers', '[
    {"clave":"ugc","nombre":"UGC","desde":0,"hasta":2999,
     "que_vende":"Contenido para los canales de la marca, no alcance propio"},
    {"clave":"nano","nombre":"Nano","desde":3000,"hasta":9999,
     "que_vende":"Comunidad pequeña y muy cercana"},
    {"clave":"micro","nombre":"Micro","desde":10000,"hasta":49999,
     "que_vende":"El punto donde mejor convierte una recomendación"},
    {"clave":"media","nombre":"Media","desde":50000,"hasta":199999,
     "que_vende":"Alcance amplio con nicho todavía definido"},
    {"clave":"macro","nombre":"Macro","desde":200000,"hasta":null,
     "que_vende":"Alcance masivo"}
  ]'::jsonb,
   'Niveles por seguidores. Se calculan POR RED, no sobre la suma')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;
