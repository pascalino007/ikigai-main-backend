/**
 * Generic one-time-password email used for sign-up and login verification.
 */
export function otpEmailTemplate(otp: string, purpose = 'vérification'): string {
  return `
  <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #1f2933;">
    <h2 style="color: #002D39; margin-bottom: 8px;">Ikigai</h2>
    <p style="font-size: 15px;">Voici votre code de ${purpose} :</p>
    <div style="font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #002D39; background: #f3f4f6; border-radius: 10px; text-align: center; padding: 16px 0; margin: 16px 0;">
      ${otp}
    </div>
    <p style="font-size: 13px; color: #6b7280;">Ce code expire dans 10 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
  </div>`;
}
