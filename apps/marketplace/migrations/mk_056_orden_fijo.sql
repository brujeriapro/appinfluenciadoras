-- mk_056 · Fijar creadoras arriba del catálogo
--
-- El equipo a veces quiere que una creadora concreta se vea primero, por
-- razones que ningún puntaje captura: es muy buena, encaja con lo que están
-- buscando las marcas de este mes, o acaba de entrar y vale la pena mostrarla.
--
-- No se puede hacer con lo que ya hay:
--
--   · `prioridad` NO sirve. El catálogo se ordena en JavaScript por qué tan
--     completo está el perfil (catalogo.js), y ese orden pisa al de SQL, así
--     que `prioridad` solo desempata entre perfiles idénticos. Además ya
--     significa otra cosa —puntos por traer referidas— y se le promete así a la
--     creadora en su portal: reusarla rompería las dos cosas.
--   · Las colecciones y el destacado son del HOME, no del catálogo.
--   · Inventarle colaboraciones sería falsear el historial, que es justo de
--     donde sale la promesa de "si cumple".
--
-- Nullable a propósito: NULL es "no fijada", que tiene que poder distinguirse
-- de "fijada en la posición 0". El número es el puesto: 1 va antes que 2.
alter table mk_creadoras add column if not exists orden_fijo integer;

comment on column mk_creadoras.orden_fijo is
  'Puesto fijo al principio del catálogo. NULL = no fijada. Menor va primero.';

-- Parcial: las fijadas son un puñado y solo importan si están visibles.
create index if not exists mk_creadoras_orden_fijo_idx
  on mk_creadoras (orden_fijo)
  where orden_fijo is not null and visible = true;

-- Las tres que pidió María (28-ago-2026).
update mk_creadoras set orden_fijo = 1 where codigo = 'C-0402';  -- Mafe Gomez
update mk_creadoras set orden_fijo = 2 where codigo = 'C-0609';  -- Yosoymarialeja
update mk_creadoras set orden_fijo = 3 where codigo = 'C-0613';  -- Elisa Ruiz Tobón
