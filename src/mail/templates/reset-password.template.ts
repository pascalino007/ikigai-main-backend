export function resetPasswordTemplate(otp: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Réinitialisation de mot de passe</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:40px 0;">
    <tr>
      <td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#002D39;padding:36px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.5px;">Ikigai</h1>
              <p style="margin:8px 0 0;color:#00D9A3;font-size:13px;font-weight:500;letter-spacing:1px;text-transform:uppercase;">Réinitialisation de mot de passe</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.6;">
                Bonjour,
              </p>
              <p style="margin:0 0 24px;color:#555555;font-size:14px;line-height:1.7;">
                Vous avez demandé la réinitialisation de votre mot de passe. Utilisez le code ci-dessous pour continuer :
              </p>

              <!-- OTP Box -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:24px 0;">
                    <div style="display:inline-block;background-color:#f0faf6;border:2px dashed #00D9A3;border-radius:12px;padding:20px 40px;">
                      <span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;color:#002D39;letter-spacing:6px;">${otp}</span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 8px;color:#555555;font-size:14px;line-height:1.7;">
                Ce code est valable <strong style="color:#002D39;">10 minutes</strong>.
              </p>
              <p style="margin:0 0 24px;color:#888888;font-size:13px;line-height:1.6;">
                Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email.
              </p>

              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-top:1px solid #eeeeee;padding-top:24px;">
                    <p style="margin:0;color:#aaaaaa;font-size:12px;text-align:center;">
                      &copy; ${new Date().getFullYear()} Ikigai. Tous droits réservés.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
