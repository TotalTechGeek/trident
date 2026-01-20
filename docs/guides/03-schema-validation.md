# Schema Validation

Trident uses JSON Schema to validate manifest items and apply default values.

## Basic Schema

Create a `schema.json` file alongside your template:

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "replicas": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    }
  },
  "required": ["name", "replicas"]
}
```

## Applying Defaults

One of the most powerful features is automatic defaults:

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "replicas": {
      "type": "integer",
      "default": 1
    },
    "port": {
      "type": "integer",
      "default": 8080
    },
    "debug": {
      "type": "boolean",
      "default": false
    }
  },
  "required": ["name"]
}
```

Now your manifest can omit optional fields:

```yaml
name: api
# replicas defaults to 1
# port defaults to 8080
# debug defaults to false
---
name: web
replicas: 3
# port defaults to 8080
# debug defaults to false
```

## Nested Object Defaults

Apply defaults to nested structures:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "resources": {
      "type": "object",
      "default": {},
      "properties": {
        "cpu": {
          "type": "string",
          "default": "100m"
        },
        "memory": {
          "type": "string",
          "default": "128Mi"
        }
      }
    }
  },
  "required": ["name"]
}
```

## Array Validation

Validate arrays and their items:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "ports": {
      "type": "array",
      "items": {
        "type": "integer",
        "minimum": 1,
        "maximum": 65535
      },
      "default": [8080]
    },
    "env": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "value": { "type": "string" }
        },
        "required": ["name", "value"]
      },
      "default": []
    }
  }
}
```

## Enum Validation

Restrict values to a set of options:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "environment": {
      "type": "string",
      "enum": ["development", "staging", "production"],
      "default": "development"
    },
    "tier": {
      "type": "string",
      "enum": ["frontend", "backend", "data"]
    }
  },
  "required": ["name", "tier"]
}
```

## Conditional Validation

Use `if`/`then`/`else` for conditional requirements:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "type": {
      "type": "string",
      "enum": ["web", "worker", "cron"]
    },
    "port": { "type": "integer" },
    "schedule": { "type": "string" }
  },
  "required": ["name", "type"],
  "if": {
    "properties": {
      "type": { "const": "web" }
    }
  },
  "then": {
    "required": ["port"]
  },
  "else": {
    "if": {
      "properties": {
        "type": { "const": "cron" }
      }
    },
    "then": {
      "required": ["schedule"]
    }
  }
}
```

## Pattern Validation

Validate string formats:

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9-]*$",
      "minLength": 2,
      "maxLength": 63
    },
    "email": {
      "type": "string",
      "format": "email"
    },
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    }
  }
}
```

## Inline Validation with `{{validate}}`

For dynamic validation within templates, use the `validate` helper:

```yaml
{{validate this (object
  "type" "object"
  "properties" (object
    "name" (object "type" "string")
    "port" (object "type" "number" "minimum" 1 "maximum" 65535)
  )
  "required" (array "name" "port")
)}}
$out: {{name}}/config.yaml
name: {{name}}
port: {{port}}
```

This is useful when:
- Schema varies based on template context
- You need validation in nested templates
- Schema is dynamically constructed

## Error Messages

When validation fails, Trident provides helpful error messages:

```
Error occurred on "api"
✖ /replicas must be >= 1

  > 1 | replicas: 0
      | ^^^^^^^^ 👈🏽  must be >= 1
```

## Best Practices

### 1. Always Provide Defaults for Optional Fields

```json
{
  "properties": {
    "replicas": {
      "type": "integer",
      "default": 1
    }
  }
}
```

### 2. Use `additionalProperties` Thoughtfully

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" }
  },
  "additionalProperties": true
}
```

Set to `false` to catch typos in manifest keys.

### 3. Document with `description`

```json
{
  "properties": {
    "replicas": {
      "type": "integer",
      "description": "Number of pod replicas to run",
      "default": 1,
      "minimum": 1
    }
  }
}
```

### 4. Use Sensible Constraints

```json
{
  "properties": {
    "replicas": {
      "type": "integer",
      "minimum": 1,
      "maximum": 100
    },
    "port": {
      "type": "integer",
      "minimum": 1,
      "maximum": 65535
    }
  }
}
```

## Next Steps

- Learn about [Handlebars Templating](./03-handlebars-templating.md)
- Explore [Helper Reference](../reference/02-helpers.md)
