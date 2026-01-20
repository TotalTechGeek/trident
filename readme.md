# Trident

A **multiplicative templating engine** that eliminates configuration sprawl.

## The Problem

You have 10 microservices. Each needs a deployment file, a service file, and a config file. That's 30 files to maintain—mostly identical, with small differences like service name, port, and replica count.

Now you need to add a label to every deployment. Or change a resource limit. Or add an 11th service. Every change means touching multiple files. Copy, paste, find, replace, hope you didn't miss one.

## The Solution

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

Add a service? Add one manifest entry. Change a pattern? Edit one template. Consistency is guaranteed.

## Quick Example

**manifest.yaml** — your data:
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
replicas: 5
```

**template.yaml** — what to generate:
```yaml
# $out specifies where to write the file
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

**Run it:**
```bash
trident -i .
```

**Result:** 6 files generated
```
api/deployment.yaml    web/deployment.yaml    worker/deployment.yaml
api/service.yaml       web/service.yaml       worker/service.yaml
```

## Installation

```bash
npm install -g trident-template
```

## Core Concepts

### Manifests

A manifest is a multi-document YAML file. Each `---` separator creates a new item:

```yaml
name: api
port: 8080
---
name: web
port: 3000
```

Items can have any structure. By default, each needs a `name` field.

### Templates

Templates define output files using `$out`. Each document produces one file per manifest item:

```yaml
$out: {{name}}/config.yaml
service: {{name}}
port: {{port}}
```

Handlebars syntax (`{{...}}`) interpolates manifest values. Objects and arrays are automatically serialized to JSON.

### Base Files and Deep Merge

Use `$in` to start with a base file and layer your template on top:

```yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
spec:
  replicas: {{replicas}}
```

Trident **deep merges** the base with your template:
- Objects merge recursively—keys from both sides are preserved
- Template values override base values when they conflict
- Arrays are replaced, not merged

`$in` also accepts an array of files, merged in order:

```yaml
$in:
  - base/deployment.yaml
  - overrides/{{environment}}.yaml
$out: {{name}}/deployment.yaml
```

### Schema Validation

Validate manifest items and apply defaults with JSON Schema:

```yaml
$template: deploy.yaml
$manifest: services.yaml
$schema: schema.json
```

```json
{
  "type": "object",
  "properties": {
    "name": { "type": "string" },
    "replicas": { "type": "integer", "default": 1, "minimum": 1 }
  },
  "required": ["name"]
}
```

### Nested Templates

Templates can invoke other templates. This is useful for:

**Project organization** — A root template orchestrates sub-templates with their manifests:
```yaml
$template: backend/template.yaml
$manifest:
  - backend/manifest.yaml
  - backend/{{$values.env}}-overrides.yaml
---
$template: frontend/template.yaml
$manifest: frontend/manifest.yaml
```

**Multiplicative composition** — Outer and inner templates multiply together:
```yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
environment: {{name}}
```

2 environments × 3 services × 2 files = 12 output files.

### Multiple Manifests

Merge manifests by name for environment-specific overrides:

```yaml
$template: deploy.yaml
$manifest:
  - base.yaml
  - prod-overrides.yaml
```

Items with the same `name` are deep merged. Later files override earlier ones.

### Global Values

Pass values via CLI:

```bash
trident -i . -v environment=prod -f config=prod.json
```

Access via `$values`:

```yaml
$out: {{name}}/config.yaml
environment: {{$values.environment}}
database: {{$values.config.database}}
```

## Directives Reference

| Directive | Purpose | Example |
|-----------|---------|---------|
| `$out` | Output file path | `$out: {{name}}/config.yaml` |
| `$in` | Base file(s) to merge | `$in: base.yaml` or `$in: [base.yaml, override.yaml]` |
| `$text` | Raw text output | `$text: "server { listen {{port}}; }"` |
| `$root` | Preserve `$`-prefixed keys in output | `$root: { $schema: "..." }` |
| `$copy` | Copy files | `$copy: assets/*.txt` |
| `$merge` | Merge multiple files | `$merge: { files: ["*.yaml"], separator: "---\n" }` |
| `$replace` | String replacement | `$replace: { __NAME__: "{{name}}" }` |
| `$template` | Invoke another template | `$template: inner/template.yaml` |
| `$manifest` | Specify manifest(s) | `$manifest: [base.yaml, overrides.yaml]` |
| `$schema` | JSON Schema for validation | `$schema: schema.json` |
| `$values` | Import values | `$values: [{ config: config.json }]` |
| `$chdir` | Change output directory | `$chdir: output/{{name}}` |
| `$mkdir` | Create directories | `$mkdir: output/{{name}}` |
| `$rm` | Remove files/directories | `$rm: temp/*.yaml` |
| `$exec` | Run shell command (requires `--enable-exec`) | `$exec: echo "Done"` |

## Helpers

Trident includes custom helpers plus [handlebars-helpers](https://github.com/helpers/handlebars-helpers):

```yaml
# Data
{{default port 8080}}              # Fallback value
{{or customPort defaultPort 8080}} # First truthy value
{{merge defaults overrides}}       # Deep merge objects
{{object "key" value}}             # Construct object

# Numeric
{{min replicas 10}}                # At most 10
{{max replicas 1}}                 # At least 1
{{clamp replicas 1 10}}            # Between 1 and 10

# Files
{{read "config.txt"}}              # Read file contents
{{hash "config.json"}}             # SHA256 hash
{{ls "configs/*.yaml"}}            # List files
{{read_glob "*.yaml" true}}        # Read and parse multiple files

# Comparison (from handlebars-helpers)
{{#if (eq a b)}}...{{/if}}
{{#if (gt replicas 1)}}...{{/if}}
{{#if (and condition1 condition2)}}...{{/if}}
```

## CLI Reference

```bash
trident -i .                        # Process current directory
trident -i . --dry                  # Preview without writing
trident -i services -i frontend     # Multiple inputs
trident -i . -v env=prod            # Pass values
trident -i . -f config=prod.json    # Import values from file
trident -i . --enable-exec          # Allow $exec directive
```

| Flag | Description |
|------|-------------|
| `-i, --input` | Input directory or files |
| `--dry` | Preview output without writing |
| `-v` | Set value (e.g., `-v key=value`) |
| `-f` | Import values from file (e.g., `-f config=file.json`) |
| `--enable-exec` | Allow `$exec` directive (disabled by default) |

## Output Formats

Output format is determined by `$out` file extension:

| Extension | Format |
|-----------|--------|
| `.yaml`, `.yml` | YAML |
| `.json` | JSON |
| `.xml` | XML |
| Other | YAML (default) |

For non-structured output, use `$text`:

```yaml
$out: {{name}}/nginx.conf
$text: |
  server {
      listen {{port}};
      server_name {{name}}.example.com;
  }
```

## Documentation

Full documentation available in the `docs/` directory:

- [Introduction](docs/getting-started/01-introduction.md) — Why multiplicative templates matter
- [Core Concepts](docs/getting-started/02-core-concepts.md) — Deep dive into the model
- [Quick Start](docs/getting-started/03-quick-start.md) — Build your first project
- [Directive Reference](docs/reference/01-directives.md) — All directives explained
- [Helper Reference](docs/reference/02-helpers.md) — All helpers documented

## Why "Trident"?

A trident is a multi-pronged tool. Trident gives your configurations multiple prongs—one source, many outputs.
