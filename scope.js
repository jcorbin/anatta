var estraverse = require('estraverse');

function scopeVisitor() {
    var self = {
        vars: Object.create(null),

        enter: function enter(node) {
            switch (node.type) {
                case 'FunctionExpression':
                    self.push(node);
                    break;
                case 'VariableDeclarator':
                    self.vars[node.id.name] = true;
                    break;
            }
        },

        leave: function leave(node) {
            if (node.type === 'FunctionExpression') {
                self.pop();
            }
        },

        push: function push(node) {
            self.vars = Object.create(self.vars);
            for (var i = 0; i < node.params.length; i++) {
                self.vars[node.params[i].name] = true;
            }
        },

        pop: function pop() {
            self.vars = Object.getPrototypeOf(self.vars);
        },

        uniqueName: function uniqueName(name) {
            if (self.vars[name]) {
                var i = 1;
                var key;
                do {
                    key = name + '_' + (++i);
                } while (self.vars[key]);
                name = key;
            }
            self.vars[name] = true;
            return name;
        }
    };

    return self;
}

function prefixDirectVars(ast, prefix, scope) {
    var rewrite = toplevelReplacer.mapper();

    ast = estraverse.replace(ast, {
        enter: function enter(node, parent) {
            var self = this;

            switch (node.type) {
                case 'FunctionExpression':
                    return self.skip();

                case 'VariableDeclarator':
                    var newName = scope.uniqueName(prefix + node.id.name);
                    rewrite.map[node.id.name] = newName;
                    node.id = {
                        type: 'Identifier',
                        name: newName
                    };
                    return node;

                default:
                    return rewrite(node, parent);
            }
        }
    });

    // console.log('PREFIXED', require('escodegen').generate(ast));
    // console.log('PREFIXED', require('util').inspect(ast, {depth: Infinity}));
    return ast;
}

function toplevelReplacer(handle) {
    return function replace(node, parent) {
        switch (node.type) {
            case 'MemberExpression':
                if (node.object.type === 'Identifier') {
                    node.object = handle(node.object, node);
                }
                break;
            case 'Identifier':
                switch (parent.type) {
                    case 'Property':
                    case 'MemberExpression':
                    case 'FunctionExpression':
                        return node;
                }
                return handle(node, parent);
        }
        return node;
    };
}

toplevelReplacer.mapper = function replacerFromMap(map) {
    var self = toplevelReplacer(function replace(node) {
        if (self.map[node.name]) {
            return {
                type: 'Identifier',
                name: self.map[node.name]
            };
        } else {
            return node;
        }
    });
    self.map = map || {};
    return self;
};

module.exports.visitor = scopeVisitor;
module.exports.prefixDirectVars = prefixDirectVars;
module.exports.toplevelReplacer = toplevelReplacer;
