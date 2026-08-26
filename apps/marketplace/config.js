// Configuración de Creators Manager — marketplace de creadoras.
//
// A diferencia de apps/creadoras/, este servicio NO tiene fallback a un JSON local:
// nace directo en producción y todos sus secretos vienen de variables de entorno.
// Comparte la instancia de Supabase con el Programa Creadoras, pero sus secretos
// de sesión y de admin son PROPIOS — un token de un sistema no debe valer en el otro.

const config = {
  puerto: parseInt(process.env.PORT || '3040', 10),
  // De esta URL cuelgan los enlaces de TODOS los correos y el retorno del pago
  // de Wompi. Si cae a localhost en producción, la marca paga y aterriza en la
  // nada, y quien olvide su clave recibe un enlace que no abre en ningún lado.
  // Por eso, si nadie la declara, se usa el dominio que Railway ya publica.
  base_url: process.env.MK_BASE_URL
    || (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null)
    || 'http://localhost:3040',
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

  // Railway bloquea las conexiones SMTP salientes —es su defensa contra el
  // spam— así que desde ahí NINGÚN puerto de correo funciona: da "Connection
  // timeout" sin más explicación. Con esta llave el correo sale por la API web
  // de Brevo, que viaja por el mismo puerto que cualquier página y nunca se
  // bloquea. Si no está, se cae al SMTP de siempre.
  brevo_api_key: process.env.MK_BREVO_API_KEY || '',

  // Proveedor de correo.
  //
  // Se cambia sin tocar código: basta poner la llave del que se quiera usar.
  // Si hay varias, MK_CORREO_PROVEEDOR decide cuál manda; si no, gana el
  // primero que tenga llave en el orden de correo.js.
  //
  // El precio a 10.000 correos al mes cambia mucho entre uno y otro
  // —ZeptoMail cuesta cerca de una décima parte de Brevo— y por eso esto es
  // configuración y no una decisión enterrada en el código.
  correo_proveedor: (process.env.MK_CORREO_PROVEEDOR || '').toLowerCase().trim(),
  zeptomail_api_key: process.env.MK_ZEPTOMAIL_API_KEY || '',
  resend_api_key: process.env.MK_RESEND_API_KEY || '',

  // WhatsApp Cloud API. Sin esto configurado, el panel muestra el envío por
  // WhatsApp como no disponible en vez de fallar al intentarlo.
  whatsapp: {
    phone_number_id: process.env.WA_PHONE_NUMBER_ID || '',
    token:           process.env.WA_TOKEN || '',
    plantilla:       process.env.WA_PLANTILLA || '',
    idioma:          process.env.WA_PLANTILLA_IDIOMA || 'es',
  },

  smtp: {
    // Sin host se usa Gmail. Con host, cualquier proveedor.
    host: process.env.MK_SMTP_HOST || '',
    puerto: parseInt(process.env.MK_SMTP_PORT || '465', 10),
    user: process.env.MK_SMTP_USER || '',
    pass: process.env.MK_SMTP_PASS || '',
    remitente: process.env.MK_SMTP_FROM || 'Creators Manager <no-reply@creatorsmanager.com>',
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

// El registro de marcas es abierto (mk_config.registro_marcas_abierto). Los
// códigos solo hacen falta el día que se cierre, y entonces sí tiene que haber
// alguno cargado o nadie podría entrar.
if (!config.codigos_invitacion.length && !process.env.MK_SKIP_CONFIG_CHECK) {
  console.warn('[config] MK_CODIGOS_INVITACION vacío. No importa mientras el registro esté');
  console.warn('         abierto, pero si lo cierras sin cargar códigos, ninguna marca');
  console.warn('         podrá registrarse.');
}

// Los correos y el retorno del pago cuelgan de base_url: si apunta a localhost
// mientras el servicio está en internet, los dos se rompen en silencio.
if (config.base_url.includes('localhost') && config.entorno === 'production'
    && !process.env.MK_SKIP_CONFIG_CHECK) {
  console.warn('[config] MK_BASE_URL no está definida y no se pudo deducir el dominio.');
  console.warn('         Los enlaces de los correos y el retorno del pago de Wompi van a');
  console.warn('         apuntar a localhost. Declara MK_BASE_URL con el dominio público,');
  console.warn('         sin barra al final.');
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
