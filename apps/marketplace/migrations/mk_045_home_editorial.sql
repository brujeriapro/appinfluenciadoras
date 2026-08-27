-- mk_045 · El home editorial: colecciones, destacado y qué busca cada marca
--
-- Reemplaza la grilla cruda por una vitrina. Tres piezas, y las tres se llenan
-- A MANO desde el panel admin: el sistema no genera colecciones solo. Es una
-- decisión de producto, no una limitación — lo que hace que la vitrina valga
-- es que alguien eligió, y automatizarlo la vuelve otra grilla ordenada por un
-- puntaje.

-- ── 1 · Colecciones ────────────────────────────────────────────────────────
--
-- Filas horizontales del home: "Las que nunca fallan", "UGC casero que vende",
-- "Ritmo para TikTok". Cada una con su barra de color a la izquierda.

create table if not exists mk_coleccion (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null,
  nombre      text not null,
  descripcion text,
  -- Uno de los tres acentos del sistema. El lima aquí es la excepción a la
  -- regla de "solo dinero": es una barra de 9px que identifica la colección,
  -- no una cifra, y el handoff lo pide así explícitamente.
  color       text not null default '#2323F0',
  orden       int  not null default 0,
  activa      boolean not null default true,
  creada_at   timestamptz default now()
);

create table if not exists mk_coleccion_item (
  id            uuid primary key default gen_random_uuid(),
  coleccion_id  uuid not null references mk_coleccion(id) on delete cascade,
  creadora_id   uuid not null references mk_creadoras(id) on delete cascade,
  orden         int not null default 0,
  unique (coleccion_id, creadora_id)
);

create index if not exists mk_coleccion_item_col_idx
  on mk_coleccion_item (coleccion_id, orden);

-- ── 2 · Contenido destacado del hero ───────────────────────────────────────
--
-- Lo primero que ve una marca al entrar. Se elige una pieza concreta del
-- catálogo, no "la mejor según un puntaje": la calidad entra por los ojos, y
-- quién abre la semana es una decisión editorial.

create table if not exists mk_destacado (
  id          uuid primary key default gen_random_uuid(),
  muestra_id  uuid not null references mk_muestras(id) on delete cascade,
  titulo      text,
  activo      boolean not null default true,
  desde       timestamptz default now(),
  creado_por  text
);

-- Un solo destacado a la vez: el hero es uno. Los anteriores se desactivan.
create unique index if not exists mk_destacado_unico
  on mk_destacado ((activo)) where activo;

-- ── 3 · Qué busca la marca ─────────────────────────────────────────────────
--
-- Las tres o cuatro preguntas del registro. Sin esto, la primera selección de
-- una marca se arma contra nada: el aprendizaje por triage solo empieza a
-- servir cuando ya hay decisiones, y el primer día no las hay.
--
-- Van como columnas y no como tabla aparte porque son una por marca y se leen
-- siempre junto al resto del perfil.

alter table mk_marcas
  add column if not exists busca_que_vende   text,
  add column if not exists busca_canal       text,
  add column if not exists busca_tipo        text,
  add column if not exists busca_presupuesto int,
  add column if not exists busca_completado_at timestamptz;

comment on column mk_marcas.busca_que_vende is
  'Qué vende la marca, en sus palabras. Alimenta la selección curada.';
comment on column mk_marcas.busca_presupuesto is
  'Presupuesto típico por colaboración, en COP. Se compara contra la tarifa mínima de cada perfil.';

alter table mk_coleccion enable row level security;
alter table mk_coleccion_item enable row level security;
alter table mk_destacado enable row level security;
