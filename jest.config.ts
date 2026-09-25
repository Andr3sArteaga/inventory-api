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
  // Jest transform them too — but ts-jest alone still can't fully lower one specific
  // file (@nestjs/common's load-package.util.js), which uses `import.meta.url` for its
  // optional-peer-dependency loader. `import.meta` has no CommonJS equivalent, so no
  // TS module target can rewrite it; only a dedicated Babel plugin can. Hence two
  // transforms below: ts-jest for our own .ts (unaffected by any of this), babel-jest
  // (see babel.config.js) for the handful of @nestjs .js files that need import.meta
  // rewritten. Runtime stays plain CommonJS end to end — no --experimental-vm-modules,
  // no touching package.json.
  transformIgnorePatterns: ['/node_modules/(?!@nestjs/)'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
    '^.+\\.js$': 'babel-jest',
  },
  moduleNameMapper: {
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
