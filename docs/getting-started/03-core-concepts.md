# Core Concepts

A deeper look at Trident's multiplicative model and how its pieces fit together.

## Why Multiplication?

Traditional templating works like this: one input → one output. You run a template, you get a file. Need 10 files? Run it 10 times with different inputs.

Trident works differently: N inputs × M templates → N×M outputs, in one pass.

This matters because configuration often has this shape:
- You have **things** (services, environments, users)
- Each thing needs the **same kinds of files** (deployment, service, config)
- The files are structurally identical but with different values

Multiplication captures this naturally. Instead of scripting loops or copy-pasting, you describe *what* you have and *what each thing needs*, and Trident generates the cross-product.

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

## Manifests: Describing What You Have

A manifest is a multi-document YAML file. Each document (separated by `---`) is one item:

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
- Each `---` creates a new item
- Items can have any structure—use what your templates need
- By default, each item needs a `name` field (used for merging)
- Items don't need identical fields (`worker` has no `port`)

Manifests answer: "What things exist and what are their properties?"

## Templates: Describing What to Generate

Templates define output files. Each document produces one file per manifest item:

```yaml
# template.yaml

# $out: where to write this file
# Handlebars syntax {{...}} pulls values from the manifest item
$out: {{name}}/config.yaml
service:
  name: {{name}}
  port: {{port}}
  replicas: {{replicas}}
---
# Second document = second file per item
$out: {{name}}/metadata.json
name: {{name}}
team: {{team}}
```

**Key points:**
- `$out` specifies the output path (required)
- `$out` works on its own—no base file needed
- Handlebars `{{...}}` interpolates values from manifest items
- Each `---` creates another output file per item
- Output format is determined by extension (`.yaml`, `.json`, `.xml`)

Templates answer: "What files does each thing need?"

## Base Files and Deep Merge

When templates share common structure, you can use `$in` to start with a base file:

```yaml
# base/deployment.yaml — shared boilerplate
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    managed-by: trident
    tier: backend
spec:
  replicas: 1
```

```yaml
# template.yaml — patches the base
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
  labels:
    app: {{name}}
spec:
  replicas: {{replicas}}
```

Trident performs a **deep merge**: it recursively combines the base and template objects.

### How Deep Merge Works

```
Base:                          Template:                     Result:
apiVersion: apps/v1            (not specified)         →     apiVersion: apps/v1
kind: Deployment               (not specified)         →     kind: Deployment
metadata:                      metadata:                     metadata:
  labels:                        name: api             →       name: api
    managed-by: trident          labels:                      labels:
    tier: backend                  app: api            →         managed-by: trident
                                                                 tier: backend
                                                                 app: api
spec:                          spec:                         spec:
  replicas: 1                    replicas: 3           →       replicas: 3
```

**The rules:**
1. **Objects merge recursively** — keys from both sides are preserved
2. **Template wins conflicts** — when the same key exists, template value is used
3. **Arrays replace** — arrays are not merged, they're overwritten entirely

Deep merge lets you keep boilerplate in one place (the base) while templates focus on what's unique.

## Merging Multiple Manifests

Manifests themselves can be merged. This enables base + override patterns:

```yaml
# services/base.yaml — defaults for all environments
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
```

```yaml
# services/prod.yaml — production overrides
name: api
replicas: 5
resources:
  cpu: 500m
```

```yaml
# template.yaml
$template: deploy.yaml
$manifest:
  - services/base.yaml
  - services/prod.yaml
```

Items with the same `name` are deep merged:

**Result for `api`:**
```yaml
name: api
replicas: 5          # overridden
resources:
  cpu: 500m          # overridden
  memory: 128Mi      # preserved from base
```

**Result for `web`:**
```yaml
name: web
replicas: 1          # no override
resources:
  cpu: 100m
  memory: 128Mi
```

This lets you define sensible defaults once, then layer environment-specific overrides on top.

## Schemas: Validation and Defaults

Schemas validate manifest items and fill in missing values:

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

Schemas catch errors early (wrong types, missing required fields) and reduce repetition in manifests.

## Nested Templates

Templates can invoke other templates, creating nested multiplication:

```yaml
# template.yaml — iterates environments
$template: services/template.yaml
$manifest: services/manifest.yaml
environment: {{name}}
---
# manifest.yaml (environments)
name: dev
---
name: prod
```

```yaml
# services/template.yaml — iterates services
$out: {{environment}}/{{name}}/deployment.yaml
...
---
$out: {{environment}}/{{name}}/service.yaml
...
```

```yaml
# services/manifest.yaml (services)
name: api
---
name: web
---
name: worker
```

**Total output:** 2 environments × 3 services × 2 files = **12 files**

Nesting lets you model hierarchical structures (environments → services → files) naturally.

## The Processing Pipeline

Here's what happens when Trident runs:

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
   a. Render Handlebars expressions
   b. If $in specified, deep merge with base
   c. Write to $out path
```

## Global Values

Pass values to all manifest items via CLI:

```bash
trident -i . -v environment=prod -f config=prod.json
```

Access via `$values`:

```yaml
$out: {{name}}/config.yaml
environment: {{$values.environment}}
database: {{$values.config.database.host}}
```

`$values` is useful for environment-specific settings that apply across all items.

## Summary

| Concept | What it does | Why it matters |
|---------|--------------|----------------|
| **Manifests** | List your items | Define what exists once, generate files for all |
| **Templates** | Define output files | Each item gets the same file types automatically |
| **`$out`** | Output file path | Works standalone—no base file required |
| **`$in`** | Base configuration | Extract boilerplate, templates stay focused |
| **Deep merge** | Combine objects recursively | Override specific keys without repeating everything |
| **Manifest merging** | Combine manifests by name | Base defaults + environment overrides |
| **Schemas** | Validate and set defaults | Catch errors early, reduce manifest repetition |
| **Nested templates** | Templates invoke templates | Model hierarchies naturally |
| **`$values`** | Global configuration | Environment settings available everywhere |

## Next Steps

- [Templates and Manifests Guide](../guides/01-templates-and-manifests.md) — detailed patterns
- [Schema Validation](../guides/02-schema-validation.md) — defining and using schemas
- [Multi-Environment Recipe](../recipes/02-multi-environment.md) — real-world example
