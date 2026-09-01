// Las reglas del agente de prospección.
//
// Lo que se vigila acá no es que mande mensajes: es que NO los mande cuando no
// debe. Escribirle a alguien que ya dijo que no, o cinco veces a quien no
// contesta, es lo que quema un dominio y un número de WhatsApp.

process.env.MK_SKIP_CONFIG_CHECK = '1';

const test = require('node:test');
const assert = require('node:assert');
const p = require('../prospeccion');

const HOY = new Date('2026-09-15T12:00:00Z');
const haceDias = (n) => new Date(HOY.getTime() - n * 86400000).toISOString();

const base = (extra = {}) => ({
  estado: 'investigado', canal: 'correo', email: 'marca@ejemplo.co',
  toques_enviados: 0, ...extra,
});

// ── Cuándo toca y cuándo no ────────────────────────────────────────────────

test('a un prospecto investigado le toca el primer mensaje de una', () => {
  const t = p.toqueQueToca(base(), HOY);
  assert.equal(t.toca, true);
  assert.equal(t.toque, 1);
});

test('uno recién encontrado no recibe nada hasta investigarlo', () => {
  const t = p.toqueQueToca(base({ estado: 'nuevo' }), HOY);
  assert.equal(t.toca, false);
  assert.match(t.motivo, /investigarlo/);
});

test('el segundo toque espera los tres días', () => {
  const ayer = p.toqueQueToca(
    base({ toques_enviados: 1, primer_toque_at: haceDias(1) }), HOY);
  assert.equal(ayer.toca, false);

  const alTercero = p.toqueQueToca(
    base({ toques_enviados: 1, primer_toque_at: haceDias(3) }), HOY);
  assert.equal(alTercero.toca, true);
  assert.equal(alTercero.toque, 2);
});

test('después del cuarto toque no hay quinto', () => {
  const t = p.toqueQueToca(
    base({ toques_enviados: 4, primer_toque_at: haceDias(30) }), HOY);
  assert.equal(t.toca, false);
  assert.match(t.motivo, /cadencia/);
});

// ── Lo que nunca puede pasar ───────────────────────────────────────────────

test('a quien pidió que no le escribamos NO se le escribe, pase lo que pase', () => {
  const t = p.toqueQueToca(
    base({ no_contactar: true, toques_enviados: 1, primer_toque_at: haceDias(90) }), HOY);
  assert.equal(t.toca, false);
});

test('quien ya contestó sale de la cadencia automática', () => {
  // Seguir mandando recordatorios a alguien que respondió es la forma más
  // rápida de perder a un cliente que ya estaba interesado.
  const t = p.toqueQueToca(
    base({ estado: 'respondio', toques_enviados: 1, primer_toque_at: haceDias(10) }), HOY);
  assert.equal(t.toca, false);
  assert.match(t.motivo, /contest/);
});

test('con reunión agendada tampoco se le insiste', () => {
  const t = p.toqueQueToca(base({ estado: 'reunion', toques_enviados: 2 }), HOY);
  assert.equal(t.toca, false);
});

test('a un cliente no se le prospecta', () => {
  const t = p.toqueQueToca(base({ estado: 'cliente', toques_enviados: 1 }), HOY);
  assert.equal(t.toca, false);
});

// ── La tanda del día ───────────────────────────────────────────────────────

test('el cupo diario se respeta por canal', () => {
  const muchos = Array.from({ length: 60 }, (_, i) =>
    base({ id: i, canal: 'correo', puntaje: i }));
  const r = p.tandaDelDia(muchos, { hoy: HOY, topes: { correo: 10 } });
  assert.equal(r.salen.length, 10);
  assert.equal(r.aplazados.length, 50);
});

test('lo que no cupo se dice, no se calla', () => {
  const muchos = Array.from({ length: 5 }, (_, i) => base({ id: i, puntaje: 1 }));
  const r = p.tandaDelDia(muchos, { hoy: HOY, topes: { correo: 2 } });
  assert.equal(r.aplazados.length, 3);
  assert.match(r.aplazados[0].razon, /cupo/);
});

test('primero salen los de mayor puntaje', () => {
  const lista = [
    base({ id: 'bajo', puntaje: 10 }),
    base({ id: 'alto', puntaje: 90 }),
    base({ id: 'medio', puntaje: 50 }),
  ];
  const r = p.tandaDelDia(lista, { hoy: HOY, topes: { correo: 2 } });
  assert.deepStrictEqual(r.salen.map(x => x.prospecto.id), ['alto', 'medio']);
});

