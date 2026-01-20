# Nested Templates

Trident templates can invoke other templates, enabling modular and reusable configurations.

## Why Nest Templates?

There are two main reasons to use nested templates:

1. **Project organization** — A root template acts as an entry point that orchestrates sub-templates with their correct manifests and configurations. This is especially useful when you have different kinds of resources (services, jobs, configmaps) that each need their own template/manifest pairs.

2. **Multiplicative composition** — Outer templates multiply with inner templates. For example, iterating over environments in the outer template and services in the inner template produces `environments × services × files`.

Both patterns are common and can be combined.

## Project Root Pattern

A root template can serve as your project's entry point, configuring which sub-templates to run with which manifests:

```yaml
# template.yaml — project root
# Backend services use their own template and get prod overrides
$template: backend/template.yaml
$manifest:
  - backend/manifest.yaml
  - backend/{{$values.env}}-overrides.yaml
$schema: backend/schema.json
---
# Frontend services have different structure
$template: frontend/template.yaml
$manifest:
  - frontend/manifest.yaml
  - frontend/{{$values.env}}-overrides.yaml
---
# Shared infrastructure
$template: infra/template.yaml
$manifest: infra/manifest.yaml
```

Run with:
```bash
trident -i . -v env=prod
```

This pattern keeps your entry point clean and declarative—it says "run these templates with these manifests" without containing any output logic itself.

## Basic Nesting

Use `$template` and `$manifest` to call another template:

```yaml
# template.yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
```

This processes `services/template.yaml` with `services/manifest.yaml`.

## Multiple Template Invocations

Call different templates in sequence:

```yaml
# template.yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
---
$template: jobs/template.yaml
$manifest: jobs/manifest.yaml
---
$template: configmaps/template.yaml
$manifest: configmaps/manifest.yaml
```

## Passing Context to Child Templates

Values flow from parent to child:

```yaml
# parent/template.yaml
$template: child/template.yaml
$manifest: child/manifest.yaml
$values:
  - shared: shared-config.json
parentValue: "from-parent"
environment: {{$values.env}}
```

The child template can access:
- `$values.shared` - imported values
- `parentValue` - direct property
- `environment` - templated from parent's context

```yaml
# child/template.yaml
$out: {{name}}/config.yaml
parent: {{parentValue}}
env: {{environment}}
shared: {{$values.shared.key}}
local: {{localField}}
```

## Dynamic Manifests with `read_glob`

Discover manifest items dynamically:

```yaml
# template.yaml
$template: services/template.yaml
$manifest: {{read_glob "services/configs/*.yaml" true}}
```

Each file in `services/configs/` becomes a manifest item. Access parsed content via `content`:

```yaml
# services/template.yaml
$out: {{content.name}}/deployment.yaml
metadata:
  name: {{content.name}}
spec:
  replicas: {{content.replicas}}
```

## Merging Multiple Manifests

Combine manifests by passing an array:

```yaml
$template: services/template.yaml
$manifest:
  - services/base.yaml
  - services/{{$values.env}}-overrides.yaml
```

Items with the same `name` are deep merged:

```yaml
# services/base.yaml
name: api
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

Result: api gets `replicas: 5`, `cpu: 500m`, `memory: 128Mi`

## Nested Template with Schema

Apply a schema to the nested template:

```yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
$schema: services/schema.json
```

## Changing Output Directory

Use `$chdir` to set the working directory for nested output:

```yaml
# template.yaml - processes multiple environments
$chdir: output/{{name}}
---
$template: services/template.yaml
$manifest: services/manifest.yaml
```

```yaml
# manifest.yaml
name: dev
---
name: prod
```

Output structure:
```
output/
├── dev/
│   └── (services output)
└── prod/
    └── (services output)
```

## Complete Multi-Level Example

```
project/
├── template.yaml
├── manifest.yaml
├── services/
│   ├── template.yaml
│   ├── manifest.yaml
│   └── base/
│       └── deployment.yaml
└── environments/
    ├── dev.json
    └── prod.json
```

```yaml
# template.yaml (top level)
$chdir: output/{{name}}
---
$template: services/template.yaml
$manifest: services/manifest.yaml
$values:
  - env: environments/{{name}}.json
environment: {{name}}
```

```yaml
# manifest.yaml (environments)
name: dev
---
name: prod
```

```yaml
# services/template.yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
  labels:
    environment: {{environment}}
spec:
  replicas: {{multiply replicas $values.env.replicaMultiplier}}
```

```yaml
# services/manifest.yaml
name: api
replicas: 2
---
name: web
replicas: 1
```

Running `trident -i .` produces:

```
output/
├── dev/
│   ├── api/
│   │   └── deployment.yaml
│   └── web/
│       └── deployment.yaml
└── prod/
    ├── api/
    │   └── deployment.yaml
    └── web/
        └── deployment.yaml
```

## Best Practices

### 1. Use a Root Template for Complex Projects

For projects with multiple resource types, create a root template that orchestrates everything:

```yaml
# template.yaml — single entry point
$template: services/template.yaml
$manifest:
  - services/base.yaml
  - services/{{$values.env}}.yaml
---
$template: jobs/template.yaml
$manifest: jobs/manifest.yaml
---
$template: config/template.yaml
$manifest: config/manifest.yaml
```

Benefits:
- One command runs everything: `trident -i . -v env=prod`
- Environment-specific overrides are configured in one place
- Easy to see project structure at a glance
- Sub-templates stay focused on their specific output

### 2. Keep Templates Focused

Each template should do one thing well:

```yaml
# Good - focused templates
$template: deployments/template.yaml
$manifest: manifest.yaml
---
$template: services/template.yaml
$manifest: manifest.yaml
---
$template: configmaps/template.yaml
$manifest: manifest.yaml
```

### 2. Use `$chdir` for Organization

Keep output organized by environment or category:

```yaml
$chdir: output/{{$values.environment}}/{{category}}
```

### 3. Share Common Values

Pass shared config via `$values`:

```yaml
$template: child/template.yaml
$manifest: child/manifest.yaml
$values:
  - common: common-config.json
```

### 4. Use Schema at Each Level

Validate at each nesting level:

```yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
$schema: services/schema.json
```

### 5. Document Template Interfaces

Comment expected inputs:

```yaml
# services/template.yaml
# Expected context:
#   - name: service name
#   - replicas: replica count
#   - $values.env: environment config
# Expected $values.env:
#   - replicaMultiplier: number
#   - registry: container registry URL

$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
# ...
```

## Next Steps

- See the [Multi-Environment Recipe](../recipes/02-multi-environment.md)
- Explore [Dynamic Service Discovery](../recipes/03-dynamic-discovery.md)
