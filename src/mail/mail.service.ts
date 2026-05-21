import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    const user = process.env.MAIL_USER || 'myikigai2025@gmail.com';
    const pass = process.env.MAIL_PASS || 'zmsvmyxidjfodosx';

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    });

    this.transporter.verify().then(() => {
      this.logger.log('SMTP connection verified successfully');
    }).catch((err) => {
      this.logger.error(`SMTP verify failed: ${err.code} ${err.command} ${err.response}`);
    });
  }

  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    try {
      const info = await this.transporter.sendMail({
        from: '"Ikigai" <myikigai2025@gmail.com>',
        to: options.to,
        subject: options.subject,
        html: options.html,
      });
      this.logger.log(`Email sent: ${info.messageId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}: ${error.message}`);
      return false;
    }
  }
}
