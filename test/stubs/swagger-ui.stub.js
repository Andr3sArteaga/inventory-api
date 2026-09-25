// Jest-only stub for @nestjs/swagger's swagger-ui submodule (see jest.config.ts for why).
// It exists purely to serve the /docs HTML page and is never touched by a unit test —
// none of them call SwaggerModule.setup(). The real file, on the other hand, declares
// `const require = createRequire(import.meta.url)` in the same scope as several static
// imports; Babel's CommonJS transform (needed for the import.meta rewrite) ends up
// hoisting that `const` above the require() calls it generates for those imports,
// producing "Cannot access 'require' before initialization" purely as a transform
// artifact. Stubbing it out here sidesteps that without touching real app code.
module.exports = {
  buildSwaggerHTML: () => '',
  buildSwaggerInitJS: () => '',
  getSwaggerAssetsAbsoluteFSPath: () => '',
};
