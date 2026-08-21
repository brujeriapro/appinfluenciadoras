# Creadores.app — marketplace de creadoras

Marketplace de dos lados: marcas colombianas contratan colaboraciones pagas con un banco de creadoras de todos los nichos — belleza, moda, fitness, comida, hogar, viajes, tech y más. La plataforma cobra comisión por cada trato cerrado y retiene el pago hasta que el contenido se entrega y se aprueba.

**Es un producto y una marca aparte de Brujería Capilar.** Comparte la base de datos con el Programa Creadoras (`apps/creadoras/`) para no duplicar el banco de creadoras, pero corre en su propio proceso, con su propio dominio, su propio panel admin y sus propios secretos. No importa una sola línea de código de la otra app.

---

## Estado

**Fase 1 — backend completo, landing pública, panel admin y portal de la creadora listos.** Con eso el marketplace ya se puede operar a mano. El lado marca ya está: acceso en `/registro.html` y panel completo en `/panel.html` — catálogo con cinco filtros y triage, ficha con panel de tarifas, modal de propuesta con el dinero en vivo, campañas, línea de tiempo del trato y perfil de marca.

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
4. `migrations/mk_004_portal_creadora.sql` — entregables con subtítulo, producto/exclusividad y plazos
5. `migrations/mk_005_registro_creadoras.sql` — registro abierto, datos privados y recuperación de clave
6. `migrations/mk_006_perfil_creadora.sql` — perfil autogestionado y campos de verificación
7. `migrations/mk_007_paises.sql` — país en creadoras y marcas
8. `migrations/mk_008_seguidores_por_red.sql` — seguidores de Instagram y TikTok por separado
9. `migrations/mk_009_departamentos.sql` — departamentos y ciudades de Colombia
10. `migrations/mk_010_panel_marca.sql` — código de creadora, triage, campañas y perfil de marca

Además hay que crear el bucket **privado** `mk-muestras` en Supabase Storage, con límite de 10 MB y estos tipos permitidos (sin espacios entre las comas):

```
image/jpeg,image/png,image/webp,image/gif,image/avif,video/mp4,video/quicktime,video/webm
```

**El portal convierte toda imagen a JPEG antes de subirla**, redimensionada a 1600px de lado mayor. Eso resuelve dos cosas de una: el peso (una foto de celular pasa de varios MB a unos cientos de KB) y la compatibilidad (cualquier formato que el navegador sepa leer termina en uno que todos saben mostrar).

HEIC de iPhone queda fuera a propósito: se podría guardar, pero Chrome y Firefox no lo renderizan y la marca vería una imagen rota. Si llega uno, el mensaje le dice a la creadora que tome una captura de pantalla.

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
public/creadora.html Portal de la creadora: perfil, tarifas, propuestas, entrega
public/registro.html Acceso de marcas: registro por invitación, login, recuperar clave
public/panel.html    Panel de marca: catálogo, ficha, campañas, trato, perfil
public/js/panel-*.js Vistas del panel, separadas por tamaño
```

### Los estados de un trato

```
solicitado → aceptado → pago_retenido → entregado → aprobado → pagado → cerrado
                    ↘ rechazado / cancelado ↙
```

Quién puede mover qué está en la tabla `TRANSICIONES` de `tratos.js`. Una transición fuera de esa tabla devuelve 409, no 500.

---

## Las siete reglas que no se rompen

**1. El handle nunca vive en la tabla del catálogo.**
`mk_creadoras` guarda `nombre_publico` (un alias). El `instagram_handle` está en `influencers` y solo lo lee `db.getContactoCreadora()`, que se llama desde el panel admin o desde un trato con `contacto_revelado_at` no nulo. Si un endpoint del catálogo tuviera un bug de `select *`, no habría nada sensible que filtrar. No agregar esa columna "por comodidad".

**2. Los porcentajes de comisión se congelan dentro del trato.**
`mk_config` tiene los vigentes; al crear un trato se copian a la fila y todo se calcula desde esa copia. Subir la comisión mañana no puede cambiar el valor de un trato cerrado ayer — eso corrompería la contabilidad y sería indefendible ante una marca.

**3. El contacto se revela cuando el dinero está retenido, no al aceptar.**
Es lo único que hace exigible la cláusula de no-circunvalación. El momento es configurable (`revelar_contacto_en`), pero el default no se cambia sin entender esto.

**4. Las muestras se sirven por proxy, nunca con la URL de origen.**
Las URLs del CDN de Instagram y TikTok llevan identificadores que permiten llegar al perfil. Se re-alojan en Storage privado con nombre aleatorio y se hace stream desde `/media/:id`.

**5. Registrarse no es entrar al catálogo.**
Cualquiera puede crear su perfil, pero nace con `visible = false` y estado `nueva`. Para salir publicada hacen falta dos cosas: que ella ponga tarifas y que una persona del equipo revise sus cuentas y la apruebe. Ese filtro humano es lo que sostiene la promesa de "banco curado" — sin él, el catálogo se llena de perfiles sin verificar y deja de valer para las marcas.

**6. Los datos sensibles de una creadora viven en `mk_creadora_privado`.**
Su @usuario, nombre real y datos bancarios están en una tabla aparte, nunca en `mk_creadoras`. El catálogo consulta `mk_creadoras`, así que no hay forma de que filtre lo que no está ahí. Las creadoras que vienen del Programa Creadoras tienen sus handles en `influencers`; las que se registran solas, en esta tabla. `getContactoCreadora()` resuelve los dos casos.

**7. La tarifa la pone la creadora, no la plataforma.**
`mk_tarifas` guarda un precio por creadora y tipo de entregable; ella lo define con un control deslizante. `tarifa_min`, `tarifa_max` y `nivel_tarifa` en `mk_creadoras` son **derivados** — se recalculan al guardar y el admin no puede editarlos. Los niveles `inicial`/`medio`/`top` ya no asignan precio: son rangos de presupuesto para que la marca filtre. Y un perfil sin tarifas no se publica: el producto promete "precio publicado".

---

## El alias, no el nombre

En el catálogo una creadora se identifica con un **alias descriptivo más un código**: `RIZOS DE MEDELLÍN · C-0412`. No con un nombre de persona abreviado.

No es cosmético. "Valeria R." insinúa una persona: con la ciudad y el nicho al lado, alguien decidido la encuentra. "RIZOS DE MEDELLÍN" no apunta a nadie, y el código da algo concreto que decir en una conversación —"me interesa la C-0412"— sin nombrar a nadie. El anonimato deja de depender de que el alias esté bien escogido.

Los perfiles importados del Programa Creadoras traen alias de persona: **hay que revisarlos a mano** desde el panel admin. Convertir "Valeria R." en algo descriptivo es trabajo de criterio, no de SQL.

## El camino de una creadora

```
se registra sola (o la importas)
   -> estado "nueva"        · le llega correo de bienvenida
