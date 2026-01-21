"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var child_process_1 = require("child_process");
var d = require('debug')('electron-windows-installer:spawn');
// Public: Maps a process's output into an {Observable}
//
// exe - The program to execute
// params - Arguments passed to the process
// opts - Options that will be passed to child_process.spawn
//
// Returns an {Observable} with a single value, that is the output of the
// spawned process
function spawn(exe, params, opts) {
    return new Promise(function (resolve, reject) {
        var proc = null;
        d("Spawning ".concat(exe, " ").concat(params.join(' ')));
        if (!opts) {
            proc = (0, child_process_1.spawn)(exe, params);
        }
        else {
            proc = (0, child_process_1.spawn)(exe, params, opts);
        }
        // We need to wait until all three events have happened:
        // * stdout's pipe is closed
        // * stderr's pipe is closed
        // * We've got an exit code
        var rejected = false;
        var refCount = 3;
        var stdout = '';
        var release = function () {
            if (--refCount <= 0 && !rejected)
                resolve(stdout);
        };
        var bufHandler = function (chunk) {
            stdout += chunk;
        };
        proc.stdout.setEncoding('utf8').on('data', bufHandler);
        proc.stdout.once('close', release);
        proc.stderr.setEncoding('utf8').on('data', bufHandler);
        proc.stderr.once('close', release);
        proc.on('error', function (e) { return reject(e); });
        proc.on('close', function (code) {
            if (code === 0) {
                release();
            }
            else {
                rejected = true;
                reject(new Error("Failed with exit code: ".concat(code, "\nOutput:\n").concat(stdout)));
            }
        });
    });
}
exports.default = spawn;
//# sourceMappingURL=spawn-promise.js.map