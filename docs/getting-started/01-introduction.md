# Introduction to Trident

Trident is a **multiplicative templating engine** for generating configuration files. It takes your data, multiplies it through templates, and layers patches on top to produce many output files from minimal input.

## The Multiplicative Model

At its core, Trident performs multiplication:

```
Output Files = Manifests × Templates
```

- **Manifests** define your data (services, environments, configurations)
- **Templates** define what files to generate for each manifest item
- The result is the **cross product**: every manifest item processed through every template document

### A Simple Example

**3 services** × **2 template documents** = **6 output files**

```yaml
# manifest.yaml (3 items)
name: api
---
name: web
---
name: worker
```

```yaml
# template.yaml (2 documents)
$out: {{name}}/deployment.yaml
kind: Deployment
metadata:
  name: {{name}}
---
$out: {{name}}/service.yaml
kind: Service
metadata:
  name: {{name}}-svc
```

Result:
```
api/deployment.yaml      # api × deployment
api/service.yaml         # api × service
web/deployment.yaml      # web × deployment
web/service.yaml         # web × service
worker/deployment.yaml   # worker × deployment
worker/service.yaml      # worker × service
```

## Layering: Patches on Top

After multiplication, Trident applies **patches**. Use a base configuration and overlay your changes:

```yaml
# base/deployment.yaml (shared boilerplate)
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    managed-by: trident
spec:
  replicas: 1
```

```yaml
# template.yaml (patches on top)
$in: base/deployment.yaml    # Start with base
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}             # Patch the name
spec:
  replicas: {{replicas}}     # Patch replicas
```

The base provides defaults and boilerplate. The template patches in service-specific values. The result is a deep merge.

## Merging Multiple Manifests

Manifests can be **merged** by name. This lets you define base configurations and environment-specific overrides:

```yaml
# base-manifest.yaml
name: api
replicas: 1
resources:
  cpu: 100m
---
name: web
replicas: 1
resources:
  cpu: 100m
```

```yaml
# prod-overrides.yaml
name: api
replicas: 5           # Override for prod
resources:
  cpu: 500m           # Override for prod
---
name: web
replicas: 3           # Override for prod
```

When you specify multiple manifests, items with the same `name` are deep merged:

```yaml
$template: deploy/template.yaml
$manifest:
  - base-manifest.yaml
  - prod-overrides.yaml
```

Result for `api`: `replicas: 5`, `cpu: 500m` (overrides win)
Result for `web`: `replicas: 3`, `cpu: 100m` (partial override)

## Why Multiplicative?

This model is powerful because:

1. **DRY (Don't Repeat Yourself)** - Define each service once, generate all its files
2. **Consistency** - All services get the same template treatment
3. **Scalability** - Add a service to the manifest, get all its files automatically
4. **Flexibility** - Override specific values per environment without duplication

## Comparison with Other Tools

| Feature | Trident | Helm | Kustomize |
|---------|---------|------|-----------|
| Templating | Yes (Handlebars) | Yes (Go templates) | No |
| Patching/Overlay | Yes | No | Yes |
| Multiplicative | Yes | Limited | No |
| Manifest Merging | Yes | No | Yes (overlays) |
| Kubernetes-specific | No | Yes | Yes |

## Key Features

- **Multiplicative output** - Manifests × Templates = Many files
- **Deep merge patching** - Layer templates over base configurations
- **Manifest merging** - Combine multiple manifests by name
- **Multi-format support** - YAML, JSON, XML, and plain text output
- **Schema validation** - Validate inputs and apply defaults with JSON Schema
- **Nested templates** - Templates can invoke other templates (nested multiplication)
- **Dynamic discovery** - Use globs to discover manifest items from files

## Next Steps

Ready to try it? Head to the [Quick Start](./02-quick-start.md) guide.
