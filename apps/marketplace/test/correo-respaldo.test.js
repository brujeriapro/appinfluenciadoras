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

// ── Qué proveedor se anota ──────────────────────────────────────────────────

test('el envío devuelve quién mandó de verdad', async () => {
  // Es lo que se anota en el registro. Anotar el ELEGIDO en vez del que mandó
  // diría "zeptomail ok" cuando en realidad salió por Brevo, y mandaría el
  // próximo diagnóstico en la dirección equivocada — justo lo que el registro
  // existe para evitar.
  const correo = require('../correo');
  const originales = { ...correo.PROVEEDORES };

  // Un proveedor sin cuota y otro que sí manda.
  correo.PROVEEDORES.zeptomail = {
    nombre: 'Falso sin cuota', llave: () => 'x', variable: 'X',
    enviar: async () => { throw new Error('Per day limit exhausted, try after some time.'); },
    estado: async () => ({}),
  };
  correo.PROVEEDORES.brevo = {
    nombre: 'Falso que manda', llave: () => 'y', variable: 'Y',
    enviar: async () => ({ id: 'abc' }),
    estado: async () => ({}),
  };

  try {
    const r = await correo.enviar({ para: 'a@b.co', asunto: 'x', html: '<p>x</p>' });
    assert.equal(r.proveedor, 'brevo', 'debería decir quién mandó, no quién estaba elegido');
    assert.equal(r.respaldo, true, 'y marcar que salió por el de respaldo');
  } finally {
    Object.assign(correo.PROVEEDORES, originales);
  }
});

test('con una llave mala NO se prueba el siguiente', async () => {
  // Fallaría igual en todos y gastaría la cuota del siguiente para nada.
  const correo = require('../correo');
  const originales = { ...correo.PROVEEDORES };
  let intentos = 0;

  correo.PROVEEDORES.zeptomail = {
    nombre: 'Falso mal configurado', llave: () => 'x', variable: 'X',
    enviar: async () => { intentos++; throw new Error('401 Unauthorized: invalid api key'); },
    estado: async () => ({}),
  };
  correo.PROVEEDORES.brevo = {
    nombre: 'Falso que manda', llave: () => 'y', variable: 'Y',
    enviar: async () => { intentos++; return { id: 'abc' }; },
    estado: async () => ({}),
  };

  try {
    await assert.rejects(
      () => correo.enviar({ para: 'a@b.co', asunto: 'x', html: '<p>x</p>' }),
      /invalid api key/
    );
    assert.equal(intentos, 1, 'no debería haber probado el segundo');
  } finally {
    Object.assign(correo.PROVEEDORES, originales);
  }
});
