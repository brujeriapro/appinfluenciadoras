-- ===========================================================================
-- Creators Manager - mk_022
--
-- El plan deja de limitar cuantas fichas se abren y pasa a limitar cuantas
-- PROPUESTAS se envian.
--
-- Limitar la busqueda no protegia nada: lo que se ve se anota y se vuelve el
-- mes siguiente. Y peor, impedia que la marca encontrara a la creadora por la
-- que valdria la pena pagar. El valor esta en poder proponerle a alguien, que
-- es el paso que puede terminar en contenido.
--
-- Precios nuevos, con saltos de 3x en vez de 5x: antes, quien necesitaba
-- veinte fichas tenia que pagar el plan de 99.900 o quedarse corto.
-- ===========================================================================

ALTER TABLE mk_planes ADD COLUMN IF NOT EXISTS propuestas_mes_nuevo INTEGER;

UPDATE mk_planes SET nombre='Explora', precio_mes=0,      fichas_mes=NULL,
       propuestas_mes_nuevo=3,    campanas_max=1    WHERE clave='demo';
UPDATE mk_planes SET nombre='Impulsa', precio_mes=39900,  fichas_mes=NULL,
       propuestas_mes_nuevo=12,   campanas_max=NULL WHERE clave='emprende';
UPDATE mk_planes SET nombre='Escala',  precio_mes=119900, fichas_mes=NULL,
       propuestas_mes_nuevo=40,   campanas_max=NULL, comparador=true WHERE clave='marca';
UPDATE mk_planes SET nombre='Agencia', precio_mes=299900, fichas_mes=NULL,
       propuestas_mes_nuevo=NULL, campanas_max=NULL WHERE clave='agencia';

ALTER TABLE mk_planes DROP COLUMN IF EXISTS propuestas_mes;
ALTER TABLE mk_planes RENAME COLUMN propuestas_mes_nuevo TO propuestas_mes;

COMMENT ON COLUMN mk_planes.propuestas_mes IS
  'Propuestas que puede enviar al mes. NULL = sin limite.';
COMMENT ON COLUMN mk_planes.fichas_mes IS
  'Sin uso desde mk_022: el catalogo se abre completo en todos los planes.';
