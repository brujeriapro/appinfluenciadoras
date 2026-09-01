// El envío del agente de prospección.
//
// Junta las tres piezas que ya existen —las reglas (prospeccion.js), los
// textos (prospeccion-mensajes.js) y el correo (correo.js)— y las convierte en
// mensajes que salen.
//
// ── Lo que este módulo tiene que garantizar ────────────────────────────────
//
// 1. Nunca escribirle a quien pidió que no. Se pregunta acá otra vez aunque
//    `tandaDelDia` ya lo filtre: es la última puerta antes de que salga algo,
//    y una guarda repetida cuesta menos que una disculpa.
// 2. Registrar SIEMPRE, salga bien o mal. Un mensaje que falló y no quedó
//    escrito se pierde en silencio, y nadie lo reintenta.
// 3. Nunca mandar dos veces el mismo toque. El unique de (prospecto_id, toque)
//    lo garantiza en la base; acá se comprueba antes para no gastar el envío.

const db = require('./db');
const correo = require('./correo');
const prosp = require('./prospeccion');
const mensajes = require('./prospeccion-mensajes');

/** El cuerpo en texto plano se vuelve HTML simple, sin plantilla de boletín.
 *  Un correo de prospección con cabecera de diseño se lee como publicidad. */
function aHTML(texto) {
  const esc = (t) => String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const cuerpo = esc(texto)
    .split('\n\n')
    .map(p => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px">${cuerpo}</div>`;
}

/**
 * Manda el toque que le corresponda a un prospecto.
 *
 * Devuelve qué pasó y por qué, siempre — incluido cuando decide no mandar.
 * Que el "no" venga explicado es lo que permite auditar después por qué el
 * agente no le escribió a alguien.
 */
async function enviarToque(prospecto, { hoy = new Date(), forzar = null } = {}) {
  // Última puerta. `tandaDelDia` ya lo filtró, pero esta es la que está justo
  // antes del envío.
  if (prospecto.no_contactar) {
    return { ok: false, salto: true, motivo: 'pidió que no le escribamos' };
  }

  const t = forzar
    ? { toca: true, toque: forzar.toque, tipo: forzar.tipo }
    : prosp.toqueQueToca(prospecto, hoy);

  if (!t.toca) return { ok: false, salto: true, motivo: t.motivo };

  // ¿Ya salió este toque? El unique de la base lo impediría, pero comprobarlo
  // acá evita gastar el envío y ensuciar el log del proveedor.
  const previos = await db.get('mk_prospecto_toques', {
    prospecto_id: `eq.${prospecto.id}`, toque: `eq.${t.toque}`, select: 'id',
  }).catch(() => []);
  if (previos.length) {
    return { ok: false, salto: true, motivo: `el toque ${t.toque} ya había salido` };
  }

  let asunto = null, cuerpo = null;
  try {
    if (prospecto.canal === 'whatsapp') {
      cuerpo = mensajes.paraWhatsApp(prospecto);
    } else {
      const m = mensajes.redactar(t.tipo, prospecto);
      asunto = m.asunto;
      cuerpo = m.cuerpo;
    }
  } catch (e) {
    // Pasa cuando falta la razón concreta. No es un error del envío: es que el
    // prospecto no está listo, y mandarle algo genérico sería peor.
    return { ok: false, salto: true, motivo: e.message };
  }

  // Los canales que no se automatizan quedan escritos y esperando una mano.
  const automatico = prosp.CANALES[prospecto.canal]?.automatico;
  if (!automatico) {
    await db.post('mk_prospecto_toques', {
      prospecto_id: prospecto.id, toque: t.toque, tipo: t.tipo,
      canal: prospecto.canal, asunto, cuerpo, enviado_at: null, ok: null,
    });
    return { ok: true, enCola: true, toque: t.toque, motivo: 'listo para que una persona lo mande' };
  }

  let salio = false, error = null;
  try {
    if (prospecto.canal === 'correo') {
      if (!prospecto.email) throw new Error('sin correo');
      const r = await correo.enviar({
        para: prospecto.email,
        asunto,
        html: aHTML(cuerpo),
        remitente: mensajes.REMITENTE,
      });
      salio = Boolean(r?.ok ?? true);
      if (!salio) error = r?.error || 'el proveedor no confirmó';
    } else {
      throw new Error(`canal "${prospecto.canal}" sin envío automático`);
    }
  } catch (e) {
    error = e.message;
  }

  // Se registra pase lo que pase: un mensaje que falló y no quedó escrito es
  // uno que nadie va a reintentar.
  await db.post('mk_prospecto_toques', {
    prospecto_id: prospecto.id, toque: t.toque, tipo: t.tipo,
    canal: prospecto.canal, asunto, cuerpo,
    enviado_at: new Date().toISOString(), ok: salio, error,
  }).catch(() => {});

  if (salio) {
    const ahora = new Date().toISOString();
    await db.patch('mk_prospectos', { id: prospecto.id }, {
      estado: 'contactado',
      toques_enviados: (Number(prospecto.toques_enviados) || 0) + 1,
      primer_toque_at: prospecto.primer_toque_at || ahora,
      ultimo_toque_at: ahora,
      updated_at: ahora,
    }).catch(() => {});
  }

  return { ok: salio, toque: t.toque, error };
}

/**
 * La tanda del día completa.
 *
 * Corre en serie a propósito: veinte correos saliendo a la vez se parecen más
 * a un envío masivo que a una persona escribiendo, y algunos proveedores lo
 * puntúan distinto.
 */
async function correrTanda({ hoy = new Date(), soloIds = null, limite = null } = {}) {
  const cfg = await db.getConfig();
  const conf = cfg.prospeccion || {};

  if (conf.activa !== true && !soloIds) {
    return { corrio: false, motivo: 'la prospección está apagada (mk_config.prospeccion.activa)' };
  }

  const todos = await db.get('mk_prospectos', {
    select: '*', no_contactar: 'is.false', order: 'puntaje.desc',
  });

  const candidatos = soloIds
    ? todos.filter(p => soloIds.includes(p.id))
    : todos;

  const { salen, enCola, aplazados } = prosp.tandaDelDia(candidatos, {
    hoy,
    topes: {
      correo: conf.tope_correo_dia,
      whatsapp: conf.tope_whatsapp_dia,
      instagram: conf.tope_instagram_dia,
      linkedin: conf.tope_linkedin_dia,
    },
  });

  const porMandar = limite ? salen.slice(0, limite) : salen;
  const resultados = [];

  for (const c of porMandar) {
    const r = await enviarToque(c.prospecto, { hoy, forzar: { toque: c.toque, tipo: c.tipo } });
    resultados.push({ nombre: c.prospecto.nombre, ...r });
  }

  // Los de canal manual se preparan igual: quedan listos en la cola.
  for (const c of enCola) {
    const r = await enviarToque(c.prospecto, { hoy, forzar: { toque: c.toque, tipo: c.tipo } });
    resultados.push({ nombre: c.prospecto.nombre, ...r });
  }

  return {
    corrio: true,
    enviados: resultados.filter(r => r.ok && !r.enCola).length,
    enCola: resultados.filter(r => r.enCola).length,
    fallidos: resultados.filter(r => !r.ok && !r.salto).length,
    saltados: resultados.filter(r => r.salto).length,
    aplazados: aplazados.length,
    detalle: resultados,
  };
}

module.exports = { enviarToque, correrTanda, aHTML };
