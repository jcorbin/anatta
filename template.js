var estraverse = require('estraverse');
var astify = require('./astify');

function template(func) {
    return function(args) {
        var tmp = astify(func).body;
        return estraverse.replace(tmp, {
            enter: function(node) {
                if (node.type === 'Identifier') {
                    if (args[node.name] !== undefined) {
                        return args[node.name];
                    }
                }
                return node;
            }
        }).body;
    };
}

module.exports = template;
