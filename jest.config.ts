import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest';
import ts from 'typescript';

// Path aliases (e.g. the ones added by `nest g library`) live in tsconfig.json,
// so they are read from there instead of being duplicated here.
const { config: tsconfig } = ts.readConfigFile(
  './tsconfig.json',
  ts.sys.readFile,
);
const paths = tsconfig?.compilerOptions?.paths ?? {};

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  // decision: the app itself runs as CommonJS (no "type": "module" anywhere in
  // package.json, and `npm run start` already proves this works — Node 22's own
  // require() can load a synchronous ESM module transparently, which is how the
  // running app gets away with depending on @nestjs/* even though those ship ESM-only).
  // Jest's module loader is its own reimplementation and does NOT have that Node 22
  // require(esm) capability (only from Node v24.9+, per Jest's own error message), so a
  // plain CJS transform that only covers our OWN source under src/ still breaks the
  // moment a spec file requires @nestjs/testing. Un-ignoring @nestjs's own files lets
  // Jest transform them too — but a plain single-pass Babel transform isn't enough:
  // several of those files use `const require = createRequire(import.meta.url)` to
  // lazily require optional peer deps, which needs its own fix-up before the import.meta
  // rewrite runs (see test/transformers/nestjs-esm.js for exactly why order matters
  // here). Runtime stays plain CommonJS end to end — no --experimental-vm-modules, no
  // touching package.json.
  transformIgnorePatterns: ['/node_modules/(?!@nestjs/)'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    '^.+\\.js$': '<rootDir>/test/transformers/nestjs-esm.js',
  },
  moduleNameMapper: {
    // decision: @nestjs/swagger's swagger-ui submodule only exists to serve the /docs HTML
    // page — no unit test ever calls SwaggerModule.setup(), yet importing anything from
    // '@nestjs/swagger' (even just the @ApiProperty decorator) pulls it in transitively.
    // That file declares `const require = createRequire(import.meta.url)` in the same
    // scope as several static imports; once Babel lowers those imports to require() calls,
    // the hoisted `const require` shadows them and throws "Cannot access 'require' before
    // initialization" — a transform artifact, not a real bug in our code or in Nest. This
    // entry MUST come before the generic .js-stripping rule below (Jest uses the first
    // matching entry), so it intercepts the swagger-ui import before that rule does.
    'swagger-ui/index\\.js$': '<rootDir>/test/stubs/swagger-ui.stub.js',
    // decision: the generated Prisma client uses NodeNext-style relative imports with an
    // explicit .js extension (e.g. prisma.service.ts importing '../generated/prisma/client.js'),
    // which is correct for a real NodeNext build but has no matching .js file on disk when
    // ts-jest runs straight against the .ts sources — only client.ts exists. This strips a
    // trailing .js off relative specifiers before Jest's resolver looks for the file, so it
    // falls through to client.ts via moduleFileExtensions, same trick used by every NodeNext
    // + ts-jest project.
    '^(\\.{1,2}/.*)\\.js$': '$1',
    ...pathsToModuleNameMapper(paths, { prefix: '<rootDir>/' }),
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    'libs/**/*.(t|j)s',
    'apps/**/*.(t|j)s',
  ],
  coverageDirectory: './coverage',
  testEnvironment: 'node',
};

export default config;
