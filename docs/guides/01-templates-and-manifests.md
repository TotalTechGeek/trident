# Templates and Manifests

This guide covers templates and manifests in depth.

## Manifest Structure

### Basic Manifest

A manifest is a multi-document YAML file where each document is an item to process:

```yaml
name: api
port: 8080
---
name: web
port: 3000
```

### Complex Data Structures

Manifest items can contain any valid YAML:

```yaml
name: api
replicas: 3
env:
  DATABASE_URL: postgres://localhost/db
  REDIS_URL: redis://localhost
ports:
  - 8080
  - 8443
labels:
  team: backend
  tier: api
---
name: web
replicas: 2
env:
  API_URL: http://api:8080
ports:
  - 3000
labels:
  team: frontend
  tier: web
```

### The `name` Field

By default, every manifest item must have a `name` field. This can be customized via schema, but `name` is a sensible default for most use cases.

## Template Structure

### Basic Template

```yaml
$out: {{name}}/config.yaml
service: {{name}}
port: {{port}}
```

### Multiple Output Documents

Generate multiple files per manifest item using `---`:

```yaml
$out: {{name}}/deployment.yaml
kind: Deployment
metadata:
  name: {{name}}
---
$out: {{name}}/service.yaml
kind: Service
metadata:
  name: {{name}}-svc
---
$out: {{name}}/configmap.yaml
kind: ConfigMap
metadata:
  name: {{name}}-config
```

### Output Formats

The output format is determined by the file extension in `$out`:

| Extension | Format |
|-----------|--------|
| `.yaml`, `.yml` | YAML |
| `.json` | JSON |
| `.xml` | XML |
| Other | YAML (default) |

```yaml
# Outputs JSON
$out: {{name}}/config.json
name: {{name}}
settings:
  debug: true
```

### Outputting Without a Base (`$in`)

When you omit `$in`, the template content itself becomes the output:

```yaml
$out: {{name}}/standalone.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{name}}-config
data:
  KEY: value
```

## Using Base Configurations

### The `$in` Directive

Merge template values with a base configuration:

```yaml
# base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: placeholder
  labels:
    managed-by: trident
spec:
  replicas: 1
  selector:
    matchLabels:
      app: placeholder
```

```yaml
# template.yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
  labels:
    app: {{name}}
spec:
  replicas: {{replicas}}
  selector:
    matchLabels:
      app: {{name}}
```

### How Merging Works

Trident performs a deep merge:

1. Start with the base configuration
2. Recursively merge template values
3. Template values override base values at the same path
4. Arrays are replaced, not merged

### Supported Base Formats

- YAML (`.yaml`, `.yml`)
- JSON (`.json`)
- XML (`.xml`)

## String Replacement with `$replace`

For cases where you need literal string replacement:

```yaml
$in: base/config.yaml
$out: {{name}}/config.yaml
$replace:
  __SERVICE_NAME__: {{name}}
  __ENVIRONMENT__: production
```

This replaces all occurrences of `__SERVICE_NAME__` and `__ENVIRONMENT__` in the output.

**When to use `$replace`:**
- Legacy configs with placeholder patterns
- When you need to replace the same value in many places
- When the replacement target isn't a valid YAML key

## Copying Files

Copy files without templating using `$copy`:

```yaml
$copy: assets/*.txt
$out: {{name}}/assets
```

This copies all `.txt` files from `assets/` to `{{name}}/assets/`.

## Preserving `$` Properties with `$root`

Normally, `$` prefixed keys are treated as directives. To output them, use `$root`:

```yaml
$out: {{name}}/schema.yaml
$root:
  $schema: "http://json-schema.org/draft-07/schema#"
  $id: "{{name}}-schema"
type: object
properties:
  name:
    type: string
```

Output:

```yaml
$schema: "http://json-schema.org/draft-07/schema#"
$id: "api-schema"
type: object
properties:
  name:
    type: string
```

## Best Practices

### 1. Keep Manifests Data-Only

Manifests should contain data, not logic:

```yaml
# Good
name: api
replicas: 3
debug: true

# Wrong - logic belongs in templates
name: api
replicas: "{{#if production}}5{{else}}1{{/if}}"
```

### 2. Use Descriptive Output Paths

```yaml
# Good - clear structure
$out: services/{{name}}/k8s/deployment.yaml

# Less clear
$out: {{name}}.yaml
```

### 3. Leverage Base Configurations

Don't repeat common structure in templates:

```yaml
# Good - base handles boilerplate
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
spec:
  replicas: {{replicas}}

# Avoid - repeating boilerplate
$out: {{name}}/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{name}}
  labels:
    managed-by: trident
# ... lots of repeated structure
```

### 4. One Concern Per Template Document

```yaml
# Good - each document has one purpose
$out: {{name}}/deployment.yaml
kind: Deployment
# ...
---
$out: {{name}}/service.yaml
kind: Service
# ...

# Avoid - multiple resources in one file (harder to manage)
$out: {{name}}/all.yaml
kind: Deployment
# ...
# ---  (YAML separator in output, not template)
# kind: Service
```

## Next Steps

- Learn about [Schema Validation](./02-schema-validation.md)
- Explore [Handlebars Templating](./03-handlebars-templating.md)
