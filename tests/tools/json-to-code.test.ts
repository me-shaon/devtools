import { describe, expect, it } from "vitest";
import {
  CODE_LANGUAGES,
  JsonInputError,
  inferModel,
  jsonToCode,
  toCamelCase,
  toPascalCase,
  toSnakeCase,
} from "@/utils/json-to-code";

/** Arrays of objects with missing fields, null, int and float, reserved words, and keys with dashes and spaces. */
const SAMPLE = JSON.stringify({
  id: 1,
  type: "admin",
  class: "A",
  fn: "x",
  "first-name": "Ada",
  "last name": "Lovelace",
  score: 9.5,
  tags: [],
  users: [
    { id: 1, email: "a@x.io", age: 30 },
    { id: 2, age: 31.5, manager: null },
  ],
});

describe("naming helpers", () => {
  it("splits keys on separators and case boundaries", () => {
    expect(toPascalCase("first-name")).toBe("FirstName");
    expect(toPascalCase("user_id", true)).toBe("UserID");
    expect(toCamelCase("last name")).toBe("lastName");
    expect(toCamelCase("HTTPStatus")).toBe("httpStatus");
    expect(toSnakeCase("zipCode")).toBe("zip_code");
  });
});

describe("inferModel", () => {
  it("merges array element shapes and marks missing fields optional", () => {
    const model = inferModel(JSON.parse(SAMPLE));
    const user = model.types.find((t) => t.name === "User")!;
    expect(user.fields.map((f) => [f.key, f.optional])).toEqual([
      ["id", false],
      ["email", true],
      ["age", false],
      ["manager", true],
    ]);
    // 30 and 31.5 merge to a float.
    expect(user.fields[2].type.kind).toBe("number");
    expect(user.fields[0].type.kind).toBe("integer");
  });

  it("names nested types from the key and de-duplicates identical shapes", () => {
    const model = inferModel({ home: { city: "a" }, work: { city: "b" }, other: { town: "c" } });
    expect(model.types.map((t) => t.name)).toEqual(["Root", "Home", "Other"]);
  });

  it("uses the root name option", () => {
    expect(inferModel({ a: 1 }, "my payload").types[0].name).toBe("MyPayload");
  });

  it("keeps null as nullable and empty arrays as unknown", () => {
    const model = inferModel({ a: [1, null], b: [], c: null });
    const [a, b, c] = model.types[0].fields.map((f) => f.type);
    expect(a).toMatchObject({ kind: "array", items: { kind: "integer", nullable: true } });
    expect(b).toMatchObject({ kind: "array", items: { kind: "unknown", reason: "empty-array" } });
    expect(c).toMatchObject({ kind: "unknown", reason: "null", nullable: true });
  });

  it("renames type names that clash with built-in types", () => {
    expect(inferModel({ string: { a: 1 } }).types[1].name).toBe("StringType");
  });
});

