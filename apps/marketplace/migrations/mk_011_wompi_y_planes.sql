-- ===========================================================================
-- Creadores.app - mk_011
--
-- Pagos con Wompi y planes de suscripcion.
--
-- Dos cosas distintas que comparten la pasarela:
--
--   1. ESCROW. La marca paga el trato con tarjeta y el webhook confirma. Deja
--      de ser transferencia manual registrada a mano en el panel, que es la
--      carga operativa que no escala.
--
--   2. SUSCRIPCION. La marca paga un plan mensual por acceder al catalogo. La
--      comision del 20% NO se toca: la suscripcion paga el derecho a buscar,
--      la comision paga el escrow y la gestion.
--
-- La regla que separa los dos negocios: se cobra por BUSCAR, se gana por
-- CERRAR. Por eso los planes limitan cuantas fichas se abren al mes y nunca
-- cuantas propuestas se envian — limitar propuestas seria limitar la propia
-- comision.
-- ===========================================================================

-- -- 1. Transacciones de Wompi ------------------------------------------------
-- Toda plata que entra por la pasarela deja fila aca, sin importar si termino
-- aprobada. Una transaccion rechazada tambien es informacion: dice por que un
-- trato no avanzo.
CREATE TABLE IF NOT EXISTS mk_transacciones (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referencia     TEXT UNIQUE NOT NULL,     -- la que enviamos a Wompi
  wompi_id       TEXT,                     -- id de la transaccion en Wompi
  concepto       TEXT NOT NULL,            -- trato | suscripcion
  trato_id       UUID REFERENCES mk_tratos(id) ON DELETE SET NULL,
  marca_id       UUID REFERENCES mk_marcas(id) ON DELETE SET NULL,
  monto          NUMERIC(12,2) NOT NULL,
  estado         TEXT DEFAULT 'pendiente', -- pendiente | aprobada | rechazada | anulada | error
  metodo         TEXT,                     -- CARD, NEQUI, PSE...
  datos          JSONB,                    -- respuesta cruda de Wompi, para auditar
  created_at     TIMESTAMP WITH TIME ZONE DEFAULT now(),
  actualizada_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE mk_transacciones ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS mk_transacciones_trato_idx ON mk_transacciones(trato_id);
CREATE INDEX IF NOT EXISTS mk_transacciones_marca_idx ON mk_transacciones(marca_id);
CREATE INDEX IF NOT EXISTS mk_transacciones_wompi_idx ON mk_transacciones(wompi_id);

-- -- 2. Planes -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mk_planes (
  clave           TEXT PRIMARY KEY,
  nombre          TEXT NOT NULL,
  precio_mes      NUMERIC(12,2) NOT NULL,
  fichas_mes      INTEGER,          -- null = sin limite
  propuestas_mes  INTEGER,          -- null = sin limite. Se deja por si acaso,
                                    -- pero el modelo NO limita propuestas.
  campanas_max    INTEGER,
  comparador      BOOLEAN DEFAULT false,
  multi_marca     BOOLEAN DEFAULT false,
  orden           SMALLINT DEFAULT 0,
  activo          BOOLEAN DEFAULT true
);
ALTER TABLE mk_planes ENABLE ROW LEVEL SECURITY;

INSERT INTO mk_planes (clave, nombre, precio_mes, fichas_mes, propuestas_mes, campanas_max, comparador, multi_marca, orden) VALUES
  ('demo',     'Demo',     0,      3,    1,    1,    false, false, 0),
  ('emprende', 'Emprende', 19900,  10,   NULL, 1,    false, false, 1),
  ('marca',    'Marca',    99900,  60,   NULL, NULL, true,  false, 2),
  ('agencia',  'Agencia',  199900, NULL, NULL, NULL, true,  true,  3)
ON CONFLICT (clave) DO NOTHING;

-- -- 3. Suscripcion de cada marca ----------------------------------------------
ALTER TABLE mk_marcas
  ADD COLUMN IF NOT EXISTS plan            TEXT DEFAULT 'demo' REFERENCES mk_planes(clave),
  ADD COLUMN IF NOT EXISTS plan_vence_at   TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS plan_renovacion BOOLEAN DEFAULT false;

COMMENT ON COLUMN mk_marcas.plan_vence_at IS 'Nulo en demo. Cuando pasa la fecha, la marca vuelve a los limites del demo.';

-- -- 4. Fichas abiertas ---------------------------------------------------------
-- Se cuentan fichas DISTINTAS por mes, no visitas: si contara cada vez que
-- abre, la marca navegaria con miedo justo cuando esta por contratar.
CREATE TABLE IF NOT EXISTS mk_fichas_vistas (
  marca_id    UUID REFERENCES mk_marcas(id) ON DELETE CASCADE,
  creadora_id UUID REFERENCES mk_creadoras(id) ON DELETE CASCADE,
  mes         TEXT NOT NULL,            -- '2026-08'
  created_at  TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (marca_id, creadora_id, mes)
);
ALTER TABLE mk_fichas_vistas ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS mk_fichas_vistas_mes_idx ON mk_fichas_vistas(marca_id, mes);

-- -- 5. Configuracion ------------------------------------------------------------
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('pagos_wompi_activos', 'false'::jsonb,
   'Enciende el cobro con tarjeta. En false el escrow se sigue registrando a mano.'),
  ('planes_activos', 'false'::jsonb,
   'Enciende el muro de suscripcion. En false ninguna marca tiene limite de fichas.')
ON CONFLICT (clave) DO NOTHING;
