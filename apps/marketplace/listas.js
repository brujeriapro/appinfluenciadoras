// Reglas de las listas que comparte una marca aliada.
//
// Vive aparte por la misma razón que invitaciones.js: es la parte que, si se
// equivoca, le escribe dos veces a una persona real o deja a alguien por fuera.
// Eso merece pruebas, y probar algo que habla con la base es mucho más difícil
// que probar funciones puras.
//
// La diferencia con invitaciones.js es la llave. Allá todo giraba en torno al
// correo, porque todo salía de la tabla `influencers`. Una lista externa llega
// con celular y poco más, así que aquí la llave es el teléfono normalizado.

const { normalizarTelefono } = require('./whatsapp');

// Un celular colombiano suelto dentro de un texto que trae más cosas.
//
// Hace falta porque hay quien pega una sola columna con todo junto
// ("Laura Montoya 3164309055"). Se exige que no venga pegado a otro dígito
// para no morder un trozo de un número más largo, que sería peor que no
// encontrarlo: mandaría el mensaje a otra persona.
const CELULAR_SUELTO = /(?:^|[^\d])(?:\+?57[\s.-]?)?(3\d{2}[\s.-]?\d{3}[\s.-]?\d{4})(?!\d)/;

// Un campo que es SOLO el número: dígitos y los adornos con que la gente los
// escribe. Se comprueba antes de normalizar porque normalizarTelefono() borra
// todo lo que no sea dígito, y sin esta guarda "Laura Montoya 3164309055"
// pasaría por un teléfono a secas y el nombre se perdería.
const SOLO_TELEFONO = /^[\d+\s().-]+$/;

/**
 * Limpia el nombre antes de guardarlo.
 *
 * Los '?' sueltos son basura de codificación: la lista trae "ali?trujillo 002"
 * y "emakeup?cools", donde el '?' es lo que quedó de un emoji o una tilde que
 * no sobrevivió a la exportación. Ningún nombre colombiano lleva '?', así que
 * quitarlo no puede romper uno bueno — y "Hola ali?trujillo" es de las cosas
 * que hacen que un mensaje se lea como spam automático.
 *
 * También se van los caracteres de control: Meta rechaza el envío entero si un
 * parámetro trae un salto de línea.
 */
