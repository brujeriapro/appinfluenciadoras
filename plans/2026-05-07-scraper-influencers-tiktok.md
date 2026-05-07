# Scraper TikTok — Candidatas Influencers Brujería Capilar

**Fecha:** 2026-05-07  
**Estado:** Planificado  
**Workspace:** `appinfluenciadoras/`

---

## Librería elegida: Playwright directo

Ya instalado en `venv_logistica`. Control total, delays humanos, intercepción de red JSON interna de TikTok.

---

## Hashtags por grupo

**Grupo 1 — Cuidado capilar (prioridad máxima)**
`cuidadocapilar, rizado, cabellorizado, transicioncapilar, cabellonatural, rizadas, peloafro, afrocolombia, shampoo, mascarillacapilar, pelocrespo, onduladas, rizoscolombia`

**Grupo 2 — GRWM y lifestyle**
`grwmcolombia, grwm, arreglandome, rutinamatutina, lifestylecolombia, rutinabelleza`

**Grupo 3 — Makeup y skincare**
`makeupcolombiana, maquillajediario, skincarecolombia, cuidadopiel, makeuptutorial`

**Grupo 4 — Gym y deporte**
`gymcolombia, mujeresfit, fitnesscolombia, fitgirls, entrenamientocolombia`

**Grupo 5 — UGC y emprendedoras**
`ugccolombia, ugclatino, creadoresugc, emprendedoracolombia, creadoresdecontenido`

**Grupo 6 — Mamás y universitarias**
`mamascolombia, mamablogger, universitariacolombia, estudiantecolombia`

**Grupo 7 — Moda**
`outfitcolombia, modacolombia, fashioncolombia, estilocolombiana`

**Grupo 8 — Ciudades colombianas**
`medellin, bogota, cali, barranquilla, cartagena, bucaramanga, pereira`

**Grupo 9 — Baile**
`bailecolombia, bailarina, dancecolombia`

---

## Colombia Score (0-100)

| Señal | Puntos |
|---|---|
| 🇨🇴 en bio | 30 |
| Ciudad colombiana en bio | 25 |
| #colombia o #colombiana en bio | 15 |
| Hashtags ciudad en bio | 15 |
| Idioma español en bio | 10 |
| Hashtag origen es ciudad colombiana | 5 |

- >= 50: verde (alta confianza)
- 20-49: amarillo (requiere revisión)
- < 20: rojo (probablemente no colombiana)

---

## Filtros automáticos

- Seguidores >= 2,000
- Vistas promedio >= 2,000
- Colombia score >= 20

---

## Tabla Supabase `candidatas_influencer`

```sql
CREATE TABLE candidatas_influencer (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tiktok_handle       TEXT NOT NULL UNIQUE,
  tiktok_user_id      TEXT,
  nombre_display      TEXT,
  bio                 TEXT,
  seguidores          INTEGER,
  videos_count        INTEGER,
  likes_totales       BIGINT,
  vistas_promedio     INTEGER,
  engagement_rate     NUMERIC(5,2),
  colombia_score      INTEGER DEFAULT 0,
  colombia_signals    JSONB DEFAULT '[]',
  nichos              TEXT[] DEFAULT '{}',
  hashtags_origen     TEXT[] DEFAULT '{}',
  tier_estimado       TEXT,
  status              TEXT DEFAULT 'candidata'
                      CHECK (status IN ('candidata','revisada','descartada','contactada','registrada')),
  notas_equipo        TEXT,
  fecha_scrape        TIMESTAMPTZ DEFAULT now(),
  fecha_actualizacion TIMESTAMPTZ DEFAULT now(),
  scrape_run_id       TEXT,
  influencer_id       UUID REFERENCES influencers(id)
);

CREATE INDEX idx_candidatas_status   ON candidatas_influencer(status);
CREATE INDEX idx_candidatas_colombia ON candidatas_influencer(colombia_score DESC);
CREATE INDEX idx_candidatas_seg      ON candidatas_influencer(seguidores DESC);
CREATE INDEX idx_candidatas_fecha    ON candidatas_influencer(fecha_scrape DESC);
```

---

## Archivos a crear

```
appinfluenciadoras/scripts/scraper_tiktok/
├── hashtags.py          # diccionario de hashtags por grupo
├── filtros.py           # colombia_score, filtros, nichos
├── supabase_client.py   # insert, check duplicados, get candidatas
├── scraper.py           # scraper Playwright + intercepción red
├── exportar_csv.py      # exporta a outputs/influencers/candidatas_YYYY-MM-DD.csv
├── run.py               # CLI: --grupo, --max-hashtags, --dry-run
├── requirements.txt     # python-dotenv, langdetect
└── .env.example         # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
```

---

## Pasos de implementación

- [ ] **Fase 1** — Crear tabla `candidatas_influencer` en Supabase (SQL arriba)
- [ ] **Fase 2** — Scraper Python (`scripts/scraper_tiktok/`)
- [ ] **Fase 3** — Crear `.env` local con credenciales Supabase
- [ ] **Fase 4** — Primera corrida de prueba (`--dry-run`)
- [ ] **Fase 5** — Backend Node: rutas `/api/candidatas/*` en `index.js` y `supabase.js`
- [ ] **Fase 6** — Frontend: vista "Candidatas" en dashboard admin
- [ ] **Fase 7** — Deploy a Railway (solo el frontend/backend — el scraper corre local)

---

## Flujo completo

```
Scraper TikTok (local)
      ↓
candidatas_influencer (status: candidata)
      ↓
Dashboard Admin → revisar
      ↓
[Aprobar] → influencers (status: Prospectada)
      ↓
DM manual en TikTok
      ↓
influencers (status: Contactada)
      ↓
Candidata completa form Tally → Registrada
      ↓
Pipeline normal Creadoras
```

---

## Acciones manuales de la usuaria

| Paso | Acción |
|---|---|
| 1 | Ejecutar SQL en Supabase para crear tabla |
| 2 | Crear `.env` con credenciales Supabase |
| 3 | `pip install python-dotenv langdetect` |
| 4 | Correr `run.py --dry-run` para verificar |
| 5 | Si TikTok pide login: iniciar sesión manual en el browser que abre Playwright |
| 6 | Revisar candidatas en dashboard y aprobar/descartar |
| 7 | Contactar por DM a las aprobadas |
