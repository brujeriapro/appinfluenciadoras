// Importador de contenidos desde CSV de Tally
// Uso:
//   node importar_contenido_tally.js <csv> <supabase-url> <supabase-key> [--dry-run]
//
// Ejemplo:
//   node importar_contenido_tally.js "C:\Downloads\tally.csv" https://xxx.supabase.co eyJxxx... --dry-run
//
// El formulario de Tally no capturó vistas/likes/guardados, así que
// score_contenido se guarda en 0. El equipo actualiza métricas desde el dashboard.

const fs = require('fs');

// ── CLI args ─────────────────────────────────────────────────────────

const [,, csvPath, SUPABASE_URL, SUPABASE_KEY, ...rest] = process.argv;
const dryRun = rest.includes('--dry-run');

if (!csvPath || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Uso: node importar_contenido_tally.js <csv> <supabase-url> <supabase-key> [--dry-run]');
  process.exit(1);
}

// ── Supabase helpers directos ────────────────────────────────────────

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

async function sbPost(table, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'return=representation' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`POST ${table}: ${await res.text()}`);
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

// ── Nivel (misma lógica que scoring.js) ─────────────────────────────

function calcularNivel(score) {
  if (score >= 201) return 'Gran Maga';
  if (score >= 101) return 'Experta';
  if (score >=  51) return 'Practicante';
  if (score >=  21) return 'Aprendiz';
  return 'Semilla';
}

// ── Normalización ────────────────────────────────────────────────────

function normalizarPlataforma(p) {
  if (!p) return 'Instagram';
  const v = p.split(',')[0].trim().toLowerCase();
  if (v.includes('tiktok')) return 'TikTok';
  if (v.includes('youtube')) return 'YouTube';
  return 'Instagram';
}

function normalizarTipo(t) {
  if (!t) return 'Reel';
  const v = t.split(',')[0].trim().toLowerCase();
  if (v.includes('tiktok') || v.includes('video tik')) return 'TikTok';
  if (v.includes('reel')) return 'Reel';
  if (v.includes('story') || v.includes('historia')) return 'Historia';
  if (v.includes('post')) return 'Post';
  return 'Reel';
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
    headers.forEach((h, i) => { row[h] = (vals[i] || '').trim(); });
    return row;
  });
}

// ── Main ─────────────────────────────────────────────────────────────

const COL_URL     = 'URL o URLs (LINK o LINKs si son varios) de tu contenido/s';
const SKIP_EMAILS = ['@ettos.co'];

async function main() {
  const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));
  console.log(`\n${dryRun ? '[DRY RUN] ' : ''}Filas en CSV: ${rows.length}\n`);

  let importadas = 0, saltadas = 0, errores = 0;
  const yaVisto = new Set();

  for (const row of rows) {
    const email     = (row['Email'] || '').toLowerCase().trim();
    const urlsRaw   = row[COL_URL] || '';
    const plataforma = normalizarPlataforma(row['Plataforma']);
    const tipo       = normalizarTipo(row['Tipo de contenido']);
    const fecha      = row['Submitted at'] || new Date().toISOString();

    if (!email || SKIP_EMAILS.some(d => email.includes(d))) {
      console.log(`  SKIP  [test/sin email] ${email || '(vacío)'}`);
      saltadas++; continue;
    }

    const urls = urlsRaw.split(/\s+/).map(u => u.trim()).filter(u => u.startsWith('http'));
    if (urls.length === 0) {
      console.log(`  SKIP  [URL inválida] ${email} → "${urlsRaw}"`);
      saltadas++; continue;
    }

    // Buscar influencer por email
    let infs;
    try {
      infs = await sbGet('influencers', `email=eq.${encodeURIComponent(email)}&limit=1`);
    } catch (e) {
      console.error(`  ERROR buscando ${email}: ${e.message}`);
      errores++; continue;
    }

    const inf = infs?.[0];
    if (!inf) {
      console.log(`  SKIP  [no encontrada en BD] ${email}`);
      saltadas++; continue;
    }

    for (const url of urls) {
      const key = `${email}||${url}`;
      if (yaVisto.has(key)) {
        console.log(`  SKIP  [dup en CSV] ${email} → ${url}`);
        saltadas++; continue;
      }
      yaVisto.add(key);

      // Verificar si ya existe este url en contenidos (dedup contra BD)
      let existing;
      try {
        existing = await sbGet('contenidos', `influencer_id=eq.${inf.id}&url_contenido=eq.${encodeURIComponent(url)}&limit=1`);
      } catch { existing = []; }

      if (existing?.length > 0) {
        console.log(`  SKIP  [ya existe en BD] ${email} → ${url}`);
        saltadas++; continue;
      }

      console.log(`  ${dryRun ? 'DRY  ' : 'INSERT'} ${inf.nombre} | ${plataforma} | ${tipo} | ${url}`);

      if (!dryRun) {
        try {
          await sbPost('contenidos', {
            influencer_id   : inf.id,
            fecha_submision : fecha,
            tipo_contenido  : tipo,
            plataforma,
            url_contenido   : url,
            vistas          : 0,
            likes           : 0,
            guardados       : null,
            score_contenido : 0,
          });
          importadas++;
        } catch (e) {
          console.error(`  ERROR insertando: ${e.message}`);
          errores++;
        }
      } else {
        importadas++;
      }
    }

    // Actualizar status/nivel si es necesario
    if (!dryRun && !['Contenido Entregado', 'Calificada'].includes(inf.status)) {
      try {
        const todos = await sbGet('contenidos', `influencer_id=eq.${inf.id}`);
        const scoreTotal = (todos || []).reduce((s, c) => s + (c.score_contenido || 0), 0);
        const nivel = calcularNivel(scoreTotal);
        await sbPatch('influencers', `id=eq.${inf.id}`, {
          status      : 'Contenido Entregado',
          nivel_bruja : nivel,
          score_total : scoreTotal,
        });
      } catch (e) {
        console.error(`  ERROR actualizando ${inf.nombre}: ${e.message}`);
      }
    }
  }

  console.log(`\n── Resumen ──────────────────────────`);
  console.log(`  Importadas : ${importadas}`);
  console.log(`  Saltadas   : ${saltadas}`);
  console.log(`  Errores    : ${errores}`);
  console.log(`─────────────────────────────────────\n`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
