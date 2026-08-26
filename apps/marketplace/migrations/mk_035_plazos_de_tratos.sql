-- Que se cumplan los plazos que la interfaz ya promete.
--
-- El portal dice "72 horas para responder" y "48 horas para aprobar", pero eso
-- solo se mostraba: nada lo ejecutaba. Una propuesta sin contestar se quedaba
-- abierta para siempre mientras la marca esperaba por algo que no iba a pasar.
--
-- Lo ejecuta plazos.js, que se dispara con POST /api/cron/plazos.

-- Marca de que ya se le recordo a la creadora que tiene la propuesta pendiente.
-- Sin esto, cada corrida del cron le mandaria el mismo aviso otra vez.
ALTER TABLE mk_tratos ADD COLUMN IF NOT EXISTS aviso_plazo_at TIMESTAMPTZ;

-- Los plazos pasan a ser configurables. Estaban escritos en el frontend, que es
-- el peor sitio posible: la interfaz podia prometer 72 horas mientras el
-- proceso usaba otro numero, y nadie se enteraria.
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('horas_responder', '72'::jsonb,
   'Horas que tiene la creadora para responder una propuesta antes de que se cierre sola'),
  ('horas_aprobar', '48'::jsonb,
   'Horas que tiene la marca para aprobar una entrega. Solo aplica con auto_aprobar_entrega en true')
ON CONFLICT (clave) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_tratos_estado_fechas
  ON mk_tratos (estado, fecha_solicitud, fecha_entrega);
