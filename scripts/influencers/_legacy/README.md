# Legacy — Scripts Python del Programa Creadoras

> **Estos scripts están archivados.** La lógica vive ahora en la app Node `apps/creadoras/`.

## Por qué se archivaron

El commit `ec34dda` (2026-04-23) portó todo el pipeline a Node para consolidar el sistema en un solo servicio Railway. Los scripts Python ya no se ejecutan en producción.

## Mapeo Python → Node

| Python (legacy)           | Node (activo)                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `webhook_receiver.py`     | `POST /api/webhooks/registro` y `/api/webhooks/contenido` en `apps/creadoras/index.js` |
| `crear_envio.py`          | Auto-envío en `apps/creadoras/index.js` + `shopify.js`                                |
| `calcular_scores.py`      | Webhook de contenido + `apps/creadoras/scoring.js`                                    |
| `seguimiento.py`          | `POST /api/cron/seguimiento` + `apps/creadoras/email.js`                              |
| `scoring.py`              | `apps/creadoras/scoring.js`                                                           |
| `nivel_bruja.py`          | Integrado en `scoring.js`                                                             |
| `tier_calculator.py`      | Integrado en `apps/creadoras/index.js`                                                |
| `shopify_client.py`       | `apps/creadoras/shopify.js`                                                           |
| `siigo_client.py`         | `apps/creadoras/siigo.js`                                                             |
| `supabase_client.py`      | `apps/creadoras/supabase.js`                                                          |
| `limpiar_supabase.py`     | (utilidad de testing, sin equivalente en Node)                                        |

## Cuándo usarlos

Solo para debugging puntual o como referencia. Si vas a agregar una feature, hazlo en la app Node.

## Cómo correrlos (si necesitas)

```bash
cd scripts/influencers/_legacy
pip install -r requirements_influencers.txt
python <script>.py --dry-run
```

Los scripts siguen leyendo de `../config_influencers.json` (un nivel arriba).
