import { describe, expect, it } from "vitest";
import { jsonToPhpArray, jsonToSerialized, phpArrayToJson, unserializeToJson, type PhpResult } from "@/utils/php";

const value = (result: PhpResult) => {
  if (!result.ok) throw new Error(result.error);
  return result.value;
};

const compact = (result: PhpResult) => JSON.stringify(JSON.parse(value(result)));

describe("unserializeToJson", () => {
  it("converts scalars", () => {
    expect(value(unserializeToJson("N;"))).toBe("null");
    expect(value(unserializeToJson("b:1;"))).toBe("true");
    expect(value(unserializeToJson("i:-42;"))).toBe("-42");
    expect(value(unserializeToJson("d:0.5;"))).toBe("0.5");
    expect(value(unserializeToJson('s:5:"hello";'))).toBe('"hello"');
  });

  it("reads string lengths as UTF-8 bytes", () => {
    expect(value(unserializeToJson('s:5:"café";'))).toBe('"café"');
    expect(value(unserializeToJson('s:4:"a";b";'))).toBe('"a\\";b"');
  });

  it("turns sequential arrays into lists and keeps key order in maps", () => {
    expect(compact(unserializeToJson('a:2:{i:0;s:1:"a";i:1;s:1:"b";}'))).toBe('["a","b"]');
    expect(value(unserializeToJson('a:3:{i:5;s:1:"a";s:1:"x";i:1;i:2;b:0;}'))).toBe('{\n  "5": "a",\n  "x": 1,\n  "2": false\n}');
  });

  it("keeps 64-bit integers exact", () => {
    expect(value(unserializeToJson("i:9223372036854775807;"))).toBe("9223372036854775807");
  });

  it("writes INF and NAN as strings", () => {
    expect(value(unserializeToJson("d:INF;"))).toBe('"INF"');
    expect(value(unserializeToJson("d:NAN;"))).toBe('"NAN"');
  });

  it("converts objects and keeps property visibility prefixes for the way back", () => {
    const input = 'O:4:"User":3:{s:2:"id";i:7;s:7:"\0*\0role";s:5:"admin";s:10:"\0User\0pass";s:1:"x";}';
    const json = value(unserializeToJson(input));
    expect(JSON.parse(json)).toEqual({ __class: "User", id: 7, "\0*\0role": "admin", "\0User\0pass": "x" });
    expect(value(jsonToSerialized(json))).toBe(input);
    expect(value(jsonToPhpArray(json))).toBe(`\\User::__set_state([
    'id' => 7,
    'role' => 'admin',
    'pass' => 'x',
])`);
  });

  it("converts enums, custom objects, and references", () => {
    expect(compact(unserializeToJson('E:11:"Suit:Hearts";'))).toBe('{"__enum":"Suit:Hearts"}');
    expect(compact(unserializeToJson('C:3:"Foo":6:{a:0:{}}'))).toBe('{"__class":"Foo","__serialized":"a:0:{}"}');
    expect(compact(unserializeToJson('a:2:{i:0;a:0:{}i:1;R:2;}'))).toBe('[[],{"__ref":2}]');
  });

  it("repairs string lengths that do not match and says so", () => {
    const result = unserializeToJson('a:1:{s:3:"url";s:10:"https://example.com";}');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.value)).toEqual({ url: "https://example.com" });
    expect(result.notice).toMatch(/1 string length/);
  });

  it("reads PHP session data", () => {
    expect(compact(unserializeToJson('user|s:3:"bob";cart|a:1:{i:0;i:9;}'))).toBe('{"user":"bob","cart":[9]}');
  });

  it("reports malformed input", () => {
    expect(unserializeToJson("a:1:{i:0;").ok).toBe(false);
    expect(unserializeToJson("x:1;").ok).toBe(false);
    expect(unserializeToJson("i:1;junk").ok).toBe(false);
  });
});

