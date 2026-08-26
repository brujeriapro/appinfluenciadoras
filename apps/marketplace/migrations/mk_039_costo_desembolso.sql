-- Lo que cuesta pasarle la plata a la creadora.
--
-- La pasarela cobra por dispersar, y ese costo salia del margen de la
-- plataforma sin que nadie lo viera: el sistema calculaba la comision bruta y
-- la mostraba como ingreso.
--
-- Se guarda dentro de cada trato, igual que las comisiones, para que cambiar el
-- porcentaje mañana no altere lo que ya se le prometio a alguien. Un trato
-- aceptado con 3% se paga con 3%. Los tratos anteriores quedan en 0 y su neto
-- no se toca.
--
-- Va en su propio campo y no sumado a la comision de la creadora a proposito:
-- son cosas distintas y ella tiene derecho a ver cual es cual. Mezclarlas haria
-- que su comision pareciera del 11% cuando el trato dice 8%.

ALTER TABLE mk_tratos
  ADD COLUMN IF NOT EXISTS costo_desembolso_pct   NUMERIC(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS costo_desembolso_valor NUMERIC(12,2) NOT NULL DEFAULT 0;

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('costo_desembolso_pct', '3'::jsonb,
   'Porcentaje que se descuenta a la creadora al pasarle su dinero, para cubrir lo que cobra la pasarela por dispersar')
ON CONFLICT (clave) DO NOTHING;
