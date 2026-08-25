// Correos transaccionales de Creators Manager.
//
// Remitente propio: estos correos NO pueden salir del Gmail de Brujería Capilar
// o delatarían que el marketplace es de la marca, que es justo lo que el
// producto promete no hacer.
//
// Regla de oro: un correo que falla NUNCA tumba una transición de estado. Todas
// las funciones capturan su propio error y lo registran. Quien las llama lo hace
// sin await bloqueante.
//
// WhatsApp queda fuera de la Fase 1: el equipo copia el mensaje desde el panel
// admin si quiere avisar por ese canal.

const nodemailer = require('nodemailer');
const config = require('./config');
const fetch = require('node-fetch');
const { formatearCOP } = require('./comisiones');

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let _transporte = null;

function transporte() {
  if (_transporte) return _transporte;
  if (!config.smtp.user || !config.smtp.pass) return null;
  // Con MK_SMTP_HOST se puede usar cualquier proveedor —Zoho, Brevo, el que
  // sea—. Sin ella se asume Gmail, que es de donde salio esto. Importa porque
  // el remitente deberia ser del dominio propio, y Gmail no manda correo
  // "desde" un dominio que no administra.
  _transporte = nodemailer.createTransport(
    config.smtp.host
      ? {
          host: config.smtp.host,
          port: config.smtp.puerto,
          secure: config.smtp.puerto === 465,
          auth: { user: config.smtp.user, pass: config.smtp.pass },
        }
      : {
          service: 'gmail',
          auth: { user: config.smtp.user, pass: config.smtp.pass },
        }
  );
  return _transporte;
}

/**
 * Parte "Nombre <correo@dominio>" en las dos piezas que pide la API.
 * Si viene solo el correo, el nombre queda vacío y Brevo usa el del remitente.
 */
function remitente() {
  const crudo = String(config.smtp.remitente || '');
  const m = crudo.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  return m ? { name: m[1], email: m[2] } : { email: crudo.trim() };
}

/** Envío por la API web de Brevo. Es el camino que funciona desde Railway. */
async function enviarPorApi(para, asunto, cuerpoHTML) {
  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': config.brevo_api_key,
      'content-type': 'application/json',
      'accept': 'application/json',
    },
    body: JSON.stringify({
      sender: remitente(),
      to: [{ email: para }],
      subject: asunto,
      htmlContent: plantilla(cuerpoHTML),
    }),
  });

  if (!r.ok) {
    // El cuerpo del error de Brevo dice exactamente qué pasó —remitente sin
    // verificar, llave inválida, cuota agotada—. Sin él, depurar es adivinar.
    const detalle = await r.text().catch(() => '');
    throw new Error(`Brevo respondió ${r.status}: ${detalle.slice(0, 300)}`);
  }
  return true;
}

async function enviar(para, asunto, cuerpoHTML) {
  if (!para) {
    console.warn(`[notif] Sin destinatario para "${asunto}"`);
    return false;
  }

  try {
    if (config.brevo_api_key) {
      await enviarPorApi(para, asunto, cuerpoHTML);
      return true;
    }

    const t = transporte();
    if (!t) {
      console.warn(`[notif] Correo sin configurar — no se envió "${asunto}" a ${para}`);
      return false;
    }
    await t.sendMail({
      from: config.smtp.remitente,
      to: para,
      subject: asunto,
      html: plantilla(cuerpoHTML),
    });
    return true;
  } catch (e) {
    console.error(`[notif] Falló el envío de "${asunto}":`, e.message);
    return false;
  }
}

// Envoltura visual mínima, en el sistema del handoff: negro, lima, monoespaciada.
function plantilla(contenido) {
  return `
<div style="font-family:'Space Mono',ui-monospace,Menlo,monospace;background:#F2F2F2;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:2px solid #0E0E0E">
    <div style="background:#0E0E0E;padding:16px 20px">
      <span style="display:inline-block;background:#D6FF00;color:#0E0E0E;font-weight:800;padding:4px 7px;letter-spacing:-0.5px">C</span>
      <span style="color:#F2F2F2;font-weight:800;letter-spacing:-0.5px;margin-left:8px">CREATORS MANAGER</span>
    </div>
    <div style="padding:24px 20px;color:#0E0E0E;font-size:13px;line-height:1.7">
      ${contenido}
    </div>
    <div style="border-top:2px solid #0E0E0E;padding:12px 20px;font-size:10.5px;letter-spacing:1px;color:#7A7A7A">
      COLOMBIA / 2026
    </div>
  </div>
</div>`;
}

