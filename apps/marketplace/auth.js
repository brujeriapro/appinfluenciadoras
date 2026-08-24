// Autenticación de Creators Manager.
//
// Tres identidades distintas, tres puertas distintas:
//   - admin    -> Basic Auth, aplicado por router (no global con lista blanca)
//   - marca    -> JWT Bearer con claim tipo="marca"
//   - creadora -> JWT Bearer con claim tipo="creadora"
//
// Los tokens llevan el tipo dentro y cada middleware lo verifica: un token de
// creadora presentado en una ruta de marca se rechaza, aunque la firma sea
// válida. El secreto es MK_JWT_SECRET, distinto al del Programa Creadoras, así
// que las sesiones de los dos sistemas nunca son intercambiables.

const jwt = require('jsonwebtoken');
const config = require('./config');

// ── Admin (Basic Auth) ──────────────────────────────────────────────────────

function adminAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Creators Manager Admin"');
    return res.status(401).send('Acceso restringido');
  }
  const credenciales = Buffer.from(auth.slice(6), 'base64').toString();
  const sep = credenciales.indexOf(':');
  const usuario = credenciales.slice(0, sep);
  const password = credenciales.slice(sep + 1);

  if (usuario === config.admin.usuario && password === config.admin.password) {
    req.actor = 'admin';
    return next();
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Creators Manager Admin"');
  return res.status(401).send('Credenciales incorrectas');
}

// ── Sesiones de marca y de creadora (JWT) ───────────────────────────────────

function firmarToken(id, tipo) {
  return jwt.sign({ id, tipo }, config.jwt_secret, { expiresIn: config.jwt_expira });
}

function leerToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  // El proxy de medios necesita el token en la query: <img src> no manda headers.
  if (req.query && req.query.t) return String(req.query.t);
  return null;
}

function verificar(tipoEsperado) {
  return (req, res, next) => {
    const token = leerToken(req);
    if (!token) return res.status(401).json({ error: 'No autorizado' });
    try {
      const payload = jwt.verify(token, config.jwt_secret);
      if (payload.tipo !== tipoEsperado) {
        return res.status(401).json({ error: 'Sesión no válida para esta sección' });
      }
      req.usuarioId = payload.id;
      req.actor = payload.tipo;
      next();
    } catch (e) {
      res.status(401).json({ error: 'Token inválido o expirado' });
    }
  };
}

const marcaAuth = verificar('marca');
const creadoraAuth = verificar('creadora');

/** Acepta marca o creadora — para rutas compartidas como el proxy de medios. */
function sesionAuth(req, res, next) {
  const token = leerToken(req);
  if (!token) return res.status(401).json({ error: 'No autorizado' });
  try {
    const payload = jwt.verify(token, config.jwt_secret);
    req.usuarioId = payload.id;
    req.actor = payload.tipo;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// ── Rate limit ──────────────────────────────────────────────────────────────

// En memoria y sin dependencias, igual que en apps/creadoras. Suficiente para un
// solo proceso; si algún día hay varias instancias, esto se mueve a la base.
const _buckets = new Map();

function rateLimit({ windowMs = 60_000, max = 5 } = {}) {
  return (req, res, next) => {
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || 'anon';
    const ahora = Date.now();
    const previas = (_buckets.get(ip) || []).filter(t => ahora - t < windowMs);
    if (previas.length >= max) {
      return res.status(429).json({ error: 'Demasiadas solicitudes, intenta en un momento' });
    }
    previas.push(ahora);
    _buckets.set(ip, previas);
    next();
  };
}

/** IP del cliente, para dejar constancia de la aceptación de términos. */
function ipDe(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null;
}

module.exports = {
  adminAuth, marcaAuth, creadoraAuth, sesionAuth,
  firmarToken, rateLimit, ipDe,
};
