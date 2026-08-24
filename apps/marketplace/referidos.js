// Referidos del prelanzamiento: cada invitada puede traer a dos amigas.
//
// Cómo funciona, en corto: la invitación lleva un código propio en el enlace.
// Quien entre por ahí queda marcada como referida por esa persona. Cuando el
// código llega a su tope, deja de admitir a nadie más.
//
// Por qué el código cuelga de la invitación y no de la creadora: en el momento
// de invitar todavía no existe su perfil —puede que nunca se registre— y el
// enlace tiene que funcionar desde el primer correo. Cuando ella misma se
// registre, hereda su código y lo ve en su portal.

const crypto = require('crypto');
const db = require('./db');

// Sin vocales, para que ningún código forme por accidente una palabra
// desafortunada. Y sin 0/O, 1/I/L: son las que la gente transcribe mal cuando
// le dictan el código por teléfono o lo copia de una captura.
const ALFABETO = '23456789BCDFGHJKMNPQRSTVWXYZ';

/** Código corto, legible y fácil de dictar por teléfono. */
function nuevoCodigo(largo = 7) {
  const bytes = crypto.randomBytes(largo);
  let out = '';
  for (let i = 0; i < largo; i++) out += ALFABETO[bytes[i] % ALFABETO.length];
  return out;
}

const normalizar = (codigo) => String(codigo || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * ¿Este código puede traer a alguien más?
 *
 * Devuelve siempre la misma forma —{ vale, motivo, ... }— para que quien
 * pregunte no tenga que distinguir entre "no existe" y "ya se llenó" salvo que
 * quiera. Un código inválido nunca tumba el registro: la creadora entra igual,
 * solo que sin quedar atribuida a nadie.
 */
async function validar(codigoCrudo) {
  const codigo = normalizar(codigoCrudo);
  if (!codigo) return { vale: false, motivo: 'sin_codigo' };

  const inv = await db.getUno('mk_invitaciones', {
    codigo_ref: `eq.${codigo}`,
    select: 'id,codigo_ref,cupos_ref,nombre',
  });
  if (!inv) return { vale: false, motivo: 'no_existe' };

  const usados = await contarUsos(codigo);
  if (usados >= (inv.cupos_ref || 0)) {
    return { vale: false, motivo: 'sin_cupo', usados, cupos: inv.cupos_ref, invita: inv.nombre };
  }
  return { vale: true, codigo, usados, cupos: inv.cupos_ref, invita: inv.nombre, restantes: inv.cupos_ref - usados };
}

/** Cuántas se registraron ya con ese código. */
async function contarUsos(codigo) {
  const filas = await db.get('mk_creadoras', {
    referida_por: `eq.${normalizar(codigo)}`,
    select: 'id',
  });
  return filas.length;
}

/**
 * Asegura que una invitación tenga código. Se llama al invitar, y también al
 * registrarse alguien que fue invitada, para que pueda referir a su vez.
 *
 * Reintenta ante el choque contra el índice único, que con siete caracteres es
 * improbable pero no imposible.
 */
async function asegurarCodigo(invitacionId, codigoActual) {
  if (codigoActual) return codigoActual;

  for (let intento = 0; intento < 5; intento++) {
    const codigo = nuevoCodigo();
    try {
      await db.patch('mk_invitaciones', { id: invitacionId }, { codigo_ref: codigo });
      return codigo;
    } catch (e) {
      if (intento === 4) throw e;
    }
  }
}

module.exports = { nuevoCodigo, normalizar, validar, contarUsos, asegurarCodigo };
