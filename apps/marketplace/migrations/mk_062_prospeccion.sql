-- mk_062 · El agente de prospección
--
-- Marcas a las que queremos llegarle, en qué va cada una y qué se le ha dicho.
-- El objetivo no es mandar mensajes: es llenar una agenda de reuniones. Por eso
-- el estado que importa es `reunion`, no `contactado`.
--
-- ── Por qué tabla aparte y no mk_marcas ────────────────────────────────────
--
-- Una marca de mk_marcas ya se registró: tiene clave, plan y sesión. Un
-- prospecto es alguien que todavía no sabe que existimos. Mezclarlos obligaría
-- a preguntar "¿esta es cliente o es alguien a quien le estamos escribiendo?"
-- en cada consulta, y el día que se nos olvide preguntarlo le vamos a mandar
-- publicidad de captación a una clienta que ya paga.
--
-- Cuando un prospecto se registra, se enlaza por `marca_id` y su historia
-- queda: es lo que permite saber qué mensaje trajo a quién.
--
-- ── Lo que este esquema protege ────────────────────────────────────────────
--
-- `no_contactar` es una puerta de una sola dirección: una vez en true, no se
-- vuelve a poner en false desde el código. Alguien que pidió que no le
-- escribamos no vuelve a la cadencia porque cambió de estado o porque se
-- reimportó una lista.

begin;

