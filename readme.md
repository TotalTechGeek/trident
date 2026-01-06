# Trident

## Introduction

Trident is a manifest-based templating engine for reusing configuration files. It is designed to be simple & flexible.

It takes inspiration from [Kustomize](https://github.com/kubernetes-sigs/kustomize) and [Helm](https://helm.sh), but is designed to be more generative & general-purpose.

### Concepts

- **Base Configurations** These are un-templated configurations that are used as the base for your output.
- **Templates** This is a YAML file that describes any patches to apply to the base configuration. Unlike Kustomize, Trident templates are indeed templates, and can contain templating logic. (This is not a condemnation of Kustomize, which is a great tool, but rather a different design choice.)
- **Manifest**: A YAML file that describes a set of resources.
- **Schema** An optional [JSON Schema Specification](https://json-schema.org/learn/getting-started-step-by-step) to be applied to each resource defined in the manifest. This is useful for validation or applying defaults.

But to elaborate, imagine that you have a base configuration, and 15 services that can borrow from this base configuration.

With Trident, you can set up your base configuration, and define a manifest that describes the 15 services. The template can take values from the manifest, and apply them to the base configurations, and output 15 different sets of configurations.

### Example

Here's a potential example of a Trident manifest:

```yaml
# manifest.yaml
name: Users
replicas: 3
---
name: Orders
replicas: 5
---
name: Payments
replicas: 2
```

You could define a base configuration that looks like this:

```yaml
# base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: Unknown
spec:
  replicas: 1
```

And a template that looks like this:

```yaml
# template.yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
spec:
  replicas: {{replicas}}
```

When you run Trident, it will apply the manifest to the template, and merge the results with the base configuration. The output would be three different deployment files, one for each service.

If you wanted, you could also specify a schema to make sure that the output is valid:

```json
{
  "type": "object",
  "properties": {
    "name": {
      "type": "string"
    },
    "replicas": {
      "type": "integer",
      "minimum": 1,
      "default": 1
    }
  },
  "required": ["name", "replicas"]
}
```

Which would ensure that the manifest is valid & apply defaults if necessary.

Templates can also specify that multiple resources should be outputted, and can be output to different directories / any depth.

To define multiple resources in the template, you can use the `---` separator, like in the manifest.

### Templating Language

Trident uses Handlebars as its templating language. This is a simple, flexible language that is easy to learn.

You can read more about Handlebars [here](https://handlebarsjs.com/).

We have added a few custom helpers to make it easier to work with configurations,

| Helper  | Description                                                                                     | Example                                    |
| ------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| json    | Outputs the JSON representation of the object                                                   | `{{json env}}`                             |
| merge   | Merges two or more objects together                                                             | `{{merge env $values.env}}`                |
| default | Sets a default value if the value is not present, I would recommend using schema instead though | `{{default replicas 1}}`                   |
| object  | Constructs a new object                                                                         | `{{object "key" "value" "key2" "value2"}}` |
| or      | Returns the first non-falsy value                                                               | `{{or env $values.env}}`                   |
| min     | Returns the minimum value                                                                       | `{{min replicas 1}}`                       |
| max     | Returns the maximum value                                                                       | `{{max replicas 10}}`                      |

We also support the methods from [Handlebars-Helpers](https://npmjs.com/package/handlebars-helpers).

We recommend strongly that you check out the handlebars documentation directly, but you're able to use any of the built-in helpers in your templates, such as `if`, `each`, etc.

Example:

```yaml
# template.yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
spec:
{{#if replicas}}
  replicas: {{replicas}}
{{/if}}
{{#if env}}
  env:
  {{#each env}}
    - name: {{@key}}
      value: {{this}}
  {{/each}}
{{/if}}
```

`$in` is a special key that specifies the base configuration to use. This is a relative path to the template.
`$out` is a special key that specifies the output path; often you will likely template this based on the name of the resource.

There is also a `$copy` key that can be used to copy globs from one directory to another. This is useful for copying files that are not templated.

Example:

```yaml
$copy: base/info/*.txt
$out: {{name}}/info
```

`$replace` is a special key that can be used to replace literal strings in the base configuration. For most cases, I'd recommend using patching instead as described above, but this can be useful when you need to replace a value in numerous places in the base configuration.

Example:

```yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
$replace:
  SERVICE_NAME: {{name}}
```

This will replace all instances of `SERVICE_NAME` in the base configuration with the name of the service.

"Is this not a form of templating in the base configuration?" you might ask. Admittedly -- yes, yes it is. I'd encourage you to use this sparingly.

### Global Variables

If you have a set of variables you want to apply across all items in your manifest, you can either import them from a file or specify them on the CLI. They are referenced in templates as `$values`.

For example, you could have an `prod.json` file that looks like so:

```json
{
  "environment": "prod",
  "region": "us-west-2"
}
```

Then upon running the following command:

```bash
trident -i . -f env=prod.json
```

You could access these variables in your templates like so (from `$values`):

```yaml
# template.yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
spec:
    replicas: {{replicas}}
    env:
        - name: ENVIRONMENT
        value: {{$values.env.environment}}
        - name: REGION
        value: {{$values.env.region}}
```

You can also specify these variables directly on the CLI, like so:

```bash
trident -i . -v environment=prod -v region=us-west-2
```

Which would allow you to access them directly off of `$values` in your templates.

```yaml
# template.yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
metadata:
  name: {{name}}
spec:
    replicas: {{replicas}}
    env:
        - name: ENVIRONMENT
        value: {{$values.environment}}
        - name: REGION
        value: {{$values.region}}
```

### Running Trident

To run Trident, you can use the following command:

```bash
trident -i .
```

This will look for a `manifest.yaml`, `template.yaml` and an optional `schema.json` in the current directory, and execute the template.

You can also specify the three files directly, separated by commas, in the following order:

```bash
trident -i template.yaml,manifest.yaml,schema.json
```

It might be possible that you have multiple templates & manifests, so you can use the `-i` flag multiple times to specify multiple directories.

```bash
trident -i services -i collectors
```

### Output

Trident outputs directly to the filesystem unless the `--dry` flag is specified.

The structure of the output will be determined solely by the `$out` key in the templates.

### Supported Formats for Base Configurations

Trident currently supports YAML, JSON and XML for base configurations.

### Using `$out` without an `$in`

If you wish to create files without a base configuration, you can omit the `$in` key entirely.

This is useful for generating files you want to fully template out & not borrow from a base configuration.

```yaml
$out: {{name}}/config.yaml
apiVersion: v1
kind: Config
metadata:
  name: {{name}}-config
data:
  ENVIRONMENT: {{environment}}
```

### Writing Templated 'Text' Files

Let's say you want to output a configuration that is not YAML, JSON or XML, such as a `.ini` or `.conf` file.

You can use the `$text` key to output templated text files.

```yaml
$out: {{service}}/app.conf
$text: >-
  server {
      listen {{default port 80}};
      server_name {{service}}.example.com;

      location / {
          proxy_pass http://{{service}}:8080;
      }
  }
```

This would output a file named `app.conf` in a directory named after the service, with the templated content.

### Importing Values From Template Files

As described above, you can use the CLI Flags like `-f` and `-v` to import values into `$values`.

However, if you need something a bit more robust, you can import values from within the templates themselves.

To do this, you can use `$values` as a key within the template, and specify where to import the values to.

```yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
$values:
    - env: env.json
# ...
```

Would allow you to access `$values.env` in your templates.

You may also specify an object directly,

```yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
$values:
    - env:
        - key: {{somethingFromManifest}}
        - key2: value2
```

Which would allow you to access `$values.env.key` and `$values.env.key2` in your templates.

You may also import multiple files or values, and they will be merged together, like so:

```yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
$values:
    - env: env.json
    - env: extra-{{name}}.json
```

Additionally, if you'd like to import values directly to the root of `$values`, you can use `'.'` as the key.

```yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
$values:
    - '.': env.json
```

### Changing Output Directory

You can change the output directory for the configuration by using the `$chdir` key inside of a step.

```yaml
$chdir: output/{{name}}
```

This will automatically make the directory if it doesn't exist.

**NOTE**: It's not recommended you use this with $in / $out, as you can specify a directory in the $out key; this is useful for changing the output directory in a template that invokes other templates, and setting up something like `$chdir: output`or`$chdir: output/{{name}}` at the root level.

### Creating Directories

You can create directories by using the `$mkdir` key; you may not always need this, as Trident will automatically create directories for most commands if they don't exist.

```yaml
$mkdir: output/{{name}}
```

Multiple directories can be created by using an array.

```yaml
$mkdir:
  - output/frontend/{{name}}
  - output/backend/{{name}}
```

### Removing Files

You can remove files or directories by using the `$rm` key.

```yaml
$rm: output/{{name}}/deployment.yaml
```

Multiple files or directories can be removed by using an array.

```yaml
$rm:
  - output/frontend/{{name}}/deployment.yaml
  - output/backend/{{name}}/deployment.yaml
```

### Merging Files

You can merge files together by using `$merge`. This is useful for combining multiple files into a single file.

The files can be specified as a glob, and a separator can be specified to separate the files.

```yaml
$merge:
  files:
    - output/**/deployment.yaml
    - output/**/service.yaml
  separator: "---\n"
$out: output/release.yaml
```

The files will be appended in the order they are specified, with the separator between each file.

### Calling Templates From Templates

In Trident, templates are multiplicative. This means that you can call a template from within a template, and values from either the manifest or template can be passed to the called template.

To call a template from within a template, you can use the `$template` key.

```yaml
$template: services/template.yaml
$manifest: services/manifest.yaml
---
$template: frontend/template.yaml
$manifest: frontend/manifest.yaml
```

This would call the `services/template.yaml` with the `services/manifest.yaml` and the `frontend/template.yaml` with the `frontend/manifest.yaml`, allowing you to execute multiple templates in a single run.

Any $values or values from the manifest will be passed to the called template.

```yaml
$chdir: output/{{name}}
$manifest: services/manifest.yaml
$template: services/template.yaml
$values:
    - env: {{name}}.json
type: service
```

Would allow you to access `$values.env` in the `services/template.yaml`, as well as `{{type}}` in the `services/template.yaml`.

You might run the above template with the following command:

```bash
trident -i .
```

With the manifest being:

```yaml
name: Prod
---
name: Dev
```

Allowing you to output two different sets of configurations, one for `Prod` and one for `Dev`.

You may also specify a schema to use for the called template by using the `$schema` key.

```yaml
$template: services/template.yaml
$schema: services/schema.json
$manifest: services/manifest.yaml
```

### Using Multiple Manifests

As noted above, you can use `$template` to invoke other templates.

If you pass an array into `$manifest`, Trident will merge the manifests together, and merge properties with the same name.

Conceptually, this is similar to using multiple overlays in Kustomize.

```yaml
$template: services/template.yaml
$manifest:
  - services/manifest.yaml
  - services/{{$values.env}}.yaml
```

Now if I have `services/manifest.yaml` like so:

```yaml
name: Users
env:
  HOST: users
  MODE: prod
replicas: 3
---
name: Orders
env:
  HOST: orders
  MODE: prod
replicas: 2
```

And a file named `services/prod.yaml` like so:

```yaml
name: Users
replicas: 5
```

I could run Trident with:

```bash
trident -i . -v env=prod
```

And Users would be deployed with 5 replicas, and Orders would be deployed with 2 replicas.

### Flags

| Flag          | Description                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| --dry         | If set, the output will not be written to the filesystem, and will be printed to the console instead.                                             |
| -i, --input   | The input files to use. This can be a directory or a list of files separated by commas.                                                           |
| -f            | Imports values from a JSON File to be made available in $values. You can specify where to import them to by using the format `key=path.to.value`. |
| -v            | Imports values directly to $values. You can specify where to import them to by using the format `key=value`.                                      |
| --enable-exec | Allows the execution of the `$exec` key in templates. This is disabled by default for security reasons. Will run a command in the shell.          |

### All Template Instructions

| Key       | Description                                                                                       | Format                                  | Use With                     |
| --------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------- | 
| $in       | The base configuration to use.                                                                    | string                                  | $out                         |
| $out      | The output path for the configuration.                                                            | string                                  | $in, $merge, $text, or $copy |
| $text     | Outputs templated text to a file.                                                                 | string                                  | $out
| $copy     | Copies files from one directory to another.                                                       | string (glob)                           | $out
| $replace  | Replaces literal strings in the base configuration.                                               | object                                  | $in, $text, or $merge        |
| $values   | Imports values from a JSON file to be made available in $values.                                  | object[]                                |
| $chdir    | Changes the working directory for the output.                                                     | string                                  |
| $exec     | Executes a command, if `--enable-exec` is run                                                     | string                                  |
| $mkdir    | Creates a directory.                                                                              | string or string[]                      |
| $rm       | Removes a file or directory.                                                                      | string or string[]                      |
| $merge    | Used to merge globs of files together                                                             | { files: string[], separator?: string } | $out                         |
| $template | Allows you to call another template from within a template.                                       | string                                  | $manifest                    |
| $manifest | Allows you to specify a manifest to use. If multiple manifests are passed in, it will merge them. | string or string[]                      | $template                    |
| $schema   | Allows you to specify a schema to use.                                                            | string                                  | $manifest, $template         |

### Why "Trident"?

A trident is a multi-pronged tool; this tool is designed to give your base configurations multiple prongs, or outputs. It's also a cool word.

## Installation

```bash
npm i -g trident-template
```
