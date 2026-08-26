#!/usr/bin/env node
// Analiza las piezas de contenido que todavía no tienen análisis.
//
// Se corre a mano la primera vez, para procesar el backlog, y después
// periódicamente para las piezas nuevas. Es seguro correrlo cuantas veces se
// quiera: solo toca lo que falta.
//
//   node scripts/analizar-contenido.js            # 25 piezas
//   node scripts/analizar-contenido.js 300        # hasta 300
//   node scripts/analizar-contenido.js 5 --prueba # 5 piezas, sin guardar nada
//
// Necesita en el entorno: ANTHROPIC_API_KEY, MK_SUPABASE_URL y la
// service_role_key, igual que el servidor.
//
// Va de a tres piezas a la vez. Se podría paralelizar más, pero cada video
// pasa por ffmpeg y el cuello de botella es el CPU de la máquina, no la API.

const db = require('../db');
const { analizarMuestra } = require('../analisis');

const A_LA_VEZ = 3;

async function main() {
  const args = process.argv.slice(2);
  const prueba = args.includes('--prueba');
  const limite = Number(args.find(a => /^\d+$/.test(a))) || 25;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Falta ANTHROPIC_API_KEY en el entorno.');
    process.exit(1);
  }

  console.log(`Buscando piezas sin analizar (tope ${limite})…`);
  const pendientes = await db.getMuestrasSinAnalizar(limite);

  if (!pendientes.length) {
    console.log('No hay piezas pendientes. Todo analizado.');
    return;
  }

  const videos = pendientes.filter(m => m.tipo === 'video').length;
  console.log(`${pendientes.length} pendientes (${videos} video, ${pendientes.length - videos} imagen)`);
  if (prueba) console.log('MODO PRUEBA: se analiza pero no se guarda.\n');

  let ok = 0, fallos = 0;
  const errores = [];

  for (let i = 0; i < pendientes.length; i += A_LA_VEZ) {
    const tanda = pendientes.slice(i, i + A_LA_VEZ);
    const resultados = await Promise.all(tanda.map(async (m) => {
      if (prueba) {
        // En prueba se hace todo el trabajo menos escribir, para poder ver qué
        // devuelve el modelo sin ensuciar la base.
        const { descargar, fotogramas } = require('../analisis');
        try {
          const buf = await descargar(m.storage_path);
          const esVideo = m.tipo === 'video';
          const imgs = esVideo ? await fotogramas(buf, m.mime) : [buf];
          console.log(`  ${m.id.slice(0, 8)} · ${m.tipo} · ${imgs.length} imagen(es) listas`);
          return { ok: true, muestra_id: m.id };
        } catch (e) {
          return { ok: false, muestra_id: m.id, error: e.message };
        }
      }
      return analizarMuestra(m);
    }));

    resultados.forEach(r => {
      if (r.ok) { ok++; }
      else { fallos++; errores.push(`${r.muestra_id.slice(0, 8)}: ${r.error}`); }
    });

    const hechas = Math.min(i + A_LA_VEZ, pendientes.length);
    console.log(`  ${hechas}/${pendientes.length} · ${ok} bien, ${fallos} con error`);
  }

  console.log(`\nListo. ${ok} analizadas, ${fallos} con error.`);
  if (errores.length) {
    console.log('\nErrores:');
    // Los errores se repiten mucho (un bucket mal configurado falla igual en
    // las 300), así que se agrupan para no llenar la pantalla de lo mismo.
    const porMensaje = {};
    errores.forEach(e => {
      const msg = e.split(': ').slice(1).join(': ');
      (porMensaje[msg] = porMensaje[msg] || []).push(e.split(':')[0]);
    });
    Object.entries(porMensaje).forEach(([msg, ids]) => {
      console.log(`  ${ids.length}× ${msg}`);
      console.log(`     (${ids.slice(0, 5).join(', ')}${ids.length > 5 ? '…' : ''})`);
    });
  }
}

main().catch(e => { console.error('Falló:', e.message); process.exit(1); });
