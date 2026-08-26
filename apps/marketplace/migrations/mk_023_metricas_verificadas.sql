-- Métricas de alcance más finas, y un estado que dice de dónde salen.
--
-- (Reconstruida a partir del esquema en producción: se aplicó directo sobre la
-- base y no quedó versionada en su momento. El resultado es equivalente.)
--
-- El problema que resuelve: una marca que va a pagar necesita más que un rango
-- de seguidores, pero el número exacto vuelve identificable a la creadora
-- —buscando "12.483 seguidores" se llega a su perfil— y eso rompe el catálogo
-- ciego. La salida son rangos más estrechos más métricas de desempeño, que
-- dicen mucho sobre su alcance real sin delatarla.
--
-- `metricas_estado` es la pieza importante:
--
--   declarado   → lo que ella escribió. Es el punto de partida de todas.
--   verificado  → alguien del equipo comparó contra una captura de sus
--                 Insights (metricas_captura_path).
--   conectado   → vienen de la API de Instagram.
--
-- Los tres niveles existen desde el principio a propósito: Instagram solo
-- entrega métricas de cuentas Business o Creator, y buena parte de la base es
-- nano, donde la cuenta personal es lo normal. Un sistema que solo contemplara
-- "conectado" dejaría fuera justo a las que más lo necesitan.

ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS vistas_promedio_ig      INTEGER;
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS vistas_promedio_tk      INTEGER;
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS audiencia_edad          TEXT;
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS audiencia_ciudad_top    TEXT;
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS publica_por_semana      NUMERIC(4,1);
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS metricas_estado         TEXT NOT NULL DEFAULT 'declarado';
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS metricas_verificadas_at TIMESTAMPTZ;
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS metricas_captura_path   TEXT;

-- Rangos más estrechos que los originales. Con tramos anchos, "10K-100K"
-- juntaba a una nano con una micro consolidada y la marca no podía comparar.
UPDATE mk_config
SET valor = '["1K-3K","3K-6K","6K-10K","10K-20K","20K-50K","50K-100K","100K+"]'::jsonb
WHERE clave = 'rangos_alcance';
