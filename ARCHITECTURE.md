# Arquitectura

Este documento explica cómo está construido el proyecto por dentro: el flujo de una petición, el modelo de datos, el mecanismo de transacciones compartidas entre módulos, y las decisiones de base de datos que no quedan visibles solo mirando `schema.prisma`.

Asume que ya tenés el proyecto instalado y corriendo — para eso está el [README](README.md). Este documento es para quien va a **modificar** el código, no para quien lo va a **levantar**.

---

## 1. Diagrama de capas

Toda petición HTTP atraviesa las mismas capas, en el mismo orden, sin excepciones:

```
┌────────────────────────────────────────────────────────────────┐
│  Cliente HTTP (Swagger UI, curl, un frontend, etc.)             │
└───────────────────────────┬──────────────────────────────────────┘
                            │ JSON sobre HTTP
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  ValidationPipe global                                           │
│  registrado en configureApp() — src/app.config.ts                │
│                                                                    │
│  · whitelist + forbidNonWhitelisted: cualquier campo del body/    │
│    query que no esté declarado en el DTO se rechaza (400),        │
│    en vez de guardarse silenciosamente.                           │
│  · transform: convierte el JSON plano en una instancia real de    │
│    la clase DTO, aplicando los decoradores de class-validator     │
│    (@IsUUID, @IsPositive, @Type, etc.)                             │
│                                                                    │
│  Si la validación falla, el flujo NUNCA llega al Controller.      │
└───────────────────────────┬──────────────────────────────────────┘
                            ▼ DTO ya validado y tipado
┌────────────────────────────────────────────────────────────────┐
│  Controller  —  src/<módulo>/<módulo>.controller.ts               │
│                                                                    │
│  Solo enruta: decide qué método del Service llamar con qué        │
│  parámetros (@Param, @Body, @Query ya parseados). No contiene     │
│  ninguna regla de negocio — si un Controller empieza a tener       │
│  un `if`, esa lógica está en el lugar equivocado.                  │
└───────────────────────────┬──────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  Service  —  src/<módulo>/<módulo>.service.ts                     │
│                                                                    │
│  Toda la lógica de negocio real vive acá: reglas de unicidad,     │
│  máquina de estados de las órdenes, transacciones, y las           │
│  llamadas entre módulos (OrdersService → InventoryService).        │
└───────────────────────────┬──────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  PrismaService  —  src/database/prisma.service.ts                 │
│                                                                    │
│  Única puerta de entrada a la base de datos en todo el proyecto.  │
│  Traduce las llamadas de Prisma Client a SQL parametrizado a       │
│  través del driver adapter (@prisma/adapter-pg).                   │
└───────────────────────────┬──────────────────────────────────────┘
                            ▼
┌────────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                       │
└────────────────────────────────────────────────────────────────┘
```

Si en **cualquier** punto de ese camino se lanza una excepción — de validación, de negocio (`NotFoundException`, `ConflictException`, `UnprocessableEntityException`), o un error de verdad inesperado — la respuesta sale siempre por el mismo lugar, nunca directo del Controller o del Service:

```
┌────────────────────────────────────────────────────────────────┐
│  HttpExceptionFilter global                                       │
│  src/common/filters/http-exception.filter.ts                      │
│  registrado también en configureApp()                             │
│                                                                    │
│  Único punto de salida de errores hacia el cliente. Normaliza     │
│  TODO (validación, negocio, o inesperado) al mismo shape:          │
│  { statusCode, message, error, timestamp, path }. Un error         │
│  inesperado se loguea completo en el servidor, pero nunca llega    │
│  al cliente con su stack trace o su mensaje crudo de Postgres.     │
└────────────────────────────────────────────────────────────────┘
```

`configureApp()` (`src/app.config.ts`) es la función que registra ambas piezas. La usan tanto `main.ts` como el bootstrap de los tests e2e (`test/e2e/*.e2e-spec.ts`), a propósito: así la configuración real de la app y la que corre en los tests **no pueden divergir** sin que alguien lo note.

---

## 2. Modelo de datos

Cinco tablas, definidas en `prisma/schema.prisma`:

