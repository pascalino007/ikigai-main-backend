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
                SPACES_ENDPOINT: 'ams3.digitaloceanspaces.com',
                SPACES_BUCKET: 'test-bucket',
                SPACES_KEY: 'test-key',
                SPACES_SECRET: 'test-secret',
                SPACES_REGION: 'ams3',
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
