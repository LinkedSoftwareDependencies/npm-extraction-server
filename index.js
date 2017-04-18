
const _ = require('lodash');
const express = require('express');
const jsonld = require('jsonld');
const NpmCouchDb = require('./NpmCouchDb');
const NpmBundle = require('./NpmBundle');
const NpmUser = require('./NpmUser');

let args = require('minimist')(process.argv.slice(2));
if (args.h || args.help || args._.length > 0 || !_.isEmpty(_.omit(args, ['_', 'p', 'c', 'd'])) || !args.p || !args.c)
{
    console.error('usage: node index.js -p port -c CouchDB_Url [-d domain_name]');
    return process.exit((args.h || args.help) ? 0 : 1);
}

let port = args.p;
let couchDB = new NpmCouchDb(args.c);

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
        res.set('Link', `<http://${req.get('Host')}${req.url}>; rel="canonical"`);
    }
    
    next();
});


app.get('/', (req, res) => {
    res.sendStatus(200);
});

function respond(req, res, thingy)
{
    let nquads = json =>
    {
        return new Promise((resolve, reject) =>
        {
            jsonld.toRDF(json, {format: 'application/nquads'}, (err, nquads) => { if (err) reject(new Error(err)); resolve(nquads); });
        });
    };
    
    let errorHandler = e => { console.error(e); res.status(500).send(e); };
    
    res.format({
        'application/json': () => thingy.getJson().then(data => res.send(data)).catch(errorHandler),
        'application/ld+json': () => thingy.getJsonLd().then(json => res.send(json)).catch(errorHandler),
        'application/n-quads': () => thingy.getJsonLd().then(nquads).then(data => res.send(data)).catch(errorHandler),
        'text/html': () =>
        {
            if (!req._filetype)
                req._filetype = 'json';
            if (req._filetype === 'json')
                thingy.getJson().then(data => res.type('json').send(JSON.stringify(data, null, 2))).catch(errorHandler);
            else if (req._filetype === 'jsonld')
                thingy.getJsonLd().then(data => res.type('json').send(JSON.stringify(data, null, 2))).catch(errorHandler);
            else if (req._filetype === 'nt' || req._filetype === 'nq')
                thingy.getJsonLd().then(nquads).then(data => res.type('text').send(data)).catch(errorHandler);
        }
    });
}

app.get('/bundles/npm/:package', (req, res) =>
{
    let pkg = new NpmBundle(req.params.package, `http://${req.get('Host')}/`, couchDB);
    respond(req, res, pkg);
});

app.get('/bundles/npm/:package/:version', (req, res) =>
{
    let pkg = new NpmBundle(req.params.package, `http://${req.get('Host')}/`, couchDB);
    pkg.getModule(req.params.version).then(module =>
    {
        if (module.version !== req.params.version)
            res.redirect(303, module.getUri() + (req._filetype ? '.' + req._filetype : ''));
        else
            respond(req, res, module);
    }).catch(e => { console.error(e); res.status(500).send(e); });
});

app.get('/users/npm/:user', (req, res) =>
{
    let user = new NpmUser(req.params.user, `http://${req.get('Host')}/`, couchDB);
    respond(req, res, user);
});

app.listen(port, () => {
    console.log(`Listening on port ${port}.`);
});