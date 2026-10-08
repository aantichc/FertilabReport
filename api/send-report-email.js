const RESEND_API_URL = "https://api.resend.com/emails";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(iso) {
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

function buildEmailHtml(report) {
  return `
    <div style="font-family: Arial, sans-serif; color: #1f2933; line-height: 1.5;">
      <h1 style="margin: 0 0 16px;">Nuevo parte publicado</h1>
      <p><strong>Título:</strong> ${escapeHtml(report.title)}</p>
      <p><strong>Estado inicial:</strong> ${escapeHtml(report.status)}</p>
      <p><strong>Publicado:</strong> ${escapeHtml(formatDate(report.publishedAt))}</p>
      <div style="margin: 18px 0; padding: 14px; border-left: 4px solid #116466; background: #f6f7f9;">
        ${escapeHtml(report.content).replaceAll("\n", "<br>")}
      </div>
      <p>
        <a href="${escapeHtml(report.link)}" style="color: #116466; font-weight: 700;">
          Abrir parte en la aplicación
        </a>
      </p>
    </div>
  `;
}

export default async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!process.env.RESEND_API_KEY) {
    response.status(500).json({ error: "RESEND_API_KEY is not configured" });
    return;
  }

  try {
    const { report, recipients } = request.body ?? {};
    const recipientEmails = Array.isArray(recipients)
      ? recipients.map((email) => String(email).trim()).filter(Boolean)
      : [];

    if (!report || !recipientEmails.length) {
      response.status(400).json({ error: "Missing report or recipients" });
      return;
    }

    const from = process.env.EMAIL_FROM || "Fertilab Reports <onboarding@resend.dev>";
    const resendResponse = await fetch(RESEND_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipientEmails,
        subject: `Nuevo parte: ${report.title}`,
        html: buildEmailHtml(report),
      }),
    });

    const data = await resendResponse.json();

    if (!resendResponse.ok) {
      response.status(resendResponse.status).json(data);
      return;
    }

    response.status(200).json({ ok: true, id: data.id });
  } catch (error) {
    response.status(500).json({ error: error.message || "Unexpected email error" });
  }
}
