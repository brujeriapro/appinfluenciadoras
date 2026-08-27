// Las reglas de la suscripción: cambiar de plan, el prorrateo y el tope.
//
// Todo acá es puro y se prueba con montos concretos, porque decide cuánto se le
// COBRA a alguien. Un error de redondeo en una pantalla se ve feo; acá es plata
// que se cobra de más o de menos, y ninguna de las dos se arregla sola.
//
// El handoff lo pide explícito y con razón: **el backend calcula el prorrateo y
// el front solo lo muestra**. Nunca se confía en un monto que viene del cliente.

/**
 * La regla de negocio que sostiene el modelo:
 *
 *   Si a la marca se le acaban las propuestas del mes, tiene que SUBIR DE PLAN
 *   para seguir. No se compran propuestas sueltas, no hay paquetes extra, y lo
 *   que no se usa no se acumula. El único otro camino es esperar la renovación.
 *
 * Se escribe acá porque es la que hace que los planes signifiquen algo: con
 * paquetes sueltos, el plan gratuito se vuelve un plan de pago por uso y nadie
 * sube nunca.
 */
const HAY_PAQUETES_SUELTOS = false;

/** Un mes de ciclo. Wompi cobra por mes calendario, no por 30 días exactos. */
const DIAS_CICLO = 30;

/**
 * Cuánto se le cobra hoy por pasar a un plan más caro.
 *
 * Se le descuenta lo que ya pagó y no alcanzó a usar. Sin ese descuento, quien
 * sube al día siguiente de renovar paga dos meses casi completos — y lo nota.
 *
 * El descuento se calcula sobre los días que le QUEDAN, no sobre los que pasó:
 * es la misma cuenta pero se explica sola en la pantalla ("quedan 14 días de
 * Impulsa").
 *
 * @param {object} p
 * @param {number} p.precioNuevo   lo que cuesta el plan al que va
 * @param {number} p.precioActual  lo que paga hoy
 * @param {string} p.venceAt       cuándo termina el ciclo que ya pagó
 */
function prorrateo({ precioNuevo, precioActual = 0, venceAt, ahora = new Date() }) {
  const nuevo = Math.max(0, Math.round(Number(precioNuevo) || 0));
  const actual = Math.max(0, Math.round(Number(precioActual) || 0));

  // Sin ciclo vigente no hay nada que descontar: es una suscripción nueva.
  const restanteMs = venceAt ? new Date(venceAt) - ahora : 0;
  if (restanteMs <= 0 || !actual) {
    return { aPagar: nuevo, credito: 0, diasRestantes: 0, precioNuevo: nuevo };
  }

  const diasRestantes = Math.max(0, Math.ceil(restanteMs / 86_400_000));
  // El crédito nunca puede pasar de lo que cuesta el plan nuevo: si pasara, la
  // plataforma terminaría devolviendo plata por subir de plan.
  const credito = Math.min(
    nuevo,
    Math.round(actual * Math.min(diasRestantes, DIAS_CICLO) / DIAS_CICLO)
  );

  return { aPagar: Math.max(0, nuevo - credito), credito, diasRestantes, precioNuevo: nuevo };
}

/**
 * Qué pasa al cambiar de plan, y cuándo.
 *
 * Subir es inmediato porque la marca lo está pidiendo para mandar algo HOY —
 * es literalmente la pantalla del tope. Bajar es al final del ciclo porque ya
 * pagó ese mes: cortarle propuestas que pagó sería quedarse con su plata.
 */
function cambioDePlan({ actual, destino, venceAt, ahora = new Date() }) {
  if (!destino) return { ok: false, motivo: 'Falta el plan de destino.' };
  if (actual && destino.clave === actual.clave) {
    return { ok: false, motivo: 'Ya estás en ese plan.' };
  }

  const precioActual = Number(actual?.precio_mes || 0);
  const precioNuevo = Number(destino.precio_mes || 0);
  const sube = precioNuevo > precioActual;

  if (!sube) {
    return {
      ok: true,
      tipo: precioNuevo === 0 ? 'cancelacion' : 'bajada',
      inmediato: false,
      aPagar: 0,
      // No se devuelve plata: ya usó —o pudo usar— el mes que pagó.
      efectivoDesde: venceAt,
      mensaje: precioNuevo === 0
        ? 'Tu plan sigue activo hasta el final del mes que ya pagaste.'
        : `Sigues en ${actual.nombre} hasta el final del mes pagado, y ahí pasas a ${destino.nombre}.`,
    };
  }

  const cuenta = prorrateo({ precioNuevo, precioActual, venceAt, ahora });
  return {
    ok: true,
    tipo: 'subida',
    inmediato: true,
    ...cuenta,
    mensaje: cuenta.credito
      ? `Te descontamos ${cuenta.credito} de lo que ya pagaste (quedan ${cuenta.diasRestantes} días).`
      : null,
  };
}

