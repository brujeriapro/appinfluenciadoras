# Creators Manager — marketplace de creadoras

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
npm test               # 140 pruebas: comisiones, máquina de estados, tarifas, pagos y recuperación de cobros
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
| `MK_ZEPTOMAIL_API_KEY` | una de las tres | Llave de ZeptoMail (Zoho). **La opción recomendada por precio.** |
| `MK_BREVO_API_KEY` | una de las tres | Llave de Brevo. Funciona, pero es la más cara al escalar |
| `MK_RESEND_API_KEY` | una de las tres | Llave de Resend |
| `MK_CORREO_PROVEEDOR` | no | `zeptomail`, `brevo` o `resend`. Solo hace falta si hay varias llaves puestas y quieres forzar una |
| `MK_SMTP_HOST` | no | Servidor SMTP, ej. `smtp.zoho.com`. Sin esto se asume Gmail |
| `MK_SMTP_PORT` | no | Por defecto `465` (SSL). Con 587 usa STARTTLS |
| `MK_SMTP_FROM` | no | Por defecto `Creators Manager <no-reply@creatorsmanager.com>` |
| `MK_BASE_URL` | sí en producción | Dominio público sin barra final: `https://creatorsmanager.com`. De aquí cuelgan los enlaces de los correos y el retorno del pago. Si falta, se deduce del dominio de Railway |
| `MK_BUCKET_MUESTRAS` | no | Bucket privado de Storage, por defecto `mk-muestras` |
| `WOMPI_LLAVE_PUBLICA` | no | Sin ella el escrow sigue siendo transferencia manual |
| `WOMPI_LLAVE_PRIVADA` | no | Para confirmar transacciones contra la API |
| `WOMPI_SECRETO_INTEGRIDAD` | no | Firma del checkout |
| `WOMPI_SECRETO_EVENTOS` | no | Verificación del webhook |
| `WA_PHONE_NUMBER_ID` | no | Número de WhatsApp Cloud API. Sin esto, el panel muestra el envío por WhatsApp como no disponible en vez de fallar al intentarlo |
| `WA_TOKEN` | no | Token de Meta. Que sea **permanente**, de un usuario del sistema: los temporales duran 24 h y después los envíos fallan en silencio |
| `WA_PLANTILLA` | no | Nombre exacto de la plantilla aprobada para invitar a las olas del Programa Creadoras |
| `WA_PLANTILLA_LISTA` | no | La otra plantilla: la de las listas que comparte una marca aliada. Meta aprueba cada texto por separado, así que son dos nombres distintos |
| `WA_PLANTILLA_IDIOMA` | no | Por defecto `es`. Si no cuadra se prueban solas las demás variantes del español |
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
11. `migrations/mk_011_wompi_y_planes.sql` — pagos con Wompi, planes y límite de fichas
12. `migrations/mk_012_foto_perfil.sql` — foto de perfil de la creadora
13. `migrations/mk_013_registro_marcas_abierto.sql` — registro de marcas sin código y con solo cuatro campos
14. `migrations/mk_014_invitaciones.sql` — registro de a quién se le invitó al banco, para no escribir dos veces

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
marcas.js        Registro abierto, sesión, crear y gestionar tratos
creadoras.js     Sesión, perfil propio, aceptar / rechazar / entregar
admin.js         Tratos, pagos, curaduría, config, export CSV
media.js         Proxy de piezas de muestra desde Storage privado
landing.js       GET /api/landing — datos de la landing pública
terminos.js      Texto legal versionado
notificaciones.js Correos transaccionales
public/admin.html  Panel de operación: tratos, pagos, curaduría, ajustes, export
public/creadora.html Portal de la creadora: perfil, tarifas, propuestas, entrega
public/registro.html Acceso de marcas: registro abierto, login, recuperar clave
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

## Pagos y planes

