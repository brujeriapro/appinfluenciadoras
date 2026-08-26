-- Portada de cada video.
--
-- Un <video> sin poster se pinta como un rectángulo negro hasta que el
-- navegador descarga suficiente para mostrar algo. En una fila de cuatro piezas
-- donde tres son video, la marca ve tres bloques negros gigantes y el catálogo
-- entero parece abandonado, aunque el trabajo esté ahí.
--
-- Guardar un fotograma como imagen lo arregla de raíz: la portada pesa unos
-- pocos KB y aparece de inmediato, y el video ya no se descarga hasta que
-- alguien le da play, así que el catálogo también carga mucho más rápido.
--
-- Se llenan con:  node scripts/generar-portadas.js

ALTER TABLE mk_muestras ADD COLUMN IF NOT EXISTS poster_path TEXT;
