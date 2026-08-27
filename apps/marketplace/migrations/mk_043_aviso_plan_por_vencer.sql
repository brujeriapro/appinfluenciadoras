-- mk_043 · Aviso antes de que se venza el plan de una marca
--
-- Hoy el plan simplemente deja de funcionar el día que vence: la marca entra a
-- enviar una propuesta y se encuentra con el muro, sin haber sido advertida.
-- En medio de una campaña eso se lee como que la plataforma falló.
--
-- Guarda cuándo se avisó, no si se avisó: el plan se renueva y el ciclo vuelve
-- a empezar, así que un booleano habría que acordarse de apagarlo en cada
-- renovación. Con la fecha, basta compararla contra el vencimiento vigente.

alter table mk_marcas
  add column if not exists plan_aviso_at timestamptz;

comment on column mk_marcas.plan_aviso_at is
  'Cuándo se le avisó por última vez que su plan estaba por vencerse. Se compara contra plan_vence_at para no repetir el aviso del mismo ciclo.';
