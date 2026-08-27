-- mk_049 · Registro de cada correo que se intenta enviar
--
-- El envío falla EN SILENCIO a propósito: un correo caído no puede tumbar un
-- registro ni una recuperación. El precio de esa decisión es que un problema de
-- envío es invisible hasta que alguien se queja — y ya mordió dos veces:
--
--   · Agosto: 353 correos en un día contra un plan de 300 dejó a 16 creadoras
--     dos días sin poder entrar. Se descubrió por los reclamos.
--   · Hoy: 132 recuperaciones pedidas en cuatro días, ninguna llegando, y sin
--     forma de ver el error del proveedor sin entrar al panel a apretar un
--     botón de prueba.
--
-- Esta tabla no cambia que el envío falle en silencio para quien lo dispara.
-- Cambia que quede rastro: qué se intentó, por dónde, y qué contestó el
-- proveedor. Convierte "no me llega nada" en una consulta.
--
-- NO se guarda el cuerpo del correo: pesa, y contiene enlaces de un solo uso
-- como los de recuperar contraseña. Con el asunto y el destinatario alcanza
-- para diagnosticar.

create table if not exists mk_correos_log (
  id         bigserial primary key,
  para       text not null,
  asunto     text,
  proveedor  text,
  ok         boolean not null,
  -- El error tal como lo devolvió el proveedor, recortado. Es lo único que
  -- explica por qué no llegó, y hasta ahora se perdía en los logs de Railway.
  error      text,
  created_at timestamptz not null default now()
);

create index if not exists mk_correos_log_fecha on mk_correos_log (created_at desc);
-- Los fallos son lo que se consulta; el índice parcial los deja a mano.
create index if not exists mk_correos_log_fallos on mk_correos_log (created_at desc) where not ok;

alter table mk_correos_log enable row level security;

comment on table mk_correos_log is
  'Rastro de cada intento de envío. El envío falla en silencio a propósito; esto hace que el fallo sea consultable en vez de invisible.';
