import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:3000'], // your React app URL
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true, // optional, if you use cookies/auth
  });
  app.useGlobalPipes(
    new ValidationPipe({
       whitelist:true
    })
  );
  await app.listen(process.env.PORT ?? 4040);
}
bootstrap();
