// Política de Tratamiento de Datos Personales de Creators Manager.
//
// Mismo patrón que terminos.js: el texto legal vive como módulo JS, no como
// HTML suelto, para que sea versionable y se pueda dejar constancia de qué
// versión aceptó cada persona.
//
// ⚠️ PENDIENTE DE REVISIÓN JURÍDICA. Está redactado sobre lo que la plataforma
// hace HOY de verdad —revisando el esquema tabla por tabla y los terceros a los
// que salen datos—, no sobre una plantilla. Pero una política de tratamiento es
// exigible ante la Superintendencia de Industria y Comercio, así que tiene que
// pasar por la abogada antes de publicarse.
//
// ⚠️ FALTA LA DIRECCIÓN FÍSICA, que solo María puede dar. La Ley 1581 exige que
// el responsable sea localizable, y con el correo solo no basta. Va como
// marcador visible: una política publicada con "[PENDIENTE]" se nota y se
// arregla; una con una dirección inventada es un problema que nadie ve hasta
// que alguien reclama.
//
// Dos cosas que sí quedaron dichas y suelen omitirse, porque acá sí pasan:
//   · Los datos salen de Colombia (Supabase, Railway, Anthropic, Meta). Eso
//     exige autorización expresa para transferencia internacional.
//   · Guardamos qué marca miró qué creadora (mk_fichas_vistas) y el registro de
//     correos enviados (mk_correos_log). Son datos de comportamiento y hay que
//     declararlos.

const PRIVACIDAD_VERSION = '2026-08-v1';

// Se completan cuando María los confirme. Se dejan como marcadores visibles a
// propósito: una política publicada con "[dirección]" es evidente y se arregla;
// una con una dirección inventada es un problema legal que nadie nota.
const PENDIENTE_DIRECCION = '[PENDIENTE: dirección física]';

// El correo es dato público y no cambia: va como valor por defecto para que la
// política cumpla sin depender de que alguien configure una variable. Se puede
// sobreescribir por entorno si algún día cambia el buzón.
const CORREO_HABEAS_DATA = 'admin@creatorsmanager.com';

