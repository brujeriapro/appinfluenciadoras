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

// Confirmación de llegada del paquete (botón URL → /bienvenida-kit?tel=...)
// Template: confirmacion_kit_influencers
// Variables: {{1}} nombre | botón URL variable: teléfono normalizado
async function enviarConfirmacionLlegada(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  const tel = normalizarTelefono(influencer.telefono) || '';
  return enviarTemplate(influencer.telefono, 'confirmacion_llegada_influencers', [nombre], tel);
}

// Seguimiento 7 días después de confirmar llegada
// Template: seguimiento_productos_brujeria (pendiente crear en Meta)
// Variables: {{1}} nombre | botón URL estático → form de reporte de contenido
async function enviarSeguimientoProductos(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre;
  return enviarTemplate(influencer.telefono, 'seguimiento_productos_brujeria', [nombre]);
}

// Bienvenida programa UGC para leads externos (Meta Lead Ads) — Mensaje 1
// Template: ugc_bienvenida_creadoras · Variables: {{1}} nombre
async function enviarUGCBienvenida(telefono, nombre) {
  const primerNombre = nombre?.split(' ')[0] || nombre || 'creadora';
  return enviarTemplate(telefono, 'ugc_bienvenida_creadoras', [primerNombre]);
}

// Confirmación de registro UGC — se envía al completar el formulario
// Template: ugc_confirmacion_registro · Variables: {{1}} nombre · {{2}} código UGC
async function enviarUGCConfirmacionRegistro(telefono, nombre, codigo) {
  const primerNombre = nombre?.split(' ')[0] || nombre || 'creadora';
  return enviarTemplate(telefono, 'ugc_confirmacion_registro', [primerNombre, codigo]);
}

// Acuerdo de colaboración — link para llenar datos y firmar
// Template: acuerdo_creadoras_brujeria · Variables: {{1}} nombre
// Botón URL dinámico → /acuerdo?id={{1}} (base configurada en Meta, variable = id de la creadora)
async function enviarAcuerdo(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  return enviarTemplate(influencer.telefono, 'acuerdo_creadoras_brujeria', [nombre], influencer.id);
}

// Onboarding Día 0 — el regalo va en camino (se envía al crear el pedido)
// Template: regalo_en_camino_brujeria · Variables: {{1}} nombre · Botón URL estático → /guia-ugc
async function enviarRegaloEnCamino(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  return enviarTemplate(influencer.telefono, 'regalo_en_camino_brujeria', [nombre]);
}

// ── Secuencia de onboarding de ventas (cron diario) ────────────────────────
// Día 3 — ¿ya te llegó? ábrelo grabando · Template: regalo_llego_brujeria · {{1}} nombre
async function enviarRegaloLlego(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  return enviarTemplate(influencer.telefono, 'regalo_llego_brujeria', [nombre]);
}
// Día 4 — 3 ideas para grabar · Template: ideas_video_brujeria · {{1}} nombre · Botón → /guia-ugc
async function enviarIdeasVideo(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  return enviarTemplate(influencer.telefono, 'ideas_video_brujeria', [nombre]);
}
// Día 6 — checklist al publicar · Template: checklist_publicar_brujeria · {{1}} nombre
async function enviarChecklistPublicar(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  return enviarTemplate(influencer.telefono, 'checklist_publicar_brujeria', [nombre]);
}
// Día 9 — vender más · Template: vender_mas_brujeria · {{1}} nombre
async function enviarVenderMas(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  return enviarTemplate(influencer.telefono, 'vender_mas_brujeria', [nombre]);
}
// Día 15 — cierre + portal · Template: cierre_quincena_brujeria · {{1}} nombre · Botón → /influencer
async function enviarCierreQuincena(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  return enviarTemplate(influencer.telefono, 'cierre_quincena_brujeria', [nombre]);
}
// Recordar código UGC + pedir que reporten si ya publicaron
// Template: recordar_codigo_reportar_brujeria · {{1}} nombre · {{2}} código · botón URL estático → form de reporte
async function enviarRecordarCodigoReportar(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  const codigo = influencer.codigo_ugc || influencer.codigo_descuento || 'tu código';
  return enviarTemplate(influencer.telefono, 'recordar_codigo_reportar_brujeria', [nombre, codigo]);
}

// Cupón aún sin usar (0 ventas) · Template: cupon_sin_usar_brujeria · {{1}} nombre · {{2}} código
// El cupón real que funciona en Shopify vive en codigo_descuento; codigo_ugc casi siempre está vacío.
async function enviarCuponSinUsar(influencer) {
  const nombre = influencer.nombre?.split(' ')[0] || influencer.nombre || 'creadora';
  const codigo = influencer.codigo_descuento || influencer.codigo_ugc || 'tu código';
  return enviarTemplate(influencer.telefono, 'cupon_sin_usar_brujeria', [nombre, codigo]);
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
  enviarUGCBienvenida,
  enviarUGCConfirmacionRegistro,
  enviarAcuerdo,
  enviarRegaloEnCamino,
  enviarRegaloLlego,
  enviarIdeasVideo,
  enviarChecklistPublicar,
  enviarVenderMas,
  enviarCierreQuincena,
  enviarCuponSinUsar,
  enviarRecordarCodigoReportar,
};
