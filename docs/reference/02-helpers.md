# Helper Reference

Trident provides custom Handlebars helpers plus all helpers from [handlebars-helpers](https://github.com/helpers/handlebars-helpers).

## Trident Custom Helpers

#### `{{parse string}}`

Parses a YAML/JSON string into an object.

```yaml
{{#with (parse configString)}}
  name: {{name}}
{{/with}}
```

---

#### `{{merge obj1 obj2 ...}}`

Deep merges multiple objects.

```yaml
combined: {{json (merge defaults overrides custom)}}
```

---

#### `{{object key1 val1 key2 val2 ...}}`

Constructs an object from key-value pairs.

```yaml
metadata: {{json (object "name" name "version" "1.0")}}
```

---

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

### File Helpers

#### `{{read path}}`

Reads a file as a string.

```yaml
certificate: |
  {{read "certs/ca.pem"}}
```

---

#### `{{hash path}}`

Returns SHA256 hash of a file's contents.

```yaml
configHash: {{hash "config/app.json"}}
```

---

#### `{{ls pattern [directories]}}`

Lists files matching a glob pattern.

```yaml
# List files
{{#each (ls "configs/*.json")}}
  - {{this}}
{{/each}}

# List directories
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

# Parsed YAML/JSON
{{#each (read_glob "services/*.yaml" true)}}
  - name: {{this.content.name}}
    port: {{this.content.port}}
{{/each}}
```

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

# With custom character
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

## String Helpers (handlebars-helpers)

```yaml
{{uppercase name}}      # "API"
{{lowercase name}}      # "api"
{{capitalize name}}     # "Api"
{{titleize name}}       # "My Service"
{{dasherize name}}      # "my-service"
{{underscore name}}     # "my_service"
{{camelcase name}}      # "myService"
{{pascalcase name}}     # "MyService"
{{trim value}}          # Remove whitespace
{{replace str old new}} # String replace
{{split str delimiter}} # Split to array
{{join arr delimiter}}  # Join array
{{truncate str len}}    # Truncate string
{{startsWith str prefix}}
{{endsWith str suffix}}
{{contains str substr}}
```

---

## Math Helpers (handlebars-helpers)

```yaml
{{add a b}}        # a + b
{{subtract a b}}   # a - b
{{multiply a b}}   # a * b
{{divide a b}}     # a / b
{{modulo a b}}     # a % b
{{floor value}}    # Round down
{{ceil value}}     # Round up
{{round value}}    # Round
{{abs value}}      # Absolute value
```

---

## Array Helpers (handlebars-helpers)

```yaml
{{first array}}           # First element
{{last array}}            # Last element
{{length array}}          # Array length
{{reverse array}}         # Reverse array
{{sort array}}            # Sort array
{{unique array}}          # Remove duplicates
{{pluck array key}}       # Extract property
{{filter array callback}} # Filter items
{{map array callback}}    # Transform items
{{concat arr1 arr2}}      # Concatenate
{{slice array start end}} # Slice array
{{indexOf array value}}   # Find index
{{includes array value}}  # Check inclusion
```

---

## Object Helpers (handlebars-helpers)

```yaml
{{keys object}}           # Get keys
{{values object}}         # Get values
{{pick object key1 key2}} # Select keys
{{omit object key1 key2}} # Exclude keys
{{extend obj1 obj2}}      # Merge objects
{{get object path}}       # Get nested value
{{lookup object key}}     # Dynamic lookup
{{hasOwn object key}}     # Check property
```

---

## Date Helpers (handlebars-helpers)

```yaml
{{now}}                   # Current timestamp
{{moment date format}}    # Format date
{{year date}}             # Get year
{{month date}}            # Get month
{{day date}}              # Get day
```

---

## Helper Composition

Helpers can be nested:

```yaml
# Clamp value between 1 and 10
replicas: {{min (max replicas 1) 10}}

# Merge and serialize
env: {{json (merge defaults overrides)}}

# Conditional with comparison
{{#if (and (gt replicas 1) enabled)}}
  highAvailability: true
{{/if}}

# Read, parse, and access
version: {{get (parse (read "package.json")) "version"}}
```

## See Also

- [Handlebars Templating Guide](../guides/03-handlebars-templating.md)
- [Custom Helpers Guide](../guides/04-custom-helpers.md)
- [handlebars-helpers documentation](https://github.com/helpers/handlebars-helpers)
