# Comparison with Other Tools

## The Core Problem: Configuration Sprawl

As your infrastructure grows, configuration files multiply. 10 services × 3 environments × 4 file types = 120 files. These files are mostly identical—same structure, same labels, same patterns—with small differences per service or environment.

This creates **configuration sprawl**:
- Files drift apart as different people edit them
- Adding a service means copy-pasting and tweaking multiple files
- Changing a common pattern means touching dozens of files
- Code review becomes "spot the difference" across similar files
- Mistakes hide in the repetition

### The GitOps Challenge

GitOps workflows make this worse. You want your Git repository to be the source of truth, but:
- PRs that touch 50 files are hard to review
- Environment-specific changes conflict when merging branches
- It's unclear which files are "real" config vs generated boilerplate

### Trident's Approach

Trident treats configuration as **data × templates**:
- Your services, their properties, and environment overrides are **data** (manifests)
- The file structures they need are **templates**
- Trident multiplies them to produce output

This means:
- **Add a service** → add 3 lines to a manifest, not 12 files
- **Change a pattern** → edit 1 template, regenerate everything
- **Environment overrides** → one override file per environment, merged by name
- **Code review** → review the data and templates, not 50 generated files

Your GitOps repo stays clean: manifests describe what you have, templates describe what each thing needs, and the output is generated consistently.

## Quick Comparison

| Feature | Trident | Helm | Kustomize | Jsonnet |
|---------|---------|------|-----------|---------|
| Templating | Yes (Handlebars) | Yes (Go templates) | No | Yes (custom) |
| Patching/Overlays | Yes (deep merge) | No | Yes | Yes |
| Multiplicative | Yes | No | No | Manual |
| Manifest Merging | Yes (by name) | No | Yes (patches) | Manual |
| Schema Validation | Yes (JSON Schema) | Yes (values schema) | No | No |
| Kubernetes-specific | No | Yes | Yes | No |
| Output Formats | YAML, JSON, XML, text | YAML | YAML | JSON |
| Add a service | ~3 lines, 0 new files | ~3 lines in values array | ~3 new files, ~15 lines | ~3 lines in array |
| Add env override | ~3 lines in override file | Complex values nesting | New overlay directory | Manual merge logic |

## Helm