test('Instagram y LinkedIn van a cola, no salen solos', () => {
  const lista = [
    base({ id: 'ig', canal: 'instagram', instagram: '@ig', puntaje: 99 }),
    base({ id: 'li', canal: 'linkedin', linkedin: 'in/li', puntaje: 98 }),
    base({ id: 'em', canal: 'correo', puntaje: 97 }),
  ];
  const r = p.tandaDelDia(lista, { hoy: HOY });
  assert.deepStrictEqual(r.salen.map(x => x.prospecto.id), ['em']);
  assert.deepStrictEqual(r.enCola.map(x => x.prospecto.id), ['ig', 'li']);
});

test('solo correo y WhatsApp se mandan solos', () => {
  assert.deepStrictEqual(p.canalesAutomaticos().sort(), ['correo', 'whatsapp']);
});

// ── El puntaje ─────────────────────────────────────────────────────────────

test('que ya trabaje con creadoras es lo que más pesa', () => {
  const yaTrabaja = p.puntuar({ trabaja_con_creadoras: true });
  const solo = p.puntuar({ vende_producto_fisico: true, tiene_tienda_online: true, pais: 'CO' });
  assert.ok(yaTrabaja.puntaje > solo.puntaje, 'no hay que explicarle el modelo a quien ya lo compró');
});

test('el puntaje explica de dónde salió cada punto', () => {
  const r = p.puntuar({ trabaja_con_creadoras: true, pais: 'CO' });
  assert.equal(r.porque.length, 2);
  assert.match(r.porque[0], /creadoras/);
});

test('una marca demasiado grande puntúa menos', () => {
  const normal = p.puntuar({ trabaja_con_creadoras: true, pais: 'CO' });
  const gigante = p.puntuar({ trabaja_con_creadoras: true, pais: 'CO', demasiado_grande: true });
  assert.ok(gigante.puntaje < normal.puntaje);
});

test('quien pidió que no lo contacten queda en cero, sume lo que sume', () => {
  const r = p.puntuar({
    trabaja_con_creadoras: true, vende_producto_fisico: true,
    tiene_tienda_online: true, pais: 'CO', no_contactar: true,
  });
  assert.equal(r.puntaje, 0);
});

// ── Las respuestas ─────────────────────────────────────────────────────────

test('un "no me interesa" lo saca para siempre', () => {
  const r = p.alResponder('Hola, no me interesa gracias');
  assert.equal(r.estado, 'no_interesa');
  assert.equal(r.no_contactar, true);
});

test('pedir la baja se respeta igual que un no', () => {
  for (const texto of ['STOP', 'quiero dar de baja', 'no escriban más por favor']) {
    assert.equal(p.alResponder(texto).no_contactar, true, texto);
  }
});

test('cualquier otra respuesta solo lo saca de la cadencia', () => {
  const r = p.alResponder('Hola, cuéntame más de qué se trata');
  assert.equal(r.estado, 'respondio');
  assert.equal(r.no_contactar, false);
});

// ── Cerrar los que no contestaron ──────────────────────────────────────────

test('se agota una semana después del último toque, no de inmediato', () => {
  const recien = base({ toques_enviados: 4, ultimo_toque_at: haceDias(2) });
  assert.equal(p.seAgoto(recien, HOY), false);

  const viejo = base({ toques_enviados: 4, ultimo_toque_at: haceDias(8) });
  assert.equal(p.seAgoto(viejo, HOY), true);
});

test('quien respondió nunca se marca como agotado', () => {
  const r = base({ estado: 'respondio', toques_enviados: 4, ultimo_toque_at: haceDias(30) });
  assert.equal(p.seAgoto(r, HOY), false);
});

// ── Los mensajes ───────────────────────────────────────────────────────────

const msg = require('../prospeccion-mensajes');

test('no se manda un primer contacto sin razón concreta', () => {
  // Es la guarda más importante del redactor: sin razón, el mensaje dice "vi
  // lo que están haciendo en redes", que es la frase que delata un envío
  // masivo. Gasta el contacto y no se recupera.
  assert.throws(() => msg.redactar('presentacion', { nombre: 'Marca X' }), /razón concreta/);
});

test('los cuatro toques dicen cosas distintas', () => {
  const p = { nombre: 'Marca X', razon: 'hacen algo específico', categoria: 'skincare' };
  const cuerpos = ['presentacion', 'recordatorio', 'valor', 'cierre']
    .map(t => msg.redactar(t, p).cuerpo);
  assert.equal(new Set(cuerpos).size, 4);
});

