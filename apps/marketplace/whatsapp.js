// Envío por WhatsApp Cloud API de Meta.
//
// Por qué WhatsApp y no solo correo: en Colombia un mensaje de WhatsApp se abre
// casi siempre y un correo no. Sobre la misma lista, convierte varias veces más.
//
// Dos cosas que Meta impone y que definen cómo está escrito esto:
//
//   1. A alguien que no te ha escrito primero solo se le pueden mandar
//      PLANTILLAS aprobadas por Meta. No se puede improvisar el texto: se
//      envía el nombre de la plantilla y los valores de sus variables.
//   2. Un número nuevo arranca con un tope bajo de destinatarios diarios, que
//      sube solo si la calidad se mantiene. Mandar cientos el primer día es la
//      forma más rápida de que lo bloqueen.

const fetch = require('node-fetch');
const config = require('./config');

const API = 'https://graph.facebook.com/v21.0';

/**
 * ¿Está configurado lo mínimo para poder enviar?
 *
 * Recibe la plantilla porque hay más de una y Meta aprueba cada texto por
 * separado: la del Programa Creadoras puede estar lista y la de las listas
 * aliadas todavía en revisión. Sin argumento se comporta como siempre.
 */
const configurado = (plantilla = config.whatsapp.plantilla) =>
  Boolean(config.whatsapp.phone_number_id && config.whatsapp.token && plantilla);

/**
 * Normaliza un teléfono colombiano al formato que espera Meta: solo dígitos,
 * con indicativo de país y sin el signo de más.
 *
 * En la base los números vienen como los escribió cada creadora — con espacios,
 * guiones, con o sin +57, con o sin el 0 de larga distancia — así que hay que
 * ordenarlos antes de enviar o Meta los rechaza uno por uno.
 */
function normalizarTelefono(crudo) {
  let n = String(crudo || '').replace(/\D/g, '');
  if (!n) return null;

  n = n.replace(/^0+/, '');           // 0 de larga distancia
  if (n.startsWith('57')) n = n.slice(2);
  if (n.length !== 10 || !n.startsWith('3')) return null;  // celular colombiano
  return '57' + n;
}

/**
 * Manda una plantilla a un número.
 *
 * Devuelve { ok, id } o { ok: false, error } — nunca lanza, porque quien la
 * llama está recorriendo cientos de destinatarios y un fallo suelto no puede
 * tumbar la tanda entera.
 */
/**
 * Códigos de idioma que Meta usa para el español.
 *
 * Al crear una plantilla, la interfaz deja elegir "Español", "Español (México)"
 * o "Español (España)", y cada una queda con un código distinto. Pedirla con el
 * código equivocado devuelve "template name does not exist in the translation",
 * que suena a que la plantilla no existe cuando en realidad sí está.
 */
// es_CO primero: es el que ofrece Meta como "Spanish (COL)" y el que
// naturalmente elige quien crea la plantilla desde Colombia.
const IDIOMAS_ES = ['es_CO', 'es', 'es_ES', 'es_MX', 'es_AR', 'es_LA'];

