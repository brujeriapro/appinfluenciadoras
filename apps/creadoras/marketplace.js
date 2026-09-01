// Lee las creadoras que Brujería Capilar vinculó a una campaña en Creators
// Manager, y las trae al Programa Creadoras.
//
// ── Por qué este módulo vive acá y no en el marketplace ────────────────────
//
// Porque esto es una necesidad de Brujería Capilar, no del marketplace.
// Creators Manager es un producto aparte que le sirve a cualquier marca: si
// tuviera un botón de "mandar al Programa Creadoras", sería funcionalidad de
// una sola clienta metida en el producto de todas — y habría que explicarle a
// las demás marcas por qué existe un botón que no pueden usar.
//
// Invirtiendo la dirección, el marketplace no se entera de que esto existe.
// Brujería usa sus campañas como cualquier marca; el Programa lee lo que
// quedó vinculado. Las dos bases son la misma, así que leer no cuesta nada.
//
// ── Qué NO hace ────────────────────────────────────────────────────────────
//
// No copia creadoras al Programa en silencio. Crea el registro como
// «Prospectada» y devuelve la invitación para que se le mande: son dos marcas
// distintas, y para despachar un kit hace falta la dirección de envío, que el
// marketplace no pide nunca. Sin invitación no hay dirección, y sin dirección
// no hay kit.

const { supabaseGet, supabasePost, supabasePatch } = require('./supabase');
const config = require('./config');

/** El id de Brujería Capilar como marca dentro de Creators Manager. */
const MARCA_ID = process.env.MK_MARCA_ID || '310fde10-f81c-45da-b66a-883ada6423c9';

/** A dónde se manda a completar los datos que el marketplace no tiene. */
const FORMULARIO = process.env.TALLY_REGISTRO_URL
  || config.tally_registro_url
  || 'https://tally.so/r/9qlKZ1';

/** Estado con el que nace en el Programa. Ya existe y ya se usa. */
const ESTADO_INICIAL = 'Prospectada';

/** Las campañas que Brujería tiene en el marketplace. */
async function campanas() {
  const filas = await supabaseGet('mk_campanas', {
    marca_id: `eq.${MARCA_ID}`,
    select: 'id,nombre,estado,cupos,created_at,fecha_fin',
    order: 'created_at.desc',
  });
  return filas;
}

/**
 * Las creadoras vinculadas a una campaña.
 *
 * Se cuentan las que aceptaron o quedaron confirmadas, no las simplemente
 * invitadas: alguien a quien se le propuso y no contestó no está vinculada a
 * nada, y mandarle un kit por eso sería regalarle producto a quien ya dijo que
 * no con su silencio.
 */
async function creadorasDeCampana(campana_id) {
  const invitaciones = await supabaseGet('mk_campana_invitacion', {
    campana_id: `eq.${campana_id}`,
    estado: 'in.(acepto,confirmada)',
    select: 'creadora_id,estado',
  });
  if (!invitaciones.length) return [];

  const ids = invitaciones.map(i => i.creadora_id);
  const creadoras = await supabaseGet('mk_creadoras', {
    id: `in.(${ids.join(',')})`,
    select: 'id,nombre_publico,email,whatsapp,ciudad,departamento,influencer_id,codigo',
  });

  // Los handles viven aparte, no en el catálogo: es lo que mantiene oculta la
  // identidad para las marcas que solo miran.
  const redes = await supabaseGet('mk_creadora_redes', {
    creadora_id: `in.(${ids.join(',')})`,
    select: 'creadora_id,red,handle,seguidores',
  }).catch(() => []);

  return creadoras.map(c => {
    const suyas = redes.filter(r => r.creadora_id === c.id);
    const de = (red) => suyas.find(r => r.red === red) || {};
    return {
      ...c,
      instagram: de('instagram').handle || null,
      tiktok: de('tiktok').handle || null,
      seguidores_instagram: de('instagram').seguidores || null,
      seguidores_tiktok: de('tiktok').seguidores || null,
      estado_invitacion: invitaciones.find(i => i.creadora_id === c.id)?.estado,
      ya_en_programa: Boolean(c.influencer_id),
    };
  });
}

/**
 * Busca a alguien en el Programa por los mismos caminos que el webhook de
 * Tally: correo, Instagram, TikTok, teléfono, en ese orden.
 *
 * Se repite el mismo orden a propósito. Si acá buscáramos distinto, una
 * persona podría no encontrarse ahora y sí al llenar el formulario —o al
 * revés— y terminaríamos con dos registros suyos.
 */
