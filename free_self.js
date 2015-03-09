var estraverse = require('estraverse');
var match = require('pattern-match');

function freeSelf(selfs, ast) {
    return estraverse.replace(ast, {
        enter: function onEnter(node) {
            var self = this;
            return match(node, function(when) {
                when({
                    type: 'VariableDeclarator',
                    id: {
                        type: 'Identifier',
                        name: match.var('name')
                    },
                    init: {
                        type: 'ThisExpression'
                    }
                }, function(m) {
                    if (selfs.indexOf(m.name) === -1) selfs.push(m.name);
                    return self.remove();
                });

                when(match.any, function() {return node;});
            });
        },
        leave: function removeEmptyVarDecls(node) {
            var self = this;
            if (node.type === 'VariableDeclaration' && !node.declarations.length) {
                return self.remove();
            } else {
                return node;
            }
        }
    });
}

module.exports = freeSelf;
