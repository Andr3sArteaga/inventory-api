// Custom Jest transformer for the .js files under node_modules/@nestjs that Jest is no
// longer allowed to skip (see the transformIgnorePatterns comment in jest.config.ts).
// Plain babel-jest with a single combined plugin list isn't enough here: several of
// those files use `const require = createRequire(import.meta.url);` to lazily require
// optional peer deps, and babel-plugin-transform-import-meta's own rewrite of
// `import.meta.url` inserts a fresh `require('url')` call as part of that rewrite. If
// our shadow-fixing rename plugin and the import-meta plugin run in the SAME traversal,
// which one "wins" the rename for that freshly-inserted node depends on internal
// plugin/traversal ordering we don't control — empirically, the rename swept up the
// import-meta plugin's own `require('url')` too, recreating the exact
// "Cannot access 'require' before initialization" bug one level down. Running the
// rename as a fully separate, earlier Babel pass — completed before import.meta ever
// gets rewritten — removes that ordering dependency entirely.
const babel = require('@babel/core');
const fixCreateRequireShadow = require('./fix-createrequire-shadow');

module.exports = {
  process(sourceText, sourcePath) {
    const renamed = babel.transformSync(sourceText, {
      filename: sourcePath,
      babelrc: false,
      configFile: false,
      sourceType: 'module',
      plugins: [fixCreateRequireShadow],
      code: true,
      ast: false,
    });

    const transformed = babel.transformSync(renamed.code, {
      filename: sourcePath,
      babelrc: false,
      configFile: false,
      sourceType: 'module',
      presets: [['@babel/preset-env', { targets: { node: 'current' }, modules: 'commonjs' }]],
      plugins: ['babel-plugin-transform-import-meta'],
    });

    return { code: transformed.code, map: transformed.map };
  },
};
