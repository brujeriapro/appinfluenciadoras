# App Creadoras — Brujería Capilar

Panel de administración del Programa Creadoras.

## Instalación

```bash
cd apps/creadoras/
npm install
```

## Correr

```bash
node index.js
# Abre http://localhost:3030
```

## Vistas

- **Dashboard** — stats globales: total influencers, kits enviados, costo acumulado, score promedio
- **Influencers** — tabla completa con filtros por status, tier y nivel Bruja. Clic para ver detalle
- **Detalle influencer** — datos, contenidos, score, cambiar status, asignar código de descuento
- **Contenidos** — todas las piezas de contenido entregadas con scores
- **ROI** — selector de período, ventas Shopify vs costo kits, ROI global del programa

## Requisitos

Las credenciales se leen automáticamente de `scripts/influencers/config_influencers.json`.
Asegurarse de que Supabase y Shopify estén configurados en ese archivo antes de correr.

## Antes de la primera ejecución

Ejecutar en Supabase → SQL Editor:

```sql
ALTER TABLE influencers ADD COLUMN IF NOT EXISTS codigo_descuento text;
```

## Para subir a Railway/Render

1. Subir el repo
2. Start command: `node apps/creadoras/index.js`
3. No se necesitan variables de entorno adicionales (las credenciales están en el JSON)
