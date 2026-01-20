# Global Values

Global values let you share configuration across all manifest items. They're accessible via `$values` in templates.

## Setting Values via CLI

### Direct Values (`-v`)

Pass key-value pairs directly:

```bash
trident -i . -v environment=production -v region=us-west-2
```

Access in templates:

```yaml
$out: {{name}}/config.yaml
environment: {{$values.environment}}
region: {{$values.region}}
```

### File Values (`-f`)

Import from a JSON or YAML file:

```json
// prod.json
{
  "environment": "production",
  "region": "us-west-2",
  "database": {
    "host": "prod-db.example.com",
    "port": 5432
  }
}
```

```bash
trident -i . -f config=prod.json
```

Access in templates:

```yaml
$out: {{name}}/config.yaml
environment: {{$values.config.environment}}
database: {{$values.config.database.host}}:{{$values.config.database.port}}
```

### Auto-Named File Values

Without a key prefix, the filename becomes the key:

```bash
trident -i . -f prod.json
# Accessible as $values.prod
```

## Setting Values in Templates

### The `$values` Directive

Import values within a template:

```yaml
$out: {{name}}/config.yaml
$values:
  - env: environment.json
name: {{name}}
database: {{$values.env.database}}
```

### Inline Objects

Define values directly:

```yaml
$values:
  - settings:
      timeout: 30
      retries: 3
      debug: false
```

Access as `{{$values.settings.timeout}}`.

### Templated Imports

Use manifest values in import paths:

```yaml
$values:
  - config: configs/{{name}}.json
```

Each manifest item loads its own config file.

### Import to Root

Import directly to `$values` root using `.`:

```yaml
$values:
  - '.': globals.json
```

Now `globals.json` fields are at `$values.field` instead of `$values.globals.field`.

### Multiple Imports (Merged)

Import multiple files to the same key:

```yaml
$values:
  - env: defaults.json
  - env: overrides.json
```

Files are deep merged in order.

## Value Precedence

Values are merged in this order (later wins):

1. CLI `-v` values
2. CLI `-f` file values
3. Template `$values` directive (in order)

```bash
trident -i . -v environment=cli-value -f config.json
```

```yaml
$values:
  - '.': template-values.json

# $values.environment = "cli-value" (CLI wins)
```

## Passing Values to Nested Templates

When using `$template`, values are automatically passed:

```yaml
# parent/template.yaml
$template: child/template.yaml
$manifest: child/manifest.yaml
$values:
  - parentConfig: parent.json
customValue: from-parent
```

The child template receives:
- All `$values` from parent
- Properties from the parent template (`customValue`)
- Its own manifest item values

```yaml
# child/template.yaml
$out: {{name}}/config.yaml
parent: {{$values.parentConfig.field}}
custom: {{customValue}}
local: {{localField}}
```

## Environment-Based Configuration

A common pattern for multi-environment setups:

```
project/
├── template.yaml
├── manifest.yaml
├── environments/
│   ├── dev.json
│   ├── staging.json
│   └── prod.json
```

```bash
# Development
trident -i . -f env=environments/dev.json

# Production
trident -i . -f env=environments/prod.json
```

```yaml
# template.yaml
$out: {{name}}/config.yaml
environment: {{$values.env.name}}
database: {{$values.env.database.host}}
replicas: {{$values.env.defaultReplicas}}
```

## Combining with Schema Defaults

Use `$values` for environment config, schema for item defaults:

```json
// schema.json
{
  "properties": {
    "name": { "type": "string" },
    "replicas": {
      "type": "integer",
      "default": 1
    }
  }
}
```

```yaml
# template.yaml
$out: {{name}}/deployment.yaml
replicas: {{multiply replicas $values.env.replicaMultiplier}}
```

```yaml
# manifest.yaml
name: api
# replicas defaults to 1 from schema
---
name: critical-api
replicas: 3
# explicit replicas = 3
```

## Practical Examples

### Multi-Region Deployment

```bash
trident -i . -v region=us-west-2 -v cluster=prod-west
trident -i . -v region=us-east-1 -v cluster=prod-east
```

```yaml
$out: {{name}}/deployment.yaml
metadata:
  labels:
    region: {{$values.region}}
    cluster: {{$values.cluster}}
```

### Feature Flags

```json
// features.json
{
  "newCheckout": true,
  "darkMode": false,
  "analytics": true
}
```

```bash
trident -i . -f features=features.json
```

```yaml
$out: {{name}}/config.yaml
features:
{{#if $values.features.newCheckout}}
  newCheckout: enabled
{{/if}}
{{#if $values.features.darkMode}}
  darkMode: enabled
{{/if}}
```

## Next Steps

- Learn about [Nested Templates](./06-nested-templates.md)
- See [Multi-Environment Recipe](../recipes/02-multi-environment.md)
