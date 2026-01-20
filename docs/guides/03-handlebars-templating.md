# Handlebars Templating

Trident uses [Handlebars](https://handlebarsjs.com/) as its templating language. This guide covers the essentials.

## Basic Interpolation

Insert values with double curly braces:

```yaml
$out: {{name}}/config.yaml
service: {{name}}
port: {{port}}
replicas: {{replicas}}
```

## Automatic JSON Serialization

Trident customizes Handlebars' escape behavior: **objects and arrays are automatically serialized to JSON**, while primitives (strings, numbers, booleans) are output as-is.

```yaml
# Manifest
name: api
port: 8080
enabled: true
labels:
  team: backend
  tier: api
ports:
  - 8080
  - 8443

# Template
$out: {{name}}/config.yaml
name: {{name}}           # api (string, as-is)
port: {{port}}           # 8080 (number, as-is)
enabled: {{enabled}}     # true (boolean, as-is)
labels: {{labels}}       # {"team":"backend","tier":"api"} (object → JSON)
ports: {{ports}}         # [8080,8443] (array → JSON)
```

This means you can embed complex data structures directly without needing the `json` helper:

```yaml
# These are equivalent:
config: {{settings}}
config: {{json settings}}
```

The `json` helper is still available when you want to be explicit or when composing with other helpers.

## Nested Properties

Access nested values with dot notation:

```yaml
# Manifest
name: api
database:
  host: localhost
  port: 5432

# Template
$out: {{name}}/config.yaml
db_url: postgres://{{database.host}}:{{database.port}}
```

## Conditionals

### `{{#if}}`

Render content conditionally:

```yaml
$out: {{name}}/config.yaml
name: {{name}}
{{#if debug}}
logging:
  level: debug
  verbose: true
{{/if}}
```

### `{{#unless}}`

Render when condition is falsy:

```yaml
{{#unless production}}
devTools: enabled
{{/unless}}
```

### `{{else}}`

Provide fallback content:

```yaml
{{#if replicas}}
replicas: {{replicas}}
{{else}}
replicas: 1
{{/if}}
```

### `{{#if}}` with `{{else if}}`

Chain conditions:

```yaml
{{#if (eq environment "production")}}
logLevel: warn
{{else if (eq environment "staging")}}
logLevel: info
{{else}}
logLevel: debug
{{/if}}
```

## Iteration

### `{{#each}}` for Arrays

```yaml
# Manifest
name: api
ports:
  - 8080
  - 8443
  - 9090

# Template
$out: {{name}}/config.yaml
ports:
{{#each ports}}
  - {{this}}
{{/each}}
```

### `{{#each}}` for Objects

```yaml
# Manifest
name: api
env:
  DATABASE_URL: postgres://localhost
  REDIS_URL: redis://localhost
  DEBUG: "true"

# Template
$out: {{name}}/config.yaml
environment:
{{#each env}}
  - name: {{@key}}
    value: {{this}}
{{/each}}
```

### Loop Context Variables

| Variable | Description |
|----------|-------------|
| `{{this}}` | Current item |
| `{{@key}}` | Current key (objects) |
| `{{@index}}` | Current index (arrays) |
| `{{@first}}` | True if first item |
| `{{@last}}` | True if last item |
| `{{../name}}` | Access parent context |

```yaml
{{#each items}}
  - index: {{@index}}
    value: {{this}}
    parent: {{../name}}
    {{#if @first}}isFirst: true{{/if}}
    {{#if @last}}isLast: true{{/if}}
{{/each}}
```

## Built-in Helpers

### `{{default}}`

Provide a default value:

```yaml
port: {{default port 8080}}
replicas: {{default replicas 1}}
```


### `{{min}}` and `{{max}}`

Clamp values:

```yaml
replicas: {{min replicas 10}}    # At most 10
replicas: {{max replicas 1}}     # At least 1
```

### `{{or}}`

First truthy value:

```yaml
port: {{or customPort defaultPort 8080}}
```

### `{{merge}}`

Merge objects:

```yaml
env: {{json (merge defaultEnv customEnv)}}
```

### `{{object}}`

Construct an object:

```yaml
metadata: {{json (object "name" name "version" "1.0")}}
```

## Comparison Helpers

From [handlebars-helpers](https://github.com/helpers/handlebars-helpers):

```yaml
{{#if (eq environment "production")}}...{{/if}}
{{#if (ne environment "development")}}...{{/if}}
{{#if (gt replicas 1)}}...{{/if}}
{{#if (gte replicas 1)}}...{{/if}}
{{#if (lt replicas 10)}}...{{/if}}
{{#if (lte replicas 10)}}...{{/if}}
{{#if (and condition1 condition2)}}...{{/if}}
{{#if (or condition1 condition2)}}...{{/if}}
{{#if (not condition)}}...{{/if}}
```

## String Helpers

```yaml
upper: {{uppercase name}}
lower: {{lowercase name}}
```

## Math Helpers

```yaml
doubled: {{multiply replicas 2}}
halved: {{divide replicas 2}}
incremented: {{add replicas 1}}
decremented: {{subtract replicas 1}}
```

## Whitespace Control

Use `~` to trim whitespace:

```yaml
items:
{{#each items}}
  - {{this}}
{{~/each}}
```

## Practical Examples

### Conditional Blocks in YAML

```yaml
$out: {{name}}/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{name}}
spec:
  replicas: {{default replicas 1}}
{{#if resources}}
  resources:
    {{#if resources.limits}}
    limits:
      cpu: {{default resources.limits.cpu "100m"}}
      memory: {{default resources.limits.memory "128Mi"}}
    {{/if}}
    {{#if resources.requests}}
    requests:
      cpu: {{default resources.requests.cpu "50m"}}
      memory: {{default resources.requests.memory "64Mi"}}
    {{/if}}
{{/if}}
```

### Building Environment Variables

```yaml
# Manifest
name: api
env:
  DATABASE_URL: postgres://localhost
  REDIS_URL: redis://localhost

# Template
$out: {{name}}/deployment.yaml
spec:
  containers:
    - name: {{name}}
      env:
      {{#each env}}
        - name: {{@key}}
          value: "{{this}}"
      {{/each}}
```

### Conditional Environment-Specific Config

```yaml
$out: {{name}}/config.yaml
name: {{name}}
{{#if (eq $values.environment "production")}}
logging:
  level: warn
  format: json
database:
  pool_size: 20
  ssl: true
{{else}}
logging:
  level: debug
  format: pretty
database:
  pool_size: 5
  ssl: false
{{/if}}
```

## Common Pitfalls

### 1. YAML Indentation

Handlebars output must maintain valid YAML indentation:

```yaml
# Wrong - breaks YAML
spec:
{{#if enabled}}
feature: true
{{/if}}

# Correct - proper indentation
spec:
{{#if enabled}}
  feature: true
{{/if}}
```

## Next Steps

- Explore [Helper Reference](../reference/02-helpers.md)
- Learn about [Global Values](./05-global-values.md)
