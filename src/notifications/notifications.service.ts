import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private firebaseApp: admin.app.App | null = null;

  constructor(private readonly config: ConfigService) {
    const projectId = this.config.get<string>('FIREBASE_PROJECT_ID');
    const clientEmail = this.config.get<string>('FIREBASE_CLIENT_EMAIL');
    const privateKey = this.config.get<string>('FIREBASE_PRIVATE_KEY')?.replace(/\\n/g, '\n');

    if (projectId && clientEmail && privateKey) {
      this.firebaseApp = admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
      this.logger.log('Firebase Admin initialized');
    } else {
      this.logger.warn(
        'Firebase Admin not initialized: missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY',
      );
    }
  }

  async sendPushNotification({
    token,
    title,
    body,
    data = {},
  }: {
    token: string;
    title: string;
    body: string;
    data?: Record<string, string>;
  }): Promise<void> {
    if (!this.firebaseApp) {
      this.logger.warn('Firebase not initialized; skipping push notification');
      return;
    }

    try {
      await admin.messaging(this.firebaseApp).send({
        token,
        notification: { title, body },
        data,
        android: {
          notification: {
            channelId: 'fcm_default_channel',
            priority: 'high',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      });
      this.logger.log(`Push notification sent to token`);
    } catch (error: any) {
      this.logger.error(`Failed to send push notification: ${error.message}`);
    }
  }
}