[Helm](https://helm.sh/) is the Kubernetes package manager, using Go templates.

**Helm's approach:**
```yaml
# values.yaml
services:
  - name: api
    replicas: 3
  - name: web
    replicas: 2

# templates/deployment.yaml
{{- range .Values.services }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .name }}
spec:
  replicas: {{ .replicas }}
---
{{- end }}
```

**Trident's approach:**
```yaml
# manifest.yaml
name: api
replicas: 3
---
name: web
replicas: 2

# template.yaml
$out: {{name}}/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{name}}
spec:
  replicas: {{replicas}}
```

**Key differences:**

| Aspect | Helm | Trident |
|--------|------|---------|
| **Iteration** | Explicit loops in templates | Implicit via manifest items |
| **Output** | Single file with separators | Separate files per resource |
| **Patching** | Not supported | Deep merge with `$in` / overlaying manifests |
| **Scope** | Kubernetes-focused | General purpose |
| **Packaging** | Charts with dependencies | Plain files |
| **Add a service** | ~5 lines in values array | ~3 lines in manifest, 0 new files |
| **Add env override** | Nested values + conditionals | ~3 lines in override file |

**When to use Helm:** You want a package manager with versioning, dependencies, and a large ecosystem of pre-built charts.

**When to use Trident:** You want to generate many files from data without explicit loops, need patching/overlays, or aren't targeting Kubernetes.

## Kustomize

[Kustomize](https://kustomize.io/) uses patching without templating.

**Kustomize's approach:**
```yaml
# base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1

# overlays/prod/kustomization.yaml
resources:
  - ../../base
patchesStrategicMerge:
  - deployment-patch.yaml

# overlays/prod/deployment-patch.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 5
```

**Trident's approach:**
```yaml
# base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
spec:
  replicas: 1

# template.yaml
$in: base/deployment.yaml
$out: {{$values.env}}/deployment.yaml
spec:
  replicas: {{replicas}}

# manifest.yaml (or use $values)
replicas: 5
```

**Key differences:**

| Aspect | Kustomize | Trident |
|--------|-----------|---------|
| **Templating** | None (intentionally) | Full Handlebars support |
| **Patching** | Strategic merge patches | Deep merge |
| **Multiplication** | Manual per-overlay | Automatic via manifests |
| **Variable substitution** | Limited (replacements) | Full templating |
| **Scope** | Kubernetes-only | General purpose |
| **Add a service** | New base dir + overlays (~4 files, ~40 lines) | ~3 lines in manifest, 0 new files |
| **Add env override** | New overlay directory (~2 files) | ~3 lines in override file |

**When to use Kustomize:** You prefer no templating, want Kubernetes-native tooling, or need strategic merge patches for arrays.

**When to use Trident:** You need templating AND patching together, want to generate configs for multiple services from one template, or aren't targeting Kubernetes.

## Jsonnet

[Jsonnet](https://jsonnet.org/) is a data templating language.

**Jsonnet's approach:**
```jsonnet
local services = [
  { name: 'api', replicas: 3 },
  { name: 'web', replicas: 2 },
];

{
  [s.name + '/deployment.yaml']: {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: { name: s.name },
    spec: { replicas: s.replicas },
  }
  for s in services
}
```

**Trident's approach:**
```yaml
# manifest.yaml
name: api
replicas: 3
---
name: web
replicas: 2

# template.yaml
$out: {{name}}/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{name}}
spec:
  replicas: {{replicas}}
```

**Key differences:**

| Aspect | Jsonnet | Trident |
|--------|---------|---------|
| **Language** | Custom programming language | YAML + Handlebars |
| **Learning curve** | Steeper (new syntax) | Lower (familiar YAML) |
| **Abstraction** | Full programming constructs | Declarative templates |
| **Output** | JSON (convert to YAML) | YAML, JSON, XML, text |
| **Patching** | Manual with `+:` operator | Built-in `$in` directive / manifest overlays |
| **Add a service** | ~5 lines in array (Jsonnet syntax) | ~3 lines in manifest (YAML) |
| **Add env override** | Write merge function + conditionals | ~3 lines in override file |

**When to use Jsonnet:** You want full programming power, need complex conditionals/functions, or prefer a functional approach.

**When to use Trident:** You prefer staying in YAML, want simpler declarative templates, or need built-in patching and file operations.

## Plain Templating (envsubst, sed)

Simple variable substitution tools.

**envsubst approach:**
```yaml
# template.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${NAME}
spec:
  replicas: ${REPLICAS}
```
```bash
NAME=api REPLICAS=3 envsubst < template.yaml > api/deployment.yaml
NAME=web REPLICAS=2 envsubst < template.yaml > web/deployment.yaml
```

**Trident's approach:**
```yaml
# manifest.yaml
name: api
replicas: 3
---
name: web
replicas: 2

# template.yaml
$out: {{name}}/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{name}}
spec:
  replicas: {{replicas}}
```
```bash
trident -i .
```

**Key differences:**

| Aspect | envsubst/sed | Trident |
|--------|--------------|---------|
| **Iteration** | External scripting | Built-in via manifests |
| **Conditionals** | None | Full Handlebars |
| **Patching** | None | Deep merge |
| **Validation** | None | JSON Schema |
| **Complexity** | Grows with shell scripts | Stays declarative |
| **Add a service** | Edit script + add vars (~5 lines) | ~3 lines in manifest, 0 new files |
| **Add env override** | More script logic or separate scripts | ~3 lines in override file |

**When to use envsubst:** Simple one-off substitutions, CI/CD pipelines with few variables.

**When to use Trident:** Multiple services, need conditionals/loops, want to avoid shell scripting.

## Choosing the Right Tool

### Use Trident when you need:

- **Configuration sprawl under control** — 10 services shouldn't mean 40 hand-maintained files
- **Clean GitOps repositories** — Review manifests and templates, not hundreds of generated files
- **Simple environment management** — One override file per environment, merged automatically
- **Multiplicative output** — Generate many files from manifest × template
- **Both templating AND patching** — Handlebars templates with deep merge overlays
- **General-purpose output** — Not just Kubernetes (nginx configs, scripts, etc.)
- **Declarative YAML** — Stay in familiar syntax, avoid custom languages

Trident shines when you want your Git repo to clearly show "what services exist" and "what they need" rather than drowning in repetitive files.

### Use Helm when you need:

- Kubernetes package management with versioning
- Dependency management between charts
- Large ecosystem of pre-built charts
- Rollback and release management

### Use Kustomize when you need:

- Kubernetes-native tooling (built into kubectl)
- Pure patching without any templating
- Strategic merge patches for complex array operations
- GitOps workflows with overlays

### Use Jsonnet when you need:

- Full programming language power
- Complex functions and abstractions
- Existing Jsonnet codebases
- Maximum flexibility over simplicity
