-- Marca de que ya se le explico a esta creadora como subir en el catalogo.
--
-- Sin esto, cada corrida le mandaria el mismo correo otra vez. Y este en
-- particular pierde todo su valor repetido: dice "esto es lo que te falta", asi
-- que recibirlo dos veces sugiere que nadie esta mirando.

ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS ranking_aviso_at TIMESTAMPTZ;
