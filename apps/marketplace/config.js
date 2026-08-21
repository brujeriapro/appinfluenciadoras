// Configuración de Creadores.app — marketplace de creadoras.
//
// A diferencia de apps/creadoras/, este servicio NO tiene fallback a un JSON local:
// nace directo en producción y todos sus secretos vienen de variables de entorno.
// Comparte la instancia de Supabase con el Programa Creadoras, pero sus secretos
// de sesión y de admin son PROPIOS — un token de un sistema no debe valer en el otro.

const config = {
  puerto: parseInt(process.env.PORT || '3040', 10),
  base_url: process.env.MK_BASE_URL || 'http://localhost:3040',
  entorno: process.env.NODE_ENV || 'development',

  supabase: {
    url: process.env.SUPABASE_URL,
    service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    bucket_muestras: process.env.MK_BUCKET_MUESTRAS || 'mk-muestras',
  },

  // Secreto propio: distinto al JWT_SECRET del Programa Creadoras a propósito.
  jwt_secret: process.env.MK_JWT_SECRET,
  jwt_expira: process.env.MK_JWT_EXPIRA || '30d',

  admin: {
    usuario: process.env.MK_ADMIN_USER || 'admin',
    password: process.env.MK_ADMIN_PASS,
  },

  // Acceso por invitación: la Fase 1 no tiene registro público abierto.
  codigos_invitacion: (process.env.MK_CODIGOS_INVITACION || '')
    .split(',')
    .map(c => c.trim().toUpperCase())
    .filter(Boolean),

  // Wompi. Sin llaves, el sistema sigue cobrando por transferencia manual:
  // es preferible eso a un checkout roto.
  wompi: {
    llave_publica:       process.env.WOMPI_LLAVE_PUBLICA || '',
    llave_privada:       process.env.WOMPI_LLAVE_PRIVADA || '',
    secreto_eventos:     process.env.WOMPI_SECRETO_EVENTOS || '',
    secreto_integridad:  process.env.WOMPI_SECRETO_INTEGRIDAD || '',
  },

  smtp: {
    user: process.env.MK_SMTP_USER || '',
    pass: process.env.MK_SMTP_PASS || '',
    remitente: process.env.MK_SMTP_FROM || 'Creadores.app <no-reply@creadores.app>',
  },
};

// Si falta un secreto esencial, el arranque falla en vez de correr con un
// valor por defecto que permitiría forjar tokens o entrar al panel admin.
const faltantes = [];
if (!config.supabase.url) faltantes.push('SUPABASE_URL');
if (!config.supabase.service_role_key) faltantes.push('SUPABASE_SERVICE_ROLE_KEY');
if (!config.jwt_secret) faltantes.push('MK_JWT_SECRET');
if (!config.admin.password) faltantes.push('MK_ADMIN_PASS');

if (faltantes.length && !process.env.MK_SKIP_CONFIG_CHECK) {
  throw new Error(`Faltan variables de entorno obligatorias: ${faltantes.join(', ')}`);
}

// Llaves de Wompi a medias: peor que no tenerlas, porque el checkout arranca
// y falla al confirmar.
if (config.wompi.llave_publica && !config.wompi.secreto_integridad && !process.env.MK_SKIP_CONFIG_CHECK) {
  console.warn('[config] Falta WOMPI_SECRETO_INTEGRIDAD: el checkout se va a rechazar.');
}
if (config.wompi.llave_publica && !config.wompi.secreto_eventos && !process.env.MK_SKIP_CONFIG_CHECK) {
  console.warn('[config] Falta WOMPI_SECRETO_EVENTOS: no se van a poder confirmar los pagos.');
}

if (!config.codigos_invitacion.length && !process.env.MK_SKIP_CONFIG_CHECK) {
  console.warn('[config] MK_CODIGOS_INVITACION vacío — ninguna marca podrá registrarse.');
}

// Supabase ofrece dos formatos de llave. Las nuevas (sb_secret_...) sirven para
// la base de datos, pero Storage todavía exige la clásica, que es un JWT y
// empieza por "eyJ". Con la nueva, todo funciona hasta que alguien intenta
// subir una foto y recibe un "Invalid Compact JWS" sin contexto.
const llave = String(config.supabase.service_role_key || '');
if (llave && !llave.startsWith('eyJ') && !process.env.MK_SKIP_CONFIG_CHECK) {
  console.warn(
    '[config] SUPABASE_SERVICE_ROLE_KEY no parece un JWT (no empieza por "eyJ").\n' +
    '         La base de datos va a funcionar, pero Storage va a rechazar cada\n' +
    '         subida de archivos. Usa la llave service_role clásica (legacy),\n' +
    '         que está en Supabase → Settings → API Keys.'
  );
}

module.exports = config;
