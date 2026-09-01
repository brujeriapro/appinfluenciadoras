-- mk_059 · Canvas UGC
--
-- Un modelo de contratación nuevo, al lado del trato único y de las campañas con
-- cupos. Una marca contrata a una creadora para que grabe y publique videos en
-- una cuenta social QUE ES DE LA MARCA, no en el perfil de la creadora. La
-- cuenta se construye alrededor de un nicho —«mujeres con rizos que odian el
-- frizz»— y tiene que parecer un perfil de persona, no de empresa.
--
-- Vocabulario, y se usa este y no sinónimos:
--   cuenta canvas · la cuenta social de la marca donde se publica
--   operadora     · la creadora que la opera. Sale su cara, pero nada sale de su
--                   perfil personal y sus seguidores nunca lo ven
--   programa      · el acuerdo recurrente entre una marca y una operadora
--   ciclo         · el periodo que se liquida y se paga (quincenal o mensual)
--   pieza         · un video publicado
--
-- ── Por qué tablas nuevas y no mk_tratos ────────────────────────────────────
--
-- mk_tratos tiene 39 columnas y TODAS sus fechas están en singular:
-- fecha_entrega, fecha_aprobacion, fecha_pago_creadora, fecha_cierre. No es que
-- le falten columnas: su forma dice «esto pasa una vez». Un programa de tres
-- meses con 20 videos mensuales son 60 piezas y 6 liquidaciones. Meterlo ahí
-- obligaría a un trato por ciclo, y se perdería lo único que hace valioso el
-- modelo: que es una relación, no seis encargos sueltos.
--
-- ── Lo que este modelo NO tiene, y es a propósito ───────────────────────────
--
-- No hay bono por vistas ni columnas de métricas (decisión de María,
-- 31-ago-2026). Se paga una tarifa fija por pieza publicada y ya. Eso borró de
-- un golpe las fórmulas CPM/CPA, el techo de bono, el muestreo de capturas y la
-- capa de métricas entera — y con ellos el único incentivo que existía para
-- inflar un número. Una pieza es una URL y una fecha.
--
-- Si algún día se quiere el bono, se agrega sobre esto sin romperlo; pero
-- entonces habrá que resolver que auto-reportar vistas se convierte en dinero.

begin;

