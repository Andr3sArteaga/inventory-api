import { ApiProperty } from '@nestjs/swagger';
import { PaginationMetaDto } from '../../common/dto/pagination-meta.dto';
import { MovementResponseDto } from './movement-response.dto';

export class PaginatedMovementsResponseDto {
  @ApiProperty({ type: [MovementResponseDto] })
  data: MovementResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