describe("jsonToCode", () => {
  it("returns nothing for empty input", () => {
    expect(jsonToCode("  ", "go")).toEqual({ output: "", typeCount: 0 });
  });

  it("reports the line and column of invalid JSON", () => {
    let error: unknown;
    try {
      jsonToCode('{\n  "a": 1,\n  }', "typescript");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(JsonInputError);
    expect((error as JsonInputError).message).toMatch(/^Line 3, column 3: Invalid JSON\./);
  });

  it("counts a root alias as a type", () => {
    expect(jsonToCode('[{"a":1}]', "go")).toEqual({
      output: 'type Root []RootItem\n\ntype RootItem struct {\n\tA int64 `json:"a"`\n}',
      typeCount: 2,
    });
  });

  it("emits a type alias for a primitive root", () => {
    expect(jsonToCode('[1, "a", null]', "typescript").output).toBe("export type Root = (number | string | null)[];");
  });

  it("produces output for every language", () => {
    for (const { id } of CODE_LANGUAGES) expect(jsonToCode(SAMPLE, id).output.length).toBeGreaterThan(0);
  });
});

describe("TypeScript", () => {
  it("emits interfaces by default", () => {
    expect(jsonToCode(SAMPLE, "typescript").output).toMatchInlineSnapshot(`
      "export interface Root {
        id: number;
        type: string;
        class: string;
        fn: string;
        "first-name": string;
        "last name": string;
        score: number;
        // The sample array is empty, so the element type is unknown.
        tags: unknown[];
        users: User[];
      }

      export interface User {
        id: number;
        email?: string;
        age: number;
        // The sample value is null, so the type is unknown.
        manager?: unknown;
      }"
    `);
  });

  it("emits readonly type aliases on request", () => {
    expect(jsonToCode('{"a":{"b":1}}', "typescript", { tsStyle: "type", tsReadonly: true, rootName: "Doc" }).output)
      .toBe("export type Doc = {\n  readonly a: A;\n};\n\nexport type A = {\n  readonly b: number;\n};");
  });

  it("adds null to nullable fields", () => {
    expect(jsonToCode('[{"a":"x"},{"a":null}]', "typescript").output).toContain("  a: string | null;");
  });
});

describe("Go", () => {
  it("emits structs with json tags and omitempty", () => {
    expect(jsonToCode(SAMPLE, "go").output).toMatchInlineSnapshot(`
      "type Root struct {
      	ID        int64   \`json:"id"\`
      	Type      string  \`json:"type"\`
      	Class     string  \`json:"class"\`
      	Fn        string  \`json:"fn"\`
      	FirstName string  \`json:"first-name"\`
      	LastName  string  \`json:"last name"\`
      	Score     float64 \`json:"score"\`
      	// The sample array is empty, so the element type is unknown.
      	Tags      []any   \`json:"tags"\`
      	Users     []User  \`json:"users"\`
      }

      type User struct {
      	ID      int64   \`json:"id"\`
      	Email   *string \`json:"email,omitempty"\`
      	Age     float64 \`json:"age"\`
      	// The sample value is null, so the type is unknown.
      	Manager any     \`json:"manager,omitempty"\`
      }"
    `);
  });
});

describe("Rust", () => {
  it("emits serde structs with raw identifiers and renames", () => {
    expect(jsonToCode(SAMPLE, "rust").output).toMatchInlineSnapshot(`
      "use serde::{Deserialize, Serialize};

      #[derive(Debug, Clone, Serialize, Deserialize)]
      pub struct Root {
          pub id: i64,
          pub r#type: String,
          pub class: String,
          pub r#fn: String,
          #[serde(rename = "first-name")]
          pub first_name: String,
          #[serde(rename = "last name")]
          pub last_name: String,
          pub score: f64,
          // The sample array is empty, so the element type is unknown.
          pub tags: Vec<serde_json::Value>,
          pub users: Vec<User>,
      }

      #[derive(Debug, Clone, Serialize, Deserialize)]
      pub struct User {
          pub id: i64,
          #[serde(default, skip_serializing_if = "Option::is_none")]
          pub email: Option<String>,
          pub age: f64,
          // The sample value is null, so the type is unknown.
          #[serde(default, skip_serializing_if = "Option::is_none")]
          pub manager: Option<serde_json::Value>,
      }"
    `);
  });

  it("suffixes keywords that cannot be raw identifiers", () => {
    expect(jsonToCode('{"self":1}', "rust").output).toContain('    #[serde(rename = "self")]\n    pub self_: i64,');
  });
});

describe("Python", () => {
  it("emits dataclasses with dependencies first", () => {
    expect(jsonToCode(SAMPLE, "python").output).toMatchInlineSnapshot(`
      "from dataclasses import dataclass
      from typing import Any, List, Optional


      @dataclass
      class User:
          id: int
          age: float
          email: Optional[str] = None
          # The sample value is null, so the type is unknown.
          manager: Any = None


      @dataclass
      class Root:
          id: int
          type: str
          # JSON key: "class"
          class_: str
          fn: str
          # JSON key: "first-name"
          first_name: str
          # JSON key: "last name"
          last_name: str
          score: float
          # The sample array is empty, so the element type is unknown.
          tags: List[Any]
          users: List[User]"
    `);
  });

  it("emits Pydantic models with aliases", () => {
    expect(jsonToCode(SAMPLE, "python", { pythonStyle: "pydantic" }).output).toMatchInlineSnapshot(`
      "from typing import Any, List, Optional
      from pydantic import BaseModel, ConfigDict, Field


      class User(BaseModel):
          id: int
          age: float
          email: Optional[str] = None
          # The sample value is null, so the type is unknown.
          manager: Any = None


      class Root(BaseModel):
          model_config = ConfigDict(populate_by_name=True)

          id: int
          type: str
          class_: str = Field(alias="class")
          fn: str
          first_name: str = Field(alias="first-name")
          last_name: str = Field(alias="last name")
          score: float
          # The sample array is empty, so the element type is unknown.
          tags: List[Any]
          users: List[User]"
    `);
  });
});

describe("Swift", () => {
  it("emits Codable structs with CodingKeys", () => {
    expect(jsonToCode(SAMPLE, "swift").output).toMatchInlineSnapshot(`
      "import Foundation

      struct Root: Codable {
          let id: Int
          let type: String
          let \`class\`: String
          let fn: String
          let firstName: String
          let lastName: String
          let score: Double
          // The sample array is empty, so the element type is unknown. Replace String with the real type.
          let tags: [String]
          let users: [User]

          enum CodingKeys: String, CodingKey {
              case id
              case type
              case \`class\`
              case fn
              case firstName = "first-name"
              case lastName = "last name"
              case score
              case tags
              case users
          }
      }

      struct User: Codable {
          let id: Int
          let email: String?
          let age: Double
          // The sample value is null, so the type is unknown. Replace String with the real type.
          let manager: String?
      }"
    `);
  });

  it("leaves out CodingKeys when every name matches its key", () => {
    expect(jsonToCode('{"a":1}', "swift").output).toBe("import Foundation\n\nstruct Root: Codable {\n    let a: Int\n}");
  });
});

describe("Kotlin", () => {
  it("emits @Serializable data classes with @SerialName", () => {
    expect(jsonToCode(SAMPLE, "kotlin").output).toMatchInlineSnapshot(`
      "import kotlinx.serialization.SerialName
      import kotlinx.serialization.Serializable
      import kotlinx.serialization.json.JsonElement

      @Serializable
      data class Root(
          val id: Long,
          val type: String,
          val \`class\`: String,
          val fn: String,
          @SerialName("first-name")
          val firstName: String,
          @SerialName("last name")
          val lastName: String,
          val score: Double,
          // The sample array is empty, so the element type is unknown.
          val tags: List<JsonElement>,
          val users: List<User>,
      )

      @Serializable
      data class User(
          val id: Long,
          val email: String? = null,
          val age: Double,
          // The sample value is null, so the type is unknown.
          val manager: JsonElement? = null,
      )"
    `);
  });
});

describe("JSON Schema", () => {
  it("emits a draft 2020-12 schema with $defs", () => {
    const schema = JSON.parse(jsonToCode(SAMPLE, "json-schema").output);
    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(schema.title).toBe("Root");
    expect(schema.required).toEqual(["id", "type", "class", "fn", "first-name", "last name", "score", "tags", "users"]);
    expect(schema.properties.users).toEqual({ type: "array", items: { $ref: "#/$defs/User" } });
    expect(schema.properties.tags.items.$comment).toMatch(/empty/);
    expect(schema.$defs.User.required).toEqual(["id", "age"]);
    expect(schema.$defs.User.properties.manager.$comment).toMatch(/null/);
  });

  it("allows null next to the type", () => {
    const schema = JSON.parse(jsonToCode('{"a":[1,null]}', "json-schema").output);
    expect(schema.properties.a.items).toEqual({ type: ["integer", "null"] });
  });
});
