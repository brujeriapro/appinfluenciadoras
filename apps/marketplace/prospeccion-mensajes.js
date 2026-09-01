// Los mensajes del agente de prospección.
//
// Cada toque tiene un trabajo distinto y por eso hay cuatro plantillas y no
// una con variantes. Un recordatorio que repite la presentación no es un
// recordatorio: es la misma interrupción otra vez.
//
// ── Cómo se escriben acá ───────────────────────────────────────────────────
//
// 1. Va firmado por una persona, no por una empresa. Quien escribe es María,
//    dueña de una marca de belleza, hablándole a otra dueña de marca. Ese es
//    el único ángulo que esto tiene y que una agencia no puede copiar.
// 2. La primera línea dice algo CIERTO y ESPECÍFICO de esa marca. Si no
//    tenemos nada específico que decir, el prospecto no está investigado y no
//    se le escribe todavía.
// 3. Se pide una cosa sola y chica: veinte minutos. No "agenda una demo de
//    nuestra plataforma".
// 4. Salida fácil y visible en todos. Cuesta menos una baja que un reporte de
//    spam, y el reporte se lo cobra el dominio entero.
// 5. Nada de "espero que estés muy bien", "me permito", "quedo atento". Eso
//    dice "esto es una plantilla" antes de la segunda línea.

const config = require('./config');

/** Quien firma. Es la dirección del negocio, con nombre de persona adelante:
 *  en un correo lo primero que se lee es el nombre, no la dirección. */
const REMITENTE = process.env.MK_PROSPECCION_FROM
  || 'María de Creators Manager <admin@creatorsmanager.com>';

/** El nombre suelto, para firmar el cuerpo. */
const FIRMA = process.env.MK_PROSPECCION_FIRMA || 'María';

const enlace = (ruta = '/marcas') => `${config.base_url.replace('://www.', '://')}${ruta}`;

/**
 * El primer contacto.
 *
 * Lo único que tiene que lograr es una respuesta, no una venta. Por eso
 * termina en una pregunta que se puede contestar con una línea.
 */
function presentacion(p) {
  const razon = p.razon || `vi lo que están haciendo en redes`;
  const presentada = p.creadora_nombre
    ? `\n\n${p.creadora_nombre}, que ya ha trabajado con ustedes, está en nuestro catálogo y fue quien me hizo pensar en escribirles.`
    : '';

  return {
    asunto: `${p.nombre}: 30 creadoras publicando la misma semana`,
    cuerpo:
`Hola${p.contacto ? ' ' + p.contacto : ''},

Soy ${FIRMA}. Tengo una marca de belleza en Medellín y hace unos meses armé Creators Manager, que es donde ahora contrato a las creadoras que antes perseguía por WhatsApp.

Te escribo porque ${razon}.${presentada}

Lo que hacemos es simple: en vez de una creadora grande y cara, activamos treinta pequeñas la misma semana. Tú apruebas el contenido antes de que se libere tu dinero, y cada perfil trae el historial de si cumplió o no en sus trabajos anteriores.

¿Te sirve que hablemos veinte minutos esta semana? Si prefieres, te mando primero un ejemplo de cómo se vería con tus productos.

${FIRMA}
${enlace('/marcas')}`,
  };
}

/**
 * El segundo, a los tres días.
 *
 * El que más respuestas trae de los cuatro, y el que siempre se olvida cuando
 * esto se hace a mano. Es corto a propósito: si el primero no se leyó, un
 * segundo largo tampoco se lee.
 */
function recordatorio(p) {
  return {
    asunto: `Re: ${p.nombre}: 30 creadoras publicando la misma semana`,
    cuerpo:
`Hola${p.contacto ? ' ' + p.contacto : ''}, te escribo una sola vez más por si el otro correo se perdió.

La pregunta es corta: ¿estarían dispuestos a probar contenido de creadoras este mes? Septiembre lo tenemos gratis para las marcas que entran ahora.

Si no es el momento, dímelo y no te escribo más — sin problema.

${FIRMA}`,
  };
}

