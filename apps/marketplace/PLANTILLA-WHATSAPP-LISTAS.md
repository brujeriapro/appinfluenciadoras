# La plantilla de WhatsApp para las listas de marcas aliadas

Esto es lo único del flujo que **no depende de nosotros**: Meta tiene que aprobar el texto antes de que salga un solo mensaje. Suele tardar de unos minutos a 24 horas. Conviene mandarla a aprobar de una, porque todo lo demás ya está construido y esperando.

---

## Paso 1 · Crear la plantilla

En **Meta Business Suite → WhatsApp Manager → Plantillas de mensajes → Crear plantilla**.

| Campo | Valor |
|---|---|
| Nombre | `invitacion_lista_aliada` |
| Categoría | **Marketing** |
| Idioma | **Español (COL)** |

**Encabezado:** ninguno.

**Cuerpo** — copiar tal cual, con `{{1}}` incluido:

```
Hola {{1}}, te escribimos de Creators Manager.

Ettos Beauty Market nos compartió tu contacto porque has trabajado con ellos, y queremos invitarte a nuestro banco de creadoras.

Es una plataforma donde las marcas contratan colaboraciones pagas: tú pones tu tarifa, el dinero queda retenido antes de que grabes, y te llega cuando entregas. Tu @usuario no es público: las marcas te ven por cómo trabajas, no por tu nombre.

Registrarte es gratis y toma unos minutos.

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
| `VER DE QUÉ SE TRATA` | `https://creatorsmanager.com/invitacion.html` |

---

## Por qué está escrito así

No es un texto de relleno; cada parte responde a algo concreto:

- **Nombra a Ettos en el segundo renglón.** Es lo primero que la persona se pregunta: "¿de dónde sacaron mi número?". Poder responderlo con una marca que ella reconoce es lo único que separa una invitación de un número desconocido. Y los reportes por spam son lo que le baja la calificación de calidad al número hasta que Meta lo limita solo, sin apelación rápida.
- **Dice que es pago y que el dinero se retiene antes de grabar.** Es la objeción real de una creadora: no teme que le paguen poco, teme que no le paguen. Ponerlo antes que cualquier otra cosa es lo que hace que siga leyendo.
- **La salida está dicha dos veces**, en el cuerpo y en el pie. Además de ser lo correcto, es lo que protege el número: quien tiene una salida clara responde SALIR en vez de darle a "Reportar", y Meta solo castiga lo segundo.
- **No menciona Brujería Capilar.** Son marcas distintas y cuentas separadas.
- **La variable no va pegada al principio ni al final del cuerpo**, que es motivo de rechazo automático.
- **Una sola variable.** Si mañana la lista viene de otra marca, lo más rápido es crear otra plantilla con ese nombre adentro; meter la marca como `{{2}}` obliga a Meta a revisar de nuevo y se aprueba más lento.

⚠️ **Nombrar a Ettos expone a la marca aliada ante 145 personas.** Vale la pena pedirles el visto bueno antes de mandar la plantilla a aprobación. Si dicen que no, la alternativa es *"Una marca con la que trabajamos nos compartió tu contacto"* — se lee más frío y hay que someter la plantilla otra vez.

---

## Paso 2 · Conectarla

Cuando Meta la apruebe, en **Railway → servicio del marketplace → Variables**:

```
WA_PLANTILLA_LISTA=invitacion_lista_aliada
```

El servicio se reinicia solo. En el panel, la pestaña **Creadoras por invitar** deja de decir "Falta la plantilla".

---

## Paso 3 · Verla antes de mandarla a nadie

En la pestaña **Creadoras por invitar**, abajo: *Mándate una de prueba* con tu propio celular.

Revisar en el teléfono:

- [ ] Llega.
- [ ] El saludo se lee bien.
- [ ] El botón abre `creatorsmanager.com/invitacion.html` y desde ahí se llega al registro.
- [ ] Se ve la línea de "responde SALIR".

Si Meta contesta que no encuentra la plantilla, es casi siempre el idioma: la interfaz deja crear "Español", "Español (México)" o "Español (COL)" y cada una queda con un código distinto. El código las prueba todas solo, así que si igual falla, lo que está mal es el **nombre**.

---

## Antes de la primera tanda

⚠️ **Nadie está leyendo las respuestas.** El mensaje promete que respondiendo SALIR no se vuelve a escribir, y hoy no hay nada que lea los mensajes entrantes del número. Hay que abrir la bandeja de WhatsApp después de cada tanda y sacar a mano a quien lo pida. Prometer una salida y no atenderla es peor que no prometerla.

**Empezar con 30, no con 80.** Al día siguiente, mirar en la pestaña que la calidad del número siga en verde antes de seguir. Si con 30 mensajes ya bajó a amarillo, el problema es el texto y hay que reescribirlo, no insistir.
