// Análisis del contenido real de las creadoras.
//
// Sostiene la mitad de la promesa del producto que dice "te decimos cómo
// trabaja". Una marca que hoy quiere saber si un estilo le sirve tiene que
// abrir video por video; esto lee cada pieza una vez y deja la respuesta
// guardada y consultable.
//
// Dos decisiones que explican cómo está escrito:
//
//   1. El vocabulario es CERRADO. Si el modelo pudiera contestar texto libre,
//      "baño" y "el baño de su casa" serían categorías distintas y ningún
//      filtro agruparía nada. Se le dan las opciones y se valida la respuesta
//      contra ellas: lo que no esté en la lista se descarta, no se guarda mal.
//
//   2. Los videos se analizan por FOTOGRAMAS. Los modelos de visión no leen
//      video; se extraen tres cuadros repartidos a lo largo de la pieza, que
//      alcanzan para decir dónde graba, cómo es la luz y qué tan producido es.
//      Lo que un cuadro no puede decir —si habla a cámara, el ritmo del
//      montaje— se pregunta con esa limitación explícita en el prompt, y el
//      modelo puede responder que no sabe.
//
// El costo es una llamada por pieza, y una pieza se analiza una sola vez.

const fetch = require('node-fetch');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const db = require('./db');
const config = require('./config');

const ejecutar = promisify(execFile);

const STORAGE_URL = String(config.supabase.url || '').replace(/\/$/, '') + '/storage/v1/object';
const MODELO = process.env.MK_MODELO_VISION || 'claude-sonnet-5';

// ── Vocabularios ────────────────────────────────────────────────────────────
//
// Cambiar una de estas listas invalida las filas ya analizadas con la lista
// vieja: los valores viejos siguen en la tabla pero dejan de coincidir con los
// filtros. Si hay que cambiarlas, re-analizar.

const VOCAB = {
  escenario:  ['baño', 'cocina', 'dormitorio', 'sala', 'exterior', 'estudio',
               'calle', 'gimnasio', 'carro', 'otro'],
  luz:        ['natural', 'artificial_calida', 'artificial_fria', 'anillo', 'mixta'],
  plano:      ['primer_plano', 'medio', 'cuerpo_completo', 'cenital_manos', 'detalle_producto'],
  produccion: ['casera', 'cuidada', 'profesional'],
  formato:    ['habla_camara', 'voz_en_off', 'sin_voz', 'tutorial', 'antes_despues',
               'unboxing', 'rutina', 'resena', 'grwm', 'trend', 'otro'],
  energia:    ['calmada', 'conversacional', 'energica'],
};

/** Deja pasar solo lo que está en el vocabulario; cualquier otra cosa es null. */
const validar = (campo, valor) =>
  VOCAB[campo].includes(String(valor || '').trim()) ? String(valor).trim() : null;

const comoBool = (v) => (typeof v === 'boolean' ? v : null);

// ── Descarga y fotogramas ───────────────────────────────────────────────────

