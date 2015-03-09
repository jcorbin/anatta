var estraverse = require('estraverse');

function blockExpr(body) {
    if (!Array.isArray(body)) {
        body = [body];
    }
    if (body.length === 1 && body[0].type === 'BlockStatement') {
        return body[0];
    } else {
        return {
            type: 'BlockStatement',
            body: body
        };
    }
}

function blockBody(node) {
    if (node.type === 'BlockStatement') {
        return node.body;
    } else {
        return [node];
    }
}

function oneOrWrap(body) {
    if (!Array.isArray(body)) {
        return body;
    }
    if (body.length > 1) {
        return {
            type: 'BlockStatement',
            body: body
        };
    } else {
        return body[0];
    }
}

function flattenBlock(node) {
    if (node.type !== 'BlockStatement') return node;
    var body = [].concat(node.body);
    for (var i = 0; i < body.length; i++) {
        if (body[i].type === 'BlockStatement') {
            body.splice.apply(body, [i, 1].concat(body[i].body));
        }
    }
    return blockExpr(body);
}

function flatten(ast) {
    return estraverse.replace(ast, {
        enter: flattenBlock
    });
}

module.exports.expr = blockExpr;
module.exports.body = blockBody;
module.exports.oneOrWrap = oneOrWrap;
module.exports.flattenBlock = flattenBlock;
module.exports.flatten = flatten;
