#!/usr/bin/env node
// Importa las Brujas Embajadoras de Brujería Capilar al banco de Creadores.app.
//
// Qué trae: las creadoras que YA demostraron que entregan — status Calificada o
// Contenido Entregado, o las que están activas en el programa UGC. Las demás no
// aportan confianza a una marca externa.
//
// Qué NO hace, a propósito:
//   - No inventa nicho ni engagement. Esos datos no existen en `influencers` y
//     no son derivables: un catálogo con nichos inventados es peor que uno
//     incompleto. Quedan nulos y el admin los completa al curar.
//   - No pone tarifas. El precio lo define cada creadora desde su portal; la
//     plataforma no le asigna precio a nadie.
//   - No publica a nadie. Todas entran con visible=false: nadie llega al
//     catálogo sin que un humano revise el perfil.
//   - No copia el handle. mk_creadoras no tiene esa columna; el nombre público
//     es un alias derivado del nombre real.
//
// Uso:
//   node scripts/importar_creadoras.js --dry-run   (muestra qué haría)
//   node scripts/importar_creadoras.js             (escribe)

const db = require('../db');
const { rangoAlcance } = require('../comisiones');

const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Alias de catálogo: primer nombre + inicial del apellido.
 * "Valeria Restrepo Gómez" -> "Valeria R."
 * Nunca el handle: es exactamente el dato que el marketplace promete ocultar.
 */
function aliasDe(nombre) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return 'Creadora';
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[1][0].toUpperCase()}.`;
}

async function main() {
  console.log(DRY_RUN ? '── SIMULACIÓN (no escribe) ──\n' : '── IMPORTACIÓN ──\n');

  const cfg = await db.getConfig();
  const rangos = cfg.rangos_alcance || [];

  const elegibles = await db.getInfluencersElegibles();
  console.log(`Brujas Embajadoras elegibles: ${elegibles.length}\n`);

  let creadas = 0, actualizadas = 0, saltadas = 0;

  for (const inf of elegibles) {
    if (!inf.email) {
      console.log(`  ~ ${inf.nombre || inf.id}: sin email, no se puede crear cuenta — saltada`);
      saltadas++;
      continue;
    }

    const alcance = (inf.seguidores_instagram || 0) + (inf.seguidores_tiktok || 0);
    const contenidos = await db.contarContenidosDeInfluencer(inf.id);

    const datos = {
      influencer_id: inf.id,
      nombre_publico: aliasDe(inf.nombre),
      email: String(inf.email).toLowerCase().trim(),
      whatsapp: inf.telefono || null,
      ciudad: inf.ciudad || null,
      alcance_total: alcance || null,
      rango_alcance: alcance ? rangoAlcance(alcance, rangos) : null,
      colaboraciones_completadas: contenidos,
      es_bruja_embajadora: true,   // comisión 0% en sus primeros tratos
      visible: false,              // pendiente de curaduría
    };

    const existente = await db.getCreadoraPorInfluencer(inf.id);

    if (existente) {
      // Idempotente: se refrescan las cifras, se respeta lo que el admin curó
      // a mano (nicho, tarifa, visibilidad, alias editado).
      const cambios = {
        alcance_total: datos.alcance_total,
        rango_alcance: datos.rango_alcance,
        colaboraciones_completadas: datos.colaboraciones_completadas,
        whatsapp: existente.whatsapp || datos.whatsapp,
        ciudad: existente.ciudad || datos.ciudad,
      };
      console.log(`  ↻ ${datos.nombre_publico}: actualizada (${alcance.toLocaleString('es-CO')} seguidores, ${contenidos} piezas)`);
      if (!DRY_RUN) await db.updateCreadora(existente.id, cambios);
      actualizadas++;
      continue;
    }

    // Puede existir ya una cuenta con ese correo sin vínculo al programa.
    if (await db.getCreadoraPorEmail(datos.email)) {
      console.log(`  ~ ${datos.nombre_publico}: ya hay una cuenta con ${datos.email} — saltada`);
      saltadas++;
      continue;
    }

    console.log(`  + ${datos.nombre_publico}: nueva (${alcance.toLocaleString('es-CO')} seguidores, ${contenidos} piezas, rango ${datos.rango_alcance || 'sin definir'})`);
    if (!DRY_RUN) await db.insertCreadora(datos);
    creadas++;
  }

  console.log(`\nCreadas: ${creadas} · Actualizadas: ${actualizadas} · Saltadas: ${saltadas}`);
  console.log('\nSiguientes pasos:');
  console.log('  1. Panel admin: asignar nicho y engagement a cada perfil.');
  console.log('  2. Cada creadora entra a su portal y define sus tarifas.');
  console.log('  3. Publicar el perfil — no se puede publicar sin tarifas.');
  console.log('\nNinguna aparece en el catálogo hasta que se complete eso.');
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
