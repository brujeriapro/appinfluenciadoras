// Qué le falta a un perfil para salir primero en el catálogo.
//
// Es el guion del correo que le dice a cada creadora cómo mejorar su posición.
// Vive aparte y como función pura por dos razones: se puede probar sin base de
// datos, y sobre todo, obliga a que lo que el correo promete y lo que el
// catálogo hace de verdad estén escritos cerca.
//
// ⚠️ El orden real lo decide `queTanCompleto()` en catalogo.js. Si cambian esos
// pesos, hay que cambiar este guion: un correo que le pida a alguien algo que
// ya no sube su posición es peor que no mandarlo, porque la próxima vez no lo
// abre.
//
// Los consejos van ordenados por cuánto pesan de verdad, no por lo fácil que
// sea hacerlos. Tener trabajo publicado vale más que todo lo demás junto.

/**
 * Devuelve solo lo que a ESTA creadora le falta, en orden de impacto.
 *
 * Recibe el perfil y cuántas piezas tiene. Nunca sugiere algo ya hecho:
 * pedirle una foto a quien ya la subió convierte el correo en ruido.
 */
function queLeFalta(creadoraCruda, piezasCrudas) {
  // El valor por defecto de un parámetro no cubre `null`, solo `undefined`, y
  // una consulta que no encuentra fila devuelve null. Reventar aquí tumbaría la
  // tanda entera por un perfil suelto.
  const creadora = creadoraCruda || {};
  const piezas = Number(piezasCrudas) || 0;
  const falta = [];

  if (piezas === 0) {
    falta.push({
      clave: 'piezas',
      titulo: 'Sube tu trabajo — esto es lo que más pesa',
      texto: 'Un perfil sin piezas queda de último, por completo que esté lo demás. '
           + 'La marca contrata por lo que ve, no por lo que dice el perfil. '
           + 'Con tres o cuatro videos tuyos ya cambia tu posición.',
    });
  } else if (piezas < 4) {
    falta.push({
      clave: 'piezas',
      titulo: `Te faltan ${4 - piezas} piezas para llenar tu fila`,
      texto: 'El catálogo muestra cuatro por creadora. Con menos quedan espacios '
           + 'vacíos al lado de tu nombre, y sales por debajo de quien las tiene completas.',
    });
  }

  if (!creadora.foto_perfil_path) {
    falta.push({
      clave: 'foto',
      titulo: 'Pon tu foto',
      texto: 'Es lo primero que ve una marca. Si prefieres no mostrar la cara, sirve '
           + 'una foto de tu contenido o de tu trabajo — pero un espacio en gris no.',
    });
  }

  if (!creadora.tarifa_min && !creadora.tarifa_abierta) {
    falta.push({
      clave: 'tarifa',
      titulo: 'Pon tus precios, o déjalos abiertos',
      texto: 'Sin precio no apareces cuando una marca filtra por presupuesto, que es '
           + 'como busca casi siempre. Si no sabes cuánto cobrar, marca '
           + '<strong>"abierta a negociación"</strong>: eso también cuenta y te deja visible.',
    });
  }

  if (!creadora.bio_corta) {
    falta.push({
      clave: 'bio',
      titulo: 'Escribe una línea sobre lo que haces',
      texto: 'Una frase. Qué grabas y para quién. Es lo que separa dos perfiles con '
           + 'números parecidos.',
    });
  }

  if (creadora.metricas_estado !== 'verificado' && creadora.metricas_estado !== 'conectado') {
    falta.push({
      clave: 'metricas',
      titulo: 'Verifica tus números',
      texto: 'Sube una captura de tus estadísticas y tu perfil muestra el distintivo de '
           + '<strong>métricas verificadas</strong>. Una marca que va a pagar confía más '
           + 'en un número comprobado que en uno escrito a mano.',
    });
  }

  return falta;
}

module.exports = { queLeFalta };
