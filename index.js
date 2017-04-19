
const _ = require('lodash');
const express = require('express');
const JsonLdParser = require('./JsonLdParser');
const NpmCouchDb = require('./NpmCouchDb');
const NpmBundle = require('./NpmBundle');
const NpmUser = require('./NpmUser');

let args = require('minimist')(process.argv.slice(2));
if (args.h || args.help || args._.length > 0 || !_.isEmpty(_.omit(args, ['_', 'p', 'c', 'd', 'debug'])) || !args.p || !args.c)
{
    console.error('usage: node index.js -p port -c CouchDB_Url [-d domain_name] [--html_display]');
    return process.exit((args.h || args.help) ? 0 : 1);
}

let port = args.p;
let debug = args.debug;
let couchDB = new NpmCouchDb(args.c);
let domain = args.d;

let app = express();

// json and json-ld are covered separately
let formatMap = {
    'nt': 'application/n-triples',
    'nq': 'application/n-quads',
    'ttl': 'text/turtle',
    'trig': 'application/trig'
};

// file extension middleware
app.use((req, res, next) =>
{
    if (debug && req.accepts('text/html'))
    {
        let idx = req.url.lastIndexOf('.');
        let filetype = req.url.substring(idx + 1).toLowerCase();
        if (filetype === 'json' || filetype === 'jsonld' || formatMap[filetype])
        {
            req._filetype = filetype;
            req.url = req.url.substring(0, idx);
            res.set('Link', `<http://${req.get('Host')}${req.url}>; rel="canonical"`);
        }
    }
    next();
});


app.get('/', (req, res) => {
    res.sendStatus(200);
});

function respond(req, res, thingy)
{
    function errorHandler (e) { console.error(e); res.status(500).send(e.message || e); }
    function handleFormat (format) { return thingy.getJsonLd().then(json => JsonLdParser.toRDF(json, {format})); }
    
    let formatResponses = {
        'application/json': () => thingy.getJson().then(data => res.send(data)).catch(errorHandler),
        'application/ld+json': () => thingy.getJsonLd().then(json => res.send(json)).catch(errorHandler)
    };
    
    // browser-interpretable display of the results
    if (debug)
        formatResponses['text/html'] = () =>
        {
            if (!req._filetype)
                req._filetype = 'json';
            if (req._filetype === 'json')
                return thingy.getJson().then(data => res.type('json').send(JSON.stringify(data, null, 2))).catch(errorHandler);
            if (req._filetype === 'jsonld')
                return thingy.getJsonLd().then(data => res.type('json').send(JSON.stringify(data, null, 2))).catch(errorHandler);
        
            let type = formatMap[req._filetype];
            if (!type)
                return res.sendStatus(404);
        
            handleFormat(type).then(data => res.type('text').send(data)).catch(errorHandler);
        };
    
    for (let type in formatMap)
        formatResponses[formatMap[type]] = () => handleFormat(formatMap[type]).then(data => res.send(data)).catch(errorHandler);
    
    res.format(formatResponses);
}

app.get('/bundles/npm/:package', (req, res) =>
{
    let pkg = new NpmBundle(req.params.package, domain || `http://${req.get('Host')}/`, couchDB);
    respond(req, res, pkg);
});

app.get('/bundles/npm/:package/:version', (req, res) =>
{
    let pkg = new NpmBundle(req.params.package, domain || `http://${req.get('Host')}/`, couchDB);
    pkg.getModule(req.params.version).then(module =>
    {
        if (module.version !== req.params.version)
            res.redirect(303, module.getUri() + (req._filetype ? '.' + req._filetype : ''));
        else
            respond(req, res, module);
    }).catch(e => { console.error(e); res.status(500).send(e.message || e); });
});

app.get('/users/npm/:user', (req, res) =>
{
    let user = new NpmUser(req.params.user, domain || `http://${req.get('Host')}/`, couchDB);
    respond(req, res, user);
});

app.listen(port, () => {
    console.log(`Listening on port ${port}.`);
});