function privacidadBody({
  direccion = PENDIENTE_DIRECCION,
  correo    = CORREO_HABEAS_DATA,
  // El teléfono es opcional en la ley: con dirección y correo el responsable ya
  // es localizable. Si no hay, la fila no se pinta — mejor que enseñar un hueco.
  telefono  = null,
} = {}) {
  return `
<h1 class="tc-title">POLÍTICA DE TRATAMIENTO<br>DE DATOS PERSONALES</h1>
<p class="tc-sub">Creators Manager · Versión ${PRIVACIDAD_VERSION}</p>

<p>Esta política explica qué datos personales recogemos, para qué los usamos, con quién los compartimos y qué puedes hacer al respecto. Está redactada conforme a la <strong>Ley 1581 de 2012</strong>, el Decreto 1377 de 2013 y demás normas colombianas de protección de datos.</p>

<h2>1. Quién responde por tus datos</h2>
<p><strong>COLBELLEZA LATAM S.A.S.</strong> — NIT 901.519.449-0, domiciliada en Medellín, Colombia — es la responsable del tratamiento. Creators Manager es una plataforma operada por esta sociedad.</p>
<table class="tc-table">
  <tr><th>Dirección</th><td>${direccion}</td></tr>
  <tr><th>Correo</th><td>${correo}</td></tr>
  ${telefono ? `<tr><th>Teléfono</th><td>${telefono}</td></tr>` : ''}
</table>
<p>Ese correo es el canal oficial para ejercer tus derechos. Lo atiende el área de operaciones de la Plataforma.</p>

<h2>2. Qué datos recogemos</h2>

<p><strong>Si eres creadora</strong>, para publicarte en el catálogo y poder pagarte:</p>
<ul>
<li><strong>De contacto y cuenta:</strong> nombre público, correo, WhatsApp, contraseña (guardada cifrada, nunca en texto plano).</li>
<li><strong>De perfil:</strong> ciudad, departamento, país, nichos, categorías, biografía, foto de perfil, días de entrega, tarifas por entregable.</li>
<li><strong>De alcance:</strong> las redes que trabajas, tus usuarios (@) en cada una, número de seguidores, vistas promedio, engagement y datos agregados de tu audiencia (proporción de mujeres, rango de edad, país y ciudad principales).</li>
<li><strong>Contenido:</strong> las piezas de video y foto que subes como muestra.</li>
<li><strong>Verificación:</strong> las capturas de estadísticas que envías para que revisemos tus métricas.</li>
<li><strong>Identidad y pago:</strong> nombre real, número de documento, banco, tipo y número de cuenta. Estos datos viven <strong>separados del catálogo</strong>, en una tabla aparte con acceso restringido.</li>
</ul>

<p><strong>Si eres marca</strong>, para operar tu cuenta y cobrarte:</p>
<ul>
<li>Nombre de la empresa, nombre de contacto, correo, WhatsApp, NIT, ciudad, país, sitio web, redes sociales, logo y descripción.</li>
<li>Las respuestas que das al registrarte sobre qué tipo de creadoras buscas.</li>
<li>Tu plan, sus fechas y el historial de pagos.</li>
</ul>

<p><strong>De todos, por el solo hecho de usar la plataforma:</strong></p>
<ul>
<li><strong>Qué fichas de creadoras ha visto cada marca.</strong> Lo usamos para el conteo de su plan y para no repetirle perfiles.</li>
<li><strong>Registro de los correos que te enviamos</strong> y si el proveedor los aceptó. Sirve para diagnosticar cuando alguien dice que no le llega nada.</li>
<li><strong>Datos técnicos de navegación</strong> a través del píxel de Meta (ver sección 6).</li>
</ul>

<h2>3. Para qué los usamos</h2>
<ul>
<li>Publicar el catálogo y permitir que las marcas encuentren creadoras.</li>
<li>Gestionar propuestas, tratos, entregas y programas de contenido.</li>
<li>Retener y liberar los pagos (escrow), cobrar comisiones y liquidar a las creadoras.</li>
<li>Calcular el historial de cumplimiento que se muestra en el catálogo.</li>
<li>Enviarte correos y mensajes de WhatsApp sobre lo que pasa en tu cuenta: propuestas, plazos, pagos, recuperación de contraseña.</li>
<li>Verificar las métricas declaradas y prevenir fraude.</li>
<li>Cumplir obligaciones contables y tributarias.</li>
<li>Medir el desempeño de nuestra publicidad, de forma agregada.</li>
</ul>
<p>No vendemos tus datos. No los usamos para entrenar modelos de inteligencia artificial propios ni de terceros.</p>

<h2>4. Lo que el catálogo NO muestra</h2>
<p>Esto no es una promesa comercial, es cómo está construida la plataforma:</p>
<ul>
<li>Tu <strong>usuario (@)</strong> y tu <strong>nombre real</strong> no viajan al catálogo. Las marcas ven un nombre público y un código.</li>
<li>Tu <strong>número exacto de seguidores</strong> tampoco: solo un rango. Un número exacto es casi un identificador y permitiría encontrarte.</li>
<li>Tus <strong>datos bancarios y tu documento</strong> no son visibles para ninguna marca, nunca, en ninguna etapa.</li>
<li>Tu contacto se revela a una marca <strong>solo cuando ha pagado</strong> y ese pago está retenido a tu favor.</li>
<li>Las piezas que subes se sirven con <strong>marca de agua</strong> y desde un almacenamiento privado, no con el enlace original de la red social.</li>
</ul>

<h2>5. Con quién los compartimos</h2>
<p>Solo con quienes necesitamos para operar, y solo lo necesario:</p>
<table class="tc-table">
  <tr><th>Quién</th><th>Para qué</th><th>Qué recibe</th></tr>
  <tr><td>Supabase</td><td>Base de datos y archivos</td><td>Todo lo que guardamos</td></tr>
  <tr><td>Railway</td><td>Servidores de la aplicación</td><td>Datos en tránsito</td></tr>
  <tr><td>Wompi</td><td>Cobros con tarjeta y PSE</td><td>Correo y monto. Los datos de tu tarjeta los recibe Wompi directamente; nosotros nunca los vemos ni los guardamos.</td></tr>
  <tr><td>ZeptoMail · Brevo</td><td>Envío de correos</td><td>Correo y contenido del mensaje</td></tr>
  <tr><td>Meta</td><td>WhatsApp y medición de publicidad</td><td>Teléfono; datos de navegación</td></tr>
  <tr><td>Anthropic</td><td>Etiquetado de contenido con IA</td><td>Las piezas de muestra, para describir cómo están producidas</td></tr>
</table>
<p>También podemos entregar datos a autoridades cuando una ley o una orden judicial nos obligue.</p>

<h2>6. Píxel de Meta y tecnologías de medición</h2>
<p>Nuestras páginas públicas incluyen el <strong>píxel de Meta</strong>, que registra visitas y registros completados para medir nuestra publicidad en Instagram y Facebook. Ese píxel puede leer y escribir cookies en tu navegador y comparte con Meta datos técnicos de tu visita.</p>
<p>Puedes bloquearlo desde la configuración de cookies de tu navegador o con una extensión, sin que eso afecte tu uso de la plataforma. No usamos cookies de publicidad de terceros más allá de este píxel.</p>

<h2>7. Transferencia internacional</h2>
<p><strong>Tus datos salen de Colombia.</strong> Los proveedores de la sección 5 operan servidores fuera del país, principalmente en Estados Unidos y la Unión Europea. Al aceptar esta política <strong>autorizas expresamente esa transferencia</strong>, en los términos del artículo 26 de la Ley 1581 de 2012.</p>
<p>Exigimos a cada proveedor compromisos contractuales de confidencialidad y seguridad, pero no controlamos su infraestructura.</p>

<h2>8. Cuánto tiempo los guardamos</h2>
<ul>
<li><strong>Mientras tu cuenta esté activa</strong>, y después mientras exista una obligación legal o contractual que lo exija.</li>
<li><strong>Diez años</strong> los registros de operaciones con dinero, por obligación contable y tributaria.</li>
<li><strong>El historial de cumplimiento</strong> se conserva de forma asociada a ti aunque termines una relación, porque es lo que sostiene la confianza del catálogo. Si eliminas tu cuenta, se conserva de forma que ya no te identifica.</li>
<li>Las <strong>capturas de verificación</strong> se eliminan una vez revisadas o cuando dejan de ser vigentes.</li>
</ul>

<h2>9. Tus derechos</h2>
<p>Como titular puedes, en cualquier momento y gratuitamente:</p>
<ul>
<li><strong>Conocer</strong> qué datos tuyos tenemos y cómo los usamos.</li>
<li><strong>Actualizar y rectificar</strong> los que estén incompletos o equivocados.</li>
<li><strong>Suprimirlos</strong>, cuando no exista un deber legal o contractual de conservarlos.</li>
<li><strong>Revocar</strong> la autorización que nos diste.</li>
<li><strong>Solicitar prueba</strong> de la autorización que otorgaste.</li>
<li><strong>Presentar quejas</strong> ante la Superintendencia de Industria y Comercio.</li>
</ul>
<p>Nada de esto te cuesta ni requiere abogado.</p>

<h2>10. Cómo ejercerlos</h2>
<p>Escríbenos a <strong>${correo}</strong> desde el correo con el que te registraste, diciendo qué quieres y sobre qué datos. Si escribes desde otro correo te pediremos una forma de confirmar que eres tú.</p>
<table class="tc-table">
  <tr><th>Tipo</th><th>Plazo de respuesta</th></tr>
  <tr><td>Consulta</td><td>10 días hábiles, prorrogables por 5 más</td></tr>
  <tr><td>Reclamo</td><td>15 días hábiles, prorrogables por 8 más</td></tr>
</table>
<p>Si nos demoramos más, te diremos por qué y cuándo responderemos.</p>

<h2>11. Seguridad</h2>
<p>Las contraseñas se guardan cifradas y no las podemos leer. La conexión con la plataforma viaja siempre cifrada. Los datos bancarios y de identidad están separados del resto y con acceso restringido. Las piezas de contenido se guardan en almacenamiento privado y se sirven por un intermediario, nunca con su enlace original.</p>
<p>Ningún sistema es infalible. Si ocurriera un incidente que afecte tus datos, te lo informaremos y lo reportaremos a la autoridad, como exige la ley.</p>

<h2>12. Menores de edad</h2>
<p>La plataforma es <strong>solo para mayores de 18 años</strong>. No recogemos datos de menores a sabiendas. Si detectamos una cuenta de una persona menor de edad, la eliminamos junto con sus datos.</p>

<h2>13. Cambios a esta política</h2>
<p>Podemos actualizarla. Cuando el cambio sea sustancial te lo avisaremos por correo antes de que entre a regir, y la versión vigente estará siempre publicada en esta página con su fecha.</p>

<h2>14. Vigencia</h2>
<p>Rige desde su publicación. Las bases de datos de Creators Manager se mantendrán vigentes mientras la plataforma opere y sea necesario para las finalidades descritas.</p>
`;
}

/** Página completa, lista para servir en GET /privacidad. */
function privacidadHTML(valores) {
  const { TERMINOS_CSS } = require('./terminos');
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Política de Privacidad · Creators Manager</title>
<link href="https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;border-radius:0}body{margin:0;background:#F2F2F2}${TERMINOS_CSS}</style>
</head>
<body><div class="tc-doc">${privacidadBody(valores)}</div></body>
</html>`;
}

module.exports = { PRIVACIDAD_VERSION, privacidadBody, privacidadHTML };
