# Directive Reference

Directives are special keys (prefixed with `$`) that control Trident's behavior.

## Output Directives

### `$out`

Specifies the output file path. This is the only required directive for generating output.

```yaml
$out: {{name}}/config.yaml
service: {{name}}
port: {{port}}
```

**Supports:** Handlebars templating

**Output format:** Determined by file extension (`.yaml`, `.json`, `.xml`, or default YAML)

**Note:** `$out` can be used on its own—`$in` is optional. When used alone, the template content becomes the output directly.

---

### `$in`

Specifies base configuration file(s) to merge with.

**Single file:**
```yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
```

**Multiple files (merged in order):**
```yaml
$in:
  - base/deployment.yaml
  - overrides/{{environment}}.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
```

When multiple files are specified, they are deep merged in order—later files override earlier ones. The template content is then merged on top.

**Supports:** `.yaml`, `.yml`, `.json`, `.xml` files

**Behavior:** Deep merges base file(s), then template content on top

---

### `$text`

Outputs raw text instead of structured data.

```yaml
$out: {{name}}/nginx.conf
$text: |
  server {
      listen {{port}};
      server_name {{name}}.example.com;
  }
```

**Use with:** `$out`

**Supports:** Handlebars templating

---

### `$root`

Preserves `$`-prefixed keys in output (normally stripped as directives).

```yaml
$out: {{name}}/schema.yaml
$root:
  $schema: "http://json-schema.org/draft-07/schema#"
  $id: "{{name}}"
type: object
```

**Output:**
```yaml
$schema: "http://json-schema.org/draft-07/schema#"
$id: "my-service"
type: object
```

---

### `$replace`

Performs literal string replacement in output.

```yaml
$in: base/config.yaml
$out: {{name}}/config.yaml
$replace:
  __SERVICE_NAME__: {{name}}
  __ENVIRONMENT__: production
```

**Use with:** `$in`, `$text`, `$merge`

**Behavior:** Replaces all occurrences of each key with its value

---

## File Operations

### `$copy`

Copies files matching a glob pattern.

```yaml
$copy: assets/*.txt
$out: {{name}}/static
```

**Supports:** Glob patterns

**Alternative syntax:**
```yaml
$copy:
  files:
    - assets/*.txt
    - images/*.png
$out: {{name}}/static
```

---

### `$merge`

Merges multiple files into one.

```yaml
$merge:
  files:
    - output/*/deployment.yaml
    - output/*/service.yaml
  separator: "---\n"
$out: output/release.yaml
```

**Options:**
- `files`: Array of glob patterns
- `separator`: String to insert between files (optional)

---

### `$mkdir`

Creates directories.

```yaml
$mkdir: output/{{name}}
```

**Array syntax:**
```yaml
$mkdir:
  - output/{{name}}/configs
  - output/{{name}}/secrets
```

---

### `$rm`

Removes files or directories.

```yaml
$rm: output/{{name}}/temp
```

**Array syntax:**
```yaml
$rm:
  - output/{{name}}/temp
  - output/{{name}}/*.bak
```

---

### `$chdir`

Changes the working directory for subsequent output.

```yaml
$chdir: output/{{name}}
---
$out: config.yaml  # Written to output/{{name}}/config.yaml
```

**Note:** Creates the directory if it doesn't exist

---

## Template Composition

### `$template`

Invokes another template.

```yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
```

**Use with:** `$manifest`

---

### `$manifest`

Specifies manifest(s) for a template invocation.

**Single manifest:**
```yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
```

**Multiple manifests (merged):**
```yaml
$template: services/template.yaml
$manifest:
  - services/base.yaml
  - services/{{$values.env}}-overrides.yaml
```

**Dynamic manifest:**
```yaml
$template: services/template.yaml
$manifest: {{read_glob "services/*.yaml" true}}
```

---

### `$schema`

Specifies a JSON Schema for validation.

```yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
$schema: services/schema.json
```

---

### `$values`

Imports values into `$values` context.

**From file:**
```yaml
$values:
  - config: config.json
```

**Inline object:**
```yaml
$values:
  - settings:
      timeout: 30
      retries: 3
```

**To root:**
```yaml
$values:
  - '.': globals.json
```

**Multiple imports (merged):**
```yaml
$values:
  - env: defaults.json
  - env: overrides.json
```

---

## Execution

### `$exec`

Executes a shell command (requires `--enable-exec` flag).

```yaml
$exec: echo "Generating {{name}}"
```

**Security:** Disabled by default. Enable with `--enable-exec` flag.

---

## Directive Summary Table

| Directive | Purpose | Use With |
|-----------|---------|----------|
| `$out` | Output file path | Standalone or with `$in` |
| `$in` | Base configuration(s), accepts array | `$out` |
| `$text` | Raw text output | `$out` |
| `$root` | Preserve `$` keys | `$out` |
| `$replace` | String replacement | `$in`, `$text`, `$merge` |
| `$copy` | Copy files | `$out` |
| `$merge` | Merge files | `$out` |
| `$mkdir` | Create directories | Standalone |
| `$rm` | Remove files | Standalone |
| `$chdir` | Change directory | Standalone |
| `$template` | Invoke template | `$manifest` |
| `$manifest` | Specify manifest | `$template` |
| `$schema` | JSON Schema | `$template`, `$manifest` |
| `$values` | Import values | Any |
| `$exec` | Shell command | Standalone |

## See Also

- [Templates and Manifests Guide](../guides/01-templates-and-manifests.md)
- [Helper Reference](./02-helpers.md)
