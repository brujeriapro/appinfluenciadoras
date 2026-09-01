-- mk_063 · El puente con el Programa Creadoras
--
-- Permite que Brujería Capilar elija creadoras en el catálogo de Creators
-- Manager y las invite a su programa de gifting, en vez de buscarlas por fuera
-- y volver a pedirles todo.
--
-- No crea tablas: la columna que enlaza los dos mundos —mk_creadoras.influencer_id—
-- ya existe desde el principio, y 116 creadoras ya están enlazadas por ella.
-- Lo único que falta es la configuración.
--
-- ── marca_id no es un detalle ──────────────────────────────────────────────
--
-- Es la única marca autorizada a invitar al Programa. Sin eso, cualquier marca
-- registrada en el marketplace podría meter creadoras al programa de gifting de
-- otra, usando datos que las creadoras dieron para el marketplace.
--
-- ── Por qué el formulario es el de Tally que ya existe ─────────────────────
--
-- El webhook de registro del Programa busca por correo, TikTok, Instagram y
-- teléfono ANTES de crear. Una influencer creada acá como «Prospectada» se
-- completa sola cuando ella llena ese formulario: la encuentra por correo y la
-- actualiza. Construir un formulario nuevo sería rehacer un dedupe que ya
-- funciona, y arriesgarse a duplicar personas.

begin;

insert into mk_config (clave, valor, descripcion)
values (
  'programa_creadoras',
  jsonb_build_object(
    'activo', true,
    'marca_id', '310fde10-f81c-45da-b66a-883ada6423c9',
    'formulario_url', 'https://tally.so/r/9qlKZ1',
    'nombre_programa', 'el Programa Creadoras de Brujería Capilar'
  ),
  'Puente con el Programa Creadoras. marca_id es la ÚNICA marca autorizada a invitar.'
)
-- No pisa lo que ya esté: la configuración viva manda sobre la migración.
-- Apagar el puente o cambiar el formulario se hace editando la fila, no
-- volviendo a correr esto.
on conflict (clave) do nothing;

commit;
