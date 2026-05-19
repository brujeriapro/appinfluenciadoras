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

async function enviarTemplate(telefono, templateName, params = [], buttonUrlVar = null) {
  const { token, phone_id } = config.whatsapp;
  if (!token || !phone_id) {
    console.warn('[whatsapp] No configurado — omitiendo mensaje');
    return { skipped: true };
  }

  const numero = normalizarTelefono(telefono);
  console.log(`[whatsapp] telefono raw="${telefono}" → normalizado="${numero}" template="${templateName}"`);
  if (!numero) {
    console.warn('[whatsapp] Teléfono inválido:', telefono);
    return { skipped: true };
  }

  const components = [];
  if (params.length > 0) {
    components.push({ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) });
  }
  // Variable dinámica del botón URL (ej: teléfono para pre-llenar Tally)
  if (buttonUrlVar) {
    components.push({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: String(buttonUrlVar) }] });
  }

  const body = {
    messaging_product: 'whatsapp',
    to: numero,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'es_CO' },
      components,
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
  return enviarTemplate(influencer.telefono, 'bienvenida_club_brujeria', [nombre]);
}

// Recordatorio semanal para influencers que no han publicado
// Template: recordatorio_contenido_brujeria
// Variables: {{1}} nombre, {{2}} días restantes para publicar
async function enviarRecordatorioWhatsApp(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  const diasDesdeEnvio = Math.floor(
    (Date.now() - new Date(influencer.fecha_envio).getTime()) / (1000 * 60 * 60 * 24)
  );
  const diasRestantes = Math.max(0, 30 - diasDesdeEnvio);

  return enviarTemplate(
    influencer.telefono,
    'explicacion_contenido_brujeria',
    [nombre, String(diasRestantes)]
  );
}

// Ideas de contenido 4 días después del envío del kit
// Template: ideas_contenido_brujeria
// Variables: {{1}} nombre
async function enviarIdeasContenido(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  return enviarTemplate(influencer.telefono, 'ideas_contenido_brujeria1', [nombre]);
}

// Bienvenida al club cuando se registra (antes de recibir el kit)
// Template: bienvenida_club_brujeria
// Variables: {{1}} nombre
async function enviarBienvenidaClub(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  return enviarTemplate(influencer.telefono, 'bienvenida_club_brujeria', [nombre]);
}

// Feedback al recibir y calificar contenido
// Template: feedback_contenido_brujeria
// Variables: {{1}} nombre, {{2}} score (0-100), {{3}} nivel actual
async function enviarFeedbackContenido(influencer, score, nivel) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  return enviarTemplate(
    influencer.telefono,
    'feedback_contenido_brujeria',
    [nombre, String(Math.round(score)), nivel]
  );
}

// Celebración al subir de nivel
// Template: subida_nivel_brujeria
// Variables: {{1}} nombre, {{2}} nombre del nuevo nivel
async function enviarCelebracionNivel(influencer, nivelNuevo) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  return enviarTemplate(
    influencer.telefono,
    'subida_nivel_brujeria',
    [nombre, nivelNuevo]
  );
}

// Notificación al aprobar solicitud de reenvío
// Template: reenvio_aprobado (pendiente crear en Meta)
// Variables: {{1}} nombre
async function enviarReenvioAprobado(telefono, nombre) {
  const primerNombre = nombre?.split(' ')[0] || nombre;
  return enviarTemplate(telefono, 'reenvio_aprobado', [primerNombre]);
}

// Encuesta de productos favoritos (antes de preparar el kit)
// Template: encuesta_productos_brujeria (pendiente aprobación Meta)
// Variables: {{1}} nombre
// Botón CTA apunta al Tally de preferencias de productos
async function enviarEncuestaProductos(influencer) {
  // Sin variable en el cuerpo — solo botón URL dinámico con el teléfono
  const tel = normalizarTelefono(influencer.telefono) || '';
  return enviarTemplate(influencer.telefono, 'encuesta_productos_brujeria', [], tel);
}

// Re-enganche de creadoras antiguas para nuevo envío de producto
// Template: reenganche_brujeria (pendiente aprobación Meta)
// Variables: {{1}} nombre
async function enviarReenganche(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  return enviarTemplate(influencer.telefono, 'reenganche_brujeria', [nombre]);
}

// Confirmación de llegada del paquete (botón URL → portal)
// Template: confirmacion_kit_influencers
// Variables: {{1}} nombre
async function enviarConfirmacionLlegada(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  return enviarTemplate(influencer.telefono, 'confirmacion_kit_influencers', [nombre]);
}

// Seguimiento 2 días después de confirmar llegada
// Template: seguimiento_productos_brujeria (pendiente crear en Meta)
// Variables: {{1}} nombre
async function enviarSeguimientoProductos(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  return enviarTemplate(influencer.telefono, 'seguimiento_productos_brujeria', [nombre]);
}

module.exports = {
  enviarBienvenidaKit,
  enviarRecordatorioWhatsApp,
  enviarBienvenidaClub,
  enviarFeedbackContenido,
  enviarCelebracionNivel,
  enviarIdeasContenido,
  enviarReenvioAprobado,
  enviarReenganche,
  enviarEncuestaProductos,
  enviarConfirmacionLlegada,
  enviarSeguimientoProductos,
};
