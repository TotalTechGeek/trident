# Core Concepts

Understanding Trident's multiplicative model and layering system.

## The Multiplication Formula

Trident generates output through multiplication:

```
Output Files = Manifests × Template Documents
```

Every manifest item is processed through every template document. This cross product is what makes Trident powerful.

### Visualizing the Multiplication

```
Manifests:           Templates:              Output:
┌─────────┐         ┌─────────────┐
│   api   │    ×    │ deployment  │    →    api/deployment.yaml
│         │         │             │    →    api/service.yaml
├─────────┤         ├─────────────┤
│   web   │    ×    │  service    │    →    web/deployment.yaml
│         │         │             │    →    web/service.yaml
├─────────┤         └─────────────┘
│ worker  │                            →    worker/deployment.yaml
│         │                            →    worker/service.yaml
└─────────┘

3 items      ×      2 documents    =   6 files
```

## Manifests: Your Data

A manifest is a multi-document YAML file. Each document is one item to process:

```yaml
# manifest.yaml
name: api
port: 8080
replicas: 3
team: backend
---
name: web
port: 3000
replicas: 2
team: frontend
---
name: worker
replicas: 5
team: platform
```

**Key points:**
- Each `---` separator creates a new manifest item
- Items can have any structure
- By default, each item needs a `name` field

## Templates: Your Output Rules

Templates define what files to generate. Each document (separated by `---`) is one output rule:

```yaml
# template.yaml
$out: {{name}}/deployment.yaml
kind: Deployment
metadata:
  name: {{name}}
spec:
  replicas: {{replicas}}
---
$out: {{name}}/service.yaml
kind: Service
metadata:
  name: {{name}}-svc
spec:
  ports:
    - port: {{port}}
```

**Key points:**
- `$out` specifies the output file path (the only required directive)
- `$out` can be used on its own—`$in` is optional
- Handlebars `{{...}}` interpolates manifest values
- Each document produces one file per manifest item

## Patches: Layering with Base Configurations

When you need to share common boilerplate across templates, you can optionally use `$in` to layer template values over a base configuration using deep merge. This is entirely optional—many use cases work fine with just `$out`.

### Without Patches (Pure Template)

```yaml
$out: {{name}}/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{name}}
# ... you repeat all the boilerplate
```

### With Patches (Base + Overlay)

```yaml
# base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    managed-by: trident
spec:
  replicas: 1
  template:
    spec:
      containers: []
```

```yaml
# template.yaml
$in: base/deployment.yaml    # Start with base
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}             # Patch
spec:
  replicas: {{replicas}}     # Patch
```

**Result:** Deep merge of base + template patches.

### How Deep Merge Works

```yaml
# Base                          # Template Patch
metadata:                       metadata:
  labels:                         name: api        # Added
    managed-by: trident           labels:
spec:                               app: api       # Added
  replicas: 1                   spec:
                                  replicas: 3      # Overwritten

# Result (merged)
metadata:
  name: api                     # From patch
  labels:
    managed-by: trident         # From base (preserved)
    app: api                    # From patch (added)
spec:
  replicas: 3                   # From patch (overwrote base)
```

## Merging Multiple Manifests

Multiple manifests can be merged by `name`. This enables base + override patterns:

```yaml
$template: deploy/template.yaml
$manifest:
  - services/base.yaml
  - services/prod-overrides.yaml
```

### How Manifest Merging Works

```yaml
# services/base.yaml
name: api
replicas: 1
resources:
  cpu: 100m
  memory: 128Mi
---
name: web
replicas: 1
resources:
  cpu: 100m
  memory: 128Mi

# services/prod-overrides.yaml
name: api
replicas: 5
resources:
  cpu: 500m
```

**Merged result for `api`:**
```yaml
name: api
replicas: 5          # Overridden
resources:
  cpu: 500m          # Overridden
  memory: 128Mi      # Preserved from base
```

**Merged result for `web`:**
```yaml
name: web
replicas: 1          # No override, keeps base
resources:
  cpu: 100m
  memory: 128Mi
```

Items are matched by `name` and deep merged. Items in overrides that don't exist in base are added.

## Schemas: Validation and Defaults

Schemas validate manifest items and apply defaults:

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "replicas": {
      "type": "integer",
      "default": 1,
      "minimum": 1
    },
    "port": {
      "type": "integer",
      "default": 8080
    }
  },
  "required": ["name"]
}
```

Now manifests can omit optional fields:

```yaml
name: worker
# replicas defaults to 1
# port defaults to 8080
```

## The Complete Pipeline

```
1. Load manifest items
          ↓
2. Merge multiple manifests (by name)
          ↓
3. Validate each item against schema
          ↓
4. Apply schema defaults
          ↓
5. For each item × each template document:
   a. Render Handlebars template
   b. If $in specified, deep merge with base
   c. Write to $out path
```

## Nested Multiplication

Templates can invoke other templates, creating nested multiplication:

```yaml
# template.yaml (2 environments)
$template: services/template.yaml
$manifest: services/manifest.yaml
environment: {{name}}
---
# manifest.yaml
name: dev
---
name: prod
```

```yaml
# services/template.yaml (2 file types)
$out: {{environment}}/{{name}}/deployment.yaml
...
---
$out: {{environment}}/{{name}}/service.yaml
...
```

```yaml
# services/manifest.yaml (3 services)
name: api
---
name: web
---
name: worker
```

**Total output:** 2 environments × 3 services × 2 files = **12 files**

## Global Values

Pass values available to all manifest items:

```bash
trident -i . -v environment=prod -f config=prod.json
```

Access via `$values`:

```yaml
$out: {{name}}/config.yaml
environment: {{$values.environment}}
database: {{$values.config.database.host}}
```

## Summary

| Concept | Purpose |
|---------|---------|
| **Manifests** | Define your data items |
| **Templates** | Define output files (multiplicative) |
| **Patches** | Layer template values over base configs |
| **Manifest Merging** | Combine manifests by name for overrides |
| **Schemas** | Validate items and apply defaults |
| **Nested Templates** | Multiply through sub-templates |
| **Global Values** | Share config across all items |

## Next Steps

- Deep dive into [Templates and Manifests](../guides/01-templates-and-manifests.md)
- Learn about [Schema Validation](../guides/02-schema-validation.md)
- See [Multi-Environment Recipe](../recipes/02-multi-environment.md) for real patterns