create table if not exists mk_prospectos (
  id           uuid primary key default gen_random_uuid(),

  -- Quién es
  nombre       text not null,
  sitio_web    text,
  instagram    text,
  email        text,
  telefono     text,
  ciudad       text,
  pais         text default 'CO',
  categoria    text,

  -- De dónde salió. Importa para saber qué fuente rinde y cuál no vale la pena.
  fuente       text not null default 'manual'
                 check (fuente in ('manual','creadora','contenido','busqueda','lista','referido')),
  -- Si una creadora del catálogo ya trabajó con esta marca, acá está. Es la
  -- señal más valiosa del sistema: permite llegar presentada y no en frío.
  creadora_id  uuid references mk_creadoras(id) on delete set null,

  -- Qué sabemos, para poder escribir algo cierto en vez de una plantilla
  notas        text,
  razon        text,               -- por qué le escribiríamos a ESTA marca
  puntaje      int not null default 0,
  puntaje_porque text[],

  -- Dónde va
  estado       text not null default 'nuevo'
                 check (estado in ('nuevo','investigado','contactado','respondio',
                                   'reunion','cliente','no_interesa','agotado')),
  canal        text check (canal in ('correo','whatsapp','instagram','linkedin')),

  -- La cadencia
  toques_enviados int not null default 0,
  primer_toque_at timestamptz,
  ultimo_toque_at timestamptz,
  respondio_at    timestamptz,
  reunion_at      timestamptz,

  -- ⚠️ Una vez en true no vuelve a false. Ver el comentario de arriba.
  no_contactar boolean not null default false,
  motivo_no_contactar text,

  -- Si terminó registrándose
  marca_id     uuid references mk_marcas(id) on delete set null,

  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

comment on table mk_prospectos is
  'Marcas a las que le estamos escribiendo para conseguir reuniones. Separada de mk_marcas: acá está quien todavía no es cliente.';
comment on column mk_prospectos.creadora_id is
  'La creadora del catálogo que ya trabajó con esta marca. Permite llegar presentada en vez de en frío.';
comment on column mk_prospectos.no_contactar is
  'Pidió que no le escribamos. Puerta de una sola dirección: el código nunca la devuelve a false.';

-- Un correo o un teléfono no puede estar dos veces: reimportar una lista no
-- puede convertirse en escribirle dos veces a la misma persona el mismo día.
create unique index if not exists mk_prospectos_email_idx
  on mk_prospectos (lower(email)) where email is not null;
create unique index if not exists mk_prospectos_tel_idx
  on mk_prospectos (telefono) where telefono is not null;

create index if not exists mk_prospectos_estado_idx  on mk_prospectos (estado, puntaje desc);
create index if not exists mk_prospectos_cadencia_idx on mk_prospectos (estado, ultimo_toque_at)
  where no_contactar = false;

-- ── Cada mensaje que sale ──────────────────────────────────────────────────
--
-- Se guarda el texto completo, no solo que se envió. Sin eso no se puede saber
-- qué mensaje trajo reuniones y cuál no — que es lo único que hace mejorar
-- esto con el tiempo. Y evita repetirle a alguien lo mismo palabra por palabra.
create table if not exists mk_prospecto_toques (
  id           uuid primary key default gen_random_uuid(),
  prospecto_id uuid not null references mk_prospectos(id) on delete cascade,
  toque        int not null,
  tipo         text,               -- presentacion · recordatorio · valor · cierre
  canal        text not null,
  asunto       text,
  cuerpo       text,
  enviado_at   timestamptz,
  -- Falso cuando el envío falló. Se guarda igual: un mensaje que no salió es
  -- justo el que hay que reintentar, y sin registro se pierde en silencio.
  ok           boolean,
  error        text,
  -- Para los canales que no se automatizan: queda listo y esperando a que una
  -- persona lo mande.
  aprobado_por text,
  created_at   timestamptz default now(),

  unique (prospecto_id, toque)
);

create index if not exists mk_prosp_toques_idx on mk_prospecto_toques (prospecto_id, toque);

-- ── Las respuestas ─────────────────────────────────────────────────────────
create table if not exists mk_prospecto_respuestas (
  id           uuid primary key default gen_random_uuid(),
  prospecto_id uuid not null references mk_prospectos(id) on delete cascade,
  canal        text,
  texto        text,
  recibida_at  timestamptz default now(),
  created_at   timestamptz default now()
);

create index if not exists mk_prosp_resp_idx on mk_prospecto_respuestas (prospecto_id, recibida_at desc);

-- ── Los topes, donde se puedan cambiar sin desplegar ───────────────────────
insert into mk_config (clave, valor, descripcion)
values (
  'prospeccion',
  '{"activa": false, "tope_correo_dia": 40, "tope_whatsapp_dia": 25, "tope_instagram_dia": 20, "tope_linkedin_dia": 15}'::jsonb,
  'Agente de prospección. Arranca APAGADA a propósito: se prende cuando los mensajes estén revisados.'
)
on conflict (clave) do nothing;

commit;

-- ── Las marcas que cada creadora ya conoce ─────────────────────────────────
--
-- La mejor fuente de prospectos que existe, y la única que crece sola: cada
-- creadora que entra trae las marcas con las que ha trabajado. Son marcas que
-- YA contratan creadoras —probado, no supuesto— y que se pueden contactar
-- diciendo quién nos habló de ellas.
--
-- Lo llena la creadora desde su portal, no el equipo. Nadie más sabe con quién
-- ha trabajado.

begin;

create table if not exists mk_creadora_marcas (
  id              uuid primary key default gen_random_uuid(),
  creadora_id     uuid not null references mk_creadoras(id) on delete cascade,
  marca_nombre    text not null,
  marca_instagram text,
  marca_sitio     text,
  -- Para poder decir "trabajó con ellos el año pasado" en vez de solo "los
  -- conoce". Opcional: pedir demasiado hace que no llenen ninguno.
  cuando          text,
  -- Si ya la contactamos por acá, para no volver a proponerla.
  prospecto_id    uuid references mk_prospectos(id) on delete set null,
  created_at      timestamptz default now(),

  -- La misma creadora no reporta dos veces la misma marca.
  unique (creadora_id, marca_nombre)
);

comment on table mk_creadora_marcas is
  'Marcas con las que cada creadora ya trabajó. La mejor fuente de prospectos: permite llegar presentada en vez de en frío.';

create index if not exists mk_creadora_marcas_idx on mk_creadora_marcas (creadora_id);

-- ── Marca detectada en el contenido ────────────────────────────────────────
--
-- El análisis ya guarda si la etiqueta del producto era legible, pero no de
-- qué marca. Con esta columna, cada pieza donde se lea una etiqueta se
-- convierte en un prospecto — y viene con la creadora que la grabó.
--
-- Queda vacía hasta que se vuelva a correr el análisis con el prompt ampliado.
alter table mk_analisis_pieza
  add column if not exists marca_detectada text;

comment on column mk_analisis_pieza.marca_detectada is
  'Marca visible en la pieza, cuando la etiqueta es legible. Alimenta el buscador de prospectos.';

create index if not exists mk_analisis_marca_idx on mk_analisis_pieza (marca_detectada)
  where marca_detectada is not null;

commit;
