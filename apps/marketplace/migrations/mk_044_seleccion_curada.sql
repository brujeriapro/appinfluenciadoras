-- mk_044 · La selección curada de cada marca
--
-- "Seleccionadas por nuestro equipo para tu búsqueda" tiene que ser verdad: el
-- sistema propone un borrador —encontrar ocho entre doscientas es la parte
-- tediosa— pero una persona revisa, ajusta la razón de cada una y publica. Lo
-- que se automatiza es el trabajo, no el criterio.
--
-- Por eso hay dos estados y no uno: mientras está en borrador la marca no ve
-- nada. Publicar es un acto deliberado de alguien, y `publicada_at` deja
-- constancia de cuándo ocurrió.

create table if not exists mk_seleccion (
  id           uuid primary key default gen_random_uuid(),
  marca_id     uuid not null references mk_marcas(id) on delete cascade,
  estado       text not null default 'borrador'
                 check (estado in ('borrador', 'publicada', 'archivada')),
  -- Qué sabía el sistema cuando se armó: cuántas decisiones de triage tenía la
  -- marca. Sirve para entender después por qué una selección salió floja.
  decisiones_al_armar int default 0,
  nota_interna text,
  creada_at    timestamptz default now(),
  publicada_at timestamptz,
  creada_por   text
);

create table if not exists mk_seleccion_item (
  id           uuid primary key default gen_random_uuid(),
  seleccion_id uuid not null references mk_seleccion(id) on delete cascade,
  creadora_id  uuid not null references mk_creadoras(id) on delete cascade,
  orden        int not null default 0,
  -- La línea de "por qué ella". El sistema la propone y la persona la edita;
  -- es obligatoria al publicar, porque una selección sin razones es una
  -- grilla más y no una recomendación.
  razon        text,
  -- Lo que el sistema calculó, guardado aparte de la razón final. Permite ver
  -- después si el criterio automático acertaba o si siempre lo reescribían.
  razon_sugerida text,
  puntaje      numeric,
  unique (seleccion_id, creadora_id)
);

-- Una sola selección publicada por marca a la vez: la marca ve "tu selección",
-- no un historial. Las anteriores se archivan.
create unique index if not exists mk_seleccion_publicada_unica
  on mk_seleccion (marca_id) where estado = 'publicada';

create index if not exists mk_seleccion_marca_idx on mk_seleccion (marca_id, estado);
create index if not exists mk_seleccion_item_sel_idx on mk_seleccion_item (seleccion_id, orden);

alter table mk_seleccion enable row level security;
alter table mk_seleccion_item enable row level security;

comment on table mk_seleccion is
  'Selección curada por el equipo para una marca. El sistema propone el borrador; una persona lo publica.';
comment on column mk_seleccion_item.razon_sugerida is
  'Lo que propuso el motor de aprendizaje, guardado aparte de la razón publicada para poder medir si acierta.';
