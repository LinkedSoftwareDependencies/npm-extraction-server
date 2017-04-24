
const _ = require('lodash');
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
if (args.h || args.help || args._.length > 0 || !_.isEmpty(_.omit(args, ['_', 'c', 'd', 'f', 's', 'i', 'e'])) || !args.c || !args.d)
{
    console.error('usage: node generateTriples.js -c CouchDB -d domain [-f format] [-s start] [-i]');
    console.error(' options:');
    console.error('  -c CouchDB : Uses the given CouchDB URL');
    console.error('               E.g. "-c http://localhost:5984/npm")');
    console.error('  -d domain  : Uses the given domain name as base URI.');
    console.error('               E.g. "-d http://example.org/" results in');
    console.error('               "http://example.org/bundles/npm/n3"');
    console.error('  -f format  : Output format, see below for a full list of supported formats');
    console.error('               E.g.: "-f nt"');
    console.error('  -s start   : Starts output from the given bundle, ignoring previous bundles.');
    console.error('               Can be used if output got interrupted previously. E.g.: "-s n3"');
    console.error('  -i         : Read bundle names from stdin instead of parsing all bundles.');
    console.error('               Names should be separated by newlines.');
    console.error('  -e         : Print error messages to stderr when a bundle failed.');
    console.error(' supported formats (default is nt):');
    for (let format in formatMap)
        console.error(`    ${format} (${formatMap[format]})`);
    return process.exit((args.h || args.help) ? 0 : 1);
}

let startBundle = args.s;
let domain = args.d;
let format = args.f ? formatMap[args.f] : formatMap['nt'];
let couchDB = new NpmCouchDb(args.c);
let input = args.i;
let errors = args.e;

// TODO: this actually doesn't work atm due to overlapping blank nodes!!!
// TODO: this doesn't include engines (and people, but all those triples are included in the package triples)
// TODO: definitely need to change code so we don't call the same entry 400 times if there are 400 versions
if (input)
{
    let rl = readline.createInterface({ input: process.stdin });
    rl.on('line', line => exportRecursive(0, [line]));
}
else
{
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
    if (idx >= list.length)
        return;
    
    let entry = list[idx];
    let bundle = new NpmBundle(entry, domain, couchDB);
    Promise.all([bundle.getJson(), bundle.getUserMap()]).then(([json, userMap]) =>
    {
        let modules = Object.keys(json.versions).map(version =>
        {
            return new NpmModule(entry, version, domain, userMap, couchDB);
        });
        
        // generate all entries first so no partial results get output if there is an error
        let promises = modules.map(module => module.getJsonLd().then(json => JsonLdParser.toRDF(json, { format })));
        promises.push(bundle.getJsonLd().then(json => JsonLdParser.toRDF(json, { format })));
        return Promise.all(promises);
    }).then(entries =>
    {
        for (let entry of entries)
            console.log(entry);
        exportRecursive(++idx, list);
    }).catch(e =>
    {
        console.error(list[idx]);
        if (errors)
            console.error(e);
        exportRecursive(++idx, list);
    });
}