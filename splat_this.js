var estraverse = require('estraverse');
var match = require('pattern-match');

var block = require('./block');
var freeSelf = require('./free_self');
var scope = require('./scope');
var unrolled = require('./unrolled');

function splatThis(ast, thisObj, handle) {
    var selfs = [];
    ast = freeSelf(selfs, ast);

    var matchSelfIdentifier = match.some.apply(match, [
        {type: 'ThisExpression'},
    ].concat(selfs.map(function(selfName) {
        return {
            type: 'Identifier',
            name: selfName
        };
    })));

    var selfPropPattern = {
        type: 'MemberExpression',
        computed: false,
        object: match.var('self', matchSelfIdentifier),
        property: {
            type: 'Identifier',
            name: match.var('prop')
        }
    };

    var selfPropCompLitPattern = {
        type: 'MemberExpression',
        computed: true,
        object: selfPropPattern,
        property: {type: 'Literal', value: match.var('index', match.number)},
    };

    var rewrite = scope.toplevelReplacer.mapper();

    // var propStack = [];
    ast = estraverse.replace(ast, {
        enter: function onEnter(node) {
            var self = this;

            // if (parent.type === 'ArrayExpression') {
            //     propStack.push(parent.elements.indexOf(node));
            // }

            return match(node, function(when) {
                // handle prop: obj, pass prop: Func|Lit, skip else
                when({
                    type: 'Property',
                    key: {
                        type: 'Identifier',
                        name: match.var('name'),
                    },
                    value: match.var('value')
                }, function (m) {
                    // propStack.push(m.name);
                    var sym = depSym(m.name);
                    if (!sym && m.value.type === 'ObjectExpression') {
                        sym = handle(m.name, thisObj[m.name]);
                    }

                    if (sym) {
                        return {
                            type: 'Property',
                            key: node.key,
                            value: {type: 'Identifier', name: sym}
                        };
                    }

                    if (m.value.type !== 'FunctionExpression' &&
                        m.value.type !== 'Literal') {
                        return self.skip();
                    } else {
                        return node;
                    }
                });

                // inline self.foo.length for arrays
                when({
                    type: 'MemberExpression',
                    computed: false,
                    object: selfPropPattern,
                    property: { type: 'Identifier', name: 'length' }
                }, function(m) {
                    var ar = thisObj[m.prop];
                    if (Array.isArray(ar)) {
                        return makeLiteral(ar.length);
                    } else {
                        return node;
                    }
                });

                // unroll for ( ; expr(self.foo); ) ...
                when({
                    type: 'ForStatement',
                    test: {
                        // TODO too specific
                        type: 'BinaryExpression',
                        right: {
                            type: 'MemberExpression',
                            computed: false,
                            object: selfPropPattern,
                            property: { type: 'Identifier', name: 'length' }
                        }
                    }
                }, function(m) {
                    var ar = thisObj[m.prop];
                    if (Array.isArray(ar)) {
                        return unrolled(node, selfPropPattern, ar);
                    } else {
                        return node;
                    }
                });

                // inline self.foo[Number] as handle('foo_N', value)
                when(match.some(
                    {
                        type: 'VariableDeclarator',
                        init: selfPropCompLitPattern
                    },
                    selfPropCompLitPattern
                ), function(m) {
                    var val = thisObj[m.prop][m.index];
                    var sym = depSym(m.prop);
                    if (!sym) sym = handle(m.prop + '_' + m.index, val);
                    return replaceId(sym);
                });

                // inline self.foo as handle('foo', value)
                when(match.some(
                    {
                        type: 'VariableDeclarator',
                        init: selfPropPattern
                    },
                    selfPropPattern
                ), function(m) {
                    var sym = depSym(m.prop);
                    if (!sym) sym = handle(m.prop, thisObj[m.prop]);
                    return replaceId(sym);
                });

                when(match.any, function() {return node;});
            });

            function depSym(prop) {
                var cons = thisObj.constructor;
                var ideps = cons && cons.instanceDeps;
                if (ideps && ideps[prop]) {
                    return '_instanceDeps$' + cons.name + '$' + prop;
                } else {
                    return null;
                }
            }

            function replaceId(sym) {
                if (node.type === 'VariableDeclarator') {
                    rewrite.map[node.id.name] = sym;
                    return self.remove();
                } else {
                    return {type: 'Identifier', name: sym};
                }
            }
        },
        leave: function onLeave(node, parent) {
           var self = this;

            if (node.type === 'VariableDeclaration' && !node.declarations.length) {
                return self.remove();
            }

            // if (parent.type === 'ArrayExpression') {
            //     propStack.pop();
            // }

            switch (node.type) {
                // case 'Property':
                //     propStack.pop();
                //     break;

                case 'BlockStatement':
                    node = block.flatten(node);
                    break;

                default:
                    node = rewrite(node, parent);
            }

            return node;
        }
    });
    // console.log('SPLATTED', require('escodegen').generate(ast));
    // console.log('SPLATTED', require('util').inspect(ast, {depth: Infinity}));
    return ast;
}

function makeLiteral(val) {
    return {
        type: 'Literal',
        value: val,
        raw: JSON.stringify(val)
    };
}

module.exports = splatThis;
