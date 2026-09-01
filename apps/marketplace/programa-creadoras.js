// El puente entre Creators Manager y el Programa Creadoras de Brujería Capilar.
//
// Sirve para que la marca elija creadoras en el catálogo del marketplace y las
// invite a su programa de gifting, en vez de buscarlas por fuera y volver a
// pedirles todo.
//
// ── Por qué es una invitación y no una copia ───────────────────────────────
//
// Son dos marcas distintas y así está escrito en las reglas del proyecto:
// Creators Manager no se cuelga de Brujería Capilar. La política de datos de la
// plataforma dice que los datos se usan para operar el marketplace, y meter a
// alguien al programa de otra marca es un uso distinto.
//
// Además, aunque quisiéramos copiarla, no se puede: para despachar un kit hace
// falta la DIRECCIÓN DE ENVÍO, que el marketplace no pide nunca. Un registro
// creado a la fuerza queda sin poder despacharse.
//
// Entonces: se crea como «Prospectada», se le manda una invitación, y ella
// completa lo que falta en el formulario que ya existe.
//
// ── Por qué no hay que construir formulario nuevo ──────────────────────────
//
// El webhook de registro del Programa (`/api/webhooks/registro` en
// apps/creadoras) ya busca por correo, TikTok, Instagram y teléfono ANTES de
// crear. Así que una influencer creada acá como «Prospectada» se completa sola
// cuando ella llena el formulario: la encuentra por correo y la actualiza, sin
// duplicar. Ese dedupe ya estaba resuelto y sería un error rehacerlo.

const db = require('./db');

/** Estado con el que nace: existe en el Programa y ya se usa. */
const ESTADO_INICIAL = 'Prospectada';

/**
 * La configuración del puente.
 *
 * `marca_id` es la única marca autorizada a invitar al Programa. No es un
 * detalle: sin eso, cualquier marca del marketplace podría meter creadoras al
 * programa de gifting de otra.
 */
async function config() {
  const cfg = await db.getConfig();
  const c = cfg.programa_creadoras || {};
  return {
    activo: c.activo === true,
    marca_id: c.marca_id || null,
    formulario_url: c.formulario_url || null,
    nombre_programa: c.nombre_programa || 'el Programa Creadoras de Brujería Capilar',
  };
}

/** ¿Esta marca puede invitar al Programa? */
async function puedeInvitar(marca_id) {
  const c = await config();
  if (!c.activo) return { puede: false, motivo: 'el puente con el Programa está apagado' };
  if (!c.marca_id) return { puede: false, motivo: 'no hay una marca autorizada configurada' };
  if (c.marca_id !== marca_id) return { puede: false, motivo: 'esta marca no opera el Programa' };
  if (!c.formulario_url) return { puede: false, motivo: 'falta el enlace del formulario de registro' };
  return { puede: true, config: c };
}

/**
 * Busca a la creadora en el Programa por los mismos caminos que usa el webhook
 * de Tally: correo, Instagram, TikTok, teléfono.
 *
 * Se repite ese orden a propósito. Si acá buscáramos distinto, una creadora
 * podría no encontrarse ahora y sí después —o al revés— y terminaríamos con
 * dos registros de la misma persona, que es justo lo que ese orden evita.
 */
async function buscarEnPrograma({ email, instagram, tiktok, telefono }) {
  const limpio = (h) => (h || '').replace('@', '').trim() || null;

  const intentos = [
    email    && { email: `eq.${String(email).toLowerCase().trim()}` },
    instagram && { instagram_handle: `eq.${limpio(instagram)}` },
    tiktok   && { tiktok_handle: `eq.${limpio(tiktok)}` },
    telefono && { telefono: `eq.${telefono}` },
  ].filter(Boolean);

  for (const filtro of intentos) {
    const r = await db.get('influencers', { ...filtro, select: '*', limit: 1 }).catch(() => []);
    if (r.length) return r[0];
  }
  return null;
}

/**
 * Lo que sabemos de la creadora, reunido de las tres tablas donde vive.
 *
 * El correo y los handles no están en el catálogo público: viven en
 * `mk_creadoras` y `mk_creadora_redes`. Se leen acá porque invitar exige
 * saber a dónde escribir, no porque se vayan a mostrar.
 */
