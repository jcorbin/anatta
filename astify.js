var esprima = require('esprima');

function astify(o) {
    if (o === undefined) {
        return {
            type: 'Identifier',
            name: 'undefined'
        };
    } else if (o === null) {
        return {
            type: 'Literal',
            value: null,
            raw: 'null'
        };
    } else if (Array.isArray(o)) {
        return {
            type: 'ArrayExpression',
            elements: o.map(astify)
        };
    } else if (typeof o === 'function') {
        var ast = esprima.parse('(' + o + ')');
        ast = ast.body[0].expression;
        return ast;
    } else if (typeof o === 'object') {
        var props = [];
        for (var prop in o) {
            if (Object.prototype[prop] !== o) {
                props.push({
                    type: 'Property',
                    key: {type: 'Identifier', name: prop},
                    value: astify(o[prop]),
                    kind: 'init'
                });
            }
        }
        return {
            type: 'ObjectExpression',
            properties: props
        };
    } else {
        return {
            type: 'Literal',
            value: o,
            raw: JSON.stringify(o)
        };
    }
}

module.exports = astify;
