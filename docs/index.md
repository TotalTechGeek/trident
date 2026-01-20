# Trident Documentation

Trident is a **multiplicative templating engine** that eliminates copy-paste configuration sprawl.

## The Problem

You have 10 microservices. Each needs a deployment file, a service file, and a config file. That's 30 files to maintain. They're mostly identical, with small differences—service name, port, replica count.

Now you need to add a new label to every deployment. Or change a resource limit. Or add a new service. Every change means touching multiple files. Copy, paste, find, replace, hope you didn't miss one.

Configuration sprawl leads to:
- **Inconsistency** - Files drift apart as different people edit them
- **Errors** - Copy-paste mistakes, forgotten updates
- **Tedium** - Adding a service means creating the same files again

## The Solution: Multiplication

Trident flips the problem. Instead of maintaining 30 files, you maintain:
- **1 manifest** listing your 10 services and their properties
- **1 template** defining the 3 file types each service needs

Trident multiplies them: `10 services × 3 templates = 30 files`

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Manifest   │     │  Template   │     │   Output    │
│             │  ×  │             │  =  │             │
│ 10 services │     │ 3 documents │     │  30 files   │
└─────────────┘     └─────────────┘     └─────────────┘
```

- Add a service? Add one item to the manifest → 3 new files appear
- Change a pattern? Edit the template once → all 30 files update
- Need consistency? It's guaranteed—everything comes from the same source

## Quick Example

**Manifest** — your data (3 services):
```yaml
name: api
port: 8080
replicas: 3
---
name: web
port: 3000
replicas: 2
---
name: worker
replicas: 1
```

**Template** — what to generate (2 file types):
```yaml
# $out: where to write this file (supports {{variables}})
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

**Result**: 6 files generated
```
api/deployment.yaml    web/deployment.yaml    worker/deployment.yaml
api/service.yaml       web/service.yaml       worker/service.yaml
```

## Installation

```bash
npm install -g trident-template
```

## Basic Usage

```bash
trident -i ./my-project          # Generate files
trident -i ./my-project --dry    # Preview without writing
```

## Getting Started

1. [Introduction](./getting-started/01-introduction.md) - Why multiplicative templates matter
2. [Core Concepts](./getting-started/02-core-concepts.md) - Manifests, templates, patches, and merging
3. [Quick Start](./getting-started/03-quick-start.md) - Build your first project
4. [Comparison](./getting-started/04-comparison.md) - vs Helm, Kustomize, Jsonnet

## Guides

- [Templates and Manifests](./guides/01-templates-and-manifests.md) - Deep dive into the multiplication model
- [Text File Generation](./guides/02-text-file-generation.md) - Generate nginx configs, scripts, and more
- [Schema Validation](./guides/03-schema-validation.md) - Validate inputs and set defaults
- [Handlebars Templating](./guides/03-handlebars-templating.md) - Templating syntax and helpers
- [Global Values](./guides/05-global-values.md) - Share configuration across templates
- [Nested Templates](./guides/06-nested-templates.md) - Compose templates for complex structures


## Reference

- [Directives](./reference/01-directives.md) - All `$out`, `$in`, `$template` directives
- [Helpers](./reference/02-helpers.md) - All Handlebars helpers
- [CLI](./reference/03-cli.md) - Command-line options
