-- mk_057 · El canal del registro pasa a ser varios, y aparece Modelaje
--
-- La pregunta "¿para qué canal buscas contenido?" dejaba elegir uno solo, con
-- una opción "Las dos" que existía justamente porque no se podían marcar dos.
-- Con selección múltiple esa opción sobra: se marcan las dos.
--
-- Entran YouTube (que ya existe como red, así que se puede cruzar), Modelaje
-- (ver abajo) y "Otra" con texto libre.

-- De uno a varios. Lo que ya estaba se envuelve en un arreglo de un elemento
-- para no perder las respuestas de las marcas que ya contestaron.
alter table mk_marcas
  alter column busca_canal type text[]
  using case when busca_canal is null then null else array[busca_canal] end;

-- El texto libre de "Otra". Mismo patrón que `busca_otra` para las categorías:
-- solo se guarda si eligió la opción que lo dispara.
alter table mk_marcas add column if not exists busca_canal_otra text;

comment on column mk_marcas.busca_canal_otra is
  'Lo que escribió si marcó "Otra" en el canal. NULL si no la marcó.';

-- ── Modelaje ────────────────────────────────────────────────────────────────
--
-- Modelaje NO es un canal: es otro tipo de trabajo. Entra como el décimo
-- ENTREGABLE y no como una columna nueva, y eso resuelve tres cosas de una:
--
--   · la creadora lo ofrece CON PRECIO desde la pantalla de tarifas que ya
--     tiene, sin construirle nada;
--   · la ficha lo muestra sola, porque recorre todos los entregables y pinta
--     "No lo ofrece" en los que no;
--   · `califica` puede cruzarlo de verdad contra sus tarifas.
--
-- Es lo que respeta la regla con la que se decidió cada pregunta del registro
-- (mk_053): una pregunta solo entra si se puede cruzar contra algo que ya
-- tenemos de la creadora. Un "modelaje" que no filtrara nada sería una casilla
-- decorativa.
--
-- Se agrega al final y solo si no está, para no pisar la lista si alguien la
-- editó desde el panel.
update mk_config
set valor = valor || '[{"clave":"modelaje","nombre":"Modelaje","subtitulo":"Fotos para la marca, sin publicar"}]'::jsonb
where clave = 'entregables'
  and not (valor @> '[{"clave":"modelaje"}]'::jsonb);
