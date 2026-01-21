"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("util");
const errors = require("./errors");
module.exports = require("./native.node")(Object.assign({ newFormattedTypeError(expected, actual) {
        return new TypeError(`Expected ${expected}; got ${util_1.inspect(actual)}`);
    } }, errors));
{
    const _StringEncoding = module.exports.StringEncoding;
    Object.defineProperties(_StringEncoding.prototype, {
        equals: {
            value: function equals(other) {
                return this === other || (other instanceof _StringEncoding && (this.cfStringEncoding === other.cfStringEncoding ||
                    this.name === other.name));
            }
        }
    });
}
//# sourceMappingURL=native.js.map