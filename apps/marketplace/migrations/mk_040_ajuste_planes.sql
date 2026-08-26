-- Reajuste del pricing tras analizar el modelo.
--
-- 1. El gratuito baja de 3 propuestas a 1.
--
-- Con tres al mes, catalogo completo y escrow incluido, una marca que hace una
-- o dos campañas mensuales tenia el producto entero gratis para siempre: el
-- tope estaba puesto donde nunca lo iba a tocar. Con una prueba de verdad
-- —ve el catalogo, manda su propuesta, cierra un trato— y si quiere una segunda
-- campaña ese mes, paga.
--
-- El catalogo sigue abierto en todos los planes. Eso no se toca: es lo que hace
-- distinta a la plataforma y limitarlo no protegeria nada.
--
-- 2. Entra un escalon entre el gratuito e Impulsa.
--
-- El salto de 3 a 12 era demasiado ancho. Casi ninguna marca pequeña necesita
-- doce propuestas al mes, asi que se quedaba en el gratuito por descarte y no
-- por precio. Arranca ($19.900 / 4) convierte a quien hoy no convierte.

UPDATE mk_planes SET propuestas_mes = 1 WHERE clave = 'demo';

INSERT INTO mk_planes (clave, nombre, precio_mes, propuestas_mes, campanas_max,
                       comparador, multi_marca, orden, activo)
VALUES ('arranca', 'Arranca', 19900, 4, NULL, false, false, 1, true)
ON CONFLICT (clave) DO UPDATE
  SET nombre = EXCLUDED.nombre, precio_mes = EXCLUDED.precio_mes,
      propuestas_mes = EXCLUDED.propuestas_mes, orden = EXCLUDED.orden, activo = true;

UPDATE mk_planes SET orden = 2 WHERE clave = 'emprende';
UPDATE mk_planes SET orden = 3 WHERE clave = 'marca';
UPDATE mk_planes SET orden = 4 WHERE clave = 'agencia';
