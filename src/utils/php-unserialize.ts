/**
 * PHP unserialize utilities — parses PHP serialize() output
 * and formats it as print_r() or var_dump() text.
 */

/** Discriminated union representing all PHP serializable types. */
export type PhpValue =
  | { type: "string"; value: string }
  | { type: "int"; value: number }
  | { type: "float"; value: number }
  | { type: "bool"; value: boolean }
  | { type: "null" }
  | { type: "array"; entries: Array<{ key: PhpValue; value: PhpValue }> }
  | {
      type: "object";
      className: string;
      properties: Array<{ key: PhpValue; value: PhpValue }>;
    };

class PhpUnserializeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhpUnserializeError";
  }
}

/** Recursive-descent parser for the PHP serialize format. */
class Parser {
  private pos = 0;
  private readonly parsedValues: PhpValue[] = [];
  private readonly utf8Encoder = new TextEncoder();

  constructor(private input: string) {}

  parse(): PhpValue {
    const value = this.readValue();
    if (this.pos !== this.input.length) {
      throw new PhpUnserializeError(
        `Unexpected trailing characters at position ${this.pos}`,
      );
    }
    return value;
  }

  private readValue(): PhpValue {
    if (this.pos >= this.input.length) {
      throw new PhpUnserializeError("Unexpected end of input");
    }

    const type = this.input[this.pos];

    switch (type) {
      case "s":
        return this.readString();
      case "i":
        return this.readInt();
      case "d":
        return this.readFloat();
      case "b":
        return this.readBool();
      case "N":
        return this.readNull();
      case "a":
        return this.readArray();
      case "O":
        return this.readObject();
      case "r":
      case "R":
        return this.readReference();
      default:
        throw new PhpUnserializeError(
          `Unknown type "${type}" at position ${this.pos}`,
        );
    }
  }

  private expect(char: string) {
    if (this.input[this.pos] !== char) {
      throw new PhpUnserializeError(
        `Expected "${char}" at position ${this.pos}, got "${this.input[this.pos]}"`,
      );
    }
    this.pos++;
  }

  private readUntil(char: string): string {
    const start = this.pos;
    while (this.pos < this.input.length && this.input[this.pos] !== char) {
      this.pos++;
    }
    if (this.pos >= this.input.length) {
      throw new PhpUnserializeError(
        `Expected "${char}" but reached end of input`,
      );
    }
    return this.input.slice(start, this.pos);
  }

  private readString(registerValue: boolean = true): PhpValue {
    this.expect("s");
    this.expect(":");
    const lenStr = this.readUntil(":");
    const len = parseInt(lenStr, 10);
    if (isNaN(len)) {
      throw new PhpUnserializeError(`Invalid string length: "${lenStr}"`);
    }
    this.expect(":");
    this.expect('"');
    const value = this.readUtf8ByteLengthString(len);
    this.expect('"');
    this.expect(";");
    const parsed: PhpValue = { type: "string", value };
    if (registerValue) {
      this.parsedValues.push(parsed);
    }
    return parsed;
  }

  private readInt(registerValue: boolean = true): PhpValue {
    this.expect("i");
    this.expect(":");
    const numStr = this.readUntil(";");
    this.expect(";");
    const value = parseInt(numStr, 10);
    if (isNaN(value)) {
      throw new PhpUnserializeError(`Invalid integer value: "${numStr}"`);
    }
    const parsed: PhpValue = { type: "int", value };
    if (registerValue) {
      this.parsedValues.push(parsed);
    }
    return parsed;
  }

  private readFloat(): PhpValue {
    this.expect("d");
    this.expect(":");
    const numStr = this.readUntil(";");
    this.expect(";");

    let value: number;
    if (numStr === "INF") value = Infinity;
    else if (numStr === "-INF") value = -Infinity;
    else if (numStr === "NAN") value = NaN;
    else {
      value = parseFloat(numStr);
      if (isNaN(value)) {
        throw new PhpUnserializeError(`Invalid float value: "${numStr}"`);
      }
    }
    const parsed: PhpValue = { type: "float", value };
    this.parsedValues.push(parsed);
    return parsed;
  }

