-- Migración UGC — correr en Supabase SQL Editor

-- 1. Campos UGC en tabla influencers
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS codigo_ugc TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS ugc_activa BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ugc_fecha_inicio TIMESTAMP WITH TIME ZONE;

-- 2. Ventas atribuidas a cada creadora UGC
CREATE TABLE IF NOT EXISTS ugc_ventas (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id   UUID REFERENCES influencers(id) ON DELETE CASCADE,
  shopify_order_id TEXT UNIQUE,
  order_number    TEXT,
  fecha           TIMESTAMP WITH TIME ZONE,
  total_orden     NUMERIC(12,2),
  comision_pct    SMALLINT,
  comision_valor  NUMERIC(12,2),
  mes             TEXT,   -- '2026-06'
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ugc_ventas_influencer_idx ON ugc_ventas(influencer_id);
CREATE INDEX IF NOT EXISTS ugc_ventas_mes_idx ON ugc_ventas(mes);

-- 3. Pagos de comisiones por mes
CREATE TABLE IF NOT EXISTS ugc_pagos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id   UUID REFERENCES influencers(id) ON DELETE CASCADE,
  mes             TEXT NOT NULL,              -- '2026-06'
  total_ventas    NUMERIC(12,2),
  total_comision  NUMERIC(12,2),
  estado          TEXT DEFAULT 'pendiente',   -- pendiente | pagado
  fecha_pago      TIMESTAMP WITH TIME ZONE,
  metodo_pago     TEXT,
  notas           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ugc_pagos_influencer_idx ON ugc_pagos(influencer_id);

-- 4. Regalos por hitos de ventas
CREATE TABLE IF NOT EXISTS ugc_regalos (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id   UUID REFERENCES influencers(id) ON DELETE CASCADE,
  numero_regalo   INTEGER NOT NULL,           -- 1 = bienvenida, 2 = $300K, 3 = $600K ...
  hito_ventas     NUMERIC(12,2) DEFAULT 0,    -- ventas acumuladas al momento del hito
  estado          TEXT DEFAULT 'pendiente',   -- pendiente | enviado
  fecha_envio     TIMESTAMP WITH TIME ZONE,
  notas           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ugc_regalos_influencer_idx ON ugc_regalos(influencer_id);
