// Paquetes que arma la creadora: "2 reels + 4 historias por $650.000".
//
// Existen para subir el ticket sin que la plataforma empuje a nadie. Un
// entregable suelto deja $40.000 de comisión; un paquete de $650.000 deja
// $130.000 por el mismo trabajo de plataforma. Y a la marca le conviene, porque
// la creadora suele poner el paquete por debajo de la suma de sus piezas.
//
// Estas funciones son puras a propósito: deciden qué es válido y cuánto se
// ahorra, sin tocar la base. Así se prueban con números concretos, que es lo
// que hace falta cuando el resultado es un precio que alguien va a pagar.

const MAX_LINEAS = 8;      // más que esto deja de ser un paquete y es un contrato
const MAX_CANTIDAD = 30;   // por línea

/**
 * Limpia y valida lo que incluye un paquete.
 *
 * Devuelve { incluye, error }. Nunca lanza: quien la llama está respondiendo un
 * formulario y necesita explicar qué salió mal, no un 500.
 */
function normalizarIncluye(crudo, entregablesValidos = []) {
  if (!Array.isArray(crudo) || !crudo.length) {
    return { error: 'El paquete tiene que incluir al menos un entregable' };
  }

  const validos = new Set(entregablesValidos);
  const porEntregable = new Map();

  for (const linea of crudo) {
    const entregable = String(linea?.entregable || '').trim();
    if (!validos.has(entregable)) continue;   // lo que no existe se descarta

    const n = Math.floor(Number(linea?.cantidad));
    if (!Number.isFinite(n) || n < 1) continue;

    // Dos líneas del mismo entregable se suman en vez de duplicarse: "2 reels"
    // y "1 reel" es un paquete de 3 reels, no dos renglones que dicen lo mismo.
    porEntregable.set(entregable,
      Math.min(MAX_CANTIDAD, (porEntregable.get(entregable) || 0) + n));
  }

  if (!porEntregable.size) {
    return { error: 'Ninguno de los entregables que elegiste es válido' };
  }
  if (porEntregable.size > MAX_LINEAS) {
    return { error: `Un paquete no puede tener más de ${MAX_LINEAS} tipos de entregable` };
  }

  return {
    incluye: [...porEntregable.entries()].map(([entregable, cantidad]) => ({ entregable, cantidad })),
  };
}

/**
 * Cuánto costaría comprar lo mismo suelto, según las tarifas de ELLA.
 *
 * Devuelve null si le falta el precio de alguno de los entregables del paquete:
 * un ahorro calculado sobre datos incompletos sería mentira, y es preferible no
 * mostrarlo a mostrarlo mal.
 */
function precioSuelto(incluye = [], tarifas = []) {
  const precioDe = new Map(
    tarifas.filter(t => t.activo !== false && Number(t.precio) > 0)
           .map(t => [t.entregable, Number(t.precio)])
  );

  let total = 0;
  for (const linea of incluye) {
    const unitario = precioDe.get(linea.entregable);
    if (!unitario) return null;
    total += unitario * linea.cantidad;
  }
  return total || null;
}

/**
 * Lo que ve la marca: cuánto cuesta el paquete y cuánto se ahorra.
 *
 * Solo se habla de ahorro cuando de verdad lo hay. Si la creadora puso el
 * paquete más caro que la suma —está en su derecho, puede incluir trabajo que
 * no cabe en una tarifa suelta— no se muestra nada en vez de un "ahorro"
 * negativo.
 */
function conAhorro(paquete, tarifas = []) {
  const suelto = precioSuelto(paquete.incluye || [], tarifas);
  const precio = Number(paquete.precio) || 0;

  if (!suelto || suelto <= precio) {
    return { ...paquete, precio_suelto: null, ahorro: null, ahorro_pct: null };
  }
  const ahorro = suelto - precio;
  return {
    ...paquete,
    precio_suelto: suelto,
    ahorro,
    ahorro_pct: Math.round(ahorro / suelto * 100),
  };
}

/** Cuántas piezas trae en total. Sirve para "5 piezas por $650.000". */
const totalPiezas = (incluye = []) =>
  incluye.reduce((s, l) => s + (Number(l.cantidad) || 0), 0);

module.exports = { normalizarIncluye, precioSuelto, conAhorro, totalPiezas, MAX_LINEAS, MAX_CANTIDAD };
