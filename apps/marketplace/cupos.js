// Las reglas de una campaña con cupos.
//
// El flujo, y dónde puede doler cada paso:
//
//   La marca escribe un brief y dice cuántas busca ("necesito 3").
//   Invita de 1 a 10 creadoras. CADA UNA consume una propuesta de su plan.
//   Las creadoras aceptan o pasan antes de la fecha límite.
//   La marca confirma entre las que aceptaron, hasta llenar los cupos.
//   Cada confirmación crea un trato y sigue el flujo normal.
//
// Las funciones de decisión de este archivo son PURAS a propósito: reciben el
// estado y devuelven qué pasa, sin tocar la base. Son las que deciden si se le
// cobra a una marca y si a una creadora le queda o no el trabajo, así que
// tienen que poder probarse con casos concretos y no a través de HTTP.

/** Cuántas se pueden invitar de una. Más que esto no es una campaña, es spam. */
const MAX_POR_TANDA = 10;

/** Lo que la marca puede elegir como plazo de respuesta. */
const HORAS_LIMITE = [48, 72];

/**
 * ¿Alcanzan las propuestas del plan para invitar a estas creadoras?
 *
 * La regla de negocio: **cada creadora invitada consume una propuesta**.
 * Invitar a ocho gasta ocho. No es negociable — sin eso el plan gratuito se
 * vuelve ilimitado en la práctica: bastaría con hacer una campaña e invitar a
 * doscientas.
 *
 * Es todo-o-nada: si pidió invitar a ocho y le quedan cinco, no se mandan
 * cinco. Una campaña a medias con tres creadoras faltantes es peor que un
 * error claro, porque la marca cree que invitó a ocho.
 */
function alcanzaElPlan({ tope, enviadas, cuantas }) {
  if (tope === null || tope === undefined) return { alcanza: true, restantes: null };

  const restantes = Math.max(0, tope - enviadas);
  if (cuantas <= restantes) return { alcanza: true, restantes };

  return {
    alcanza: false,
    restantes,
    mensaje: restantes === 0
      ? `Ya usaste las ${tope} propuestas de tu plan este mes. Cambia de plan para invitar a más.`
      : `Invitar a ${cuantas} creadoras consume ${cuantas} propuestas y te quedan ${restantes}. `
        + `Invita a ${restantes} o cambia de plan.`,
  };
}

/**
 * A quiénes se puede reinvitar gratis.
 *
 * Quien aceptó una campaña de esta marca y se quedó sin cupo no gasta
 * propuesta la próxima vez. Es la compensación que hace justo el modelo: dijo
 * que sí, se quedó esperando, y no fue culpa suya que la marca eligiera a
 * otras. Cobrarle a la marca dos veces por la misma creadora sería cobrarle
 * por su propia decisión.
 *
 * Se le promete a la marca en la pantalla de confirmar ("quedan disponibles
 * para tu próxima campaña, sin gastar propuesta otra vez"), así que si esto se
 * quita hay que quitar también esa frase.
 *
 * Solo cuenta `cupos_llenos`: quien no respondió o pasó no está esperando
 * nada, y su propuesta se consumió como cualquier otra.
 */
function reinvitablesGratis(historial = []) {
  return new Set(
    historial.filter(i => i.estado === 'cupos_llenos').map(i => i.creadora_id)
  );
}

/**
 * ¿Se puede invitar a esta tanda?
 *
 * Junta todo lo que tiene que ser cierto antes de mandar nada, para que la
 * respuesta sea un solo mensaje entendible y no tres errores seguidos.
 *
 * @param historial  invitaciones anteriores de ESTA marca, para saber a quién
 *                   se reinvita sin cobrar.
 */
function puedeInvitar({ campana, yaInvitadas = [], nuevas = [], plan = {}, historial = [] }) {
  if (!campana) return { ok: false, motivo: 'Esa campaña no existe.' };
  if (campana.estado === 'cerrada') {
    return { ok: false, motivo: 'Esta campaña está cerrada. Abrí una nueva para seguir invitando.' };
  }
  if (!campana.cupos) {
    return { ok: false, motivo: 'Esta campaña no tiene cupos: es una plantilla para propuestas individuales.' };
  }

  const limpias = [...new Set(nuevas.filter(Boolean))];
  if (!limpias.length) return { ok: false, motivo: 'No elegiste a ninguna creadora.' };

  // Invitar dos veces a la misma no es un error de la marca, es un clic
  // repetido. Se filtran en silencio en vez de rechazar toda la tanda.
  const yaEstan = new Set(yaInvitadas.map(i => i.creadora_id));
  const porInvitar = limpias.filter(id => !yaEstan.has(id));
  if (!porInvitar.length) {
    return { ok: false, motivo: 'Todas las que elegiste ya estaban invitadas a esta campaña.' };
  }

  if (porInvitar.length > MAX_POR_TANDA) {
    return { ok: false, motivo: `Se puede invitar hasta ${MAX_POR_TANDA} creadoras por tanda.` };
  }

  // Las que ya dijeron que sí y se quedaron sin cupo entran gratis.
  const gratis = reinvitablesGratis(historial);
  const cobradas = porInvitar.filter(id => !gratis.has(id));
  const sinCosto = porInvitar.filter(id => gratis.has(id));

  const plata = alcanzaElPlan({
    tope: plan.tope, enviadas: plan.enviadas || 0, cuantas: cobradas.length,
  });
  if (!plata.alcanza) return { ok: false, motivo: plata.mensaje, sinPropuestas: true };

  return { ok: true, porInvitar, consume: cobradas.length, sinCosto };
}

