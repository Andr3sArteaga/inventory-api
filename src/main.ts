import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import 'dotenv/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Inventory API')
    .setDescription(
      'REST API for managing products, orders, and inventory movements — ' +
        'product catalog with soft-delete and audit history, order lifecycle with ' +
        'atomic stock reservation, and a concurrency-safe stock ledger.',
    )
    .setVersion('1.0')
    .addTag('products')
    .addTag('orders')
    .addTag('inventory')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, swaggerDocument);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  Logger.log(`Swagger docs available at http://localhost:${port}/docs`, 'Bootstrap');
}
bootstrap();
