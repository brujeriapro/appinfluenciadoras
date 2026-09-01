// Saca los datos de contacto de una marca leyendo su propio sitio.
//
// Es el cuello de botella real de la prospección: encontrar marcas resultó
// fácil —una búsqueda trae veinte— pero de las primeras 22 solo dos traían
// correo. Los correos no están en los resultados de búsqueda: están dentro de
// las páginas, en el pie o en «contacto».
//
// ── Por qué esto no cuesta nada ────────────────────────────────────────────
//
// Descubrir marcas nuevas necesita una API de búsqueda de pago. Leer el sitio
// de una marca que ya tenemos, no: es una petición HTTP normal a una página
// pública. Todo este módulo corre gratis.
//
// ── Cómo se comporta ───────────────────────────────────────────────────────
//
// Se identifica con un User-Agent propio, pide pocas páginas por sitio, espera
// entre una y otra y se rinde rápido. Nada de esto es cortesía decorativa: un
// sitio que nos bloquea por martillarlo es un prospecto que perdimos, y el
// correo que buscábamos estaba ahí, público, para que cualquiera escribiera.

const AGENTE = 'CreatorsManagerBot/1.0 (+https://creatorsmanager.com)';

/** Dónde suele estar el contacto, en orden de probabilidad. */
const RUTAS = ['', '/contacto', '/contactanos', '/contact', '/nosotros', '/about'];

/** Correos que no son de nadie: los pone la plantilla del sitio, no la marca. */
const BASURA = [
  /@sentry\./i, /@example\./i, /@wixpress\./i, /@shopify\./i, /@squarespace\./i,
  /^noreply@/i, /^no-reply@/i, /@godaddy\./i, /@wordpress\./i, /\.png$/i, /\.jpg$/i,
  /@2x\./i, /@sentry-cdn/i,
];

/**
 * Un correo de verdad, no cualquier cosa con arroba.
 *
 * El caso que lo destapó: `intl-segmenter@11.7.10`, que es la versión de una
 * librería de JavaScript escrita en el código de la página. Tiene arroba,
 * puntos y pasa cualquier expresión regular ingenua — y si sale un mensaje
 * para allá, rebota y le hace daño a la reputación del dominio.
 *
 * La regla que lo mata: la parte final después del último punto tiene que ser
 * solo letras. Ningún dominio termina en números.
 */
function esUtil(correo) {
  if (BASURA.some(re => re.test(correo))) return false;

  const [usuario, dominio] = correo.split('@');
  if (!usuario || !dominio) return false;

  const partes = dominio.split('.');
  const tld = partes[partes.length - 1];
  if (!/^[a-z]{2,}$/i.test(tld)) return false;      // .co, .com — nunca .10
  if (partes.some(p => /^\d+$/.test(p))) return false;  // ningún tramo solo numérico

  // Versiones de paquetes: algo@1.2.3 se cuela por todos lados en el HTML de
  // una tienda moderna.
  if (/^\d+(\.\d+)+$/.test(dominio)) return false;

  return true;
}

/**
 * Los correos que aparecen en un texto.
 *
 * Se buscan primero los `mailto:`, que son los que la marca puso a propósito
 * para que le escriban. Los sueltos en el cuerpo entran después: sirven, pero
 * son más ruidosos.
 */
