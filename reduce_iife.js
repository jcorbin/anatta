var estraverse = require('estraverse');
var match = require('pattern-match');

var block = require('./block');
var exits = require('./exits');
var scopeMod = require('./scope');

var IIFEPattern = {
    type: 'CallExpression',
    arguments: match.var('callArgs'),
    callee: match.var('func', {
        type: 'FunctionExpression'
    })
};

function reduceIife(ast) {
    var scope = scopeMod.visitor();

    ast = estraverse.replace(ast, {
        enter: function(node, parent) {
            scope.enter(node, parent);
            return match(node, function(when) {
                // tail iife
                when({
                    type: 'ReturnStatement',
                    argument: IIFEPattern
                }, function inlineTailIife(m) {
                    return inlineIife(m, scope, {
                        return: function(arg) {
                            return {
                                type: 'ReturnStatement',
                                argument: arg
                            };
                        }
                    });
                });

                // var foo = iife();
                when({
                    type: 'VariableDeclaration',
                    declarations: [{
                        type: 'VariableDeclarator',
                        id: {
                            type: 'Identifier',
                            name: match.var('name')
                        },
                        init: IIFEPattern
                    }]
                }, function(m) {
                    return inlineVarIffe(m, scope);
                });

                // foo = iife();
                when({
                    type: 'ExpressionStatement',
                    expression: {
                        type: 'AssignmentExpression',
                        operator: '=',
                        left: {
                            type: 'Identifier',
                            name: match.var('name')
                        },
                        right: IIFEPattern
                    }
                }, function(m) {
                    return inlineAssignIIFE(m, scope);
                });

                // TODO: other iife in expr?

                when(match.any, function() {return node;});
            });
        },

        leave: function leave(node, parent) {
            scope.leave(node, parent);
            return node;
        }
    });

    ast = block.flatten(ast);

    return ast;
}

function inlineVarIffe(m, scope) {
    var ast = inlineAssignIIFE(m, scope);
    ast = block.expr([{
        type: 'VariableDeclaration',
        kind: 'var',
        declarations: [{
            type: 'VariableDeclarator',
            id: {
                type: 'Identifier',
                name: m.name
            },
            init: null
        }]
    }].concat(block.body(ast)));
    return ast;
}

function inlineAssignIIFE(m, scope) {
    var ast = inlineIife(m, scope, {
        return: function(arg) {
            return {
                type: 'ExpressionStatement',
                expression: {
                    type: 'AssignmentExpression',
                    operator: '=',
                    left: {
                        type: 'Identifier',
                        name: m.name
                    },
                    right: arg
                }
            };
        }
    });
    return ast;
}

function inlineIife(m, scope, replacement) {
    var callArgs = m.callArgs;
    var func = m.func;
    var body = func.body;
    var funcParams = func.params;
    var funcName = scope.uniqueName(func.id && func.id.name || 'anon');

    if (!replacement) {
        replacement = {
            return: function(arg) {
                return arg; // TODO: some expressions can be eliminated?
            }
        };
    }

    var decls = [];
    for (var i = funcParams.length; --i >= 0; ) {
        var param = funcParams[i];
        var arg = callArgs[i];
        if (arg && arg.type === 'Identifier' && arg.name === param.name) {
            continue;
        }
        decls.push({
            type: 'VariableDeclarator',
            id: param,
            init: arg || null
        });
    }
    if (decls.length) {
        body = [{
            type: 'VariableDeclaration',
            kind: 'var',
            declarations: decls
        }].concat(body);
    }

    var ast = block.expr(body);

    ast = scopeMod.prefixDirectVars(ast, funcName + '_', scope);

    ast = exits.replace(ast, replacement);

    return ast;
}

module.exports = reduceIife;
