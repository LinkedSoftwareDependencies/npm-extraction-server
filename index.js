
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
    }
    
    next();
});


app.get('/', (req, res) => {
    res.sendStatus(200);
});

function respond(req, res, thingy)
{
    let nquadsFunc = dataFunc => jsonld.toRDF(thingy.getJsonLd(), {format: 'application/nquads'}, (err, nquads) => { if (err) throw new Error(err); dataFunc(nquads); });
    
    res.format({
        'application/json': () => res.send(thingy.getJson()),
        'application/ld+json': () => res.send(thingy.getJsonLd()),
        'application/n-quads': () => nquadsFunc(data => res.send(data)),
        'text/html': () =>
        {
            if (!req._filetype)
                req._filetype = 'json';
            if (req._filetype === 'json')
                res.type('json').send(JSON.stringify(thingy.getJson(), null, 2));
            else if (req._filetype === 'jsonld')
                res.type('json').send(JSON.stringify(thingy.getJsonLd(), null, 2));
            else if (req._filetype === 'nt' || req._filetype === 'nq')
                nquadsFunc(data => res.type('text').send(data));
        }
    });
}

app.get('/npm/:package', (req, res) =>
{
    couchDB.getPackage(req.params.package).then(json =>
    {
        let pkg = new NpmBundle(json, `http://${req.get('Host')}/npm/`);
        respond(req, res, pkg);
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

app.get('/npm/:package/:version', (req, res) =>
{
    couchDB.getPackage(req.params.package).then(json =>
    {
        let pkg = new NpmBundle(json, `http://${req.get('Host')}/npm/`);
        let version = pkg.getModule(req.params.version);
        if (version.getJson().version !== req.params.version)
            res.redirect(303, version.getUri() + (req._filetype ? '.' + req._filetype : ''));
        else
            respond(req, res, version);
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

// TODO: or maybe go with /npm/user/:user and /npm/package/:package
app.get('/npmUser/:user', (req, res) =>
{
    couchDB.getUserPackageList(req.params.user).then(list =>
    {
        let user = new NpmUser(req.params.user, list, `http://${req.get('Host')}/npmUser/`);
        respond(req, res, user);
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

app.listen(port, () => {
    console.log(`Listening on port ${port}.`);
});