/**
 * Cuántas propuestas queda con después de subir.
 *
 * Se SUMAN a las que le quedaban, no la reemplazan. Si el plan nuevo reiniciara
 * el contador, quien sube el día 28 con dos propuestas sin usar las perdería —
 * y estaría pagando para tener menos.
 */
function propuestasTrasSubir({ topeNuevo, topeActual, usadas }) {
  if (topeNuevo === null || topeNuevo === undefined) return null;   // sin tope
  const quedaban = topeActual === null || topeActual === undefined
    ? 0
    : Math.max(0, Number(topeActual) - Number(usadas || 0));
  const suma = Math.max(0, Number(topeNuevo) - Number(topeActual || 0));
  return { disponibles: suma + quedaban, sumadas: suma, quedaban };
}

/**
 * Qué se le ofrece a una marca que se topó, y en qué orden.
 *
 * Tres reglas, y la primera es la que más importa:
 *
 *  1. NUNCA es un muro. Siempre hay una salida gratis. Una pantalla sin salida
 *     gratis hace que la marca cierre y no vuelva.
 *  2. El trabajo hecho se protege PRIMERO. Antes de hablar de plata se dice que
 *     el brief y las creadoras quedan guardadas — ya escribió todo y está a un
 *     clic de mandar.
 *  3. El precio va con el descuento aplicado. Nunca el precio de lista.
 */
function opcionesDelTope({ quiereInvitar, disponibles, planActual, planSugerido, venceAt, ahora = new Date() }) {
  const faltan = Math.max(0, Number(quiereInvitar || 0) - Number(disponibles || 0));

  const salidas = [];

  if (planSugerido) {
    const cuenta = prorrateo({
      precioNuevo: planSugerido.precio_mes,
      precioActual: planActual?.precio_mes,
      venceAt, ahora,
    });
    const tras = propuestasTrasSubir({
      topeNuevo: planSugerido.propuestas_mes,
      topeActual: planActual?.propuestas_mes,
      usadas: (planActual?.propuestas_mes || 0) - disponibles,
    });
    salidas.push({
      clave: 'subir',
      recomendada: true,
      titulo: `Pasa a ${planSugerido.nombre} y manda hoy`,
      monto: cuenta.aPagar,
      conDescuento: cuenta.credito > 0,
      detalle: tras
        ? `Te quedan ${tras.disponibles} propuestas este mes.`
        : 'Quedas sin tope de propuestas.',
      boton: `Subir a ${planSugerido.nombre} →`,
    });
  }

  // La salida gratis va siempre, incluso si no hay plan al que subir.
  salidas.push({
    clave: 'esperar',
    recomendada: false,
    titulo: 'Espera a que se reinicien',
    monto: 0,
    detalle: planActual
      ? `Sigues en ${planActual.nombre}. Tus propuestas vuelven el día de tu renovación.`
      : 'Tus propuestas vuelven el día de tu renovación.',
    boton: 'Esperar la renovación',
  });

  return {
    faltan,
    // Lo primero que se dice, antes de cualquier precio.
    protegido: 'El brief, los cupos y las creadoras que elegiste siguen aquí. '
             + 'Subas o no de plan, no pierdes nada de lo que ya armaste.',
    salidas,
    // Se deja explícito para que ninguna pantalla lo ofrezca por su cuenta.
    hay_paquetes_sueltos: HAY_PAQUETES_SUELTOS,
  };
}

module.exports = {
  prorrateo, cambioDePlan, propuestasTrasSubir, opcionesDelTope,
  DIAS_CICLO, HAY_PAQUETES_SUELTOS,
};