completa su perfil: nicho, redes, tarifas y al menos una pieza de trabajo
   -> estado "en_revision"  · te llega correo de que está lista
verificas sus cuentas y apruebas
   -> apruebas              · le llega correo y entra al catálogo
```

Ella llena todo; el equipo solo verifica y aprueba. En cada punto su portal le dice qué le falta, con todas las letras. El registro se puede cerrar sin desplegar poniendo `registro_creadoras_abierto` en `false`, y el mínimo de seguidores se ajusta con `alcance_minimo_registro`.

## Ubicación y alcance

**Seguidores por red, no un total.** Una marca que quiere TikTok necesita saber si la audiencia está ahí o en Instagram: un total de 60.000 puede ser 58.000 en Instagram y 2.000 en TikTok. `alcance_total` pasa a ser derivado, y hay rango visible por red — pero solo donde de verdad hay cuenta.

**En Colombia, departamento y ciudad son listas cerradas** (`mk_config.departamentos_co`). Escrito a mano, la misma ciudad llega como "Medellin", "medellin", "Medellín" y "Medellin, Antioquia", y el filtro del catálogo deja de servir. Fuera de Colombia el campo es libre: no hay listas confiables de los otros 19 países, y una incompleta sería peor. La opción "Otra" cubre los municipios que no están entre los principales.

## Países y moneda

Las creadoras eligen su país al registrarse (20 opciones: Latinoamérica hispanohablante, España y Estados Unidos), y la marca puede filtrar el catálogo por país. La lista vive en `mk_config.paises`, así que abrir otro país no exige tocar código.

**Pero la moneda es COP para todo el mundo.** El deslizador de tarifas va de $50.000 a $8.000.000 pesos colombianos, la comisión se calcula en pesos y el escrow es transferencia local. Una creadora en México publica su tarifa en COP y se le paga en COP.

Eso está dicho explícitamente en la interfaz (`moneda_unica`), y no es un detalle cosmético: sin esa aclaración, alguien en México pone "500.000" pensando en pesos mexicanos y termina en un reclamo por una diferencia de 20 a 1.

Multi-moneda de verdad exige conversión, pagos internacionales y repensar el escrow. Es un proyecto aparte, no una columna más.

## Métricas declaradas y verificadas

Hoy los seguidores los escribe la creadora: `fuente_metricas = 'declarado'`. La landing promete *"métricas reales, no capturas"*, y mientras todo sea declarado eso no se cumple.

El plan es conectar Instagram con OAuth para que el alcance y el engagement vengan de Meta (`fuente_metricas = 'verificado'`), y mostrar un distintivo en el catálogo. Los campos ya existen; la conexión no. Se enciende con `instagram_conexion_activa`.

Dos cosas a tener en cuenta cuando se implemente:

- **La API vieja de Instagram (Basic Display) está descontinuada** desde finales de 2024. La que sirve es *Instagram API con Instagram Login*, y exige cuenta Business o Creator. Quien tenga cuenta personal se queda en modo declarado hasta que cambie — que es gratis y toma un minuto.
- **Nunca embeber el feed de Instagram.** El widget muestra el @usuario y tumba la promesa de identidad oculta. El contenido se descarga por API y se re-aloja en el bucket, igual que las piezas que ella sube a mano.

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

## Plazos que la interfaz promete y todavía no se cumplen solos

El portal de la creadora muestra tres promesas que vienen del diseño y quedaron guardadas en `mk_config`, pero **hoy solo se muestran: no hay proceso que las ejecute**.

| Promesa | Estado real |
|---|---|
| "Tienes 72 horas para responder" | La propuesta no expira sola |
| "La marca tiene 48h para aprobar" | No hay auto-aprobación (`auto_aprobar_entrega` está en `false`) |
| "A tu cuenta 48h después de aprobado" | El pago lo hace el equipo a mano desde el panel |

Antes de abrir a creadoras que no sean del círculo cercano hay que implementar el proceso que las haga cumplir, o bajar ese texto de la interfaz. Prometer un plazo que no se cumple es peor que no prometerlo.

## Pendiente contable (no bloquea desarrollo)

Antes de mover pagos de terceros en volumen hay que definir con Paula: quién factura el 100%, si la creadora necesita RUT y si aplica retención en la fuente sobre el pago de salida. El campo `nit` en `mk_marcas` y el export CSV están puestos pensando en esa conversación.
