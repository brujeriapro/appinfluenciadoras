-- ===========================================================================
-- Creadores.app - semillas de configuracion
-- Correr DESPUES de mk_001_init.sql. Idempotente: no pisa valores ya editados
-- desde el panel admin (ON CONFLICT DO NOTHING).
--
-- Todo lo que este aqui se puede cambiar desde /api/admin/config sin desplegar.
-- ===========================================================================

INSERT INTO mk_config (clave, valor, descripcion) VALUES

  -- Comision total 20%, repartida entre los dos lados.
  -- Los valores del handoff de diseno son 12% marca / 8% creadora.
  ('comision_marca_pct', '12'::jsonb,
   'Porcentaje adicional que paga la marca sobre el monto acordado'),

  ('comision_creadora_pct', '8'::jsonb,
   'Porcentaje que se descuenta a la creadora de su pago'),

  -- Momento en que se revela el contacto directo entre las partes.
  -- pago_retenido (default) protege la clausula de no-circunvalacion:
  -- nadie tiene datos de contacto de nadie hasta que el dinero esta en custodia.
  ('revelar_contacto_en', '"pago_retenido"'::jsonb,
   'Estado del trato en que se revela el contacto: pago_retenido | aceptado'),

  ('plazo_no_circunvalacion_meses', '12'::jsonb,
   'Meses durante los cuales una marca debe comision aunque contrate por fuera'),

  ('moneda', '"COP"'::jsonb,
   'Moneda unica de la Fase 1'),

  -- Niveles de tarifa sugerida por alcance. PROVISIONALES: ajustar con datos
  -- reales del mercado colombiano antes de abrir a marcas externas.
  ('niveles_tarifa', '{
    "inicial": {"min": 200000,  "max": 500000,  "etiqueta": "Inicial"},
    "medio":   {"min": 500000,  "max": 1000000, "etiqueta": "Medio"},
    "top":     {"min": 1000000, "max": 3000000, "etiqueta": "Top"}
  }'::jsonb,
   'Rangos de tarifa sugerida en COP por nivel de creadora'),

  -- Se muestra el rango, nunca el numero exacto de seguidores: un numero
  -- exacto es un identificador casi unico y permitiria encontrar el perfil.
  ('rangos_alcance', '[
    {"clave": "1K-10K",   "min": 1000,   "max": 10000},
    {"clave": "10K-50K",  "min": 10000,  "max": 50000},
    {"clave": "50K-100K", "min": 50000,  "max": 100000},
    {"clave": "100K+",    "min": 100000, "max": null}
  ]'::jsonb,
   'Rangos de alcance visibles en el catalogo'),

  ('nichos', '[
    "rizos", "cuidado capilar", "peluqueria", "maquillaje", "skincare",
    "unas", "lifestyle", "maternidad", "fitness", "moda"
  ]'::jsonb,
   'Taxonomia cerrada de nichos - el admin la asigna al curar cada perfil'),

  -- Metricas del hero de la landing. Mientras sean texto fijo, viven aqui y no
  -- en el HTML, para que dejen de mentir en cuanto haya datos reales.
  ('landing_metricas', '{
    "perfiles": "420+",
    "dias_entrega": "7 DIAS",
    "escrow": "100%",
    "costo_publicar": "0 COP",
    "ciudades": 4
  }'::jsonb,
   'Cifras mostradas en el hero de la landing publica')

ON CONFLICT (clave) DO NOTHING;
