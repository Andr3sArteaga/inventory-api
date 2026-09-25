# Inventory API

API REST para gestionar el inventario de un negocio: productos, órdenes de venta, movimientos de stock y el historial de cambios de cada producto. Permite crear y editar productos, generar órdenes que reservan stock automáticamente, y registrar entradas/salidas de mercadería sin arriesgar que el stock quede en negativo, incluso si llegan varias peticiones al mismo tiempo.

---

## Índice

1. [Requisitos previos](#requisitos-previos)
2. [Instalación paso a paso](#instalación-paso-a-paso)
3. [Variables de entorno](#variables-de-entorno)
4. [Cómo probar la API](#cómo-probar-la-api)
5. [Decisiones técnicas](#decisiones-técnicas)
6. [Diseño de la base de datos](#diseño-de-la-base-de-datos)
7. [Seguridad y manejo de errores](#seguridad-y-manejo-de-errores)
8. [Testing](#testing)
9. [Estructura del proyecto](#estructura-del-proyecto)
10. [Declaración de uso de IA](#declaración-de-uso-de-ia)

---

## Requisitos previos

Antes de empezar, necesitás tener instalado en tu máquina:

| Herramienta | Versión | Para qué sirve | Dónde descargarla |
|---|---|---|---|
| **Node.js** | 22.x o superior | Ejecuta el servidor de la API. | [nodejs.org/es/download](https://nodejs.org/es/download) |
| **npm** | Viene incluido con Node.js | Instala las librerías (dependencias) del proyecto. | Se instala junto con Node.js |
| **Docker Desktop** | Cualquier versión reciente | Levanta la base de datos PostgreSQL sin instalarla manualmente en tu sistema. | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |

> **PostgreSQL** es el motor de base de datos que usa este proyecto. No necesitás instalarlo aparte: Docker lo descarga y lo levanta por vos en el paso 4 de la instalación.

---

## Instalación paso a paso

Segui estos pasos **en este orden exacto**. Cada uno incluye el comando a copiar y pegar en tu terminal, qué hace, y qué deberías ver si salió bien.

### 1. Clonar el repositorio

```bash
git clone https://github.com/Andr3sArteaga/inventory-api.git
cd inventory-api
```

Esto descarga el código del proyecto a tu computadora y te ubica dentro de la carpeta. Deberías ver una carpeta nueva llamada `inventory-api` con archivos como `package.json` y `src/` adentro.

### 2. Instalar las dependencias

```bash
npm install
```

Descarga todas las librerías que usa el proyecto (NestJS, Prisma, etc.) — se guardan en una carpeta `node_modules` que **no** viaja en el repositorio (ver `.gitignore`). Puede tardar uno o dos minutos. Si termina sin líneas en rojo que digan `error`, salió bien (los `npm warn` en amarillo son normales y se pueden ignorar).

### 3. Crear tu archivo de variables de entorno

```bash
cp .env.example .env
```

> En Windows con PowerShell, si `cp` no funciona, usá: `copy .env.example .env`

Esto crea un archivo `.env` con la configuración de conexión a la base de datos. Un **archivo de variables de entorno** es simplemente un archivo de texto con configuración que no queremos escribir directamente en el código (como contraseñas o direcciones de conexión). El archivo `.env.example` trae valores de desarrollo que ya funcionan con el Docker del paso siguiente, así que no necesitás cambiar nada para levantar el proyecto localmente.

### 4. Levantar la base de datos con Docker

```bash
docker compose up -d
```

Esto descarga (la primera vez) y levanta un contenedor de PostgreSQL 16 en segundo plano (el `-d` es por "detached", es decir, sin quedarse "pegado" mostrando logs en tu terminal). Para confirmar que quedó corriendo:

```bash
docker ps
```

Deberías ver una fila con `inventory-postgres` en la columna `NAMES` y un estado que empieza con `Up`.

### 5. Generar el cliente de Prisma

```bash
npx prisma generate
```

**Prisma** es la herramienta que usa este proyecto para hablar con la base de datos sin escribir SQL a mano. Este comando lee el archivo `prisma/schema.prisma` (donde están definidas las tablas) y genera código TypeScript a medida en `src/generated/prisma/`. Esa carpeta generada **no viaja en el repositorio** (está en `.gitignore`, porque se puede regenerar en cualquier momento con este comando) — por eso este paso es obligatorio, no opcional. Si funcionó, vas a ver un mensaje como `✔ Generated Prisma Client`.

### 6. Aplicar las migraciones a la base de datos

```bash
npx prisma migrate deploy
```

Una **migración** es un archivo SQL con instrucciones para crear o modificar tablas. Este comando aplica, en orden, todas las migraciones que están guardadas en `prisma/migrations/` — en la práctica, esto es lo que crea las 5 tablas de la aplicación (productos, historial, órdenes, items de orden y movimientos de stock) dentro de la base de datos vacía que levantó Docker. Si salió bien, vas a ver `No pending migrations to apply` o la lista de migraciones aplicadas.

### 7. (Opcional) Cargar datos de ejemplo

```bash
npm run db:seed
```

Este comando crea 4 productos de ejemplo (auriculares, teclado, mouse, monitor) para que tengas algo para probar sin escribirlo a mano. Es seguro correrlo más de una vez: si un producto ya existe, lo salta en vez de duplicarlo.

### 8. Levantar el servidor

```bash
npm run start:dev
```

Arranca la API en modo desarrollo (se reinicia solo cada vez que guardás un cambio en el código). Si todo salió bien, vas a ver en la terminal una línea como:

```
Swagger docs available at http://localhost:3000/docs
```

### 9. Confirmar que todo funciona

Abrí en tu navegador:

```
http://localhost:3000/docs
```

Si ves una página con el título "Inventory API" y una lista de endpoints agrupados en `products`, `orders` e `inventory`, ¡la instalación funcionó! Si en cambio el navegador dice que no puede conectarse, revisá que el paso 8 siga corriendo en la terminal sin errores.

---

## Variables de entorno

Estas son las variables que necesita el proyecto, definidas en tu archivo `.env` (creado en el paso 3 a partir de `.env.example`):

| Variable | Qué significa | Valor de ejemplo |
|---|---|---|
| `DATABASE_URL` | La dirección de conexión a la base de datos PostgreSQL: usuario, contraseña, host, puerto y nombre de la base, todo en una sola cadena de texto. | `postgresql://postgres:postgres@localhost:5433/inventory?schema=public` |
| `PORT` | El puerto donde escucha la API. Es opcional: si no lo definís, usa `3000` por defecto. | `3000` |

> Las credenciales de `DATABASE_URL` (`postgres` / `postgres`) son de desarrollo y solo funcionan contra el contenedor Docker local de este proyecto — no dan acceso a nada fuera de tu propia máquina, por eso está bien que queden visibles en `.env.example`. En un proyecto real, credenciales de base de datos **nunca** deberían subirse a un repositorio: se manejan con un gestor de secretos o variables de entorno del servidor/CI.

---

## Cómo probar la API

La forma principal de probar todos los endpoints es **Swagger**, disponible en [http://localhost:3000/docs](http://localhost:3000/docs) mientras el servidor está corriendo. Swagger es una página interactiva, generada automáticamente a partir del código, que documenta cada endpoint con sus parámetros, ejemplos y posibles respuestas (incluyendo errores).

Para probar un endpoint sin escribir código:

1. Buscá el endpoint que te interesa (por ejemplo `POST /products`) y hacé clic para expandirlo.
2. Apretá el botón **"Try it out"** — esto habilita un formulario editable con un ejemplo ya cargado.
3. Editá el ejemplo si querés (o dejalo como está) y apretá **"Execute"**. Vas a ver la respuesta real de la API debajo, con su código de estado (200, 404, 409, etc.).

---

## Decisiones técnicas

### ¿Por qué NestJS?

NestJS es un framework de Node.js que ya trae una estructura organizada por módulos (cada funcionalidad — productos, órdenes, inventario — vive en su propia carpeta con su controlador, su lógica de negocio y sus DTOs), un sistema de inyección de dependencias (las clases reciben lo que necesitan sin tener que construirlo ellas mismas) y soporte nativo para TypeScript, validación de datos y documentación automática (Swagger). Para una API con varios módulos relacionados entre sí como esta, esa estructura evita que el código se vuelva un solo archivo gigante difícil de mantener.

### ¿Por qué PostgreSQL y no una base NoSQL?

Los datos de este proyecto tienen relaciones fuertes entre sí: un `OrderItem` (item de una orden) **siempre** tiene que referirse a un `Product` que exista de verdad, y un `InventoryMovement` (movimiento de stock) puede o no estar asociado a una `Order`. Una base relacional como PostgreSQL puede garantizar esas relaciones ella misma, a nivel de motor de base de datos — por ejemplo, rechaza directamente un intento de crear un `OrderItem` que apunte a un producto inexistente. Una base NoSQL no ofrece esa garantía integrada: habría que reimplementarla a mano en el código de la aplicación, con más riesgo de que algo se escape. Además, crear una orden con varios items y reservar el stock de cada uno tiene que ser una operación "todo o nada" (una **transacción**: un conjunto de cambios que se aplican completos o no se aplican en absoluto) — las bases relacionales como PostgreSQL soportan esto de forma nativa y confiable.

### ¿Por qué Prisma 7, específicamente?

Prisma es la herramienta ("ORM") que traduce el código TypeScript de este proyecto a consultas SQL reales. Se eligió la serie **7.x**, no la última disponible.

> ⚠️ **Importante:** al momento de escribir esto, ya existe Prisma 8 (`8.0.0-rc.17`, todavía en fase de pruebas — "rc" significa *release candidate*, una versión candidata a ser la final pero no garantizada como estable). Prisma 8 usa un sistema de generación de cliente distinto e **incompatible** con la forma en que está armado este proyecto. El archivo `package.json` ya fija las versiones de `prisma` y `@prisma/client` como `^7.10.0`, lo cual en la práctica bloquea una actualización automática a la versión 8 — pero si en algún momento se corre `npm install prisma@latest` a mano, **hay que evitarlo** salvo que se planee migrar el proyecto siguiendo la guía oficial de Prisma para ese salto de versión.

### ¿Qué es un "driver adapter" y por qué Prisma 7 lo requiere?

Un **driver adapter** es un paquete chico que le permite a Prisma conectarse a la base de datos usando directamente la librería oficial de conexión de esa base (en este caso, [`@prisma/adapter-pg`](https://www.npmjs.com/package/@prisma/adapter-pg), que usa por debajo el driver `pg` de PostgreSQL) en lugar de que Prisma incluya su propia lógica de conexión interna. Desde la versión 7, Prisma requiere declarar explícitamente este adaptador (se ve en [`prisma.service.ts`](src/database/prisma.service.ts)) — a cambio, el cliente resultante es más liviano y más fácil de usar en entornos como serverless.

### ¿Por qué "soft-delete" en vez de borrar productos de verdad?

Cuando se "elimina" un producto, en realidad se marca `available: false` en vez de borrar la fila de la base de datos (esto es lo que se llama **soft-delete**, o "borrado suave"). Se eligió este enfoque por dos razones concretas:

1. **El historial de auditoría tiene que sobrevivir al borrado.** Si un producto se borra físicamente, todas sus filas de historial (`ProductHistory`) y cualquier orden pasada que lo mencione perderían con qué producto están relacionadas.
2. **Las órdenes y movimientos de stock ya generados no dejan de tener sentido.** Un producto discontinuado sigue siendo el mismo producto que apareció en órdenes viejas — borrarlo de la base de datos rompería esa trazabilidad para siempre.

---

## Diseño de la base de datos

### Las 5 tablas y para qué sirve cada una

| Tabla | Para qué sirve |
|---|---|
| **Product** | El catálogo de productos: nombre, SKU (código interno único), precio, y el stock actual. |
| **ProductHistory** | El registro de auditoría de cada producto: qué cambió, cuándo, y con qué valores (antes/después). Se genera automáticamente al crear, editar o "eliminar" un producto. |
| **Order** | Una orden de venta: quién la pidió, a qué dirección, y en qué estado está (pendiente, confirmada, enviada, entregada o cancelada). |
| **OrderItem** | Cada línea de una orden: qué producto, cuánta cantidad, y a qué precio se vendió (el precio queda "congelado" al momento de la compra, así una suba de precio después no afecta órdenes ya hechas). |
| **InventoryMovement** | El registro de cada entrada o salida de stock: cuánto, de qué producto, por qué motivo, y si está asociado a una orden o fue un movimiento manual. |

### Cómo se evita tener dos productos activos con el mismo nombre

La base de datos tiene un **índice único parcial** llamado `ux_product_active_name` sobre la columna `name` de `Product`, que solo aplica a las filas donde `available = true`. En criollo: es una regla que la base de datos misma hace cumplir, sin que dependa de que el código de la aplicación se acuerde de chequearla — si dos peticiones intentaran crear al mismo tiempo un producto activo con el mismo nombre, la base de datos rechaza la segunda automáticamente. La API además hace una verificación previa más amigable (devuelve un error 409 claro en vez de un error crudo de PostgreSQL), pero el índice es la garantía real de que nunca puede colarse un duplicado, ni siquiera por una coincidencia de tiempos.

### Cómo se evita que el stock quede en negativo

Esto se garantiza en **dos niveles**:

1. **Un `CHECK` en la base de datos** (una restricción que Postgres verifica en cada escritura) rechaza directamente cualquier intento de guardar una cantidad negativa. Es la última barrera, para cuando todo lo demás falla.
2. **El mecanismo principal** es que cada movimiento de stock se aplica con una sola operación atómica de "actualizar donde la condición se cumple" (`UPDATE ... WHERE stock >= cantidad`), en vez de primero *leer* el stock actual y después *escribir* el nuevo valor calculado en el código.

Esa distinción importa por lo que se llama una **condición de carrera**: un ejemplo simple es dos personas comprando, al mismo tiempo, el último producto que queda en stock (1 unidad). Si el sistema primero lee "queda 1" y después escribe "ahora queda 0" como dos pasos separados, existe una ventana de tiempo donde ambas compras pueden leer "queda 1" *antes* de que ninguna haya escrito todavía — y las dos terminan aplicando su descuento, dejando el stock en -1. Al resolver la validación y la escritura en una sola instrucción atómica, la propia base de datos serializa las dos peticiones: la primera que llega gana, y la segunda directamente encuentra que la condición (`stock >= cantidad`) ya no se cumple, sin que el código de la aplicación tenga que coordinar nada manualmente. Esto se probó en la práctica con varias peticiones concurrentes reales antes de darlo por terminado.

### La máquina de estados de las órdenes

Una orden solo puede moverse entre estados siguiendo este camino (una **máquina de estados**: un mapa fijo de "desde qué estado, a cuáles otros estados se puede pasar"):

```
PENDING ──► CONFIRMED ──► SHIPPED ──► DELIVERED
   │             │
   └─► CANCELLED ◄┘
```

- `PENDING` → `CONFIRMED` o `CANCELLED`
- `CONFIRMED` → `SHIPPED` o `CANCELLED`
- `SHIPPED` → `DELIVERED` únicamente (ya no se puede cancelar una orden que salió a entregarse)
- `DELIVERED` y `CANCELLED` son estados finales: no se puede salir de ellos hacia ningún otro.

Cualquier otro intento de transición (por ejemplo, `PENDING` directo a `DELIVERED`) se rechaza con un error 409, indicando explícitamente desde qué estado a cuál se intentó pasar. Cancelar una orden que estaba en `PENDING` o `CONFIRMED` además repone automáticamente el stock reservado de cada uno de sus items.

### Nota sobre los `CHECK` y Prisma

Prisma no tiene, en su archivo de definición de esquema, una forma de declarar restricciones `CHECK` (como "la cantidad tiene que ser mayor a cero"). Por eso, en este proyecto esas restricciones se agregaron a mano directamente en el archivo SQL de la migración correspondiente, después de generarla. Esto es una decisión documentada y deliberada, no una limitación que se haya pasado por alto: cada vez que se agrega una tabla con una regla de este tipo, hay que recordar sumarla manualmente al SQL de la migración.

---

## Seguridad y manejo de errores

| Riesgo considerado | Cómo se mitiga en este proyecto |
|---|---|
| **Inyección SQL** | Prisma parametriza automáticamente todas las consultas — nunca se concatena texto de un usuario directamente en una consulta SQL. |
| **Manipulación del payload** (que alguien envíe campos que no debería) | El `ValidationPipe` global está configurado con `whitelist: true` y `forbidNonWhitelisted: true`: en criollo, cualquier campo del cuerpo de la petición que la API no esperaba explícitamente se rechaza con un error 400, en vez de guardarse silenciosamente. |
| **Datos malformados** (tipos incorrectos, campos vacíos, valores fuera de rango) | Cada DTO (la clase que define la forma esperada de cada petición) usa decoradores de `class-validator` (`@IsString`, `@IsUUID`, `@IsPositive`, etc.) que validan el contenido antes de que llegue a la lógica de negocio. |
| **Exposición de información interna en los errores** (stack traces, mensajes crudos de la base de datos, nombres de archivos o columnas) | Un filtro global de excepciones ([`HttpExceptionFilter`](src/common/filters/http-exception.filter.ts)) intercepta **todos** los errores antes de que salgan de la API. Un error inesperado se registra completo en el log del servidor (para que el equipo lo pueda diagnosticar) pero al cliente solo le llega un mensaje genérico, nunca el detalle interno. |
| **Formato de error inconsistente entre endpoints** | Ese mismo filtro global unifica **todas** las respuestas de error (validación, negocio, o inesperadas) al mismo formato: `{ statusCode, message, error, timestamp, path }`. |

---

## Testing

Este proyecto tiene tests unitarios (de caja blanca, es decir: prueban la lógica interna directamente, no solo el resultado final) para las dos partes más delicadas del sistema: la máquina de estados de las órdenes y la lógica de movimientos de inventario (incluyendo el mecanismo que evita el stock negativo bajo concurrencia).

```bash
npm test
```

- Cubren, entre otras cosas: cada transición de estado válida e inválida de una orden, que cancelar una orden repone el stock de cada item, que una reserva de stock fallida revierte toda la orden, y que un movimiento de inventario nunca modifica nada si la validación de stock falla.
- **No necesitan la base de datos ni Docker levantados** — usan objetos simulados (mocks) de Prisma en lugar de una conexión real. Esto se confirmó apagando el contenedor de Docker y corriendo la suite completa igual con éxito.

---

## Estructura del proyecto

```
inventory-api/
├─ prisma/
│  ├─ schema.prisma        # Definición de las 5 tablas y sus relaciones
│  ├─ migrations/          # Historial de cambios aplicados a la base de datos
│  └─ seed.ts               # Script opcional para cargar productos de ejemplo
├─ src/
│  ├─ database/            # Conexión a PostgreSQL (PrismaService/PrismaModule)
│  ├─ common/
│  │  └─ filters/          # Filtro global de manejo de errores
│  ├─ products/            # Módulo de productos: controller, service, DTOs
│  ├─ orders/               # Módulo de órdenes: controller, service, DTOs
│  ├─ inventory/            # Módulo de movimientos de stock: controller, service, DTOs
│  ├─ generated/prisma/     # Cliente de Prisma (se regenera con `npx prisma generate`, no viaja en el repo)
│  ├─ app.module.ts         # Módulo raíz: junta todos los módulos anteriores
│  └─ main.ts                # Punto de entrada: arranca el servidor y configura Swagger
├─ docker-compose.yml        # Definición del contenedor de PostgreSQL para desarrollo local
├─ .env.example              # Plantilla de variables de entorno
└─ package.json
```

---

## Declaración de uso de IA

**Qué se usó:** Claude (de Anthropic) — tanto en conversación para el diseño y las decisiones de arquitectura, como Claude Code para la implementación real del código, las migraciones, la documentación de Swagger, los tests y este mismo README.

**Cómo se usó:** el diseño de cada modelo de datos (qué campos tiene cada tabla, qué restricciones aplican, cómo se relacionan entre sí), las reglas de negocio (cuándo se rechaza una transición de estado, cuándo se reserva o repone stock, qué hace soft-delete y por qué) y los criterios de validación de cada endpoint fueron discutidos y decididos explicando el razonamiento de negocio de cada regla antes de que se escribiera una sola línea de código — la IA no inventó reglas de negocio por su cuenta. A partir de ahí, la IA ayudó a traducir esas decisiones a código Nest/Prisma concreto (servicios, controladores, DTOs, migraciones SQL), a redactar la documentación de Swagger endpoint por endpoint, a escribir la suite de tests unitarios, y a armar este README. Cada módulo se revisó y se probó contra la base de datos real antes de aprobar el siguiente. Un caso concreto y verificable: la lógica original de `applyMovement` tenía una condición de carrera real bajo concurrencia (dos escrituras simultáneas podían dejar el stock negativo); ese defecto fue señalado explícitamente como corrección a aplicar, con la solución exacta especificada (una sola operación atómica `updateMany` con la condición de stock en el `WHERE`), y luego verificado con una prueba de concurrencia real antes de aceptarlo. En el código, los pocos puntos donde la implementación tomó una decisión propia no especificada en detalle (por ejemplo, la forma exacta de la paginación, o cómo se comparte la transacción de Prisma entre `orders.service` e `inventory.service`) están marcados explícitamente con comentarios `// decision:` explicando el porqué.
