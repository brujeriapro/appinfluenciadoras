// Backfill de campos vacíos en influencers desde CSV de Tally (formulario de registro)
//
// Uso:
//   node backfill_registro.js <csv> <supabase-url> <supabase-key> [--dry-run]
//
// Ejemplo:
//   node backfill_registro.js "C:\Downloads\registro.csv" https://xxx.supabase.co eyJxxx... --dry-run
//
// Qué hace:
//   - Lee el CSV exportado desde Tally del formulario de registro
//   - Busca cada influencer en Supabase por email
//   - Actualiza SOLO los campos que están vacíos (null/vacío) — nunca sobreescribe datos existentes
//   - Los campos que rellena: telefono, direccion_envio, ciudad, departamento, instagram_handle,
//     tiktok_handle, seguidores_instagram, seguidores_tiktok, tipo_cabello
//   - Con --dry-run muestra qué cambiaría sin tocar nada

const fs = require('fs');

const [,, csvPath, SUPABASE_URL, SUPABASE_KEY, ...rest] = process.argv;
const dryRun = rest.includes('--dry-run');

if (!csvPath || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Uso: node backfill_registro.js <csv> <supabase-url> <supabase-key> [--dry-run]');
  process.exit(1);
}

const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
};

async function sbGet(table, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: SB_HEADERS });
  if (!res.ok) throw new Error(`GET ${table}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, filter, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`PATCH ${table}: ${await res.text()}`);
}

// ── Normalización de tildes (mismo fix que el webhook) ───────────────
function sinTildes(str) {
  return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// ── CSV parser ───────────────────────────────────────────────────────
function parseRow(line) {
  const result = []; let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

function parseCSV(content) {
  const lines = content.replace(/\r/g, '').split('\n').filter(l => l.trim());
  const headers = parseRow(lines[0]).map(h => h.trim());
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const row = {};
    headers.forEach((h, i) => { row[sinTildes(h.toLowerCase().trim())] = (vals[i] || '').trim(); });
    return row;
  });
}

// ── Buscar columna con normalización ────────────────────────────────
function col(row, ...keys) {
  for (const k of keys) {
    const v = row[sinTildes(k.toLowerCase())];
    if (v != null && v !== '') return v;
  }
  return null;
}

// ── Limpiar handles de redes sociales ───────────────────────────────
function cleanHandle(v) {
  return v ? v.replace('@', '').trim() || null : null;
}

// ── Main ─────────────────────────────────────────────────────────────
async function main() {
  const raw = fs.readFileSync(csvPath, 'utf-8');
  const rows = parseCSV(raw);
  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Filas en CSV: ${rows.length}\n`);

  let actualizadas = 0, sinCambios = 0, noEncontradas = 0, errores = 0;

  for (const row of rows) {
    const email = col(row,
      'email', 'correo', 'e-mail',
      'email address', 'correo electronico', 'correo electrónico'
    );

    if (!email) { sinCambios++; continue; }
    const emailNorm = email.toLowerCase().trim();

    // Buscar en Supabase
    let infs;
    try {
      infs = await sbGet('influencers', `email=eq.${encodeURIComponent(emailNorm)}&limit=1`);
    } catch (e) {
      console.error(`  ERROR buscando ${emailNorm}: ${e.message}`);
      errores++; continue;
    }

    const inf = infs?.[0];
    if (!inf) {
      console.log(`  SKIP  [no en BD] ${emailNorm}`);
      noEncontradas++; continue;
    }

    // Extraer campos del CSV
    const telefono    = col(row, 'telefono', 'teléfono', 'celular', 'whatsapp', 'telefono / whatsapp', 'teléfono / whatsapp');
    const instagram   = cleanHandle(col(row, 'instagram', 'usuario instagram', 'handle instagram', '@instagram', 'cuenta de instagram', 'cuenta de instagram (sin @)'));
    const tiktok      = cleanHandle(col(row, 'tiktok', 'usuario tiktok', 'handle tiktok', '@tiktok', 'cuenta de tiktok', 'cuenta de tiktok (sin @)'));
    const segInsta    = parseInt(col(row, 'seguidores instagram', 'seguidores en instagram', 'numero de seguidores en instagram', 'followers instagram') || '0') || null;
    const segTiktok   = parseInt(col(row, 'seguidores tiktok', 'seguidores en tiktok', 'numero de seguidores en tiktok', 'followers tiktok') || '0') || null;
    const ciudad      = col(row, 'ciudad', 'city');
    const departamento= col(row, 'departamento', 'department', 'depto');
    const direccion   = col(row, 'direccion de envio', 'dirección de envío', 'direccion', 'direccion completa', 'address');
    const tipoCabello = col(row, 'tipo de cabello', 'tipo cabello', 'hair type', 'cabello');

    // Solo actualizar campos que están vacíos en Supabase
    const updates = {};
    if (!inf.telefono       && telefono)    updates.telefono          = telefono;
    if (!inf.instagram_handle && instagram) updates.instagram_handle  = instagram;
    if (!inf.tiktok_handle  && tiktok)      updates.tiktok_handle     = tiktok;
    if (!inf.seguidores_instagram && segInsta) updates.seguidores_instagram = segInsta;
    if (!inf.seguidores_tiktok  && segTiktok)  updates.seguidores_tiktok   = segTiktok;
    if (!inf.ciudad         && ciudad)      updates.ciudad            = ciudad;
    if (!inf.departamento   && departamento) updates.departamento     = departamento;
    if (!inf.direccion_envio && direccion)  updates.direccion_envio   = direccion;
    if (!inf.tipo_cabello   && tipoCabello) updates.tipo_cabello      = tipoCabello;

    if (Object.keys(updates).length === 0) {
      console.log(`  OK    [sin cambios] ${inf.nombre}`);
      sinCambios++; continue;
    }

    const camposList = Object.keys(updates).join(', ');
    console.log(`  ${dryRun ? 'DRY  ' : 'PATCH'} ${inf.nombre} | ${camposList}`);
    if (dryRun) {
      Object.entries(updates).forEach(([k, v]) => console.log(`         ${k}: "${v}"`));
    }

    if (!dryRun) {
      try {
        await sbPatch('influencers', `id=eq.${inf.id}`, updates);
        actualizadas++;
      } catch (e) {
        console.error(`  ERROR actualizando ${inf.nombre}: ${e.message}`);
        errores++;
      }
    } else {
      actualizadas++;
    }
  }

  console.log(`\n── Resumen ──────────────────────────`);
  console.log(`  Actualizadas   : ${actualizadas}`);
  console.log(`  Sin cambios    : ${sinCambios}`);
  console.log(`  No encontradas : ${noEncontradas}`);
  console.log(`  Errores        : ${errores}`);
  console.log(`─────────────────────────────────────\n`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