const boton = (texto, url) =>
  `<a href="${url}" style="display:inline-block;background:#D6FF00;color:#0E0E0E;font-weight:700;text-decoration:none;padding:12px 20px;margin-top:12px;border:2px solid #0E0E0E">${texto} &rarr;</a>`;

const urlTrato = (lado, id) => `${config.base_url}/${lado}.html#/trato/${id}`;

// ── Invitación al banco de creadoras ────────────────────────────────────────

/**
 * De dónde salió su perfil. Cambia según lo que la persona hizo de verdad con
 * la marca: escribirle "trabajaste con nosotros" a alguien que solo se registró
 * se nota, y a quien sí trabajó le importa que se lo reconozcan.
 */
const ORIGEN = {
  'Contenido Entregado':
    'Tu perfil nos llegó recomendado por una marca con la que ya trabajaste, y con la que cumpliste.',
  'Producto Enviado':
    'Tu perfil nos llegó recomendado por una marca con la que ya trabajaste.',
  'Calificada':
    'Tu perfil nos llegó recomendado por una marca que te seleccionó para trabajar con ella.',
  'Pausada':
    'Tu perfil nos llegó recomendado por una marca con la que estuviste.',
  'Descartada':
    'Tu perfil nos llegó recomendado por una marca con la que te registraste.',
  'Registrada':
    'Tu perfil nos llegó recomendado por una marca con la que te registraste.',
};

/**
 * Invitación al prelanzamiento.
 *
 * El asunto no menciona pagos a propósito: no toda colaboración es en dinero
 * —hay canje— y prometer plata en el asunto para después matizarlo adentro es
 * la clase de cosa que hace que la siguiente no se abra.
 */
function invitacionCreadora({ email, nombre, status, codigoRef }) {
  const saludo = nombre ? `${String(nombre).split(' ')[0]},` : 'Hola,';
  const origen = ORIGEN[status] || ORIGEN['Registrada'];
  // Dos enlaces distintos a propósito: el suyo va limpio —si llevara su propio
  // código quedaría referida por sí misma y gastaría uno de sus dos cupos— y el
  // que comparte sí lo lleva, que es lo que atribuye a sus amigas.
  const urlPropia = `${config.base_url}/invitacion.html`;
  const urlParaCompartir = codigoRef
    ? `${urlPropia}?ref=${encodeURIComponent(codigoRef)}`
    : urlPropia;

  const bloqueReferidos = codigoRef ? `
     <div style="border:2px solid #0E0E0E;background:#D6FF00;padding:14px 16px;margin-top:20px">
       <div style="font-weight:800;letter-spacing:-0.3px;margin-bottom:6px">TRAES A DOS</div>
       <div style="font-size:12.5px;line-height:1.65">
         Tu cupo incluye dos invitaciones para creadoras que tú elijas. Comparte
         este enlace y entran contigo al prelanzamiento:<br>
         <span style="display:inline-block;background:#fff;border:1px solid #0E0E0E;padding:6px 9px;margin-top:8px;font-size:11.5px;word-break:break-all">${urlParaCompartir}</span>
       </div>
     </div>` : '';

  return enviar(
    email,
    'Fuiste seleccionada para el prelanzamiento en Colombia - Creadores de Contenido',
    `<p style="font-size:13px;color:#5A5A5A;margin:0 0 16px">${esc(saludo)}</p>

     <p style="font-size:17px;font-weight:800;letter-spacing:-0.6px;line-height:1.3;margin:0 0 14px">
       Por fin en Colombia.</p>

     <p>Lo que en otros países ya cambió la forma de trabajar entre marcas y creadoras
     llega acá: <strong>Creators Manager</strong>, la plataforma donde las marcas
     encuentran creadoras, acuerdan la colaboración y el trato queda respaldado de
     principio a fin. Se acabó cerrar todo por mensajes directos y confiar en que la
     otra parte cumpla.</p>

     <p>${origen} Por eso estás entre las primeras invitadas al prelanzamiento.</p>

     <div style="border-left:3px solid #0E0E0E;padding-left:14px;margin:18px 0">
       <p style="margin:0 0 10px"><strong>Tú defines tus condiciones.</strong> Fijas tu tarifa
       por cada tipo de contenido, y decides qué colaboraciones aceptas y cuáles no.</p>
       <p style="margin:0 0 10px"><strong>Los acuerdos quedan respaldados.</strong> Lo pactado se
       registra antes de que empieces a trabajar, y se cumple.</p>
       <p style="margin:0"><strong>Colaboraciones de todo tipo.</strong> En dinero, en producto o
       ambas: cada marca publica lo que ofrece y tú eliges.</p>
     </div>

     <p><strong>Tu cupo en el prelanzamiento es gratuito</strong> y no tiene mensualidad.
     Crear tu perfil toma unos minutos.</p>

     ${boton('VER MI INVITACIÓN', urlPropia)}
     ${bloqueReferidos}

     <p style="margin-top:24px;font-size:11px;color:#7A7A7A;line-height:1.6">
       Creators Manager es un servicio de COLBELLEZA LATAM S.A.S., NIT 901.519.449-0,
       Medellín, Colombia. Recibiste este correo porque tu perfil fue recomendado para
       el prelanzamiento. Si prefieres no participar, ignora este mensaje.
     </p>`,
  );
}

