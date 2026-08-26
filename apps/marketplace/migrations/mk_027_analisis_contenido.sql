-- Análisis del contenido real de cada creadora.
--
-- Es la otra mitad de la promesa de la ficha: "te decimos cómo trabaja". Hoy
-- una marca ve 50 fichas y tiene que abrir video por video para saber si el
-- estilo le sirve. Esto lee cada pieza una vez y deja la respuesta consultable.
--
-- Se guarda en tabla y no en vista —al revés que mk_cumplimiento— porque cada
-- fila cuesta una llamada a un modelo de visión: recalcularla en cada consulta
-- sería tirar plata. Una pieza se analiza una vez y no vuelve a cambiar.
--
-- Los vocabularios de los comentarios son cerrados a propósito y viven en
-- analisis.js (VOCAB). Con texto libre, "baño" y "el baño de su casa" serían
-- categorías distintas y ningún filtro agruparía nada.
--
-- Se llena con:  node scripts/analizar-contenido.js

CREATE TABLE IF NOT EXISTS mk_analisis_pieza (
  muestra_id   UUID PRIMARY KEY REFERENCES mk_muestras(id) ON DELETE CASCADE,
  creadora_id  UUID NOT NULL REFERENCES mk_creadoras(id) ON DELETE CASCADE,

  -- Dónde y cómo graba
  escenario    TEXT,   -- baño · cocina · dormitorio · sala · exterior · estudio · calle · gimnasio · carro · otro
  luz          TEXT,   -- natural · artificial_calida · artificial_fria · anillo · mixta
  plano        TEXT,   -- primer_plano · medio · cuerpo_completo · cenital_manos · detalle_producto
  produccion   TEXT,   -- casera · cuidada · profesional

  -- Qué tipo de pieza es
  formato      TEXT,   -- habla_camara · voz_en_off · sin_voz · tutorial · antes_despues
                       -- unboxing · rutina · resena · grwm · trend · otro
  energia      TEXT,   -- calmada · conversacional · energica

  -- Detalles que a una marca le importan al contratar
  producto_visible  BOOLEAN,
  etiqueta_legible  BOOLEAN,   -- ¿se alcanza a leer la marca del producto?
  subtitulos        BOOLEAN,
  calidad_tecnica   SMALLINT CHECK (calidad_tecnica BETWEEN 1 AND 5),

  -- Descripción en prosa. Es lo que después alimenta la búsqueda en lenguaje
  -- natural: los campos cerrados filtran, este texto encuentra los matices.
  descripcion  TEXT,

  modelo       TEXT,
  analizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analisis_creadora  ON mk_analisis_pieza (creadora_id);
CREATE INDEX IF NOT EXISTS idx_analisis_escenario ON mk_analisis_pieza (escenario);
CREATE INDEX IF NOT EXISTS idx_analisis_formato   ON mk_analisis_pieza (formato);