/**
 * El tercero, al día siete: dar algo, no pedir.
 *
 * «¿Viste mi mensaje?» no aporta nada y se lee como insistencia. Este entrega
 * una idea concreta que la marca puede usar aunque nunca nos conteste, y es lo
 * que hace que algunas contesten.
 */
function valor(p) {
  // Ojo con el asunto: decía "las marcas de marcas de skincare". La categoría
  // entra sola, sin repetir la palabra que ya está en la frase.
  const gancho = p.categoria ? `de ${p.categoria}` : 'parecidas a la tuya';

  return {
    asunto: `Una cosa que están haciendo las marcas ${gancho}`,
    cuerpo:
`Hola${p.contacto ? ' ' + p.contacto : ''},

Sin ánimo de insistir, te dejo algo que quizás te sirva aunque no trabajemos juntas.

Instagram y TikTok ya casi no te dejan escoger a quién le llega tu anuncio: ahora lo deciden ellos, mirando el video. Eso significa que si subes el presupuesto pero sigues con los mismos tres videos, te va peor, no mejor — el sistema se queda sin material con qué probar.

Por eso las marcas que están creciendo cambiaron la pregunta: ya no es «a quién le apunto», es «cuánto contenido distinto puedo tener este mes».

Lo escribí completo acá: ${enlace('/metodologia')}

Si en algún momento quieres probarlo, avísame.

${FIRMA}`,
  };
}

/**
 * El cuarto y último, al día catorce.
 *
 * Se dice que es el último y se cumple. Es lo que hace que algunas contesten
 * —quitar la presión trae respuestas— y sobre todo es lo que deja la puerta
 * abierta para volver en seis meses sin haber quemado nada.
 */
function cierre(p) {
  return {
    asunto: `Cierro el tema, ${p.nombre}`,
    cuerpo:
`Hola${p.contacto ? ' ' + p.contacto : ''},

Este es el último correo que te mando, no te preocupo más.

Si en algún momento quieren probar contenido de creadoras, acá vamos a estar: ${enlace('/marcas')}

Y si el tema simplemente no es para ustedes, también está perfecto. Gracias por el tiempo.

${FIRMA}`,
  };
}

const PLANTILLAS = { presentacion, recordatorio, valor, cierre };

/**
 * Arma el mensaje del toque que corresponda.
 *
 * ⚠️ Exige que el prospecto esté investigado: sin una razón concreta, el
 * primer contacto queda diciendo «vi lo que están haciendo en redes», que es
 * exactamente la frase que delata un envío masivo. Antes que mandar eso,
 * preferimos no mandar nada.
 */
function redactar(tipo, prospecto) {
  const plantilla = PLANTILLAS[tipo];
  if (!plantilla) throw new Error(`No existe una plantilla de tipo "${tipo}"`);

  if (tipo === 'presentacion' && !prospecto.razon) {
    throw new Error(
      `El prospecto "${prospecto.nombre}" no tiene una razón concreta para escribirle. ` +
      'Investígalo primero: un primer contacto genérico gasta el contacto y no se recupera.'
    );
  }

  const { asunto, cuerpo } = plantilla(prospecto);
  return { asunto, cuerpo, remitente: REMITENTE, tipo };
}

/**
 * La versión para WhatsApp: una sola pieza, corta, sin asunto.
 *
 * No es el correo recortado. En WhatsApp un bloque de seis líneas no se lee, y
 * el saludo y la pregunta tienen que caber antes del «ver más».
 */
function paraWhatsApp(p) {
  const presentada = p.creadora_nombre ? ` ${p.creadora_nombre} me pasó el contacto.` : '';
  return (
`Hola${p.contacto ? ' ' + p.contacto : ''}, soy ${FIRMA}, de Creators Manager.${presentada}

Conectamos marcas con creadoras colombianas para hacer contenido en volumen. Septiembre está gratis para marcas nuevas.

¿Te sirve que te cuente en 20 minutos esta semana? Si no te interesa dime y no te escribo más.`
  );
}

module.exports = { redactar, paraWhatsApp, PLANTILLAS, REMITENTE, FIRMA };