test('todos ofrecen una salida', () => {
  const p = { nombre: 'Marca X', razon: 'algo' };
  for (const t of ['presentacion', 'recordatorio', 'valor', 'cierre']) {
    const c = msg.redactar(t, p).cuerpo.toLowerCase();
    const haySalida = /no te escribo m|dímelo|no es para ustedes|avísame|si prefieres/.test(c);
    assert.ok(haySalida, `el toque ${t} no deja salida`);
  }
});

test('el asunto no repite la palabra marcas', () => {
  const a = msg.redactar('valor', { nombre: 'X', categoria: 'skincare' }).asunto;
  assert.ok(!/marcas de marcas/.test(a), a);
});

test('firma una persona, no una empresa', () => {
  assert.match(msg.REMITENTE, /^[A-ZÁÉÍÓÚÑ][^<]*</);
});

test('el mensaje de WhatsApp cabe antes del "ver más"', () => {
  // La primera línea es lo único que se ve en la notificación.
  const t = msg.paraWhatsApp({ nombre: 'X', contacto: 'Ana' });
  assert.ok(t.split('\n')[0].length < 120, 'la primera línea es muy larga');
  assert.match(t, /no te escribo m/);
});

// ── El buscador ────────────────────────────────────────────────────────────

const busc = require('../prospeccion-buscador');

test('la misma marca por dos caminos no se duplica', () => {
  const r = busc.fusionar([
    [{ nombre: 'Lumina Skin S.A.S.', fuente: 'lista' }],
    [{ nombre: 'lumina skin', email: 'hola@lumina.co', fuente: 'lista' }],
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].email, 'hola@lumina.co', 'debió completar el correo que faltaba');
});

test('cuando una marca llega por dos lados se conserva la mejor señal', () => {
  const r = busc.fusionar([
    [{ nombre: 'Lumina', fuente: 'lista' }],
    [{ nombre: 'Lumina', fuente: 'contenido', trabaja_con_creadoras: true, razon: 'ya hacen contenido' }],
  ]);
  assert.equal(r.length, 1);
  assert.equal(r[0].trabaja_con_creadoras, true);
  assert.equal(r[0].razon, 'ya hacen contenido');
});

test('el mismo correo con otro nombre tampoco se duplica', () => {
  const r = busc.fusionar([
    [{ nombre: 'Lumina Skin', email: 'hola@lumina.co' }],
    [{ nombre: 'Lumina Colombia', email: 'HOLA@LUMINA.CO' }],
  ]);
  assert.equal(r.length, 1);
});

test('las marcas que ya hacen contenido puntúan más alto', () => {
  const [yaHace, apenas] = busc.calificar([
    { nombre: 'A', fuente: 'contenido', trabaja_con_creadoras: true, pais: 'CO' },
    { nombre: 'B', sitio_web: 'https://b.co', instagram: '@b', email: 'b@b.co', pais: 'CO' },
  ]);
  assert.ok(yaHace.puntaje > apenas.puntaje);
  assert.match(yaHace.puntaje_porque[0], /creadoras/);
});

test('una lista pegada de Excel se entiende', () => {
  const r = busc.desdeTexto(
    'Lumina Skin\thola@lumina.co\t@luminaskin\n' +
    'Fauno Cosmética\tcontacto@fauno.co'
  );
  assert.equal(r.length, 2);
  assert.equal(r[0].nombre, 'Lumina Skin');
  assert.equal(r[0].email, 'hola@lumina.co');
  assert.equal(r[0].instagram, '@luminaskin');
  assert.equal(r[1].email, 'contacto@fauno.co');
});

test('las líneas vacías no se vuelven prospectos', () => {
  assert.equal(busc.desdeTexto('\n\n  \n').length, 0);
});

test('S.A.S. y tildes no hacen que una marca parezca dos', () => {
  assert.equal(busc.clave('Cosmética Fauno S.A.S.'), busc.clave('cosmetica fauno'));
});

test('el buscador cubre las 15 categorías, no solo belleza', () => {
  // El catálogo tiene creadoras de mascotas, gaming y finanzas. Buscar solo
  // cosméticos deja por fuera catorce quinceavos del mercado.
  assert.equal(busc.CATEGORIAS.length, 15);
  for (const c of ['mascotas', 'gaming', 'finanzas', 'comida', 'movilidad']) {
    assert.ok(busc.CATEGORIAS.includes(c), `falta ${c}`);
  }
});

test('los multiplicadores no son todos de belleza', () => {
  const transversales = busc.MULTIPLICADORES.filter(m => m.categoria === 'todas');
  assert.ok(transversales.length >= 4, 'casi todos servían solo para belleza');
});

