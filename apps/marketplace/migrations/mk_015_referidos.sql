-- Código de referido en la invitación.
--
-- (Reconstruida a partir del esquema en producción: se aplicó directo sobre la
-- base y no quedó versionada en su momento. El resultado es equivalente.)
--
-- Cada invitación lleva su propio código para que quien la recibe pueda traer
-- amigas antes incluso de registrarse. `cupos_ref` arranca en 2: se invita a
-- traer un par de personas, no a repartir el enlace en masa, que es lo que
-- llenaría el catálogo de perfiles sin filtro.
--
-- Cuando ella se registra, su creadora hereda este mismo código —ver
-- mk_018— para que los enlaces ya repartidos sigan funcionando.

ALTER TABLE mk_invitaciones ADD COLUMN IF NOT EXISTS codigo_ref TEXT;
ALTER TABLE mk_invitaciones ADD COLUMN IF NOT EXISTS cupos_ref  INTEGER NOT NULL DEFAULT 2;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mk_invitaciones_codigo_ref
  ON mk_invitaciones (codigo_ref) WHERE codigo_ref IS NOT NULL;
