import { IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID } from 'class-validator';
import { MovementType } from '../../generated/prisma/enums';

export class CreateMovementDto {
  @IsUUID()
  productId: string;

  @IsEnum(MovementType)
  type: MovementType;

  @IsInt()
  @IsPositive()
  quantity: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
