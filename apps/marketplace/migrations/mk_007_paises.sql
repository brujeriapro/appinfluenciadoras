-- ===========================================================================
-- Creators Manager - mk_007
--
-- Pais en el perfil de creadoras y marcas.
--
-- OJO CON LA MONEDA: todo el sistema opera en COP. El deslizador de tarifas va
-- de $50.000 a $8.000.000 pesos colombianos, la comision se calcula en pesos y
-- el escrow es transferencia local. Agregar pais NO habilita multi-moneda.
--
-- Una creadora de otro pais publica su tarifa EN COP y se le paga en COP. La
-- interfaz lo dice con todas las letras: sin eso, alguien en Mexico pondria
-- "500.000" pensando en pesos mexicanos y terminaria en un reclamo.
--
-- Multi-moneda de verdad exige conversion, pagos internacionales y repensar el
-- escrow. Es un proyecto aparte.
-- ===========================================================================

ALTER TABLE mk_creadoras
  ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'CO';

ALTER TABLE mk_marcas
  ADD COLUMN IF NOT EXISTS pais TEXT DEFAULT 'CO';

COMMENT ON COLUMN mk_creadoras.pais IS 'Codigo ISO de 2 letras. La moneda sigue siendo COP para todos.';

CREATE INDEX IF NOT EXISTS mk_creadoras_pais_idx ON mk_creadoras(pais);

-- Las que ya existen son colombianas: el marketplace arranco solo en Colombia.
UPDATE mk_creadoras SET pais = 'CO' WHERE pais IS NULL;
UPDATE mk_marcas    SET pais = 'CO' WHERE pais IS NULL;

-- -- Paises disponibles ------------------------------------------------------
-- Latinoamerica hispanohablante mas Espana y Estados Unidos, que es donde hay
-- creadoras latinas con audiencia que le sirve a una marca colombiana.
-- Colombia va de primera porque es el grueso.
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('paises', '[
    {"codigo":"CO","nombre":"Colombia"},
    {"codigo":"MX","nombre":"México"},
    {"codigo":"AR","nombre":"Argentina"},
    {"codigo":"CL","nombre":"Chile"},
    {"codigo":"PE","nombre":"Perú"},
    {"codigo":"EC","nombre":"Ecuador"},
    {"codigo":"VE","nombre":"Venezuela"},
    {"codigo":"CR","nombre":"Costa Rica"},
    {"codigo":"PA","nombre":"Panamá"},
    {"codigo":"GT","nombre":"Guatemala"},
    {"codigo":"DO","nombre":"República Dominicana"},
    {"codigo":"UY","nombre":"Uruguay"},
    {"codigo":"PY","nombre":"Paraguay"},
    {"codigo":"BO","nombre":"Bolivia"},
    {"codigo":"SV","nombre":"El Salvador"},
    {"codigo":"HN","nombre":"Honduras"},
    {"codigo":"NI","nombre":"Nicaragua"},
    {"codigo":"PR","nombre":"Puerto Rico"},
    {"codigo":"ES","nombre":"España"},
    {"codigo":"US","nombre":"Estados Unidos"}
  ]'::jsonb,
   'Paises donde puede registrarse una creadora. La moneda es COP para todos.'),

  ('moneda_unica', 'true'::jsonb,
   'Mientras este en true, todas las tarifas y pagos son en COP sin importar el pais.')
ON CONFLICT (clave) DO NOTHING;
