import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/enums';

export class UpdateOrderStatusDto {
  @ApiProperty({
    description:
      'Target status. Only specific transitions are allowed: PENDING → CONFIRMED or ' +
      'CANCELLED; CONFIRMED → SHIPPED or CANCELLED; SHIPPED → DELIVERED. DELIVERED and ' +
      'CANCELLED are terminal. Any other transition is rejected with 409. Cancelling a ' +
      'PENDING or CONFIRMED order restocks (IN movement) every item automatically.',
    enum: OrderStatus,
    enumName: 'OrderStatus',
    example: OrderStatus.CONFIRMED,
  })
  @IsEnum(OrderStatus)
  status: OrderStatus;
}