  private readBool(): PhpValue {
    this.expect("b");
    this.expect(":");
    const val = this.readUntil(";");
    this.expect(";");
    if (val !== "0" && val !== "1") {
      throw new PhpUnserializeError(`Invalid boolean value: "${val}"`);
    }
    const parsed: PhpValue = { type: "bool", value: val === "1" };
    this.parsedValues.push(parsed);
    return parsed;
  }

  private readNull(): PhpValue {
    this.expect("N");
    this.expect(";");
    const parsed: PhpValue = { type: "null" };
    this.parsedValues.push(parsed);
    return parsed;
  }

  private readArray(): PhpValue {
    this.expect("a");
    this.expect(":");
    const countStr = this.readUntil(":");
    const count = parseInt(countStr, 10);
    if (isNaN(count)) {
      throw new PhpUnserializeError(`Invalid array count: "${countStr}"`);
    }
    this.expect(":");
    this.expect("{");

    const parsed: { type: "array"; entries: Array<{ key: PhpValue; value: PhpValue }> } = {
      type: "array",
      entries: [],
    };
    this.parsedValues.push(parsed);

    const entries: Array<{ key: PhpValue; value: PhpValue }> = [];
    for (let i = 0; i < count; i++) {
      const key = this.readArrayKey();
      const value = this.readValue();
      entries.push({ key, value });
    }

    this.expect("}");
    parsed.entries = entries;
    return parsed;
  }

  private readObject(): PhpValue {
    this.expect("O");
    this.expect(":");
    const classNameLenStr = this.readUntil(":");
    const classNameLen = parseInt(classNameLenStr, 10);
    if (isNaN(classNameLen)) {
      throw new PhpUnserializeError(
        `Invalid class name length: "${classNameLenStr}"`,
      );
    }
    this.expect(":");
    this.expect('"');
    const className = this.input.slice(this.pos, this.pos + classNameLen);
    this.pos += classNameLen;
    this.expect('"');
    this.expect(":");
    const countStr = this.readUntil(":");
    const count = parseInt(countStr, 10);
    if (isNaN(count)) {
      throw new PhpUnserializeError(
        `Invalid object property count: "${countStr}"`,
      );
    }
    this.expect(":");
    this.expect("{");

    const parsed: {
      type: "object";
      className: string;
      properties: Array<{ key: PhpValue; value: PhpValue }>;
    } = {
      type: "object",
      className,
      properties: [],
    };
    this.parsedValues.push(parsed);

    const properties: Array<{ key: PhpValue; value: PhpValue }> = [];
    for (let i = 0; i < count; i++) {
      const key = this.readObjectKey();
      const value = this.readValue();
      properties.push({ key, value });
    }

    this.expect("}");
    parsed.properties = properties;
    return parsed;
  }

  private readReference(): PhpValue {
    this.pos++; // skip 'r' or 'R'
    this.expect(":");
    const refStr = this.readUntil(";");
    this.expect(";");
    const refIndex = parseInt(refStr, 10);
    if (isNaN(refIndex) || refIndex < 1) {
      throw new PhpUnserializeError(`Invalid reference index: "${refStr}"`);
    }

    const referencedValue = this.parsedValues[refIndex - 1];
    if (!referencedValue) {
      throw new PhpUnserializeError(
        `Reference index ${refIndex} does not exist`,
      );
    }

    return referencedValue;
  }

  private readUtf8ByteLengthString(byteLength: number): string {
    const start = this.pos;
    let consumedBytes = 0;

    while (consumedBytes < byteLength) {
      if (this.pos >= this.input.length) {
        throw new PhpUnserializeError(
          "Unexpected end of input while reading string bytes",
        );
      }

      const codePoint = this.input.codePointAt(this.pos);
      if (codePoint === undefined) {
        throw new PhpUnserializeError("Invalid string code point");
      }

      const char = String.fromCodePoint(codePoint);
      const charByteLength = this.utf8Encoder.encode(char).length;
      consumedBytes += charByteLength;
      this.pos += char.length;
    }

    if (consumedBytes !== byteLength) {
      throw new PhpUnserializeError(
        `String byte length mismatch. Expected ${byteLength}, got ${consumedBytes}`,
      );
    }

    return this.input.slice(start, this.pos);
  }

