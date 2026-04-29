const fetch = require('node-fetch');
const config = require('./config');

// Normaliza teléfono colombiano a formato E.164 sin +
// Entrada: "3001234567", "+573001234567", "57 300 123 4567", etc.
// Salida: "573001234567"
function normalizarTelefono(tel) {
  if (!tel) return null;
  const digits = tel.replace(/\D/g, '');
  if (digits.startsWith('57') && digits.length === 12) return digits;
  if (digits.length === 10) return '57' + digits;
  return digits;
}

async function enviarTemplate(telefono, templateName, params = []) {
  const { token, phone_id } = config.whatsapp;
  if (!token || !phone_id) {
    console.warn('[whatsapp] No configurado — omitiendo mensaje');
    return { skipped: true };
  }

  const numero = normalizarTelefono(telefono);
  if (!numero) {
    console.warn('[whatsapp] Teléfono inválido:', telefono);
    return { skipped: true };
  }

  const body = {
    messaging_product: 'whatsapp',
    to: numero,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es' },
      components: params.length > 0 ? [{
        type: 'body',
        parameters: params.map(p => ({ type: 'text', text: String(p) })),
      }] : [],
    },
  };

  const res = await fetch(`https://graph.facebook.com/v19.0/${phone_id}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));
  return { sent: true, to: numero, message_id: data.messages?.[0]?.id };
}

// Mensaje inmediato al enviar el kit
// Template: bienvenida_kit_brujeria
// Variables: {{1}} nombre, {{2}} link formulario contenido, {{3}} código descuento
async function enviarBienvenidaKit(influencer, codigoDescuento) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  const linkContenido = config.tally_contenido_url || 'https://tally.so/r/rjEZdo';
  const codigo = codigoDescuento || influencer.codigo_descuento || '—';

  return enviarTemplate(
    influencer.telefono,
    'bienvenida_kit_brujeria',
    [nombre, linkContenido, codigo]
  );
}

// Recordatorio semanal para influencers que no han publicado
// Template: recordatorio_contenido_brujeria
// Variables: {{1}} nombre, {{2}} días desde envío, {{3}} fecha límite (día del mes)
async function enviarRecordatorioWhatsApp(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  const diasDesdeEnvio = Math.floor(
    (Date.now() - new Date(influencer.fecha_envio).getTime()) / (1000 * 60 * 60 * 24)
  );
  const fechaLimite = new Date(new Date(influencer.fecha_envio).getTime() + 30 * 24 * 60 * 60 * 1000);
  const fechaStr = fechaLimite.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });

  return enviarTemplate(
    influencer.telefono,
    'recordatorio_contenido_brujeria',
    [nombre, String(diasDesdeEnvio), fechaStr]
  );
}

module.exports = { enviarBienvenidaKit, enviarRecordatorioWhatsApp };
