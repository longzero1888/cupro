/**
 * Created by baidu on 15/7/21.
 */
'use strict';
var path = require('path');
var globby = require('globby');
var _ = require('lodash');
var fs = require('fs');
var escapeStrRe = require('escape-string-regexp');
var untildify = require('untildify');
var win32 = process.platform === 'win32';
var s = win32 ? '\\' : '\/';

function Environment() {
    // 存放所有子包的store
    this.store = {
        _meta: {},
        add: function (namespace, path) {
            if (this._meta[namespace]) return;
            this._meta[namespace] = {
                resolved: path,
                namespace: namespace
            };
        },
        get: function (namespace) {
            return this._meta[namespace];
        }
    };
}

// 初始化
Environment.prototype._init = function () {
    // 根据npm路径找出所有Cupro
    var cuproModules = this._findCupros(this._getNpmPaths());

    // 找出Cupro下的index.js并register
    cuproModules.forEach(function (pattern) {
        globby.sync('*/index.js', {cwd: pattern}).forEach(function (filename) {
            this._register(path.join(pattern, filename));
        }, this);
    }, this);
};

// 获取NPM的路径
Environment.prototype._getNpmPaths = function () {
    var paths = [];
    var win32 = process.platform === 'win32';

    // 以下摘自yoeman
    // Walk up the CWD and add `node_modules/` folder lookup on each level
    process.cwd().split(path.sep).forEach(function (part, i, parts) {
        var lookup = path.join.apply(path, parts.slice(0, i + 1).concat(['node_modules']));

        if (!win32) {
            lookup = '/' + lookup;
        }

        paths.push(lookup);
    });

    // Adding global npm directories
    // We tried using npm to get the global modules path, but it haven't work out
    // because of bugs in the parseable implementation of `ls` command and mostly
    // performance issues. So, we go with our best bet for now.
    if (process.env.NODE_PATH) {
        paths = _.compact(process.env.NODE_PATH.split(path.delimiter)).concat(paths);
    } else {
        // global node_modules should be 5 directory up this one (most of the time)
        paths.push(path.join(__dirname, '../../../..'));

        // adds support for generator resolving when yeoman-generator has been linked
        paths.push(path.join(path.dirname(process.argv[1]), '../..'));

        // Default paths for each system
        if (win32) {
            paths.push(path.join(process.env.APPDATA, 'npm/node_modules'));
        } else {
            paths.push('/usr/lib/node_modules');
            paths.push('/usr/local/lib/node_modules');
        }
    }
    return paths.reverse();

};

// 找出所有Cupro
Environment.prototype._findCupros = function (searchPaths) {
    var modules = [];

    searchPaths.forEach(function (root) {
        if (!root) {
            return;
        }
        modules = globby.sync([
            'cupro-*'
        ], {cwd: root}).map(function (match) {
            return path.join(root, match);
        }).concat(modules);
    });

    return modules;
};

// 注册所有Cupro
Environment.prototype._register = function (cuproReference) {

    var realPath = fs.realpathSync(cuproReference);
    var namespace = this._namespace(cuproReference);

    if (!_.isString(realPath)) {
        return this.error(new Error('You must provide a generator name to register.'));
    }

    if (realPath[0] === '.') {
        realPath = path.resolve(realPath);
    }
    if (path.extname(realPath) === '') {
        realPath += path.sep;
    }
    require.resolve(untildify(realPath));

    this.store.add(namespace, realPath);
};

// 根据路径解析出namespace
Environment.prototype._namespace = function (filepath) {
    if (!filepath) {
        throw new Error('Missing namespace');
    }

    // cleanup extension and normalize path for differents OS
    var ns = path.normalize(filepath.replace(new RegExp(escapeStrRe(path.extname(filepath)) + '$'), ''));


    var folders = ns.split(path.sep);
    var scope = _.findLast(folders, function (folder) {
        return folder.indexOf('@') === 0;
    });

    // cleanup `ns` from unwanted parts and then normalize slashes to `:`
    ns = ns
        .replace(/(.*cupro-)/, '') // remove before `cupro-`
        .replace(/[\/\\](index|main|app)$/, '') // remove `/index` or `/main` pr '/app'
        .replace(/^[\/\\]+/, '') // remove leading `/`
        .replace(/\/app/, '') // replace /app by
        .replace(/\\app/, ''); // replace \app

    if (scope) {
        ns = scope + '/' + ns;
    }
    return ns;

};

// 执行方法
Environment.prototype.lookup = function (args) {
    var cupro = args[0];
    var divName = args[1];
    var temp = this.store.get(cupro);
    if (temp) {
        var path = temp.resolved;
        var navigate = require(path);
        navigate.do(divName);
    } else {
        console.log('no such cupro called "' + cupro + '"');
    }

};

// 创建所有安装过的tpl
Environment.prototype.createTpl = function (args) {
    var dirName0 = args[0] || 'tpl';
    fs.mkdirSync(dirName0);
    var cupros = this.store._meta;
    for (var i in cupros) {
        var navigate = require(cupros[i].resolved);
        var tpl = navigate.getTpl();
        // 判断文件是否存在
        var dirName1 = dirName0 + s +i;
        if(!fs.existsSync(dirName1)){
            fs.mkdirSync(dirName1);
        }
        for (var j in tpl) {
            // 再创建所有tpl
            var dirName2 = dirName1 + s + tpl[j];
            // 如果tpl不存在再执行创建
            if(!fs.existsSync(dirName2)){
                (function (path) {
                    fs.writeFile(path, '', 'utf-8', function (err) {
                        if (err) throw err;
                        console.log(path + ' success!');
                    });
                })(dirName2);
            }
        }
    }
};


module.exports = (function () {
    var env = new Environment();
    env._init();
    return env;
})();
