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

  // Se busca en los dos sitios: el código puede ser de una creadora ya
  // registrada, o de una invitación por correo cuya dueña todavía no ha
  // entrado. Los 114 correos de la ola 1 llevan códigos del segundo tipo y
  // tienen que seguir funcionando.
  const dueña =
    await db.getUno('mk_creadoras', {
      codigo_ref: `eq.${codigo}`, select: 'id,codigo_ref,cupos_ref,nombre_publico',
    }) ||
    await db.getUno('mk_invitaciones', {
      codigo_ref: `eq.${codigo}`, select: 'id,codigo_ref,cupos_ref,nombre',
    });

  if (!dueña) return { vale: false, motivo: 'no_existe' };

  const invita = dueña.nombre_publico || dueña.nombre || null;
  const cupos = dueña.cupos_ref || 0;
  const usados = await contarUsos(codigo);

  if (usados >= cupos) {
    return { vale: false, motivo: 'sin_cupo', usados, cupos, invita };
  }
  return { vale: true, codigo, usados, cupos, invita, restantes: cupos - usados };
}

/** Cuántas se registraron ya con ese código. */
async function contarUsos(codigo) {
  const filas = await db.get('mk_creadoras', {
    referida_por: `eq.${normalizar(codigo)}`, select: 'id',
  });
  return filas.length;
}

/**
 * Le asegura código propio a una creadora.
 *
 * Si llegó por una invitación por correo hereda ese mismo código, para que el
 * enlace que ya compartió por WhatsApp no deje de funcionar de un día para otro.
 */
async function asegurarCodigoDeCreadora(creadora) {
  if (creadora.codigo_ref) return creadora.codigo_ref;

  let codigo = null;
  if (creadora.email) {
    const inv = await db.getUno('mk_invitaciones', {
      email: `eq.${String(creadora.email).toLowerCase().trim()}`,
      select: 'codigo_ref',
    }).catch(() => null);
    if (inv?.codigo_ref) codigo = inv.codigo_ref;
  }

  for (let intento = 0; intento < 5; intento++) {
    const candidato = codigo || nuevoCodigo();
    try {
      await db.updateCreadora(creadora.id, { codigo_ref: candidato });
      return candidato;
    } catch (e) {
      codigo = null; // el heredado chocó: se genera uno nuevo
      if (intento === 4) throw e;
    }
  }
}

/** Igual, pero para una invitación por correo que todavía no tiene código. */
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

module.exports = {
  nuevoCodigo, normalizar, validar, contarUsos,
  asegurarCodigo, asegurarCodigoDeCreadora,
};
