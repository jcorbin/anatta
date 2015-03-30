var estraverse = require('estraverse');
var inspect = require('util').inspect;

var freeSelf = require('./free_self');
var freeVariables = require('./free_variables');
var unrolled = require('./unrolled');

function splatThis(ast, thisObj, handle) {
    var selfs = [];
    ast = freeSelf(selfs, ast);
    var isSelf = {'this': true};
    for (var i = 0; i < selfs.length; i++) isSelf[selfs[i]] = true;

    var got, res;
    do {
        got = 0;

        res = resolveRefs(ast);
        got += res[0];
        ast = res[1];
        console.log('resolved refs', res[0]);

        res = unrollLoops(ast);
        got += res[0];
        ast = res[1];
        console.log('unrolled loops', res[0]);

        res = unaliasLiterals(ast);
        got += res[0];
        ast = res[1];
        console.log('unaliased', res[0]);
    } while (got);

    ast = estraverse.replace(ast, {
        leave: function onLeave(node) {
            if (node.type === 'Literal' && node.marked) {
                return handle(node.name, node.value);
            }
        }
    });

    // console.log('SPLATTED', require('escodegen').generate(ast));
    // console.log('SPLATTED', require('util').inspect(ast, {depth: Infinity}));
    return ast;

    function resolveRefs(ast) {
        var got = 0;
        ast = estraverse.replace(ast, {
            leave: function onLeave(node, parent) {
                if (node.type === 'CallExpression' &&
                    node.callee.type === 'MemberExpression' &&
                    !node.callee.computed &&
                    node.callee.property.name === 'call' &&
                    node.arguments[0].type === 'Identifier' &&
                    isSelf[node.arguments[0].name]
                ) {
                    node.callee = node.callee.object;
                    node.arguments = node.arguments.slice(1);
                    got++;
                    return node;
                }

                if (node.type !== 'MemberExpression') return node;

                if (parent.type === 'CallExpression') {
                    if ((
                        node.property.name === 'call' ||
                        node.property.name === 'apply'
                    ) && node.object.name) {
                        node.object = handle(node.object.name, node.object.value);
                        var thatId = parent.arguments[0];
                        if (thatId.type === 'Identifier' && isSelf[thatId.name]) {
                            node.object = splatThis(node.object, thisObj, handle);
                        }
                        // else { TODO could support self member expressions }
                        got++;
                        return node;
                    }

                    else if (node.object.type === 'Literal') {
                        var that = node.object.value;
                        if (that === undefined) {
                            console.log('!!!', node);
                        }
                        var func = that[node.property.name];
                        node = handle(node.object.name + '_' + node.property.name, func);
                        node = splatThis(node, that, handle);
                        got++;
                        return node;
                    }
                }

                if (node.computed) return node;

                if (node.object.type === 'Identifier' &&
                    isSelf[node.object.name]) {
                    got++;
                    return {
                        type: 'Literal',
                        value: thisObj[node.property.name],
                        raw: '/* FIXME */',
                        marked: true,
                        name: node.property.name
                    };
                }

                else if (node.object.type === 'Literal') {
                    got++;
                    return {
                        type: 'Literal',
                        value: node.object.value && node.object.value[node.property.name],
                        raw: '/* FIXME */',
                        marked: true,
                        name: node.object.name + '_' + node.property.name
                    };
                }

                else {
                    return node;
                }
            }
        });
        return [got, ast];
    }

    function unrollLoops(ast) {
        var got = 0;
        ast = estraverse.replace(ast, {
            enter: function onLeave(node) {
                if (node.type === 'ForStatement' &&
                    node.test.type === 'BinaryExpression' && (
                    node.test.left.type === 'Literal' ||
                    node.test.right.type === 'Literal')) {

                    var refs = {};
                    var ref = 0;

                    node.body = estraverse.replace(node.body, {
                        enter: function(node) {
                            if (node.type === 'Literal' && node.marked) {
                                refs[++ref] = node.value;
                                node.value = ref;
                            }
                        }
                    });

                    node = unrolled(node);

                    node = estraverse.replace(node, {
                        enter: function(node) {
                            if (node.type === 'Literal' && node.marked) {
                                node.value = refs[node.value];
                            }
                        },
                        leave: function(node) {
                            return maybeCollapse(node);
                        }
                    });

                    got++;
                    return node;
                }
            }
        });
        return [got, ast];
    }

    function unaliasLiterals(ast) {
        var names = {};
        var vars = {};
        var got = 0;
        var replace = freeVariables.visitor(function eachFreeVar(node) {
            if (vars[node.name] !== undefined) {
                return {
                    type: 'Literal',
                    value: vars[node.name],
                    raw: '/* FIXME */',
                    marked: true,
                    name: names[node.name]
                };
            } else {
                return node;
            }
        });
        ast = estraverse.replace(ast, {
            enter: function(node, parent) {
                var self = this;
                if (node.type === 'VariableDeclarator' &&
                    node.init &&
                    node.init.type === 'Literal' &&
                    node.init.marked) {
                    vars[node.id.name] = node.init.value;
                    names[node.id.name] = node.init.name;
                    got++;
                    return self.remove();
                }
                return replace.enter.call(self, node, parent);
            },
            leave: function(node, parent) {
                var self = this;
                replace.leave.call(self, node, parent);
                if (node.type === 'VariableDeclaration' && !node.declarations.length) {
                    return self.remove();
                } else {
                    return maybeCollapse(node);
                }
            }
        });
        return [got, ast];
    }

    function maybeCollapse(node) {
        if (node.type === 'MemberExpression' &&
            node.object.type === 'Literal' &&
            node.property.type === 'Literal') {
            return {
                type: 'Literal',
                value: node.object.value[node.property.value],
                raw: '/* FIXME */',
                marked: true,
                name: node.object.name + '_' + node.property.value
            };
        }
        return node;
    }
}

module.exports = splatThis;