describe("jsonToSerialized", () => {
  it("serializes JSON with byte lengths", () => {
    expect(value(jsonToSerialized('{"name":"café","tags":["a"],"n":1,"f":1.5,"ok":true,"x":null}'))).toBe(
      'a:6:{s:4:"name";s:5:"café";s:4:"tags";a:1:{i:0;s:1:"a";}s:1:"n";i:1;s:1:"f";d:1.5;s:2:"ok";b:1;s:1:"x";N;}',
    );
  });

  it("casts numeric string keys to integers like PHP", () => {
    expect(value(jsonToSerialized('{"10":"a","07":"b"}'))).toBe('a:2:{i:10;s:1:"a";s:2:"07";s:1:"b";}');
  });

  it("restores objects and enums from the special keys", () => {
    expect(value(jsonToSerialized('{"__class":"User","id":7}'))).toBe('O:4:"User":1:{s:2:"id";i:7;}');
    expect(value(jsonToSerialized('{"__enum":"Suit:Hearts"}'))).toBe('E:11:"Suit:Hearts";');
  });

  it("round-trips repaired data into valid lengths", () => {
    const repaired = value(unserializeToJson('s:3:"https://example.com";'));
    expect(value(jsonToSerialized(repaired))).toBe('s:19:"https://example.com";');
  });

  it("reports invalid JSON with a position", () => {
    const result = jsonToSerialized('{"a": }');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/position 6/);
  });
});

describe("phpArrayToJson", () => {
  it("reads short and long array syntax", () => {
    expect(compact(phpArrayToJson("['a', 'b']"))).toBe('["a","b"]');
    expect(compact(phpArrayToJson("array('id' => 1, 'tags' => array())"))).toBe('{"id":1,"tags":[]}');
  });

  it("accepts a full PHP statement with comments", () => {
    const input = `<?php
// config
return [
    'debug' => true, # inline
    /* block */ 'name' => "App\\tName",
];`;
    expect(compact(phpArrayToJson(input))).toBe('{"debug":true,"name":"App\\tName"}');
    expect(compact(phpArrayToJson("$config = ['a' => null];"))).toBe('{"a":null}');
  });

  it("assigns automatic indexes and casts keys like PHP", () => {
    // Raw text, because JSON.parse would reorder the integer keys.
    expect(value(phpArrayToJson("['a', 5 => 'b', 'c', '7' => 'd', true => 'e', 'c' => 'f', 'c' => 'g']"))).toBe(
      '{\n  "0": "a",\n  "5": "b",\n  "6": "c",\n  "7": "d",\n  "1": "e",\n  "c": "g"\n}',
    );
  });

  it("reads PHP number forms", () => {
    expect(compact(phpArrayToJson("[0x1A, 0b11, 0o17, 017, 1_000, -2.5, .5, 1e3]"))).toBe("[26,3,15,15,1000,-2.5,0.5,1000]");
  });

  it("decodes double-quoted escapes as UTF-8 bytes", () => {
    expect(compact(phpArrayToJson('["caf\\xc3\\xa9 \\u{1F600} \\$x \\101"]'))).toBe('["café 😀 $x A"]');
    expect(compact(phpArrayToJson("['it\\'s \\\\ \\n']"))).toBe('["it\'s \\\\ \\\\n"]');
  });

  it("reads var_export output", () => {
    const input = `\\App\\User::__set_state(array(
   'id' => 7,
   'meta' =>
  (object) array(
     'a' => 1,
  ),
))`;
    expect(compact(phpArrayToJson(input))).toBe('{"__class":"App\\\\User","id":7,"meta":{"__class":"stdClass","a":1}}');
  });

  it("reports the position of a syntax error", () => {
    const result = phpArrayToJson("['a' => ]");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/position 8/);
  });
});

describe("jsonToPhpArray", () => {
  it("writes short syntax with PSR indentation", () => {
    expect(value(jsonToPhpArray('{"name":"it\'s","tags":["a","b"],"n":1,"f":2.0,"ok":false,"x":null,"e":{}}'))).toBe(`[
    'name' => 'it\\'s',
    'tags' => [
        'a',
        'b',
    ],
    'n' => 1,
    'f' => 2.0,
    'ok' => false,
    'x' => null,
    'e' => [],
]`);
  });

  it("writes long syntax when asked", () => {
    expect(value(jsonToPhpArray('[1,{"a":2}]', { longSyntax: true }))).toBe(`array(
    1,
    array(
        'a' => 2,
    ),
)`);
  });

  it("writes integer keys without quotes", () => {
    expect(value(jsonToPhpArray('{"5":"a","x":"b"}'))).toBe(`[
    5 => 'a',
    'x' => 'b',
]`);
  });

  it("writes objects and enums", () => {
    expect(value(jsonToPhpArray('{"__class":"stdClass","a":1}'))).toBe(`(object) [
    'a' => 1,
]`);
    expect(value(jsonToPhpArray('{"__enum":"Suit:Hearts"}'))).toBe("\\Suit::Hearts");
  });
});
