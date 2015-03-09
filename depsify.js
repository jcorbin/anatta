var assert = require('assert');

var block = require('./block');
var freeVariables = require('./free_variables');
var template = require('./template');

var depTemplate = template(function($deps, $lit) {
    var $sym = $deps.$sym;
    if (!$sym) throw new Error('missing dependency ' + $lit);
});

function depsify(ast, name) {
    var deps = ast.deps || {};

    var freeVars = {};
    freeVariables.each(ast, function eachFreeVar(node) {
        if (node.name === 'undefined') return;
        if (global[node.name] !== undefined) return;
        freeVars[node.name] = true;
    });
    assert.ok(!freeVars.deps, 'deps not unused'); // TODO could pick another
    var body = block.body(ast);

    var freeKeys = Object.keys(freeVars);
    for (var i = freeKeys.length; --i >= 0; ) {
        var key = freeKeys[i];
        body = depTemplate({
            $sym: {type: 'Identifier', name: key},
            $lit: {type: 'Literal', value: key, raw: JSON.stringify(key)},
            $deps: {type: 'Identifier', name: 'deps'}
        }).concat(body);
        if (deps[key] === undefined) deps[key] = null;
    }

    if (body[body.length-1].type !== 'ReturnStatement') {
        body[body.length-1] = {
            type: 'ReturnStatement',
            argument: body[body.length-1]
        };
    }

    ast = {
        type: 'FunctionExpression',
        id: name ? {
            type: 'Identifier',
            name: name
        }: null,
        params: [
            {
                type: 'Identifier',
                name: 'deps'
            }
        ],
        defaults: [],
        rest: null,
        generator: false,
        expression: false,
        body: block.expr(body),
        deps: deps
    };

    return ast;
}

module.exports = depsify;
