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

Helper | Description | Example
-- | -- | --
json | Outputs the JSON representation of the object | `{{json env}}`
merge | Merges two or more objects together | `{{merge env $values.env}}`
default | Sets a default value if the value is not present, I would recommend using schema instead though | `{{default replicas 1}}` 
object | Constructs a new object | `{{object "key" "value" "key2" "value2"}}`
or | Returns the first non-falsy value | `{{or env $values.env}}`
min | Returns the minimum value | `{{min replicas 1}}`
max | Returns the maximum value | `{{max replicas 10}}`

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

`$in` is a special key that specifies the base configuration to use. This is a relative path to the base configuration.
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
trident -i manifest.yaml,template.yaml,schema.json
```

It might be possible that you have multiple templates & manifests, so you can use the `-i` flag multiple times to specify multiple directories.

```bash
trident -i services -i collectors
```

### Output

Trident can output either directly to the filesystem or to an archive.

To output to an archive, you can specify the `-a` flag with a path to the archive. The current formats supported are `zip`, `tar`, and `tar.gz` (and `tgz`).

For example:

```bash
trident -i . -a output.zip
```

The structure of the output will be determined solely by the `$out` key in the templates.

### Supported Formats for Base Configurations

Trident currently supports YAML, JSON and XML for base configurations.

### Enabling Templating in the Base Configurations

*Hey! Maybe consider using `$replace` instead of this!*

While I like how Kustomize separates the templating from the base configurations, I understand that this can be a bit cumbersome, especially if  a `{{name}}`-like value is used in multiple places.

So while I encourage you to keep your base configurations as clean as possible, you can enable templating in the base configurations by using the flag `--enableTemplateBase`.

Even if you enable this flag, I strongly recommend setting up most of your patches in the templates, and use the templating sparingly for values that are used in multiple places.

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

If you wish to allow values to be shared across future templates, you can use the `--allowValuesSharing` flag. This will allow values imported inline by one template to be available in future templates for the same manifest item.


Additionally, if you'd like to import values directly to the root of `$values`, you can use `'.'` as the key.

```yaml
$in: base/deployment.yaml
$out: {{name}}/deployment.yaml
$values: 
    - '.': env.json
```

### Flags 

Flag | Description
-- | --
--relativeToManifest | If set, any input files will be resolved relative to the manifest file.
--enableTemplateBase | If set, templating will be enabled in the base configurations.
--dry | If set, the output will not be written to the filesystem, and will be printed to the console instead.
-a, --archive | If set, the output will be written to an archive. The archive format is determined by the file extension.
--allowValuesSharing | If set, $values imported inline by one template will be available in future templates for the same manifest item.
-i, --input | The input files to use. This can be a directory or a list of files separated by commas.
-f | Imports values from a JSON File to be made available in $values. You can specify where to import them to by using the format `key=path.to.value`.
-v | Imports values directly to $values. You can specify where to import them to by using the format `key=value`.


### Why "Trident"?

A trident is a multi-pronged tool; this tool is designed to give your base configurations multiple prongs, or outputs. It's also a cool word.

## Installation

```bash
npm i -g trident-template
```
