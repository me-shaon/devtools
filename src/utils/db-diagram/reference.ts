/**
 * The DBML syntax reference that the DB Diagram tool shows offline.
 * Each example is a complete schema. A test parses each one, so the reference stays correct for the parser in use.
 */

export interface ReferenceSection {
  id: string;
  title: string;
  /** Short paragraphs. Text in `backticks` shows as code. */
  text: string[];
  /** Terms and their meanings, shown as a list. */
  terms?: [string, string][];
  example: string;
}

export const DBML_REFERENCE: ReferenceSection[] = [
  {
    id: "tables",
    title: "Tables",
    text: [
      "A `Table` block holds columns. Write one column on each line: the name, the type, and settings in square brackets if you need them.",
      "Put a schema name before the table name with a dot. A table with no schema is in `public`. Give a table a short name with `as`, and use that name in references.",
    ],
    terms: [
      ["headercolor: #3498DB", "The color of the table header in the diagram."],
      ["note: 'text'", "A note about the table."],
    ],
    example: `Table users {
  id integer
  username varchar(50)
}

Table billing.invoices as I [headercolor: #3498DB, note: 'One row for each invoice'] {
  id integer
  total "decimal(10, 2)"
}`,
  },
  {
    id: "columns",
    title: "Column settings",
    text: [
      "Settings go in square brackets after the type, with commas between them. Any type name is valid. Put a type in double quotes when it has spaces or commas.",
    ],
    terms: [
      ["pk or primary key", "The column is the primary key."],
      ["not null / null", "The column must have a value, or it can be empty. Columns can be empty when you do not set this."],
      ["unique", "No two rows can have the same value."],
      ["increment", "The database gives each new row the next number."],
      ["default: value", "The value for a new row. See Default values."],
      ["note: 'text'", "A note about the column."],
      ["check: `expression`", "A rule that each value must obey. You can write more than one."],
      ["ref: > table.column", "A reference to another column. See Inline references."],
    ],
    example: `Table products {
  id integer [pk, increment]
  sku varchar(32) [unique, not null, note: 'Stock code']
  price "decimal(10, 2)" [not null, check: \`price >= 0\`]
  "display name" varchar
  description text [null]
}`,
  },
  {
    id: "defaults",
    title: "Default values",
    text: ["The type of the default value controls how you write it."],
    terms: [
      ["default: 1", "A number."],
      ["default: 'draft'", "A string, in single quotes."],
      ["default: true", "A boolean: `true` or `false`."],
      ["default: null", "No value."],
      ["default: `now()`", "An expression, in backticks. The database runs it."],
    ],
    example: `Table posts {
  id integer [pk]
  views integer [default: 0]
  status varchar [default: 'draft']
  pinned boolean [default: false]
  deleted_at timestamp [default: null]
  created_at timestamp [default: \`now()\`]
}`,
  },
  {
    id: "indexes",
    title: "Indexes",
    text: [
      "Put an `indexes` block inside the table. Write one index on each line: a column, a list of columns in parentheses, or an expression in backticks.",
    ],
    terms: [
      ["pk", "The index is the primary key. Use it for a key with more than one column."],
      ["unique", "The index is unique."],
      ["name: 'text'", "The name of the index."],
      ["type: btree", "The index type: `btree` or `hash`."],
      ["note: 'text'", "A note about the index."],
    ],
    example: `Table bookings {
  room_id integer
  day date
  guest_email varchar

  indexes {
    (room_id, day) [pk]
    guest_email [name: 'bookings_guest', type: hash]
    \`lower(guest_email)\` [note: 'For case-insensitive search']
    (day, \`room_id * 2\`) [unique]
  }
}`,
  },
  {
    id: "checks",
    title: "Checks",
    text: [
      "A `checks` block holds rules that use more than one column. Write each rule as an expression in backticks. Give it a name if you need one.",
    ],
    example: `Table stays {
  check_in date
  check_out date

  checks {
    \`check_out > check_in\` [name: 'stay_dates']
  }
}`,
  },
  {
    id: "refs",
    title: "References",
    text: [
      "A reference connects a foreign key column to the column that it refers to. The operator gives the relationship.",
      "Put `?` on one side of the operator to make the count on that side start at zero. For example, `posts.editor_id >? users.id` means that a post can have no editor.",
      "A long reference uses a block. A short reference uses one line. Both forms can have a name.",
    ],
    terms: [
      ["<", "One-to-many: one row on the left, many rows on the right."],
      [">", "Many-to-one: many rows on the left, one row on the right."],
      ["-", "One-to-one."],
      ["<>", "Many-to-many."],
    ],
    example: `Table users {
  id integer [pk]
}

Table posts {
  id integer [pk]
  author_id integer
  editor_id integer
  reviewer_id integer
}

Ref: posts.author_id > users.id

Ref post_editor: posts.editor_id >? users.id

Ref post_reviewer {
  posts.reviewer_id >? users.id
}`,
  },
  {
    id: "inline-refs",
    title: "Inline references",
    text: [
      "Write a reference in the column settings. The column is the left side. Inline references cannot have a name or settings.",
    ],
    example: `Table users {
  id integer [pk]
}

Table orders {
  id integer [pk]
  user_id integer [ref: > users.id]
}`,
  },
  {
    id: "composite-refs",
    title: "Composite and cross-schema references",
    text: [
      "A reference can use more than one column on each side. Put the columns in parentheses in the same order on the two sides.",
      "Write `schema.table.column` for a table in a different schema.",
    ],
    example: `Table orders {
  id integer
  shop_id integer
}

Table sales.order_lines {
  order_id integer
  shop_id integer
}

Ref: sales.order_lines.(order_id, shop_id) > orders.(id, shop_id)`,
  },
  {
    id: "ref-settings",
    title: "Reference settings",
    text: ["Put settings in square brackets at the end of a top-level reference."],
    terms: [
      ["delete: cascade", "What happens to the rows that refer to a deleted row: `cascade`, `restrict`, `set null`, `set default`, or `no action`."],
      ["update: no action", "What happens when the referenced key changes. It takes the same values as `delete`."],
      ["color: #79AD51", "The color of the line in the diagram."],
    ],
    example: `Table users {
  id integer [pk]
}

Table sessions {
  user_id integer
}

Ref: sessions.user_id > users.id [delete: cascade, update: no action, color: #79AD51]`,
  },
  {
    id: "enums",
    title: "Enums",
    text: [
      "An `Enum` block lists the values that a column can have. Use the enum name as the column type. Put a value in double quotes when it has spaces or special characters.",
    ],
    example: `Enum order_status {
  pending
  shipped [note: 'The courier has the order']
  "on hold"
}

Table orders {
  id integer [pk]
  status order_status [default: 'pending']
}`,
  },
  {
    id: "notes",
    title: "Notes",
    text: [
      "Add a note to a table with a `Note` line inside it, and to a column with the `note` setting.",
      "A string in three single quotes can have more than one line. A sticky note is a `Note` block outside the tables.",
    ],
    example: `Table users {
  id integer [pk, note: 'Starts at 1']

  Note: '''
  All the people who can sign in.
  Rows are never deleted.
  '''
}

Note review_later {
  'Add an audit table before the release.'
}`,
  },
  {
    id: "groups",
    title: "Table groups",
    text: ["A `TableGroup` puts related tables together in the diagram."],
    example: `Table users {
  id integer
}

Table sessions {
  id integer
}

TableGroup accounts [color: #345F80, note: 'Sign-in data'] {
  users
  sessions
}`,
  },
  {
    id: "partials",
    title: "Table partials",
    text: [
      "A `TablePartial` holds columns, settings, and indexes that more than one table uses. Add it to a table with `~name`.",
      "A column that the table defines itself wins over a partial column with the same name. A partial that comes later wins over one that comes earlier.",
    ],
    example: `TablePartial timestamps {
  created_at timestamp [default: \`now()\`]
  updated_at timestamp
}

Table users {
  id integer [pk]
  email varchar
  ~timestamps
}`,
  },
  {
    id: "project",
    title: "Project",
    text: ["A `Project` block names the schema and the database type. Each file can have one."],
    example: `Project shop {
  database_type: 'PostgreSQL'
  Note: 'The online shop'
}

Table products {
  id integer [pk]
}`,
  },
  {
    id: "records",
    title: "Sample data",
    text: [
      "A `records` block holds rows of data, with commas between the values. Write strings in single quotes, and put a backslash before a single quote inside a string.",
      "Inside a table, the block can leave out the column list. Mark the block `[example]` to keep the rows out of SQL INSERT statements.",
    ],
    example: `Table users {
  id integer [pk]
  name varchar
  active boolean
}

records users(id, name, active) {
  1, 'Alice', true
  2, 'Bob O\\'Neil', false
}

Table plans {
  id integer [pk]
  title varchar

  records [example] {
    1, 'Free'
    2, 'Team'
  }
}`,
  },
  {
    id: "syntax",
    title: "Comments and names",
    text: [
      "Write a comment after `//` to the end of the line, or between `/*` and `*/`. Canvas edits keep your comments.",
      "Put a name in double quotes when it has spaces or special characters. Keywords such as `Table` and `Ref` can start with a capital letter or not.",
    ],
    example: `/* The schema for the
   sign-in service */
Table "user accounts" {
  id integer [pk] // starts at 1
  "e-mail" varchar
}`,
  },
  {
    id: "positions",
    title: "Table positions",
    text: [
      "When you move a table on the canvas, this tool writes the positions of all tables in a comment block at the end of the DBML. Other DBML tools ignore it.",
      "Delete the block to lay out the tables again from the start.",
    ],
    example: `Table users {
  id integer [pk]
}

/* @devtools-layout
{"version": 1, "tables": {
  "users": {"x": 0, "y": 0}
}}
*/`,
  },
];
