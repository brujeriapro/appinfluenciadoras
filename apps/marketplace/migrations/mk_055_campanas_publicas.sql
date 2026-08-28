-- mk_055 · Campañas abiertas a postulación
--
-- Hasta ahora una campaña solo podía ir en un sentido: la marca elegía entre
-- 294 perfiles y las invitaba. Elegir a ciegas es difícil, y se nota — hay 1
-- campaña creada y 0 invitaciones enviadas desde que existe la función.
--
-- Una campaña abierta le da la vuelta: la marca publica lo que necesita, le
-- llega por correo a las creadoras que encajan por nicho y ciudad, y elige
-- entre las que levantaron la mano. Misma tabla y mismo trato al final; lo que
-- cambia es quién arranca.

-- Pública o no. Por defecto no: una campaña que se vuelve visible sin que la
-- marca lo pida es una filtración de su plan de marketing.
alter table mk_campanas add column if not exists publica boolean not null default false;
alter table mk_campanas add column if not exists publicada_at timestamptz;

-- Hasta cuándo se puede postular. Una semana por defecto: más largo y a la
-- creadora se le olvida, más corto y la que abre el correo el martes no alcanza.
alter table mk_campanas add column if not exists postulaciones_hasta timestamptz;

-- A quién le llega. Se guarda en la campaña y no se deduce de la marca porque
-- una misma marca hace campañas para cosas distintas: la del shampoo no le
-- sirve a la misma creadora que la del maquillaje.
alter table mk_campanas add column if not exists busca_nicho text[];
alter table mk_campanas add column if not exists busca_ciudades text[];

-- Cuántas propuestas del plan se cobraron al publicar.
--
-- Publicar cobra los cupos POR ADELANTADO (decisión de María, 28-ago-2026): una
-- campaña de 6 cupos consume 6 propuestas al publicarse, no cuando alguien
-- acepta. Se guarda cuántas fueron porque al cerrar se devuelven las que
-- quedaron sin llenar, y sin este número no se sabría cuántas devolver.
alter table mk_campanas add column if not exists propuestas_cobradas integer not null default 0;
alter table mk_campanas add column if not exists propuestas_devueltas integer not null default 0;

-- Quién empezó: la marca invitando, o la creadora postulándose.
--
-- Es lo que mantiene separadas las dos historias en la misma tabla. Sin esto,
-- al cerrar la campaña no se podría distinguir a quien levantó la mano y se
-- quedó esperando —a esa hay que avisarle— de quien nunca respondió una
-- invitación, a quien decirle "se llenaron los cupos" es ruido.
alter table mk_campana_invitacion
  add column if not exists origen text not null default 'marca';

comment on column mk_campana_invitacion.origen is
  '"marca" (la invitó la marca) o "postulacion" (se postuló ella a una campaña abierta).';

-- Cuándo se postuló. `invitada_at` guarda cuándo la marca la invitó, y para una
-- postulación esa fecha no significa lo mismo.
alter table mk_campana_invitacion add column if not exists postulada_at timestamptz;

-- Una creadora se postula una sola vez por campaña. La llave existía como
-- índice de trabajo; acá se vuelve la regla, porque dos postulaciones de la
-- misma persona ocuparían dos renglones de la lista que mira la marca.
create unique index if not exists mk_campana_invitacion_uniq
  on mk_campana_invitacion (campana_id, creadora_id);

-- Para listar rápido las campañas abiertas que todavía reciben postulaciones.
create index if not exists mk_campanas_publicas_idx
  on mk_campanas (publica, postulaciones_hasta)
  where publica = true;

-- El estado nuevo: se postuló y espera respuesta.
--
-- No entra en la lista original porque esa se escribió cuando la única forma de
-- estar en una campaña era que la marca te invitara. 'postulada' es el
-- equivalente de 'invitada' del otro lado: levantó la mano y espera.
alter table mk_campana_invitacion drop constraint if exists mk_campana_invitacion_estado_check;
alter table mk_campana_invitacion add constraint mk_campana_invitacion_estado_check
  check (estado = any (array[
    'invitada', 'acepto', 'paso', 'confirmada', 'cupos_llenos', 'vencida', 'postulada'
  ]));