async function datosDeCreadora(creadora_id) {
  const [creadora, redes] = await Promise.all([
    db.getUno('mk_creadoras', { id: `eq.${creadora_id}`, select: '*' }),
    db.get('mk_creadora_redes', { creadora_id: `eq.${creadora_id}`, select: 'red,handle,seguidores' })
      .catch(() => []),
  ]);
  if (!creadora) return null;

  const de = (red) => redes.find(r => r.red === red) || {};
  return {
    creadora,
    nombre: creadora.nombre_publico,
    email: creadora.email,
    telefono: creadora.whatsapp,
    ciudad: creadora.ciudad,
    departamento: creadora.departamento,
    instagram: de('instagram').handle,
    tiktok: de('tiktok').handle,
    seguidores_instagram: de('instagram').seguidores || null,
    seguidores_tiktok: de('tiktok').seguidores || null,
  };
}

/**
 * Invita a una creadora al Programa.
 *
 * Devuelve siempre qué pasó y por qué. Los tres finales posibles son
 * legítimos y hay que distinguirlos: se creó, ya estaba, o no se pudo.
 */
async function invitar(creadora_id, { marca_id }) {
  const permiso = await puedeInvitar(marca_id);
  if (!permiso.puede) return { ok: false, motivo: permiso.motivo };

  const d = await datosDeCreadora(creadora_id);
  if (!d) return { ok: false, motivo: 'no encontramos a esa creadora' };
  if (!d.email) return { ok: false, motivo: 'no tiene correo: sin eso no hay a dónde invitarla' };

  // ¿Ya está enlazada? Entonces no hay nada que crear.
  if (d.creadora.influencer_id) {
    return { ok: true, yaEstaba: true, influencer_id: d.creadora.influencer_id,
             motivo: 'ya está en el Programa' };
  }

  // ¿Existe en el Programa aunque no esté enlazada? Pasa con las que entraron
  // por Tally antes de tener cuenta en el marketplace. Se enlaza y ya.
  const existente = await buscarEnPrograma(d);
  if (existente) {
    await db.patch('mk_creadoras', { id: creadora_id }, { influencer_id: existente.id });
    return { ok: true, yaEstaba: true, influencer_id: existente.id,
             motivo: 'ya estaba en el Programa: se enlazó' };
  }

  // Nace como Prospectada, con lo que sabemos. La dirección y el tipo de
  // cabello los pone ella al llenar el formulario.
  const nueva = await db.post('influencers', {
    nombre: d.nombre,
    email: String(d.email).toLowerCase().trim(),
    telefono: d.telefono || null,
    instagram_handle: (d.instagram || '').replace('@', '').trim() || null,
    tiktok_handle: (d.tiktok || '').replace('@', '').trim() || null,
    seguidores_instagram: d.seguidores_instagram,
    seguidores_tiktok: d.seguidores_tiktok,
    ciudad: d.ciudad || null,
    departamento: d.departamento || null,
    status: ESTADO_INICIAL,
    fuente: 'creators-manager',
    fecha_contacto: new Date().toISOString(),
  });

  const influencer = Array.isArray(nueva) ? nueva[0] : nueva;
  await db.patch('mk_creadoras', { id: creadora_id }, { influencer_id: influencer.id });

  return {
    ok: true, creada: true, influencer_id: influencer.id,
    invitacion: mensajeInvitacion(d.nombre, permiso.config),
    email: d.email, telefono: d.telefono,
  };
}

/**
 * El texto de la invitación.
 *
 * ⚠️ Dice con todas las letras que es OTRA marca. La creadora se registró en
 * Creators Manager, no en Brujería Capilar, y recibir de golpe un mensaje de
 * una marca que no conoce —usando el correo que dio para otra cosa— es la
 * forma más rápida de que desconfíe de las dos.
 */
function mensajeInvitacion(nombre, cfg) {
  return {
    asunto: 'Te queremos mandar un kit — Brujería Capilar',
    cuerpo:
`Hola ${nombre || ''},

Te escribimos de Brujería Capilar, una marca colombiana de cuidado capilar. Te encontramos en el catálogo de Creators Manager, donde estás registrada.

Tenemos un programa donde te mandamos productos sin costo para que los pruebes y, si te gustan, hagas contenido con ellos. No es un trato pago ni tiene obligación: si el producto no te convence, no publicas y no pasa nada.

Si te interesa, completa tus datos acá para que podamos despacharte:
${cfg.formulario_url}

Necesitamos tu dirección de envío y un par de datos más sobre tu cabello para mandarte lo que de verdad te sirva.

Si no te interesa, ignora este mensaje y no te volvemos a escribir por este tema.`,
  };
}

module.exports = {
  config, puedeInvitar, invitar, buscarEnPrograma, datosDeCreadora,
  mensajeInvitacion, ESTADO_INICIAL,
};
