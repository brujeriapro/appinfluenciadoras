# Programa Creadoras — Brujería Capilar

Contexto del programa de influencers para que Claude pueda asistir en su gestión.

---

## ¿Qué es el Programa Creadoras?

Programa de marketing con influencers (gifting) donde Brujería Capilar envía kits de producto a creadoras de contenido de cabello a cambio de que publiquen reseñas orgánicas en Instagram y TikTok.

**Objetivo:** Generar contenido UGC (User Generated Content) auténtico que impulse ventas B2C sin pagar publicidad tradicional.

**Escala actual:** ~20 influencers activas. Objetivo 2026: 200+.

**Canal:** Instagram y TikTok. No YouTube por ahora.

---

## Pipeline del Programa (estados de una influencer)

```
Prospectada → Contactada → Registrada → Producto Enviado → Contenido Entregado → Calificada
```

| Estado | Qué significa | Quién actúa |
|---|---|---|
| Prospectada | El equipo identificó a la creadora como potencial | Equipo |
| Contactada | Se envió DM en Instagram/TikTok | Equipo (manual — no automatizar, viola TdS) |
| Registrada | Completó el formulario Tally | Automático vía webhook |
| Producto Enviado | Orden $0 creada en Shopify, Effi recibe y genera guía | Automático vía `crear_envio.py` |
| Contenido Entregado | Publicó y reportó el contenido en el form Tally | Automático vía webhook |
| Calificada | Score calculado y nivel Bruja asignado | Automático vía `calcular_scores.py` |

---

## Tiers de Influencers

| Tier | Seguidores Instagram | Kit Asignado | Descripción |
|---|---|---|---|
| Nano | < 10,000 | Kit Básico | Comunidad pequeña pero engagement alto |
| Micro | 10,000 – 100,000 | Kit Estándar | Balance entre alcance y autenticidad |
| Macro | > 100,000 | Kit Premium | Alto alcance, mayor inversión |

**Regla especial:** Si engagement > 6% y seguidores están cerca del tope del tier actual (>90%), se sube un tier.

---

## Kits de Producto

| Kit | Tier | Contenido | Valor retail aprox. |
|---|---|---|---|
| Kit Básico | Nano | Termoprotector + Mantequilla Capilar | $80,000 COP |
| Kit Estándar | Micro | Termoprotector + Mantequilla + Crema Rizos 3en1 | $130,000 COP |
| Kit Premium | Macro | Todo lo anterior + Shampoo + Hair Magic Wand | $220,000 COP |

**PENDIENTE:** Confirmar si se incluyen body mists en algún kit. Ver Open Questions en el plan.

Los SKUs reales de cada producto deben estar configurados en `scripts/influencers/config_influencers.json` → sección `"kits"`.

---

## Niveles Bruja (Gamificación)

Sistema de niveles basado en el score acumulado de todas las piezas de contenido publicadas.

| Nivel | Score Total | Descripción |
|---|---|---|
| Bruja Semilla | 0 – 20 | Primeros pasos. Generalmente tras el primer contenido. |
| Bruja Aprendiz | 21 – 50 | 2-3 piezas de contenido con buen desempeño. |
| Bruja Practicante | 51 – 100 | Creadora comprometida con comunidad activa. |
| Bruja Experta | 101 – 200 | Referente del cabello en su nicho. |
| Gran Bruja | 201+ | Máximo nivel. Embajadora de la marca. |

Los niveles son aspiracionales y consistentes con la identidad de la marca.

---

## Fórmula de Scoring de Contenido

**Score 0-100** para cada pieza de contenido. Componentes:

| Componente | Peso | Fórmula | Qué mide |
|---|---|---|---|
| Reach ratio | 40% | vistas / seguidores × 100 | Cuánto penetró la audiencia |
| Engagement rate | 25% | likes / vistas ÷ 5% × 100 | Calidad de la reacción |
| Save rate | 20% | guardados / vistas ÷ 2% × 100 | Contenido de valor (guarda = interés real) |
| Calificación equipo | 15% | (1-5) normalizado a 0-100 | Calidad subjetiva del contenido |

**Multiplicadores finales:**
- TikTok: ×1.2 (algoritmo más viral, bonus)
- Reel: ×1.0
- Story: ×0.7 (efímero, menos valor)
- Post estático: ×0.8

Si el equipo no ha calificado el contenido, el 15% se redistribuye entre los otros tres factores.

---

## Compromisos del Programa

**Brujería Capilar se compromete a:**
- Enviar el kit dentro de los 7 días hábiles tras el registro
- No pedir exclusividad — la creadora puede trabajar con otras marcas
- Poder repostear el contenido generado (con crédito)

**La creadora se compromete a:**
- Publicar al menos una pieza de contenido dentro de 30 días de recibir el kit
- Reportar el contenido en el formulario de entrega
- Que los datos de seguidores en el formulario sean verídicos

---

## Reglas para el Equipo

### Lo que NO se automatiza (por términos de servicio)
- DMs de contacto inicial en Instagram/TikTok — se hacen manualmente
- Seguimiento por WhatsApp — opcional, humano

### Templates de DM para prospección

**Template Instagram (versión corta):**
```
Hola [Nombre]! 💜 Somos Brujería Capilar, una marca colombiana de cuidado capilar.
Nos encanta tu contenido y queremos enviarte un kit de regalo para que lo pruebes.
Sin compromisos forzosos, solo que compartas tu experiencia honesta. ¿Te interesa? ✨
```

**Template TikTok (versión corta):**
```
Hola! Somos @brujeriacapilar 🔮 Vimos tu contenido de cabello y nos encantó.
Queremos mandarte un kit de regalo para que lo pruebes. Solo pide:
1 reseña honesta en tu TikTok. ¿Aceptas? 💜
```

---

## Sistema Técnico

El programa está gestionado por un conjunto de scripts Python en `scripts/influencers/`.

| Script | Cuándo ejecutar | Qué hace |
|---|---|---|
| `webhook_receiver.py` | Siempre activo (o usar Make.com) | Recibe registros de Tally y los inserta en Supabase |
| `crear_envio.py` | Cuando hay influencers Registradas nuevas | Crea órdenes $0 en Shopify → dispara Effi + Siigo |
| `calcular_scores.py` | Cuando hay contenido Entregado sin score | Calcula scores y niveles Bruja |
| `seguimiento.py` | Semanalmente | Envía recordatorios a quienes no han publicado a tiempo |

**Base de datos:** Supabase (PostgreSQL). Accesible en supabase.com → Table Editor para revisión manual.

**Configuración:** `scripts/influencers/config_influencers.json` — credenciales, SKUs, reglas de tier y scoring.

**Guía de configuración completa:** `scripts/influencers/SETUP_INFLUENCERS.md`

---

## Métricas de Éxito del Programa

Para evaluar el desempeño del programa en las sesiones de análisis:

- **Tasa de conversión registro → envío**: % de registradas que reciben producto
- **Tasa de publicación**: % de influencers que publican contenido en plazo (objetivo: >70%)
- **Score promedio por tier**: benchmark de calidad de contenido
- **CPM implícito**: (valor retail del kit) / (alcance total generado) × 1000
- **Influencers activas**: conteo con status "Calificada" en últimos 90 días
