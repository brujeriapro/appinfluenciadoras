-- mk_050 · Ajustar el tope de correo a la cuota real del proveedor
--
-- ZeptoMail deja 100 correos al día mientras revisa la cuenta. El tope de la
-- app estaba en 350 —se había subido para una tanda de invitaciones— así que
-- la app mandaba alegremente 350, el proveedor aceptaba 100 y rechazaba el
-- resto. Y como el proveedor no distingue entre una invitación y una
-- recuperación de contraseña, a partir del correo 100 falló TODO: 132
-- recuperaciones pedidas en cuatro días, ninguna llegando.
--
-- Tres valores en vez de uno:
--
--   correo_limite_proveedor      lo que el proveedor deja al día. Subir a
--                                10.000 cuando ZeptoMail apruebe la cuenta.
--   correo_reserva_transaccional cuánto NO puede tocar lo masivo. Es lo que
--                                garantiza que una creadora pueda recuperar su
--                                clave aunque ese día se hayan mandado
--                                invitaciones.
--   correos_por_dia              el tope que pone el equipo, por criterio
--                                propio. Manda el más chico de los dos frenos.

update mk_config set valor = '60'::jsonb where clave = 'correos_por_dia';

insert into mk_config (clave, valor) values
  ('correo_limite_proveedor', '100'::jsonb),
  ('correo_reserva_transaccional', '40'::jsonb)
on conflict (clave) do nothing;
