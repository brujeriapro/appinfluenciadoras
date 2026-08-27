-- mk_051 · La creadora PIDE que le verifiquen las métricas
--
-- Hasta ahora `metricas_estado` iba de 'declarado' a 'verificado' y el salto lo
-- daba el equipo. Faltaba el estado del medio, y no es cosmético: sin él, la
-- creadora sube su captura y no pasa nada visible, así que vuelve a entrar a
-- ver si tiene que hacer algo. El handoff lo dice literal — el texto de ese
-- estado tiene que decir "nada que hacer de tu lado", porque esa línea es la
-- mitad del trabajo del estado.
--
--   declarado  · sus números son lo que ella dijo
--   solicitada · pidió revisión; el equipo tiene la pelota
--   verificado · alguien comparó los números contra sus estadísticas
--
-- ⚠️ NO existe un estado 'rechazada' y es a propósito: en este producto no hay
-- señalamiento negativo hacia una creadora. Si los números no cuadran, vuelve a
-- 'declarado' con un mensaje de qué reconectar — no queda marcada.
--
-- El porcentaje de completitud NO sube al solicitar. Sube al aprobar. Si
-- subiera al pedir, pedir sería gratis y el sello dejaría de valer.

-- Solo la fecha de la solicitud: la de verificación ya existe desde antes y se
-- llama `metricas_verificadas_at`, en plural.
alter table mk_creadoras
  add column if not exists metricas_solicitada_at timestamptz;

comment on column mk_creadoras.metricas_solicitada_at is
  'Cuándo pidió que le revisaran las métricas. Se limpia al aprobar o al devolverla a declarado.';

-- Para que la cola del equipo salga ordenada por quién lleva más esperando.
create index if not exists mk_creadoras_verificacion_pendiente
  on mk_creadoras (metricas_solicitada_at)
  where metricas_estado = 'solicitada';
