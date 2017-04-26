
const _ = require('lodash');
const fs = require('fs');
const readline = require('readline');
const JsonLdParser = require('../lib/util/JsonLdParser');
const NpmCouchDb = require('../lib/npm/NpmCouchDb');
const NpmBundle = require('../lib/npm/NpmBundle');
const NpmModule = require('../lib/npm/NpmModule');

let formatMap = {
    'jsonld': 'application/ld+json',
    'nt': 'application/n-triples',
    'nq': 'application/n-quads',
    'n3': 'text/n3',
    'ttl': 'text/turtle',
    'trig': 'application/trig'
};

let args = require('minimist')(process.argv.slice(2));
if (args.h || args.help || args._.length > 0 || !_.isEmpty(_.omit(args, ['_', 'c', 'd', 't', 's', 'i', 'e', 'E'])) || !args.c || !args.d)
{
    console.error('usage: node generateTriples.js -c CouchDB -d domain [-f format] [-s start] [-i] [-e file] [-E file]');
    console.error(' options:');
    console.error('  -c CouchDB : Uses the given CouchDB URL');
    console.error('               E.g. "-c http://localhost:5984/npm")');
    console.error('  -d domain  : Uses the given domain name as base URI.');
    console.error('               E.g. "-d http://example.org/" results in');
    console.error('               "http://example.org/bundles/npm/n3"');
    console.error('  -t type    : Output format, see below for a full list of supported formats');
    console.error('               E.g.: "-t nt"');
    console.error('  -s start   : Starts output from the given bundle, ignoring previous bundles.');
    console.error('               Can be used if output got interrupted previously. E.g.: "-s n3"');
    console.error('  -i         : Read bundle names from stdin instead of parsing all bundles.');
    console.error('               Names should be separated by newlines.');
    console.error('  -e file    : Write failed bundles to the given file.');
    console.error('  -E file    : Write failed bundles + error messages to the given file.');
    console.error(' supported formats (default is nt):');
    for (let format in formatMap)
        console.error(`    ${format} (${formatMap[format]})`);
    return process.exit((args.h || args.help) ? 0 : 1);
}

let startBundle = args.s;
let domain = args.d;
let format = args.t ? formatMap[args.t] : formatMap['nt'];
let couchDB = new NpmCouchDb(args.c);
let input = args.i;
let failedFile = args.e;
let errorFile = args.E;
let failed = 0;

// clear error files
if (failedFile && fs.existsSync(failedFile))
    fs.unlinkSync(failedFile);
if (errorFile && fs.existsSync(errorFile))
    fs.unlinkSync(errorFile);

// TODO: this doesn't include engines (and people, but all those triples are included in the package triples)
if (input)
{
    // storing entries in list to have progress indicator
    let lines = [];
    let rl = readline.createInterface({ input: process.stdin });
    rl.on('line', line =>
    {
        lines.push(line.trim());
        exportRecursive(lines.length-1, lines);
    });
}
else
{
    process.stderr.write('Loading bundles...');
    couchDB.all().then(list =>
    {
        let start_idx = 0;
        if (startBundle)
            start_idx = list.indexOf(startBundle);
        if (start_idx < 0)
            throw new Error('Unknown bundle ' + startBundle);
        exportRecursive(start_idx, list);
    }).catch(console.error);
}

function exportRecursive (idx, list)
{
    process.stderr.clearLine();
    process.stderr.cursorTo(0);
    process.stderr.write(`Exporting bundle ${idx}/${list.length} (${failed} failed)`);
    
    if (idx >= list.length)
    {
        process.stderr.clearLine();
        process.stderr.cursorTo(0);
        process.stderr.write(`Exported ${list.length-failed} bundles succesfully (${failed} failed)`);
        return;
    }
    
    let entry = list[idx];
    let bundle = new NpmBundle(entry, domain, couchDB);
    Promise.all([bundle.getJson(), bundle.getUserMap()]).then(([json, userMap]) =>
    {
        let modules = Object.keys(json.versions).map(version =>
        {
            return new NpmModule(entry, version, domain, userMap, couchDB);
        });
        
        // generate all entries first so no partial results get output if there is an error
        let promises = modules.map(module => module.getJsonLd().then(json => JsonLdParser.toRDF(json, { format, root: domain })));
        promises.push(bundle.getJsonLd().then(json => JsonLdParser.toRDF(json, { format, root: domain })));
        return Promise.all(promises);
    }).then(entries =>
    {
        for (let entry of entries)
            console.log(entry);
        exportRecursive(++idx, list);
    }).catch(e =>
    {
        ++failed;
        try
        {
            if (failedFile)
                fs.appendFileSync(failedFile, list[idx]);
            if (errorFile)
                fs.appendFileSync(errorFile + '\n' + e.toString(), list[idx]);
        }
        catch (e) { console.error (e); }
        exportRecursive(++idx, list);
    });
}