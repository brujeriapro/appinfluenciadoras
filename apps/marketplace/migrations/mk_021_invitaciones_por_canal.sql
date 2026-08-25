-- ===========================================================================
-- Creators Manager - mk_021
--
-- Las invitaciones distinguen el canal: correo o WhatsApp.
--
-- Una misma persona puede recibir los dos. Son dos toques distintos y el
-- segundo -WhatsApp- es el que mas convierte en Colombia, donde un correo
-- muchas veces ni se abre.
--
-- El indice unico era solo por correo, asi que anotar el WhatsApp chocaba con
-- la invitacion ya enviada por mail. Ahora es por (correo, canal): sigue sin
-- poder escribirsele dos veces por el mismo medio.
-- ===========================================================================

ALTER TABLE mk_invitaciones ADD COLUMN IF NOT EXISTS canal TEXT NOT NULL DEFAULT 'correo';
ALTER TABLE mk_invitaciones ADD COLUMN IF NOT EXISTS telefono TEXT;

DROP INDEX IF EXISTS mk_invitaciones_email_uniq;

CREATE UNIQUE INDEX IF NOT EXISTS mk_invitaciones_email_canal_uniq
  ON mk_invitaciones (lower(email), canal);

CREATE INDEX IF NOT EXISTS mk_invitaciones_canal_idx ON mk_invitaciones (canal);

COMMENT ON COLUMN mk_invitaciones.canal IS 'correo | whatsapp';
