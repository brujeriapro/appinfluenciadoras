-- ===========================================================================
-- Creadores.app - mk_013
--
-- Registrarse como marca deja de exigir codigo de invitacion, y el formulario
-- se reduce a lo minimo: marca, telefono, correo y clave.
--
-- Por que el codigo se va: lo que sostiene la calidad ya no es un codigo que
-- se reenvia por WhatsApp sino el plan. Quien se registra entra al demo con 3
-- fichas, y para ver mas tiene que poner tarjeta y datos de empresa. Ese
-- filtro es mejor.
--
-- El codigo NO desaparece: si manana hay que cerrar el registro -por abuso o
-- por una etapa de invitacion- se apaga este interruptor y vuelve a exigirse,
-- sin desplegar nada.
--
-- Por que se relaja nombre_contacto: cada campo de un formulario de registro
-- cuesta gente que no termina. El NIT, la ciudad y la persona de contacto no
-- hacen falta para mirar el catalogo; se piden en el perfil, cuando ya hay
-- una cuenta que perder, y el NIT cuando toque facturar.
-- ===========================================================================

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('registro_marcas_abierto', 'true'::jsonb,
   'Si esta en false, el registro de marcas vuelve a exigir codigo de invitacion')
ON CONFLICT (clave) DO NOTHING;

ALTER TABLE mk_marcas ALTER COLUMN nombre_contacto DROP NOT NULL;
