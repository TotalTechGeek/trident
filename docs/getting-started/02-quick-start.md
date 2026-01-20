# Quick Start

This guide demonstrates Trident's multiplicative model in under 5 minutes.

## Installation

```bash
npm install -g trident-template
```

## Your First Multiplicative Template

Let's create a project that generates configuration files for multiple services.

### Step 1: Create the Project

```bash
mkdir my-trident-project
cd my-trident-project
```

### Step 2: Create a Manifest

The manifest defines your data. Each document (separated by `---`) is one item:

```yaml
# manifest.yaml
name: api
port: 8080
replicas: 3
---
name: web
port: 3000
replicas: 2
---
name: worker
replicas: 5
```

You now have **3 manifest items**.

### Step 3: Create a Template

The template defines what files to generate. Each document produces one file per manifest item:

```yaml
# template.yaml
$out: {{name}}/config.yaml
service:
  name: {{name}}
  port: {{port}}
  replicas: {{replicas}}
---
$out: {{name}}/metadata.json
name: {{name}}
type: microservice
```

You now have **2 template documents**.

### Step 4: Run Trident

```bash
trident -i .
```

### Step 5: See the Multiplication

**3 manifests × 2 templates = 6 files**

```
my-trident-project/
├── api/
│   ├── config.yaml
│   └── metadata.json
├── web/
│   ├── config.yaml
│   └── metadata.json
├── worker/
│   ├── config.yaml
│   └── metadata.json
├── manifest.yaml
└── template.yaml
```

Each service got both files. Add a 4th service to the manifest and you'll get 8 files.

## Adding Patches with Base Configurations (Optional)

The examples above use `$out` on its own, which is often all you need. But when you have shared boilerplate, you can optionally use `$in` to layer patches on top of a base configuration.

### Create a Base Configuration

```yaml
# base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    managed-by: trident
    tier: backend
spec:
  replicas: 1
  selector:
    matchLabels: {}
```

### Update Your Template to Patch It

```yaml
# template.yaml
$in: base/deployment.yaml      # Start with base
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}               # Patch in the name
  labels:
    app: {{name}}              # Add a label
spec:
  replicas: {{replicas}}       # Patch replicas
  selector:
    matchLabels:
      app: {{name}}
```

The output is a **deep merge**: base values + template patches.

```yaml
# api/deployment.yaml (result)
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    managed-by: trident    # From base
    tier: backend          # From base
    app: api               # From template
spec:
  replicas: 3              # From template (was 1 in base)
  selector:
    matchLabels:
      app: api
```

## Merging Multiple Manifests

You can merge manifests by name to handle environment-specific overrides.

### Create a Base Manifest

```yaml
# manifest.yaml
name: api
replicas: 1
---
name: web
replicas: 1
```

### Create Environment Overrides

```yaml
# prod-overrides.yaml
name: api
replicas: 10
---
name: web
replicas: 5
```

### Use Both in Your Template

```yaml
# template.yaml
$template: deploy.yaml
$manifest:
  - manifest.yaml
  - prod-overrides.yaml
```

Items with the same `name` are merged. The `api` service gets `replicas: 10` (from override).

## Dry Run Mode

Preview what would be generated without writing files:

```bash
trident -i . --dry
```

Output shows each file that would be created:
```
>> api/deployment.yaml
apiVersion: apps/v1
kind: Deployment
...

>> web/deployment.yaml
...
```

## Passing Values via CLI

Pass values available to all manifest items:

```bash
trident -i . -v environment=production -v region=us-west-2
```

Access in templates via `$values`:

```yaml
$out: {{name}}/config.yaml
environment: {{$values.environment}}
region: {{$values.region}}
```

## Summary

| Concept | What it does |
|---------|--------------|
| **Manifests** | Define your data (services, configs, etc.) |
| **Templates** | Define what files to generate |
| **Multiplication** | Each manifest item × each template document |
| **Patches** | Optionally layer template values over base configurations |
| **Merging** | Combine multiple manifests by name |

## Next Steps

- Understand [Core Concepts](./03-core-concepts.md) in depth
- Learn about [Schema Validation](../guides/02-schema-validation.md) for defaults
- See [Multi-Environment Recipe](../recipes/02-multi-environment.md) for real-world patterns