**El escrow por Wompi.** La marca paga el trato con tarjeta desde la línea de tiempo, el webhook confirma y el trato pasa solo a "pago retenido" — con eso se revela el contacto. Sin llaves de Wompi el sistema sigue funcionando con transferencia registrada a mano desde el panel; se enciende con `pagos_wompi_activos`.

Tres cosas que hace el webhook antes de mover un peso, y ninguna sobra:

1. **Verifica la firma del evento.** Es la única ruta pública que mueve dinero: sin esto, cualquiera manda un POST diciendo que un trato quedó pagado.
2. **Vuelve a consultar la transacción en Wompi.** El mensaje dice el estado, pero antes de mover plata se le pregunta a la fuente.
3. **Compara el monto con lo que la base dice que se debía cobrar.** Un monto que viaja por el navegador es un monto que se puede editar.

**Los planes** (`planes_activos`): demo gratis con 3 fichas, Emprende $19.900 con 10, Marca $99.900 con 60, y Agencia $199.900 sin límite.

Lo que se limita es **abrir fichas**, nunca enviar propuestas: cada propuesta deja comisión, así que limitarlas sería limitar el propio ingreso. Se cobra por buscar y se gana por cerrar. El catálogo se ve completo en todos los planes —cuántas creadoras hay, sus nichos y rangos—; el muro aparece al abrir la ficha, que es donde están las piezas y las tarifas. Así el demo no parece pobre y el muro llega cuando la marca ya entendió el valor.

Una ficha ya abierta este mes no vuelve a consumir cupo: si contara cada visita, la marca navegaría con miedo justo cuando está por contratar.

## Ubicación y alcance

**Seguidores por red, no un total.** Una marca que quiere TikTok necesita saber si la audiencia está ahí o en Instagram: un total de 60.000 puede ser 58.000 en Instagram y 2.000 en TikTok. `alcance_total` pasa a ser derivado, y hay rango visible por red — pero solo donde de verdad hay cuenta.

**En Colombia, departamento y ciudad son listas cerradas** (`mk_config.departamentos_co`). Escrito a mano, la misma ciudad llega como "Medellin", "medellin", "Medellín" y "Medellin, Antioquia", y el filtro del catálogo deja de servir. Fuera de Colombia el campo es libre: no hay listas confiables de los otros 19 países, y una incompleta sería peor. La opción "Otra" cubre los municipios que no están entre los principales.

## Países y moneda

Las creadoras eligen su país al registrarse (20 opciones: Latinoamérica hispanohablante, España y Estados Unidos), y la marca puede filtrar el catálogo por país. La lista vive en `mk_config.paises`, así que abrir otro país no exige tocar código.

**Pero la moneda es COP para todo el mundo.** El deslizador de tarifas va de $50.000 a $8.000.000 pesos colombianos, la comisión se calcula en pesos y el escrow es transferencia local. Una creadora en México publica su tarifa en COP y se le paga en COP.

Eso está dicho explícitamente en la interfaz (`moneda_unica`), y no es un detalle cosmético: sin esa aclaración, alguien en México pone "500.000" pensando en pesos mexicanos y termina en un reclamo por una diferencia de 20 a 1.

Multi-moneda de verdad exige conversión, pagos internacionales y repensar el escrow. Es un proyecto aparte, no una columna más.

## El correo

**Railway bloquea el SMTP saliente**, así que el correo solo sale por API web. `correo.js` aísla al proveedor: cambiar de uno a otro es poner otra llave en el entorno, sin tocar `notificaciones.js`.

Si hay varias llaves, gana la primera en el orden de `PROVEEDORES` (ZeptoMail → Resend → Brevo) salvo que `MK_CORREO_PROVEEDOR` diga otra cosa. Ese orden no es alfabético: pone primero el más barato, para que agregar una llave nueva surta efecto sin tener que acordarse de una segunda variable.

**El precio importa más de lo que parece.** A 10.000 correos al mes la diferencia entre uno y otro es de un orden de magnitud, y el volumen de este sistema sube con cada creadora: bienvenida, aprobación, recordatorios, avisos de propuesta, plazos.

