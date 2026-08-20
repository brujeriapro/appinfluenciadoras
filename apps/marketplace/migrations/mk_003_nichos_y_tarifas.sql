-- ===========================================================================
-- Creadores.app - mk_003
--
-- Dos cambios de fondo:
--
-- 1. NICHOS AMPLIOS. La taxonomia inicial era de belleza (10 nichos). Se
--    reemplaza por una de dos niveles que cubre todo el universo de creadoras:
--    15 categorias madre con subnichos. Base: las 15 categorias canonicas de
--    YouTube, cruzadas con los nichos que de verdad contratan las marcas en
--    los marketplaces de creadoras (belleza, moda, fitness, viajes y lifestyle
--    concentran la demanda; el resto abre mercado).
--
-- 2. TARIFA QUE PONE LA CREADORA. Antes habia niveles fijos (inicial/medio/top)
--    definidos por la plataforma. Ahora cada creadora publica cuanto cobra por
--    cada tipo de entregable, moviendo un control deslizante. Los niveles
--    quedan solo como derivacion para que la marca pueda filtrar por
--    presupuesto; ya no son un input.
-- ===========================================================================

-- -- 1. Tarifas por entregable ------------------------------------------------
-- Una fila por combinacion creadora + entregable. La creadora decide el precio
-- y decide cuales publica; lo que no este activo no aparece en el catalogo.
CREATE TABLE IF NOT EXISTS mk_tarifas (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creadora_id  UUID REFERENCES mk_creadoras(id) ON DELETE CASCADE,
  entregable   TEXT NOT NULL,           -- clave de mk_config.entregables
  precio       NUMERIC(12,2) NOT NULL,
  activo       BOOLEAN DEFAULT true,
  updated_at   TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at   TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (creadora_id, entregable)
);
CREATE INDEX IF NOT EXISTS mk_tarifas_creadora_idx ON mk_tarifas(creadora_id);
CREATE INDEX IF NOT EXISTS mk_tarifas_precio_idx   ON mk_tarifas(precio);

-- mk_creadoras.tarifa_min / tarifa_max pasan a ser DERIVADOS: el minimo y el
-- maximo de las tarifas activas de esa creadora. Se recalculan en el codigo
-- cada vez que ella guarda sus precios, para que el catalogo pueda filtrar por
-- presupuesto sin cruzar tablas en cada consulta.
COMMENT ON COLUMN mk_creadoras.tarifa_min IS 'Derivado de mk_tarifas: precio mas bajo publicado. No editar a mano.';
COMMENT ON COLUMN mk_creadoras.tarifa_max IS 'Derivado de mk_tarifas: precio mas alto publicado. No editar a mano.';
COMMENT ON COLUMN mk_creadoras.nivel_tarifa IS 'Derivado de tarifa_min: solo para filtrar por presupuesto.';

-- Categoria madre de la creadora, para filtros de primer nivel.
ALTER TABLE mk_creadoras
  ADD COLUMN IF NOT EXISTS categorias TEXT[];

-- -- 2. Taxonomia de nichos ---------------------------------------------------
-- Dos niveles: 15 categorias madre, cada una con sus subnichos. La creadora
-- elige hasta 3 subnichos; la marca puede filtrar por categoria (amplio) o por
-- subnicho (preciso).
UPDATE mk_config SET valor = '[
  {"clave":"belleza","nombre":"Belleza","subnichos":["maquillaje","skincare","cuidado capilar","rizos","peluqueria","unas","barberia","perfumes","estetica"]},
  {"clave":"moda","nombre":"Moda y estilo","subnichos":["moda femenina","moda masculina","streetwear","segunda mano","tallas grandes","accesorios","joyeria","calzado","asesoria de imagen"]},
  {"clave":"fitness","nombre":"Salud y fitness","subnichos":["gimnasio","running","yoga","pilates","nutricion","salud mental","suplementacion","vida saludable"]},
  {"clave":"comida","nombre":"Comida y bebida","subnichos":["recetas","reposteria","restaurantes","cafe","cocteleria","comida saludable","cocina colombiana","comida rapida"]},
  {"clave":"hogar","nombre":"Hogar y decoracion","subnichos":["decoracion","organizacion","manualidades","jardineria","remodelacion","limpieza","electrodomesticos"]},
  {"clave":"familia","nombre":"Familia y crianza","subnichos":["maternidad","paternidad","embarazo","bebes","ninos","adolescentes","planes en familia"]},
  {"clave":"mascotas","nombre":"Mascotas","subnichos":["perros","gatos","adiestramiento","cuidado animal","otras mascotas"]},
  {"clave":"viajes","nombre":"Viajes","subnichos":["viajes en Colombia","viajes internacionales","aventura","hoteles","playa","turismo gastronomico","viajar barato"]},
  {"clave":"tecnologia","nombre":"Tecnologia","subnichos":["resenas de gadgets","celulares","apps","inteligencia artificial","computadores","fotografia y video","programacion"]},
  {"clave":"gaming","nombre":"Gaming y esports","subnichos":["gameplay","streaming","gaming movil","esports","setup gamer"]},
  {"clave":"finanzas","nombre":"Finanzas y negocios","subnichos":["finanzas personales","emprendimiento","inversion","empleo y carrera","ventas","marketing digital"]},
  {"clave":"educacion","nombre":"Educacion","subnichos":["idiomas","tecnicas de estudio","ciencia","historia","tutoriales","desarrollo personal"]},
  {"clave":"entretenimiento","nombre":"Entretenimiento","subnichos":["comedia","musica","baile","cine y series","arte e ilustracion","retos y trends","farandula"]},
  {"clave":"movilidad","nombre":"Autos y movilidad","subnichos":["carros","motos","bicicletas","movilidad electrica","resenas de vehiculos"]},
  {"clave":"lifestyle","nombre":"Estilo de vida y cultura","subnichos":["vida diaria","espiritualidad","causas sociales","comunidad LGBTIQ+","bodas y eventos","vida universitaria","vida en el exterior","sostenibilidad"]}
]'::jsonb,
updated_at = now()
WHERE clave = 'nichos';