function correosDe(html) {
  const encontrados = [];

  for (const m of html.matchAll(/mailto:([^"'?\s>]+)/gi)) {
    const c = decodeURIComponent(m[1]).toLowerCase().trim();
    if (esUtil(c)) encontrados.push(c);
  }
  for (const m of html.matchAll(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g)) {
    const c = m[0].toLowerCase().replace(/[.,;]$/, '');
    if (esUtil(c)) encontrados.push(c);
  }

  // Sin repetir y conservando el orden: el primero suele ser el bueno.
  return [...new Set(encontrados)];
}

/**
 * El WhatsApp, que en marcas pequeñas colombianas está más a la vista que el
 * correo y además contesta más rápido.
 *
 * Se acepta solo lo que tenga forma de celular colombiano: diez dígitos que
 * empiezan por 3, con o sin el 57 delante. Sin eso se cuelan números de
 * factura y códigos de seguimiento.
 */
function whatsappDe(html) {
  const nums = [];
  const guardar = (crudo) => {
    const d = String(crudo).replace(/\D/g, '');
    const cel = d.startsWith('57') ? d.slice(2) : d;
    if (/^3\d{9}$/.test(cel)) nums.push('+57' + cel);
  };

  for (const m of html.matchAll(/(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?(\+?\d[\d\s-]{8,})/gi)) guardar(m[1]);
  for (const m of html.matchAll(/tel:(\+?[\d\s()-]{9,})/gi)) guardar(m[1]);

  return [...new Set(nums)];
}

/** El usuario de Instagram, si el sitio enlaza su perfil. */
function instagramDe(html) {
  const cuentas = [];
  for (const m of html.matchAll(/instagram\.com\/([A-Za-z0-9_.]{2,30})/gi)) {
    const u = m[1].toLowerCase();
    // Rutas de Instagram que no son cuentas.
    if (['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv'].includes(u)) continue;
    cuentas.push('@' + u);
  }
  // El que más se repite suele ser el de la marca: está en el pie de cada página.
  const cuenta = {};
  for (const c of cuentas) cuenta[c] = (cuenta[c] || 0) + 1;
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/** Pide una página, con paciencia corta. */
async function pedir(url, { timeout = 12000 } = {}) {
  const corte = AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined;
  const r = await fetch(url, {
    headers: { 'User-Agent': AGENTE, Accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: corte,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const tipo = r.headers.get('content-type') || '';
  if (!/text\/html/i.test(tipo)) throw new Error('no es una página');
  // Un sitio no debería pasar de unos cientos de kilobytes de HTML; si pasa,
  // casi siempre es una tienda con el catálogo entero embebido y el contacto
  // igual está en el pie.
  return (await r.text()).slice(0, 600_000);
}

/**
 * Recorre las páginas donde suele estar el contacto y devuelve lo que
 * encuentre, diciendo de qué página salió cada cosa.
 *
 * Para de buscar apenas tiene correo Y whatsapp: seguir pidiendo páginas de un
 * sitio que ya nos dio lo que necesitábamos es gastar su servidor por nada.
 */
async function contactosDeSitio(sitio, { rutas = RUTAS, pausa = 700 } = {}) {
  if (!sitio) return { ok: false, motivo: 'sin sitio web' };

  let base;
  try {
    base = new URL(/^https?:\/\//i.test(sitio) ? sitio : 'https://' + sitio);
  } catch {
    return { ok: false, motivo: 'la dirección del sitio no es válida' };
  }

  const hallado = { correos: [], whatsapps: [], instagram: [], paginas: [] };
  let algunaAbrio = false;
  let ultimoError = null;

  for (const ruta of rutas) {
    const url = new URL(ruta || '/', base).toString();
    let html;
    try {
      html = await pedir(url);
      algunaAbrio = true;
    } catch (e) {
      ultimoError = e.message;
      continue;
    }

    hallado.paginas.push(ruta || '/');
    hallado.correos.push(...correosDe(html));
    hallado.whatsapps.push(...whatsappDe(html));
    hallado.instagram.push(...instagramDe(html));

    if (hallado.correos.length && hallado.whatsapps.length) break;
    if (pausa) await new Promise(r => setTimeout(r, pausa));
  }

  if (!algunaAbrio) {
    // Pasa con los sitios que bloquean todo lo que no sea un navegador. No es
    // un error nuestro y no se arregla insistiendo.
    return { ok: false, motivo: `el sitio no deja leerlo (${ultimoError || 'sin respuesta'})` };
  }

  const unico = (a) => [...new Set(a)];
  return {
    ok: true,
    email: unico(hallado.correos)[0] || null,
    telefono: unico(hallado.whatsapps)[0] || null,
    instagram: unico(hallado.instagram)[0] || null,
    // Todo lo demás se devuelve por si el primero no sirve.
    todos: {
      correos: unico(hallado.correos),
      whatsapps: unico(hallado.whatsapps),
      instagram: unico(hallado.instagram),
    },
    paginas: hallado.paginas,
  };
}

/**
 * Qué canal usar con lo que se encontró.
 *
 * WhatsApp antes que correo cuando hay los dos: en marcas pequeñas colombianas
 * contesta más y más rápido. El correo queda guardado igual, para el día que
 * el WhatsApp no responda.
 */
function canalPara({ email, telefono, instagram }) {
  if (telefono) return 'whatsapp';
  if (email) return 'correo';
  if (instagram) return 'instagram';
  return null;
}

module.exports = {
  contactosDeSitio, correosDe, whatsappDe, instagramDe, canalPara,
  esUtil, RUTAS, AGENTE,
};