/**
 * Cómo va la campaña.
 *
 * Se calcula, no se guarda: un contador de cupos llenos que se actualiza a
 * mano se desincroniza el día que algo falle a medias, y entonces la campaña
 * dice que le faltan dos cuando ya las tiene.
 */
function estadoDeCampana(campana, invitaciones = [], ahora = new Date()) {
  const cuenta = (e) => invitaciones.filter(i => i.estado === e).length;

  const confirmadas = cuenta('confirmada');
  const cupos = Number(campana.cupos) || 0;
  const libres = Math.max(0, cupos - confirmadas);
  const vencida = Boolean(campana.fecha_limite_respuesta)
    && new Date(campana.fecha_limite_respuesta) <= ahora;

  return {
    cupos,
    confirmadas,
    libres,
    esperando: cuenta('invitada'),
    aceptaron: cuenta('acepto'),
    pasaron: cuenta('paso'),
    vencida,
    llena: libres === 0 && cupos > 0,
    // Se puede seguir invitando mientras queden cupos, aunque el plazo haya
    // vencido: el brief sigue siendo válido y a la marca le sirve más ampliar
    // la lista que volver a escribir todo.
    puedeInvitarMas: libres > 0 && campana.estado !== 'cerrada',
  };
}

/**
 * ¿Puede la marca confirmar a esta creadora?
 *
 * Solo se confirma a quien aceptó: confirmar a alguien que todavía no
 * respondió sería contratarla sin su sí.
 */
function puedeConfirmar({ invitacion, estado }) {
  if (!invitacion) return { ok: false, motivo: 'Esa invitación no existe.' };
  if (invitacion.estado === 'confirmada') {
    return { ok: false, motivo: 'Ya la habías confirmado.' };
  }
  if (invitacion.estado !== 'acepto') {
    const explica = {
      invitada: 'Todavía no ha respondido. No se puede confirmar a alguien que no ha dicho que sí.',
      paso: 'Ella pasó de esta campaña.',
      cupos_llenos: 'Los cupos ya se llenaron con otras.',
      vencida: 'No respondió antes de la fecha límite.',
    };
    return { ok: false, motivo: explica[invitacion.estado] || 'No se puede confirmar.' };
  }
  if (estado.libres <= 0) {
    return {
      ok: false,
      motivo: `Ya llenaste los ${estado.cupos} cupos de esta campaña. `
            + 'Cerrala o ampliá los cupos para confirmar a más.',
    };
  }
  return { ok: true };
}

/**
 * ¿Puede esta creadora responder todavía?
 *
 * El plazo se mira contra la hora del servidor, no contra la del navegador:
 * un reloj adelantado no puede dejar entrar una respuesta tarde ni bloquear
 * una a tiempo.
 */
function puedeResponder({ invitacion, campana, estado, ahora = new Date() }) {
  if (!invitacion) return { ok: false, motivo: 'Esa invitación no existe.' };
  if (invitacion.estado !== 'invitada') {
    return { ok: false, motivo: 'Ya habías respondido a esta campaña.' };
  }
  if (campana.estado === 'cerrada') {
    return { ok: false, motivo: 'Esta campaña se cerró.' };
  }
  if (campana.fecha_limite_respuesta && new Date(campana.fecha_limite_respuesta) <= ahora) {
    return { ok: false, motivo: 'Se venció el plazo para responder a esta campaña.' };
  }
  // Se puede aceptar aunque los cupos estén llenos: la marca todavía puede
  // ampliarlos, y bloquearla aquí la deja sin opción por haberse demorado unas
  // horas. Si al final no la eligen, verá "cupos completos", que no es un no.
  return { ok: true, avisoCuposLlenos: estado.llena };
}

/**
 * Qué pasa con las invitaciones cuando vence el plazo.
 *
 * Devuelve qué cambiar, sin cambiarlo: así se puede simular antes de correrlo
 * de verdad, que es lo que uno quiere de un proceso que le cierra la puerta a
 * gente sin que nadie lo mire.
 *
 * Quien aceptó y no fue confirmada NO se marca como vencida: queda en
 * `cupos_llenos`, que es lo que de verdad pasó. Decirle "se te venció" a
 * alguien que respondió a tiempo es echarle la culpa de una decisión ajena.
 */
function alVencerse({ campana, invitaciones = [], estado }) {
  const cambios = [];
  for (const i of invitaciones) {
    if (i.estado === 'invitada') {
      cambios.push({ id: i.id, estado: 'vencida', creadora_id: i.creadora_id });
    } else if (i.estado === 'acepto' && estado.libres <= 0) {
      cambios.push({ id: i.id, estado: 'cupos_llenos', creadora_id: i.creadora_id });
    }
  }
  return {
    cambios,
    // La campaña se cierra sola solo si ya no le sirve a nadie: sin cupos
    // libres, o sin nadie a quien confirmar.
    cerrar: estado.libres <= 0 || !invitaciones.some(i => i.estado === 'acepto'),
  };
}

module.exports = {
  alcanzaElPlan, puedeInvitar, estadoDeCampana, puedeConfirmar, reinvitablesGratis,
  puedeResponder, alVencerse,
  MAX_POR_TANDA, HORAS_LIMITE,
};
