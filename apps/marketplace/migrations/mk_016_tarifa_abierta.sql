-- ===========================================================================
-- Creators Manager - mk_016
--
-- La tarifa deja de ser obligatoria para publicarse.
--
-- Ponerse precio es lo que mas traba a una creadora nueva: no sabe cuanto
-- cobrar, teme pedir de mas y que nadie la contrate, o de menos y quedar mal
-- parada. El resultado eran perfiles a medio llenar que nunca llegaban al
-- catalogo. Con `tarifa_abierta` puede publicarse diciendo que el precio se
-- conversa, y ponerle numero despues.
--
-- Sigue sin admitirse el silencio: o hay tarifas, o esta la marca de "a
-- convenir". Lo que no puede pasar es que la marca abra una ficha y no sepa a
-- que atenerse.
-- ===========================================================================

ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS tarifa_abierta BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS recordatorio_at TIMESTAMPTZ;

COMMENT ON COLUMN mk_creadoras.tarifa_abierta IS
  'La creadora prefiere conversar el precio. Permite publicarse sin tarifas fijas.';
