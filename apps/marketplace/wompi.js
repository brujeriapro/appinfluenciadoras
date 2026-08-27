// Cliente de Wompi.
//
// Se usa para dos cosas distintas: cobrarle a la marca el pago del trato (el
// escrow) y cobrarle la suscripción mensual. Las dos pasan por el mismo
// Checkout Web y el mismo webhook.
//
// Dos reglas que no se negocian:
//
//   1. El monto SIEMPRE se toma de la base, nunca de lo que llega del cliente.
//      Un monto que viaje por el navegador es un monto que se puede editar.
//   2. El webhook SIEMPRE verifica la firma antes de mover nada. Sin eso,
//      cualquiera puede mandar un POST diciendo que un trato quedó pagado.

const crypto = require('crypto');
const fetch = require('node-fetch');
const config = require('./config');

const ES_PRUEBA = String(config.wompi.llave_publica || '').startsWith('pub_test');
const BASE = ES_PRUEBA ? 'https://sandbox.wompi.co/v1' : 'https://production.wompi.co/v1';
const CHECKOUT = 'https://checkout.wompi.co/p/';

/** ¿Está configurado para cobrar? Sin llaves, el sistema sigue en modo manual. */
function disponible() {
  return Boolean(config.wompi.llave_publica && config.wompi.secreto_integridad);
}

/**
 * Firma de integridad que exige el Checkout Web.
 * SHA256 de referencia + monto en centavos + moneda + secreto.
 */
function firmaIntegridad(referencia, centavos, moneda = 'COP') {
  const cadena = `${referencia}${centavos}${moneda}${config.wompi.secreto_integridad}`;
  return crypto.createHash('sha256').update(cadena).digest('hex');
}

/**
 * Arma el enlace de pago.
 *
 * Se usa Checkout Web y no la API de transacciones porque el cobro con tarjeta
 * exige tokenizar el plástico, y hacerlo nosotros implicaría que los datos de
 * la tarjeta pasen por nuestro servidor. Con el Checkout, no los tocamos.
 */
function linkDePago({ referencia, monto, email, descripcion, urlRetorno }) {
  const centavos = Math.round(Number(monto) * 100);
  const p = new URLSearchParams({
    'public-key': config.wompi.llave_publica,
    'currency': 'COP',
    'amount-in-cents': String(centavos),
    'reference': referencia,
    'signature:integrity': firmaIntegridad(referencia, centavos),
  });
  if (email) p.set('customer-data:email', email);
  if (urlRetorno) p.set('redirect-url', urlRetorno);
  return `${CHECKOUT}?${p.toString()}`;
}

/**
 * Verifica la firma del evento que manda Wompi.
 *
 * Wompi indica en `signature.properties` qué campos concatenar, en qué orden.
 * Se resuelven contra el cuerpo del evento, se les pega el timestamp y el
 * secreto, y el SHA256 debe coincidir con el checksum que llegó.
 */
function eventoEsAutentico(evento) {
  try {
    const firma = evento && evento.signature;
    if (!firma || !firma.checksum || !Array.isArray(firma.properties)) return false;
    if (!config.wompi.secreto_eventos) return false;

    const valores = firma.properties.map(ruta =>
      ruta.split('.').reduce((o, k) => (o == null ? undefined : o[k]), evento.data)
    );
    // Si alguna propiedad no existe, la firma no se puede calcular: se rechaza
    // en vez de improvisar con undefined.
    if (valores.some(v => v === undefined || v === null)) return false;

    const cadena = valores.join('') + String(evento.timestamp) + config.wompi.secreto_eventos;
    const calculado = crypto.createHash('sha256').update(cadena).digest('hex');

    // Comparación en tiempo constante: una comparación normal filtra
    // información por el tiempo que tarda en fallar.
    const a = Buffer.from(calculado, 'utf8');
    const b = Buffer.from(String(firma.checksum).toLowerCase(), 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch (e) {
    console.error('[wompi] error verificando firma:', e.message);
    return false;
  }
}

/**
 * Consulta una transacción en Wompi.
 *
 * El webhook trae el estado, pero antes de mover plata se vuelve a preguntar a
 * la fuente: es la diferencia entre confiar en un mensaje y confiar en el
 * sistema que lo emitió.
 */
async function consultarTransaccion(id) {
  const res = await fetch(`${BASE}/transactions/${id}`, {
    headers: { 'Authorization': `Bearer ${config.wompi.llave_privada}` },
  });
  if (!res.ok) throw new Error(`Wompi ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return j.data;
}

/**
 * Busca una transacción por NUESTRA referencia, no por el id de Wompi.
 *
 * Es lo que permite recuperar un pago cuando el webhook nunca llegó: en ese
 * caso no tenemos el id de Wompi, solo la referencia que nosotros generamos.
 * Sin esto, una notificación perdida deja a la marca con la plata debitada y el
 * trato quieto, y nadie se entera hasta que reclama.
 *
 * Devuelve la más reciente: si la marca reintentó el checkout con la misma
 * referencia, la última es la que vale.
 */
async function buscarPorReferencia(referencia) {
  const res = await fetch(`${BASE}/transactions?reference=${encodeURIComponent(referencia)}`, {
    headers: { 'Authorization': `Bearer ${config.wompi.llave_privada}` },
  });
  if (!res.ok) throw new Error(`Wompi ${res.status}: ${await res.text()}`);
  const j = await res.json();
  return elegirTransaccion(j.data);
}

/**
 * De varios intentos sobre la misma referencia, cuál cuenta.
 *
 * Una aprobada manda sobre cualquier otra sin importar el orden: si el primer
 * intento fue rechazado y el segundo pasó, lo que importa es que el dinero
 * entró. Quedarse con "la última" sería suficiente casi siempre y fallaría
 * justo en el caso caro — dar por no pagado un trato que sí se pagó.
 */
function elegirTransaccion(filas) {
  if (!Array.isArray(filas) || !filas.length) return null;
  return filas.find(t => t.status === 'APPROVED')
      || [...filas].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
}

/** Referencia única y legible: CR-000123-1724270400000 */
function nuevaReferencia(prefijo) {
  return `${prefijo}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

const ESTADOS = {
  APPROVED: 'aprobada',
  DECLINED: 'rechazada',
  VOIDED: 'anulada',
  ERROR: 'error',
  PENDING: 'pendiente',
};

module.exports = {
  disponible, linkDePago, eventoEsAutentico, consultarTransaccion, buscarPorReferencia, elegirTransaccion,
  nuevaReferencia, firmaIntegridad, ESTADOS, ES_PRUEBA,
};
