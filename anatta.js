// var es6Map = require('es6-map');

var astify = require('./astify');
var splatThis = require('./splat_this');
var freeVariables = require('./free_variables');
var block = require('./block');
var reduceIife = require('./reduce_iife');
var expandObjExp = require('./expand_obj_expr');
var inlineObjectMembers = require('./inline_object_members');
var pruneDead = require('./prune_dead');

function anatta(obj, name, filter) {
    var deps = {};
    var scope = {};

    // TODO: enable, confusing for now
    // var memo = es6Map();
    // var reify = memoReify;
    var reify = _astify;

    // function memoReify(name, val) {
    //     var prior = memo.get(val);
    //     if (prior) {
    //         console.log('PRIOR GOT', prior, 'FOR', name, val);
    //         return prior;
    //     }
    //     var ast = _reify(name, val);
    //     memo.set(val, ast);
    //     return ast;
    // }

    var ast = _compile(name || '', obj);

    ast = expandObjExp(ast, filter);

    var freeVars = {};
    freeVariables.each(ast, function eachFreeVar(node) {
        freeVars[node.name] = true;
    });

    var declKeys = Object.keys(scope).filter(function(key) {
        return Boolean(freeVars[key]);
    });

    var decls = declKeys.map(function(key) {
        delete freeVars[key];
        return {
            type: 'VariableDeclarator',
            id: {
                type: 'Identifier',
                name: key
            },
            init: scope[key]
        };
    });

    if (decls.length) {
        ast = block.expr(ast);
        ast.body.unshift({
            type: 'VariableDeclaration',
            kind: 'var',
            declarations: decls
        });
    }

    ast.deps = deps;
    return ast;

    function _compile(prefix, obj) {
        var ast = astify(obj);
        var localDeps = {};
        // scope = Object.create(scope);

        ast = splatThis(ast, obj, function handleThisProp(name, val) {
            if (prefix) {
                name = prefix + '_' + name;
                // name[0].toUpperCase() + name.slice(1);
            }
            // console.log('HANDLE', name);
            if (!scope[name]) {
                if (val === undefined) {
                    scope[name] = {type: 'Identifier', name: 'undefined'};
                } else if (val === null) {
                    scope[name] = {type: 'Literal', value: null, raw: 'null'};
                } else {
                    scope[name] = reify(name, val);
                }
            }
            return name;
        });

        // console.log('SPLATED', require('escodegen').generate(ast));
        // console.log('SPLATED', require('util').inspect(ast, {depth: Infinity}));

        var resolved = 0;
        do {
            var res = resolveFreeVariables(ast);
            resolved = res[0];
            ast = res[1];
            ast = inlineObjectMembers(ast);
            ast = pruneDead(ast);

            // console.log('ROUND', require('escodegen').generate(ast));
            // console.log('ROUND', require('util').inspect(ast, {depth: Infinity}));

        } while (resolved);

        ast = reduceIife(ast);

        // console.log('REDUCED', require('escodegen').generate(ast));
        // console.log('REDUCED', require('util').inspect(ast, {depth: Infinity}));

        // var inner = scope;
        // console.log('POP', prefix, Object.keys(inner));
        // scope = Object.getPrototypeOf(scope);

        return ast;

        function resolveFreeVariables(ast) {
            var resolved = 0;
            ast = freeVariables.replace(ast, function eachFreeVar(node) {
                var last;
                do {
                    last = node;
                    node = resolve(node);
                    if (last !== node) ++resolved;
                } while (node.type === 'Identifier' && node !== last);
                return node;
            });
            return [resolved, ast];
        }

        function resolve(id) {
            if (scope[id.name] !== undefined) {
                // console.log('SCOPE', id.name, '=>', scope[id.name]);
                return scope[id.name];
            }
            if (localDeps[id.name] !== undefined) {
                // console.log('LOCAL CACHED', id.name, '=>', localDeps[id.name]);
                return localDeps[id.name];
            }

            var match = /^_instanceDeps\$(.+)\$(.+)$/.exec(id.name);
            if (match) {
                var cons = match[1];
                var prop = match[2];
                deps[id.name] = findInstanceDep(cons, prop, obj);
                localDeps[id.name] = id;
                return id;
            }

            var res = findConstructorProperty(id.name, obj);
            if (res) {
                var depKey = res[0] + '_' + id.name;
                deps[depKey] = res[1];
                localDeps[id.name] = {type: 'Identifier', name: depKey};
                // console.log('LOCAL', id.name, '=>', localDeps[id.name]);
                return localDeps[id.name];
            }

            // console.log('UNBOUND', id.name);

            return id;
        }
    }

    function _astify(name, val) {
        if (typeof val === 'object') {
            if (Array.isArray(val)) {
                return {
                    type: 'ArrayExpression',
                    elements: val.map(function(subval, i) {
                        var subname = name + String(i);
                        return _compile(subname, subval);
                    })
                };
            } else {
                return _compile(name, val);
            }
        } else {
            return astify(val);
        }
    }
}

function findInstanceDep(cons, prop, obj) {
    while (obj && obj.constructor) {
        if (obj.constructor.name === cons &&
            obj.constructor.instanceDeps[prop]) {
            return obj[prop];
        }
        obj = Object.getPrototypeOf(obj);
    }
    return null;
}

function findConstructorProperty(prop, obj) {
    while (obj && obj.constructor) {
        var val = obj.constructor[prop];
        if (val !== undefined && val !== null) {
            return [obj.constructor.name, val];
        }
        obj = Object.getPrototypeOf(obj);
    }
    return null;
}

module.exports = anatta;