test('sin correo no entra a la fila, aunque el canal diga correo', () => {
  // Lo destapó la cola antes de mandar nada: 12 prospectos "saldrían" por
  // correo sin tener correo. Habrían gastado cupo, fallado, y —lo peor— el
  // intento fallido deja escrito el toque 1, que no se repite: cuando
  // consiguiéramos su dirección ya no se les podría mandar el primero.
  const t = p.toqueQueToca(base({ canal: 'correo', email: null }), HOY);
  assert.equal(t.toca, false);
  assert.match(t.motivo, /falta su email/);
});

test('cada canal exige su propio dato', () => {
  assert.equal(p.tieneComoContactar({ canal: 'correo', email: 'a@b.co' }), true);
  assert.equal(p.tieneComoContactar({ canal: 'correo', instagram: '@x' }), false);
  assert.equal(p.tieneComoContactar({ canal: 'whatsapp', telefono: '+573001112233' }), true);
  assert.equal(p.tieneComoContactar({ canal: 'instagram', instagram: '@x' }), true);
  assert.equal(p.tieneComoContactar({ canal: 'correo', email: '   ' }), false, 'un espacio no es un correo');
});

test('la tanda deja fuera a los que no tienen cómo contactarse', () => {
  const lista = [
    base({ id: 'con', canal: 'correo', email: 'a@b.co', puntaje: 10 }),
    base({ id: 'sin', canal: 'correo', email: null, puntaje: 99 }),
  ];
  const r = p.tandaDelDia(lista, { hoy: HOY });
  assert.deepStrictEqual(r.salen.map(x => x.prospecto.id), ['con'],
    'el de puntaje 99 no puede salir si no hay a dónde escribirle');
});

// ── Sacar el contacto del sitio ────────────────────────────────────────────

const ct = require('../prospeccion-contacto');

test('encuentra el correo del mailto antes que el suelto en el texto', () => {
  const html = 'texto suelto@marca.co más texto <a href="mailto:hola@marca.co">escríbenos</a>';
  assert.equal(ct.correosDe(html)[0], 'hola@marca.co',
    'el del mailto es el que la marca puso para que le escriban');
});

test('descarta los correos que pone la plantilla, no la marca', () => {
  const html = 'a@sentry.io b@wixpress.com noreply@marca.co real@marca.co';
  assert.deepStrictEqual(ct.correosDe(html), ['real@marca.co']);
});

test('el WhatsApp sale de wa.me y de los tel:', () => {
  assert.deepStrictEqual(
    ct.whatsappDe('<a href="https://wa.me/573001112233">Escríbenos</a>'),
    ['+573001112233']);
  assert.deepStrictEqual(
    ct.whatsappDe('<a href="tel:+57 300 111 2233">Llámanos</a>'),
    ['+573001112233']);
});

test('un número que no es celular colombiano no pasa por WhatsApp', () => {
  // Sin esto entran números de factura, NIT y códigos de seguimiento.
  assert.deepStrictEqual(ct.whatsappDe('tel:6013456789'), [], 'eso es un fijo');
  assert.deepStrictEqual(ct.whatsappDe('Factura 900123456-7'), []);
});

test('el mismo número con y sin indicativo es uno solo', () => {
  const r = ct.whatsappDe('wa.me/573001112233 y tel:3001112233');
  assert.equal(r.length, 1);
});

test('de Instagram se saca la cuenta, no la ruta de un post', () => {
  const html = 'instagram.com/p/ABC123 instagram.com/marcareal instagram.com/marcareal';
  assert.equal(ct.instagramDe(html)[0], '@marcareal');
});

test('gana el usuario que más se repite: es el del pie de página', () => {
  const html = 'instagram.com/lamarca instagram.com/lamarca instagram.com/unafotografa';
  assert.equal(ct.instagramDe(html)[0], '@lamarca');
});

test('con WhatsApp y correo se prefiere WhatsApp', () => {
  // En marcas pequeñas colombianas contesta más y más rápido.
  assert.equal(ct.canalPara({ email: 'a@b.co', telefono: '+573001112233' }), 'whatsapp');
  assert.equal(ct.canalPara({ email: 'a@b.co' }), 'correo');
  assert.equal(ct.canalPara({ instagram: '@x' }), 'instagram');
  assert.equal(ct.canalPara({}), null);
});

test('una dirección de sitio inválida no revienta', async () => {
  const r = await ct.contactosDeSitio('no es una url');
  assert.equal(r.ok, false);
});
