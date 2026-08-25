-- ===========================================================================
-- Creators Manager - mk_018
--
-- El codigo de invitaciones deja de colgar del correo y pasa a ser de cada
-- creadora.
--
-- Antes vivia en mk_invitaciones, asi que quien se registro desde Instagram o
-- desde un grupo de WhatsApp no podia invitar a nadie -justo las que llegan
-- por voz a voz, que son las que mas ganas tienen de traer gente-.
--
-- Los codigos viejos siguen sirviendo: validar() busca en los dos sitios, y al
-- registrarse una invitada hereda el codigo que ya habia compartido.
--
-- Ademas baja el minimo de seguidores de 1000 a 500. Ese numero dejaba fuera a
-- 154 personas de la propia base del Programa Creadoras, y contradecia lo que
-- la marca dice en publico sobre que las marcas ya no buscan cuentas grandes.
-- ===========================================================================

ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS codigo_ref TEXT;
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS cupos_ref INTEGER NOT NULL DEFAULT 2;

CREATE UNIQUE INDEX IF NOT EXISTS mk_creadoras_codigo_ref_uniq
  ON mk_creadoras (codigo_ref) WHERE codigo_ref IS NOT NULL;

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('referidos_por_creadora', '2'::jsonb, 'Cuantas creadoras puede invitar cada una')
ON CONFLICT (clave) DO UPDATE SET valor = EXCLUDED.valor;

UPDATE mk_config SET valor = '500'::jsonb WHERE clave = 'alcance_minimo_registro';
