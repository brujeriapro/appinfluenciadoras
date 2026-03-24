// En producción (Railway) lee variables de entorno.
// En desarrollo local lee el JSON de credenciales.
let config;

if (process.env.SUPABASE_URL) {
  config = {
    supabase: {
      url: process.env.SUPABASE_URL,
      service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    shopify: {
      store: process.env.SHOPIFY_STORE,
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    },
    siigo: {
      username: process.env.SIIGO_USERNAME,
      access_key: process.env.SIIGO_ACCESS_KEY,
    },
    productos_disponibles: JSON.parse(process.env.PRODUCTOS_DISPONIBLES || '{}'),
    kits: JSON.parse(process.env.KITS_CONFIG || '{}'),
  };
} else {
  config = require('../../scripts/influencers/config_influencers.json');
}

module.exports = config;
