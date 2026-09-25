import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CreateMovementDto } from './dto/create-movement.dto';
import { FindMovementsQueryDto } from './dto/find-movements-query.dto';
import { InventoryService } from './inventory.service';

@Controller('inventory/movements')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  create(@Body() dto: CreateMovementDto) {
    return this.inventoryService.create(dto);
  }

  @Get()
  findAll(@Query() query: FindMovementsQueryDto) {
    return this.inventoryService.findAll(query);
  }
}
