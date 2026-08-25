-- ===========================================================================
-- Creators Manager - mk_017
--
-- Detalle opcional del producto y de la exclusividad en la propuesta.
--
-- "ENVIADO" no le dice a la creadora que le va a llegar, y "30 dias" no le
-- dice con quien no puede trabajar. Lo segundo es lo que mas hace rechazar una
-- propuesta: nadie acepta renunciar a algo que no sabe que es.
--
-- Los dos son opcionales. Quien no los llene queda como estaba.
-- ===========================================================================

ALTER TABLE mk_tratos ADD COLUMN IF NOT EXISTS producto_detalle TEXT;
ALTER TABLE mk_tratos ADD COLUMN IF NOT EXISTS exclusividad_detalle TEXT;

COMMENT ON COLUMN mk_tratos.producto_detalle IS
  'Que producto exactamente, en palabras de la marca. Opcional.';
COMMENT ON COLUMN mk_tratos.exclusividad_detalle IS
  'Con que rubro o marcas no puede trabajar durante la exclusividad. Opcional.';
