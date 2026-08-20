// Motor de comisión de Creadores.app.
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
 * Devuelve el nivel de tarifa (inicial | medio | top) que corresponde a un
 * monto dado, según los niveles configurados. Sirve para sugerir tarifa al
 * curar un perfil nuevo.
 */
function nivelPorTarifa(monto, niveles = {}) {
  const base = Number(monto) || 0;
  const orden = ['inicial', 'medio', 'top'];
  for (const clave of orden) {
    const n = niveles[clave];
    if (!n) continue;
    if (base >= (n.min ?? 0) && base <= (n.max ?? Infinity)) return clave;
  }
  return base > 0 ? 'top' : null;
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

/** Formatea un valor en pesos para mostrar: 1250000 -> "$1.250.000" */
function formatearCOP(valor) {
  const n = Math.round(Number(valor) || 0);
  return '$' + n.toLocaleString('es-CO');
}

module.exports = { calcularTrato, nivelPorTarifa, rangoAlcance, formatearCOP };
