import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { Prisma, Product } from '../generated/prisma/client';
import { ActionType } from '../generated/prisma/enums';
import { CreateProductDto } from './dto/create-product.dto';
import { FindProductsQueryDto } from './dto/find-products-query.dto';
import { ProductResponseDto } from './dto/product-response.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

function buildCreateSnapshot(product: Product): Prisma.InputJsonValue {
  return {
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price.toString(),
  };
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto): Promise<ProductResponseDto> {
    const existingActive = await this.prisma.product.findFirst({
      where: { name: dto.name, available: true },
    });
    if (existingActive) {
      throw new ConflictException(
        `A product named "${dto.name}" is already active`,
      );
    }

    try {
      const product = await this.prisma.$transaction(async (tx) => {
        const created = await tx.product.create({ data: dto });
        await tx.productHistory.create({
          data: {
            productId: created.id,
            action: ActionType.CREATE,
            changes: buildCreateSnapshot(created),
          },
        });
        return created;
      });
      return ProductResponseDto.fromEntity(product);
    } catch (error) {

      // Decisión: el findFirst anterior cubre el caso habitual y permite devolver un 409
      // de forma clara. Pero dos solicitudes simultáneas que intenten registrar
      // el mismo nombre podrían pasar esta validación antes de que alguna de ellas
      // confirme la inserción. La restricción ux_product_active_name en PostgreSQL es
      // la garantía real de unicidad. Este catch funciona como una capa de seguridad
      // que transforma la violación de unicidad de PostgreSQL en el mismo error de negocio,
      // evitando exponer un error interno y devolver un 500 al cliente.

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException(
          `A product named "${dto.name}" is already active`,
        );
      }
      throw error;
    }
  }

  async findAll(query: FindProductsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    // decision: offset pagination via page/pageSize query params, returned as
    // { data, meta } so the client gets total/totalPages without a second request.
    // Cursor pagination would scale better on huge tables, but for a product catalog
    // of this size page/pageSize is simpler to consume and to defend.
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where: { available: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where: { available: true } }),
    ]);

    return {
      data: data.map(ProductResponseDto.fromEntity),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async findOne(id: string): Promise<ProductResponseDto> {
    const product = await this.findActiveOrThrow(id);
    return ProductResponseDto.fromEntity(product);
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductResponseDto> {
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        const current = await tx.product.findFirst({
          where: { id, available: true },
        });
        if (!current) {
          throw new NotFoundException(`Product ${id} not found`);
        }

        const changes = diffProductFields(current, dto);

        const product = await tx.product.update({ where: { id }, data: dto });

        if (Object.keys(changes).length > 0) {
          await tx.productHistory.create({
            data: {
              productId: id,
              action: ActionType.UPDATE,
              changes: changes as Prisma.InputJsonValue,
            },
          });
        }

        return product;
      });
      return ProductResponseDto.fromEntity(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_CONSTRAINT_VIOLATION
      ) {
        throw new ConflictException(
          `A product named "${dto.name}" is already active`,
        );
      }
      throw error;
    }
  }

  async remove(id: string): Promise<ProductResponseDto> {
    const removed = await this.prisma.$transaction(async (tx) => {
      const current = await tx.product.findFirst({
        where: { id, available: true },
      });
      if (!current) {
        throw new NotFoundException(`Product ${id} not found`);
      }

      const product = await tx.product.update({
        where: { id },
        data: { available: false },
      });

      await tx.productHistory.create({
        data: {
          productId: id,
          action: ActionType.DELETE,
          changes: buildCreateSnapshot(current),
        },
      });

      return product;
    });
    return ProductResponseDto.fromEntity(removed);
  }

  async getHistory(id: string) {
    // decision: history lookup does NOT filter by `available`, unlike every other
    // method here. A soft-deleted product must stay queryable for its audit trail
    // (that's the whole point of soft-delete over a hard DELETE), so only a
    // genuinely missing id (never existed) returns 404.
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }

    return this.prisma.productHistory.findMany({
      where: { productId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async findActiveOrThrow(id: string): Promise<Product> {
    const product = await this.prisma.product.findFirst({
      where: { id, available: true },
    });
    if (!product) {
      throw new NotFoundException(`Product ${id} not found`);
    }
    return product;
  }
}

function diffProductFields(
  current: Product,
  dto: UpdateProductDto,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const comparableFields: (keyof UpdateProductDto)[] = [
    'sku',
    'name',
    'description',
    'price',
  ];

  for (const field of comparableFields) {
    if (dto[field] === undefined) continue;

    const from = field === 'price' ? current.price.toString() : current[field];
    const to = field === 'price' ? String(dto.price) : dto[field];

    if (from !== to) {
      changes[field] = { from, to };
    }
  }

  return changes;
}
