-- ===========================================================================
-- Creadores.app - mk_012
--
-- Foto de perfil de la creadora.
--
-- Va en mk_creadoras y no en mk_muestras porque cumple otra funcion: las
-- muestras son su trabajo, la foto de perfil es como se presenta. En el
-- catalogo el avatar de cada fila sale de aca; hoy sale de la primera pieza de
-- trabajo, que a veces es un producto y no dice nada de ella.
--
-- OJO CON EL ANONIMATO: una cara reconocible, con la ciudad y el nicho al
-- lado, es un camino para encontrarla — no revela el @usuario, pero acerca. Por
-- eso la decision es de ella: el portal se lo advierte con todas las letras y
-- puede dejarla vacia. Sin foto, el catalogo muestra sus iniciales.
-- ===========================================================================

ALTER TABLE mk_creadoras
  ADD COLUMN IF NOT EXISTS foto_perfil_path TEXT,
  ADD COLUMN IF NOT EXISTS foto_perfil_mime TEXT;

COMMENT ON COLUMN mk_creadoras.foto_perfil_path IS
  'Objeto en el bucket privado. Se sirve por el proxy /media, nunca con URL directa.';
