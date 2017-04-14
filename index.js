
const _ = require('lodash');
const express = require('express');
const NpmCouchDb = require('./NpmCouchDb');
const NpmBundle = require('./NpmBundle');
const jsonld = require('jsonld');

let args = require('minimist')(process.argv.slice(2));
if (args.h || args.help || args._.length > 0 || !_.isEmpty(_.omit(args, ['_', 'p', 'c', 'd'])) || !args.p || !args.c)
{
    console.error('usage: node index.js -p port -c CouchDB_Url [-d domain_name]');
    return process.exit((args.h || args.help) ? 0 : 1);
}

let port = args.p;
let couchUrl = args.c;

let app = express();

// file extension middleware
app.use((req, res, next) =>
{
    // provide visualization for browsers
    if (req.accepts('text/html') && (req.url.endsWith('.json') || req.url.endsWith('.jsonld') || req.url.endsWith('.nt') || req.url.endsWith('.nq')))
    {
        let idx = req.url.lastIndexOf('.');
        req._filetype = req.url.substring(idx+1).toLowerCase();
        req.url = req.url.substring(0, idx);
    }
    
    next();
});


app.get('/', (req, res) => {
    res.sendStatus(200);
});

function respond(req, res, jsonFunc, jsonLdFunc, ntFunc)
{
    res.format({
        'application/json': () => jsonFunc(data => res.send(data)),
        'application/ld+json': () => jsonLdFunc(data => res.send(data)),
        'application/n-quads': () => ntFunc(data => res.send(data)),
        'text/html': () =>
        {
            if (!req._filetype)
                req._filetype = 'json';
            if (req._filetype === 'json')
                jsonFunc(data => res.type('json').send(data));
            else if (req._filetype === 'jsonld')
                jsonLdFunc(data => res.type('json').send(data));
            else if (req._filetype === 'nt' || req._filetype === 'nq')
                ntFunc(data => res.type('text').send(data));
        }
    });
}

app.get('/npm/:package', (req, res) => {
    let db = new NpmCouchDb(couchUrl);
    
    db.getPackage(req.params.package).then(json =>
    {
        let pkg = new NpmBundle(json, `http://${req.get('Host')}/npm/`);
        respond(req, res,
            (f) => f(pkg.getJson()),
            (f) => f(pkg.getJsonLd()),
            (f) => jsonld.toRDF(pkg.getJsonLd(), {format: 'application/nquads'}, (err, nquads) => {if (err) throw new Error(err); f(nquads); })
        );
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

app.get('/npm/:package/:version', (req, res) => {
    let db = new NpmCouchDb(couchUrl);
    db.getPackage(req.params.package).then(json =>
    {
        let pkg = new NpmBundle(json, `http://${req.get('Host')}/npm/`);
        let version = pkg.getModule(req.params.version);
        if (version.getJson().version !== req.params.version)
            res.redirect(303, version.getUri() + (req._filetype ? '.' + req._filetype : ''));
        else
            respond(req, res,
                (f) => f(version.getJson()),
                (f) => f(version.getJsonLd()),
                (f) => jsonld.toRDF(version.getJsonLd(), {format: 'application/nquads'}, (err, nquads) => {if (err) throw new Error(err); f(nquads); })
            );
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

app.listen(port, () => {
    console.log(`Listening on port ${port}.`);
});