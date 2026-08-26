-- Paquetes que arma la propia creadora.
--
-- Hasta ahora solo se podia contratar entregables sueltos —un reel, una
-- historia— con un ticket mediano de $200.000. Eso deja $40.000 de comision y
-- obliga a un volumen de tratos que no va a llegar pronto.
--
-- Un paquete sube el ticket sin que nadie empuje a nadie: la creadora ofrece
-- "2 reels + 4 historias por $650.000" porque sabe que combinacion funciona, y
-- a la marca le sale mas barato que comprarlo suelto. Las dos ganan y la
-- plataforma cobra sobre un monto mayor.
--
-- El precio lo pone ELLA, igual que las tarifas sueltas. La plataforma no
-- sugiere ni impone descuentos: solo calcula cuanto costaria suelto —con las
-- tarifas de ella misma— para que la marca vea la diferencia.

CREATE TABLE IF NOT EXISTS mk_paquetes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creadora_id UUID NOT NULL REFERENCES mk_creadoras(id) ON DELETE CASCADE,

  nombre      TEXT NOT NULL,
  descripcion TEXT,
  precio      NUMERIC(12,2) NOT NULL CHECK (precio > 0),

  -- Que trae, como [{entregable, cantidad}]. Estructurado y no texto libre
  -- para poder comparar contra sus tarifas sueltas y para que la marca filtre
  -- por lo que necesita.
  incluye     JSONB NOT NULL DEFAULT '[]'::jsonb,

  activo      BOOLEAN NOT NULL DEFAULT true,
  orden       SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mk_paquetes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_paquetes_creadora ON mk_paquetes (creadora_id) WHERE activo;

-- Un trato puede nacer de un paquete. Se guarda cual para saber que se vendio
-- —y porque el paquete puede cambiar de precio despues sin que eso altere un
-- trato ya cerrado.
ALTER TABLE mk_tratos ADD COLUMN IF NOT EXISTS paquete_id UUID REFERENCES mk_paquetes(id);

INSERT INTO mk_config (clave, valor, descripcion) VALUES
  ('max_paquetes_creadora', '4'::jsonb,
   'Cuantos paquetes puede publicar una creadora. Pocos y buenos se comparan mejor que muchos')
ON CONFLICT (clave) DO NOTHING;