function limpiarNombre(texto) {
  return String(texto == null ? '' : texto)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\?/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parte los campos de una línea pegada.
 *
 * Excel copia con tabulación, pero la gente también pega CSV de otros lados.
 * El orden importa: la coma va de última porque los nombres la llevan
 * ("Restrepo, Laura") y partir por ella rompería el nombre en dos.
 */
function separarCampos(linea) {
  const s = String(linea == null ? '' : linea);
  if (s.includes('\t')) return s.split('\t');
  if (s.includes(';')) return s.split(';');
  if (s.includes(',')) return s.split(',');
  return [s];
}

/**
 * Convierte una línea en { nombre, telefono }, o null si no hay celular.
 *
 * El teléfono se busca POR SU FORMA, no por su posición: da igual si la lista
 * viene nombre-celular o celular-nombre, y da igual cuántas columnas de sobra
 * traiga. Las listas reales nunca vienen dos veces con el mismo formato.
 */
function partirLinea(linea) {
  const campos = separarCampos(linea).map(c => String(c).trim());

  // Primero, el caso limpio: un campo que ES el teléfono y nada más.
  let indice = campos.findIndex(c => c && SOLO_TELEFONO.test(c) && normalizarTelefono(c));
  let telefono = null;
  let restoDelCampo = '';

  if (indice >= 0) {
    telefono = normalizarTelefono(campos[indice]);
  } else {
    // Si no, un campo que lo lleva dentro junto al nombre. Pasa cuando se pega
    // una sola columna con todo junto: "Laura Montoya 3164309055".
    indice = campos.findIndex(c => CELULAR_SUELTO.test(c));
    if (indice < 0) return null;

    const m = campos[indice].match(CELULAR_SUELTO);
    telefono = normalizarTelefono(m[1]);
    if (!telefono) return null;
    // Lo que quedaba en esa celda es parte del nombre y se conserva.
    restoDelCampo = campos[indice].replace(m[0], ' ').trim();
  }

  // Todo lo que no es el teléfono es el nombre. Se juntan todas las celdas en
  // vez de quedarse con la primera porque hay listas que parten el nombre en
  // dos columnas.
  const nombre = limpiarNombre(
    [...campos.filter((_, i) => i !== indice), restoDelCampo].join(' '),
  );

  return { nombre, telefono };
}

/**
 * Lee el bloque de texto pegado y separa lo usable de lo que no.
 *
 * Devuelve las descartadas CON su línea original: una lista que dice "importé
 * 132 de 147" sin decir cuáles fueron las 15 obliga a revisar el Excel entero
 * a mano, que es justo lo que esto viene a evitar.
 *
 * Las líneas en blanco se cuentan aparte y no como descartes: son un artefacto
 * de pegar desde Excel, no un error de la lista, y reportarlas como problema
 * enseña a ignorar la lista de problemas.
 */
function leerPegado(texto) {
  const lineas = String(texto == null ? '' : texto).split(/\r?\n/);
  const filas = [];
  const descartadas = [];
  let vacias = 0;

  lineas.forEach((linea, i) => {
    if (!linea.trim()) { vacias++; return; }

    const fila = partirLinea(linea);
    if (!fila) {
      descartadas.push({
        numero: i + 1,
        linea: linea.trim().slice(0, 120),
        motivo: 'no tiene un celular colombiano de 10 dígitos',
      });
      return;
    }
    filas.push(fila);
  });

  return { filas, descartadas, vacias };
}

/** Quita los repetidos dentro de la propia lista, por teléfono. */
function quitarRepetidos(filas = []) {
  const vistos = new Set();
  const unicas = [];
  const repetidas = [];

  for (const f of filas) {
    if (!f || !f.telefono) continue;
    if (vistos.has(f.telefono)) { repetidas.push(f); continue; }
    vistos.add(f.telefono);
    unicas.push(f);
  }
  return { unicas, repetidas };
}

/**
 * Un conjunto de teléfonos comparables, venga como venga.
 *
 * Acepta un Set, cadenas sueltas o filas de la base — que traen el número en
 * `telefono` si vienen de mk_invitaciones y en `whatsapp` si vienen de
 * mk_creadoras. Todo se normaliza antes de comparar: en la base los números
 * están como los escribió cada quien, y "+57 316 430 9055" y "3164309055" son
 * la misma persona.
 */
function conjuntoDeTelefonos(valores = []) {
  const lista = valores instanceof Set ? [...valores] : (valores || []);
  const set = new Set();

  for (const v of lista) {
    const crudo = typeof v === 'string' ? v : (v && (v.telefono || v.whatsapp));
    const n = normalizarTelefono(crudo);
    if (n) set.add(n);
  }
  return set;
}

/**
 * Reparte la lista en tres montones: nuevas, ya invitadas y ya registradas.
 *
 * Es el equivalente de pendientesDe() de invitaciones.js, pero por teléfono.
 *
 * El orden de la comprobación no es casual: quien ya tiene perfil se cuenta
 * como registrada aunque además se le hubiera invitado antes. Es el hecho más
 * fuerte de los dos —y el que mide si esto sirvió—, y sobre todo es a quien
 * NO se le puede mandar "estás invitada": ese mensaje, a alguien que ya entró,
 * es el que hace que te reporten.
 */
function pendientesPorTelefono(filas = [], yaInvitados = [], yaRegistradas = []) {
  const invitados = conjuntoDeTelefonos(yaInvitados);
  const registradas = conjuntoDeTelefonos(yaRegistradas);

  const nuevas = [];
  const ya_invitadas = [];
  const ya_registradas = [];

  for (const f of filas) {
    if (registradas.has(f.telefono)) ya_registradas.push(f);
    else if (invitados.has(f.telefono)) ya_invitadas.push(f);
    else nuevas.push(f);
  }
  return { nuevas, ya_invitadas, ya_registradas };
}

/**
 * Con qué se la saluda en el mensaje.
 *
 * En estas listas la columna del nombre mezcla @usuario ("sgreymakeup") con
 * nombres reales ("Sara Ospina") y no hay forma fiable de distinguirlos, así
 * que no se intenta: se toma la primera palabra y ya. "Hola sgreymakeup" se
 * lee raro pero es verdad; inventarle un nombre se leería peor.
 *
 * Nunca queda vacío: Meta rechaza la plantilla si una variable llega en blanco.
 */
function saludoDe(nombre) {
  const limpio = String(nombre == null ? '' : nombre)
    .replace(/^@+/, '')
    .trim()
    .split(/\s+/)[0] || '';
  return limpio || 'creadora';
}

/** Un nombre de fuente comparable: sin espacios de sobra ni mayúsculas. */
const normalizarFuente = (f) =>
  String(f == null ? '' : f).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 40);

module.exports = {
  limpiarNombre,
  separarCampos,
  partirLinea,
  leerPegado,
  quitarRepetidos,
  conjuntoDeTelefonos,
  pendientesPorTelefono,
  saludoDe,
  normalizarFuente,
};