/** Una sola llamada a Meta con un idioma y una plantilla concretos. */
async function intentarEnvio(numero, variables, idioma, plantilla) {
  const r = await fetch(`${API}/${config.whatsapp.phone_number_id}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.whatsapp.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'template',
      template: {
        name: plantilla,
        language: { code: idioma },
        components: variables.length ? [{
          type: 'body',
          parameters: variables.map(v => ({ type: 'text', text: String(v) })),
        }] : [],
      },
    }),
  });

  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    return {
      ok: false,
      codigo: d?.error?.code,
      error: d?.error?.message || `HTTP ${r.status}`,
    };
  }
  return { ok: true, id: d?.messages?.[0]?.id || null, idioma };
}

/**
 * Manda una plantilla a un número.
 *
 * Devuelve { ok, id } o { ok: false, error } — nunca lanza, porque quien la
 * llama está recorriendo cientos de destinatarios y un fallo suelto no puede
 * tumbar la tanda entera.
 *
 * Si el idioma configurado no corresponde, prueba las otras variantes del
 * español antes de darse por vencida: el resultado es el mismo y le ahorra a
 * quien opera tener que adivinar el código exacto.
 *
 * `plantilla` deja elegir cuál de las aprobadas se manda. Omitirla es el
 * comportamiento de siempre, así que las cuatro olas del Programa Creadoras no
 * se enteran de que existe.
 */
async function enviarPlantilla(telefono, variables = [], plantilla = config.whatsapp.plantilla) {
  if (!configurado(plantilla)) return { ok: false, error: 'WhatsApp sin configurar' };

  const numero = normalizarTelefono(telefono);
  if (!numero) return { ok: false, error: 'Teléfono no válido' };

  const primero = config.whatsapp.idioma;
  const orden = [primero, ...IDIOMAS_ES.filter(i => i !== primero)];

  try {
    let ultimo = null;
    for (const idioma of orden) {
      const r = await intentarEnvio(numero, variables, idioma, plantilla);
      if (r.ok) return r;
      ultimo = r;
      // 132001 es "no existe en esa traducción": vale la pena probar otra.
      // Cualquier otro error —token, número, cuota— no se arregla cambiando
      // de idioma, así que se corta ahí.
      if (r.codigo !== 132001) break;
    }
    return {
      ok: false,
      error: ultimo?.codigo === 132001
        ? `No se encontró la plantilla "${plantilla}" en ningún idioma español. `
          + 'Revisa que el nombre configurado sea exactamente el aprobado en Meta.'
        : ultimo?.error || 'Error desconocido',
    };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * ¿El token sirve todavía?
 *
 * Pregunta por el propio número, que es la llamada más barata que hay: no
 * manda nada, no cuesta y no toca a ningún destinatario. Los tokens de Meta
 * caducan sin aviso y cuando eso pasa los envíos fallan en silencio, así que
 * conviene poder comprobarlo antes de una tanda y no a mitad.
 */
async function verificar() {
  // Se dice cuál falta, no "una de las dos": con dos servicios en Railway que
  // salen del mismo repositorio, lo más común es haberlas puesto en el otro.
  const faltan = [];
  if (!config.whatsapp.phone_number_id) faltan.push('WA_PHONE_NUMBER_ID');
  if (!config.whatsapp.token) faltan.push('WA_TOKEN');
  if (faltan.length) {
    return {
      ok: false,
      motivo: `El servicio no ve ${faltan.join(' ni ')}. `
            + 'Revisa que estén en el servicio supportive-intuition y con ese nombre exacto.',
      faltan,
    };
  }

  try {
    const r = await fetch(
      `${API}/${config.whatsapp.phone_number_id}?fields=display_phone_number,verified_name,quality_rating,code_verification_status,status,messaging_limit_tier,platform_type,throughput`,
      { headers: { 'Authorization': `Bearer ${config.whatsapp.token}` } }
    );
    const d = await r.json().catch(() => ({}));

    if (!r.ok) {
      const msg = d?.error?.message || `HTTP ${r.status}`;
      const vencido = /expired|session has expired|invalid.*token|OAuth/i.test(msg);
      return {
        ok: false,
        vencido,
        motivo: vencido ? 'El token está vencido. Hay que generar uno nuevo.' : msg,
      };
    }

    return {
      ok: true,
      numero: d.display_phone_number || null,
      nombre: d.verified_name || null,
      // Meta baja esta calificación cuando la gente reporta o bloquea. En
      // rojo, los envíos se limitan solos.
      calidad: d.quality_rating || null,
      // Cuántos destinatarios distintos deja alcanzar en 24 h. Un número sin
      // verificación de negocio se queda en 250 y los demás mensajes se
      // aceptan pero no se entregan — que es justo lo que parece un envío
      // exitoso que nunca llega.
      limite: d.messaging_limit_tier || null,
      estado_numero: d.status || null,
      verificacion: d.code_verification_status || null,
      plataforma: d.platform_type || null,
    };
  } catch (e) {
    return { ok: false, motivo: e.message };
  }
}

module.exports = { configurado, normalizarTelefono, enviarPlantilla, verificar };
