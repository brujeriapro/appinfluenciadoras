// Reglas de las invitaciones al banco de creadoras.
//
// Vive aparte porque la usan dos entradas —el panel admin y el script de
// consola— y porque es la parte que, si se equivoca, le escribe dos veces a una
// persona real o deja a alguien por fuera. Eso merece pruebas, y probar algo
// que habla con la base es mucho más difícil que probar funciones puras.

/**
 * Las olas van de mayor a menor cercanía con la marca, y ese orden importa por
 * dos razones que apuntan al mismo lado: las primeras son las que más van a
 * abrir el correo —lo que le enseña a Gmail que el dominio es legítimo antes de
 * subir el volumen— y también las que hacen valioso el catálogo, porque son las
 * que ya demostraron que entregan.
 */
const OLAS = {
  1: { nombre: 'Ya entregaron contenido', estados: ['Contenido Entregado', 'Calificada'] },
  2: { nombre: 'Recibieron kit',          estados: ['Producto Enviado'] },
  3: { nombre: 'Solo registradas',        estados: ['Registrada'] },
  4: { nombre: 'Descartadas y pausadas',  estados: ['Descartada', 'Pausada'] },
};

/** Un correo comparable: sin espacios de sobra y sin mayúsculas caprichosas. */
const normalizar = (email) => String(email == null ? '' : email).toLowerCase().trim();

const correoUsable = (email) => {
  const e = normalizar(email);
  // No pretende validar direcciones de verdad —eso lo hace el proveedor al
  // enviar—; solo descarta lo que claramente no es un correo.
  return Boolean(e) && e.includes('@') && !e.startsWith('@') && !e.endsWith('@');
};

/**
 * Quita de la lista a quien no tiene correo usable y a los repetidos.
 *
 * Los repetidos existen: en la base del Programa Creadoras la misma persona
 * puede haberse registrado dos veces con distinto estado. Sin este filtro,
 * recibiría dos invitaciones iguales el mismo día.
 */
function filtrarCandidatas(filas = []) {
  const vistos = new Set();
  return filas.filter(f => {
    const email = normalizar(f && f.email);
    if (!correoUsable(email) || vistos.has(email)) return false;
    vistos.add(email);
    return true;
  });
}

/** De las candidatas, las que todavía no han recibido nada. */
function pendientesDe(candidatas = [], yaInvitados = []) {
  const enviados = yaInvitados instanceof Set
    ? new Set([...yaInvitados].map(normalizar))
    : new Set(yaInvitados.map(x => normalizar(typeof x === 'string' ? x : x && x.email)));
  return candidatas.filter(c => !enviados.has(normalizar(c && c.email)));
}

/** El filtro que entiende PostgREST para traer varios estados de una. */
const filtroDeEstados = (estados = []) =>
  `in.(${estados.map(e => `"${e}"`).join(',')})`;

module.exports = { OLAS, normalizar, correoUsable, filtrarCandidatas, pendientesDe, filtroDeEstados };
