import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import compression from 'compression';
import { HttpExceptionFilter } from './common/filters';

/** JSON payloads include base64 digital signatures from roadmap forms. */
const REQUEST_BODY_LIMIT = '10mb';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
    cors: false,
    rawBody: true, // for zoom webhook
  });

  app.useBodyParser('json', { limit: REQUEST_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: REQUEST_BODY_LIMIT, extended: true });

  const configService = app.get(ConfigService);
  const nodeEnv = configService.get<string>('nodeEnv', 'development');
  const port = configService.get<number>('port', 3000);
  const googleRedirectUri = configService.get<string>('GOOGLE_REDIRECT_URI', '');
  const googleClientId = configService.get<string>('GOOGLE_CLIENT_ID', '');
  const googleClientSecret = configService.get<string>('GOOGLE_CLIENT_SECRET', '');
  const allowedOrigins = configService.get<string[]>('allowedOrigins', [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173'
  ]);

  // HELMET
  app.use(
    helmet({
      contentSecurityPolicy: nodeEnv === 'production',
      crossOriginEmbedderPolicy: nodeEnv === 'production',
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: nodeEnv === 'production' ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      } : false,
    }),
  );

  // CORS

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin) || nodeEnv === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'x-zm-signature', 'x-zm-request-timestamp'],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 3600, // Cache preflight requests for 1 hour
  });

  // COMPRESSION
  app.use(
    compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      level: 6,
      threshold: 2044,
    }),
  );

  // GLOBAL PIPES: Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: nodeEnv === 'production',
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // FILTERS
  app.useGlobalFilters(new HttpExceptionFilter(configService));

  //API PREFIX/VERSIONING
  app.setGlobalPrefix('api/v1', {
    exclude: ['/', '/health', '/metrics'],
  });

  // GRACEFUL SHUTDOWN
  app.enableShutdownHooks();

  process.on('SIGTERM', async () => {
    logger.warn('SIGTERM signal received: closing HTTP server');
    await app.close();
    logger.log('HTTP server closed');
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.warn('SIGINT signal received: closing HTTP server');
    await app.close();
    logger.log('HTTP server closed');
    process.exit(0);
  });

  await app.listen(port);

  logger.log(`=================================================`);
  logger.log(`Application started successfully`);
  logger.log(`=================================================`);
  logger.log(`Environment: ${nodeEnv}`);
  logger.log(`Server running on: http://localhost:${port}`);
  logger.log(`API Base URL: http://localhost:${port}/api/v1`);
  logger.log(`Health Check: http://localhost:${port}/health`);
  logger.log(
    `Google OAuth env: redirect_uri=${googleRedirectUri || '<missing>'}, client_id_present=${Boolean(
      googleClientId?.trim(),
    )}, client_secret_present=${Boolean(googleClientSecret?.trim())}`,
  );
  logger.log(`=================================================`);
}

bootstrap().catch((error) => {
  const logger = new Logger('Bootstrap');
  logger.error('Failed to start application', error);
  process.exit(1);
});