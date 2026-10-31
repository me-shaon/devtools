/** Starter diagrams for the Mermaid Renderer, one for each common diagram type. */
export const MERMAID_TEMPLATES = [
  {
    id: "flowchart",
    label: "Flowchart",
    source: `flowchart TD
    A[Request] --> B{Signed in?}
    B -- Yes --> C[Load dashboard]
    B -- No --> D[Show sign-in page]
    D --> E[Check credentials]
    E -->|Valid| C
    E -->|Invalid| D`,
  },
  {
    id: "sequence",
    label: "Sequence",
    source: `sequenceDiagram
    participant Browser
    participant API
    participant DB as Database
    Browser->>API: POST /login
    API->>DB: Find user
    DB-->>API: User row
    alt Password matches
        API-->>Browser: 200 with token
    else Wrong password
        API-->>Browser: 401
    end`,
  },
  {
    id: "class",
    label: "Class",
    source: `classDiagram
    class Order {
      +String id
      +Date createdAt
      +total() Decimal
    }
    class LineItem {
      +String sku
      +int quantity
    }
    class Customer {
      +String email
    }
    Customer "1" --> "*" Order : places
    Order "1" *-- "*" LineItem : contains`,
  },
  {
    id: "er",
    label: "Entity relationship",
    source: `erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    CUSTOMER {
      int id PK
      string email
    }
    ORDER {
      int id PK
      int customer_id FK
      date created_at
    }`,
  },
  {
    id: "state",
    label: "State",
    source: `stateDiagram-v2
    [*] --> Draft
    Draft --> Review : submit
    Review --> Draft : request changes
    Review --> Published : approve
    Published --> Archived : archive
    Archived --> [*]`,
  },
  {
    id: "gantt",
    label: "Gantt",
    source: `gantt
    title Release plan
    dateFormat YYYY-MM-DD
    section Build
    Design        :done, design, 2024-01-01, 5d
    Implement     :active, impl, after design, 10d
    section Ship
    Test          :test, after impl, 4d
    Release       :milestone, after test, 0d`,
  },
  {
    id: "mindmap",
    label: "Mind map",
    source: `mindmap
  root((DevTools))
    Converters
      JSON
      Base64
    Generators
      UUID
      Hash
    Time
      Timestamp
      Time zones`,
  },
  {
    id: "pie",
    label: "Pie",
    source: `pie title Requests by status
    "2xx" : 812
    "3xx" : 64
    "4xx" : 97
    "5xx" : 12`,
  },
  {
    id: "git",
    label: "Git graph",
    source: `gitGraph
    commit
    branch feature
    checkout feature
    commit
    commit
    checkout main
    merge feature
    commit`,
  },
] as const;

export type MermaidTemplateId = (typeof MERMAID_TEMPLATES)[number]["id"];
