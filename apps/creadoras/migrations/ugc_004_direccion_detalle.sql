-- Migración UGC 004 — Detalle de dirección
-- Correr en Supabase → SQL Editor
-- (el correo ya existe como columna 'email' en influencers)

ALTER TABLE influencers
  ADD COLUMN IF NOT EXISTS direccion_detalle TEXT;  -- casa, apto, torre, urbanización
