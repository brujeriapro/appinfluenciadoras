-- mk_061 · La promoción de lanzamiento
--
-- Septiembre gratis para las marcas que se registren: entran con el plan Escala
-- (40 propuestas al mes, $119.900) hasta el 30 de septiembre, sin pagar nada.
--
-- Va en mk_config y no cableado en el código por la misma razón que los
-- precios: es una decisión de negocio con fecha, y extenderla, cambiar el plan
-- que se regala o apagarla no puede exigir un despliegue. En plena campaña, el
-- tiempo entre "quiero extenderla una semana" y que esté hecho tiene que ser un
-- minuto, no una tarde.
--
-- La forma:
--   activa · el interruptor. En false no pasa nada, aunque la fecha esté viva.
--   plan   · la CLAVE del plan que se regala, no su nombre. Ojo: la clave del
--            plan Escala es 'marca', un nombre desafortunado que viene de
--            antes. 'marca' es el plan; la marca es quien lo usa.
--   hasta  · último día en que se regala Y hasta cuándo vale lo regalado. Quien
--            entre el 29 tiene dos días: es el costo de que la promo sea "el
--            mes de septiembre" y no "30 días desde que entras".
--
-- Cuando pase la fecha, las marcas caen solas al plan Explora: `topeDePropuestas`
-- ya trata como demo a cualquier plan con plan_vence_at pasado, así que no hay
-- que correr nada para desmontarla.

begin;

insert into mk_config (clave, valor, descripcion)
values (
  'promo_lanzamiento',
  '{"activa": true, "plan": "marca", "hasta": "2026-09-30"}'::jsonb,
  'Promo de apertura: toda marca que se registre hasta la fecha entra con ese plan, gratis, hasta esa misma fecha. Apagar con activa=false.'
)
on conflict (clave) do update
  set valor = excluded.valor,
      descripcion = excluded.descripcion;

commit;