Amazon SES es más barato que todos ellos (alrededor de $0,10 por millar) pero no está implementado: firmar sus peticiones exige el SDK de AWS y sacar la cuenta del sandbox. Vale la pena cuando el volumen lo justifique.

⚠️ **El envío falla en silencio a propósito** — un correo caído no puede tumbar un registro — así que un problema aquí es invisible hasta que alguien se queja. La pestaña **Ajustes** del panel admin abre con el estado del correo, los créditos que quedan y un botón para mandarse una prueba que devuelve el error real del proveedor.

Así se detectó que 57 solicitudes de recuperar contraseña —de solo 17 personas, intentándolo 3 y 4 veces— nunca llegaron a su destino.

## Métricas declaradas y verificadas

`mk_creadoras.metricas_estado` tiene tres niveles y el catálogo muestra la diferencia, que es lo que hace que verificarse valga la pena:

| Estado | Qué significa |
|---|---|
| `declarado` | Los números los escribió ella. Nadie los comprobó. |
| `verificado` | Alguien del equipo comparó una captura de sus estadísticas contra lo declarado |
| `conectado` | Vendrían de la API de Instagram — **todavía no está construido** |

**Por qué la captura y no solo la conexión automática:** la API de Instagram únicamente entrega métricas de cuentas Business o Creator, y buena parte del catálogo es nano, donde la cuenta personal es lo normal. Un sistema que solo aceptara la conexión dejaría fuera justo a quienes más necesitan demostrar que sus números son reales.

El flujo: la creadora sube su captura desde el portal → cae en la cola de **Verificar métricas** del panel admin → una persona compara y aprueba o devuelve.

Dos reglas que sostienen que el sello signifique algo:

- **Cambiar un número tumba la verificación.** Si pudiera verificarse en 3.000 seguidores y luego editarlo a 30.000 conservando el sello, el sello no valdría nada. Se compara la huella de todas sus redes antes de guardar.
- **La captura solo la ve admin** (`/media/captura/:id`). Es una pantalla de su app personal con su @usuario a la vista: dársela a una marca rompería la identidad oculta de la forma más directa posible.

**Las vistas promedio pesan más que los seguidores** y por eso el catálogo las muestra en su lugar cuando existen. Comprar seguidores es fácil; sostener vistas, no. Viven en `mk_creadora_redes.vistas_promedio`, una por red, y sí viajan al catálogo — a diferencia del número exacto de seguidores, que vuelve buscable a la creadora.

Cuando se construya `conectado`, dos cosas a tener en cuenta:

- **La API vieja de Instagram (Basic Display) está descontinuada** desde finales de 2024. La que sirve es *Instagram API con Instagram Login*, y exige cuenta Business o Creator.
- **Nunca embeber el feed de Instagram.** El widget muestra el @usuario y tumba la promesa de identidad oculta. El contenido se descarga por API y se re-aloja en el bucket, igual que las piezas que ella sube a mano.

## Cómo trabaja y si cumple

Es la promesa central del producto y la razón por la que una marca elegiría este catálogo sobre una lista de seguidores. Las otras plataformas dicen **quién es** una creadora; esto dice **cómo trabaja y si entrega**. Son dos sistemas distintos.

### Si cumple — `mk_cumplimiento`

Vista que calcula en vivo el historial real de entregas, cruzando dos fuentes: el Programa Creadoras (kit despachado contra fecha de publicación) y los tratos del marketplace (plazo pactado contra fecha de entrega). Nada es declarado por la creadora.

Depende de que `mk_creadoras.influencer_id` esté poblado — es el puente entre las dos tablas, y hasta la migración `mk_024` estaba vacío para las 167 creadoras, así que el catálogo mostraba "0 tratos cerrados" a todo el mundo.

Reglas, escritas para poder defenderlas si una creadora pregunta:

