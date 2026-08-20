# Creadores.app — marketplace de creadoras

Marketplace de dos lados: marcas colombianas contratan colaboraciones pagas con un banco de creadoras de todos los nichos — belleza, moda, fitness, comida, hogar, viajes, tech y más. La plataforma cobra comisión por cada trato cerrado y retiene el pago hasta que el contenido se entrega y se aprueba.

**Es un producto y una marca aparte de Brujería Capilar.** Comparte la base de datos con el Programa Creadoras (`apps/creadoras/`) para no duplicar el banco de creadoras, pero corre en su propio proceso, con su propio dominio, su propio panel admin y sus propios secretos. No importa una sola línea de código de la otra app.

---

## Estado

**Fase 1 — backend completo, landing pública y panel admin listos.** Con eso el marketplace ya se puede operar a mano. Faltan las pantallas de cara al usuario (catálogo, registro de marca, portal de creadora, línea de tiempo), que esperan los mockups de Claude Design.

El panel vive en `/admin.html`. Se sirve sin auth a propósito —es una cáscara vacía— y pide usuario y clave con su propio formulario; la puerta real está en `/api/admin/*`.

Plan completo: [`plans/2026-08-20-marketplace-creadoras-fase1.md`](../../plans/2026-08-20-marketplace-creadoras-fase1.md)

---

## Cómo correr

```bash
cd apps/marketplace
npm install
node index.js          # http://localhost:3040
npm test               # 34 pruebas: comisiones, máquina de estados y tarifas
```

### Variables de entorno

| Variable | Obligatoria | Qué es |
|---|---|---|
| `SUPABASE_URL` | sí | Misma instancia que el Programa Creadoras |
| `SUPABASE_SERVICE_ROLE_KEY` | sí | Misma llave |
| `MK_JWT_SECRET` | sí | **Distinto** al `JWT_SECRET` de Brujería: las sesiones no deben ser intercambiables |
| `MK_ADMIN_PASS` | sí | Contraseña del panel admin |
| `MK_ADMIN_USER` | no | Por defecto `admin` |
| `MK_CODIGOS_INVITACION` | no* | Códigos separados por coma. Sin esto, ninguna marca puede registrarse |
| `MK_BASE_URL` | no | URL pública, para los links de los correos |
| `MK_SMTP_USER` / `MK_SMTP_PASS` | no | Gmail del remitente. **No usar el de Brujería** |
| `MK_SMTP_FROM` | no | Por defecto `Creadores.app <no-reply@creadores.app>` |
| `MK_BUCKET_MUESTRAS` | no | Bucket privado de Storage, por defecto `mk-muestras` |
| `PORT` | no | Por defecto 3040 |

El arranque **falla** si falta alguna de las obligatorias: es preferible no levantar a levantar con un secreto por defecto que permita forjar tokens.

### Migraciones

Se corren a mano en el SQL Editor de Supabase, en orden:

1. `migrations/mk_001_init.sql` — las 8 tablas `mk_*`
2. `migrations/mk_002_seed_config.sql` — comisiones y configuración base
3. `migrations/mk_003_nichos_y_tarifas.sql` — taxonomía amplia de nichos + tabla `mk_tarifas`

Además hay que crear el bucket **privado** `mk-muestras` en Supabase Storage.

### Importar las Brujas Embajadoras

```bash
node scripts/importar_creadoras.js --dry-run   # ver qué haría
node scripts/importar_creadoras.js             # escribir
```

Trae solo las que ya demostraron que entregan (status Calificada / Contenido Entregado, o UGC activa). **Ninguna queda publicada**: entran con `visible = false`. Para que aparezca en el catálogo hacen falta dos pasos — el admin le asigna nicho y engagement, y ella define sus tarifas desde su portal.

---

## Cómo está armado

```
index.js         Cablea middlewares, routers y estáticos. Nada de lógica.
config.js        Env vars con validación de arranque
db.js            Supabase REST. Las funciones del catálogo enumeran columnas, nunca select=*
auth.js          Basic Auth (admin) + JWT con claim de tipo (marca / creadora) + rate limit
comisiones.js    Cálculo de comisión. Funciones puras, sin I/O
tratos.js        Máquina de estados. TODA escritura de estado pasa por aquí
catalogo.js      GET /api/catalogo — identidad oculta
marcas.js        Registro por invitación, sesión, crear y gestionar tratos
creadoras.js     Sesión, perfil propio, aceptar / rechazar / entregar
admin.js         Tratos, pagos, curaduría, config, export CSV
media.js         Proxy de piezas de muestra desde Storage privado
landing.js       GET /api/landing — datos de la landing pública
terminos.js      Texto legal versionado
notificaciones.js Correos transaccionales
public/admin.html  Panel de operación: tratos, pagos, curaduría, ajustes, export
```

