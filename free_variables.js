var estraverse = require('estraverse');
var scopeMod = require('./scope');

function visitor(eachFreeVar) {
    var scope = scopeMod.visitor();

    var replacer = scopeMod.toplevelReplacer(function process(node, parent) {
        if (node.name === 'undefined') return node;
        if (scope.vars[node.name]) return node;

        switch (parent.type) {
            case 'LabeledStatement':
            case 'BreakStatement':
                return node;
        }
        // console.error('!!!', node.name, parent.type);

        var ret = eachFreeVar(node, parent);
        if (ret) {
            // TODO: think this is only correct in the node.type=identifier branch
            node = ret;
            if (node.type === 'FunctionExpression') {
                scope.push(node);
            }
        }
        return node;
    });

    return {
        enter: function enter(node, parent) {
            scope.enter(node, parent);
            return replacer(node, parent);
        },
        leave: function leave(node, parent) {
            scope.leave(node, parent);
            return node;
        }
    };
}

function eachFreeVariable(ast, eachFreeVar) {
    estraverse.traverse(ast, visitor(eachFreeVar));
}

function replaceFreeVariables(ast, eachFreeVar) {
    return estraverse.replace(ast,
        visitor(eachFreeVar)
    );
}

module.exports.visitor = visitor;
module.exports.each = eachFreeVariable;
module.exports.replace = replaceFreeVariables;
