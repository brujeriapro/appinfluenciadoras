const nodemailer = require('nodemailer');
const config = require('./config');

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  if (!config.gmail.user || !config.gmail.pass) return null;
  _transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: config.gmail.user, pass: config.gmail.pass },
  });
  return _transporter;
}

async function enviarRecordatorioContenido(influencer) {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn('Email no configurado — omitiendo recordatorio para', influencer.email);
    return { skipped: true };
  }

  const diasDesdeEnvio = Math.floor(
    (Date.now() - new Date(influencer.fecha_envio).getTime()) / (1000 * 60 * 60 * 24)
  );

  await transporter.sendMail({
    from: `"Brujería Capilar" <${config.gmail.user}>`,
    to: influencer.email,
    subject: '¡Tu kit llegó! Ya puedes subir tu contenido ✨',
    html: `
      <div style="font-family:sans-serif;max-width:500px;margin:auto;color:#1a1a1a">
        <h2 style="color:#7C3AED">Hola ${influencer.nombre?.split(' ')[0]} 💜</h2>
        <p>Hace <strong>${diasDesdeEnvio} días</strong> te enviamos tu kit de Brujería Capilar y aún no hemos visto tu contenido.</p>
        <p>Recuerda que el programa tiene un plazo de <strong>30 días</strong> para publicar y reportar tu reseña. ¡Queda poco tiempo!</p>
        <p>Cuando publiques, entra a tu portal y usa el botón "Subir Contenido":</p>
        <p style="text-align:center;margin:24px 0">
          <a href="${config.tally_contenido_url}"
             style="background:#7C3AED;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold">
            Subir mi contenido →
          </a>
        </p>
        <p style="color:#666;font-size:13px">
          ¿Tienes dudas? Escríbenos por Instagram
          <a href="https://instagram.com/brujeriacapilar">@brujeriacapilar</a>
        </p>
        <p style="color:#666;font-size:13px">Con amor,<br>Equipo Brujería Capilar 🔮</p>
      </div>
    `,
  });

  return { sent: true, to: influencer.email };
}

module.exports = { enviarRecordatorioContenido };
