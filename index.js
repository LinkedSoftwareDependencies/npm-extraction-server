
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

app.get('/', function (req, res) {
    //res.json({});
    res.sendStatus(200);
});

app.get('/:package', function (req, res) {
    let db = new NpmCouchDb('http://localhost:5984/npm2/');
    db.getPackage(req.params.package).then(json =>
    {
        let pkg = new NpmPackage(json, 'http://example.org/npm/');
        res.format({
            'application/ld+json': () => { res.send(pkg.getJsonLd()); },
            'application/json': () => { res.send(pkg.getJson()); },
            'application/n-quads': () => jsonld.toRDF(pkg.getJsonLd(), {format: 'application/nquads'}, (err, nquads) => {if (err) throw new Error(err); res.send(nquads); })
        });
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

app.get('/:package/:version', function (req, res) {
    let db = new NpmCouchDb('http://localhost:5984/npm2/');
    db.getPackage(req.params.package).then(json =>
    {
        let pkg = new NpmPackage(json, 'http://example.org/npm/');
        let version = pkg.getVersion(req.params.version);
        res.format({
            'application/ld+json': () => { res.send(version.getJsonLd()); },
            'application/json': () => { res.send(version.getJson()); },
            'application/n-quads': () => jsonld.toRDF(version.getJsonLd(), {format: 'application/nquads'}, (err, nquads) => {if (err) throw new Error(err); res.send(nquads); })
        });
    }).catch(e =>
    {
        console.error(e);
        res.status(500).send(e);
    });
});

app.listen(port, function () {
    console.log(`Listening on port ${port}.`);
});