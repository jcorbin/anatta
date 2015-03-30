var escodegen = require('escodegen');
var estraverse = require('estraverse');
var match = require('pattern-match');
var deepCopy = require('deep-copy');

var block = require('./block');

function unrolled(ast) {
    var sym = ast.update.argument;

    // console.log('UNROLL', require('escodegen').generate(ast));
    var tmp = ast.body;
    // console.log('UNROLL BODY', require('util').inspect(tmp, {depth: Infinity}));

    ast.body = {
        type: 'CallExpression',
        callee: {type: 'Identifier', name: 'each'},
        arguments: [sym]
    };

    var evil = escodegen.generate(ast);

    var body = [];
    // jshint evil:true, unused:false
    function each(i) {
        var ast = deepCopy(tmp);

        ast = estraverse.replace(ast, {
            enter: function(node, parent) {
                var self = this;
                return match(node, function(when) {
                    when({
                        type: 'FunctionExpression'
                    }, function() {return self.skip();});
                    when({
                        type: 'ContinueStatement'
                    }, function() {
                        parent.wasFinal = true;
                        return self.remove();
                    });
                    when(sym, function() {
                        parent.wasLitted = true;
                        return makeLiteral(i);
                    });
                    when(match.any, function() {return node;});
                });
            },
            leave: replaceLoopExits
        });

        body.push(ast);
    }
    eval(evil);

    ast = block.flatten(block.expr(body));
    // console.log('UNROLLED', require('escodegen').generate(ast));
    // console.log('UNROLLED', require('util').inspect(ast, {depth: Infinity}));
    return ast;
}

function replaceLoopExits(node, parent) {
    if (node.wasFinal) parent.wasFinal = true;

    if (node.type !== 'BlockStatement') return node;
    var body = node.body;
    for (var i = 0; i < body.length; i++) {
        if (body[i].type === 'IfStatement' &&
            body[i].wasFinal) {
            var finalIf = body[i];
            finalIf.wasFinal = false;
            parent.wasFinal = false;
            // console.log('REPLACING EXIT', finalIf);
            // console.log('REPLACING finalIf', require('escodegen').generate(finalIf));

            var head = body.slice(0, i+1);
            var tail = body.splice(i+1, body.length-1);

            if (!finalIf.consequent) {
                finalIf.test = {
                    type: 'UnaryExpression',
                    operator: '!',
                    argument: finalIf.test,
                    prefix: true
                };
                if (finalIf.alternate) {
                    tail = block.body(finalIf.alternate).concat(tail);
                    finalIf.alternate = null;
                }
                finalIf.consequent = block.expr(tail);
                // finalIf.consequent = estraverse.replace(finalIf.consequent, {
                //     leave: replaceLoopExits
                // });
            } else if (finalIf.consequent.wasFinal) {
                tail = block.body(finalIf.alternate).concat(tail);
                finalIf.alternate = block.expr(tail);
                // finalIf.alternate = estraverse.replace(finalIf.alternate, {
                //     leave: replaceLoopExits
                // });
            } else if (finalIf.alternate.wasFinal) {
                tail = block.body(finalIf.consequent).concat(tail);
                finalIf.consequent = block.expr(tail);
                // finalIf.consequent = estraverse.replace(finalIf.consequent, {
                //     leave: replaceLoopExits
                // });
            } else {
                // console.log('DROP', tail);
                // var ret = block.expr(head);
                // console.log('DROP WRT', require('escodegen').generate(ret));
                throw new Error('unroll broke tail');
            }

            var ret = block.expr(head);
            // console.log('REPLACED EXIT', require('escodegen').generate(ret));
            return ret;
        }
    }

    return node;
}

function makeLiteral(val) {
    return {
        type: 'Literal',
        value: val,
        raw: JSON.stringify(val)
    };
}

module.exports = unrolled;
