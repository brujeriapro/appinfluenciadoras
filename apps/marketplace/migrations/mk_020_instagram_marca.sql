-- ===========================================================================
-- Creators Manager - mk_020
--
-- El @usuario de Instagram de la marca, para que aparezca en la historia que
-- comparte cada creadora.
--
-- Va en configuracion y no escrito en el codigo porque la cuenta todavia se
-- esta creando: si el nombre termina siendo otro, se cambia aqui sin desplegar.
-- ===========================================================================

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('instagram_marca', '"creatorsmanager"'::jsonb,
   'Usuario de Instagram de Creators Manager, sin la arroba')
ON CONFLICT (clave) DO NOTHING;
