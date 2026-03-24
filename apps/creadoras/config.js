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
      shop_name: process.env.SHOPIFY_SHOP_NAME,
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    },
    siigo: {
      username: process.env.SIIGO_USERNAME,
      access_key: process.env.SIIGO_ACCESS_KEY,
    },
    productos_disponibles: {
      "Termoprotector Capilar":           "BRTP0001",
      "Mascarilla Hechizo Total":         "BRMA0001",
      "Crema Para Rizos 3en1":            "BRPROTR01",
      "Shampoo Ultra":                    "BRSHN001",
      "Varita Mágica":                    "BRVA0001",
      "Mantequilla Corporal Vainilla":    "BRCR0001",
      "Mantequilla Corporal Strawberry":  "BRCR0002",
      "Mantequilla Corporal Watermelon":  "BRCR0003",
    },
    kits: {
      "Kit Básico":   { "productos": 1, "note": "Nano — influencer elige 1 producto" },
      "Kit Estándar": { "productos": 2, "note": "Micro — influencer elige 2 productos" },
      "Kit Premium":  { "productos": 3, "note": "Macro — influencer elige 3 o más productos" },
    },
  };
} else {
  config = require('../../scripts/influencers/config_influencers.json');
}

module.exports = config;