  private readArrayKey(): PhpValue {
    const keyType = this.input[this.pos];
    switch (keyType) {
      case "i":
        return this.readInt(false);
      case "s":
        return this.readString(false);
      default:
        throw new PhpUnserializeError(
          `Invalid array key type "${keyType}" at position ${this.pos}`,
        );
    }
  }

  private readObjectKey(): PhpValue {
    const keyType = this.input[this.pos];
    if (keyType !== "s") {
      throw new PhpUnserializeError(
        `Invalid object property key type "${keyType}" at position ${this.pos}`,
      );
    }
    return this.readString(false);
  }
}

/**
 * Parses a PHP serialize() string into an intermediate PhpValue tree.
 * @throws PhpUnserializeError on empty or malformed input
 */
export function phpUnserialize(input: string): PhpValue {
  if (!input || input.trim() === "") {
    throw new PhpUnserializeError("Please enter a serialized PHP string.");
  }
  const parser = new Parser(input.trim());
  return parser.parse();
}

/** Returns true if the input is a valid PHP serialized string. */
export function isValidSerialized(input: string): boolean {
  try {
    phpUnserialize(input);
    return true;
  } catch {
    return false;
  }
}

function keyToString(key: PhpValue): string {
  switch (key.type) {
    case "int":
      return String(key.value);
    case "string":
      return key.value;
    case "bool":
      return key.value ? "1" : "0";
    case "null":
      return "";
    case "float":
      return String(Math.trunc(key.value));
    default:
      return "";
  }
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

/** Formats a PhpValue tree as PHP print_r() output. */
export function formatPrintR(value: PhpValue, indent: number = 0): string {
  const pad = " ".repeat(indent * 4);
  const innerPad = " ".repeat((indent + 1) * 4);

  switch (value.type) {
    case "string":
      return value.value;
    case "int":
    case "float":
      return String(value.value);
    case "bool":
      return value.value ? "1" : "";
    case "null":
      return "";
    case "array": {
      if (value.entries.length === 0) {
        return `Array\n${pad}(\n${pad})`;
      }
      let result = `Array\n${pad}(\n`;
      for (const entry of value.entries) {
        const k = keyToString(entry.key);
        const v = formatPrintR(entry.value, indent + 2);
        result += `${innerPad}[${k}] => ${v}\n`;
      }
      result += `${pad})`;
      return indent > 0 ? `${result}\n` : result;
    }
    case "object": {
      let result = `${value.className} Object\n${pad}(\n`;
      for (const prop of value.properties) {
        const k = keyToString(prop.key);
        const v = formatPrintR(prop.value, indent + 2);
        result += `${innerPad}[${k}] => ${v}\n`;
      }
      result += `${pad})`;
      return indent > 0 ? `${result}\n` : result;
    }
  }
}

/** Formats a PhpValue tree as PHP var_dump() output. */
export function formatVarDump(value: PhpValue, indent: number = 0): string {
  const pad = " ".repeat(indent * 2);
  const innerPad = " ".repeat((indent + 1) * 2);

  switch (value.type) {
    case "string":
      return `${pad}string(${utf8ByteLength(value.value)}) "${value.value}"`;
    case "int":
      return `${pad}int(${value.value})`;
    case "float":
      return `${pad}float(${value.value})`;
    case "bool":
      return `${pad}bool(${value.value ? "true" : "false"})`;
    case "null":
      return `${pad}NULL`;
    case "array": {
      let result = `${pad}array(${value.entries.length}) {\n`;
      for (const entry of value.entries) {
        const k = keyToString(entry.key);
        const keyBracket =
          entry.key.type === "int" ? `[${k}]` : `["${k}"]`;
        result += `${innerPad}${keyBracket}=>\n`;
        result += formatVarDump(entry.value, indent + 1) + "\n";
      }
      result += `${pad}}`;
      return result;
    }
    case "object": {
      let result = `${pad}object(${value.className})#1 (${value.properties.length}) {\n`;
      for (const prop of value.properties) {
        const k = keyToString(prop.key);
        result += `${innerPad}["${k}"]=>\n`;
        result += formatVarDump(prop.value, indent + 1) + "\n";
      }
      result += `${pad}}`;
      return result;
    }
  }
}
