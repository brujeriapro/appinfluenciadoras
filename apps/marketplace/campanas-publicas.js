// Las reglas de una campaña abierta: a quién le llega, qué cuesta y qué pasa
// con quien se postula y no queda.
//
// La diferencia con una campaña normal es de quién arranca. En la normal la
// marca elige a ciegas entre 294 perfiles y las invita; en la abierta publica
// lo que necesita, le llega a quienes encajan, y elige entre las que dijeron
// que sí. Es la misma tabla y el mismo trato al final — cambia el origen.
//
// Todo acá es puro: recibe estado y devuelve qué pasa. Decide a quién se le
// escribe y cuánta plata del plan se consume, así que tiene que poder probarse
// con casos concretos.

const { alcanzaElPlan } = require('./cupos');

/**
 * Cuánto dura abierta una campaña si la marca no dice otra cosa.
 *
 * Una semana es lo que aguanta el interés de una creadora que vio el correo:
 * más largo y se le olvida, más corto y la que abre el correo el martes ya no
 * alcanza.
 */
const DIAS_ABIERTA = 7;

/**
 * Cuántas creadoras como máximo reciben el correo de una campaña.
 *
 * No es un límite técnico, es de atención: una creadora que recibe cinco
 * campañas que no le sirven deja de abrir la sexta, y ahí perdimos el canal
 * para siempre. Con el tope de correos del día en 60, además, mandar más de
 * esto reparte una sola campaña en varios días y las últimas llegan cuando ya
 * se llenaron los cupos.
 */
const MAX_DESTINATARIAS = 60;

/**
 * ¿A quién le llega esta campaña?
 *
 * Se cruza por nicho y ciudad, y **un dato que falta no descarta**: es la misma
 * regla de la selección curada, y por la misma razón — que el perfil esté a
 * medias es culpa nuestra, no de ella, y dejarla fuera de las ofertas por eso
 * la castiga dos veces.
 *
 * "Toda Colombia" en la campaña significa que no filtra por ciudad.
 */
function aQuienLeLlega(creadoras = [], campana = {}) {
  const nichos = (campana.busca_nicho || []).map(n => String(n).toLowerCase());
  const ciudades = (campana.busca_ciudades || []).filter(c => c !== 'Toda Colombia');
  const todoElPais = !ciudades.length;

  const califica = (c) => {
    if (nichos.length) {
      const suyo = [...(c.nicho || []), ...(c.categorias || [])].join(' ').toLowerCase();
      // Sin nicho declarado no se descarta: entra y que decida ella.
      if (suyo && !nichos.some(n => suyo.includes(n) || n.includes(suyo))) return false;
    }
    if (!todoElPais && c.ciudad) {
      if (!ciudades.some(x => String(x).toLowerCase() === String(c.ciudad).toLowerCase())) return false;
    }
    return true;
  };

  const encajan = creadoras.filter(califica);
  return {
    encajan,
    cuantas: encajan.length,
    // Lo que de verdad se manda hoy, que puede ser menos.
    destinatarias: encajan.slice(0, MAX_DESTINATARIAS),
    recortadas: Math.max(0, encajan.length - MAX_DESTINATARIAS),
  };
}

/**
 * ¿Puede publicar esta campaña, y qué le cuesta?
 *
 * Publicar cobra los cupos POR ADELANTADO: una campaña de 6 cupos consume 6
 * propuestas del plan en el momento de publicar, no cuando alguien acepta.
 * Decisión de María (28-ago-2026).
 *
 * Es más simple de explicar —"una campaña de 6 te cuesta 6"— y evita que una
 * marca con 3 propuestas abra una campaña de 20 cupos que no puede pagar. El
 * costo de cobrar antes es que quien publica y no recibe postulaciones perdería
 * propuestas por nada; eso lo arregla `alCerrar`, que devuelve las que
 * quedaron sin usar.
 */
function puedePublicar({ campana = {}, plan = {} }) {
  const cupos = Number(campana.cupos || 0);

  if (cupos < 1) {
    return { ok: false, motivo: 'La campaña necesita al menos un cupo.' };
  }
  if (!campana.brief_base || !String(campana.brief_base).trim()) {
    return {
      ok: false,
      motivo: 'Sin brief no se puede publicar: es lo único que una creadora tiene '
            + 'para decidir si le sirve.',
    };
  }
  if (!Number(campana.monto_creadora)) {
    return {
      ok: false,
      motivo: 'Ponle el monto por creadora. Una convocatoria sin plata dicha no se '
            + 'responde, y las que responden lo hacen esperando otra cosa.',
    };
  }

  const alcanza = alcanzaElPlan({
    tope: plan.propuestas_tope,
    enviadas: plan.propuestas_enviadas || 0,
    cuantas: cupos,
  });
  if (!alcanza.alcanza) {
    // Mensaje propio: el de `alcanzaElPlan` habla de invitar, y acá no se está
    // invitando a nadie — se está abriendo una convocatoria. Leer "invitar a 3
    // creadoras" cuando uno le dio a publicar deja a la marca sin entender qué
    // fue lo que no se pudo hacer.
    const r = alcanza.restantes;
    return {
      ok: false,
      restantes: r,
      motivo: r === 0
        ? `Ya usaste las propuestas de tu plan este mes. Una convocatoria cuesta una `
          + `propuesta por cupo, así que necesitas ${cupos}.`
        : `Una convocatoria de ${cupos} cupos cuesta ${cupos} propuestas y te `
          + `queda${r === 1 ? '' : 'n'} ${r}. Bájale a ${r} cupo${r === 1 ? '' : 's'} `
          + `o cambia de plan.`,
    };
  }

  return { ok: true, consume: cupos, restantes: alcanza.restantes };
}

