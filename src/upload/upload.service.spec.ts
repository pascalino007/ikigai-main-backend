import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              ({
                B2_ENDPOINT: 's3.us-east-005.backblazeb2.com',
                B2_BUCKET: 'test-bucket',
                B2_KEY_ID: 'test-key',
                B2_APPLICATION_KEY: 'test-secret',
                B2_REGION: 'us-east-005',
              })[key],
          },
        },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
