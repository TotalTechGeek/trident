# Quick Start

Build a working Trident project in 5 minutes.

## Install Trident

```bash
npm install -g trident-template
```

## Step 1: Create a Project

```bash
mkdir my-configs
cd my-configs
```

## Step 2: Define Your Data (Manifest)

Create `manifest.yaml` with your services:

```yaml
# Each document (separated by ---) is one item to process
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

You now have 3 services defined. Each has different properties—the `worker` doesn't even have a `port`.

## Step 3: Define Your Output (Template)

Create `template.yaml` to specify what files to generate:

```yaml
# $out: the output path ({{name}} is replaced per service)
$out: {{name}}/deployment.yaml
kind: Deployment
metadata:
  name: {{name}}
spec:
  replicas: {{replicas}}
---
# Second document = second file type per service
$out: {{name}}/service.yaml
kind: Service
metadata:
  name: {{name}}-svc
spec:
  ports:
    - port: {{port}}
```

Each `---` separator creates another output file per manifest item.

## Step 4: Generate

```bash
trident -i .
```

## Step 5: See the Results

```
my-configs/
├── api/
│   ├── deployment.yaml
│   └── service.yaml
├── web/
│   ├── deployment.yaml
│   └── service.yaml
├── worker/
│   ├── deployment.yaml
│   └── service.yaml
├── manifest.yaml
└── template.yaml
```

**3 services × 2 template documents = 6 files**

Add a 4th service to the manifest → get 8 files. Change the template → all 6 files update.

## Preview Mode

See what would be generated without writing files:

```bash
trident -i . --dry
```

Output:
```
>> api/deployment.yaml
kind: Deployment
metadata:
  name: api
spec:
  replicas: 3

>> api/service.yaml
...
```

## Adding a Base Configuration (Optional & Recommended)

When templates share common boilerplate, extract it to a base file.

Create `base/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    managed-by: trident
spec:
  replicas: 1
  selector:
    matchLabels: {}
```

Update `template.yaml` to use it:

```yaml
# $in: start with this base file
# $out: write the merged result here
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

Trident **deep merges** the base with your template:
- The base provides `apiVersion`, `kind`, and default labels
- Your template patches in service-specific values
- Nested objects merge together (both label sets are preserved)
- Your values override the base when they conflict (`replicas`)

**Result** (`api/deployment.yaml`):
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    managed-by: trident    # from base
    app: api               # from template
spec:
  replicas: 3              # from template (base had 1)
  selector:
    matchLabels:
      app: api
```

## Merging Multiple Manifests (Optional)

Sometimes, you may have use-cases where you want to provide overrides for items in your manifest, typically per environment. Whenever you opt into several manifests, it will merge items of the same name, last writer wins. 

This allows you to create setups that allow you to bake overrides into a file, like a `prod.yaml`. 

This can be quite helpful for various GitOps setups, avoiding conflicts for environment overrides when merging between branches.

Create `manifest.yaml` (defaults):
```yaml
name: api
replicas: 1
---
name: web
replicas: 1
level: DEBUG
```

Create `prod.yaml`:
```yaml
name: api
replicas: 10
---
name: web
replicas: 5
```

Reference both in your template, usually you'll want to template this:
```yaml
# $manifest can be a list - items with the same name are merged
$template: deploy.yaml
$manifest:
  - manifest.yaml
  - {{default $values.env 'stage'}}.yaml 
```

Items with the same `name` are deep merged. The `api` service gets `replicas: 10`.

## Passing Values from CLI

Inject values available to all templates:

```bash
trident -i . -v env=prod -v region=us-west-2
```

Access them via `$values`:

```yaml
$out: {{name}}/config.yaml
environment: {{$values.env}}
region: {{$values.region}}
```

## What You've Learned

| Concept | Purpose |
|---------|---------|
| **Manifest** | Your data—services, configs, items to process |
| **Template** | Output rules—what files to generate per item |
| **`$out`** | Where to write each file |
| **`$in`** | Base file to merge with (optional) |
| **Deep merge** | Combines base + template, preserving nested structure |
| **Manifest merging** | Combine multiple manifests for overrides |
| **`$values`** | Access CLI-provided values |

## Next Steps

- [Templates and Manifests Guide](../guides/01-templates-and-manifests.md) — detailed patterns
- [Schema Validation](../guides/03-schema-validation.md) — validate inputs and set defaults
