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

/** ¿Está configurado lo mínimo para poder enviar? */
const configurado = () =>
  Boolean(config.whatsapp.phone_number_id && config.whatsapp.token && config.whatsapp.plantilla);

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
async function enviarPlantilla(telefono, variables = []) {
  if (!configurado()) return { ok: false, error: 'WhatsApp sin configurar' };

  const numero = normalizarTelefono(telefono);
  if (!numero) return { ok: false, error: 'Teléfono no válido' };

  try {
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
          name: config.whatsapp.plantilla,
          language: { code: config.whatsapp.idioma },
          components: variables.length ? [{
            type: 'body',
            parameters: variables.map(v => ({ type: 'text', text: String(v) })),
          }] : [],
        },
      }),
    });

    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // El mensaje de Meta dice exactamente qué pasó —plantilla no aprobada,
      // token vencido, número fuera de WhatsApp— y sin él depurar es adivinar.
      const detalle = d?.error?.message || `HTTP ${r.status}`;
      return { ok: false, error: detalle };
    }
    return { ok: true, id: d?.messages?.[0]?.id || null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { configurado, normalizarTelefono, enviarPlantilla };