```
┌────────────────┐          ┌─────────────────┐
│    Product      │  1 ── N  │  ProductHistory  │
│                 ├─────────►│                  │
│ id              │          │ productId (FK)   │
│ sku (unique)    │          │ action           │
│ name            │          │ changes (json)    │
│ price           │          └─────────────────┘
│ stock           │
│ available       │
└───┬─────────┬───┘
    │ 1       │ 1
    │ N       │ N
    ▼         ▼
┌──────────┐  ┌───────────────────┐        ┌─────────────┐
│OrderItem │  │ InventoryMovement  │        │    Order     │
│          │  │                    │  N ── 1│              │
│ orderId  │  │ productId (FK)     │◄───────┤ id           │
│(FK)──────┼─►│ orderId (FK, null) │        │ customerName │
│productId │  │ type (IN/OUT)      │        │ address      │
│(FK)      │  │ quantity           │        │ status       │
│quantity  │  └────────────────────┘        └──────┬───────┘
│unitPrice │                                        │ 1
└────┬─────┘                                        │
     │ N                                            │ N
     └────────────────────────────────────────────────┘
              (OrderItem también apunta a Order)
```

En texto llano, las relaciones:

- **Product 1 — N ProductHistory**: cada cambio (crear, editar, soft-delete) del producto genera una entrada. `onDelete: Restrict` — no se puede borrar físicamente un producto que tenga historial (y como el borrado es siempre soft-delete, esto nunca llega a probarse en la práctica).
- **Product 1 — N OrderItem**: un producto puede aparecer en muchas líneas de orden. `onDelete: Restrict` — no se puede borrar un producto referenciado por una orden.
- **Order 1 — N OrderItem**: cada orden tiene una o más líneas. `onDelete: Restrict`.
- **Product 1 — N InventoryMovement**: cada movimiento de stock (manual o generado por una orden) queda asociado a un producto. `onDelete: Restrict`.
- **Order 1 — N InventoryMovement (opcional)**: un movimiento *puede* estar asociado a una orden (`orderId` es nullable) — los movimientos manuales vía `POST /inventory/movements` no tienen orden asociada. `onDelete: SetNull` — si se borrara la orden (no ocurre en la práctica), el movimiento sobrevive con `orderId: null` en vez de desaparecer.

---

## 3. Flujo crítico: crear una orden

Este es el flujo más importante del proyecto — el único que toca tres tablas y dos services dentro de una sola transacción, y el único donde un fallo a mitad de camino tiene que deshacer todo lo anterior. Paso a paso, siguiendo `OrdersService.create()` (`src/orders/orders.service.ts`):

**1. Entrada y validación de forma.** `POST /orders` llega con `{ customerName, address, items: [{ productId, quantity }] }`. El `ValidationPipe` global corre `CreateOrderDto`: rechaza `customerName` sin letras (regex), `items` vacío (`@ArrayMinSize(1)`), o cualquier `productId` que no sea un UUID — todo esto pasa **antes** de que el código del `OrdersController`/`OrdersService` se ejecute.

**2. Se abre la transacción.** Lo primero que hace `create()` es:
```ts
return this.prisma.$transaction(async (tx) => { ... });
```
A partir de esta línea, **todo** lo que sigue dentro del callback corre sobre `tx` — el mismo objeto, no una copia. Nada de lo que pase ahí adentro se confirma en la base de datos hasta que el callback completo termine sin lanzar ninguna excepción.

**3. Se valida que los productos existan y estén activos.** `tx.product.findMany({ where: { id: { in: [...] }, available: true } })` busca todos los productos pedidos de una sola vez. Si algún `productId` del request no aparece en el resultado (no existe, o está soft-deleted), se lanza `NotFoundException` — y como estamos dentro de `tx` sin haber escrito nada todavía, no hay nada que revertir.

**4. Se crea la orden y sus items en un solo `tx.order.create()`.** La orden nace en `PENDING`, y cada `OrderItem` se crea anidado, copiando el precio **actual** del producto a `unitPrice` — así una suba de precio después no afecta órdenes ya creadas.

**5. Se reserva stock, item por item, pasando el mismo `tx`.** Este es el punto central de todo el diseño:
```ts
for (const item of dto.items) {
  await this.inventoryService.applyMovement(
    item.productId, MovementType.OUT, item.quantity,
    `Reserve for order ${order.id}`, order.id,
    tx,                                          // <- el mismo tx de arriba
  );
}
```
`InventoryService.applyMovement()` (`src/inventory/inventory.service.ts`) recibe ese `tx` como último parámetro. Al verlo, **no abre su propia transacción** — llama directo a su lógica interna (`runMovement`) pasándole ese `tx`, así que la reserva de stock corre sobre la misma conexión/transacción que ya tiene abierta `create()`. No hay un commit intermedio entre "crear la orden" y "reservar el stock del item 1".

