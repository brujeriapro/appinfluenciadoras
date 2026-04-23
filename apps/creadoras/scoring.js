// Puerto JS de scoring.py — misma fórmula exacta

const PESOS = { reach: 40, engagement: 25, guardados: 20, equipo: 15 };

const MULT = { tiktok: 1.2, reel: 1.0, video: 1.0, post: 0.8, story: 0.7 };

function calcularScore({ vistas, likes, guardados, seguidores, plataforma, tipo_contenido, calificacion_equipo }) {
  const reach = seguidores > 0 ? Math.min((vistas / seguidores) * 100, 100) : 0;
  const engagement = vistas > 0 ? Math.min((likes / vistas) / 0.05 * 100, 100) : 0;

  const componentes = [
    [reach, PESOS.reach],
    [engagement, PESOS.engagement],
  ];

  if (guardados != null) {
    const saveScore = vistas > 0 ? Math.min((guardados / vistas) / 0.02 * 100, 100) : 0;
    componentes.push([saveScore, PESOS.guardados]);
  }

  if (calificacion_equipo != null) {
    const equipoScore = Math.max(0, Math.min((calificacion_equipo - 1) / 4 * 100, 100));
    componentes.push([equipoScore, PESOS.equipo]);
  }

  const totalPeso = componentes.reduce((s, [, w]) => s + w, 0);
  const scoreBase = totalPeso > 0
    ? componentes.reduce((s, [v, w]) => s + v * w, 0) / totalPeso
    : 0;

  const multPlat = plataforma?.toLowerCase() === 'tiktok' ? MULT.tiktok : 1.0;
  const multTipo = MULT[tipo_contenido?.toLowerCase()] || 1.0;

  return Math.round(Math.min(scoreBase * multPlat * multTipo, 100) * 100) / 100;
}

function calcularNivel(scoreAcumulado) {
  const s = scoreAcumulado || 0;
  if (s >= 201) return 'Gran Bruja';
  if (s >= 101) return 'Bruja Experta';
  if (s >= 51)  return 'Bruja Practicante';
  if (s >= 21)  return 'Bruja Aprendiz';
  return 'Bruja Semilla';
}

function calcularTier(seguidores) {
  const s = seguidores || 0;
  if (s >= 100000) return { tier: 'Macro', kit: 'Kit Premium' };
  if (s >= 10000)  return { tier: 'Micro', kit: 'Kit Estándar' };
  return { tier: 'Nano', kit: 'Kit Básico' };
}

module.exports = { calcularScore, calcularNivel, calcularTier };
