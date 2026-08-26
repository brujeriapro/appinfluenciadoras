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
const correo = require('./correo');
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
// Qué proveedor manda el correo vive en correo.js, no aquí: cambiarlo es poner
// otra llave en el entorno. Este archivo solo se ocupa de qué dice cada mensaje.
async function enviarPorApi(para, asunto, cuerpoHTML) {
  return correo.enviar({
    para,
    asunto,
    html: plantilla(cuerpoHTML),
    remitente: config.smtp.remitente,
  });
}

async function enviar(para, asunto, cuerpoHTML) {
  if (!para) {
    console.warn(`[notif] Sin destinatario para "${asunto}"`);
    return false;
  }

  try {
    if (correo.activo()) {
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

/**
 * ¿Puede este servicio mandar correo ahora mismo?
 *
 * Existe porque el envío falla en silencio a propósito —un correo caído no
 * puede tumbar un registro— y el error real se queda en los logs de Railway,
 * que no siempre están a mano. Sin esto, "no me llegó el correo" es
 * indistinguible de "el correo salió y se fue a spam".
 *
 * Lo que más veces va a explicar el problema es la cuota: el plan gratuito de
 * Brevo son 300 correos al día, y una tanda de invitaciones se los come.
 */
async function diagnostico() {
  const d = await correo.diagnostico();
  if (d.ok || d.via) return { ...d, remitente: config.smtp.remitente };

  // Sin proveedor por API queda el SMTP, que en Railway no sirve: bloquean los
  // puertos de salida. Conviene decirlo con nombre y apellido en vez de dejar a
  // alguien peleando con credenciales que nunca iban a funcionar.
  return {
    ...d,
    via: config.smtp.user ? 'smtp' : 'ninguna',
    motivo: config.smtp.user
      ? 'Solo hay SMTP configurado, y Railway bloquea los puertos de salida: no sale nada. '
        + d.motivo
      : d.motivo,
  };
}

/** Manda un correo de prueba y devuelve el error real si falla. */
async function probar(para) {
  if (!para) return { ok: false, error: 'Falta el correo de destino' };
  const p = correo.activo();
  if (!p) return { ok: false, error: 'No hay proveedor de correo configurado' };
  try {
    await enviarPorApi(para, `Prueba de correo · ${p.nombre}`,
      `<p>Si estás leyendo esto, el correo del marketplace está saliendo bien por
       <strong>${p.nombre}</strong>.</p>`);
    return { ok: true, via: p.nombre };
  } catch (e) {
    // A diferencia de enviar(), aquí el error sube: es justo lo que se vino a ver.
    return { ok: false, via: p.nombre, error: e.message };
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

// ── Invitación a la plataforma ────────────────────────────────────────

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
    'Te falta poco para quedar publicada',
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
/**
 * Quedó publicada.
 *
 * Es el momento de más orgullo de toda su experiencia —acaba de pasar una
 * revisión— y por eso es el mejor para pedirle que invite. Pedírselo en
 * cualquier otro momento se siente como una tarea; aquí se siente como un
 * privilegio que acaba de ganar.
 */
function perfilAprobado({ creadora, codigoRef }) {
  const enlace = codigoRef
    ? `${config.base_url}/invitacion.html?ref=${encodeURIComponent(codigoRef)}`
    : null;

  return enviar(
    creadora.email,
    'Quedaste adentro: tu perfil ya está publicado',
    `<p style="font-size:16px;font-weight:800;letter-spacing:-0.4px;margin:0 0 14px">
       Listo, ${esc(creadora.nombre_publico)}. Pasaste la revisión.</p>

     <p>Tu perfil ya está publicado y las marcas te pueden encontrar. Cuando
     alguna quiera trabajar contigo te llega la propuesta acá, con lo que recibirías.</p>

     <!-- La imagen se dibuja en el navegador de ella, asi que no se puede
          adjuntar aqui: se la manda a buscar al portal, donde el boton es lo
          primero que ve al entrar. -->
     <div style="border:2px solid #0E0E0E;padding:16px 18px;margin:22px 0">
       <div style="font-weight:800;letter-spacing:-0.3px;margin-bottom:7px">CUÉNTALO</div>
       <div style="font-size:12.5px;line-height:1.65;margin-bottom:14px">
         Te armamos una imagen con tu foto para que la publiques en tus historias.
         Las marcas que ya te siguen van a saber dónde contratarte.
       </div>
       ${boton('DESCARGAR MI HISTORIA', `${config.base_url}/creadora.html`)}
     </div>

     ${enlace ? `
     <div style="border:2px solid #0E0E0E;background:#D6FF00;padding:15px 17px;margin-top:24px">
       <div style="font-weight:800;letter-spacing:-0.3px;margin-bottom:7px">TIENES DOS INVITACIONES</div>
       <div style="font-size:12.5px;line-height:1.65">
         Ahora que estás adentro puedes traer a dos creadoras. Y no es solo un favor:
         <strong>cada una que traigas sube tu prioridad</strong>, que decide quién ve las
         campañas primero y quién sale antes en el catálogo.<br><br>
         Comparte tu enlace:<br>
         <span style="display:inline-block;background:#fff;border:1px solid #0E0E0E;padding:7px 10px;margin-top:9px;font-size:11.5px;word-break:break-all">${enlace}</span>
       </div>
     </div>` : ''}

     <p style="margin-top:22px;font-size:12px;color:#5A5A5A;line-height:1.6">
       Un consejo: los perfiles con varias piezas de trabajo reciben muchas más
       propuestas. Si te falta subir alguna, es el mejor momento.
     </p>`
  );
}

/**
 * Alguien entró por su invitación.
 *
 * Es el refuerzo que faltaba: sin esto una creadora comparte su enlace y nunca
 * sabe si sirvió, así que no vuelve a compartirlo. Se manda cuando la referida
 * queda publicada, no cuando se registra — para que lo que se celebre sea
 * haber traído a alguien que sí pasó el filtro.
 */
function trajisteUna({ creadora, nombreReferida, restantes, prioridad, traidas }) {
  return enviar(
    creadora.email,
    `${nombreReferida} entró por tu invitación`,
    `<p style="font-size:16px;font-weight:800;letter-spacing:-0.4px;margin:0 0 14px">
       Trajiste a una, ${esc(creadora.nombre_publico)}.</p>

     <p><strong>${esc(nombreReferida)}</strong> creó su perfil con tu enlace y ya quedó
     publicada. Eso dice mucho de tu ojo: no cualquiera pasa la revisión.</p>

     <div style="border:2px solid #0E0E0E;background:#D6FF00;padding:15px 17px;margin:20px 0">
       <div style="font-weight:800;letter-spacing:-0.3px;margin-bottom:7px">SUBISTE TU PRIORIDAD</div>
       <div style="font-size:12.5px;line-height:1.65">
         Ahora tienes <strong>${prioridad} puntos</strong>. La prioridad decide dos cosas:
         quién ve las campañas primero cuando abramos a las marcas, y quién sale antes en
         el catálogo entre perfiles parecidos.<br><br>
         Llevas <strong>${traidas}</strong> ${traidas === 1 ? 'creadora traída' : 'creadoras traídas'}
         y te quedan <strong>${restantes}</strong> invitaciones.
       </div>
     </div>

     ${boton('VER MI PERFIL', `${config.base_url}/creadora.html`)}`
  );
}

/**
 * Segundo toque a quien recibió la invitación y nunca creó su perfil.
 *
 * De las invitaciones enviadas se registró una de cada tres. Las otras dos no
 * dijeron que no: la mayoría abrió el correo un día ocupado y no volvió. Por
 * eso este mensaje no repite el argumento de venta —ya lo leyó— sino que quita
 * la fricción: dice cuánto toma, que es gratis y que el cupo no dura para
 * siempre.
 *
 * La urgencia es real y por eso se puede escribir: cuando se abra a las marcas,
 * quien no tenga perfil publicado no aparece en las búsquedas. No es una fecha
 * inventada para apurar.
 */
function invitacionSegundoToque({ email, nombre, codigoRef }) {
  const saludo = nombre ? `${String(nombre).split(' ')[0]},` : 'Hola,';
  const urlPropia = `${config.base_url}/invitacion.html`;
  const urlParaCompartir = codigoRef
    ? `${urlPropia}?ref=${encodeURIComponent(codigoRef)}`
    : urlPropia;

  return enviar(
    email,
    'Tu cupo en Creators Manager sigue reservado',
    `<p style="font-size:13px;color:#5A5A5A;margin:0 0 16px">${esc(saludo)}</p>

     <p style="font-size:17px;font-weight:800;letter-spacing:-0.6px;line-height:1.3;margin:0 0 14px">
       Todavía no has creado tu perfil.</p>

     <p>Te escribimos hace unos días para invitarte al prelanzamiento de
     <strong>Creators Manager</strong> en Colombia. Tu cupo sigue ahí, pero queremos
     ser claras sobre por qué vale la pena hacerlo ahora y no después.</p>

     <div style="border-left:3px solid #0E0E0E;padding-left:14px;margin:18px 0">
       <p style="margin:0 0 10px"><strong>Toma unos minutos.</strong> Tu Instagram, en qué
       eres buena y un par de piezas de tu trabajo. Nada más.</p>
       <p style="margin:0 0 10px"><strong>No tienes que poner precios si no quieres.</strong>
       Puedes dejar tu tarifa abierta a negociación y definirla trato por trato.</p>
       <p style="margin:0"><strong>Es gratis y no tiene mensualidad.</strong> Ni ahora ni
       cuando salgamos del prelanzamiento.</p>
     </div>

     <p>Cuando abramos a las marcas, ellas van a buscar en el catálogo de perfiles
     publicados. <strong>Quien no esté, no aparece.</strong> Esa es toda la prisa que hay.</p>

     ${boton('CREAR MI PERFIL', urlPropia)}

     ${codigoRef ? `
     <div style="border:2px solid #0E0E0E;background:#D6FF00;padding:14px 16px;margin-top:20px">
       <div style="font-weight:800;letter-spacing:-0.3px;margin-bottom:6px">TUS DOS INVITACIONES SIGUEN AHÍ</div>
       <div style="font-size:12.5px;line-height:1.65">
         Puedes traer a dos creadoras que tú elijas. Este es tu enlace:<br>
         <span style="display:inline-block;background:#fff;border:1px solid #0E0E0E;padding:6px 9px;margin-top:8px;font-size:11.5px;word-break:break-all">${urlParaCompartir}</span>
       </div>
     </div>` : ''}

     <p style="margin-top:24px;font-size:11px;color:#7A7A7A;line-height:1.6">
       Creators Manager es un servicio de COLBELLEZA LATAM S.A.S., NIT 901.519.449-0,
       Medellín, Colombia. Si prefieres no participar, ignora este mensaje y no volveremos
       a escribirte por este tema.
     </p>`,
  );
}

/**
 * Empujón a quien ya está adentro para que use sus dos invitaciones.
 *
 * Hay cientos de cupos de referido sin usar porque nadie los ha pedido: el
 * enlace viaja en el correo de bienvenida, se lee una vez y se olvida. Este
 * mensaje existe solo para volver a poner el enlace enfrente.
 *
 * No promete nada que no sea cierto. Lo que gana es prioridad —un orden real en
 * el catálogo y en el aviso de campañas— y eso es exactamente lo que dice.
 */
function activarReferidos({ creadora, codigoRef, restantes, traidas = 0 }) {
  const nombre = String(creadora.nombre_publico || '').split(' ')[0] || 'Hola';
  const url = `${config.base_url}/invitacion.html?ref=${encodeURIComponent(codigoRef)}`;

  return enviar(
    creadora.email,
    `${nombre}, te quedan ${restantes} invitaciones sin usar`,
    `<p style="font-size:17px;font-weight:800;letter-spacing:-0.6px;line-height:1.3;margin:0 0 14px">
       Tienes ${restantes} ${restantes === 1 ? 'invitación' : 'invitaciones'} sin usar.</p>

     <p>Tu perfil ya está en Creators Manager. Lo que casi nadie está usando es la otra
     parte del cupo: <strong>puedes traer creadoras que tú elijas</strong>, y entran
     directo al prelanzamiento sin lista de espera.</p>

     ${traidas ? `<p>Ya trajiste a ${traidas === 1 ? 'una' : traidas}. Te ${restantes === 1 ? 'queda una' : `quedan ${restantes}`}.</p>` : ''}

     <div style="border:2px solid #0E0E0E;background:#D6FF00;padding:15px 17px;margin:20px 0">
       <div style="font-weight:800;letter-spacing:-0.3px;margin-bottom:7px">TU ENLACE</div>
       <div style="font-size:12.5px;line-height:1.65">
         Pásaselo a quien quieras que entre contigo:<br>
         <span style="display:inline-block;background:#fff;border:1px solid #0E0E0E;padding:7px 10px;margin-top:8px;font-size:11.5px;word-break:break-all">${url}</span>
       </div>
     </div>

     <p><strong>Qué ganas tú.</strong> Cada creadora que traigas y quede publicada te sube
     la prioridad, que decide dos cosas concretas: quién ve las campañas primero cuando
     abramos a las marcas, y quién sale antes en el catálogo entre perfiles parecidos.</p>

     <p style="font-size:12.5px;color:#5A5A5A">Una recomendación: funciona mejor mandárselo
     a dos personas por mensaje directo que publicarlo en tus historias. Entra quien de
     verdad va a crear su perfil, y esas son las que te suman.</p>

     ${boton('VER MI PERFIL', `${config.base_url}/creadora.html`)}`
  );
}

/**
 * A la creadora: tiene una propuesta a punto de cerrarse.
 *
 * Se manda cuando queda un tercio del plazo, no cuando ya venció. Cerrarle una
 * propuesta sin haberle avisado sería quitarle un trabajo por no haber abierto
 * la app, y casi siempre lo que pasa es eso y no que no le interese.
 */
function propuestaPorVencer({ trato, creadora, marca, horasRestantes }) {
  return enviar(
    creadora.email,
    `Te quedan ${horasRestantes} horas para responder una propuesta`,
    `<p style="font-size:16px;font-weight:800;letter-spacing:-0.4px;margin:0 0 14px">
       Tienes una propuesta esperando.</p>

     <p><strong>${esc(marca?.nombre_empresa || 'Una marca')}</strong> te mandó una propuesta
     de <strong>${formatearCOP(trato.neto_a_recibir_creadora)}</strong> netos y todavía no la
     has contestado.</p>

     <p>Si no respondes en las próximas <strong>${horasRestantes} horas</strong> se cierra sola
     y la marca puede buscar a otra persona. Responder que no también sirve: le deja el
     campo libre y a ti no te afecta en nada.</p>

     ${boton('VER LA PROPUESTA', `${config.base_url}/creadora.html`)}`
  );
}

/** A la marca: la creadora nunca respondió y la propuesta se cerró. */
function propuestaExpirada({ trato, marca }) {
  if (!marca?.email) return Promise.resolve(false);
  return enviar(
    marca.email,
    `La propuesta ${trato.codigo || ''} se cerró sin respuesta`.trim(),
    `<p style="font-size:16px;font-weight:800;letter-spacing:-0.4px;margin:0 0 14px">
       Nadie respondió, así que la cerramos.</p>

     <p>La creadora no contestó dentro del plazo, así que la propuesta
     <strong>${esc(trato.codigo || '')}</strong> quedó cerrada y no ocupa uno de tus cupos
     del mes.</p>

     <p>No se te cobró nada: la comisión solo aplica sobre tratos que se cierran de verdad.
     Puedes proponerle a otra creadora cuando quieras.</p>

     ${boton('VOLVER AL CATÁLOGO', `${config.base_url}/panel.html`)}`
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
  enviar, diagnostico, probar,
  invitacionCreadora, invitacionSegundoToque, activarReferidos,
  recordatorioPerfil, trajisteUna,
  propuestaPorVencer, propuestaExpirada,
  bienvenidaCreadora, avisoPerfilNuevo, avisoListaParaRevisar, perfilAprobado, resetClave,
  nuevaSolicitud, tratoAceptado, tratoRechazado,
  pagoRetenido, contenidoEntregado, contenidoAprobado, pagoLiberado,
};