-- ── La cuenta canvas ────────────────────────────────────────────────────────
--
-- Cuelga de la marca y NUNCA de la operadora ni del programa. Es lo que permite
-- pasarla de una operadora a otra sin perder el histórico de lo publicado.
--
-- ⚠️ No hay ninguna columna de contraseña, token ni sesión, y no se agrega
-- después. El acceso se entrega por los mecanismos de cada red (el Business
-- Center de TikTok, por ejemplo) o por fuera del sistema; acá solo queda
-- registrado que ocurrió, y eso vive en el programa (handoff_at).
create table if not exists mk_canvas_cuenta (
  id          uuid primary key default gen_random_uuid(),
  marca_id    uuid not null references mk_marcas(id) on delete cascade,
  nombre      text not null,
  -- El nicho es lo que define qué se graba. Va en la cuenta y no en el programa
  -- porque sobrevive a la operadora: si entra otra, el nicho sigue siendo el
  -- mismo y por eso la cuenta conserva su audiencia.
  nicho       text,
  red         text not null,
  handle      text,
  url         text,
  estado      text not null default 'activa'
                check (estado in ('activa','pausada','cerrada')),
  notas       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

comment on table mk_canvas_cuenta is
  'Cuenta social propiedad de la MARCA que una operadora publica. Nunca guarda credenciales.';
comment on column mk_canvas_cuenta.nicho is
  'El tema alrededor del cual se construye la cuenta. Sobrevive al cambio de operadora.';

create index if not exists mk_canvas_cuenta_marca_idx
  on mk_canvas_cuenta (marca_id, estado);

-- ── El programa ─────────────────────────────────────────────────────────────
--
-- El acuerdo entre una marca y una operadora sobre una cuenta. Los porcentajes
-- de comisión se COPIAN acá al crearlo, igual que en mk_tratos: cambiar la
-- comisión mañana no puede alterar un acuerdo firmado hoy.
create table if not exists mk_canvas_programa (
  id            uuid primary key default gen_random_uuid(),
  codigo        text unique,
  cuenta_id     uuid not null references mk_canvas_cuenta(id) on delete cascade,
  -- Nula mientras la marca busca a quién asignarle la cuenta.
  creadora_id   uuid references mk_creadoras(id) on delete set null,

  estado        text not null default 'propuesto'
                  check (estado in ('propuesto','aceptado','activo','pausado',
                                    'terminado','rechazado','cancelado')),

  cuota_ciclo   int not null check (cuota_ciclo > 0),
  tarifa_pieza  numeric(12,2) not null check (tarifa_pieza > 0),
  periodicidad  text not null default 'mensual'
                  check (periodicidad in ('quincenal','mensual')),
  -- Nulo = indefinido: se renueva mientras las dos partes quieran.
  ciclos_pactados int check (ciclos_pactados is null or ciclos_pactados > 0),

  guion         text,
  -- Los primeros uno o dos segundos del video, que es lo que decide si alguien
  -- se queda. La marca manda varios para probar cuál funciona.
  hooks         text[],

  comision_marca_pct    numeric(5,2) not null default 12,
  comision_creadora_pct numeric(5,2) not null default 8,
  costo_desembolso_pct  numeric(5,2) not null default 0,

  fecha_inicio  date,
  -- Cuándo recibió el acceso a la cuenta. Es lo que separa «aceptado» de
  -- «activo»: sin acceso no puede publicar, así que el programa no está
  -- corriendo aunque las dos hayan dicho que sí.
  handoff_at    timestamptz,
  contacto_revelado_at timestamptz,
  motivo_cierre text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on table mk_canvas_programa is
  'Acuerdo recurrente marca–operadora sobre una cuenta canvas. Comisiones congeladas al crear.';
comment on column mk_canvas_programa.handoff_at is
  'Cuándo la operadora recibió acceso a la cuenta. Solo registramos que pasó, nunca cómo.';

create index if not exists mk_canvas_prog_cuenta_idx   on mk_canvas_programa (cuenta_id, estado);
create index if not exists mk_canvas_prog_creadora_idx on mk_canvas_programa (creadora_id, estado);

-- ── El ciclo ────────────────────────────────────────────────────────────────
--
-- La unidad que se paga. La marca paga POR ADELANTADO la cuota completa, queda
-- retenida, y al cerrar se le paga a la operadora lo que entregó y se le
-- devuelve a la marca lo que no.
--
-- La cuota, la tarifa y las comisiones se copian del programa al abrir el
-- ciclo. Si mañana renegocian la tarifa, los ciclos ya abiertos conservan la
-- suya — misma regla que protege a los tratos.
--
-- Los ciclos NO se abren solos. Abrirlo cobra, y cobrar automáticamente una
-- relación que quizá ya nadie quiere es la forma más rápida de perder a una
-- marca (decisión de María, 31-ago-2026).
create table if not exists mk_canvas_ciclo (
  id           uuid primary key default gen_random_uuid(),
  programa_id  uuid not null references mk_canvas_programa(id) on delete cascade,
  numero       int not null check (numero > 0),
  fecha_inicio date not null,
  fecha_fin    date not null,

  estado       text not null default 'por_pagar'
                 check (estado in ('por_pagar','activo','en_revision','liquidado',
                                   'cerrado','cancelado')),

  cuota                 int not null,
  tarifa_pieza          numeric(12,2) not null,
  comision_marca_pct    numeric(5,2) not null,
  comision_creadora_pct numeric(5,2) not null,
  costo_desembolso_pct  numeric(5,2) not null default 0,

  -- Lo que la marca pone al abrir: cuota × tarifa, más su comisión.
  total_a_pagar_marca   numeric(12,2) not null,

  -- Se llenan al liquidar.
  piezas_validas        int,
  monto_operadora       numeric(12,2),
  comision_creadora_valor numeric(12,2),
  costo_desembolso_valor  numeric(12,2),
  neto_operadora        numeric(12,2),
  -- Lo no entregado vuelve a la marca, y con ello la comisión proporcional de
  -- esas piezas: la comisión se cobra por un servicio prestado, y una pieza que
  -- no existe no se prestó (decisión de María, 31-ago-2026).
  devuelto_marca        numeric(12,2),

  fecha_pago_marca      timestamptz,
  fecha_liquidacion     timestamptz,
  fecha_pago_operadora  timestamptz,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),

  unique (programa_id, numero)
);

comment on table mk_canvas_ciclo is
  'Periodo de liquidación de un programa. La marca paga la cuota por adelantado; al cerrar se paga lo entregado y se devuelve el resto.';

create index if not exists mk_canvas_ciclo_prog_idx   on mk_canvas_ciclo (programa_id, numero);
create index if not exists mk_canvas_ciclo_estado_idx on mk_canvas_ciclo (estado, fecha_fin);

-- ── La pieza ────────────────────────────────────────────────────────────────
--
-- Un video publicado. Solo la URL pública y cuándo salió: no hay vistas ni
-- ninguna métrica, por decisión de negocio.
--
-- ⚠️ creadora_id y cuenta_id se guardan ACÁ aunque se podrían deducir subiendo
-- por el ciclo hasta el programa. Es a propósito: cuando una cuenta se
-- reasigna a otra operadora, deducirlo por el programa devolvería la operadora
-- NUEVA para piezas viejas, y el sello de cumplimiento le acreditaría a una el
-- trabajo de otra. El histórico tiene que quedar como pasó.
create table if not exists mk_canvas_pieza (
  id           uuid primary key default gen_random_uuid(),
  ciclo_id     uuid not null references mk_canvas_ciclo(id) on delete cascade,
  creadora_id  uuid not null references mk_creadoras(id) on delete restrict,
  cuenta_id    uuid not null references mk_canvas_cuenta(id) on delete restrict,

  url          text not null,
  publicada_at timestamptz not null,
  estado       text not null default 'registrada'
                 check (estado in ('registrada','validada','rechazada')),
  nota_marca   text,
  created_at   timestamptz default now(),

  -- La misma pieza no se registra dos veces en el mismo ciclo.
  unique (ciclo_id, url)
);

comment on table mk_canvas_pieza is
  'Un video publicado en una cuenta canvas. Guarda operadora y cuenta directamente para que el histórico sea inmutable.';

create index if not exists mk_canvas_pieza_ciclo_idx    on mk_canvas_pieza (ciclo_id, estado);
create index if not exists mk_canvas_pieza_creadora_idx on mk_canvas_pieza (creadora_id);
create index if not exists mk_canvas_pieza_cuenta_idx   on mk_canvas_pieza (cuenta_id, publicada_at);

-- ── Enganches con lo que ya existe ──────────────────────────────────────────

-- Un pago puede colgar de un ciclo en vez de un trato. mk_pagos ya aceptaba
-- trato_id nulo, así que no hay que aflojar nada.
alter table mk_pagos
  add column if not exists ciclo_id uuid references mk_canvas_ciclo(id) on delete set null;

create index if not exists mk_pagos_ciclo_idx on mk_pagos (ciclo_id);

-- El cobro por Wompi ya se ramifica por `concepto` ('trato', 'suscripcion').
-- Canvas agrega una rama más, no una tabla más.
alter table mk_transacciones
  add column if not exists ciclo_id uuid references mk_canvas_ciclo(id) on delete set null;

create index if not exists mk_transacciones_ciclo_idx on mk_transacciones (ciclo_id);

-- El catálogo es ciego a propósito: la marca no ve cara, handle ni nombre hasta
-- que hay pago retenido. Pero en canvas la marca contrata a alguien para que
-- ponga su cara en lo que será el rostro público de la marca durante meses, y
-- cómo se ve y cómo habla ES lo que compra.
--
-- La salida es que lo autorice ella, como ya prende su media kit público. Sin
-- esta autorización no aparece en búsquedas de canvas, y eso es correcto: si no
-- quiere poner la cara, este modelo no es para ella.
alter table mk_creadoras
  add column if not exists canvas_rostro_ok boolean not null default false,
  add column if not exists canvas_rostro_at timestamptz;

comment on column mk_creadoras.canvas_rostro_ok is
  'La creadora autoriza que su rostro se muestre a marcas SOLO para programas canvas. Lo prende ella, nunca el equipo.';

commit;
