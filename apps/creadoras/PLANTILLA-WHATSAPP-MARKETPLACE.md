# La plantilla de WhatsApp para las creadoras que vienen de Creators Manager

Es lo único de este flujo que **no depende de nosotros**: Meta tiene que aprobar el texto antes de que salga un solo mensaje. Suele tardar de unos minutos a 24 horas. Todo lo demás ya está construido y esperando: el botón de la pantalla *[C] Creators Manager* llama al envío, y lo único que falta es que la plantilla exista con este nombre exacto.

Mientras no esté aprobada, el botón verde de cada recuadro sigue funcionando — abre el chat con el mensaje escrito para darle enviar a mano.

---

## Paso 1 · Crear la plantilla

En **Meta Business Suite → WhatsApp Manager → Plantillas de mensajes → Crear plantilla**, en la cuenta de WhatsApp de **Brujería Capilar** (no la de Creators Manager).

| Campo | Valor |
|---|---|
| Nombre | `invitacion_creators_manager` |
| Categoría | **Marketing** |
| Idioma | **Español (COL)** |

⚠️ **El nombre tiene que ser idéntico**, incluidos los guiones bajos. Es el que el código pide (`whatsapp.js` → `enviarInvitacionMarketplace`), y si no coincide Meta responde que la plantilla no existe.

⚠️ **El idioma tiene que ser Español (COL)**, no "Español" a secas. El código manda `es_CO`; una plantilla aprobada en `es` no la encuentra.

**Encabezado:** ninguno.

**Cuerpo** — copiar tal cual, con `{{1}}` incluido:

```
Hola {{1}}, te escribimos de Brujería Capilar, una marca colombiana de cuidado capilar.

Te encontramos en Creators Manager, la plataforma donde estás registrada como creadora.

Tenemos un programa en el que te enviamos productos sin costo para que los pruebes y, si te gustan, hagas contenido con ellos. No es un trato pago ni tienes obligación de publicar: si el producto no te convence, no publicas y no pasa nada.

Para poder despacharte necesitamos tu dirección de envío y un par de datos sobre tu cabello.

Si no te interesa, responde SALIR y no te volvemos a escribir.
```

**Ejemplo para `{{1}}`** (Meta lo exige, y sin él rechaza la plantilla de una): `Laura`

**Pie de página:**

```
Responde SALIR y no te volvemos a escribir.
```

**Botón** → tipo *Visitar sitio web*, URL **estática**:

| Texto del botón | URL |
|---|---|
| `DEJAR MIS DATOS` | `https://tally.so/r/9qlKZ1` |

Si el formulario de registro cambia de dirección, hay que cambiarla también acá y **volver a mandar la plantilla a aprobación** — la URL es parte del texto aprobado.

---

## Paso 2 · Comprobar que quedó conectada

Cuando Meta la marque como **Aprobada**, entra al panel del Programa → pestaña **[C] Creators Manager**, trae una sola creadora y dale a *Mandar a 1*. Si sale, el resto de la tanda sale igual.

Si responde que la plantilla no existe, es casi siempre una de dos: el nombre quedó distinto, o el idioma quedó en `es` en vez de `es_CO`.

---

## Por qué está escrito así

Cada parte responde a algo concreto:

- **Dice quiénes somos en el primer renglón y de dónde salió su número en el segundo.** Es lo primero que se pregunta quien recibe un mensaje de un número desconocido. Poder responderlo es lo único que separa una invitación de un spam — y los reportes por spam le bajan la calificación de calidad al número hasta que Meta lo limita solo, sin apelación rápida.
- **Dice de una que no es un trato pago y que no hay obligación de publicar.** Es la objeción real: una creadora que ha recibido regalos con letra chica asume que hay una obligación escondida. Decirlo antes de que lo pregunte es lo que hace que siga leyendo.
- **Explica para qué pedimos la dirección.** Sin esa línea, el botón parece un formulario de datos personales sin motivo.
- **La salida está dicha dos veces**, en el cuerpo y en el pie. Además de ser lo correcto, es lo que protege el número: quien tiene una salida clara responde SALIR en vez de darle a "Reportar", y Meta solo castiga lo segundo.
- **La variable no va pegada al principio ni al final del cuerpo**, que es motivo de rechazo automático.
- **Una sola variable.** Entre menos partes móviles, más rápido aprueba.

---

## Lo que hay que resolver antes de la primera tanda grande

⚠️ **Nadie está leyendo las respuestas.** El mensaje promete que quien responda SALIR no recibe más, y hoy no hay webhook que lea la bandeja de ese número. Alguien tiene que revisarla a mano después de cada tanda y sacar a quien lo pida. Incumplir esa promesa es peor que no hacerla: quien responde SALIR y recibe otro mensaje es exactamente quien reporta.

⚠️ **El tope por tanda es 30** (`MK_WA_TOPE_TANDA`). No es un límite de Meta: es que una cuenta que dispara cien mensajes de golpe a números que no la tienen agendada se gana una revisión de calidad. Conviene empezar con tandas de 10 o 15 y mirar cómo responden antes de subir.

⚠️ **El mismo mensaje no se manda dos veces.** Queda registrado en `notificaciones_enviadas` con el nombre de la plantilla, y el envío salta a quien ya lo recibió. Si alguna vez hay que reenviárselo a alguien, se borra esa fila.

⚠️ **Estas creadoras dieron su número en Creators Manager, no en Brujería.** Por eso el mensaje dice de dónde salió y ofrece salida en dos sitios. Es lo que hace defendible el envío, y es la razón por la que este texto no se puede reemplazar por una plantilla de las que ya existen.