/**
 * Recordatorio a quien dejó el perfil a medias.
 *
 * Dice exactamente qué falta, no un "completa tu perfil" genérico: la creadora
 * ya intentó una vez, y si no supo qué le faltaba entonces, repetírselo igual
 * no ayuda. Y ofrece la salida de la tarifa, que es donde casi todas se traban.
 */
function recordatorioPerfil({ email, nombre, falta = [] }) {
  const saludo = nombre ? `${String(nombre).split(' ')[0]},` : 'Hola,';
  const lista = falta.map(f => `<li style="margin-bottom:7px">${esc(f)}</li>`).join('');

  return enviar(
    email,
    'Te falta poco para entrar al banco de creadoras',
    `<p style="font-size:13px;color:#5A5A5A;margin:0 0 16px">${esc(saludo)}</p>

     <p style="font-size:16px;font-weight:800;letter-spacing:-0.4px;margin:0 0 14px">
       Tu perfil quedó a medio camino.</p>

     <p>Creaste tu cuenta pero todavía no apareces en el catálogo, así que ninguna
     marca puede encontrarte. Te falta:</p>

     <ul style="margin:14px 0 18px;padding-left:20px">${lista}</ul>

     <div style="border:2px solid #0E0E0E;background:#D6FF00;padding:14px 16px;margin:18px 0">
       <div style="font-weight:800;letter-spacing:-0.3px;margin-bottom:6px">¿NO SABES QUÉ COBRAR?</div>
       <div style="font-size:12.5px;line-height:1.65">
         Es lo más difícil y a casi todas les pasa. No tienes que decidirlo ahora:
         en la sección de tarifas puedes marcar <strong>"prefiero conversar el precio"</strong>
         y publicarte igual. Después le pones número, cuando tengas más claro.
       </div>
     </div>

     ${boton('TERMINAR MI PERFIL', `${config.base_url}/creadora.html`)}

     <p style="margin-top:22px;font-size:11px;color:#7A7A7A;line-height:1.6">
       Si ya no te interesa, ignora este correo. No volvemos a insistir.
     </p>`,
  );
}

// ── Alta de creadoras ───────────────────────────────────────────────────────

/** A la creadora recién registrada: qué sigue, en concreto. */
function bienvenidaCreadora({ creadora }) {
  return enviar(
    creadora.email,
    'Ya tienes perfil en Creators Manager',
    `<p>Hola ${esc(creadora.nombre_publico)}, tu perfil quedó creado.</p>
     <p style="background:#D6FF00;padding:10px;border:2px solid #0E0E0E">
       <strong>Lo que sigue:</strong> entra y pon tus tarifas.<br>
       <span style="font-size:11px;color:#3A3A3A">Sin precio publicado no podemos mostrarte a las marcas.</span>
     </p>
     <p>Cuando las tengas, revisamos tu perfil y te avisamos por acá cuando esté publicado.</p>
     ${boton('PONER MIS TARIFAS', `${config.base_url}/creadora.html`)}`
  );
}

/** Al equipo: hay alguien nuevo esperando revisión. */
function avisoPerfilNuevo({ creadora, instagram, tiktok, alcance }) {
  if (!config.smtp.user) return Promise.resolve(false);
  return enviar(
    config.smtp.user,
    `Nueva creadora registrada: ${creadora.nombre_publico}`,
    `<p>Se registró una creadora nueva. Todavía no aparece en el catálogo.</p>
     <p>
       <strong>${esc(creadora.nombre_publico)}</strong><br>
       ${instagram ? `Instagram: @${esc(instagram)}<br>` : ''}
       ${tiktok ? `TikTok: @${esc(tiktok)}<br>` : ''}
       Seguidores declarados: ${Number(alcance || 0).toLocaleString('es-CO')}<br>
       ${creadora.ciudad ? `Ciudad: ${esc(creadora.ciudad)}` : ''}
     </p>
     <p style="font-size:11px;color:#7A7A7A">Verifica las cuentas antes de aprobarla.</p>
     ${boton('REVISAR EN EL PANEL', `${config.base_url}/admin.html`)}`
  );
}

