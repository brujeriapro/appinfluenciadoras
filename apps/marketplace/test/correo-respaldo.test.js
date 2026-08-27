// Pruebas de la caída a otro proveedor cuando se acaba la cuota.
//
// Es el modo de falla que de verdad pasa: no "el correo está mal configurado"
// —eso se nota el primer día— sino "se acabó la cuota de hoy", que llega sin
// aviso y tumba las recuperaciones de contraseña junto con las invitaciones.
// Pasó dos veces, con dos proveedores distintos.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');
const { esCuotaAgotada } = require('../correo');

test('reconoce el error de ZeptoMail sin cuota', () => {
  // El mensaje real que devolvió en producción.
  const real = 'ZeptoMail respondió 403: {"error":{"code":"TM_3601","details":['
    + '{"code":"SM_133","message":"Trial mail sending limit exceeded"},'
    + '{"code":"SMI_115","target_value":100,"message":"Per day limit exhausted, try after some time."}]}}';
  assert.equal(esCuotaAgotada(real), true);
});

test('reconoce el de Brevo y los genéricos', () => {
  assert.equal(esCuotaAgotada('You have exceeded your daily limit'), true);
  assert.equal(esCuotaAgotada('HTTP 429 Too Many Requests'), true);
  assert.equal(esCuotaAgotada('quota exceeded'), true);
});

test('una llave mala NO cuenta como cuota agotada', () => {
  // Si contara, se reintentaría con el siguiente proveedor y se gastaría su
  // cuota para nada: una llave equivocada falla igual en todos.
  assert.equal(esCuotaAgotada('401 Unauthorized: invalid api key'), false);
  assert.equal(esCuotaAgotada('Sender address not verified'), false);
  assert.equal(esCuotaAgotada('getaddrinfo ENOTFOUND'), false);
});

test('no revienta con un error vacío', () => {
  assert.equal(esCuotaAgotada(null), false);
  assert.equal(esCuotaAgotada(undefined), false);
  assert.equal(esCuotaAgotada(''), false);
});
