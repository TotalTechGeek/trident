# CLI Reference

## Installation

```bash
npm install -g trident-template
```

## Basic Usage

```bash
trident -i <input>
```

## Options

### `-i, --input <path>`

Specifies input files or directories. Can be used multiple times.

**Directory input:**
```bash
trident -i ./my-project
```
Looks for `template.yaml`, `manifest.yaml`, and `schema.json` in the directory.

**File input:**
```bash
trident -i template.yaml,manifest.yaml,schema.json
```
Comma-separated list of template, manifest, and optional schema.

**Multiple inputs:**
```bash
trident -i ./services -i ./jobs -i ./configmaps
```
Processes each input in sequence.

---

### `-v <key=value>`

Sets a value directly in `$values`.

```bash
trident -i . -v environment=production
trident -i . -v region=us-west-2 -v debug=false
```

Access in templates:
```yaml
environment: {{$values.environment}}
region: {{$values.region}}
```

---

### `-f <[key=]path>`

Imports values from a JSON or YAML file.

**With key:**
```bash
trident -i . -f config=prod.json
```
Access as `{{$values.config.field}}`

**Without key (uses filename):**
```bash
trident -i . -f prod.json
```
Access as `{{$values.prod.field}}`

**Multiple files:**
```bash
trident -i . -f env=env.json -f secrets=secrets.json
```

---

### `--dry`

Preview output without writing files.

```bash
trident -i . --dry
```

Output is printed to console with file paths:
```
>> api/deployment.yaml
apiVersion: apps/v1
kind: Deployment
...

>> api/service.yaml
apiVersion: v1
kind: Service
...
```

---

### `--enable-exec`

Enables the `$exec` directive and `{{exec}}` helper.

```bash
trident -i . --enable-exec
```

**Security warning:** Only use with trusted templates.

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | One or more items failed validation |

---

## Examples

### Basic Project

```bash
# Process a directory
trident -i ./my-project

# Preview output
trident -i ./my-project --dry
```

### With Environment Variables

```bash
# Set values directly
trident -i . -v env=prod -v region=us-west-2

# Use a config file
trident -i . -f env=environments/prod.json

# Combine both
trident -i . -f env=prod.json -v region=us-east-1
```

### Multiple Inputs

```bash
# Process multiple directories
trident -i ./services -i ./jobs

# Process specific files
trident -i services/template.yaml,services/manifest.yaml
```

### CI/CD Integration

```bash
#!/bin/bash
ENVIRONMENT=${ENVIRONMENT:-dev}

# Generate configs
trident -i . \
  -f env=environments/${ENVIRONMENT}.json \
  -v timestamp=$(date +%s)

# Apply to cluster
kubectl apply -f output/
```

### Preview Changes

```bash
# See what would be generated
trident -i . -f env=prod.json --dry | less

# Diff against existing files
trident -i . --dry > /tmp/new-output.txt
diff -r output/ /tmp/new-output.txt
```

### With Exec Enabled

```bash
# Allow shell commands in templates
trident -i . --enable-exec

# Template can use:
# $exec: echo "Generated at $(date)"
# {{exec "git" "rev-parse" "HEAD"}}
```

---

## Input Resolution

When given a directory, Trident looks for:

1. `template.yaml` (required)
2. `manifest.yaml` (optional - uses empty manifest if missing)
3. `schema.json` (optional)

```
my-project/
├── template.yaml    # Required
├── manifest.yaml    # Optional
└── schema.json      # Optional
```

Equivalent to:
```bash
trident -i template.yaml,manifest.yaml,schema.json
```

---

## Output

By default, files are written to paths specified by `$out` directives.

Use `$chdir` in templates to change the base output directory:
```yaml
$chdir: output/{{environment}}
```

---

## Environment Variables

Trident doesn't read environment variables directly, but you can pass them:

```bash
trident -i . \
  -v db_host=${DATABASE_HOST} \
  -v db_port=${DATABASE_PORT}
```

Or use a config file that references them:
```json
{
  "database": {
    "host": "${DATABASE_HOST}",
    "port": "${DATABASE_PORT}"
  }
}
```

---

## Troubleshooting

### "No input file specified"

```bash
# Wrong
trident

# Correct
trident -i .
```

### Validation Errors

Trident shows detailed validation errors:
```
Error occurred on "api"
✖ /replicas must be >= 1

  > 1 | replicas: 0
      | ^^^^^^^^ 👈🏽  must be >= 1
```

### File Not Found

Check paths are relative to template location:
```yaml
# Path is relative to template.yaml location
$in: base/deployment.yaml
```

### Execution Disabled

```
Error: Execution not enabled
```

Add `--enable-exec` flag if you need `$exec` or `{{exec}}`.

## See Also

- [Quick Start Guide](../getting-started/02-quick-start.md)
- [Directive Reference](./01-directives.md)
