
const _ = require('lodash');
const express = require('express');
const path = require('path');
const JsonLdParser = require('../lib/util/JsonLdParser');
const NpmCouchDb = require('../lib/npm/NpmCouchDb');
const NpmBundle = require('../lib/npm/NpmBundle');
const NpmUser = require('../lib/npm/NpmUser');
const NodeEngineBundle = require('../lib/npm/NodeEngineBundle');

let args = require('minimist')(process.argv.slice(2));
if (args.h || args.help || args._.length > 0 || !_.isEmpty(_.omit(args, ['_', 'p', 'c', 'd', 'debug'])) || !args.p || !args.c)
{
    console.error('usage: node index.js -p port -c CouchDB_Url [-d domain_name] [--debug]');
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
    'n3': 'text/n3',
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

function getDomain (req)
{
    return domain || `http://${req.get('Host')}/`;
}

function errorMessage (error)
{
    // mostly made for the errors the jsonld library outputs
    let msg = error.toString();
    if (error.details && error.details.cause)
        msg += '\n' + errorMessage(error.details.cause);
    return msg;
}

function handleError (error, res)
{
    console.error(errorMessage(error));
    console.error(error);
    if (error.name === 'HTTP')
        res.sendStatus(error.message);
    else
        res.status(500).send(errorMessage(error));
}

function respond(req, res, thingy)
{
    function errorHandler (e) { handleError(e, res); }
    function handleFormat (format) { return thingy.getJsonLd().then(json => JsonLdParser.toRDF(json, {format: format, root: getDomain(req)})); }
    
    let formatResponses = {
        'application/json': () => thingy.getJsonLd().then(json => res.type('application/ld+json').send(json)).catch(errorHandler),
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
    let pkg = new NpmBundle(req.params.package, getDomain(req), couchDB);
    respond(req, res, pkg);
});

app.get('/bundles/npm/:package/README', (req, res) =>
{
    let pkg = new NpmBundle(req.params.package, getDomain(req), couchDB);
    pkg.getJson().then(json =>
    {
        if (!json.readme)
            return res.sendStatus(404);
        
        res.type('text').send(json.readme);
    }).catch(e => { console.error(e); res.status(500).send(errorMessage(e)); });
});

app.get('/bundles/npm/:package/:version', (req, res) =>
{
    let pkg = new NpmBundle(req.params.package, getDomain(req), couchDB);
    pkg.getModule(req.params.version).then(module =>
    {
        if (module.version !== req.params.version)
            res.redirect(307, module.getUri() + (req._filetype ? '.' + req._filetype : ''));
        else
            return respond(req, res, module);
    }).catch(e => { console.error(e); res.status(500).send(errorMessage(e)); });
});

app.get('/bundles/npm/:package/:version/scripts/:script', (req, res) =>
{
    let pkg = new NpmBundle(req.params.package, getDomain(req), couchDB);
    pkg.getModule(req.params.version).then(module =>
    {
        if (module.version !== req.params.version)
            return res.redirect(307, module.getUri() + '/scripts/' + req.params.script);
            
        return module.getJson().then(json =>
        {
            if (!json.scripts || !json.scripts[req.params.script])
                return res.sendStatus(404);
            
            res.type('text').send(json.scripts[req.params.script]);
        });
    }).catch(e => { console.error(e); res.status(500).send(errorMessage(e)); });
});

app.get('/users/npm/:user', (req, res) =>
{
    let user = new NpmUser(req.params.user, getDomain(req), couchDB);
    respond(req, res, user);
});

app.get('/engines/:engine/:version', (req, res) =>
{
    let engine = new NodeEngineBundle(req.params.engine, getDomain(req));
    engine.getModule(req.params.version).then(module =>
    {
        if (module.version !== req.params.version)
            res.redirect(307, module.getUri() + (req._filetype ? '.' + req._filetype : ''));
        else
            return respond(req, res, module);
    }).catch(e => handleError(e, res));
});

app.get('/contexts/:name', (req, res) =>
{
    let p = path.join(__dirname, `../lib/contexts/${encodeURIComponent(req.params.name)}.jsonld`);
    res.type('application/ld+json').sendFile(p, {}, e => { if (e) res.sendStatus(404) });
});

// TODO: do we keep this here, i.e., will this be in the same namespace?
app.get('/ontologies/:name', (req, res) =>
{
    let p = path.join(__dirname, `../lib/ontologies/${encodeURIComponent(req.params.name)}.owl`);
    res.type('text/turtle').sendFile(p, {}, e => { if (e) res.sendStatus(404) });
});

app.listen(port, () => {
    console.log(`Listening on port ${port}.`);
});