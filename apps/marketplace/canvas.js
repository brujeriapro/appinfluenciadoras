// Motor de Canvas UGC: estados y plata.
//
// Funciones puras, sin base de datos ni red, igual que comisiones.js y la
// máquina de tratos.js. Acá se decide cuánto paga la marca, cuánto recibe la
// operadora y cuánto se devuelve, así que tiene que poder auditarse de una
// lectura y probarse sin levantar nada.
//
// El modelo, en corto: una marca contrata a una operadora para publicar videos
// en una cuenta social QUE ES DE LA MARCA. Se pacta una cuota de piezas por
// ciclo y una tarifa por pieza. La marca paga la cuota completa por adelantado
// y al cerrar se le paga a la operadora lo que entregó y se le devuelve lo que
// no — con la comisión proporcional de lo no entregado.
//
// No hay bono por vistas. Se quitó a propósito (María, 31-ago-2026) y con él se
// fue el único incentivo que existía para inflar un número reportado.

const ESTADOS_PROGRAMA = [
  'propuesto', 'aceptado', 'activo', 'pausado', 'terminado', 'rechazado', 'cancelado',
];

const ESTADOS_CICLO = [
  'por_pagar', 'activo', 'en_revision', 'liquidado', 'cerrado', 'cancelado',
];

// Quién puede llevar el programa de un estado a otro. Como en tratos.js, el
// grafo es DATO y no una cadena de condicionales repartida por los routers.
const TRANSICIONES_PROGRAMA = {
  propuesto: {
    aceptado:  ['creadora'],
    rechazado: ['creadora'],
    cancelado: ['marca', 'admin', 'sistema'],
  },
  aceptado: {
    // Solo con el handoff hecho. Antes de tener acceso a la cuenta no puede
    // publicar nada, así que el programa no está corriendo aunque las dos
    // partes hayan dicho que sí.
    activo:    ['marca', 'admin'],
    cancelado: ['marca', 'creadora', 'admin'],
  },
  activo: {
    pausado:   ['marca', 'admin'],
    terminado: ['marca', 'creadora', 'admin'],
  },
  pausado: {
    activo:    ['marca', 'admin'],
    terminado: ['marca', 'creadora', 'admin'],
  },
  terminado: {},
  rechazado: {},
  cancelado: {},
};

const TRANSICIONES_CICLO = {
  por_pagar: {
    activo:    ['admin', 'sistema'],   // con el pago de la marca confirmado
    cancelado: ['marca', 'admin'],
  },
  activo: {
    en_revision: ['marca', 'admin', 'sistema'],
    cancelado:   ['admin'],
  },
  en_revision: {
    liquidado: ['marca', 'admin'],
    activo:    ['marca', 'admin'],     // se reabre: faltaba contar algo
  },
  liquidado: {
    cerrado: ['admin'],                // con la operadora ya pagada
  },
  cerrado:   {},
  cancelado: {},
};

class MovimientoInvalido extends Error {
  constructor(mensaje) { super(mensaje); this.name = 'MovimientoInvalido'; this.status = 409; }
}

/** ¿Puede este actor mover el programa a ese estado? */
function puedeMoverPrograma(actual, nuevo, actor) {
  const salidas = TRANSICIONES_PROGRAMA[actual];
  return Boolean(salidas && salidas[nuevo] && salidas[nuevo].includes(actor));
}

/** ¿Puede este actor mover el ciclo a ese estado? */
function puedeMoverCiclo(actual, nuevo, actor) {
  const salidas = TRANSICIONES_CICLO[actual];
  return Boolean(salidas && salidas[nuevo] && salidas[nuevo].includes(actor));
}

/** Un programa deja de estar vivo cuando llega a un estado terminal. */
function programaTerminado(estado) {
  return ['terminado', 'rechazado', 'cancelado'].includes(estado);
}