/** Al equipo: ya puso tarifas, está lista para que la revisen. */
function avisoListaParaRevisar({ creadora }) {
  if (!config.smtp.user) return Promise.resolve(false);
  return enviar(
    config.smtp.user,
    `Lista para revisar: ${creadora.nombre_publico}`,
    `<p><strong>${esc(creadora.nombre_publico)}</strong> ya publicó sus tarifas y está esperando aprobación.</p>
     ${boton('REVISAR', `${config.base_url}/admin.html`)}`
  );
}

/** A la creadora: su perfil quedó publicado. */
function perfilAprobado({ creadora }) {
  return enviar(
    creadora.email,
    'Tu perfil ya está publicado',
    `<p>Listo, ${esc(creadora.nombre_publico)}: las marcas ya te pueden encontrar en el banco.</p>
     <p>Cuando alguna quiera trabajar contigo te llega la propuesta por acá, con el valor que recibirías.</p>
     ${boton('VER MI PERFIL', `${config.base_url}/creadora.html`)}`
  );
}

/** Enlace para volver a entrar. Sirve para creadoras y para marcas. */
function resetClave({ email, token, lado }) {
  const pagina = lado === 'marca' ? 'registro.html' : 'creadora.html';
  const url = `${config.base_url}/${pagina}#recuperar=${token}`;
  return enviar(
    email,
    'Recupera tu contraseña · Creators Manager',
    `<p>Pediste volver a entrar a tu cuenta.</p>
     <p>Este enlace sirve una sola vez y vence en una hora.</p>
     ${boton('CREAR NUEVA CONTRASEÑA', url)}
     <p style="font-size:11px;color:#7A7A7A;margin-top:14px">
       Si no fuiste tú, ignora este correo: tu contraseña sigue igual.
     </p>`
  );
}

// ── Eventos del trato ───────────────────────────────────────────────────────

/** A la creadora: le llegó una propuesta. Va con el neto, no con el bruto. */
function nuevaSolicitud({ trato, creadora, marca }) {
  return enviar(
    creadora.email,
    `Nueva propuesta de colaboración · ${formatearCOP(trato.neto_a_recibir_creadora)}`,
    `<p><strong>${marca?.nombre_empresa || 'Una marca'}</strong> quiere colaborar contigo.</p>
     <p style="background:#D6FF00;padding:10px;border:2px solid #0E0E0E">
       Recibes: <strong style="font-size:16px">${formatearCOP(trato.neto_a_recibir_creadora)}</strong><br>
       <span style="font-size:11px;color:#3A3A3A">Monto acordado ${formatearCOP(trato.monto_creadora)} menos ${trato.comision_creadora_pct}% de comisión</span>
     </p>
     <p><strong>Brief:</strong> ${trato.brief}</p>
     ${trato.fecha_entrega_esperada ? `<p><strong>Entrega esperada:</strong> ${trato.fecha_entrega_esperada}</p>` : ''}
     <p>Entra a tu perfil para aceptar o rechazar.</p>
     ${boton('VER LA PROPUESTA', urlTrato('creadora', trato.id))}`
  );
}

/** A la marca: la creadora dijo que sí, falta pagar. */
function tratoAceptado({ trato, marca }) {
  return enviar(
    marca.email,
    `Propuesta aceptada · ${trato.codigo}`,
    `<p>La creadora aceptó tu propuesta.</p>
     <p style="background:#D6FF00;padding:10px;border:2px solid #0E0E0E">
       Total a pagar: <strong style="font-size:16px">${formatearCOP(trato.total_a_pagar_marca)}</strong><br>
       <span style="font-size:11px;color:#3A3A3A">${formatearCOP(trato.monto_creadora)} + ${trato.comision_marca_pct}% de comisión</span>
     </p>
     <p>Escríbenos para coordinar el pago. Apenas quede retenido, se abren los datos de contacto entre las dos partes y la creadora arranca.</p>
     ${boton('VER EL TRATO', urlTrato('trato', trato.id))}`
  );
}

