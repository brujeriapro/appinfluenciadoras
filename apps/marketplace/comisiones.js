// Motor de comisión de Creators Manager.
//
// Funciones puras, sin acceso a base de datos ni a red: todo lo que necesitan
// llega por parámetro. Es el módulo donde se decide cuánta plata cobra cada
// parte, así que tiene que poder auditarse de una sola lectura y probarse sin
// levantar nada.
//
// La comisión total del 20% se reparte entre los dos lados: la marca paga un
// porcentaje ADICIONAL sobre el monto acordado, y a la creadora se le DESCUENTA
// otro porcentaje de su pago. Las Brujas Embajadoras de Brujería Capilar tienen
// comisión 0% en ambos lados.

/**
 * Calcula todos los valores monetarios de un trato.
 *
 * Importante: recibe los porcentajes por parámetro, nunca los lee de la config.
 * Quien llama es responsable de pasar los porcentajes CONGELADOS del trato (si
 * ya existe) o los vigentes de mk_config (si se está creando). Así, cambiar la
 * comisión mañana no altera el valor de un trato cerrado ayer.
 *
 * @param {object} p
 * @param {number} p.monto                 Monto acordado con la creadora (COP)
 * @param {number} p.comision_marca_pct    % adicional que paga la marca
 * @param {number} p.comision_creadora_pct % que se descuenta a la creadora
 * @param {boolean} [p.es_bruja_embajadora] Si es true, ambos porcentajes pasan a 0
 */
function calcularTrato({
  monto, comision_marca_pct, comision_creadora_pct,
  costo_desembolso_pct = 0, es_bruja_embajadora = false,
}) {
  const base = Number(monto);
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error('El monto debe ser un número positivo');
  }

  const pctMarca    = es_bruja_embajadora ? 0 : Number(comision_marca_pct) || 0;
  const pctCreadora = es_bruja_embajadora ? 0 : Number(comision_creadora_pct) || 0;
  const pctDesembolso = es_bruja_embajadora ? 0 : Number(costo_desembolso_pct) || 0;

  if (pctMarca < 0 || pctMarca > 100 || pctCreadora < 0 || pctCreadora > 100) {
    throw new Error('Los porcentajes de comisión deben estar entre 0 y 100');
  }
  if (pctDesembolso < 0 || pctDesembolso > 100) {
    throw new Error('El costo de desembolso debe estar entre 0 y 100');
  }

  // El peso colombiano no usa decimales. Se redondea el VALOR DE LA COMISIÓN,
  // nunca el total: así `total = monto + comision` cierra exacto siempre y no
  // aparecen diferencias de un peso al conciliar con el banco.
  const comision_marca_valor    = Math.round(base * pctMarca / 100);
  const comision_creadora_valor = Math.round(base * pctCreadora / 100);

  // Lo que cuesta pasarle la plata a la creadora, que la pasarela cobra al
  // dispersar. Se calcula sobre lo que ella recibe de verdad —ya descontada su
  // comisión— porque es sobre eso que se hace la transferencia.
  //
  // Va en su propio campo y no sumado a la comisión a propósito: son cosas
  // distintas y ella tiene derecho a ver cuál es cuál. Mezclarlas haría que su
  // comisión pareciera del 11% cuando el trato dice 8%.
  const antesDeDesembolso = base - comision_creadora_valor;
  const costo_desembolso_valor = Math.round(antesDeDesembolso * pctDesembolso / 100);

  return {
    monto_creadora:           base,
    comision_marca_pct:       pctMarca,
    comision_creadora_pct:    pctCreadora,
    comision_marca_valor,
    comision_creadora_valor,
    comision_total_valor:     comision_marca_valor + comision_creadora_valor,
    total_a_pagar_marca:      base + comision_marca_valor,
    costo_desembolso_pct:     pctDesembolso,
    costo_desembolso_valor:   costo_desembolso_valor,
    // Lo que de verdad le llega a la cuenta. Es el número que ella ve al
    // decidir si acepta, y por eso incluye el desembolso: enterarse del
    // descuento al cobrar sería justo lo que rompe la confianza.
    neto_a_recibir_creadora:  antesDeDesembolso - costo_desembolso_valor,
  };
}

/**
 * Un trato por canje: la creadora recibe producto, no plata.
 *
 * Es la mitad del mercado en belleza y no cabía en `calcularTrato`, que exige
 * un monto positivo — con razón, porque un trato en dinero por cero pesos es
 * un error, no un canje.
 *
 * **Por qué acá no hay escrow y no hace falta.** El escrow protege trabajo ya
 * hecho: retiene la plata hasta que la marca aprueba, para que nadie grabe
 * gratis. En un canje la creadora no graba hasta que le llega el producto, así
 * que si nunca llega, simplemente no hay contenido y nadie perdió nada. No hay
 * nada que retener porque no hay nada en riesgo.
 *
 * Lo que sí se cobra es la comisión fija, y se cobra cuando ELLA ACEPTA
 * (decisión de María, 29-ago-2026). Es lo mismo que se promete para los tratos
 * en dinero —no se cobra nada si dice que no— y de paso deja a la marca con
 * algo puesto, que es lo que la empuja a mandar el producto de verdad.
 *
 * La creadora no paga nada: cobrarle un porcentaje de cero es cero, y cobrarle
 * un fijo sería pedirle plata por recibir un regalo.
 */
