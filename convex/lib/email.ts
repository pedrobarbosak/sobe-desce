/** Sends the magic link via Resend. Falls back to logging when no key is configured (dev). */
export async function sendMagicLinkEmail(email: string, url: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[magic-link] no RESEND_API_KEY set; link for ${email}: ${url}`);
    return;
  }
  const from = process.env.EMAIL_FROM ?? "Sobe e Desce <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Entrar no Sobe e Desce",
      html: `<p>Olá!</p><p>Clica para entrar: <a href="${url}">${url}</a></p><p>Se não pediste este email, ignora-o.</p>`,
      text: `Entrar no Sobe e Desce: ${url}`,
    }),
  });
  if (!res.ok) throw new Error(`Resend failed: ${res.status} ${await res.text()}`);
}
