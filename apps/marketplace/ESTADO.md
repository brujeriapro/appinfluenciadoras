# Creators Manager — dónde está y qué falta decidir

**Actualizado:** 26 de agosto de 2026
**Para:** contexto de una conversación sobre qué hacer a continuación.

---

## Qué es

Un marketplace de dos lados en Colombia. **Marcas** contratan colaboraciones pagas con **creadoras de contenido**; la plataforma cobra comisión por cada trato cerrado (12% a la marca, 8% a la creadora) más una suscripción mensual a las marcas.

Dominio: `creatorsmanager.com`. Es una marca aparte de Brujería Capilar, aunque comparte base de datos con su Programa Creadoras para no duplicar el banco de creadoras.

**La promesa que lo diferencia:** las demás plataformas dicen *quién es* una creadora (seguidores, nicho, ciudad). Esta dice *cómo trabaja y si cumple*. Eso sale de datos que solo se acumulan operando, y por eso no se copia fácil.

---

## Los números, hoy

| | |
|---|---|
| Creadoras registradas | **249** (todas en la última semana) |
| Visibles en el catálogo | 220 |
| Esperando revisión | 29 |
| Piezas de contenido subidas | 456 |
| Con historial de entrega comprobado | 40 |
| **Marcas registradas** | **2** |
| **Tratos cerrados** | **1** |
| Tarifa promedio declarada | $136.421 COP |

**El lado de la oferta funciona. El de la demanda no existe todavía.**

### De dónde salieron las creadoras

- 472 invitaciones enviadas al Programa Creadoras de Brujería Capilar (universo de 719 con correo)
- 38 llegaron por referido de otra creadora
- **496 cupos de referido siguen sin usar** entre las aprobadas

---

## El problema real

**Con 2 marcas, nada de lo construido genera un peso.** El catálogo, los niveles, el historial de cumplimiento, el escrow — todo está listo y esperando compradores que no han llegado.

Esto no es un problema de producto ni de software. Es que **no se ha hecho venta**.

Lo único que se ha hecho del lado de la demanda es dejar el registro abierto y publicar una página de precios. Nadie ha salido a buscar marcas.

### Lo que sí ayuda a venderlas

Dos argumentos que otras plataformas no tienen:

1. **Historial de cumplimiento verificado.** 40 creadoras con entrega comprobada, cruzando el Programa Creadoras (kit despachado contra fecha de publicación). Una marca que va a pagar $400.000 no teme por los seguidores; teme que no le entreguen.
2. **Niveles por red, no globales.** Una creadora puede ser micro en Instagram y media en TikTok. Contratarla para TikTok con el número de Instagram es contratar a ciegas.

---

## Decisiones ya tomadas (y por qué)

Conviene no re-litigarlas sin motivo nuevo:

**Se cobra por propuestas, no por búsquedas.** Limitar el catálogo no protege nada —lo que se ve se anota— e impide que la marca encuentre a la creadora por la que valdría la pena pagar. El tope vive donde está el valor: al enviar la propuesta.
Planes: Explora $0 (3 propuestas/mes) · Impulsa $39.900 (12) · Escala $119.900 (40) · Agencia $299.900 (sin tope).

**UGC es una categoría, no un escalón.** Por debajo de 3.000 seguidores nadie compra alcance: compra contenido para los canales de la marca. Es otro trabajo, se produce distinto y se cobra distinto. Hoy son ~29 de las visibles por su red principal.

**No hay sello negativo público.** Que una creadora no haya publicado puede deberse a razones que no conocemos. El dato existe, pesa en el orden del catálogo y lo ve el equipo, pero no se exhibe. Se destaca a quien cumple en vez de señalar a quien no.

**La identidad de la creadora está oculta hasta que el pago queda retenido.** Alias y código, nunca nombre ni @usuario. Es lo que hace exigible la cláusula de no-circunvalación.

**El número exacto de seguidores no viaja al catálogo** (buscar "12.483 seguidores" lleva al perfil real), pero las vistas promedio sí: deciden la contratación y no sirven para encontrar a nadie.

---

## Qué está pendiente

### Del negocio — lo que de verdad importa

1. **Conseguir marcas.** No hay plan de venta escrito ni nadie asignado. Es el cuello de botella.
2. **Probar un cobro real.** Wompi está configurado en producción pero **nunca se ha completado una compra**. Si el pago falla, no importa cuántas marcas lleguen.
3. **Llegar a 500 creadoras** (meta de María). Faltan ~250 y las fuentes actuales dan para ~380 en total: 247 invitaciones sin enviar del Programa + los 496 cupos de referido. Para pasar de ahí hace falta una fuente externa.

### Del producto — construido pero sin encender

- **Análisis de contenido con IA.** Etiqueta cada pieza (dónde graba, luz, formato, producción) para que la marca busque por estilo y no por seguidores. Aplazado por decisión de costo: pasar las 456 piezas cuesta $5–10 USD de una vez.
- **Métricas conectadas por API de Instagram.** Hoy la verificación es por captura revisada a mano, que funciona pero no escala.

### Deuda conocida

- El **pago a la creadora es manual** (una persona lo registra desde el panel). El portal promete "48 horas después de aprobado" y ese plazo lo cumple el equipo, no un proceso.
- **Multi-moneda no existe.** Hay 20 países en el perfil pero todas cobran en pesos colombianos.
- **Sin marca de agua** en las piezas del catálogo: una búsqueda inversa de imagen todavía puede identificar a una creadora.

---

## Lo que pasó esta semana (por si explica algo)

**El correo se cayó dos días.** Brevo tiene tope de 300 diarios en su plan gratuito; el 25 de agosto salieron 353. Los que pasaron del tope se rechazaron en silencio y **16 creadoras quedaron sin poder entrar** — pidieron el enlace de recuperación hasta 13 veces cada una.

Se resolvió cambiando a ZeptoMail (unas diez veces más barato) y poniendo un tope diario de envíos que recorta las tandas solas.

Vale la pena tenerlo presente porque **explica por qué varias creadoras pueden estar frías**: intentaron entrar, no pudieron, y nadie les dijo que el problema no era suyo.

---

## Preguntas abiertas

Las que valdría la pena pensar:

1. **¿Cómo se consiguen las primeras 10 marcas?** ¿Venta directa de María a marcas que ya conoce? ¿Contenido? ¿Publicidad? Nada de esto está decidido.
2. **¿Vale la pena seguir sumando creadoras** hasta 500 antes de tener demanda, o el esfuerzo debería moverse a marcas ya? Hay 220 visibles esperando trabajo que no llega.
3. **¿Qué pasa si una marca llega y no encuentra lo que busca?** El catálogo es fuerte en belleza y UGC, pero nunca se ha probado contra una necesidad real.
4. **¿Cuándo se cobra la primera suscripción?** Las 2 marcas están en plan gratuito. Nadie ha pagado nada, ni suscripción ni comisión.
