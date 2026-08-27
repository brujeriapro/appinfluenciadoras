#!/usr/bin/env node
// Pone marca de agua a las piezas del catálogo.
//
//   node scripts/marcar-contenido.js imagenes      # solo imágenes (rápido)
//   node scripts/marcar-contenido.js posters       # portadas de video
//   node scripts/marcar-contenido.js videos 20     # videos, de a poco (lento)
//   node scripts/marcar-contenido.js todo
//   node scripts/marcar-contenido.js rehacer     # borra lo marcado y vuelve a empezar
//
// Los videos se separan a propósito: recodificar uno toma entre diez y treinta
// segundos, así que doscientos son casi una hora. Las imágenes y las portadas
// son lo que se ve en la grilla del catálogo, así que van primero.
//
// Es seguro correrlo cuantas veces se quiera: solo toca lo que falta.

const fetch = require('node-fetch');
const crypto = require('crypto');

const db = require('../db');
const config = require('../config');
const { marcarImagen, marcarVideo } = require('../watermark');

const STORAGE = String(config.supabase.url || '').replace(/\/$/, '') + '/storage/v1/object';

/**
 * Reintenta ante caídas de red, esperando cada vez más.
 *
 * Sin esto, un corte de DNS de veinte segundos se lleva por delante las
 * doscientas piezas restantes del lote: cada una falla al instante y la corrida
 * termina "completa" con casi todo sin marcar. Pasó en la primera pasada.
 *
 * Solo se reintenta lo que parece de red. Un 400 de Storage —tipo no permitido,
 * archivo demasiado grande— va a fallar igual las tres veces.
 */
