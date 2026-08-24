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
function calcularTrato({ monto, comision_marca_pct, comision_creadora_pct, es_bruja_embajadora = false }) {
  const base = Number(monto);
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error('El monto debe ser un número positivo');
  }

  const pctMarca    = es_bruja_embajadora ? 0 : Number(comision_marca_pct) || 0;
  const pctCreadora = es_bruja_embajadora ? 0 : Number(comision_creadora_pct) || 0;

  if (pctMarca < 0 || pctMarca > 100 || pctCreadora < 0 || pctCreadora > 100) {
    throw new Error('Los porcentajes de comisión deben estar entre 0 y 100');
  }

  // El peso colombiano no usa decimales. Se redondea el VALOR DE LA COMISIÓN,
  // nunca el total: así `total = monto + comision` cierra exacto siempre y no
  // aparecen diferencias de un peso al conciliar con el banco.
  const comision_marca_valor    = Math.round(base * pctMarca / 100);
  const comision_creadora_valor = Math.round(base * pctCreadora / 100);

  return {
    monto_creadora:           base,
    comision_marca_pct:       pctMarca,
    comision_creadora_pct:    pctCreadora,
    comision_marca_valor,
    comision_creadora_valor,
    comision_total_valor:     comision_marca_valor + comision_creadora_valor,
    total_a_pagar_marca:      base + comision_marca_valor,
    neto_a_recibir_creadora:  base - comision_creadora_valor,
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

/** Formatea un valor en pesos para mostrar: 1250000 -> "$1.250.000" */
function formatearCOP(valor) {
  const n = Math.round(Number(valor) || 0);
  return '$' + n.toLocaleString('es-CO');
}

module.exports = { calcularTrato, nivelPorTarifa, resumirTarifas, rangoAlcance, resumirAlcance, formatearCOP };
