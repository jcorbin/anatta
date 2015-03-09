var estraverse = require('estraverse');
var match = require('pattern-match');

var block = require('./block');
// var exits = require('./exits');
// var scopeMod = require('./scope');

var zeroLit = {
    type: 'Literal',
    value: 0
};

var falseLit = {
    type: 'Literal',
    value: false
};

var nullLit = {
    type: 'Literal',
    value: null
};

var undefId = {
    type: 'Identifier',
    name: 'undefined'
};

function replaceDead(node) {
    var self = this;
    node = match(node, function(when) {
        when({
            type: 'IfStatement',
            test: match.some(undefId, nullLit, zeroLit, falseLit)
        }, function() {
            if (node.alternate) {
                return node.alternate;
            } else {
                return self.remove();
            }
        });

        when(match.any, function() {return node;});
    });
    if (node) node = block.flattenBlock(node);
    return node;
}

function pruneDead(ast) {
    ast = estraverse.replace(ast, {
        enter: replaceDead,
        leave: replaceDead
    });
    return ast;
}

module.exports = pruneDead;
