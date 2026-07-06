-- Migración UGC 003 — Producto elegido y despacho del regalo
-- Correr en Supabase → SQL Editor

ALTER TABLE ugc_regalos
  ADD COLUMN IF NOT EXISTS producto_nombre   TEXT,   -- nombre(s) del producto enviado como regalo
  ADD COLUMN IF NOT EXISTS sku               TEXT,   -- SKU(s) enviados, separados por coma
  ADD COLUMN IF NOT EXISTS shopify_order_id  TEXT;   -- orden de gifting creada en Shopify
