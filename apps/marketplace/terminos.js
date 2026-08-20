// Términos y Condiciones de Creadores.app.
//
// Mismo patrón que apps/creadoras/acuerdo.js: el texto legal vive como módulo
// JS, no como HTML suelto, para que sea versionable y quede constancia de qué
// versión aceptó cada marca (mk_marcas.terminos_version).
//
// ⚠️ PENDIENTE DE REVISIÓN JURÍDICA. Este texto está redactado para poder
// operar los pilotos iniciales, pero DEBE pasar por la abogada antes de abrir
// a marcas externas en volumen. La cláusula de no-circunvalación (la 7) es la
// que sostiene el modelo de negocio: si no es exigible, cualquier marca puede
// usar el catálogo como directorio y contratar por fuera.

const TERMINOS_VERSION = '2026-08-v1';

// Los valores que cambian se inyectan desde mk_config, no se repiten a mano.
function terminosBody({ comision_marca_pct = 12, comision_creadora_pct = 8, plazo_meses = 12 } = {}) {
  return `
<h1 class="tc-title">TÉRMINOS Y CONDICIONES</h1>
<p class="tc-sub">Creadores.app · Versión ${TERMINOS_VERSION}</p>

<p>Creadores.app es una plataforma operada por <strong>COLBELLEZA LATAM S.A.S.</strong> (NIT 901.519.449-0, domiciliada en Medellín, Colombia), en adelante "la Plataforma", que conecta marcas ("la Marca") con creadoras de contenido ("la Creadora") para celebrar colaboraciones pagas.</p>

<p>Al crear una cuenta, la Marca acepta estos términos en su totalidad.</p>

<h2>1. Qué hace la Plataforma y qué no</h2>
<p>La Plataforma pone en contacto a las partes, administra el flujo del trato y custodia el pago hasta que el contenido se entregue y se apruebe. La Plataforma <strong>no es empleadora, agencia ni representante</strong> de las Creadoras, y no responde por el contenido que estas publiquen, por sus afirmaciones ni por el desempeño comercial de la campaña.</p>

<h2>2. Acceso por invitación</h2>
<p>En su fase actual, el acceso al catálogo es por invitación. La Plataforma puede suspender o revocar el acceso de una cuenta, sin necesidad de expresar causa, cuando detecte un uso contrario a estos términos.</p>

<h2>3. Identidad de las Creadoras</h2>
<p>El catálogo muestra nicho, alcance, engagement, historial y piezas de muestra, <strong>sin revelar el usuario de redes sociales ni los datos de contacto</strong> de la Creadora. Esa información se revela únicamente cuando el trato ha sido aceptado y el pago de la Marca se encuentra retenido por la Plataforma.</p>
<p>La Marca se obliga a <strong>no intentar identificar a una Creadora</strong> por medios ajenos a la Plataforma —incluida la búsqueda inversa de imágenes sobre las piezas de muestra— con el fin de contactarla por fuera. Las piezas de muestra se exhiben con fines exclusivos de evaluación: la Marca no puede descargarlas, reproducirlas, redistribuirlas ni usarlas comercialmente.</p>

<h2>4. Comisión</h2>
<p>La Plataforma cobra una comisión sobre cada colaboración cerrada, repartida entre las dos partes:</p>
<table class="tc-table">
  <tr><th>La Marca paga</th><th>A la Creadora se le descuenta</th></tr>
  <tr><td><strong>${comision_marca_pct}%</strong> adicional sobre el monto acordado</td><td><strong>${comision_creadora_pct}%</strong> de su pago</td></tr>
</table>
<p>El valor total a pagar por la Marca se le muestra de forma desagregada antes de enviar cualquier solicitud. La comisión se causa cuando el trato se cierra. La Plataforma puede modificar sus porcentajes hacia el futuro: los tratos ya creados conservan los porcentajes vigentes al momento de su creación.</p>

<h2>5. Pago protegido (escrow)</h2>
<p>Aceptado el trato, la Marca paga el total a la cuenta que la Plataforma indique. Ese dinero queda <strong>retenido y comprometido</strong> con ese trato específico. Solo se libera a la Creadora cuando esta entrega el contenido y la Marca lo aprueba.</p>
<p>Si el trato se cancela antes de la entrega, la Plataforma reintegra a la Marca el valor retenido, descontando los costos de transacción en que haya incurrido. Si la Creadora incumple la entrega en el plazo pactado, la Marca puede solicitar el reintegro.</p>

<h2>6. Aprobación del contenido</h2>
<p>Entregado el contenido, la Marca dispone de un plazo razonable para aprobarlo o solicitar ajustes. La Marca no puede negar la aprobación de forma arbitraria cuando el contenido cumpla lo pactado en el brief. La Plataforma puede mediar y, ante un desacuerdo persistente, decidir la liberación o el reintegro con base en el brief acordado y el material entregado.</p>

<h2>7. No circunvalación</h2>
<p><strong>Esta cláusula es esencial para la Plataforma.</strong> La Marca se obliga a que, durante los <strong>${plazo_meses} meses</strong> siguientes a la fecha en que conoció a una Creadora a través de la Plataforma, toda contratación con esa Creadora —directa o por interpuesta persona, con o sin intermediarios, bajo cualquier modalidad— se canalice a través de la Plataforma.</p>
<p>Si la Marca contrata por fuera dentro de ese plazo, deberá igualmente a la Plataforma la comisión que habría correspondido, calculada sobre el valor de la contratación realizada. Se entiende que la Marca "conoció" a una Creadora a través de la Plataforma cuando visualizó su perfil en el catálogo o le envió una solicitud de colaboración, hecho que queda registrado en los sistemas de la Plataforma.</p>

<h2>8. Contenido y derechos</h2>
<p>Los derechos de uso sobre el contenido producido son los que Marca y Creadora pacten en el brief del trato. La Plataforma no adquiere derechos sobre ese contenido, salvo la facultad de exhibir piezas de muestra dentro del catálogo, con autorización de la Creadora.</p>

<h2>9. Obligaciones de la Marca</h2>
<ul>
  <li>Entregar briefs claros, veraces y realizables, y los productos necesarios para ejecutarlos.</li>
  <li>No exigir a la Creadora afirmaciones falsas, engañosas o de carácter médico sobre los productos.</li>
  <li>Pagar oportunamente el valor del trato aceptado.</li>
  <li>Tratar a las Creadoras con respeto y sin discriminación de ninguna naturaleza.</li>
</ul>

<h2>10. Facturación e impuestos</h2>
<p>La Plataforma emitirá a la Marca el documento equivalente por el valor de la operación conforme a la normativa colombiana. Cada parte asume sus propias obligaciones tributarias. La Creadora es responsable de declarar los ingresos que reciba.</p>

<h2>11. Protección de datos</h2>
<p>La Plataforma trata los datos personales conforme a la Ley 1581 de 2012 y a su Política de Tratamiento de Datos, con la finalidad de operar el marketplace, gestionar los tratos y liquidar pagos. Los titulares pueden conocer, actualizar, rectificar y suprimir sus datos por los canales de la Plataforma.</p>
<p>La información del catálogo —incluidos métricas, piezas de muestra e identidad de las Creadoras— es <strong>confidencial</strong>. La Marca se obliga a no divulgarla ni compartirla con terceros.</p>

<h2>12. Limitación de responsabilidad</h2>
<p>La responsabilidad de la Plataforma se limita, en todo caso, al valor de la comisión efectivamente cobrada por el trato de que se trate. La Plataforma no responde por lucro cesante, daño emergente indirecto, ni por los resultados comerciales de una campaña.</p>

<h2>13. Vigencia y modificaciones</h2>
<p>Estos términos rigen mientras la cuenta esté activa. La Plataforma puede modificarlos notificando a las Marcas registradas; los cambios aplican a los tratos creados con posterioridad a la notificación. La obligación de no circunvalación sobrevive a la terminación de la cuenta por el plazo señalado en la cláusula 7.</p>

<h2>14. Ley aplicable</h2>
<p>Estos términos se rigen por las leyes de la República de Colombia. Las diferencias se procurarán resolver de forma directa; de no lograrse acuerdo, se someterán a los jueces competentes de la República de Colombia.</p>
`;
}

