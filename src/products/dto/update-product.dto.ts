import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

// decision: PartialType comes from @nestjs/swagger, not @nestjs/mapped-types, even
// though both make every field optional the same way for class-validator. The swagger
// variant additionally copies each field's @ApiProperty metadata over and re-declares it
// as @ApiPropertyOptional, so the generated PATCH /products/:id schema shows the same
// descriptions/examples as POST /products instead of an empty `{}` schema.
export class UpdateProductDto extends PartialType(CreateProductDto) {}
