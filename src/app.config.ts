import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

// decision: pulled out of main.ts so the e2e test bootstrap can call the exact same
// function instead of re-declaring the same ValidationPipe/filter options a second
// time. Two copies of "whitelist: true, forbidNonWhitelisted: true, transform: true"
// are exactly the kind of thing that quietly drifts apart after one gets edited and the
// other doesn't — tests would keep passing against config the real app no longer runs.
export function configureApp<T extends INestApplication>(app: T): T {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  return app;
}