const TERMINOS_CSS = `
.tc-doc{font-family:'Space Mono',ui-monospace,monospace;color:#0E0E0E;line-height:1.65;font-size:13px;max-width:820px;margin:0 auto;padding:32px 20px 80px}
.tc-doc .tc-title{font-family:'Martian Mono',ui-monospace,monospace;font-size:clamp(22px,3.4vw,36px);font-weight:800;letter-spacing:-1.6px;line-height:1.05;margin:0 0 6px}
.tc-doc .tc-sub{font-size:11.5px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#7A7A7A;margin:0 0 30px}
.tc-doc h2{font-family:'Martian Mono',ui-monospace,monospace;font-size:15px;font-weight:800;letter-spacing:-0.6px;line-height:1.2;margin:28px 0 8px;border-bottom:2px solid #0E0E0E;padding-bottom:6px}
.tc-doc p{margin:0 0 12px;text-align:justify}
.tc-doc ul{margin:0 0 14px;padding-left:20px}
.tc-doc li{margin:0 0 6px}
.tc-doc strong{font-weight:700;background:#D6FF00;padding:0 3px}
.tc-table{width:100%;border-collapse:collapse;margin:10px 0 14px;text-align:center}
.tc-table th,.tc-table td{border:2px solid #0E0E0E;padding:10px}
.tc-table th{background:#0E0E0E;color:#D6FF00;font-family:'Martian Mono',ui-monospace,monospace;font-size:11.5px;font-weight:800;letter-spacing:0.6px;text-transform:uppercase}
.tc-table strong{background:transparent}
`;

/** Página completa de términos, lista para servir en GET /terminos. */
function terminosHTML(valores) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Términos y Condiciones · Creadores.app</title>
<link href="https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;700;800&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>*{box-sizing:border-box;border-radius:0}body{margin:0;background:#F2F2F2}${TERMINOS_CSS}</style>
</head>
<body><div class="tc-doc">${terminosBody(valores)}</div></body>
</html>`;
}

module.exports = { TERMINOS_VERSION, terminosBody, terminosHTML, TERMINOS_CSS };
