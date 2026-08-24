-- ===========================================================================
-- Creators Manager - mk_014
--
-- Registro de a quien ya se le mando la invitacion al marketplace.
--
-- Por que hace falta una tabla y no basta con "mandar y ya": son 707 correos
-- repartidos en varios dias, con un limite diario del proveedor. Si a mitad de
-- una tanda se cae la conexion, se agota la cuota o alguien para el script, hay
-- que poder retomar sin volver a escribirle a quien ya recibio. Recibir la
-- misma invitacion dos veces se lee como spam, y con estas 707 personas la
-- relacion vale mas que la prisa.
--
-- Tambien deja ver que funciono: cuantas de las invitadas terminaron
-- registrandose, por ola. Eso decide si el correo sirve o hay que reescribirlo
-- antes de gastar la siguiente tanda.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS mk_invitaciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- A quien. El id del Programa Creadoras, para poder cruzar despues.
  influencer_id  UUID,
  email          TEXT NOT NULL,
  nombre         TEXT,

  -- En que tanda salio y con que estado venia del programa
  ola            INTEGER NOT NULL DEFAULT 1,
  status_origen  TEXT,

  -- Que paso. `enviada_at` nulo con `error` lleno = intentada y fallida.
  enviada_at     TIMESTAMPTZ,
  error          TEXT,

  -- Se lleno el circulo: esta creadora se registro despues de la invitacion
  registrada_at  TIMESTAMPTZ,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una invitacion por correo. Es la red de seguridad de verdad: aunque el script
-- se corra dos veces por error, la base no deja escribir dos veces a la misma
-- persona.
CREATE UNIQUE INDEX IF NOT EXISTS mk_invitaciones_email_uniq
  ON mk_invitaciones (lower(email));

CREATE INDEX IF NOT EXISTS mk_invitaciones_ola_idx ON mk_invitaciones (ola);

ALTER TABLE mk_invitaciones ENABLE ROW LEVEL SECURITY;