/**
 * Lo que la marca pone sobre la mesa al abrir un ciclo.
 *
 * Paga la cuota COMPLETA por adelantado, no lo que se vaya entregando: es lo
 * que le permite a la operadora grabar veinte videos sabiendo que la plata ya
 * está. Al cerrar se le devuelve lo que no se entregó.
 *
 * @param {object} p
 * @param {number} p.cuota               Piezas pactadas para el ciclo
 * @param {number} p.tarifa_pieza        Lo que se paga por pieza
 * @param {number} p.comision_marca_pct  % adicional que paga la marca
 */
function calcularApertura({ cuota, tarifa_pieza, comision_marca_pct = 0 }) {
  const piezas = Math.trunc(Number(cuota));
  const tarifa = Number(tarifa_pieza);

  if (!Number.isFinite(piezas) || piezas <= 0) {
    throw new MovimientoInvalido('La cuota del ciclo debe ser un número positivo');
  }
  if (!Number.isFinite(tarifa) || tarifa <= 0) {
    throw new MovimientoInvalido('La tarifa por pieza debe ser un número positivo');
  }

  const pct = Number(comision_marca_pct) || 0;
  if (pct < 0 || pct > 100) {
    throw new MovimientoInvalido('La comisión de la marca debe estar entre 0 y 100');
  }

  const base = piezas * tarifa;
  // El peso no usa decimales. Se redondea la comisión y nunca el total, para
  // que base + comisión cierre exacto contra el extracto del banco.
  const comision = Math.round(base * pct / 100);

  return {
    cuota: piezas,
    tarifa_pieza: tarifa,
    base,
    comision_marca_valor: comision,
    total_a_pagar_marca: base + comision,
  };
}

/**
 * Cuántas piezas de las publicadas cuentan para este ciclo.
 *
 * Una pieza cuenta si fue publicada dentro del periodo, no fue rechazada, y no
 * pasa de la cuota. El tope importa: la marca retuvo por la cuota pactada, y
 * pagar veintidós videos cuando puso por veinte sería cobrarle algo que nunca
 * aprobó. Las de más quedan registradas —cuentan para el historial de la
 * operadora— pero no se pagan.
 */
function contarPiezas({ piezas = [], cuota, desde, hasta }) {
  const ini = desde ? new Date(desde).getTime() : -Infinity;
  const fin = hasta ? new Date(hasta).getTime() : Infinity;

  const dentro = piezas.filter((p) => {
    if (p.estado === 'rechazada') return false;
    const t = new Date(p.publicada_at).getTime();
    return Number.isFinite(t) && t >= ini && t <= fin;
  });

  const tope = Math.trunc(Number(cuota)) || 0;
  return {
    publicadas: dentro.length,
    validas: Math.min(dentro.length, tope),
    // Lo que entregó de más. Se devuelve para poder decírselo en pantalla en
    // vez de que descubra sola que dos videos no se le pagaron.
    excedentes: Math.max(0, dentro.length - tope),
  };
}

/**
 * La liquidación del ciclo: qué recibe la operadora y qué vuelve a la marca.
 *
 * Se paga solo lo entregado, sin castigo por no llegar a la cuota (María,
 * 31-ago-2026). Entregar de menos se refleja donde importa —en el historial de
 * cumplimiento que ven las demás marcas—, no quitándole plata por el trabajo
 * que sí hizo.
 *
 * La comisión de la marca se devuelve proporcional a lo no entregado: se cobra
 * por un servicio prestado, y una pieza que no existe no se prestó.
 */
