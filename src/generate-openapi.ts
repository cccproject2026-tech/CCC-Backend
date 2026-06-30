import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from './app.module';
import { buildSwaggerDocument } from './swagger/swagger.config';

async function generateOpenApiSpec(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: false,
  });

  app.setGlobalPrefix('api/v1', {
    exclude: ['/', '/health', '/metrics', '/api-docs', '/openapi.json'],
  });

  const document = buildSwaggerDocument(app);
  const outputPath = join(process.cwd(), 'openapi.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2), 'utf-8');

  await app.close();
  // eslint-disable-next-line no-console
  console.log(`OpenAPI spec written to ${outputPath}`);
}

generateOpenApiSpec().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to generate OpenAPI spec', error);
  process.exit(1);
});
