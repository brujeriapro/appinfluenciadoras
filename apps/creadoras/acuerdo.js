// Texto del Acuerdo de Colaboración — Programa de Creadoras · Brujería Capilar
// Fuente: Google Doc de la Marca. Solo los campos marcados <b class="ph" data-f="...">
// se rellenan con los datos de cada creadora; el resto del texto es fijo.

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
}

// Campo rellenable — si no hay valor, muestra el placeholder para edición en vivo
function ph(v, key, placeholder) {
  const val = v && v[key];
  return `<b class="ph" data-f="${key}">${val ? esc(val) : placeholder}</b>`;
}

// Cuerpo del acuerdo. `v` = { nombre_completo, tipo_documento, numero_documento, usuario, ciudad_firma, dia, mes, anio }
function acuerdoBody(v = {}) {
  return `
<h1 class="ac-title">ACUERDO DE COLABORACIÓN</h1>
<p class="ac-sub">Programa de Creadoras · Brujería Capilar</p>

<p>Este acuerdo se celebra entre <strong>Brujería Capilar</strong> (COLBELLEZA LATAM S.A.S., NIT 901.519.449-0, con domicilio en Medellín, Colombia), a quien en adelante llamaremos "la Marca", y la creadora de contenido ${ph(v,'nombre_completo','[Nombre completo]')}, identificada con ${ph(v,'tipo_documento','[C.C./C.E.]')} No. ${ph(v,'numero_documento','[__________]')}, usuaria de @${ph(v,'usuario','[usuario]')}, a quien en adelante llamaremos "la Creadora".</p>

<h2>Te damos un regalo de bienvenida</h2>
<p>Te enviamos, como regalo de bienvenida, uno o más productos de la marca para que los disfrutes y crees contenido con ellos.</p>
<p>La Marca decide, a su entera discreción, qué productos enviar, así como su cantidad, referencia, presentación y valor. Este regalo es una liberalidad y no constituye una obligación de la Marca de entregar un producto, una cantidad, una referencia o un valor determinados, ni genera compromiso alguno sobre un valor mínimo, una periodicidad de envíos ni entregas futuras. La selección puede variar en cada oportunidad, o suspenderse en cualquier momento, sin que ello genere responsabilidad ni derecho a reclamación por parte de la Creadora.</p>

<h2>A cambio, tú te comprometes a:</h2>
<ul>
  <li><strong>Crear y publicar como mínimo 2 contenidos en tus redes sociales</strong> (por ejemplo: reel, post o historias), mostrando el producto, dentro de los 15 días siguientes a recibir el regalo.</li>
  <li><strong>Mostrar el producto en uso</strong>, de forma real y con buena calidad de imagen y sonido.</li>
  <li><strong>Publicar como mínimo 3 veces tu código de descuento</strong>, de forma visible, en el contenido que compartas.</li>
  <li><strong>Etiquetar a @BRUJERIACAPILAR</strong> en tus publicaciones.</li>
  <li><strong>Hablar solo de lo que el producto sí hace.</strong> No prometer que cura, regenera o tiene efectos médicos: es un cosmético, no un medicamento. Tú eres la única responsable de las afirmaciones que hagas en tu contenido.</li>
  <li><strong>Usar música y material propios o libres de derechos</strong>, para que no te bajen el contenido y para no afectar derechos de terceros.</li>
</ul>

<h2>Tu código de descuento y comisión</h2>
<p>Te damos un código personalizado. Cada vez que alguien compre con él, tú ganas:</p>
<table class="ac-table">
  <tr><th>Para tus seguidores</th><th>Para ti (comisión)</th></tr>
  <tr><td><strong>10 % de descuento</strong></td><td><strong>10 % sobre la venta</strong></td></tr>
</table>
<p>Liquidamos las comisiones cada mes y te pagamos por transferencia Bancolombia dentro de los 15 días siguientes. La comisión se paga solo sobre ventas efectivamente pagadas y no devueltas; no aplica a compras canceladas, devueltas, fraudulentas o con uso indebido del código.</p>
<p><strong>Sin presión de ventas:</strong> no hay un mínimo de ventas. Nunca te exigimos vender una cantidad determinada para seguir en el programa.</p>

<h2>Lo que tú nos confirmas al participar</h2>
<ul>
  <li><strong>Eres mayor de edad:</strong> declaras que tienes 18 años cumplidos o más y que participas de forma libre, voluntaria e informada.</li>
  <li><strong>Participas de forma independiente:</strong> no recibes órdenes, horarios ni supervisión de la Marca; decides cómo, cuándo y con qué medios creas tu contenido.</li>
  <li><strong>El contenido es tuyo y está en regla:</strong> declaras ser la autora del contenido, contar con los derechos sobre la música, imágenes y materiales que uses, y tener el permiso de cualquier otra persona que aparezca en él.</li>
  <li><strong>Respondes por lo que publicas:</strong> asumes la responsabilidad por tus publicaciones, comentarios y afirmaciones, y por cumplir las reglas de cada plataforma (Instagram, TikTok, etc.).</li>
</ul>

<h2>Algunos acuerdos importantes</h2>

<h3>Podemos usar tu contenido</h3>
<p>Al participar, nos autorizas de forma gratuita, mundial e indefinida a usar, reproducir, editar, adaptar y publicar el contenido que crees con nuestros productos en todos nuestros canales y usos de la marca: redes sociales, sitio web, marketplaces, material publicitario y pauta pagada (anuncios). Esta autorización incluye tu imagen, voz y nombre dentro de ese contenido, sin que ello genere pago adicional. Garantizas que cuentas con todos los derechos para otorgar esta autorización.</p>

<h3>Naturaleza del acuerdo: colaboración independiente, no empleo</h3>
<p>La Creadora actúa de forma totalmente independiente y autónoma. El presente acuerdo no constituye ni genera relación laboral, contrato de trabajo, subordinación, dependencia, exclusividad ni relación de agencia entre las partes, y en consecuencia no da lugar a salario, prestaciones sociales, aportes al sistema de seguridad social, vacaciones ni indemnización de ninguna naturaleza. La Creadora no está sujeta a horario, jornada ni instrucciones de la Marca y conserva plena libertad para colaborar con terceros.</p>

<h3>No es un contrato de agencia comercial ni de distribución</h3>
<p>Este acuerdo no constituye un contrato de agencia comercial ni de distribución. La comisión pactada es un incentivo por las ventas generadas con el código de la Creadora y no genera derecho a la cesantía comercial ni a la indemnización equitativa previstas en los artículos 1322 y 1324 del Código de Comercio, a las cuales la Creadora renuncia de manera expresa e irrevocable al participar.</p>

<h3>Responsabilidad de cada parte</h3>
<p>La Marca responde únicamente por la calidad e idoneidad del producto en su condición de cosmético, conforme a la garantía legal prevista en la ley. La Marca no será responsable, en ningún caso, por el contenido que publique la Creadora, por sus afirmaciones u opiniones, por acuerdos o promesas que la Creadora haga a sus seguidores, por sanciones, bloqueos, restricciones o eliminación de contenido por parte de las plataformas, ni por consecuencias derivadas de un uso indebido del producto. En términos generales, la Marca no responde por ninguna situación derivada de la actividad de la Creadora.</p>

<h3>Indemnidad</h3>
<p>La Creadora mantendrá indemne a la Marca frente a cualquier reclamación, demanda, sanción, multa, costo o gasto (incluidos honorarios de abogados) que provenga de un tercero, plataforma o autoridad y que se relacione con su contenido, la música o imágenes utilizadas, las afirmaciones realizadas o el incumplimiento de este acuerdo, obligándose a sacar a la Marca en paz y a salvo.</p>

<h3>Impuestos y seguridad social</h3>
<p>Cada parte asume sus propias obligaciones tributarias y de seguridad social. La Creadora es la única responsable de declarar y pagar los impuestos que correspondan sobre las comisiones que reciba, así como de su afiliación y aportes al sistema de seguridad social. La Marca no asume dichas obligaciones.</p>

<h3>Vigencia y terminación</h3>
<p>Este acuerdo no tiene una vigencia fija ni plazo mínimo de permanencia. Rige por tiempo indefinido a partir del momento en que la Creadora reciba el regalo de bienvenida o publique el primer contenido, lo que ocurra primero, y se mantendrá mientras ambas partes deseen continuar la colaboración.</p>
<p>Cualquiera de las partes podrá terminar el presente acuerdo en cualquier momento, de forma unilateral, sin necesidad de expresar causa, sin preaviso y sin que ello genere sanción, penalidad, indemnización o compensación alguna a favor de la otra parte. Bastará una comunicación por cualquier medio para hacerlo efectivo.</p>
<p>La terminación no afecta las comisiones ya causadas por ventas efectivamente pagadas y no devueltas hasta la fecha de terminación, ni las autorizaciones de uso de contenido ya otorgadas, las cuales continuarán vigentes conforme a este acuerdo. Si la Creadora se retira antes de publicar el contenido acordado, la Marca podrá solicitar la devolución del regalo o el pago de su valor aproximado y desactivar el código de descuento. La terminación por uso indebido del código, incumplimiento o afectación a la reputación de la Marca operará de manera inmediata.</p>

<h3>Protección de datos personales</h3>
<p>La Marca tratará los datos personales de la Creadora conforme a la Ley 1581 de 2012 y a su Política de Tratamiento de Datos, con la autorización de la Creadora para gestionar el programa, liquidar y pagar comisiones y difundir el contenido. La Creadora podrá ejercer sus derechos de conocer, actualizar, rectificar y suprimir sus datos a través de los canales de la Marca. A su vez, la Creadora se obliga a guardar reserva sobre la información confidencial de la marca a la que tenga acceso y a no divulgarla.</p>

<h3>No denigración</h3>
<p>Durante la vigencia de la colaboración, la Creadora se abstendrá de publicar contenido que denigre, difame o desprestigie a la Marca o a sus productos. Cualquier inconformidad se tramitará de manera directa y de buena fe entre las partes.</p>

<h3>Ley aplicable y solución de controversias</h3>
<p>Este acuerdo se rige por las leyes de la República de Colombia. Cualquier diferencia que surja con ocasión del mismo se procurará resolver primero de forma directa y amistosa entre las partes; de no lograrse un arreglo, se someterá a la jurisdicción de los jueces competentes de la República de Colombia.</p>

<p class="ac-firma-loc">En constancia de lo anterior, las partes firman en ${ph(v,'ciudad_firma','[__________]')}, a los ${ph(v,'dia','[__]')} días del mes de ${ph(v,'mes','[________]')} de ${ph(v,'anio','[____]')}.</p>
`;
}

