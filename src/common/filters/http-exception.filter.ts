import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger, } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';

interface ErrorResponseBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const body = this.buildBody(exception, request.url);
    response.status(body.statusCode).json(body);
  }

  private buildBody(exception: unknown, path: string): ErrorResponseBody {
    const timestamp = new Date().toISOString();

    if (exception instanceof HttpException) {
      return this.fromHttpException(exception, timestamp, path);
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.fromUnhandledPrismaError(exception, timestamp, path);
    }

    return this.fromUnknownError(exception, timestamp, path);
  }

  // decision: HttpException.getResponse() isn't a fixed shape — a plain
  // `new ConflictException('msg')` normalizes to { statusCode, message, error }, but
  // Nest's own ValidationPipe throws a BadRequestException whose response.message is an
  // ARRAY of per-field messages. We can't just spread the payload back as-is (its shape
  // varies per exception type and callers of this API shouldn't have to handle two
  // different response shapes for the same statusCode), so we pull `message`/`error` out
  // when the payload is an object and pass the array through untouched, always re-emitting
  // the same 5-key body regardless of which HttpException subclass produced it.
  private fromHttpException(
    exception: HttpException,
    timestamp: string,
    path: string,
  ): ErrorResponseBody {
    const status = exception.getStatus();
    const payload = exception.getResponse();
    const isObjectPayload = typeof payload === 'object' && payload !== null;

    const message = isObjectPayload
      ? ((payload as Record<string, unknown>).message as string | string[] | undefined) ??
        exception.message
      : (payload as string);

    const error = isObjectPayload
      ? ((payload as Record<string, unknown>).error as string | undefined)
      : undefined;

    return {
      statusCode: status,
      message,
      error: error ?? exception.name,
      timestamp,
      path,
    };
  }

  // decision: this catches a Prisma error that no service's own try/catch recognized —
  // by definition one we didn't anticipate (e.g. a foreign key violation from a
  // constraint added later that nobody wrapped in a business exception yet). We never
  // forward exception.meta or exception.message here: those carry raw column/constraint/
  // table names straight from the Postgres driver, which is exactly the kind of internal
  // detail the brief says not to leak. 409 + a generic integrity message is an honest
  // enough signal to the client ("your request conflicts with stored data") without
  // exposing schema internals; the real detail still goes to the server log below.
  private fromUnhandledPrismaError(
    exception: Prisma.PrismaClientKnownRequestError,
    timestamp: string,
    path: string,
  ): ErrorResponseBody {
    this.logger.error(
      `Unhandled Prisma error [${exception.code}] at ${path}: ${exception.message}`,
      exception.stack,
    );

    return {
      statusCode: HttpStatus.CONFLICT,
      message: 'La operación viola una restricción de integridad de datos',
      error: 'Conflict',
      timestamp,
      path,
    };
  }

  private fromUnknownError(
    exception: unknown,
    timestamp: string,
    path: string,
  ): ErrorResponseBody {
    const error = exception instanceof Error ? exception : new Error(String(exception));
    this.logger.error(`Unhandled error at ${path}: ${error.message}`, error.stack);

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Ha ocurrido un error interno',
      error: 'Internal Server Error',
      timestamp,
      path,
    };
  }
}
