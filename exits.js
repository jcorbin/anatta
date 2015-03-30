var estraverse = require('estraverse');
var match = require('pattern-match');

var block = require('./block');

var returnArg = {
    type: 'ReturnStatement',
    argument: match.var('arg')
};

function exits(ast) {
    var returns = [];

    estraverse.traverse(ast, {
        enter: function(node) {
            match(node, function(when) {
                when(returnArg, function(m) {
                    returns.push(m.arg);
                });

                when(match.any);
            });
        }
    });

    return {
        // TODO throws:
        returns: returns
    };
}

function replaceExits(ast, template) {
    var loopStack = [];
    var sym = 0;

    var visitor = {
        enter: function(node) {
            if ((node.type === 'ForStatement' ||
                 node.type === 'WhileStatement'
                ) && !node.exitSym) {
                loopStack.push({
                    sym: node.exitSym = 'loop_exit_' + (++sym),
                    needLabel: false,
                    used: 0
                });
            }

            return match(node, function(when) {
                when(returnArg, function(m) {
                    var ret = template.return(m.arg);
                    ret.wasFinal = true;
                    var loop = loopStack[0];
                    if (loop) {
                        if (loopStack.length > 1) loop.needLabel = true;
                        loop.used++;
                        ret = block.expr([ret, {
                            type: 'BreakStatement',
                            label: loop.needLabel ? {
                                type: 'Identifier',
                                name: loop.sym
                            } : null
                        }]);
                    }
                    return ret;
                });

                when(match.any, function() {return node;});
            });
        },
        leave: function(node, parent) {
            if (node.wasFinal) parent.wasFinal = true;

            if (node.type === 'ForStatement' ||
                node.type === 'WhileStatement') {
                var loop = loopStack.pop();
                if (loop && loop.needLabel) {
                    node = {
                        type: 'LabeledStatement',
                        label: {
                            type: 'Identifier',
                            name: loop.sym,
                        },
                        body: node
                    };
                }
                return node;
            }

            if (node.type !== 'BlockStatement') return node;
            var body = node.body;
            for (var i = 0; i < body.length; i++) {
                if (body[i].type === 'IfStatement' &&
                    body[i].wasFinal) {
                    var finalIf = body[i];
                    var head = body.slice(0, i+1);
                    var tail = body.splice(i+1, body.length-1);
                    if (finalIf.alternate) {
                        tail = block.body(finalIf.alternate).concat(tail);
                    }
                    finalIf.consequent = block.expr(finalIf.consequent);
                    finalIf.alternate = block.expr(tail);
                    // finalIf.alternate = estraverse.replace(finalIf.alternate, visitor);
                    var ret = block.oneOrWrap(head);
                    return ret;
                }
            }

            return node;
        }
    };
    return estraverse.replace(ast, visitor);
}

module.exports = exits;
module.exports.replace = replaceExits;