async function conReintento(tarea, intentos = 4) {
  for (let i = 1; ; i++) {
    try {
      return await tarea();
    } catch (e) {
      const deRed = /ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|socket hang up|network/i.test(e.message);
      if (!deRed || i >= intentos) throw e;
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}

async function descargar(ruta) {
  return conReintento(async () => {
    const r = await fetch(`${STORAGE}/${config.supabase.bucket_muestras}/${ruta}`, {
      headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
    });
    if (!r.ok) throw new Error(`descarga HTTP ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  });
}

async function subir(buffer, nombre, mime) {
  return conReintento(async () => {
    const r = await fetch(`${STORAGE}/${config.supabase.bucket_muestras}/${nombre}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.supabase.service_role_key}`,
        'Content-Type': mime,
      },
      body: buffer,
    });
    if (!r.ok) throw new Error(`subida HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return nombre;
  });
}

/** Marca la fila como lista, reintentando: perder esto rehace todo el trabajo. */
const anotar = (id, datos) => conReintento(() => db.actualizarMuestra(id, datos));

/** Imágenes del catálogo: lo que más se ve y lo más barato de marcar. */
async function marcarImagenes(limite) {
  const filas = await db.get('mk_muestras', {
    select: 'id,storage_path,mime',
    tipo: 'eq.imagen',
    watermark_path: 'is.null',
    limit: String(limite),
  });
  return procesar(filas, 'imágenes', async (m) => {
    const marcada = await marcarImagen(await descargar(m.storage_path));
    const nombre = `wm-${crypto.randomUUID()}.jpg`;
    await subir(marcada, nombre, 'image/jpeg');
    await anotar(m.id, { watermark_path: nombre, watermark_at: new Date().toISOString() });
  });
}

/** Portadas de video: se ven en la grilla igual que una imagen. */
async function marcarPosters(limite) {
  const todas = await db.get('mk_muestras', {
    select: 'id,poster_path,watermark_poster_path',
    tipo: 'eq.video',
    poster_path: 'not.is.null',
    limit: String(limite * 3),
  });
  const filas = todas.filter(m => !m.watermark_poster_path).slice(0, limite);
  return procesar(filas, 'portadas', async (m) => {
    const marcada = await marcarImagen(await descargar(m.poster_path));
    const nombre = `wmp-${crypto.randomUUID()}.jpg`;
    await subir(marcada, nombre, 'image/jpeg');
    await anotar(m.id, { watermark_poster_path: nombre });
  });
}

/** Videos: caro, se corre de a tandas. */
async function marcarVideos(limite) {
  const filas = await db.get('mk_muestras', {
    select: 'id,storage_path,mime',
    tipo: 'eq.video',
    watermark_path: 'is.null',
    limit: String(limite),
  });
  return procesar(filas, 'videos', async (m) => {
    const marcado = await marcarVideo(await descargar(m.storage_path), m.mime);
    const nombre = `wmv-${crypto.randomUUID()}.mp4`;
    await subir(marcado, nombre, 'video/mp4');
    await anotar(m.id, { watermark_path: nombre, watermark_at: new Date().toISOString() });
  });
}

/**
 * Recorre una lista aplicando la tarea, sin paralelizar.
 *
 * De a una a propósito: ffmpeg usa todos los núcleos que encuentra, así que
 * lanzar varias a la vez no acelera nada y sí llena la memoria con videos
 * grandes.
 */
async function procesar(filas, que, tarea) {
  if (!filas.length) {
    console.log(`  ${que}: nada pendiente`);
    return { ok: 0, fallos: 0 };
  }
  console.log(`  ${que}: ${filas.length} por marcar`);

  let ok = 0, fallos = 0;
  const errores = [];
  for (const [i, m] of filas.entries()) {
    try {
      await tarea(m);
      ok++;
    } catch (e) {
      fallos++;
      errores.push(`${m.id.slice(0, 8)}: ${e.message}`);
    }
    if ((i + 1) % 10 === 0 || i === filas.length - 1) {
      console.log(`    ${i + 1}/${filas.length} · ${ok} bien, ${fallos} con error`);
    }
  }
  if (errores.length) {
    console.log(`    errores en ${que}:`);
    errores.slice(0, 6).forEach(e => console.log('      ' + e));
    if (errores.length > 6) console.log(`      … y ${errores.length - 6} más`);
  }
  return { ok, fallos };
}

/**
 * Tira lo ya marcado para volver a marcarlo con el logo actual.
 *
 * Hace falta cada vez que cambia el diseño de la marca: el resto del script
 * solo toca lo que está sin marcar, así que sin esto un logo nuevo solo
 * aplicaría a las piezas que entren de aquí en adelante y el catálogo quedaría
 * con dos marcas distintas conviviendo.
 *
 * Borra también los archivos viejos del bucket. Dejarlos sería acumular una
 * copia muerta por pieza y por rediseño, y nadie vuelve a limpiarlas.
 */
async function rehacer() {
  const filas = await conReintento(() => db.get('mk_muestras', {
    select: 'id,watermark_path,watermark_poster_path',
    or: '(watermark_path.not.is.null,watermark_poster_path.not.is.null)',
  }));
  console.log(`  soltando ${filas.length} piezas ya marcadas`);

  for (const m of filas) {
    for (const ruta of [m.watermark_path, m.watermark_poster_path]) {
      if (!ruta) continue;
      await fetch(`${STORAGE}/${config.supabase.bucket_muestras}/${ruta}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${config.supabase.service_role_key}` },
      }).catch(() => {});   // un archivo huérfano es menos grave que parar aquí
    }
    await anotar(m.id, {
      watermark_path: null, watermark_poster_path: null, watermark_at: null,
    });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const que = args.find(a => !/^\d+$/.test(a)) || 'todo';
  const limite = Number(args.find(a => /^\d+$/.test(a))) || 500;

  console.log(`Marcando: ${que} (tope ${limite})`);

  if (que === 'rehacer') await rehacer();

  if (que === 'rehacer' || que === 'imagenes' || que === 'todo') await marcarImagenes(limite);
  if (que === 'rehacer' || que === 'posters'  || que === 'todo') await marcarPosters(limite);
  if (que === 'videos'   || que === 'todo') await marcarVideos(limite);

  const pend = await conReintento(() =>
    db.get('mk_muestras', { select: 'id,tipo', watermark_path: 'is.null' }));
  const vid = pend.filter(p => p.tipo === 'video').length;
  console.log(`\nQuedan sin marcar: ${pend.length} (${vid} videos, ${pend.length - vid} imágenes)`);
}

main().catch(e => { console.error('Falló:', e.message); process.exit(1); });
