import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

@Injectable()
export class UploadService {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    const endpointRaw = this.configService.get<string>('SPACES_ENDPOINT')!;
    const endpoint = endpointRaw.startsWith('http')
      ? endpointRaw
      : `https://${endpointRaw}`;

    this.bucket = this.configService.get<string>('SPACES_BUCKET')!;
    this.client = new S3Client({
      endpoint,
      region: this.configService.get<string>('SPACES_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: this.configService.get<string>('SPACES_KEY')!,
        secretAccessKey: this.configService.get<string>('SPACES_SECRET')!,
      },
      forcePathStyle: false,
    });
  }

  /** Public object URL (DigitalOcean Spaces virtual-hosted style). */
  private objectPublicUrl(key: string): string {
    const endpointRaw = this.configService.get<string>('SPACES_ENDPOINT')!;
    const host = endpointRaw.replace(/^https?:\/\//, '').split('/')[0];
    return `https://${this.bucket}.${host}/${key}`;
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
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