### Los estados de un trato

```
solicitado → aceptado → pago_retenido → entregado → aprobado → pagado → cerrado
                    ↘ rechazado / cancelado ↙
```

Quién puede mover qué está en la tabla `TRANSICIONES` de `tratos.js`. Una transición fuera de esa tabla devuelve 409, no 500.

---

## Las cinco reglas que no se rompen

**1. El handle nunca vive en la tabla del catálogo.**
`mk_creadoras` guarda `nombre_publico` (un alias). El `instagram_handle` está en `influencers` y solo lo lee `db.getContactoCreadora()`, que se llama desde el panel admin o desde un trato con `contacto_revelado_at` no nulo. Si un endpoint del catálogo tuviera un bug de `select *`, no habría nada sensible que filtrar. No agregar esa columna "por comodidad".

**2. Los porcentajes de comisión se congelan dentro del trato.**
`mk_config` tiene los vigentes; al crear un trato se copian a la fila y todo se calcula desde esa copia. Subir la comisión mañana no puede cambiar el valor de un trato cerrado ayer — eso corrompería la contabilidad y sería indefendible ante una marca.

**3. El contacto se revela cuando el dinero está retenido, no al aceptar.**
Es lo único que hace exigible la cláusula de no-circunvalación. El momento es configurable (`revelar_contacto_en`), pero el default no se cambia sin entender esto.

**4. Las muestras se sirven por proxy, nunca con la URL de origen.**
Las URLs del CDN de Instagram y TikTok llevan identificadores que permiten llegar al perfil. Se re-alojan en Storage privado con nombre aleatorio y se hace stream desde `/media/:id`.

**5. La tarifa la pone la creadora, no la plataforma.**
`mk_tarifas` guarda un precio por creadora y tipo de entregable; ella lo define con un control deslizante. `tarifa_min`, `tarifa_max` y `nivel_tarifa` en `mk_creadoras` son **derivados** — se recalculan al guardar y el admin no puede editarlos. Los niveles `inicial`/`medio`/`top` ya no asignan precio: son rangos de presupuesto para que la marca filtre. Y un perfil sin tarifas no se publica: el producto promete "precio publicado".

---

## Nichos y tarifas

**Taxonomía de dos niveles**, en `mk_config.nichos`: 15 categorías madre (belleza, moda, salud y fitness, comida, hogar, familia, mascotas, viajes, tecnología, gaming, finanzas, educación, entretenimiento, autos y movilidad, estilo de vida) con sus subnichos. La creadora elige hasta 3 subnichos; la categoría madre se deduce sola. La marca filtra por categoría o afina por subnicho.

**Entregables** en `mk_config.entregables`: reel, TikTok, historias, post/carrusel, UGC sin publicar, reseña en video, combo, evento presencial y embajadora mensual. Cada uno lleva su propio precio.

**Slider** en `mk_config.rango_tarifa`: de $50.000 a $8.000.000, paso $10.000. Todo se cambia desde `/api/admin/config` sin desplegar.

---

## Deuda técnica consciente

- **Sin marca de agua** (decisión de producto, agosto 2026). Una búsqueda inversa de imagen sobre una pieza del catálogo todavía puede identificar a la creadora. `mk_muestras.storage_path` está separado del original justamente para que agregar el watermark después sea un cambio contenido en el pipeline de subida, sin tocar frontend ni esquema.
- **Sin pasarela de pagos** (decisión de producto). El escrow es un estado contable: `mk_pagos` registra entradas y salidas a mano. Si el volumen crece, la tabla ya tiene la forma que necesitaría una conciliación con Wompi.
- **Sin bloqueo optimista en las transiciones.** Dos admins simultáneos podrían registrar dos pagos de salida sobre el mismo trato. Con un equipo de una o dos personas es aceptable.
- **El texto de los términos está pendiente de revisión jurídica.** Sirve para los pilotos; debe pasar por abogada antes de operar con marcas externas en volumen.

## Pendiente contable (no bloquea desarrollo)

Antes de mover pagos de terceros en volumen hay que definir con Paula: quién factura el 100%, si la creadora necesita RUT y si aplica retención en la fuente sobre el pago de salida. El campo `nit` en `mk_marcas` y el export CSV están puestos pensando en esa conversación.
