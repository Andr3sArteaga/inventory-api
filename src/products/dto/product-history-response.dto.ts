import { ApiProperty } from '@nestjs/swagger';
import { ActionType } from '../../generated/prisma/enums';

export class ProductHistoryResponseDto {
  @ApiProperty({
    description: 'Unique identifier of this history entry.',
    example: 'b1e2c3d4-5678-90ab-cdef-1234567890ab',
  })
  id: string;

  @ApiProperty({
    description: 'The product this history entry belongs to.',
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  })
  productId: string;

  @ApiProperty({
    description: 'The kind of change this entry records.',
    enum: ActionType,
    enumName: 'ActionType',
    example: ActionType.UPDATE,
  })
  action: ActionType;

  @ApiProperty({
    description:
      'For CREATE/DELETE: a snapshot of the business fields at that moment. ' +
      'For UPDATE: only the fields that actually changed, as { field: { from, to } }.',
    example: { price: { from: '199.99', to: '249.99' } },
  })
  changes: unknown;

  @ApiProperty({
    description: 'When this history entry was recorded.',
    example: '2026-02-01T08:15:00.000Z',
  })
  createdAt: Date;
}
