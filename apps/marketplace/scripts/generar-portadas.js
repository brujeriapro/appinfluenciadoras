#!/usr/bin/env node
// Saca una portada de cada video del catálogo.
//
// El problema que resuelve se ve de una: un <video> sin poster se pinta negro
// hasta que el navegador descarga suficiente. En una fila de cuatro piezas
// donde tres son video, la marca ve tres bloques negros y el catálogo parece
// abandonado aunque el trabajo esté ahí.
//
// La portada pesa unos KB, aparece de inmediato, y de paso el video ya no se
// descarga hasta que alguien le da play — así que el catálogo también carga
// mucho más rápido.
//
//   node scripts/generar-portadas.js          # todos los que falten
//   node scripts/generar-portadas.js 20       # solo 20
//   node scripts/generar-portadas.js --rehacer 10   # rehace las que ya tienen
//
// Necesita las mismas variables que el servidor. No usa el modelo de visión, así
// que no hace falta ANTHROPIC_API_KEY.

const fetch = require('node-fetch');
const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const db = require('../db');
const config = require('../config');

const ejecutar = promisify(execFile);
const STORAGE = String(config.supabase.url || '').replace(/\/$/, '') + '/storage/v1/object';
const A_LA_VEZ = 3;

async function descargar(storage_path) {
  const r = await fetch(`${STORAGE}/${config.supabase.bucket_muestras}/${storage_path}`, {
    headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
  });
  if (!r.ok) throw new Error(`descarga HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function subir(buffer, nombre) {
  const r = await fetch(`${STORAGE}/${config.supabase.bucket_muestras}/${nombre}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.supabase.service_role_key}`,
      'Content-Type': 'image/jpeg',
    },
    body: buffer,
  });
  if (!r.ok) throw new Error(`subida HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return nombre;
}

/**
 * Un fotograma representativo del video.
 *
 * Se toma cerca del segundo 1 y no en el 0: el primer cuadro de un reel suele
 * ser negro o una transición, que es exactamente el problema que venimos a
 * resolver. Si el video es más corto que eso, se cae al principio.
 */
async function portadaDe(buffer, mime) {
  const ffmpeg = require('ffmpeg-static');
  if (!ffmpeg) throw new Error('ffmpeg-static no disponible');

  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'mk-poster-'));
  const ext = String(mime || '').includes('quicktime') ? '.mov' : '.mp4';
  const entrada = path.join(carpeta, 'v' + ext);
  const salida = path.join(carpeta, 'p.jpg');

  try {
    await fs.writeFile(entrada, buffer);
    for (const momento of ['1.0', '0.3', '0']) {
      try {
        await ejecutar(ffmpeg, [
          '-ss', momento, '-i', entrada, '-frames:v', '1', '-q:v', '5',
          // 640 de ancho basta para una miniatura del catálogo y la deja en
          // pocas decenas de KB.
          '-vf', 'scale=640:-2', '-y', salida,
        ], { timeout: 60000 });
        return await fs.readFile(salida);
      } catch { /* se prueba el siguiente momento */ }
    }
    throw new Error('ffmpeg no pudo extraer ningún cuadro');
  } finally {
    await fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const args = process.argv.slice(2);
  const rehacer = args.includes('--rehacer');
  const limite = Number(args.find(a => /^\d+$/.test(a))) || 0;

  const filtro = { select: 'id,tipo,mime,storage_path,poster_path', tipo: 'eq.video' };
  if (!rehacer) filtro.poster_path = 'is.null';

  let videos = await db.get('mk_muestras', filtro);
  if (limite) videos = videos.slice(0, limite);

  if (!videos.length) {
    console.log('No hay videos sin portada. Todo listo.');
    return;
  }

  console.log(`${videos.length} videos por procesar${rehacer ? ' (rehaciendo)' : ''}`);
  let ok = 0, fallos = 0;
  const errores = [];

  for (let i = 0; i < videos.length; i += A_LA_VEZ) {
    await Promise.all(videos.slice(i, i + A_LA_VEZ).map(async (v) => {
      try {
        if (!v.storage_path) throw new Error('sin archivo');
        const jpg = await portadaDe(await descargar(v.storage_path), v.mime);
        const nombre = `poster-${crypto.randomUUID()}.jpg`;
        await subir(jpg, nombre);
        await db.patch('mk_muestras', { id: v.id }, { poster_path: nombre });
        ok++;
      } catch (e) {
        fallos++;
        errores.push(`${v.id.slice(0, 8)}: ${e.message}`);
      }
    }));
    console.log(`  ${Math.min(i + A_LA_VEZ, videos.length)}/${videos.length} · ${ok} bien, ${fallos} con error`);
  }

  console.log(`\nListo. ${ok} portadas, ${fallos} con error.`);
  if (errores.length) {
    console.log('\nErrores:');
    errores.slice(0, 12).forEach(e => console.log('  ' + e));
    if (errores.length > 12) console.log(`  … y ${errores.length - 12} más`);
  }
}

main().catch(e => { console.error('Falló:', e.message); process.exit(1); });
