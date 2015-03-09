var match = require('pattern-match');

var block = require('./block');
var freeVariables = require('./free_variables');

function expandObjExp(ast, filter) {
    var freeVars = {};
    freeVariables.each(ast, function eachFreeVar(node) {
        freeVars[node.name] = true;
    });

    // console.log('freeVars', freeVars);
    // console.log('expand', require('util').inspect(ast, {depth: Infinity}));

    ast = match(ast).when({
        type: 'ObjectExpression',
        properties: match.var('props')
    }, function(m) {
        var decls = [];
        var funcs = [];
        var obj = {
            type: 'ObjectExpression',
            properties: []
        };

        m.props.forEach(function(prop) {
            var sym = {
                type: 'Identifier',
                name: prop.key.name
            };

            if (!filter || filter(prop)) {
                obj.properties.push({
                    type: 'Property',
                    key: {
                        type: 'Identifier',
                        name: prop.key.name
                    },
                    value: prop.value
                });
            } else if (freeVars[sym.name]) {
                decls.push({
                    type: 'VariableDeclarator',
                    id: sym,
                    init: prop.value
                });
            }
        });

        var body = [];

        if (decls.length) {
            body.push({
                type: 'VariableDeclaration',
                kind: 'var',
                declarations: decls
            });
        }

        if (funcs.length) {
            body = body.concat(funcs);
        }

        body.push(obj);

        return block.oneOrWrap(body);
    });

    return ast;
}

module.exports = expandObjExp;
