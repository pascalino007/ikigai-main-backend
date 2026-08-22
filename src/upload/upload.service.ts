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
    const endpointRaw = this.configService.get<string>('B2_ENDPOINT');
    const bucket = this.configService.get<string>('B2_BUCKET');
    const key = this.configService.get<string>('B2_KEY_ID');
    const secret = this.configService.get<string>('B2_APPLICATION_KEY');

    if (!endpointRaw || !bucket || !key || !secret) {
      this.logger.warn('Backblaze B2 not configured. Uploads will fail gracefully.');
      this.isConfigured = false;
      return;
    }

    const endpoint = endpointRaw.startsWith('http')
      ? endpointRaw
      : `https://${endpointRaw}`;

    this.bucket = bucket;
    this.client = new S3Client({
      endpoint,
      region: this.configService.get<string>('B2_REGION') ?? this.regionFromEndpoint(endpoint),
      credentials: {
        accessKeyId: key,
        secretAccessKey: secret,
      },
      forcePathStyle: false,
    });
    this.isConfigured = true;
  }

  /** Backblaze B2 S3-compatible endpoints embed the region: s3.<region>.backblazeb2.com */
  private regionFromEndpoint(endpoint: string): string {
    const match = endpoint.match(/s3\.([^.]+)\.backblazeb2\.com/);
    return match ? match[1] : 'us-east-005';
  }

  /** Public object URL (B2 S3-compatible virtual-hosted style). Requires the bucket to be set to Public. */
  private objectPublicUrl(key: string): string {
    const endpointRaw = this.configService.get<string>('B2_ENDPOINT')!;
    const host = endpointRaw.replace(/^https?:\/\//, '').split('/')[0];
    return `https://${this.bucket}.${host}/${key}`;
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    if (!this.isConfigured || !this.client || !this.bucket) {
      throw new InternalServerErrorException(
        'File upload not configured. Please set B2_ENDPOINT, B2_BUCKET, B2_KEY_ID, and B2_APPLICATION_KEY environment variables.',
      );
    }

    try {
      // Key must start with "ikigai" — the B2 application key is restricted to that name prefix.
      const key = `ikigai/uploads/${Date.now()}-${file.originalname}`;
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      return this.objectPublicUrl(key);
    } catch {
      throw new InternalServerErrorException(
        'Failed to upload file to Backblaze B2',
      );
    }
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
    if (!files || files.length === 0) return [];
    const uploads = files.map((f) => this.uploadFile(f));
    return Promise.all(uploads);
  }
}
