// Lee credenciales desde variables de entorno (producción Railway)
// o desde el JSON local (desarrollo).
console.log('[config] SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'NOT SET');
console.log('[config] SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
const PRODUCTOS = {
  "Termoprotector Capilar":           "BRTP0001",
  "Mascarilla Hechizo Total":         "BRMA0001",
  "Crema Para Rizos 3en1":            "BRPROTR01",
  "Shampoo Ultra":                    "BRSHN001",
  "Varita Mágica":                    "BRVA0001",
  "Mantequilla Corporal Vainilla":    "BRCR0001",
  "Mantequilla Corporal Strawberry":  "BRCR0002",
  "Mantequilla Corporal Watermelon":  "BRCR0003",
};

const KITS = {
  "Kit Básico":   { "productos": 1, "note": "Nano — influencer elige 1 producto" },
  "Kit Estándar": { "productos": 2, "note": "Micro — influencer elige 2 productos" },
  "Kit Premium":  { "productos": 3, "note": "Macro — influencer elige 3 o más productos" },
};

// Intenta cargar el JSON local (solo existe en desarrollo)
let localConfig = null;
try {
  localConfig = require('../../scripts/influencers/config_influencers.json');
} catch (e) {
  // No existe en producción — se usan env vars
}

const config = {
  supabase: {
    url: process.env.SUPABASE_URL || localConfig?.supabase?.url,
    service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY || localConfig?.supabase?.service_role_key,
  },
  shopify: {
    shop_name: process.env.SHOPIFY_SHOP_NAME || localConfig?.shopify?.shop_name,
    client_id: process.env.SHOPIFY_CLIENT_ID || localConfig?.shopify?.client_id,
    client_secret: process.env.SHOPIFY_CLIENT_SECRET || localConfig?.shopify?.client_secret,
  },
  siigo: {
    username: process.env.SIIGO_USERNAME || localConfig?.siigo?.username,
    access_key: process.env.SIIGO_ACCESS_KEY || localConfig?.siigo?.access_key,
  },
  productos_disponibles: PRODUCTOS,
  kits: KITS,
};

// Validar que las credenciales esenciales están presentes
if (!config.supabase.url || !config.supabase.service_role_key) {
  throw new Error('Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son requeridas');
}

module.exports = config;
