# Helper Reference

Trident provides custom Handlebars helpers plus all helpers from [handlebars-helpers](https://github.com/helpers/handlebars-helpers).

## Trident Custom Helpers

### Data Helpers

#### `{{default value fallback}}`

Returns value if truthy, otherwise fallback.

```yaml
port: {{default port 8080}}
host: {{default host "localhost"}}
```

---

#### `{{or val1 val2 ...}}`

Returns the first truthy value.

```yaml
database: {{or customDb envDb "localhost"}}
```

---

#### `{{parse string}}`

Parses a YAML/JSON string into an object.

```yaml
{{#with (parse configString)}}
  name: {{name}}
{{/with}}
```

---

#### `{{merge obj1 obj2 ...}}`

Deep merges multiple objects. Later objects override earlier ones.

```yaml
combined: {{json (merge defaults overrides custom)}}
```

---

#### `{{object key1 val1 key2 val2 ...}}`

Constructs an object from key-value pairs.

```yaml
metadata: {{object "name" name "version" "1.0"}}
```

---

### Numeric Helpers

#### `{{min value max}}`

Returns the smaller of two values.

```yaml
replicas: {{min replicas 10}}  # At most 10
```

---

#### `{{max value min}}`

Returns the larger of two values.

```yaml
replicas: {{max replicas 1}}  # At least 1
```

---

#### Clamping Values



```yaml
replicas: {{clamp replicas 1 10}}  # Between 1 and 10
```

---

### File Helpers

#### `{{read path}}`

Reads a file as a string.

```yaml
certificate: |
  {{read "certs/ca.pem"}}
```

---

#### `{{hash path}}`

Returns SHA256 hash of a file's contents. Useful for cache-busting or triggering redeployments when configs change.

```yaml
metadata:
  annotations:
    config-hash: {{hash "config/app.json"}}
```

---

#### `{{ls pattern [directories]}}`

Lists files matching a glob pattern.

```yaml
# List files
{{#each (ls "configs/*.json")}}
  - {{this}}
{{/each}}

# List directories (second argument = true)
{{#each (ls "modules/*" true)}}
  - {{this}}
{{/each}}
```

---

#### `{{read_glob pattern [parse]}}`

Reads multiple files matching a pattern. Returns array of `{name, path, content}`.

```yaml
# Raw content
{{#each (read_glob "configs/*.txt")}}
  - file: {{this.name}}
    content: {{this.content}}
{{/each}}

# Parsed YAML/JSON (second argument = true)
{{#each (read_glob "services/*.yaml" true)}}
  - name: {{this.content.name}}
    port: {{this.content.port}}
{{/each}}
```

**Dynamic manifests:** Use `read_glob` to discover manifest items:

```yaml
$template: inner/template.yaml
$manifest: {{read_glob "services/*.yaml" true}}
```

The inner template accesses parsed content via `{{content.field}}`.

---

### Template Helpers

#### `{{use path}}`

Includes another template file with current context.

```yaml
spec:
  {{use "partials/container.yaml"}}
```

---

#### `{{indent content spaces [char]}}`

Indents content by specified amount.

```yaml
spec:
  {{indent (use "partials/nested.yaml") 2}}

# With tabs
{{indent content 1 "\t"}}
```

---

### Validation

#### `{{validate data schema}}`

Validates data against a JSON Schema. Throws on failure.

```yaml
{{validate this (object
  "type" "object"
  "properties" (object
    "name" (object "type" "string")
    "port" (object "type" "number")
  )
  "required" (array "name")
)}}
```

---

## Standard Handlebars Helpers

### Conditionals

#### `{{#if condition}}...{{/if}}`

```yaml
{{#if enabled}}
feature: true
{{/if}}
```

#### `{{#unless condition}}...{{/unless}}`

```yaml
{{#unless production}}
debug: true
{{/unless}}
```

#### `{{else}}`

```yaml
{{#if value}}
  result: {{value}}
{{else}}
  result: default
{{/if}}
```

---

### Iteration

#### `{{#each array}}...{{/each}}`

```yaml
items:
{{#each items}}
  - {{this}}
{{/each}}
```

**Context variables:**
- `{{this}}` - Current item
- `{{@index}}` - Current index
- `{{@key}}` - Current key (objects)
- `{{@first}}` - True if first
- `{{@last}}` - True if last
- `{{../property}}` - Parent context

---

### Context

#### `{{#with object}}...{{/with}}`

```yaml
{{#with database}}
host: {{host}}
port: {{port}}
{{/with}}
```

---

## Comparison Helpers (handlebars-helpers)

```yaml
{{#if (eq a b)}}equal{{/if}}
{{#if (ne a b)}}not equal{{/if}}
{{#if (gt a b)}}greater than{{/if}}
{{#if (gte a b)}}greater or equal{{/if}}
{{#if (lt a b)}}less than{{/if}}
{{#if (lte a b)}}less or equal{{/if}}
{{#if (and a b)}}both truthy{{/if}}
{{#if (or a b)}}either truthy{{/if}}
{{#if (not a)}}falsy{{/if}}
```

---

## String Helpers 

```yaml
{{uppercase name}}       # "API"
{{lowercase name}}       # "api"
{{trim value}}           # Remove whitespace
{{replace str old new}}  # String replace
{{truncate str len}}     # Truncate string
{{in substr str}}        # Checks if substr is in str 
```

---

## Math Helpers

```yaml
{{add a b}}        # a + b
{{subtract a b}}   # a - b
{{multiply a b}}   # a * b
{{divide a b}}     # a / b
{{modulo a b}}     # a % b
```

These are also variadic.

---

## Object Helpers

```yaml
{{lookup object key}}     # Dynamic lookup
```

---

## Composing Helpers

Helpers can be nested:

```yaml
# Clamp value between 1 and 10
replicas: {{clamp replicas 1 10}}

# Merge and serialize
env: {{merge defaults overrides}}

# Conditional with comparison
{{#if (and (gt replicas 1) enabled)}}
  highAvailability: true
{{/if}}

# Read, parse, and access
version: {{get (parse (read "package.json")) "version"}}
```

---

## Practical Examples

### Config Hash for Redeployment

```yaml
$out: {{name}}/deployment.yaml
metadata:
  annotations:
    checksum/config: {{hash "configs/{{name}}.yaml"}}
```

### Dynamic Service Discovery

```yaml
$out: gateway/routes.yaml
routes:
{{#each (read_glob "services/*/routes.yaml" true)}}
  - service: {{this.name}}
    routes: {{json this.content.routes}}
{{/each}}
```

### Environment-Aware Defaults

```yaml
$out: {{name}}/config.yaml
database:
  host: {{default database.host (or $values.defaultDbHost "localhost")}}
  pool: {{min (default database.pool 10) 20}}
```

## See Also

- [Handlebars Templating Guide](../guides/03-handlebars-templating.md)
