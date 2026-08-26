-- Cuantos correos masivos pueden salir al dia.
--
-- Los topes por tanda no protegian de nada: nada impedia dar tres tandas de 250
-- el mismo dia, y eso fue justo lo que tumbo el correo — 353 envios con un plan
-- de 300 dejo sin enlace a 16 creadoras durante dos dias.
--
-- Arranca en 100 porque el proveedor es nuevo. Una cuenta recien creada que
-- dispara cientos de correos parece spam aunque no lo sea, y el corte llega sin
-- aviso. Lo sensato es subirlo de a poco: 100 la primera semana, 200 la
-- siguiente, y asi.
--
-- Solo aplica a los envios en tanda. Los correos de uno en uno —recuperar
-- contraseña, avisos de propuesta, plazos— nunca se bloquean: castigar un reset
-- por haber mandado muchas invitaciones seria cobrarselo a quien no tiene nada
-- que ver.

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('correos_por_dia', '100'::jsonb,
   'Tope de correos masivos al dia. Subir de a poco mientras el proveedor es nuevo')
ON CONFLICT (clave) DO NOTHING;