-- Si la fila no existia (base nueva), insertarla.
INSERT INTO mk_config (clave, valor, descripcion)
SELECT 'nichos', '[]'::jsonb, 'Taxonomia de nichos en dos niveles: categoria madre + subnichos'
WHERE NOT EXISTS (SELECT 1 FROM mk_config WHERE clave = 'nichos');

-- -- 3. Tipos de entregable ---------------------------------------------------
-- Lo que una creadora puede vender. Cada uno lleva su propio precio.
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('entregables', '[
    {"clave":"reel","nombre":"Reel de Instagram","descripcion":"Video vertical publicado en tu perfil"},
    {"clave":"tiktok","nombre":"Video de TikTok","descripcion":"Video publicado en tu cuenta de TikTok"},
    {"clave":"story","nombre":"Historias","descripcion":"Secuencia de historias con producto"},
    {"clave":"post","nombre":"Post o carrusel","descripcion":"Publicacion de foto o carrusel en el feed"},
    {"clave":"ugc","nombre":"Contenido UGC","descripcion":"Material para que la marca use en su pauta, sin publicar en tu perfil"},
    {"clave":"resena","nombre":"Resena en video","descripcion":"Video hablando del producto a fondo"},
    {"clave":"combo","nombre":"Combo (reel + historias)","descripcion":"Paquete de varias piezas"},
    {"clave":"evento","nombre":"Asistencia a evento","descripcion":"Presencia y cubrimiento presencial"},
    {"clave":"embajadora","nombre":"Embajadora por mes","descripcion":"Varias piezas al mes de forma continua"}
  ]'::jsonb,
   'Tipos de entregable que una creadora puede publicar con precio propio'),

  -- Limites del control deslizante con que la creadora fija su precio.
  ('rango_tarifa', '{"min": 50000, "max": 8000000, "paso": 10000}'::jsonb,
   'Limites y paso del slider de tarifa, en COP')

ON CONFLICT (clave) DO NOTHING;

-- -- 4. Niveles: ahora solo son filtros de presupuesto -------------------------
-- Ya no se le impone tarifa a nadie. La marca los usa para acotar la busqueda,
-- y el nivel de cada creadora se deriva de lo que ella misma publico.
UPDATE mk_config SET valor = '{
  "inicial": {"min": 0,       "max": 500000,  "etiqueta": "Hasta $500K"},
  "medio":   {"min": 500000,  "max": 1500000, "etiqueta": "$500K - $1.5M"},
  "top":     {"min": 1500000, "max": null,    "etiqueta": "Mas de $1.5M"}
}'::jsonb,
descripcion = 'Rangos de presupuesto para filtrar. El nivel se deriva de la tarifa que publica la creadora, no se le asigna.',
updated_at = now()
WHERE clave = 'niveles_tarifa';

-- Misma regla que en mk_001: puerta de Supabase cerrada para llaves publicas.
-- La app entra con service_role, que ignora RLS.
ALTER TABLE mk_tarifas ENABLE ROW LEVEL SECURITY;
