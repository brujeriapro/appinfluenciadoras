-- `colaboraciones_completadas` es la columna por la que se ordena el catálogo:
-- decide a quién ve primero una marca. Hasta hoy se llenaba a mano y estaba en
-- cero para todo el mundo, así que el orden era arbitrario.
--
-- Esta función la trae desde mk_cumplimiento, que es la fuente real. Se llama
-- después de cerrar un trato y al aprobar un perfil; también se puede correr
-- suelta sin hacer daño, porque es idempotente.

CREATE OR REPLACE FUNCTION mk_sincronizar_colaboraciones()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE tocadas integer;
BEGIN
  UPDATE mk_creadoras m
  SET colaboraciones_completadas = c.entregas
  FROM mk_cumplimiento c
  WHERE c.creadora_id = m.id
    AND COALESCE(m.colaboraciones_completadas, 0) IS DISTINCT FROM c.entregas;
  GET DIAGNOSTICS tocadas = ROW_COUNT;
  RETURN tocadas;
END $$;

SELECT mk_sincronizar_colaboraciones();
