-- mk_042 · Marca de agua sobre las piezas del catálogo
--
-- Por qué: el proxy de /media esconde de dónde sale el archivo, pero no impide
-- que una marca descargue la pieza, la busque en Google Lens y llegue al
-- Instagram de la creadora. Con eso la identidad oculta —y la cláusula de
-- no-circunvalación que se apoya en ella— deja de valer.
--
-- Se guarda la copia marcada aparte en vez de reemplazar el original: marcar al
-- servir costaría cientos de milisegundos por imagen en un catálogo que carga
-- más de cien por pantalla, y conservar el original permite regenerar la marca
-- sin pedirle a la creadora que vuelva a subir su portafolio.

alter table mk_muestras
  add column if not exists watermark_path        text,
  add column if not exists watermark_poster_path text,
  add column if not exists watermark_at          timestamptz;

comment on column mk_muestras.watermark_path is
  'Copia con marca de agua que sirve /media/:id. El original nunca sale por HTTP.';
comment on column mk_muestras.watermark_poster_path is
  'Portada de video con marca de agua — es lo que se ve en la grilla del catálogo.';

-- Índice parcial: la única consulta que se hace sobre estas columnas es "qué
-- falta por marcar", que corre el script de backfill.
create index if not exists mk_muestras_sin_marcar
  on mk_muestras (created_at) where watermark_path is null;
