# Trident Documentation

Trident is a **multiplicative templating engine** for generating configuration files. Define your data once, apply templates, and generate many outputs.

## The Multiplicative Model

Trident's power comes from multiplication:

```
Output Files = Manifests × Templates
```

If you have 5 services in your manifest and 3 template documents, you get 15 output files. Add patches and overlays on top, and you have a complete configuration generation system.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Manifests    │     │    Templates    │     │  Base Configs   │
│                 │  ×  │                 │  +  │    (Patches)    │
│  5 services     │     │  3 documents    │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               ↓
                    ┌─────────────────┐
                    │   15 Output     │
                    │     Files       │
                    └─────────────────┘
```

## Getting Started

New to Trident? Start here:

1. [Introduction](./getting-started/01-introduction.md) - The multiplicative model explained
2. [Quick Start](./getting-started/02-quick-start.md) - Create your first project in 5 minutes
3. [Core Concepts](./getting-started/03-core-concepts.md) - Manifests, templates, patches, and merging

## Guides

Deep dives into specific topics:

- [Templates and Manifests](./guides/01-templates-and-manifests.md) - The multiplication in detail
- [Schema Validation](./guides/02-schema-validation.md) - Using JSON Schema for validation and defaults
- [Handlebars Templating](./guides/03-handlebars-templating.md) - Templating syntax and built-in helpers
- [Custom Helpers](./guides/04-custom-helpers.md) - Trident's custom helpers for files, data, and more
- [Global Values](./guides/05-global-values.md) - Sharing configuration via `$values`
- [Nested Templates](./guides/06-nested-templates.md) - Composing templates and dynamic manifests

## Recipes

Real-world examples and patterns:

- [Kubernetes Deployments](./recipes/01-kubernetes-deployments.md) - Generate K8s manifests for multiple services
- [Multi-Environment Configuration](./recipes/02-multi-environment.md) - Dev/staging/prod configs from one source
- [Dynamic Service Discovery](./recipes/03-dynamic-discovery.md) - Auto-discover and process config files
- [Text File Generation](./recipes/04-text-file-generation.md) - Generate nginx, INI, shell scripts, and more

## Reference

Complete reference documentation:

- [Directive Reference](./reference/01-directives.md) - All `$` directives explained
- [Helper Reference](./reference/02-helpers.md) - All available Handlebars helpers
- [CLI Reference](./reference/03-cli.md) - Command-line options and usage

## Quick Example

**Manifest** (3 services):
```yaml
name: api
port: 8080
---
name: web
port: 3000
---
name: worker
```

**Template** (2 documents):
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
```

**Result**: 6 files (3 services × 2 templates)
```
api/deployment.yaml
api/service.yaml
web/deployment.yaml
web/service.yaml
worker/deployment.yaml
worker/service.yaml
```

## Installation

```bash
npm install -g trident-template
```

## Basic Usage

```bash
# Process a directory
trident -i ./my-project

# Preview output (see all generated files)
trident -i ./my-project --dry

# With environment values
trident -i . -v environment=production -f config=prod.json
```
