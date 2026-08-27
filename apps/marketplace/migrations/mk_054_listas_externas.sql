-- mk_054 · Invitar a gente que no viene del Programa Creadoras
--
-- Hasta ahora toda invitación nacía de la tabla `influencers`, y por eso se
-- podía dar por hecho que había correo: el índice único que evita escribirle
-- dos veces a la misma persona era `(lower(email), canal)`.
--
-- Una lista que comparte una marca aliada llega con celular y poco más. Sin
-- correo, ese índice no protege nada — y lo que protege no es un detalle: es
-- que nadie reciba dos veces el mismo mensaje.
--
-- Así que el correo deja de ser obligatorio y el teléfono pasa a ser la otra
-- llave. Las dos conviven: cada una cubre el canal en el que sirve.

-- Sin correo no se puede escribir la fila.
alter table mk_invitaciones alter column email drop not null;

-- La ola es un estado de `influencers` ('Contenido Entregado', 'Registrada'…).
-- Un contacto externo no tiene ninguno, y ponerle 1 por defecto lo mezclaría
-- con la primera ola en todos los conteos de la pantalla de invitaciones.
alter table mk_invitaciones alter column ola drop not null;

-- De dónde salió el contacto. 'programa' para todo lo que ya existe; el nombre
-- de la marca aliada para lo que entre por una lista.
--
-- Es lo que mantiene separados los dos mundos: sin esto, las cuatro olas y las
-- listas externas se sumarían en la misma tabla y ninguna cifra significaría
-- lo que dice.
alter table mk_invitaciones add column if not exists fuente text not null default 'programa';

-- La red de seguridad del canal WhatsApp, equivalente a la que ya existe por
-- correo. Parcial porque las invitaciones por correo no tienen teléfono, y sin
-- el WHERE todas ellas chocarían entre sí en el NULL.
--
-- ⚠️ Si esta línea falla, es que ya hay dos filas con el mismo teléfono y
-- canal. NO se borran desde aquí: hay que mirarlas primero, porque cada una es
-- un mensaje que ya salió hacia una persona real.
create unique index if not exists mk_invitaciones_tel_canal_uniq
  on mk_invitaciones (telefono, canal)
  where telefono is not null;

create index if not exists mk_invitaciones_fuente_idx on mk_invitaciones (fuente);

comment on column mk_invitaciones.fuente is
  'De dónde salió el contacto: "programa" (tabla influencers, por olas) o el nombre de la lista externa que lo trajo.';

-- ── Tope diario de WhatsApp ─────────────────────────────────────────────────
--
-- El correo tiene tres frenos y WhatsApp no tenía ninguno: solo un límite por
-- petición, que no impide dar tres tandas seguidas el mismo día.
--
-- Y el tope de Meta no avisa. Pasado el cupo de destinatarios de 24 h, los
-- mensajes se ACEPTAN y no se entregan — que es exactamente lo que parece un
-- envío exitoso. Un número sin verificación de negocio se queda en 250.
--
-- 80 es deliberadamente bajo: una lista de 145 sale en dos días, y lo que se
-- protege es la calificación de calidad del número, que Meta baja con los
-- reportes y no se recupera rápido.
--
-- ⚠️ Meta cuenta destinatarios únicos en una ventana MÓVIL de 24 h; esto los
-- cuenta por día UTC, igual que el correo. Dos tandas en el filo del cambio de
-- día pueden sumar el doble del tope dentro de la misma ventana de Meta. Con
-- 80 no alcanza a acercarse a 250; si alguien sube este número, esa diferencia
-- empieza a importar. Y el tope de Meta no avisa: los mensajes de más se
-- aceptan y no se entregan.
insert into mk_config (clave, valor, descripcion)
values (
  'whatsapp_por_dia',
  '80'::jsonb,
  'Cuántos mensajes de WhatsApp masivos pueden salir por día. Debajo del tope de Meta a propósito.'
)
on conflict (clave) do nothing;