/**
 * ¿Puede postularse esta creadora?
 *
 * Postularse es gratis para ella y no consume nada de la marca: lo que la marca
 * ya pagó son los cupos. Lo que se cuida acá es que no se postule a algo que ya
 * no existe, porque una postulación que nunca iba a llegar a ningún lado es
 * peor que no ver la campaña.
 */
function puedePostularse({ campana = {}, yaPostulada = false, invitaciones = [], ahora = new Date() }) {
  if (yaPostulada) {
    return { ok: false, motivo: 'Ya te postulaste a esta campaña.' };
  }
  if (!campana.publica) {
    return { ok: false, motivo: 'Esta campaña no está abierta a postulaciones.' };
  }
  if (campana.estado && !['activa', 'publicada'].includes(campana.estado)) {
    return { ok: false, motivo: 'Esta campaña ya cerró.' };
  }
  if (campana.postulaciones_hasta && new Date(campana.postulaciones_hasta) <= ahora) {
    return { ok: false, motivo: 'Se cerraron las postulaciones de esta campaña.' };
  }

  const confirmadas = invitaciones.filter(i => i.estado === 'confirmada').length;
  if (confirmadas >= Number(campana.cupos || 0)) {
    return { ok: false, motivo: 'Ya se llenaron los cupos de esta campaña.' };
  }

  return { ok: true };
}

/**
 * Cómo va la convocatoria, en las cifras que la marca necesita para decidir.
 */
function estadoDeConvocatoria(campana = {}, invitaciones = [], ahora = new Date()) {
  const cupos = Number(campana.cupos || 0);
  const postuladas = invitaciones.filter(i => i.origen === 'postulacion');
  const confirmadas = invitaciones.filter(i => i.estado === 'confirmada');
  const libres = Math.max(0, cupos - confirmadas.length);

  const cerrada = Boolean(
    campana.postulaciones_hasta && new Date(campana.postulaciones_hasta) <= ahora
  ) || libres === 0;

  return {
    cupos,
    postuladas: postuladas.length,
    // Las que esperan respuesta: se postularon y todavía no fueron elegidas.
    esperando: postuladas.filter(i => i.estado === 'postulada').length,
    confirmadas: confirmadas.length,
    libres,
    cerrada,
    // Se dice en positivo aunque no haya nadie: "0 postulaciones" con el plazo
    // corriendo es información, no un fracaso.
    resumen: postuladas.length === 0
      ? (cerrada ? 'Nadie se postuló.' : 'Todavía no se ha postulado nadie.')
      : `${postuladas.length} postulada${postuladas.length === 1 ? '' : 's'} · `
        + `${libres} cupo${libres === 1 ? '' : 's'} por llenar`,
  };
}

/**
 * Al cerrar la campaña: qué propuestas se devuelven y a quién hay que avisarle.
 *
 * **Se devuelven los cupos que quedaron sin llenar.** Se cobró por adelantado
 * sobre una expectativa, y quedarse con la plata de un cupo que nadie ocupó
 * sería cobrar por un servicio que no se prestó — además de castigar justo a
 * quien se anima a probar la campaña abierta.
 *
 * A las que se postularon y no quedaron se les avisa. No se les dice quién
 * quedó ni por qué: no hay señalamiento negativo en este producto, y "no te
 * eligieron" sin más es información que no le sirve a nadie.
 */
function alCerrar({ campana = {}, invitaciones = [] }) {
  const cupos = Number(campana.cupos || 0);
  const confirmadas = invitaciones.filter(i => i.estado === 'confirmada').length;
  const devolver = Math.max(0, cupos - confirmadas);

  const sinCupo = invitaciones.filter(
    i => i.origen === 'postulacion' && i.estado === 'postulada'
  );

  return {
    devolver,
    confirmadas,
    avisar: sinCupo.map(i => i.creadora_id),
    mensaje: devolver
      ? `Se llenaron ${confirmadas} de ${cupos} cupos. Te devolvemos `
        + `${devolver} propuesta${devolver === 1 ? '' : 's'} al plan.`
      : 'Se llenaron todos los cupos.',
  };
}

module.exports = {
  aQuienLeLlega, puedePublicar, puedePostularse, estadoDeConvocatoria, alCerrar,
  DIAS_ABIERTA, MAX_DESTINATARIAS,
};
