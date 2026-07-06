-- Migración UGC 002 — Acuerdo de colaboración firmado
-- Correr en Supabase → SQL Editor

-- 1. Datos de identificación de la creadora (para rellenar el acuerdo)
ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS nombre_completo   TEXT,
  ADD COLUMN IF NOT EXISTS tipo_documento    TEXT,   -- 'C.C.' | 'C.E.'
  ADD COLUMN IF NOT EXISTS numero_documento  TEXT,
  ADD COLUMN IF NOT EXISTS codigo_postal     TEXT,
  ADD COLUMN IF NOT EXISTS acuerdo_firmado   BOOLEAN DEFAULT false;

-- 2. Acuerdos de colaboración firmados por las creadoras
CREATE TABLE IF NOT EXISTS ugc_acuerdos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  influencer_id     UUID REFERENCES influencers(id) ON DELETE CASCADE,
  nombre_completo   TEXT,
  tipo_documento    TEXT,
  numero_documento  TEXT,
  usuario           TEXT,
  ciudad_firma      TEXT,
  firma_base64      TEXT,        -- PNG de la firma dibujada por la creadora
  fecha_firma       TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ip                TEXT,        -- evidencia de firma
  user_agent        TEXT,        -- evidencia de firma
  version           TEXT DEFAULT 'v1',
  estado            TEXT DEFAULT 'firmado',
  created_at        TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ugc_acuerdos_influencer_idx ON ugc_acuerdos(influencer_id);