**6. ¿Qué pasa si un item falla a mitad de camino?** Supongamos 3 items, y el item 2 no tiene stock suficiente. `applyMovement` → `runMovement` intenta un `UPDATE ... WHERE stock >= cantidad` que no afecta ninguna fila, y lanza `UnprocessableEntityException` (422) **desde dentro de `tx`**. Esa excepción:
- sale de `runMovement`, sale de `applyMovement`, sale del `for` de `create()`,
- nunca es atrapada por ningún `try/catch` en el camino,
- llega al `catch` implícito de `$transaction()`, que hace **rollback automático de todo**: la orden, los dos `OrderItem` ya creados, y el movimiento `OUT` que sí se había aplicado para el item 1. Todo desaparece junto, como si la petición nunca hubiera pasado.
- la excepción sigue propagándose hasta el `HttpExceptionFilter`, que la traduce a la respuesta 422 que recibe el cliente.

No existe ningún estado intermedio observable desde afuera: o la orden completa con sus 3 reservas existe, o no existe nada.

**7. Si todo sale bien.** Después del `for`, se vuelve a leer la orden con `tx.order.findUniqueOrThrow(...)` (incluyendo items + datos básicos del producto) y se mapea con `toOrderResponse()` (que convierte el `Decimal` de `unitPrice` a `string`). Ese valor de retorno es lo que hace que la promesa de `$transaction()` se resuelva — y **recién en ese momento** Prisma hace el `COMMIT` real contra Postgres. El controller devuelve `201` con la orden completa.

---

## 4. Por qué los movimientos de inventario están centralizados en un solo método

`InventoryService.applyMovement()` es el **único** lugar del proyecto que sabe cómo aplicar un movimiento de stock. Lo usan dos caminos completamente distintos:

- `POST /inventory/movements` (movimiento manual) → `InventoryService.create()` → `applyMovement(..., tx: undefined)`.
- `OrdersService.create()` / `updateStatus()` (reserva o restitución automática) → `applyMovement(..., tx: <la transacción de la orden>)`.

La firma es la misma en los dos casos; lo único que cambia es si se pasa un `tx` o no:

```ts
async applyMovement(productId, type, quantity, reason?, orderId?, tx?: Prisma.TransactionClient) {
  if (tx) {
    return this.runMovement(tx, productId, type, quantity, reason, orderId);
  }
  return this.prisma.$transaction((trx) => this.runMovement(trx, productId, type, quantity, reason, orderId));
}
```

`runMovement()` es donde vive **toda** la validación: que el producto exista y esté activo, que un `OUT` no deje el stock negativo, y la escritura atómica (`UPDATE ... WHERE stock >= cantidad`, ver sección de concurrencia más abajo). Esa lógica existe una sola vez en el código.

Si `OrdersService` reimplementara su propia versión de "restar stock" en vez de llamar a `applyMovement`, dos problemas serían casi inevitables: (a) las dos copias de la validación divergirían con el tiempo (alguien arregla un caso borde en una y se olvida de la otra), y (b) el mecanismo de atomicidad contra condiciones de carrera (el `updateMany` con la condición en el `WHERE`) tendría que reimplementarse dos veces, con doble chance de hacerlo mal en una de las dos. Centralizarlo en `applyMovement`/`runMovement` hace que esa clase entera de bugs sea estructuralmente imposible: hay una sola función que decide si un movimiento es válido, y todo el proyecto pasa por ella.

---

## 5. Decisiones de base de datos que Prisma no puede expresar en su schema

`schema.prisma` no tiene sintaxis para declarar restricciones `CHECK`. Estas cuatro reglas de integridad viven **solo** en el SQL de las migraciones, agregadas a mano después de generarlas — es una decisión documentada, no un olvido, y hay que recordarla cada vez que se toque una tabla que ya tiene una de estas reglas:

