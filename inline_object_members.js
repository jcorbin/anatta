var estraverse = require('estraverse');
var match = require('pattern-match');

function inlineObjectMembers(ast) {
    // console.log(require('util').inspect(ast, {depth: Infinity}));
    return estraverse.replace(ast, {
        enter: function(node) {
            return match(node, function(when) {
                when({
                    type: 'MemberExpression',
                    computed: false,
                    object: {
                        type: 'ObjectExpression',
                        properties: match.var('objProps')
                    },
                    property: {
                        type: 'Identifier',
                        name: match.var('propName')
                    }
                }, function(m) {
                    var props = m.objProps;
                    for (var i = 0; i < props.length; i++) {
                        var prop = props[i];
                        if (prop.key.name === m.propName) {
                            return prop.value;
                        }
                    }
                    return {
                        type: 'Identifier',
                        name: 'undefined'
                    };
                });

                when({
                    type: 'MemberExpression',
                    computed: false,
                    object: {
                        type: 'ArrayExpression',
                        elements: match.var('elems')
                    },
                    property: {
                        type: 'Identifier',
                        name: match.var('propName')
                    }
                }, function(m) {
                    if (m.propName === 'length') {
                        return {
                            type: 'Literal',
                            value: m.elems.length,
                            raw: JSON.stringify(m.elems.length)
                        };
                    } else {
                        throw new Error('unimplemented array inline prop=' + m.propName);
                    }
                });

                when(match.any, function() {return node;});
            });
        }
    });
}

module.exports = inlineObjectMembers;