async function buscarEnPrograma({ email, instagram, tiktok, telefono }) {
  const limpio = (h) => (h || '').replace('@', '').trim() || null;
  const intentos = [
    email     && { email: `eq.${String(email).toLowerCase().trim()}` },
    instagram && { instagram_handle: `eq.${limpio(instagram)}` },
    tiktok    && { tiktok_handle: `eq.${limpio(tiktok)}` },
    telefono  && { telefono: `eq.${telefono}` },
  ].filter(Boolean);

  for (const filtro of intentos) {
    const r = await supabaseGet('influencers', { ...filtro, select: '*', limit: 1 }).catch(() => []);
    if (r.length) return r[0];
  }
  return null;
}

/**
 * Trae una creadora del marketplace al Programa.
 *
 * Tres finales posibles y los tres son legítimos: ya estaba enlazada, existía
 * sin enlazar (se enlaza), o es nueva (se crea como Prospectada). Distinguirlos
 * importa porque solo el tercero necesita que se le escriba.
 */
async function traer(creadora) {
  if (creadora.influencer_id) {
    return { ok: true, yaEstaba: true, influencer_id: creadora.influencer_id,
             motivo: 'ya estaba en el Programa' };
  }

  const datos = {
    email: creadora.email,
    instagram: creadora.instagram,
    tiktok: creadora.tiktok,
    telefono: creadora.whatsapp,
  };

  const existente = await buscarEnPrograma(datos);
  if (existente) {
    await supabasePatch('mk_creadoras', { id: creadora.id },
      { influencer_id: existente.id });
    return { ok: true, yaEstaba: true, influencer_id: existente.id,
             motivo: 'ya estaba en el Programa, sin enlazar' };
  }

  if (!creadora.email) {
    return { ok: false, motivo: 'no tiene correo: sin eso no hay a dónde invitarla' };
  }

  const creada = await supabasePost('influencers', {
    nombre: creadora.nombre_publico,
    email: String(creadora.email).toLowerCase().trim(),
    telefono: creadora.whatsapp || null,
    instagram_handle: (creadora.instagram || '').replace('@', '').trim() || null,
    tiktok_handle: (creadora.tiktok || '').replace('@', '').trim() || null,
    seguidores_instagram: creadora.seguidores_instagram,
    seguidores_tiktok: creadora.seguidores_tiktok,
    ciudad: creadora.ciudad || null,
    departamento: creadora.departamento || null,
    status: ESTADO_INICIAL,
    fuente: 'creators-manager',
    fecha_contacto: new Date().toISOString(),
  });

  const nueva = Array.isArray(creada) ? creada[0] : creada;
  await supabasePatch('mk_creadoras', { id: creadora.id },
    { influencer_id: nueva.id });

  return {
    ok: true, creada: true, influencer_id: nueva.id,
    invitacion: invitacion(creadora.nombre_publico),
  };
}

/**
 * El texto de la invitación.
 *
 * ⚠️ Dice con todas las letras que somos otra marca y de dónde salió su
 * contacto. Ella se registró en Creators Manager, no acá: recibir de golpe un
 * mensaje de una marca que no conoce, en el correo que dio para otra cosa, es
 * la forma más rápida de que desconfíe de las dos.
 */
function invitacion(nombre) {
  return {
    asunto: 'Te queremos mandar un kit — Brujería Capilar',
    cuerpo:
`Hola ${nombre || ''},

Te escribimos de Brujería Capilar, una marca colombiana de cuidado capilar. Te encontramos en Creators Manager, donde estás registrada como creadora.

Tenemos un programa donde te mandamos productos sin costo para que los pruebes y, si te gustan, hagas contenido con ellos. No es un trato pago ni tiene obligación: si el producto no te convence, no publicas y no pasa nada.

Si te interesa, completa tus datos acá para que podamos despacharte:
${FORMULARIO}

Necesitamos tu dirección de envío y un par de datos sobre tu cabello, para mandarte lo que de verdad te sirva.

Si no te interesa, ignora este mensaje y no te volvemos a escribir por este tema.`,
  };
}

module.exports = {
  campanas, creadorasDeCampana, traer, buscarEnPrograma, invitacion,
  MARCA_ID, FORMULARIO, ESTADO_INICIAL,
};
