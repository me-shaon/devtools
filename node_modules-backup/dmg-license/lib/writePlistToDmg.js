"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ChildProcesses = require("child_process");
const Plist = require("plist");
function writePlist(plist, to) {
    return new Promise((resolve, reject) => {
        const pls = Plist.build(plist);
        to.write(pls, "UTF-8", error => {
            if (error)
                reject(error);
            else
                to.end(resolve);
        });
    });
}
async function writePlistToDmg(imagePath, plist) {
    const child = ChildProcesses.spawn("hdiutil", ["udifrez", "-xml", "/dev/fd/3", imagePath, imagePath], {
        stdio: ["inherit", "ignore", "inherit", "pipe"]
    });
    const childPromise = new Promise((resolve, reject) => {
        let exited = false;
        const timeout = setTimeout(() => {
            if (!exited && !child.killed) {
                child.kill();
                reject(new Error("Timed out waiting for child process."));
            }
        }, 10000);
        child.on("error", error => {
            exited = true;
            clearTimeout(timeout);
            child.unref();
            reject(error);
        });
        child.on("exit", code => {
            exited = true;
            clearTimeout(timeout);
            child.unref();
            if (code) {
                reject(new Error(`Child process exited with code ${code}.`));
            }
            else {
                resolve();
            }
        });
    });
    const writing = writePlist(plist, child.stdio[3]);
    await Promise.all([childPromise, writing]);
}
exports.default = writePlistToDmg;
//# sourceMappingURL=writePlistToDmg.js.map