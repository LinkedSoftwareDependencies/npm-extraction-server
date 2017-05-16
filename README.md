Provides support for converting npm packages to RDF.
Better readme pending.

See https://linkedsoftwaredependencies.github.io/Article-Reproducability/ for more details.

# npm extraction server

This project converts the [`package.json`](https://docs.npmjs.com/files/package.json) files,
found in [npm](https://www.npmjs.com/) projects,
to [RDF](https://www.w3.org/TR/2004/REC-rdf-concepts-20040210/).
This is done by converting the input JSON to JSON-LD,
both by using a context file and transforming parts of the data.

An example of how the [N3.js](https://github.com/RubenVerborgh/N3.js)
[JSON](https://registry.npmjs.com/n3) gets converted
can be found [here](http://linkedsoftwaredependencies.org/bundles/npm/n3).

There are two ways this project provides access to the generated RDF:
 * an HTTP server providing access to individual packages as can be seen in the examples above.
 * an export script that outputs all triples for all available packages.

Both of these will be described below.
Both of these also require access to a CouchDB instance hosting this npm metadata.
This can either be the existing npm [registry](https://registry.npmjs.com/),
or a local [replication](https://docs.npmjs.com/misc/registry) of this data.

## Server
The server can be started by running `bin/index.js`.
The command to start it is
```
node bin/index.js -p port -c CouchDB_Url [-d domain_name] [--debug]
```

The `-p` and `-c` parameters are mandatory.
`-d` can be used if you want to set the url that should be used for mapping the generated URLs,
instead of using the Host header from the request.
`--debug` allows you to append the URLs with `.json`, `.jsonld`, `.ttl` and `.nt`
to see the different formats in-browser.
Content-type html or text is used to make sure the browser displays it.

## Export
The export scripts prints generated triples to stdout
and prints progress on stderr.
Actual errors can be printed to files given when calling the script.
It uses the following command line options:
```
usage: node bin/generateTriples.js -c CouchDB -d domain [-f format] [-s start] [-i] [-o] [-e file] [-E file]
 options:
  -c CouchDB : Uses the given CouchDB URL
               E.g. "-c http://localhost:5984/npm")
  -d domain  : Uses the given domain name as base URI.
               E.g. "-d http://example.org/" results in
               "http://example.org/bundles/npm/n3"
  -t type    : Output format, see below for a full list of supported formats
               E.g.: "-t nt"
  -s start   : Starts output from the given bundle, ignoring previous bundles.
               Can be used if output got interrupted previously. E.g.: "-s n3"
  -i         : Read bundle names from stdin instead of parsing all bundles.
               Names should be separated by newlines.
  -e file    : Write failed bundles to the given file.
  -E file    : Write failed bundles + error messages to the given file.
```
`-c` and `-d` are mandatory,
with `-d` providing the base namespace of all generated URLs.
The supported formats for the `-t` option are `nt` and `ttl`.
The `-i` option can be used to pipe a list of package names.
Only those packages will be exported instead of all packages.
The `-e` and `-E` options can be used to export errors.
Every package where an error occurs will not be exported,
even if that error only occurs in a single version of that package.