// CSS compartido por la página de firma y la vista del acuerdo firmado
const ACUERDO_CSS = `
.ac-doc{font-family:Georgia,'Times New Roman',serif;color:#1a1030;line-height:1.55;font-size:14px}
.ac-doc .ac-title{font-size:20px;text-align:center;margin:0 0 2px;letter-spacing:1px}
.ac-doc .ac-sub{text-align:center;color:#6d28d9;font-family:sans-serif;font-size:12px;margin:0 0 20px}
.ac-doc h2{font-size:15px;margin:22px 0 6px;color:#4c1d95;border-bottom:1px solid #e5ddf5;padding-bottom:4px}
.ac-doc h3{font-size:13.5px;margin:16px 0 4px;color:#5b21b6}
.ac-doc p{margin:0 0 10px;text-align:justify}
.ac-doc ul{margin:0 0 12px;padding-left:20px}
.ac-doc li{margin:0 0 6px;text-align:justify}
.ac-doc .ph{background:#f3ecff;padding:0 4px;border-radius:3px;color:#4c1d95}
.ac-doc .ph:empty::before{content:'—'}
.ac-table{width:100%;border-collapse:collapse;margin:8px 0 12px;text-align:center}
.ac-table th,.ac-table td{border:1px solid #cbb6ef;padding:8px}
.ac-table th{background:#f3ecff;font-family:sans-serif;font-size:12px}
.ac-firma-loc{margin-top:18px}
`;

module.exports = { acuerdoBody, ACUERDO_CSS, MESES, esc };