| Regla | Definición |
|---|---|
| A tiempo (gifting) | Publicó dentro de 30 días de despachado el kit. La mediana real es 20 días, así que 30 es holgado. |
| A tiempo (trato) | Entregó en o antes de `fecha_entrega_esperada`. |
| Incumplida | Pasaron más de 45 días desde el envío y nunca publicó. |
| No se cuenta | Ella reportó que el paquete no llegó. No se castiga una falla de la transportadora. |

**No existe sello negativo público.** Que alguien no haya publicado puede deberse a razones que no conocemos, y marcarla frente a todas las marcas sería una condena sin descargo. El dato existe, pesa en el orden del catálogo y lo ve el equipo — pero no se exhibe. Se destaca a quien cumple en vez de señalar a quien no.

Quien no tiene historial lo dice en gris y explica por qué. Rellenar con ceros la haría parecer incumplida cuando solo es nueva.

`colaboraciones_completadas` —la columna por la que ordena el catálogo— se sincroniza desde la vista con `SELECT mk_sincronizar_colaboraciones();`. Es idempotente.

### Cómo trabaja — `analisis.js` y `mk_perfil_contenido`

Un modelo de visión lee cada pieza y la etiqueta: dónde graba, tipo de luz, qué tan producida es, qué formato, si el producto se ve. La ficha muestra los **formatos que domina**, definido como los que aparecen en un tercio o más de sus piezas, con mínimo 2 piezas analizadas. Con una sola no hay patrón, hay una casualidad.

Dos decisiones de diseño:

- **El vocabulario es cerrado.** Con texto libre, "baño" y "el baño de su casa" serían categorías distintas y ningún filtro agruparía nada. `interpretarRespuesta()` valida contra `VOCAB` y descarta a null lo que no esté en la lista: un valor inventado no rompe nada visible, y esos son los errores que más tardan en descubrirse.
- **Los videos se analizan por fotogramas**, tres repartidos al 15%, 50% y 80% de la pieza. No al principio, porque los primeros cuadros de un reel suelen ser una portada o un fundido a negro. Lo que un cuadro no puede decir —si habla a cámara, el ritmo del montaje— el prompt permite responderlo como null.

Corre **fuera del servidor web**, como script:

```bash
node scripts/analizar-contenido.js            # 25 piezas
node scripts/analizar-contenido.js 400        # todo el backlog
node scripts/analizar-contenido.js 5 --prueba # sin guardar, para ver qué sale
```

Necesita `ANTHROPIC_API_KEY` además de las variables de siempre. Es seguro correrlo cuantas veces se quiera: solo toca lo que falta. Una pieza se analiza una vez y no vuelve a cambiar, por eso el resultado se guarda en tabla y no en vista.

⚠️ **Cambiar un vocabulario de `VOCAB` invalida las filas ya analizadas**: los valores viejos siguen en la tabla pero dejan de coincidir con los filtros. Si se cambia, hay que re-analizar.

## Nichos y tarifas

**Taxonomía de dos niveles**, en `mk_config.nichos`: 15 categorías madre (belleza, moda, salud y fitness, comida, hogar, familia, mascotas, viajes, tecnología, gaming, finanzas, educación, entretenimiento, autos y movilidad, estilo de vida) con sus subnichos. La creadora elige hasta 3 subnichos; la categoría madre se deduce sola. La marca filtra por categoría o afina por subnicho.

**Entregables** en `mk_config.entregables`: reel, TikTok, historias, post/carrusel, UGC sin publicar, reseña en video, combo, evento presencial y embajadora mensual. Cada uno lleva su propio precio.

**Slider** en `mk_config.rango_tarifa`: de $50.000 a $8.000.000, paso $10.000. Todo se cambia desde `/api/admin/config` sin desplegar.

---

## Deuda técnica consciente

