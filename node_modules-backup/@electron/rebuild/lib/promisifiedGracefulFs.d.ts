/// <reference types="node" resolution-mode="require"/>
import gracefulFS from 'graceful-fs';
export declare const promisifiedGracefulFs: Pick<typeof gracefulFS.promises, "copyFile" | "readFile" | "readdir" | "writeFile">;
