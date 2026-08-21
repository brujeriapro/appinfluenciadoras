// Pruebas del cliente de Wompi.
//
// El webhook es la única ruta pública que mueve dinero: si su firma se puede
// falsificar, cualquiera manda un POST diciendo que un trato quedó pagado.
// Por eso estas pruebas existen.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.WOMPI_LLAVE_PUBLICA = 'pub_test_abc';
process.env.WOMPI_SECRETO_INTEGRIDAD = 'secreto_integridad_de_prueba';
process.env.WOMPI_SECRETO_EVENTOS = 'secreto_eventos_de_prueba';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const wompi = require('../wompi');

const SECRETO_EVENTOS = 'secreto_eventos_de_prueba';

/** Arma un evento con la firma que Wompi calcularía. */
function eventoFirmado({ referencia = 'CR-1', centavos = 89600, estado = 'APPROVED', timestamp = 1724270400 } = {}) {
  const data = {
    transaction: {
      id: 'txn-123',
      reference: referencia,
      status: estado,
      amount_in_cents: centavos,
      payment_method_type: 'CARD',
    },
  };
  const propiedades = ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'];
  const valores = propiedades.map(r => r.split('.').reduce((o, k) => o[k], data));
  const checksum = crypto.createHash('sha256')
    .update(valores.join('') + timestamp + SECRETO_EVENTOS)
    .digest('hex');

  return {
    event: 'transaction.updated',
    data,
    timestamp,
    signature: { properties: propiedades, checksum },
  };
}

test('acepta un evento con firma correcta', () => {
  assert.strictEqual(wompi.eventoEsAutentico(eventoFirmado()), true);
});

test('rechaza un evento con checksum falsificado', () => {
  const e = eventoFirmado();
  e.signature.checksum = 'a'.repeat(64);
  assert.strictEqual(wompi.eventoEsAutentico(e), false);
});

test('rechaza si alguien cambia el monto sin recalcular la firma', () => {
  // El ataque obvio: interceptar el evento y subir el monto para que un pago
  // de mil pesos parezca uno de un millón.
  const e = eventoFirmado({ centavos: 89600 });
  e.data.transaction.amount_in_cents = 100000000;
  assert.strictEqual(wompi.eventoEsAutentico(e), false);
});

test('rechaza si cambian el estado a aprobado', () => {
  const e = eventoFirmado({ estado: 'DECLINED' });
  e.data.transaction.status = 'APPROVED';
  assert.strictEqual(wompi.eventoEsAutentico(e), false);
});

test('rechaza si reusan la firma con otro timestamp', () => {
  const e = eventoFirmado({ timestamp: 1724270400 });
  e.timestamp = 1724270999;
  assert.strictEqual(wompi.eventoEsAutentico(e), false);
});

test('rechaza eventos sin firma o mal formados', () => {
  assert.strictEqual(wompi.eventoEsAutentico({}), false);
  assert.strictEqual(wompi.eventoEsAutentico({ signature: {} }), false);
  assert.strictEqual(wompi.eventoEsAutentico({ signature: { checksum: 'x' } }), false);
  assert.strictEqual(wompi.eventoEsAutentico(null), false);
});

test('rechaza si la firma apunta a una propiedad que no existe', () => {
  // Si no se rechazara, el valor sería undefined y la cadena firmada quedaría
  // a merced de quien elija las propiedades.
  const e = eventoFirmado();
  e.signature.properties = ['transaction.inventado'];
  assert.strictEqual(wompi.eventoEsAutentico(e), false);
});

test('la firma de integridad sigue la fórmula de Wompi', () => {
  const esperado = crypto.createHash('sha256')
    .update('CR-1' + '89600' + 'COP' + 'secreto_integridad_de_prueba')
    .digest('hex');
  assert.strictEqual(wompi.firmaIntegridad('CR-1', 89600), esperado);
});

test('el enlace de pago lleva monto en centavos y firma', () => {
  const url = wompi.linkDePago({ referencia: 'CR-9', monto: 896, email: 'a@b.co' });
  const u = new URL(url);
  assert.strictEqual(u.searchParams.get('amount-in-cents'), '89600');
  assert.strictEqual(u.searchParams.get('currency'), 'COP');
  assert.strictEqual(u.searchParams.get('reference'), 'CR-9');
  assert.strictEqual(u.searchParams.get('public-key'), 'pub_test_abc');
  assert.ok(u.searchParams.get('signature:integrity'));
});

test('el monto se convierte a centavos sin perder pesos', () => {
  // 761.600 pesos son 76.160.000 centavos. Un error de redondeo acá es plata.
  const url = wompi.linkDePago({ referencia: 'X', monto: 761600 });
  assert.strictEqual(new URL(url).searchParams.get('amount-in-cents'), '76160000');
});

test('cada referencia es distinta', () => {
  const a = wompi.nuevaReferencia('CR');
  const b = wompi.nuevaReferencia('CR');
  assert.notStrictEqual(a, b);
  assert.ok(a.startsWith('CR-'));
});

test('con llave de prueba apunta al sandbox', () => {
  assert.strictEqual(wompi.ES_PRUEBA, true);
});

test('los estados de Wompi se traducen', () => {
  assert.strictEqual(wompi.ESTADOS.APPROVED, 'aprobada');
  assert.strictEqual(wompi.ESTADOS.DECLINED, 'rechazada');
  assert.strictEqual(wompi.ESTADOS.VOIDED, 'anulada');
});
