import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as AWS from 'aws-sdk';

@Injectable()
export class UploadService {
  private s3: AWS.S3;

  constructor(private configService: ConfigService) {
    const spacesEndpoint = new AWS.Endpoint(
      this.configService.get('SPACES_ENDPOINT')!
    );
    this.s3 = new AWS.S3({
      endpoint: spacesEndpoint,
      accessKeyId: this.configService.get('SPACES_KEY'),
      secretAccessKey: this.configService.get('SPACES_SECRET'),
      region: this.configService.get('SPACES_REGION'),
    });
  }

  async uploadFile(file: Express.Multer.File): Promise<string> {
    try {
      const params: AWS.S3.PutObjectRequest = {
        Bucket: this.configService.get('SPACES_BUCKET')!,
        Key: `uploads/${Date.now()}-${file.originalname}`,
        Body: file.buffer,
        ACL: 'public-read',
        ContentType: file.mimetype,
      };

      const result = await this.s3.upload(params).promise();
      return result.Location;
    } catch (error) {
      throw new InternalServerErrorException('Failed to upload file to DigitalOcean Spaces');
    }
  }

  async uploadFiles(files: Express.Multer.File[]): Promise<string[]> {
    if (!files || files.length === 0) return [];
    const uploads = files.map((f) => this.uploadFile(f));
    return Promise.all(uploads);
  }
}