function tratoRechazado({ trato, marca }) {
  return enviar(
    marca.email,
    `Propuesta rechazada · ${trato.codigo}`,
    `<p>La creadora no pudo tomar esta colaboración${trato.motivo_rechazo ? `: <em>${trato.motivo_rechazo}</em>` : '.'}</p>
     <p>No se hizo ningún cobro. Puedes proponerle a otra creadora del banco.</p>
     ${boton('VOLVER AL CATÁLOGO', `${config.base_url}/catalogo.html`)}`
  );
}

/** A ambas partes: el dinero está en custodia y ya pueden hablar directo. */
async function pagoRetenido({ trato, marca, contacto }) {
  const aMarca = enviar(
    marca.email,
    `Pago retenido · ya puedes hablar con la creadora · ${trato.codigo}`,
    `<p>Recibimos tu pago. El dinero queda retenido y se libera cuando apruebes el contenido.</p>
     <p style="background:#D6FF00;padding:10px;border:2px solid #0E0E0E">
       <strong>Contacto de la creadora</strong><br>
       ${contacto?.nombre_real || contacto?.nombre_publico || ''}<br>
       ${contacto?.instagram ? `Instagram: @${contacto.instagram}<br>` : ''}
       ${contacto?.telefono ? `WhatsApp: ${contacto.telefono}<br>` : ''}
       ${contacto?.email ? `Correo: ${contacto.email}` : ''}
     </p>
     <p style="font-size:11px;color:#7A7A7A">Recuerda: contratar por fuera de la plataforma a una creadora que conociste aquí sigue causando la comisión (cláusula 7 de los términos).</p>
     ${boton('VER EL TRATO', urlTrato('trato', trato.id))}`
  );

  const aCreadora = enviar(
    contacto?.email,
    `Ya está el pago · puedes empezar · ${trato.codigo}`,
    `<p>El pago de <strong>${marca.nombre_empresa}</strong> ya está retenido en la plataforma. Tienes garantizado tu dinero: se te libera apenas la marca apruebe el contenido.</p>
     <p style="background:#D6FF00;padding:10px;border:2px solid #0E0E0E">
       Recibes al terminar: <strong style="font-size:16px">${formatearCOP(trato.neto_a_recibir_creadora)}</strong>
     </p>
     <p><strong>Contacto de la marca:</strong> ${marca.nombre_contacto} · ${marca.email}${marca.whatsapp ? ` · ${marca.whatsapp}` : ''}</p>
     ${boton('VER EL TRATO', urlTrato('creadora', trato.id))}`
  );

  return Promise.all([aMarca, aCreadora]);
}

function contenidoEntregado({ trato, marca }) {
  return enviar(
    marca.email,
    `Contenido entregado · falta tu aprobación · ${trato.codigo}`,
    `<p>La creadora entregó el contenido. Revísalo y apruébalo para liberar el pago, o pide ajustes si algo no cumple el brief.</p>
     ${boton('REVISAR EL CONTENIDO', urlTrato('trato', trato.id))}`
  );
}

function contenidoAprobado({ trato, creadora }) {
  return enviar(
    creadora.email,
    `Contenido aprobado · viene tu pago · ${trato.codigo}`,
    `<p>La marca aprobó tu contenido. Vamos a liberarte el pago de <strong>${formatearCOP(trato.neto_a_recibir_creadora)}</strong>.</p>
     ${boton('VER EL TRATO', urlTrato('creadora', trato.id))}`
  );
}

function pagoLiberado({ trato, creadora }) {
  return enviar(
    creadora.email,
    `Pago enviado · ${formatearCOP(trato.neto_a_recibir_creadora)} · ${trato.codigo}`,
    `<p>Te transferimos <strong>${formatearCOP(trato.neto_a_recibir_creadora)}</strong> por esta colaboración. Gracias por tu trabajo.</p>
     <p>Esta colaboración ya cuenta en tu historial: entre más cierras, mejor tarifa puedes pedir.</p>
     ${boton('VER MI PERFIL', `${config.base_url}/creadora.html`)}`
  );
}

module.exports = {
  enviar,
  invitacionCreadora, recordatorioPerfil,
  bienvenidaCreadora, avisoPerfilNuevo, avisoListaParaRevisar, perfilAprobado, resetClave,
  nuevaSolicitud, tratoAceptado, tratoRechazado,
  pagoRetenido, contenidoEntregado, contenidoAprobado, pagoLiberado,
};