function calcularCanje({ comision_fija, es_bruja_embajadora = false }) {
  const fija = es_bruja_embajadora ? 0 : Math.round(Number(comision_fija) || 0);
  if (fija < 0) throw new Error('La comisión de canje no puede ser negativa');

  return {
    tipo_pago:                'canje',
    monto_creadora:           0,
    comision_marca_pct:       0,
    comision_creadora_pct:    0,
    comision_marca_valor:     fija,
    comision_creadora_valor:  0,
    comision_total_valor:     fija,
    // La marca paga SOLO la comisión. El producto lo manda aparte, y su valor
    // no pasa por acá: no lo cobramos ni lo retenemos, así que ponerlo en la
    // cuenta sería inventarnos un movimiento de plata que no existe.
    total_a_pagar_marca:      fija,
    costo_desembolso_pct:     0,
    costo_desembolso_valor:   0,
    // Cero pesos, y se dice explícito. Que ella vea "$0" al lado de "recibes el
    // producto" es lo que evita el malentendido de creer que además le pagan.
    neto_a_recibir_creadora:  0,
  };
}

/**
 * Devuelve el nivel de presupuesto (inicial | medio | top) que corresponde a
 * una tarifa.
 *
 * El nivel NO se le asigna a la creadora: ella pone su precio y el nivel se
 * deriva de ahí. Existe solo para que la marca pueda filtrar el catálogo por
 * lo que tiene disponible para gastar.
 *
 * Los rangos son semiabiertos [min, max) para que un valor justo en el corte
 * caiga siempre en el nivel de arriba y no en dos a la vez.
 */
function nivelPorTarifa(monto, niveles = {}) {
  const base = Number(monto) || 0;
  const orden = ['inicial', 'medio', 'top'];
  for (const clave of orden) {
    const n = niveles[clave];
    if (!n) continue;
    if (base >= (n.min ?? 0) && base < (n.max ?? Infinity)) return clave;
  }
  return base > 0 ? 'top' : null;
}

/**
 * Resume las tarifas publicadas por una creadora en los tres valores que el
 * catálogo necesita para filtrar rápido, sin cruzar tablas en cada consulta.
 *
 * Solo cuentan las tarifas activas: una creadora puede tener precio guardado
 * para un entregable que decidió no ofrecer.
 */
function resumirTarifas(tarifas = [], niveles = {}) {
  const activas = tarifas.filter(t => t.activo !== false && Number(t.precio) > 0);
  if (!activas.length) {
    return { tarifa_min: null, tarifa_max: null, nivel_tarifa: null, entregable_tipico: null };
  }
  const precios = activas.map(t => Number(t.precio));
  const min = Math.min(...precios);
  const barata = activas.find(t => Number(t.precio) === min);
  return {
    tarifa_min: min,
    tarifa_max: Math.max(...precios),
    // El nivel sale del precio de entrada: es lo que la marca compara con su
    // presupuesto cuando busca "creadoras hasta $500K".
    nivel_tarifa: nivelPorTarifa(min, niveles),
    entregable_tipico: barata ? barata.entregable : null,
  };
}

/**
 * Traduce un número exacto de seguidores al rango que ve la marca.
 *
 * Se muestra el rango y nunca la cifra exacta: un número de seguidores preciso
 * es prácticamente un identificador único y permitiría encontrar el perfil.
 */
function rangoAlcance(alcance, rangos = []) {
  const n = Number(alcance) || 0;
  for (const r of rangos) {
    const min = r.min ?? 0;
    const max = r.max ?? Infinity;
    if (n >= min && n < max) return r.clave;
  }
  return rangos.length ? rangos[rangos.length - 1].clave : null;
}

/**
 * Resume los seguidores de cada red en los campos que usa el catalogo.
 *
 * Existe para que la conversion de cifras a rangos ocurra en un solo lugar: el
 * registro, la edicion de perfil, el panel admin y el importador la comparten.
 */
function resumirAlcance({ instagram, tiktok }, rangos = []) {
  const ig = Math.max(0, Number(instagram) || 0);
  const tk = Math.max(0, Number(tiktok) || 0);
  const total = ig + tk;
  return {
    seguidores_instagram: ig || null,
    seguidores_tiktok: tk || null,
    alcance_total: total || null,
    // Solo hay rango donde de verdad hay cuenta: si no tiene TikTok, la marca
    // no deberia ver un rango que sugiera lo contrario.
    rango_instagram: ig ? rangoAlcance(ig, rangos) : null,
    rango_tiktok: tk ? rangoAlcance(tk, rangos) : null,
    rango_alcance: total ? rangoAlcance(total, rangos) : null,
  };
}

/**
 * Lo que la creadora recibe por un trato, dicho como se le debe decir.
 *
 * Existe porque un canje pagado en producto vale `$0` en la base, y escribir
 * ese cero en un correo —"Nueva propuesta · $0"— es la forma más rápida de que
 * no lo abra. Vive acá y no en cada plantilla para que el día que cambie la
 * frase, cambie en los cinco sitios a la vez.
 */
function loQueRecibe(trato) {
  return trato?.tipo_pago === 'canje'
    ? 'el producto'
    : formatearCOP(trato?.neto_a_recibir_creadora);
}

/** Formatea un valor en pesos para mostrar: 1250000 -> "$1.250.000" */
function formatearCOP(valor) {
  const n = Math.round(Number(valor) || 0);
  return '$' + n.toLocaleString('es-CO');
}

module.exports = { calcularTrato, calcularCanje, loQueRecibe, nivelPorTarifa, resumirTarifas, rangoAlcance, resumirAlcance, formatearCOP };
