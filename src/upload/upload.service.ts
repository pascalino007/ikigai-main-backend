import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class UploadService {
  private readonly client: S3Client | null = null;
  private readonly bucket: string | null = null;
  private readonly logger = new Logger(UploadService.name);
  private readonly isConfigured: boolean;

  constructor(private readonly configService: ConfigService) {
    const endpointRaw = this.configService.get<string>('SPACES_ENDPOINT');
    const bucket = this.configService.get<string>('SPACES_BUCKET');
    const key = this.configService.get<string>('SPACES_KEY');
    const secret = this.configService.get<string>('SPACES_SECRET');

    if (!endpointRaw || !bucket || !key || !secret) {
      this.logger.warn('DigitalOcean Spaces not configured. Uploads will fail gracefully.');
      this.isConfigured = false;
      return;
    }

    const endpoint = endpointRaw.startsWith('http')
      ? endpointRaw
      : `https://${endpointRaw}`;

    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region: this.configService.get<string>('SPACES_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: key,
        secretAccessKey: secret,
      },
      forcePathStyle: false,
    });
    this.isConfigured = true;
  }

  /** Public object URL (DigitalOcean Spaces virtual-hosted style). */
  private objectPublicUrl(key: string): string {
    const endpointRaw = this.configService.get<string>('SPACES_ENDPOINT')!;
    const host = endpointRaw.replace(/^https?:\/\//, '').split('/')[0];
    return `https://${this.bucket}.${host}/${key}`;
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    if (!this.isConfigured || !this.client || !this.bucket) {
      throw new InternalServerErrorException(
        'File upload not configured. Please set SPACES_ENDPOINT, SPACES_BUCKET, SPACES_KEY, and SPACES_SECRET environment variables.',
      );
    }

    try {
      const key = `uploads/${Date.now()}-${file.originalname}`;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ACL: 'public-read',
          ContentType: file.mimetype,
        }),
      );
      return this.objectPublicUrl(key);
    } catch {
      throw new InternalServerErrorException(
        'Failed to upload file to DigitalOcean Spaces',
      );
    }
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
    if (!files || files.length === 0) return [];
    const uploads = files.map((f) => this.uploadFile(f));
    return Promise.all(uploads);
  }
}
