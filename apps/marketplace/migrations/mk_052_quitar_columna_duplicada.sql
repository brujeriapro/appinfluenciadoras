-- mk_052 · Quitar una columna que quedó duplicada
--
-- mk_051 agregó `metricas_verificada_at` sin ver que ya existía
-- `metricas_verificadas_at` (en plural), que es la que usa el código desde
-- siempre. Dos columnas para el mismo dato no dan error: dan un bug silencioso
-- el día que alguien escriba en una y lea de la otra.
--
-- Se borra la nueva, que nunca se escribió. La buena es la plural.

alter table mk_creadoras drop column if exists metricas_verificada_at;

comment on column mk_creadoras.metricas_verificadas_at is
  'Cuándo el equipo verificó sus métricas. Es esta, en plural — no crear otra.';
