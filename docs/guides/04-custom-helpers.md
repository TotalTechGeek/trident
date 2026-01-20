# Custom Helpers

Trident provides several custom helpers beyond standard Handlebars.

## File Operations

### `{{read}}`

Read a file's contents as a string:

```yaml
$out: {{name}}/config.yaml
certificate: |
  {{read "certs/ca.pem"}}
```

### `{{hash}}`

Generate a SHA256 hash of a file's contents:

```yaml
$out: {{name}}/deployment.yaml
metadata:
  annotations:
    config-hash: {{hash "config/app.json"}}
```

This is useful for triggering redeployments when config files change.

### `{{ls}}`

List files matching a glob pattern:

```yaml
# List files
$out: {{name}}/manifest.yaml
configFiles:
{{#each (ls "configs/*.json")}}
  - {{this}}
{{/each}}

# List directories (second argument = true)
directories:
{{#each (ls "modules/*" true)}}
  - {{this}}
{{/each}}
```

### `{{read_glob}}`

Read multiple files matching a pattern. Returns objects with `name`, `path`, and `content`:

```yaml
$out: combined.yaml
configs:
{{#each (read_glob "services/*.yaml" true)}}
  - name: {{this.name}}
    data: {{json this.content}}
{{/each}}
```

The second argument (`true`) parses the content as YAML. Without it, content is a raw string.

## Data Manipulation

### `{{parse}}`

Parse a YAML/JSON string into an object:

```yaml
{{#with (parse yamlString)}}
  name: {{name}}
  value: {{value}}
{{/with}}
```

### `{{merge}}`

Deep merge objects:

```yaml
# Merge two objects
combined: {{json (merge defaults overrides)}}

# Merge multiple objects
allConfig: {{json (merge base env1 env2 custom)}}
```

### `{{object}}`

Construct an object inline:

```yaml
metadata: {{json (object "name" name "version" version "timestamp" now)}}
```

### `{{default}}`

Provide a fallback value:

```yaml
port: {{default port 8080}}
host: {{default host "localhost"}}
```

### `{{or}}`

Return first truthy value:

```yaml
database: {{or customDb defaultDb "postgres://localhost"}}
```

### `{{min}}` and `{{max}}`

Numeric bounds:

```yaml
# Ensure replicas is at most 10
replicas: {{min replicas 10}}

# Ensure replicas is at least 1
replicas: {{max replicas 1}}

# Clamp between 1 and 10
replicas: {{min (max replicas 1) 10}}
```

## Validation

### `{{validate}}`

Validate data against a JSON Schema:

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

Throws an error if validation fails.

## Using `read_glob` for Dynamic Manifests

One powerful pattern is using `read_glob` to dynamically generate manifest entries:

```yaml
# template.yaml
$template: inner/template.yaml
$manifest: {{read_glob "services/*.yaml" true}}
```

This discovers all YAML files in `services/` and uses them as manifest items. The inner template accesses the parsed content via `{{content.field}}`:

```yaml
# inner/template.yaml
$out: {{content.name}}/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{content.name}}
spec:
  replicas: {{content.replicas}}
```

## Combining Helpers

Helpers can be composed:

```yaml
# Merge defaults with overrides, output as JSON
env: {{json (merge defaultEnv (object "CUSTOM" customValue))}}

# Read and parse a config, access a field
version: {{lookup (parse (read "package.json")) "version"}}

# Conditional with comparison
{{#if (and (gt replicas 1) (not singleInstance))}}
  highAvailability: true
{{/if}}
```

## Practical Examples

### Config Hash Annotation

Force redeployment when configs change:

```yaml
$out: {{name}}/deployment.yaml
metadata:
  annotations:
    checksum/config: {{hash "configs/{{name}}.yaml"}}
    checksum/secrets: {{hash "secrets/{{name}}.yaml"}}
```

### Dynamic Service Discovery

Generate a combined config from multiple files:

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
  pool: {{min (default database.pool 10) (default $values.maxPool 20)}}
```

### Reusable Partial Templates

```yaml
# partials/labels.yaml
labels:
  app: {{name}}
  team: {{default team "platform"}}
  environment: {{$values.environment}}
```

```yaml
# template.yaml
$out: {{name}}/deployment.yaml
metadata:
  {{indent (use "partials/labels.yaml") 2}}
```

## Next Steps

- Learn about [Global Values](./05-global-values.md)
- Explore [Nested Templates](./06-nested-templates.md)
