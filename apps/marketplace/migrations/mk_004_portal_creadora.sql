-- ===========================================================================
-- Creators Manager - mk_004
--
-- Ajustes que pide el handoff del Portal de la Creadora:
--
-- 1. Los 9 entregables ahora llevan subtitulo, porque la interfaz los muestra
--    ("REEL / INSTAGRAM - 1 PIEZA"). Las claves NO cambian: los precios ya
--    guardados en mk_tarifas siguen apuntando a las mismas.
--
-- 2. Dos condiciones de la colaboracion que el diseno muestra en la grilla del
--    detalle y que hoy solo viven sueltas dentro del texto del brief.
--
-- 3. Los plazos que el diseno anuncia como promesa al usuario. Se guardan en
--    configuracion para que sean ajustables y para que backend y interfaz digan
--    lo mismo. OJO: por ahora solo se MUESTRAN; todavia no hay proceso que los
--    haga cumplir (ver README).
-- ===========================================================================

-- -- 1. Entregables con subtitulo ---------------------------------------------
UPDATE mk_config SET valor = '[
  {"clave":"reel","nombre":"Reel","subtitulo":"Instagram · 1 pieza"},
  {"clave":"tiktok","nombre":"TikTok","subtitulo":"1 video nativo"},
  {"clave":"story","nombre":"Historias","subtitulo":"Pack de 3 · 24h"},
  {"clave":"post","nombre":"Post estático","subtitulo":"Feed · 1 pieza"},
  {"clave":"ugc","nombre":"UGC sin publicar","subtitulo":"Material para la marca"},
  {"clave":"resena","nombre":"Reseña honesta","subtitulo":"Reel largo · 60s+"},
  {"clave":"combo","nombre":"Combo reel + story","subtitulo":"Paquete más pedido"},
  {"clave":"evento","nombre":"Evento o activación","subtitulo":"Presencial"},
  {"clave":"embajadora","nombre":"Embajadora / mes","subtitulo":"4 piezas + exclusividad"}
]'::jsonb,
descripcion = 'Tipos de entregable que una creadora puede publicar con precio propio',
updated_at = now()
WHERE clave = 'entregables';

-- -- 2. Condiciones de la colaboracion ----------------------------------------
-- El diseno las muestra como celdas propias en el detalle de la propuesta.
-- Sacarlas del brief las vuelve consultables y comparables entre tratos.
ALTER TABLE mk_tratos
  ADD COLUMN IF NOT EXISTS producto     TEXT,   -- que producto se promociona
  ADD COLUMN IF NOT EXISTS exclusividad TEXT;   -- 'Sin exclusividad', '30 dias en skincare'...

COMMENT ON COLUMN mk_tratos.producto IS 'Producto o linea que se promociona, visible en el detalle de la propuesta.';
COMMENT ON COLUMN mk_tratos.exclusividad IS 'Condicion de exclusividad pactada. Nulo = sin exclusividad.';

-- -- 3. Plazos que el portal le promete a la creadora --------------------------
-- ATENCION: hoy solo se muestran en la interfaz. No hay cron que expire
-- propuestas ni que auto-apruebe entregas. Antes de prometerselo a creadoras
-- reales hay que implementar ese proceso, o bajar el texto de la interfaz.
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('horas_responder_propuesta', '72'::jsonb,
   'Horas que tiene la creadora para aceptar o rechazar. SOLO INFORMATIVO por ahora.'),
  ('horas_aprobar_entrega', '48'::jsonb,
   'Horas que tiene la marca para aprobar el contenido. SOLO INFORMATIVO por ahora.'),
  ('auto_aprobar_entrega', 'false'::jsonb,
   'Si la entrega se aprueba sola al vencer el plazo. En false hasta que exista el proceso que lo ejecute.'),
  ('horas_pago_tras_aprobar', '48'::jsonb,
   'Horas prometidas para que el pago llegue a la creadora despues de aprobado.')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE mk_tarifas ENABLE ROW LEVEL SECURITY;
