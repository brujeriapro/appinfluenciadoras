#!/usr/bin/env node
// Invita al banco de Creators Manager a las creadoras del Programa Creadoras.
//
// Por qué va por olas y no todo de una:
//
//   1. Brevo deja 300 correos al día en el plan gratuito. Son 707 personas.
//   2. Más importante: un dominio recién estrenado que manda cientos de correos
//      de golpe se ve igual que un spammer, y esa reputación se le queda pegada.
//      Empezar por quienes más probablemente abran —las que ya entregaron
//      contenido— le enseña a Gmail que el dominio es legítimo antes de subir
//      el volumen.
//
// Nadie recibe la invitación dos veces: cada envío queda anotado en
// `mk_invitaciones`, con un índice único por correo. Si el script se cae a
// mitad, se vuelve a correr y sigue donde iba.
//
// Uso:
//   node scripts/invitar_creadoras.js --ola=1 --dry-run   ve a quién le tocaría
//   node scripts/invitar_creadoras.js --ola=1             envía de verdad
//   node scripts/invitar_creadoras.js --estado            cuántas van y cuántas faltan
//
// Opciones:
//   --ola=N        1..4 (ver OLAS). Sin ella, no envía nada.
//   --limite=N     tope de correos de esta corrida (default 250)
//   --dry-run      no envía ni escribe; solo muestra
//   --pausa=MS     espera entre correos (default 900 ms)

const db = require('../db');
const config = require('../config');
const notificaciones = require('../notificaciones');
const correo = require('../correo');
const { OLAS, filtrarCandidatas, pendientesDe, filtroDeEstados } = require('../invitaciones');

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => {
  const a = args.find(x => x.startsWith(`--${nombre}=`));
  return a ? a.split('=')[1] : porDefecto;
};

const DRY_RUN = args.includes('--dry-run');
const SOLO_ESTADO = args.includes('--estado');
const OLA = parseInt(opcion('ola', '0'), 10);
// 250 y no 300: deja margen para los correos normales de la plataforma, que
// salen por la misma cuota (recuperar contraseña, avisos de propuesta).
const LIMITE = parseInt(opcion('limite', '250'), 10);
const PAUSA_MS = parseInt(opcion('pausa', '900'), 10);

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

/** Correos a los que ya se les escribió. */
const yaInvitados = () => db.get('mk_invitaciones', { select: 'email' });

async function candidatas(estados) {
  const filas = await db.get('influencers', {
    select: 'id,nombre,email,status',
    status: filtroDeEstados(estados),
  });
  return filtrarCandidatas(filas);
}

async function mostrarEstado() {
  const enviados = await yaInvitados();
  console.log(`\nInvitaciones enviadas hasta ahora: ${enviados.size}\n`);
  console.log('  OLA  QUIÉNES                     TOTAL  INVITADAS  FALTAN');
  console.log('  ───  ─────────────────────────  ─────  ─────────  ──────');

  for (const [n, ola] of Object.entries(OLAS)) {
    const gente = await candidatas(ola.estados);
    const ya = gente.length - pendientesDe(gente, enviados).length;
    console.log(
      `   ${n}   ${ola.nombre.padEnd(25)}  ${String(gente.length).padStart(5)}` +
      `  ${String(ya).padStart(9)}  ${String(gente.length - ya).padStart(6)}`
    );
  }

  // Cerrar el círculo: de las invitadas, cuántas terminaron creando perfil.
  const registradas = await db.get('mk_invitaciones', {
    select: 'email', registrada_at: 'not.is.null',
  });
  if (enviados.size) {
    const pct = Math.round(registradas.length / enviados.size * 100);
    console.log(`\n  Se registraron: ${registradas.length} de ${enviados.size} (${pct}%)`);
  }
  console.log('');
}

async function main() {
  if (SOLO_ESTADO) return mostrarEstado();

  if (!OLAS[OLA]) {
    console.error('Falta decir qué ola. Ejemplo: --ola=1\n');
    console.error('  1  Ya entregaron contenido   (las que más van a abrir)');
    console.error('  2  Recibieron kit');
    console.error('  3  Solo registradas');
    console.error('  4  Descartadas y pausadas');
    console.error('\n  --estado  muestra cuántas van y cuántas faltan');
    process.exit(1);
  }

  if (!correo.activo() && !config.smtp.user) {
    console.error('No hay correo configurado (MK_BREVO_API_KEY). No se enviaría nada.');
    process.exit(1);
  }

  const ola = OLAS[OLA];
  const enviados = await yaInvitados();
  const todas = await candidatas(ola.estados);
  const pendientes = pendientesDe(todas, enviados);
  const lote = pendientes.slice(0, LIMITE);

  console.log(`\nOla ${OLA} — ${ola.nombre}`);
  console.log(`  En esta ola:        ${todas.length}`);
  console.log(`  Ya invitadas:       ${todas.length - pendientes.length}`);
  console.log(`  Se enviarían ahora: ${lote.length}${pendientes.length > LIMITE ? ` (quedan ${pendientes.length - LIMITE} para mañana)` : ''}`);
  console.log(`  Desde:              ${config.smtp.remitente}`);
  console.log(`  Enlace:             ${config.base_url}/creadora.html\n`);

  if (!lote.length) {
    console.log('  Nada por enviar en esta ola.\n');
    return;
  }

  if (DRY_RUN) {
    console.log('  SIMULACRO — no se envía ni se escribe nada. Primeras 10:\n');
    lote.slice(0, 10).forEach(c => console.log(`    ${(c.nombre || '(sin nombre)').padEnd(28)} ${c.email}`));
    if (lote.length > 10) console.log(`    ... y ${lote.length - 10} más`);
    console.log('');
    return;
  }

  let ok = 0, fallos = 0;
  for (const [i, c] of lote.entries()) {
    // Se anota ANTES de enviar. Si el proceso muere justo después de que el
    // correo salió, la peor consecuencia es una invitación no registrada; al
    // revés sería escribirle dos veces a la misma persona.
    let anotada = null;
    try {
      anotada = await db.post('mk_invitaciones', {
        influencer_id: c.id,
        email: c.email,
        nombre: c.nombre || null,
        ola: OLA,
        status_origen: c.status,
      });
    } catch (e) {
      // Choca con el índice único: alguien más ya la invitó. Seguimos.
      console.log(`  ${String(i + 1).padStart(3)}. ${c.email} — ya estaba invitada`);
      continue;
    }

    const enviado = await notificaciones.invitacionCreadora({
      email: c.email, nombre: c.nombre, status: c.status,
    });

    if (enviado) {
      ok++;
      await db.patch('mk_invitaciones', { id: anotada.id }, { enviada_at: new Date().toISOString() });
      console.log(`  ${String(i + 1).padStart(3)}. ${c.email}`);
    } else {
      fallos++;
      await db.patch('mk_invitaciones', { id: anotada.id }, { error: 'El envío falló — ver logs' });
      console.log(`  ${String(i + 1).padStart(3)}. ${c.email} — FALLÓ`);
    }

    // Sin pausa, cientos de correos seguidos parecen un ataque y el proveedor
    // corta. Con ~1 segundo entre cada uno, 250 correos toman 4 minutos.
    if (i < lote.length - 1) await dormir(PAUSA_MS);
  }

  console.log(`\n  Enviadas: ${ok}   Fallidas: ${fallos}`);
  if (pendientes.length > lote.length) {
    console.log(`  Quedan ${pendientes.length - lote.length} de esta ola. Vuelve a correrlo mañana.`);
  }
  console.log('');
}

main().catch(e => { console.error('\nSe cayó:', e.message, '\n'); process.exit(1); });
