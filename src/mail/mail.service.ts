import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: 'mail.privateemail.com',
      port: 465,
      secure: true,
      auth: {
        user: 'noreply@ikilist.com',
        pass: 'noreply@ikilist.com',
      },
    });
  }

  async sendMail(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<boolean> {
    try {
      const info = await this.transporter.sendMail({
        from: '"Ikigai" <noreply@ikilist.com>',
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