| Restricción | Tabla / columna | Qué garantiza | Migración |
|---|---|---|---|
| `stock_non_negative` (`CHECK`) | `Product.stock` | El stock nunca puede guardarse en negativo, ni siquiera si algún código nuevo se olvida de validarlo antes de escribir. Última barrera, detrás del `updateMany` atómico que ya lo evita en el 99% de los casos. | [`20260924064739_init_product/migration.sql`](prisma/migrations/20260924064739_init_product/migration.sql) |
| `ux_product_active_name` (índice único parcial) | `Product.name` **donde** `available = true` | No pueden coexistir dos productos *activos* con el mismo nombre — pero un producto soft-deleted no bloquea que se reuse su nombre. Es la garantía real de unicidad; el pre-check en `ProductsService.create()` solo existe para devolver un 409 legible en el camino feliz. | [`20260924064739_init_product/migration.sql`](prisma/migrations/20260924064739_init_product/migration.sql) |
| `orderitem_quantity_positive` (`CHECK`) | `OrderItem.quantity` | Una línea de orden no puede tener cantidad cero o negativa. | [`20260925053545_init_orders_inventory/migration.sql`](prisma/migrations/20260925053545_init_orders_inventory/migration.sql) |
| `movement_quantity_positive` (`CHECK`) | `InventoryMovement.quantity` | Un movimiento de stock no puede tener cantidad cero o negativa (la dirección la da `type`, no el signo de `quantity`). | [`20260925053545_init_orders_inventory/migration.sql`](prisma/migrations/20260925053545_init_orders_inventory/migration.sql) |

**Consecuencia práctica para el futuro:** si alguna vez se corre `npx prisma migrate dev` sobre este schema, Prisma va a comparar el estado real de la base contra lo que `schema.prisma` puede describir — y como estas cuatro reglas no están ahí, las va a marcar como "drift" y va a querer generar una migración que las elimina. La respuesta correcta en ese momento es cancelar esa migración propuesta (o revisarla a mano y borrar solo las partes que no correspondan), nunca aceptarla a ciegas.

---

## 6. Arquitectura de testing

Dos niveles, con objetivos deliberadamente distintos:

```
┌───────────────────────────────┐      ┌────────────────────────────────────┐
│  Unitarios — npm test           │      │  E2E — npm run test:e2e              │
│  src/**/*.service.spec.ts        │      │  test/e2e/*.e2e-spec.ts               │
│                                  │      │                                      │
│  PrismaService      → mockeado   │      │  AppModule real (Nest completo)      │
│  InventoryService    → mockeado  │      │  PrismaService → Postgres real        │
│  (donde OrdersService lo usa)    │      │  (base separada: inventory_test)      │
│                                  │      │                                      │
│  Prueban la LÓGICA en aislamiento:│      │  Prueban el CONTRATO HTTP real:       │
│  cada rama de la máquina de       │      │  status codes, shape exacto del       │
│  estados, cada excepción, el       │      │  JSON de error, y que las              │
│  shape exacto de lo que se         │      │  restricciones de la base (el         │
│  escribe (toHaveBeenCalledWith).   │      │  índice único, los CHECK) disparan     │
│                                  │      │  de verdad, no solo en la simulación.  │
│  ~4 segundos. Sin Docker.          │      │  Más lentos. Necesitan Docker.         │
└───────────────────────────────┘      └────────────────────────────────────┘
```

Existen los dos porque prueban cosas que el otro no puede ver:

- Los **unitarios** son el lugar correcto para agotar casos de negocio (las 9 transiciones de la máquina de estados, los distintos caminos de `applyMovement`) sin pagar el costo de una base de datos real en cada corrida — y sin depender de que Docker esté levantado, lo cual los hace seguros de correr en cualquier entorno de CI.
- Los **e2e** son el único lugar donde se comprueba que las piezas están *realmente* conectadas: que el `ValidationPipe` de verdad rechaza el payload incorrecto (no solo que el DTO tiene el decorador), que el índice único parcial de Postgres de verdad devuelve 409 y no un 500, y que el `HttpExceptionFilter` de verdad transforma la excepción en el JSON que el cliente termina recibiendo. Un mock nunca podría probar que la restricción SQL real existe y funciona.

Los e2e corren contra `inventory_test`, una base separada de la que usás para desarrollo (ver el README) — así una corrida de `npm run test:e2e` nunca pisa los datos que tengas cargados a mano mientras trabajás.
