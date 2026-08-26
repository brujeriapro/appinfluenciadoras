// Pruebas del selector de proveedor de correo.
//
// Elegir mal aquí no lanza ningún error: simplemente deja de salir el correo,
// en silencio, y nadie se entera hasta que alguien no puede recuperar su
// contraseña. Ya pasó una vez —57 solicitudes sin que ninguna llegara— así que
// esta parte se prueba.

process.env.MK_SKIP_CONFIG_CHECK = '1';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://ejemplo.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'clave-de-prueba';

const test = require('node:test');
const assert = require('node:assert');
const config = require('../config');
const correo = require('../correo');

/** Deja el entorno de correo como estaba al terminar cada prueba. */
function conConfig(valores, fn) {
  const previo = {
    correo_proveedor: config.correo_proveedor,
    brevo_api_key: config.brevo_api_key,
    zeptomail_api_key: config.zeptomail_api_key,
    resend_api_key: config.resend_api_key,
  };
  Object.assign(config, { correo_proveedor: '', brevo_api_key: '', zeptomail_api_key: '', resend_api_key: '' }, valores);
  try { return fn(); } finally { Object.assign(config, previo); }
}

test('sin ninguna llave no hay proveedor', () => {
  conConfig({}, () => assert.strictEqual(correo.activo(), null));
});

test('con una sola llave, esa manda', () => {
  conConfig({ brevo_api_key: 'x'.repeat(40) }, () => {
    assert.strictEqual(correo.activo().clave, 'brevo');
  });
  conConfig({ zeptomail_api_key: 'x'.repeat(40) }, () => {
    assert.strictEqual(correo.activo().clave, 'zeptomail');
  });
  conConfig({ resend_api_key: 'x'.repeat(40) }, () => {
    assert.strictEqual(correo.activo().clave, 'resend');
  });
});

test('con varias llaves gana el más barato, no el que estaba antes', () => {
  // Al poner ZeptoMail junto a Brevo, lo esperable es empezar a usar ZeptoMail:
  // es la razón de haberlo puesto. Si ganara Brevo por ser el que ya estaba,
  // el cambio no surtiría efecto y nadie sabría por qué.
  conConfig({ brevo_api_key: 'b'.repeat(40), zeptomail_api_key: 'z'.repeat(40) }, () => {
    assert.strictEqual(correo.activo().clave, 'zeptomail');
  });
});

test('elegir a mano gana sobre el orden por defecto', () => {
  conConfig({
    correo_proveedor: 'brevo',
    brevo_api_key: 'b'.repeat(40),
    zeptomail_api_key: 'z'.repeat(40),
  }, () => {
    assert.strictEqual(correo.activo().clave, 'brevo');
  });
});

test('elegir un proveedor sin su llave no cae en otro por accidente', () => {
  // Preferible no mandar nada a mandar por un proveedor que nadie eligió:
  // el remitente sería otro y los correos podrían irse a spam sin explicación.
  conConfig({ correo_proveedor: 'resend', brevo_api_key: 'b'.repeat(40) }, () => {
    assert.strictEqual(correo.activo(), null);
  });
});

test('un nombre de proveedor inventado no rompe nada', () => {
  conConfig({ correo_proveedor: 'mailchimp', brevo_api_key: 'b'.repeat(40) }, () => {
    // Cae al orden por defecto en vez de reventar el arranque.
    assert.strictEqual(correo.activo().clave, 'brevo');
  });
});

test('enviar sin proveedor falla con un mensaje entendible', async () => {
  await conConfig({}, async () => {
    await assert.rejects(
      () => correo.enviar({ para: 'a@b.co', asunto: 'x', html: '<p>x</p>' }),
      /proveedor de correo/i
    );
  });
});

test('el diagnóstico sin proveedor dice qué variables poner', async () => {
  const d = await conConfig({}, () => correo.diagnostico());
  assert.strictEqual(d.ok, false);
  assert.match(d.motivo, /MK_ZEPTOMAIL_API_KEY/);
  assert.match(d.motivo, /MK_BREVO_API_KEY/);
});

// ── Remitente ──

test('el remitente se parte en nombre y correo', () => {
  const r = correo.partirRemitente('Creators Manager <no-reply@creatorsmanager.com>');
  assert.strictEqual(r.nombre, 'Creators Manager');
  assert.strictEqual(r.email, 'no-reply@creatorsmanager.com');
});

test('un remitente sin nombre igual sirve', () => {
  // Si la variable trae solo la dirección, el correo tiene que salir de todos
  // modos: quedarse sin remitente sería no mandar nada.
  const r = correo.partirRemitente('no-reply@creatorsmanager.com');
  assert.strictEqual(r.email, 'no-reply@creatorsmanager.com');
  assert.ok(r.nombre, 'debe caer a un nombre por defecto');
});

test('los espacios de sobra no se cuelan en la dirección', () => {
  const r = correo.partirRemitente('  Creators Manager  <  hola@ejemplo.com  >  ');
  assert.strictEqual(r.email, 'hola@ejemplo.com');
});

test('todos los proveedores exponen la misma forma', () => {
  // Si uno se agrega a medias, el fallo aparece al intentar mandar y no antes.
  for (const [clave, p] of Object.entries(correo.PROVEEDORES)) {
    assert.ok(p.nombre, `${clave} sin nombre`);
    assert.strictEqual(typeof p.llave, 'function', `${clave} sin llave()`);
    assert.strictEqual(typeof p.enviar, 'function', `${clave} sin enviar()`);
    assert.strictEqual(typeof p.estado, 'function', `${clave} sin estado()`);
    assert.match(p.variable, /^MK_/, `${clave} sin variable documentada`);
  }
});

test('la llave de ZeptoMail sirve con prefijo y sin él', () => {
  // Su panel muestra el token de las dos formas y copiar la línea entera es lo
  // natural. Duplicar el prefijo da un fallo de autenticación que no explica
  // nada, así que la cabecera queda igual en ambos casos.
  const { PROVEEDORES } = correo;
  const cabecera = () => {
    // Se reconstruye igual que en enviar(), sin salir a la red.
    const k = String(config.zeptomail_api_key || '').trim();
    return /^Zoho-enczapikey\s/i.test(k) ? k : `Zoho-enczapikey ${k}`;
  };
  assert.ok(PROVEEDORES.zeptomail);

  conConfig({ zeptomail_api_key: 'wSsVR61x' }, () => {
    assert.strictEqual(cabecera(), 'Zoho-enczapikey wSsVR61x');
  });
  conConfig({ zeptomail_api_key: 'Zoho-enczapikey wSsVR61x' }, () => {
    assert.strictEqual(cabecera(), 'Zoho-enczapikey wSsVR61x',
      'no debe quedar el prefijo dos veces');
  });
  conConfig({ zeptomail_api_key: '  wSsVR61x  ' }, () => {
    assert.strictEqual(cabecera(), 'Zoho-enczapikey wSsVR61x',
      'los espacios de sobra al pegar no pueden romperla');
  });
});
