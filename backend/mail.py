"""Email sending via SMTP (user-supplied credentials)."""
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


DEFAULT_INVITE_SUBJECT = "You've been invited by {org_name} to verify your technical skills"

DEFAULT_INVITE_HTML = """\
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Helvetica Neue', Arial, sans-serif; background: #0a0f1e; color: #e2e8f0; margin: 0; padding: 40px 20px; }
    .card { max-width: 560px; margin: 0 auto; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 40px; }
    h1 { color: #60a5fa; font-size: 24px; margin-bottom: 8px; }
    p { color: #94a3b8; line-height: 1.6; }
    .btn { display: inline-block; margin-top: 28px; padding: 14px 32px; background: #2563eb; color: #fff; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; }
    .footer { margin-top: 32px; font-size: 12px; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <h1>◈ Veridicus</h1>
    <h2 style="color:#e2e8f0; font-size:20px; margin-bottom:16px;">You've been invited to verify your skills</h2>
    <p><strong style="color:#e2e8f0;">{org_name}</strong> has invited you to complete a technical skills assessment via Veridicus — an AI-powered verification system that validates your expertise through adaptive interrogation.</p>
    <p>The assessment typically takes 15–25 minutes and covers your claimed technical skills.</p>
    <a href="{invite_url}" class="btn">Start Your Assessment →</a>
    <div class="footer">
      <p>This link expires in 7 days. If you did not expect this invitation, you can safely ignore this email.</p>
      <p>Powered by <a href="https://veridicus.ai" style="color:#60a5fa;">Veridicus</a></p>
    </div>
  </div>
</body>
</html>
"""


def send_invite_email(
    to: str,
    org_name: str,
    token: str,
    base_url: str,
    smtp_user: str,
    smtp_password: str,
    smtp_host: str = "smtp.gmail.com",
    smtp_port: int = 587,
    html_template: str | None = None,
    subject_template: str | None = None,
) -> None:
    """Send an invitation email via SMTP using the caller's credentials.

    ``html_template`` and ``subject_template`` may contain ``{org_name}`` and
    ``{invite_url}`` placeholders which are substituted before sending.
    If omitted, the built-in defaults are used.

    Uses STARTTLS on port 587 by default (Gmail App Password compatible).
    Raises on failure — callers should handle exceptions gracefully.
    """
    invite_url = f"{base_url}/invite/{token}"

    html_src = html_template or DEFAULT_INVITE_HTML
    subj_src = subject_template or DEFAULT_INVITE_SUBJECT

    html_body = html_src.replace("{org_name}", org_name).replace("{invite_url}", invite_url)
    subject = subj_src.replace("{org_name}", org_name).replace("{invite_url}", invite_url)

    plain = (
        f"You've been invited by {org_name} to complete a technical skills assessment.\n\n"
        f"Start your assessment here:\n{invite_url}\n\n"
        "This link expires in 7 days."
    )

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
        server.ehlo()
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, to, msg.as_string())
