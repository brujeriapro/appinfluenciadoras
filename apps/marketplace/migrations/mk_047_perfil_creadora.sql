-- mk_047 · Media kit público y niveles configurables
--
-- El media kit es la página que la creadora comparte en su bio y con marcas de
-- afuera. Es su canal de adquisición, y de paso el nuestro: quien entra ve el
-- botón "trabaja con ella" que lleva al registro de marca.
--
-- ⚠️ Es OPCIONAL y apagado por defecto, y eso no es prudencia sino una regla
-- del producto: el catálogo es ciego —alias y código, nunca el nombre real ni
-- el @usuario— y una página pública por creadora enumerable rompería eso de
-- raíz. Alguien podría recorrer los códigos, abrir cada media kit y cruzar
-- alias con identidad real. Por eso:
--
--   1. Se prende una por una, y la prende ELLA. Compartir su identidad es su
--      decisión, no la nuestra.
--   2. El slug lo elige ella y NO se deriva del código. Si fuera /c/C-0412
--      bastaría contar hasta encontrar a todas.

alter table mk_creadoras
  add column if not exists media_kit_slug    text,
  add column if not exists media_kit_publico boolean not null default false,
  add column if not exists media_kit_at      timestamptz;

-- Único entre las que existen, sin bloquear a las miles que no tienen slug.
create unique index if not exists mk_creadoras_slug_unico
  on mk_creadoras (lower(media_kit_slug)) where media_kit_slug is not null;

comment on column mk_creadoras.media_kit_slug is
  'La parte de la URL que ella elige: creatorsmanager.com/c/su-slug. NUNCA se deriva del código — un slug adivinable haría enumerable el catálogo ciego.';
comment on column mk_creadoras.media_kit_publico is
  'Apagado por defecto. Publicar su media kit es decisión suya, no del equipo.';

-- Los cortes de nivel, configurables desde el panel admin.
--
-- Van en configuración y no en el código porque con el catálogo recién
-- arrancado casi nadie tiene tratos: hoy 40 creadoras tienen una entrega y
-- NINGUNA tiene tres, así que exigir diez para el nivel más alto deja los dos
-- de arriba vacíos durante meses. Un sistema de niveles donde nadie sube no
-- motiva a nadie.
insert into mk_config (clave, valor)
values ('niveles_creadora', '[
  {"clave":"nueva","nombre":"Nueva","entregas":0,"requiere_metricas":false,"cuadros":1},
  {"clave":"verificada","nombre":"Verificada","entregas":1,"requiere_metricas":true,"cuadros":2},
  {"clave":"confiable","nombre":"Confiable","entregas":3,"requiere_metricas":true,"cuadros":3},
  {"clave":"elite","nombre":"Elite","entregas":10,"requiere_metricas":true,"cuadros":4}
]'::jsonb)
on conflict (clave) do nothing;
