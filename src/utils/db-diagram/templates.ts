/** Starter schemas for the DB Diagram tool. */

export interface DbTemplate {
  id: string;
  label: string;
  source: string;
}

export const DB_TEMPLATES: DbTemplate[] = [
  {
    id: "blog",
    label: "Blog",
    source: `// Type DBML here, or drag and edit tables on the canvas.
// Select Reference in the DBML pane for the syntax.

Table users {
  id integer [pk, increment]
  username varchar(50) [unique, not null]
  email varchar(255) [unique, not null]
  created_at timestamp [default: \`now()\`]
}

Table posts {
  id integer [pk, increment]
  author_id integer [not null]
  title varchar(200) [not null]
  body text
  status post_status [default: 'draft']
  published_at timestamp
}

Table comments {
  id integer [pk, increment]
  post_id integer [not null]
  user_id integer [not null]
  body text [not null]
}

Table tags {
  id integer [pk]
  name varchar(50) [unique]
}

Table post_tags {
  post_id integer [pk]
  tag_id integer [pk]
}

Enum post_status {
  draft
  published
  archived
}

Ref: posts.author_id > users.id
Ref: comments.post_id > posts.id [delete: cascade]
Ref: comments.user_id > users.id
Ref: post_tags.post_id > posts.id
Ref: post_tags.tag_id > tags.id
`,
  },
  {
    id: "shop",
    label: "Online shop",
    source: `Table customers [headercolor: #0e7490] {
  id integer [pk, increment]
  email varchar(255) [unique, not null]
  name varchar(100)
}

Table products [headercolor: #7c3aed] {
  id integer [pk, increment]
  sku varchar(40) [unique, not null]
  name varchar(200) [not null]
  price decimal(10, 2) [not null]
}

Table orders [headercolor: #0e7490] {
  id integer [pk, increment]
  customer_id integer [not null, ref: > customers.id]
  status varchar(20) [default: 'pending']
  placed_at timestamp
}

Table order_items {
  order_id integer [pk, ref: > orders.id]
  product_id integer [pk, ref: > products.id]
  quantity integer [not null, default: 1]
  unit_price decimal(10, 2) [not null]
}

Table payments {
  id integer [pk, increment]
  order_id integer [unique, not null]
  amount decimal(10, 2) [not null]
}

Ref: payments.order_id - orders.id
`,
  },
  {
    id: "saas",
    label: "SaaS accounts",
    source: `Table accounts.organizations {
  id uuid [pk]
  name varchar(100) [not null]
  plan varchar(20) [default: 'free']
}

Table accounts.users {
  id uuid [pk]
  email varchar(255) [unique, not null]
}

Table accounts.memberships {
  organization_id uuid [pk, ref: > accounts.organizations.id]
  user_id uuid [pk, ref: > accounts.users.id]
  role varchar(20) [not null, default: 'member']
}

Table billing.subscriptions {
  id uuid [pk]
  organization_id uuid [unique, not null]
  renews_at timestamp
}

Ref: billing.subscriptions.organization_id - accounts.organizations.id

TableGroup accounts {
  accounts.organizations
  accounts.users
  accounts.memberships
}
`,
  },
];
