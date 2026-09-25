import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { MovementType } from '../../generated/prisma/enums';

export class CreateMovementDto {
  @ApiProperty({
    description: 'The product this movement applies to. Must be an active product (available: true).',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  @IsUUID()
  productId: string;

  @ApiProperty({
    description: 'IN adds to stock (e.g. restock), OUT subtracts (e.g. manual write-off).',
    enum: MovementType,
    enumName: 'MovementType',
    example: MovementType.IN,
  })
  @IsEnum(MovementType)
  type: MovementType;

  @ApiProperty({
    description:
      'Quantity to move. Must be a positive integer. For OUT, rejected with 422 if it ' +
      'would leave stock negative.',
    example: 20,
  })
  @IsInt()
  @IsPositive()
  quantity: number;

  @ApiPropertyOptional({
    description: 'Free-text reason for this manual movement (e.g. "Restock from supplier").',
    example: 'Restock from supplier delivery #4521',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  // Note: this DTO intentionally has NO orderId field. Combined with the global
  // ValidationPipe's forbidNonWhitelisted, sending orderId here is rejected with 400 —
  // manual movements through this endpoint are never associated with an order; only
  // orders.service assigns orderId internally when it reserves/restores stock.
}
