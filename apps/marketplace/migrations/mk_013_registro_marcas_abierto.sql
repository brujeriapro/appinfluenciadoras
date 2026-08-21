-- ===========================================================================
-- Creadores.app - mk_013
--
-- El registro de marcas deja de exigir codigo de invitacion.
--
-- Lo que sostiene la calidad ya no es el codigo sino el plan: quien se
-- registra entra al demo con 3 fichas, y para ver mas tiene que pagar. Un
-- competidor que quiera copiar el banco tiene que poner tarjeta y datos de
-- empresa, que es mejor filtro que un codigo que se puede reenviar por
-- WhatsApp.
--
-- El codigo NO desaparece: si mañana hay que cerrar el registro —por abuso o
-- por una etapa de invitacion— se apaga este interruptor y vuelve a exigirse,
-- sin desplegar nada.
-- ===========================================================================

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('registro_marcas_abierto', 'true'::jsonb,
   'Si esta en false, el registro de marcas vuelve a exigir codigo de invitacion')
ON CONFLICT (clave) DO NOTHING;
