import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({
    description: 'Current page number, 1-indexed.',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items requested per page (max 100).',
    example: 10,
  })
  pageSize: number;

  @ApiProperty({
    description: 'Total number of items matching the query, across all pages.',
    example: 42,
  })
  total: number;

  @ApiProperty({
    description: 'Total number of pages available for this query, given pageSize.',
    example: 5,
  })
  totalPages: number;
}
