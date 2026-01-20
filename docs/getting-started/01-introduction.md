# Introduction to Trident

## The Problem Trident Solves

Imagine you're managing 10 microservices. Each one needs:
- A Kubernetes deployment file
- A service file
- A configmap

That's 30 nearly-identical files. They share the same structure, the same labels, the same resource limits—just with different names and ports.

Now someone says "add a `team` label to every deployment." You open 10 files, make the same edit, hope you don't miss one or introduce a typo. Next week, you add an 11th service and have to create 3 more files from scratch.

This is **configuration sprawl**. The more services you add, the more files you maintain. The more files you maintain, the more they drift apart. The more they drift, the more bugs and inconsistencies creep in.

## The Multiplicative Solution

Trident inverts the problem. Instead of N services × M files = NM things to maintain, you maintain:

1. **One manifest** listing your services and their unique properties
2. **One template** defining what files each service needs

Trident multiplies them:

```
Output Files = Manifests × Templates
```

10 services × 3 templates = 30 files, generated from 2 source files.

### What This Buys You

| Without Trident | With Trident |
|-----------------|--------------|
| Add a service → create 3 files manually | Add a service → add 3 lines to manifest |
| Change a pattern → edit 10+ files | Change a pattern → edit 1 template |
| Files drift apart over time | All files come from the same source |
| Copy-paste errors | Generated output is consistent |

## A Minimal Example

**manifest.yaml** — defines 3 services:
```yaml
name: api
port: 8080
---
name: web
port: 3000
---
name: worker
port: 9000
```

The `---` separator creates multiple items in one file. Each item is processed independently.

**template.yaml** — defines 2 output files per service:
```yaml
# $out tells Trident where to write this file
# {{name}} is replaced with each service's name
$out: {{name}}/deployment.yaml
kind: Deployment
metadata:
  name: {{name}}
---
$out: {{name}}/service.yaml
kind: Service
metadata:
  name: {{name}}-svc
spec:
  ports:
    - port: {{port}}
```

**Result**: 6 files
```
api/deployment.yaml      api/service.yaml
web/deployment.yaml      web/service.yaml
worker/deployment.yaml   worker/service.yaml
```

Each service got both file types. Add a 4th service to the manifest and you'll get 8 files.

## Layering with Base Files

Sometimes your templates share common boilerplate—API versions, standard labels, default settings. You can extract this into a base file and **layer** your template on top using deep merge.

**base/deployment.yaml** — shared structure:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  labels:
    managed-by: trident
spec:
  replicas: 1
```

**template.yaml** — patches the base:
```yaml
# $in tells Trident to start with this base file
# $out tells Trident where to write the result
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
  labels:
    app: {{name}}
spec:
  replicas: {{replicas}}
```

The output is a **deep merge**: Trident starts with the base, then recursively merges your template values on top. Keys in your template override keys in the base. Nested objects are merged, not replaced.

**Result for `api`**:
```yaml
apiVersion: apps/v1          # from base
kind: Deployment             # from base
metadata:
  name: api                  # from template
  labels:
    managed-by: trident      # from base (preserved)
    app: api                 # from template (added)
spec:
  replicas: 3                # from template (overrode base's 1)
```

This keeps your templates focused on what's unique to each service, while the base handles the boilerplate.

## Merging Multiple Manifests

You can also merge manifests together. This is useful for environment-specific overrides:

**base.yaml** — defaults:
```yaml
name: api
replicas: 1
---
name: web
replicas: 1
```

**prod.yaml** — production overrides:
```yaml
name: api
replicas: 10
```

When you specify both manifests, items with the same `name` are deep merged:

```yaml
$template: deploy.yaml
$manifest:
  - base.yaml
  - prod.yaml
```

The `api` service ends up with `replicas: 10` (from prod), while `web` keeps `replicas: 1` (no override).

## What is Deep Merge?

Deep merge is how Trident combines objects:

```yaml
# Object A              # Object B              # Result (A deep-merged with B)
metadata:               metadata:               metadata:
  name: foo               name: bar               name: bar        # B wins
  labels:                 labels:                 labels:
    team: backend           app: api                team: backend  # from A
                                                    app: api       # from B
spec:                   spec:                   spec:
  replicas: 1             replicas: 5             replicas: 5      # B wins
  resources:                                      resources:
    cpu: 100m                                       cpu: 100m      # from A
```

The rules:
- **Objects are merged recursively** — nested keys from both sides are preserved
- **Conflicting keys** — the later value (B) wins
- **Arrays are replaced** — not concatenated (use helpers if you need to merge arrays)

## Key Concepts Summary

| Concept | What it does |
|---------|--------------|
| **Manifest** | Lists your data items (services, configs, etc.) |
| **Template** | Defines what files to generate per item |
| **`$out`** | Where to write the output file |
| **`$in`** | Base file to merge with (optional) |
| **Deep merge** | Recursively combines objects, later values win |
| **Multiplication** | Every manifest item × every template document |

## Next Steps

Ready to try it? Continue to the [Core Concepts](./02-core-concepts.md) guide.
