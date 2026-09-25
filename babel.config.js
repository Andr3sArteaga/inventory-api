// Used ONLY by Jest, and only to transpile @nestjs/*'s own ESM-only source under
// node_modules (see jest.config.ts for why). Not part of the app's build — nest
// build/start never touch this file.
module.exports = {
  presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
  plugins: ['babel-plugin-transform-import-meta'],
};
