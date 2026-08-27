-- mk_046 · Campañas con cupos
--
-- Un modo nuevo de contratar, al lado de la propuesta individual: la marca
-- escribe UN brief, dice cuántas creadoras busca ("necesito 3"), invita a
-- varias, y confirma entre las que aceptaron hasta llenar los cupos.
--
-- Se extiende mk_campanas en vez de crear otra tabla: una campaña con cupos
-- sigue siendo una campaña —mismo brief, mismo producto, misma marca— y los
-- tratos ya cuelgan de campana_id. Dos tablas para lo mismo obligaría a
-- preguntar "¿de cuál de las dos?" en cada consulta.
--
-- `cupos` nulo = campaña plantilla, el comportamiento que ya existía.

alter table mk_campanas
  add column if not exists cupos                  int,
  add column if not exists monto_creadora         numeric(12,2),
  add column if not exists fecha_entrega          date,
  add column if not exists fecha_limite_respuesta timestamptz;

comment on column mk_campanas.cupos is
  'Cuántas creadoras se buscan. Nulo = campaña plantilla para propuestas individuales.';
comment on column mk_campanas.monto_creadora is
  'Lo que se le ofrece a CADA creadora. Es un monto fijo, no un tope: en una campaña con cupos todas cobran lo mismo.';

-- ── Invitaciones ───────────────────────────────────────────────────────────
--
-- Los estados y por qué existe cada uno:
--
--   invitada      · se le envió, no ha respondido
--   acepto        · dijo que sí, esperando que la marca confirme
--   paso          · dijo que no. Sin drama y sin consecuencia.
--   confirmada    · la marca la eligió. De aquí nace el trato.
--   cupos_llenos  · aceptó y la marca llenó los cupos con otras.
--   vencida       · no respondió antes de la fecha límite.
--
-- `cupos_llenos` NO es un rechazo y así se le dice a la creadora. En este
-- producto no existe señalamiento negativo: que no la eligieran no dice nada
-- de ella, y presentarlo como un "no" la castiga por haber aceptado rápido.

create table if not exists mk_campana_invitacion (
  id            uuid primary key default gen_random_uuid(),
  campana_id    uuid not null references mk_campanas(id) on delete cascade,
  creadora_id   uuid not null references mk_creadoras(id) on delete cascade,
  estado        text not null default 'invitada'
                  check (estado in ('invitada','acepto','paso','confirmada','cupos_llenos','vencida')),
  invitada_at   timestamptz default now(),
  respondida_at timestamptz,
  confirmada_at timestamptz,
  -- El trato que nació de esta invitación, cuando la marca confirma.
  trato_id      uuid references mk_tratos(id) on delete set null,
  nota          text,
  unique (campana_id, creadora_id)
);

create index if not exists mk_campana_inv_campana_idx
  on mk_campana_invitacion (campana_id, estado);
create index if not exists mk_campana_inv_creadora_idx
  on mk_campana_invitacion (creadora_id, estado);
-- Para contar las del mes contra el tope del plan.
create index if not exists mk_campana_inv_fecha_idx
  on mk_campana_invitacion (invitada_at);

alter table mk_campana_invitacion enable row level security;

-- De qué invitación nació un trato.
--
-- Hace falta para NO contar doble contra el plan: cada invitación ya consumió
-- una propuesta al enviarse, así que el trato que sale de ella no puede
-- consumir otra. Sin esta columna habría que adivinar cuáles tratos vinieron
-- de una campaña con cupos y cuáles de una propuesta suelta.
alter table mk_tratos
  add column if not exists invitacion_id uuid references mk_campana_invitacion(id) on delete set null;

create index if not exists mk_tratos_invitacion_idx on mk_tratos (invitacion_id);
