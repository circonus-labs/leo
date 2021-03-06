var async = require('async');
var child_process = require('child_process');
var fs = require('fs');
var path = require('path');
var url = require('url');

var nadURL = "http://updates.circonus.net/node-agent/packages/";

module.exports = function Nad() {
    this.checkType = "json";

    this.isDefault = false;
    this.displayname = "Node.js Agent";
    this.description = "CPU, disk, memory, and network metrics via Node.js Agent for freebsd";

    this.defaultMetrics = {
        "nad": ["cpu`idle`steal", "cpu`kernel", "cpu`user", "cpu`wait_io", "disk`vtbd0`nread", "disk`vtbd0`nwritten", "disk`vtbd0`reads", "disk`vtbd0`writes", "fs`/`df_used_inode_percent", "fs`/`df_used_percent", "fs``used_inode_percent", "fs`/`used_percent", "if`em0`in_bytes", "if`em0`in_errors", "if`em0`out_bytes", "if`em0`out_errors", "vm`memory`total", "vm`memory`used", "vm`swap`free", "vm`swap`used"]
    };

    this.defaultGraphs = [
        {
            "title": "CPU Usage - ",
            "datapoints": [
                { "bundle": "nad", "metric_name": "cpu`idle`steal", "derive": "counter", "name": "Idle Steal"},
                { "bundle": "nad", "metric_name": "cpu`kernel", "derive": "counter", "name": "Kernel" },
                { "bundle": "nad", "metric_name": "cpu`user", "derive": "counter", "name": "User" },
                { "bundle": "nad", "metric_name": "cpu`wait_io", "derive": "counter", "name": "I/O Wait"},
            ]
        },
	{
	    "title": "Memory - ",
	    "datapoints": [
		{ "bundle": "nad", "metric_name": "vm`memory`total", "name": "Memory Total"},
		{ "bundle": "nad", "metric_name": "vm`memory`used", "name": "Memory Used"},
		{ "bundle": "nad", "metric_name": "vm`swap`free", "name": "Swap Free"},
		{ "bundle": "nad", "metric_name": "vm`swap`used", "name": "Swap Used"}
	    ]
	},
	{
	    "title": "Disks - ",
	    "datapoints": [
		{ "bundle": "nad", "metric_name": "disk`vtbd0`nread", "name": "Disk Nread"},
		{ "bundle": "nad", "metric_name": "disk`vtbd0`nwritten", "name": "Disk Nwritten"},
		{ "bundle": "nad", "metric_name": "disk`vtbd0`reads", "name": "Disk Reads"},
		{ "bundle": "nad", "metric_name": "disk`vtbd0`writes", "name": "Disk Writes"}
	   ]
	},
	{
	    "title": "Network - ",
	    "datapoints": [
		{ "bundle": "nad", "metric_name": "if`em0`in_bytes", "derive": "counter", "name": "Em In Bytes"},
		{ "bundle": "nad", "metric_name": "if`em0`in_errors", "derive": "counter", "name": "Em In Errors"},
		{ "bundle": "nad", "metric_name": "if`em0`out_bytes", "derive": "counter", "name": "Em Out Bytes"},
		{ "bundle": "nad", "metric_name": "if`em0`out_errors", "derive": "counter", "name": "Em Out Errors"}
            ]
	},
	{
	    "title": "File Systems -",
	    "datapoints": [
		{ "bundle": "nad", "metric_name": "fs`/`used_inode_percent", "name": "Fs '/' Used Inode Percent"},
 	    	{ "bundle": "nad", "metric_name": "fs`/`df_used_inode_percent", "name": "Fs '/' df Used Inode Percent"},
		{ "bundle": "nad", "metric_name": "fs`/`used_percent", "name": "Fs '/' Used Percent"},  
		{ "bundle": "nad", "metric_name": "fs`/`df_used_percent", "name": "Fs '/' df Used Percent"}
	    ]
	}
    ];

    this.scripts = [
        { "prefix": "cpu", "filename": "cpu.sh" },
        { "prefix": "disk", "filename": "disk.elf" },
        { "prefix": "fs", "filename": "fs.elf" },
        { "prefix": "if", "filename": "if.sh" },
        { "prefix": "vm", "filename": "vm.sh" }
    ];

    this.initialize = function(callback) {
        this.availableCheckBundles = {"nad": { "metrics": [] }};

        async.series([
            this.super.initialize.bind(this),
            this.getNadPath.bind(this),
            this.getMetricsFromScriptOutput.bind(this)
        ], callback);
    };

    this.getNadPath = function(callback) {
        var self = this;
        var nadConfig = self.componentConfig();

        nadConfig.path = nadConfig.path || "/opt/circonus";

        if(!fs.existsSync(nadConfig.path) || !fs.existsSync(path.join(nadConfig.path, "sbin", "nad"))) {
            var prompttext = util.format("Node.js Agent not found at %s.\n" +
                                         "If nad is not installed, please visit %s and download the correct package for your platform.\n" +
                                         "If nad is installed in another location, enter that location.",
                                         nadConfig.path, nadURL)

            interrogator.question({"description": prompttext, "type": interrogator.filepath, "required": true}, function(err, answer) {
                nadConfig.path = answer;
                return callback(err);
            });
        }

        return callback(null);
    };

    this.getMetricsFromScriptOutput = function(callback) {
        var self = this;
        var bundle = self.availableCheckBundles.nad;
        var nadConfig = self.componentConfig();

        async.each(this.scripts, function(script, callback) {
            var scriptPath = path.join(nadConfig.path, "etc", "node-agent.d", script.filename);
            var proc = child_process.spawn(scriptPath);
            script.buffer = "";

            proc.stdout.on('data', function(data) {
                script.buffer = script.buffer + data;
                var lines = script.buffer.split(/\r?\n/);
                script.buffer = lines.pop();

                lines.forEach(function(line) {
                    var lineVars = line.split(/\s+/);
                    bundle.metrics.push(script.prefix + "`" + lineVars[0]);
                });
            });

            proc.stdout.on('close', function(code) {
                if(code != 0) {
                    return callback(util.format("%s exited with status %s", scriptPath, code));
                }

                return callback();
            });

            proc.stdin.end();
        }, callback);
    };

    this.getBundleConfig = function(bundle) {
        return { "url": url.format({"protocol": "http", "hostname": this.config.target}), "port": 2609 };
    };
};