- **Marca de agua** (`watermark.js`, agosto 2026). Ninguna ruta sirve el original: `/media/:id` y `/media/:id/poster` devuelven la copia de `watermark_path` / `watermark_poster_path`. Además de las tres pasadas visibles, la copia va recortada un 5% por lado y recomprimida — eso cambia el hash perceptual, que es lo que de verdad dificulta una búsqueda inversa; la marca visible sola no lo hace.

  Las piezas nuevas se marcan en segundo plano al subirse (no se hace esperar a la creadora medio minuto por un video), y `node scripts/marcar-contenido.js` recoge lo que quedó atrás. Mientras una pieza no esté marcada el proxy sirve el original: un hueco negro en el catálogo sería peor que el riesgo que se cubre.

  ⚠️ **No hace imposible identificar a la creadora.** Nada lo hace salvo arruinar la imagen. Alguien decidido, con la pieza en la mano, puede llegar a su perfil; lo que esto cambia es que deje de ser trivial.
- **Sin pasarela de pagos** (decisión de producto). El escrow es un estado contable: `mk_pagos` registra entradas y salidas a mano. Si el volumen crece, la tabla ya tiene la forma que necesitaría una conciliación con Wompi.
- **Sin bloqueo optimista en las transiciones.** Dos admins simultáneos podrían registrar dos pagos de salida sobre el mismo trato. Con un equipo de una o dos personas es aceptable.
- **El texto de los términos está pendiente de revisión jurídica.** Sirve para los pilotos; debe pasar por abogada antes de operar con marcas externas en volumen.

## Plazos automáticos

El portal promete plazos a las dos partes. `plazos.js` es lo que los hace cumplir; sin él eran texto decorativo, y prometer un plazo que no se cumple es peor que no prometerlo.

| Promesa | Cómo se cumple |
|---|---|
| "Tienes 72 horas para responder" | La propuesta se cancela sola. Se avisa antes, cuando queda un tercio del plazo. |
| "La marca tiene 48h para aprobar" | Auto-aprobación, **solo si `auto_aprobar_entrega` está en `true`** (hoy `false`) |
| "A tu cuenta 48h después de aprobado" | ⚠️ Sigue siendo manual: el pago lo registra el equipo desde el panel |

**Corre solo.** La app lo ejecuta cada 6 horas desde dentro, dos minutos después de arrancar. No hay cron externo que configurar ni servicio que contratar: si la promesa de las 72 horas dependiera de que alguien monte un cron en Railway, duraría lo que dure la memoria de quien lo montó.

Se apaga con `MK_PLAZOS_AUTO=0` — útil en local, para no tocar datos reales mientras se desarrolla.

También se puede disparar a mano:

```bash
# Qué haría, sin tocar nada
curl -u admin:CLAVE -X POST "https://www.creatorsmanager.com/api/cron/plazos?dry_run=1"
# De verdad
curl -u admin:CLAVE -X POST "https://www.creatorsmanager.com/api/cron/plazos"
```

Es idempotente: correrlo dos veces seguidas no repite nada, así que dos instancias de Railway pisándose no cierran nada dos veces.

Tres decisiones que conviene conocer antes de tocarlo:

- **Se avisa antes de cerrar.** Cerrarle una propuesta a una creadora sin haberle recordado que la tiene sería quitarle un trabajo por no haber abierto la app, que es casi siempre lo que pasa. `aviso_plazo_at` garantiza un solo aviso por trato.
- **Auto-aprobar libera dinero**, así que está detrás de su propio interruptor y apagado por defecto. Encenderlo es una decisión de negocio, no de configuración.
- **Solo se cancelan propuestas en `solicitado`**, donde todavía no hay plata de por medio. Un trato con pago retenido nunca se cancela solo: esa decisión es de una persona.

## Pendiente contable (no bloquea desarrollo)

Antes de mover pagos de terceros en volumen hay que definir con Paula: quién factura el 100%, si la creadora necesita RUT y si aplica retención en la fuente sobre el pago de salida. El campo `nit` en `mk_marcas` y el export CSV están puestos pensando en esa conversación.