/** Trae el binario de una pieza desde el bucket privado. */
async function descargar(storage_path) {
  const url = `${STORAGE_URL}/${config.supabase.bucket_muestras}/${storage_path}`;
  const r = await fetch(url, {
    headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
  });
  if (!r.ok) throw new Error(`No se pudo descargar la pieza (HTTP ${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Saca tres fotogramas repartidos a lo largo del video.
 *
 * Se toman al 15%, 50% y 80% en vez de al principio: los primeros cuadros de
 * un reel suelen ser una portada o una transición en negro, que no dicen nada
 * de cómo graba.
 *
 * ffmpeg se carga aquí adentro y no arriba a propósito: si el binario no está
 * —un entorno donde solo corre el servidor web— el resto del módulo tiene que
 * seguir funcionando.
 */
async function fotogramas(buffer, mime) {
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg) throw new Error('ffmpeg-static no disponible');

  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-frames-'));
  const ext = (mime || '').includes('quicktime') ? '.mov' : '.mp4';
  const entrada = path.join(carpeta, 'pieza' + ext);

  try {
    await fs.writeFile(entrada, buffer);

    // Duración real, para repartir los cuadros. Si no se puede leer, se cae a
    // segundos fijos, que para un reel corto es una aproximación aceptable.
    let duracion = 0;
    try {
      const { stdout } = await ejecutar(ffmpeg, ['-i', entrada, '-hide_banner'], { timeout: 30000 })
        .catch(e => ({ stdout: (e.stderr || '') + (e.stdout || '') }));
      const m = String(stdout).match(/Duration:\s*(\d+):(\d+):(\d+)/);
      if (m) duracion = (+m[1]) * 3600 + (+m[2]) * 60 + (+m[3]);
    } catch { /* se usa el respaldo */ }

    const momentos = duracion > 2
      ? [duracion * 0.15, duracion * 0.5, duracion * 0.8]
      : [0.5, 1, 1.5];

    const imagenes = [];
    for (let i = 0; i < momentos.length; i++) {
      const salida = path.join(carpeta, `f${i}.jpg`);
      try {
        await ejecutar(ffmpeg, [
          '-ss', momentos[i].toFixed(2), '-i', entrada,
          '-frames:v', '1', '-q:v', '4',
          // 768px de ancho: suficiente para juzgar luz, encuadre y producción,
          // y mucho más barato en tokens que el cuadro completo.
          '-vf', 'scale=768:-2',
          '-y', salida,
        ], { timeout: 60000 });
        imagenes.push(await fs.readFile(salida));
      } catch { /* un cuadro que falla no invalida los otros */ }
    }
    if (!imagenes.length) throw new Error('No se pudo extraer ningún fotograma');
    return imagenes;
  } finally {
    await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

// ── El modelo ───────────────────────────────────────────────────────────────

const INSTRUCCIONES = `Analizas una pieza de contenido de una creadora colombiana para un
marketplace donde marcas la contratan. La marca necesita saber CÓMO trabaja esta persona
para decidir si su estilo le sirve al producto.

Responde SOLO con un objeto JSON, sin texto alrededor y sin bloque de código, con estas claves:

{
  "escenario": ${JSON.stringify(VOCAB.escenario)},
  "luz": ${JSON.stringify(VOCAB.luz)},
  "plano": ${JSON.stringify(VOCAB.plano)},
  "produccion": ${JSON.stringify(VOCAB.produccion)},
  "formato": ${JSON.stringify(VOCAB.formato)},
  "energia": ${JSON.stringify(VOCAB.energia)},
  "producto_visible": true|false,
  "etiqueta_legible": true|false,
  "subtitulos": true|false,
  "calidad_tecnica": 1-5,
  "descripcion": "una o dos frases en español"
}

Reglas:
- Elige exactamente uno de los valores de cada lista. No inventes valores nuevos.
- Si un campo no se puede determinar con lo que ves, ponlo en null. Es preferible
  un null honesto a una suposición: una marca va a decidir un pago con esto.
- "produccion": casera = teléfono en mano sin montaje; cuidada = buen encuadre y
  luz pensada; profesional = cámara, iluminación y edición de producción.
- "calidad_tecnica" evalúa nitidez, encuadre y estabilidad, NO qué tan bonita es
  la persona ni qué tan caro se ve el lugar.
- "descripcion": describe lo que se ve y el estilo, en concreto. Sin adjetivos
  de venta. Nunca menciones nombres propios, arrobas ni marcas de la creadora.`;

/** Llama al modelo con una o varias imágenes y devuelve el JSON ya validado. */
async function preguntarAlModelo(imagenes, esVideo) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta ANTHROPIC_API_KEY');

  const contexto = esVideo
    ? `Estas son ${imagenes.length} imágenes tomadas de distintos momentos del MISMO video. `
      + 'Analízalas como una sola pieza. Si algo solo se puede saber viendo el video con '
      + 'sonido —si habla a cámara, si hay voz en off— y los cuadros no bastan, usa null.'
    : 'Esta es una pieza de contenido en imagen fija.';

  const contenido = imagenes.map(img => ({
    type: 'image',
    source: { type: 'base64', media_type: 'image/jpeg', data: img.toString('base64') },
  }));
  contenido.push({ type: 'text', text: contexto });

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 700,
      system: INSTRUCCIONES,
      messages: [{ role: 'user', content: contenido }],
    }),
  });

  if (!r.ok) {
    const detalle = await r.text().catch(() => '');
    throw new Error(`API de Anthropic respondió ${r.status}: ${detalle.slice(0, 200)}`);
  }

  const data = await r.json();
  const texto = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  return interpretarRespuesta(texto);
}

/**
 * Convierte la respuesta del modelo en una fila lista para guardar.
 *
 * Es la frontera entre texto generado y base de datos, así que aquí no se
 * confía en nada: un valor que no esté en el vocabulario se guarda como null en
 * vez de entrar tal cual. Una categoría inventada no rompería nada de forma
 * visible —simplemente no la encontraría ningún filtro— y esos son los errores
 * que más tardan en descubrirse.
 */
function interpretarRespuesta(texto) {
  // El modelo a veces envuelve el JSON en un bloque de código pese a la
  // instrucción; se recorta al primer objeto que aparezca.
  const desde = String(texto || '').indexOf('{');
  const hasta = String(texto || '').lastIndexOf('}');
  if (desde === -1 || hasta <= desde) throw new Error('El modelo no devolvió JSON válido');

  let j;
  try {
    j = JSON.parse(String(texto).slice(desde, hasta + 1));
  } catch {
    throw new Error('El modelo no devolvió JSON válido');
  }

  const calidad = Number(j.calidad_tecnica);
  return {
    escenario:  validar('escenario', j.escenario),
    luz:        validar('luz', j.luz),
    plano:      validar('plano', j.plano),
    produccion: validar('produccion', j.produccion),
    formato:    validar('formato', j.formato),
    energia:    validar('energia', j.energia),
    producto_visible: comoBool(j.producto_visible),
    etiqueta_legible: comoBool(j.etiqueta_legible),
    subtitulos:       comoBool(j.subtitulos),
    calidad_tecnica: Number.isInteger(calidad) && calidad >= 1 && calidad <= 5 ? calidad : null,
    descripcion: typeof j.descripcion === 'string' ? j.descripcion.trim().slice(0, 500) : null,
    modelo: MODELO,
  };
}

// ── Orquestación ────────────────────────────────────────────────────────────

/**
 * Analiza una pieza y guarda el resultado.
 *
 * Devuelve { ok, muestra_id, error? } y nunca lanza: quien la llama está
 * recorriendo cientos de piezas y una que falle no puede tumbar la tanda.
 */
async function analizarMuestra(muestra) {
  try {
    if (!muestra.storage_path) throw new Error('La pieza no tiene archivo');

    const buffer = await descargar(muestra.storage_path);
    const esVideo = muestra.tipo === 'video' || String(muestra.mime || '').startsWith('video/');
    const imagenes = esVideo ? await fotogramas(buffer, muestra.mime) : [buffer];

    const resultado = await preguntarAlModelo(imagenes, esVideo);

    await db.guardarAnalisis({
      muestra_id: muestra.id,
      creadora_id: muestra.creadora_id,
      ...resultado,
    });
    return { ok: true, muestra_id: muestra.id };
  } catch (e) {
    return { ok: false, muestra_id: muestra.id, error: e.message };
  }
}

module.exports = { analizarMuestra, interpretarRespuesta, VOCAB, descargar, fotogramas };
