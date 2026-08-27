// De qué proveedor sale el correo.
//
// Existe para que cambiar de proveedor sea poner una llave distinta en el
// entorno, no reescribir el sistema de notificaciones. El precio a un mismo
// volumen varía mucho —ZeptoMail cuesta alrededor de una décima parte de Brevo
// a 10.000 correos al mes— y eso es demasiado dinero para dejarlo enterrado en
// una función.
//
// Todos hacen lo mismo: reciben destinatario, asunto y HTML, y devuelven true o
// lanzan con el mensaje real del proveedor. Ese mensaje importa: dice si la
// cuota se acabó, si el remitente no está verificado o si la llave está mal, y
// traducirlo a "no se pudo enviar" deja a quien opera adivinando.
//
// Amazon SES no está aquí a propósito. Es el más barato de todos (alrededor de
// $0,10 por cada mil correos) pero firmar sus peticiones exige el SDK de AWS y
// sacar la cuenta del sandbox. Vale la pena cuando el volumen lo justifique;
// hoy no compensa la complejidad.

const fetch = require('node-fetch');
const config = require('./config');

/**
 * Convierte "Nombre <correo@dominio>" en las partes que piden las APIs.
 *
 * Se recorta también lo de dentro de los signos: el grupo captura hasta el ">"
 * y una variable de entorno con un espacio de más dejaría "hola@ejemplo.com "
 * como dirección, que el proveedor rechaza sin decir que sobra un espacio.
 */
function partirRemitente(texto) {
  const m = String(texto || '').match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/);
  return m
    ? { nombre: (m[1] || '').trim() || 'Creators Manager', email: m[2].trim() }
    : { nombre: 'Creators Manager', email: String(texto || '').trim() };
}

/**
 * La cabecera de ZeptoMail, venga la llave con prefijo o sin él.
 *
 * Su panel muestra el token unas veces solo y otras precedido de
 * "Zoho-enczapikey". Copiar la línea entera es lo natural, y duplicar el
 * prefijo da un error de autenticación que no dice nada sobre la causa.
 */
function llaveZepto() {
  const k = String(config.zeptomail_api_key || '').trim();
  return /^Zoho-enczapikey\s/i.test(k) ? k : `Zoho-enczapikey ${k}`;
}

const PROVEEDORES = {
  // Orden de preferencia: el primero con llave gana si nadie eligió.
  // ZeptoMail va antes que Brevo porque es el que conviene por precio; quien
  // quiera seguir en Brevo teniendo ambas llaves lo dice con MK_CORREO_PROVEEDOR.
  zeptomail: {
    nombre: 'ZeptoMail',
    llave: () => config.zeptomail_api_key,
    variable: 'MK_ZEPTOMAIL_API_KEY',

    async enviar({ para, asunto, html, remitente }) {
      const de = partirRemitente(remitente);
      const r = await fetch('https://api.zeptomail.com/v1.1/email', {
        method: 'POST',
        headers: {
          // El prefijo no es opcional y no es "Bearer": ZeptoMail rechaza la
          // llave sin él con un error que no explica por qué.
          //
          // Y su panel a veces muestra el token con el prefijo ya incluido, así
          // que se acepta de las dos formas. Sin esto, copiar la línea completa
          // —lo natural— produce "Zoho-enczapikey Zoho-enczapikey ..." y un
          // fallo de autenticación imposible de adivinar mirando la variable.
          'Authorization': llaveZepto(),
          'content-type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify({
          from: { address: de.email, name: de.nombre },
          to: [{ email_address: { address: para } }],
          subject: asunto,
          htmlbody: html,
        }),
      });
      if (!r.ok) {
        const detalle = await r.text().catch(() => '');
        throw new Error(`ZeptoMail respondió ${r.status}: ${detalle.slice(0, 300)}`);
      }
      return true;
    },

    // ZeptoMail no expone los créditos restantes por API, así que lo único que
    // se puede comprobar sin gastar un envío es que la llave tenga forma válida.
    async estado() {
      const k = config.zeptomail_api_key;
      return {
        creditos_restantes: null,
        nota: k.length < 20
          ? 'La llave parece incompleta.'
          : 'ZeptoMail no informa cuántos créditos quedan. Míralo en su panel.',
      };
    },
  },

  resend: {
    nombre: 'Resend',
    llave: () => config.resend_api_key,
    variable: 'MK_RESEND_API_KEY',

    async enviar({ para, asunto, html, remitente }) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${config.resend_api_key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from: remitente, to: [para], subject: asunto, html }),
      });
      if (!r.ok) {
        const detalle = await r.text().catch(() => '');
        throw new Error(`Resend respondió ${r.status}: ${detalle.slice(0, 300)}`);
      }
      return true;
    },

    async estado() {
      return {
        creditos_restantes: null,
        nota: 'Resend no informa el consumo por API. Míralo en su panel.',
      };
    },
  },

  brevo: {
    nombre: 'Brevo',
    llave: () => config.brevo_api_key,
    variable: 'MK_BREVO_API_KEY',

    async enviar({ para, asunto, html, remitente }) {
      const de = partirRemitente(remitente);
      const r = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': config.brevo_api_key,
          'content-type': 'application/json',
          'accept': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: de.nombre, email: de.email },
          to: [{ email: para }],
          subject: asunto,
          htmlContent: html,
        }),
      });
      if (!r.ok) {
        const detalle = await r.text().catch(() => '');
        throw new Error(`Brevo respondió ${r.status}: ${detalle.slice(0, 300)}`);
      }
      return true;
    },

    /** Brevo sí dice cuántos correos quedan, que es lo que más veces falla. */
    async estado() {
      const r = await fetch('https://api.brevo.com/v3/account', {
        headers: { 'api-key': config.brevo_api_key, 'accept': 'application/json' },
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`Brevo rechazó la llave (HTTP ${r.status}). ${d?.message || ''}`.trim());

      const planes = Array.isArray(d.plan) ? d.plan : [];
      const correo = planes.find(p => p.type === 'free' || p.credits != null) || {};
      return {
        cuenta: d.email || null,
        plan: correo.type || null,
        creditos_restantes: correo.credits ?? null,
        nota: correo.credits === 0
          ? 'Se acabaron los correos del día. Brevo los repone cada 24 horas; mientras '
            + 'tanto no sale ninguno, ni siquiera los de recuperar contraseña.'
          : null,
      };
    },
  },
};

