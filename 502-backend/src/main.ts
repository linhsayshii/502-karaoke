import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { configureApp } from './app.setup';
import { corsOrigins, swaggerEnabled } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  // Only the listed origins may call the API with the refresh cookie (see corsOrigins).
  app.enableCors({ origin: corsOrigins(), credentials: true });

  if (swaggerEnabled()) setupSwagger(app);

  await app.listen(process.env.PORT ?? 4000, '0.0.0.0');
}

function setupSwagger(app: NestExpressApplication) {
  const config = new DocumentBuilder()
    .setTitle('Karaoke 502 API')
    .setDescription('The Karaoke management API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);

  // Swagger will be available at /api/docs
  SwaggerModule.setup('api/docs', app, document);
}
void bootstrap();
