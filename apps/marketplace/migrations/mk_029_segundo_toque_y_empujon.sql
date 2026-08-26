-- Dos marcas de "a esta persona ya le escribimos por este motivo".
--
-- Sin ellas, cada vez que se corriera el segundo toque o el empujón de
-- referidos, le llegaría de nuevo a quien ya lo recibió. Insistir dos veces con
-- el mismo argumento no convence a nadie, y sí quema el dominio con Gmail.
--
-- Son fechas y no booleanos a propósito: saber CUÁNDO se le escribió permite
-- medir si el segundo toque sirvió, comparando registros antes y después.

-- Segundo toque a quien recibió invitación y nunca creó su perfil.
-- De cada tres invitadas se registró una; las otras dos son el grupo más barato
-- que hay para crecer, porque ya saben qué es esto.
ALTER TABLE mk_invitaciones ADD COLUMN IF NOT EXISTS segundo_toque_at TIMESTAMPTZ;

-- Empujón a quien ya está adentro para que use sus dos invitaciones. El enlace
-- viaja en el correo de bienvenida, se lee una vez y se olvida: hay cientos de
-- cupos intactos.
ALTER TABLE mk_creadoras ADD COLUMN IF NOT EXISTS referidos_empujon_at TIMESTAMPTZ;
