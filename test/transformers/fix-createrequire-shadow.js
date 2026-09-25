// See test/transformers/nestjs-esm.js for why this runs as its own, separate Babel pass.
module.exports = function fixCreateRequireShadow({ types: t }) {
  return {
    name: 'fix-createrequire-shadow',
    visitor: {
      VariableDeclarator(path) {
        const { id, init } = path.node;
        if (
          t.isIdentifier(id) &&
          id.name === 'require' &&
          t.isCallExpression(init) &&
          t.isIdentifier(init.callee) &&
          init.callee.name === 'createRequire'
        ) {
          path.scope.rename(id.name);
        }
      },
    },
  };
};
