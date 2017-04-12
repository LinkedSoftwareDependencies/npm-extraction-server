
const _ = require('lodash');
const express = require('express');
const NpmCouchDb = require('./NpmCouchDb');
const NpmPackage = require('./NpmPackage');
const jsonld = require('jsonld');

let args = require('minimist')(process.argv.slice(2));
if (args.h || args.help || args._.length > 0 || !_.isEmpty(_.omit(args, ['_', 'p', 'r'])))
{
    console.error('usage: node demo.js [-p port] [--help]');
    return process.exit((args.h || args.help) ? 0 : 1);
}

let port = args.p || 3000;

let app = express();

// file extension middleware
app.use((req, res, next) =>
{
    if (req.url.endsWith('.json'))
    {
        req.headers.accept = 'application/json';
        req.url = req.url.slice(0, -'.json'.length);
    }
    else if (req.url.endsWith('.jsonld'))
    {
        req.headers.accept = 'application/ld+json';
        req.url = req.url.slice(0, -'.jsonld'.length);
    }
    else if (req.url.endsWith('.nt') || req.url.endsWith('.nq'))
    {
        req.headers.accept = 'application/n-quads';
        req.url = req.url.slice(0, -'.nt'.length);
    }
    next();
});


app.get('/', (req, res) => {
    res.sendStatus(200);
});

app.get('/npm/:package', (req, res) => {
    let db = new NpmCouchDb('http://localhost:5984/npm2/');
    db.getPackage(req.params.package).then(json =>
    {
        let pkg = new NpmPackage(json, `http://${req.get('Host')}/npm/`);
        res.format({
            'application/json': () => { res.send(pkg.getJson()); },
            'application/ld+json': () => { res.send(pkg.getJsonLd()); },
            'application/n-quads': () => jsonld.toRDF(pkg.getJsonLd(), {format: 'application/nquads'}, (err, nquads) => {if (err) throw new Error(err); res.send(nquads); })
        });
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

app.get('/npm/:package/:version', (req, res) => {
    let db = new NpmCouchDb('http://localhost:5984/npm2/');
    db.getPackage(req.params.package).then(json =>
    {
        let pkg = new NpmPackage(json, `http://${req.get('Host')}/npm/`);
        let version = pkg.getVersion(req.params.version);
        if (version.getJson().version !== req.params.version)
            res.redirect(303, `/npm/${req.params.package}/${version.getJson().version}`);
        else
            res.format({
                'application/json': () => { res.send(version.getJson()); },
                'application/ld+json': () => { res.send(version.getJsonLd()); },
                'application/n-quads': () => jsonld.toRDF(version.getJsonLd(), {format: 'application/nquads'}, (err, nquads) => {if (err) throw new Error(err); res.send(nquads); })
            });
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

app.listen(port, () => {
    console.log(`Listening on port ${port}.`);
});