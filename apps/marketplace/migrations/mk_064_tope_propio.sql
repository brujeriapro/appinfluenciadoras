-- mk_064 · Un tope de propuestas propio, por marca
--
-- Brujería Capilar es la casa: opera la plataforma y además la usa como marca.
-- Limitarla con el mismo plan que se le vende a un cliente no tiene sentido, y
-- ponerla en «Agencia» tampoco: ese es un plan comercial de $299.900 y usarlo
-- para la casa ensucia lo que significa.
--
-- La salida es un tope propio que manda sobre el del plan. Nulo —que es lo
-- normal— significa «lo que diga tu plan», y el comportamiento de todas las
-- demás marcas no cambia en nada.
--
-- Sirve además para cualquier caso puntual que aparezca: una marca a la que se
-- le regala un mes extra, una prueba con un cliente grande. Antes eso obligaba
-- a inventar un plan; ahora es un número en su fila.

begin;

alter table mk_marcas
  add column if not exists tope_propuestas_mes int
    check (tope_propuestas_mes is null or tope_propuestas_mes > 0);

comment on column mk_marcas.tope_propuestas_mes is
  'Tope de propuestas al mes propio de esta marca. Manda sobre el de su plan. Nulo = usar el del plan, que es lo normal.';

commit;