function liquidarCiclo({
  cuota, tarifa_pieza, piezas_validas,
  comision_marca_pct = 0, comision_creadora_pct = 0, costo_desembolso_pct = 0,
}) {
  const tope    = Math.trunc(Number(cuota));
  const tarifa  = Number(tarifa_pieza);
  const hechas  = Math.trunc(Number(piezas_validas)) || 0;

  if (!Number.isFinite(tope) || tope <= 0) {
    throw new MovimientoInvalido('La cuota del ciclo debe ser un número positivo');
  }
  if (!Number.isFinite(tarifa) || tarifa <= 0) {
    throw new MovimientoInvalido('La tarifa por pieza debe ser un número positivo');
  }
  if (hechas < 0)    throw new MovimientoInvalido('Las piezas entregadas no pueden ser negativas');
  if (hechas > tope) throw new MovimientoInvalido('Las piezas válidas no pueden superar la cuota');

  const pctMarca    = Number(comision_marca_pct) || 0;
  const pctCreadora = Number(comision_creadora_pct) || 0;
  const pctDesemb   = Number(costo_desembolso_pct) || 0;

  const monto_operadora = hechas * tarifa;
  const comision_creadora_valor = Math.round(monto_operadora * pctCreadora / 100);

  // El costo de dispersar se calcula sobre lo que de verdad se le transfiere,
  // ya descontada su comisión, y va en su propio campo: son cosas distintas y
  // mezclarlas haría que su comisión pareciera mayor de la que se pactó.
  const antesDeDesembolso = monto_operadora - comision_creadora_valor;
  const costo_desembolso_valor = Math.round(antesDeDesembolso * pctDesemb / 100);

  // Lo que la marca puso al abrir, recalculado igual que entonces para que las
  // dos cuentas cierren al peso.
  const base_retenida  = tope * tarifa;
  const comision_puesta = Math.round(base_retenida * pctMarca / 100);
  const total_retenido  = base_retenida + comision_puesta;

  // Lo que se queda la plataforma es la comisión de lo que SÍ se prestó.
  const comision_marca_valor = Math.round(monto_operadora * pctMarca / 100);

  return {
    piezas_validas: hechas,
    monto_operadora,
    comision_marca_pct: pctMarca,
    comision_creadora_pct: pctCreadora,
    comision_marca_valor,
    comision_creadora_valor,
    costo_desembolso_pct: pctDesemb,
    costo_desembolso_valor,
    neto_operadora: antesDeDesembolso - costo_desembolso_valor,
    total_retenido,
    // Todo lo que no se convirtió en trabajo ni en comisión vuelve a la marca.
    // Se calcula como resta y no como fórmula propia para que sea imposible
    // que sobre o falte un peso: lo retenido se reparte en tres y ya.
    devuelto_marca: total_retenido - monto_operadora - comision_marca_valor,
  };
}

/**
 * Las fechas del ciclo siguiente.
 *
 * Los ciclos NO se abren solos: abrirlos cobra, y cobrar automáticamente una
 * relación que quizá ya nadie quiere es la forma más rápida de perder a una
 * marca. Esta función solo propone las fechas; abrirlo lo decide una persona.
 */
function proponerCiclo({ periodicidad = 'mensual', ultimoFin = null, hoy = null }) {
  const arranque = ultimoFin
    ? new Date(new Date(ultimoFin).getTime() + 86400000)   // el día siguiente al cierre
    : new Date(hoy || Date.now());

  const inicio = new Date(Date.UTC(
    arranque.getUTCFullYear(), arranque.getUTCMonth(), arranque.getUTCDate()));

  const fin = new Date(inicio);
  if (periodicidad === 'quincenal') fin.setUTCDate(fin.getUTCDate() + 14);
  else                              fin.setUTCMonth(fin.getUTCMonth() + 1), fin.setUTCDate(fin.getUTCDate() - 1);

  const iso = (d) => d.toISOString().slice(0, 10);
  return { fecha_inicio: iso(inicio), fecha_fin: iso(fin) };
}

/** Formatea pesos: 1250000 -> "$1.250.000" */
function COP(v) {
  return '$' + Math.round(Number(v) || 0).toLocaleString('es-CO');
}

module.exports = {
  ESTADOS_PROGRAMA, ESTADOS_CICLO,
  TRANSICIONES_PROGRAMA, TRANSICIONES_CICLO,
  puedeMoverPrograma, puedeMoverCiclo, programaTerminado,
  calcularApertura, contarPiezas, liquidarCiclo, proponerCiclo,
  MovimientoInvalido, COP,
};
