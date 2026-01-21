import gracefulFS from 'graceful-fs';
import { promisify } from 'node:util';
export const promisifiedGracefulFs = {
    copyFile: promisify(gracefulFS.copyFile),
    readFile: promisify(gracefulFS.readFile),
    readdir: promisify(gracefulFS.readdir),
    writeFile: promisify(gracefulFS.writeFile),
};
//# sourceMappingURL=promisifiedGracefulFs.js.map