/** El proveedor que se va a usar ahora mismo, o null si no hay ninguno listo. */
function activo() {
  const elegido = config.correo_proveedor;
  if (elegido && PROVEEDORES[elegido]) {
    return PROVEEDORES[elegido].llave() ? { clave: elegido, ...PROVEEDORES[elegido] } : null;
  }
  for (const [clave, p] of Object.entries(PROVEEDORES)) {
    if (p.llave()) return { clave, ...p };
  }
  return null;
}

/**
 * Todos los proveedores con llave, empezando por el activo.
 *
 * Sirve para tener a dónde caerse cuando el primero se queda sin cuota.
 */
function disponibles() {
  const primero = activo();
  if (!primero) return [];
  const resto = Object.entries(PROVEEDORES)
    .filter(([clave, p]) => clave !== primero.clave && p.llave())
    .map(([clave, p]) => ({ clave, ...p }));
  return [primero, ...resto];
}

/**
 * ¿Este error dice que se acabó la cuota, y no que algo está mal configurado?
 *
 * Importa la diferencia: una cuota agotada se arregla mandando por otro lado,
 * pero una llave equivocada va a fallar igual en todos, y reintentar solo
 * gastaría cuota del siguiente por nada.
 */
function esCuotaAgotada(mensaje) {
  return /limit exceeded|limit exhausted|quota|rate limit|429|too many requests|daily limit/i
    .test(String(mensaje || ''));
}

/**
 * Envía. Si el proveedor se queda sin cuota, prueba con el siguiente que tenga
 * llave.
 *
 * Existe porque el modo de falla real no es "el correo está mal configurado"
 * —eso se nota el primer día— sino "se acabó la cuota de hoy", que llega sin
 * aviso y tumba TODO por igual: las invitaciones y también las recuperaciones
 * de contraseña. Pasó con Brevo en agosto (plan de 300) y con ZeptoMail
 * después (100 al día mientras revisan la cuenta), y las dos veces dejó a
 * creadoras sin poder entrar.
 *
 * Solo se reintenta ante cuota agotada. Ante una llave mala se falla de una:
 * probar los demás no arreglaría nada y gastaría su cuota.
 */
async function enviar({ para, asunto, html, remitente }) {
  const lista = disponibles();
  if (!lista.length) throw new Error('No hay proveedor de correo configurado');

  let ultimoError = null;
  for (const [i, p] of lista.entries()) {
    try {
      const r = await p.enviar({ para, asunto, html, remitente });
      if (i > 0) console.warn(`[correo] ${lista[0].nombre} sin cuota; salió por ${p.nombre}`);
      return r;
    } catch (e) {
      ultimoError = e;
      // Si no es cuota, o ya no quedan alternativas, se falla con el error real.
      if (!esCuotaAgotada(e.message) || i === lista.length - 1) throw e;
      console.warn(`[correo] ${p.nombre} sin cuota, probando el siguiente…`);
    }
  }
  throw ultimoError;
}

/**
 * Qué proveedor está activo y si puede mandar.
 *
 * Nunca lanza: es una pantalla de diagnóstico y tiene que poder mostrar el
 * problema en vez de convertirse en otro.
 */
async function diagnostico() {
  const p = activo();
  if (!p) {
    const configurables = Object.values(PROVEEDORES).map(x => x.variable).join(', ');
    return {
      ok: false,
      motivo: `No hay ningún proveedor configurado. Pon una de estas variables: ${configurables}.`,
    };
  }

  try {
    const e = await p.estado();
    return {
      ok: e.creditos_restantes == null || e.creditos_restantes > 0,
      via: p.nombre,
      elegido_a_mano: Boolean(config.correo_proveedor),
      disponibles: Object.entries(PROVEEDORES)
        .filter(([, x]) => x.llave()).map(([, x]) => x.nombre),
      ...e,
      motivo: e.nota || null,
    };
  } catch (err) {
    return { ok: false, via: p.nombre, motivo: err.message };
  }
}

module.exports = {
  disponibles, esCuotaAgotada, enviar, diagnostico, activo, PROVEEDORES, partirRemitente };
