var estraverse = require('estraverse');

var block = require('./block');
var exits = require('./exits');
var scopeMod = require('./scope');

function reduceIife(ast) {
    var scope = scopeMod.visitor();

    ast = estraverse.replace(ast, {
        enter: function(node, parent) {
            scope.enter(node, parent);

            // tail iife
            if (node.type === 'ReturnStatement' &&
                node.argument.type === 'CallExpression' &&
                node.argument.callee.type === 'FunctionExpression') {
                console.log('// inlining tail iife');
                return inlineIife(node.argument, scope);
                // , {
                //     return: function(arg) {
                //         return {
                //             type: 'ReturnStatement',
                //             argument: arg
                //         };
                //     }
                // }
            }

            // var foo = iife();
            if (node.type === 'VariableDeclaration') {
                var remain = [];
                var body = [];
                for (var i = 0; i < node.declarations.length; i++) {
                    var decl = node.declarations[i];
                    if (decl.type === 'VariableDeclarator' &&
                        decl.init &&
                        decl.init.type === 'CallExpression' &&
                        decl.init.callee.type === 'FunctionExpression') {
                        console.log('// inlining var decl iife');
                        body.push(inlineVarIffe(decl, scope));
                    } else {
                        remain.push(decl);
                    }
                }
                if (remain.length) {
                    body.unshift({
                        type: 'VariableDeclaration',
                        kind: 'var',
                        declarations: remain
                    });
                }
                return block.oneOrWrap(body);
            }

            // foo = iife();
            if (node.type === 'ExpressionStatement' &&
                node.expression.type === 'AssignmentExpression' &&
                node.expression.operator === '=' &&
                node.expression.right.type === 'CallExpression' &&
                node.expression.right.callee.type === 'FunctionExpression') {
                console.log('// inlining assign iife');
                return inlineAssignIIFE(
                    node.expression.left.name,
                    node.expression.right,
                    scope);
            }

            return node;
        },

        leave: function leave(node, parent) {
            scope.leave(node, parent);
            return node;
        }
    });

    console.log('// post iife block flatten');
    ast = block.flatten(ast);

    return ast;
}

function inlineVarIffe(decl, scope) {
    var ast = inlineAssignIIFE(decl.id.name, decl.init, scope);
    ast = block.expr([{
        type: 'VariableDeclaration',
        kind: 'var',
        declarations: [{
            type: 'VariableDeclarator',
            id: {
                type: 'Identifier',
                name: decl.id.name
            },
            init: null
        }]
    }].concat(block.body(ast)));
    return ast;
}

function inlineAssignIIFE(name, iife, scope) {
    var ast = inlineIife(iife, scope, {
        return: function(arg) {
            return {
                type: 'ExpressionStatement',
                expression: {
                    type: 'AssignmentExpression',
                    operator: '=',
                    left: {
                        type: 'Identifier',
                        name: name
                    },
                    right: arg
                }
            };
        }
    });
    return ast;
}

function inlineIife(node, scope, replacement) {
    var callArgs = node.arguments;
    var func = node.callee;
    var body = func.body;
    var funcParams = func.params;
    var funcName = scope.uniqueName(func.id && func.id.name || 'anon');

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

    console.log('// prefixing iife variables');
    ast = scopeMod.prefixDirectVars(ast, funcName + '_', scope);

    if (replacement) {
        console.log('// replacing iife exits');
        ast = exits.replace(ast, replacement);
    }

    return ast;
}

module.exports = reduceIife;
