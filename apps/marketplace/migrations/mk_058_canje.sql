-- mk_058 · Tratos por canje
--
-- La mitad del mercado de belleza se mueve por canje: la marca manda producto y
-- la creadora hace el contenido. Hasta ahora la plataforma solo sabía de plata,
-- así que esos tratos se cerraban por fuera — y con ellos se iba la comisión y,
-- peor, el historial de cumplimiento, que es lo que hace valer el catálogo.
--
-- **Por qué un canje no lleva escrow.** El escrow protege trabajo ya hecho:
-- retiene la plata hasta que la marca aprueba, para que nadie grabe gratis. En
-- un canje la creadora no graba hasta que le llega el producto, así que si
-- nunca llega simplemente no hay contenido y nadie perdió nada. No hay qué
-- retener porque no hay nada en riesgo.
--
-- Lo que sí se cobra es una comisión FIJA, al aceptar la creadora — igual que
-- se promete para los tratos en dinero: no se cobra si dice que no.

alter table mk_tratos
  add column if not exists tipo_pago text not null default 'dinero';

alter table mk_tratos drop constraint if exists mk_tratos_tipo_pago_check;
alter table mk_tratos add constraint mk_tratos_tipo_pago_check
  check (tipo_pago in ('dinero', 'canje'));

comment on column mk_tratos.tipo_pago is
  '"dinero" (monto + comisiones por porcentaje) o "canje" (producto + comisión fija).';

-- Un canje va con monto en cero, y el `check` de monto positivo que protege a
-- los tratos en dinero tiene que seguir protegiéndolos.
alter table mk_tratos drop constraint if exists mk_tratos_monto_check;
alter table mk_tratos add constraint mk_tratos_monto_check
  check (
    (tipo_pago = 'dinero' and monto_creadora > 0)
    or (tipo_pago = 'canje' and monto_creadora = 0)
  );

create index if not exists mk_tratos_tipo_pago_idx on mk_tratos (tipo_pago);

-- Lo que cobramos por un canje. Va en config y no en el código porque es un
-- precio, y los precios cambian sin desplegar.
insert into mk_config (clave, valor, descripcion)
values (
  'canje_comision_fija',
  '4900'::jsonb,
  'Lo que paga la marca por un trato en canje, en COP. Fijo: no hay monto sobre el cual sacar porcentaje.'
)
on conflict (clave) do nothing;
