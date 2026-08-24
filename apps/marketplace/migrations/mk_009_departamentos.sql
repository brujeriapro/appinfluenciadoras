-- ===========================================================================
-- Creators Manager - mk_009
--
-- Departamento y ciudad de Colombia como listas desplegables.
--
-- Por que listas y no texto libre: escrito a mano, la misma ciudad llega como
-- "Medellin", "medellin", "Medellín", "Mede" y "Medellin, Antioquia". Con eso
-- el filtro del catalogo no sirve — una marca que busca creadoras en Medellin
-- se pierde la mitad. Con lista cerrada, filtrar funciona.
--
-- Fuera de Colombia sigue siendo texto libre: no tenemos listas confiables de
-- los otros 19 paises, y una lista incompleta es peor que un campo abierto.
-- ===========================================================================

ALTER TABLE mk_creadoras
  ADD COLUMN IF NOT EXISTS departamento TEXT;

ALTER TABLE mk_marcas
  ADD COLUMN IF NOT EXISTS departamento TEXT;

CREATE INDEX IF NOT EXISTS mk_creadoras_departamento_idx ON mk_creadoras(departamento);

-- Los 32 departamentos y Bogota, cada uno con sus ciudades principales.
-- No es el listado completo de municipios (son mas de mil): son las ciudades
-- donde de verdad hay creadoras con audiencia. La opcion "Otra" cubre el resto.
INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('departamentos_co', '[
    {"nombre":"Bogotá D.C.","ciudades":["Bogotá"]},
    {"nombre":"Antioquia","ciudades":["Medellín","Envigado","Itagüí","Bello","Sabaneta","Rionegro","Apartadó","Turbo","La Ceja","Caldas","Copacabana","Girardota","Otra"]},
    {"nombre":"Valle del Cauca","ciudades":["Cali","Palmira","Buenaventura","Tuluá","Cartago","Buga","Jamundí","Yumbo","Otra"]},
    {"nombre":"Atlántico","ciudades":["Barranquilla","Soledad","Malambo","Puerto Colombia","Sabanalarga","Otra"]},
    {"nombre":"Bolívar","ciudades":["Cartagena","Magangué","Turbaco","El Carmen de Bolívar","Otra"]},
    {"nombre":"Santander","ciudades":["Bucaramanga","Floridablanca","Girón","Piedecuesta","Barrancabermeja","San Gil","Otra"]},
    {"nombre":"Cundinamarca","ciudades":["Soacha","Chía","Zipaquirá","Facatativá","Fusagasugá","Girardot","Mosquera","Madrid","Funza","Cajicá","Otra"]},
    {"nombre":"Risaralda","ciudades":["Pereira","Dosquebradas","Santa Rosa de Cabal","La Virginia","Otra"]},
    {"nombre":"Caldas","ciudades":["Manizales","Villamaría","Chinchiná","La Dorada","Otra"]},
    {"nombre":"Quindío","ciudades":["Armenia","Calarcá","Montenegro","Circasia","Salento","Otra"]},
    {"nombre":"Tolima","ciudades":["Ibagué","Espinal","Melgar","Honda","Mariquita","Otra"]},
    {"nombre":"Huila","ciudades":["Neiva","Pitalito","Garzón","La Plata","Otra"]},
    {"nombre":"Norte de Santander","ciudades":["Cúcuta","Ocaña","Pamplona","Villa del Rosario","Los Patios","Otra"]},
    {"nombre":"Nariño","ciudades":["Pasto","Ipiales","Tumaco","Túquerres","Otra"]},
    {"nombre":"Córdoba","ciudades":["Montería","Lorica","Cereté","Sahagún","Planeta Rica","Otra"]},
    {"nombre":"Cesar","ciudades":["Valledupar","Aguachica","Codazzi","La Jagua de Ibirico","Otra"]},
    {"nombre":"Magdalena","ciudades":["Santa Marta","Ciénaga","Fundación","El Banco","Otra"]},
    {"nombre":"Meta","ciudades":["Villavicencio","Acacías","Granada","Puerto López","Otra"]},
    {"nombre":"Cauca","ciudades":["Popayán","Santander de Quilichao","Puerto Tejada","Otra"]},
    {"nombre":"Boyacá","ciudades":["Tunja","Duitama","Sogamoso","Chiquinquirá","Paipa","Villa de Leyva","Otra"]},
    {"nombre":"Sucre","ciudades":["Sincelejo","Corozal","Sampués","San Marcos","Otra"]},
    {"nombre":"La Guajira","ciudades":["Riohacha","Maicao","Uribia","Fonseca","Otra"]},
    {"nombre":"Caquetá","ciudades":["Florencia","San Vicente del Caguán","Otra"]},
    {"nombre":"Casanare","ciudades":["Yopal","Aguazul","Villanueva","Otra"]},
    {"nombre":"Chocó","ciudades":["Quibdó","Istmina","Bahía Solano","Nuquí","Otra"]},
    {"nombre":"Putumayo","ciudades":["Mocoa","Puerto Asís","Orito","Otra"]},
    {"nombre":"Arauca","ciudades":["Arauca","Saravena","Tame","Otra"]},
    {"nombre":"San Andrés y Providencia","ciudades":["San Andrés","Providencia"]},
    {"nombre":"Amazonas","ciudades":["Leticia","Puerto Nariño"]},
    {"nombre":"Guaviare","ciudades":["San José del Guaviare","Otra"]},
    {"nombre":"Vichada","ciudades":["Puerto Carreño","Otra"]},
    {"nombre":"Guainía","ciudades":["Inírida"]},
    {"nombre":"Vaupés","ciudades":["Mitú"]}
  ]'::jsonb,
   'Departamentos de Colombia con sus ciudades principales, para los desplegables')
ON CONFLICT (clave) DO NOTHING;
