-- mk_053 · Las seis preguntas del registro, y la solicitud con su reloj
--
-- mk_045 había dejado cuatro columnas sueltas, tanteando. El handoff 7 define
-- las seis reales, y con una regla que vale la pena copiar acá porque explica
-- por qué son estas y no otras:
--
--   Una pregunta solo entra si se puede CRUZAR contra un campo que la
--   plataforma ya tiene de la creadora. Si no se puede cruzar, no filtra nada
--   y solo alarga el registro.
--
--   categorias   → el nicho declarado de ella
--   canal        → sus vistas promedio POR RED, que están separadas
--   audiencia    → el desglose por edad y género de su audiencia
--   ciudades     → dónde está su audiencia
--   tamano       → su tier por red
--   presupuesto  → la tarifa más baja que tiene publicada
--
-- Dos que se descartaron y conviene no revivir: "qué quieres que hagan" y
-- "cuánta libertad le das". Suenan útiles pero describen a la MARCA, no
-- filtran creadoras.

alter table mk_marcas
  add column if not exists busca_categorias text[],
  add column if not exists busca_otra       text,
  add column if not exists busca_audiencia  text,
  add column if not exists busca_ciudades   text[],
  add column if not exists busca_tamano     text;

-- Las de mk_045 que quedaron cortas. busca_canal y busca_presupuesto siguen
-- siendo correctas y se conservan.
alter table mk_marcas
  drop column if exists busca_que_vende,
  drop column if exists busca_tipo;

comment on column mk_marcas.busca_categorias is
  'Qué vende, selección múltiple de 15 categorías. Se cruza contra el nicho de la creadora.';
comment on column mk_marcas.busca_ciudades is
  '"Toda Colombia" es mutuamente exclusiva con las ciudades específicas: juntas dejan un filtro que nadie sabe interpretar.';

-- ── La solicitud tiene reloj ───────────────────────────────────────────────
--
-- Al terminar el registro se le promete "en menos de 24 horas". Esa promesa
-- necesita existir como dato, no solo como frase: sin vencimiento, la cola del
-- equipo no puede ordenarse por urgencia y la promesa se rompe sin que nadie
-- lo note.
--
-- El estado 'solicitada' es el hueco que faltaba entre "la marca se registró" y
-- "alguien empezó a armarla".

alter table mk_seleccion
  add column if not exists vence_at timestamptz;

alter table mk_seleccion drop constraint if exists mk_seleccion_estado_check;
alter table mk_seleccion add constraint mk_seleccion_estado_check
  check (estado in ('solicitada', 'borrador', 'publicada', 'archivada'));

create index if not exists mk_seleccion_por_vencer
  on mk_seleccion (vence_at)
  where estado in ('solicitada', 'borrador');

comment on column mk_seleccion.vence_at is
  'Las 24 horas prometidas en el registro, como dato. Ordena la cola del equipo por urgencia.';
