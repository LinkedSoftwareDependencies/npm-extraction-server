
const _ = require('lodash');
const cors = require('cors')
const express = require('express');
const path = require('path');
const JsonLdParser = require('../lib/util/JsonLdParser');
const Tarball = require('../lib/util/Tarball');
const NpmCouchDb = require('../lib/npm/NpmCouchDb');
const NpmBundle = require('../lib/npm/NpmBundle');
const NpmModule = require('../lib/npm/NpmModule');
const NpmUser = require('../lib/npm/NpmUser');
const NodeEngineBundle = require('../lib/npm/NodeEngineBundle');

let args = require('minimist')(process.argv.slice(2));
if (args.h || args.help || args._.length > 0 || !_.isEmpty(_.omit(args, ['_', 'p', 'c', 'd', 'debug'])) || !args.p || !args.c)
{
    console.error('usage: node bin/index.js -p port -c CouchDB_Url [-d domain_name] [--debug]');
    return process.exit((args.h || args.help) ? 0 : 1);
}

let port = args.p;
let debug = args.debug;
let couchDB = new NpmCouchDb(args.c);
let domain = args.d;

let app = express();

app.use(cors());

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
        let path = req._parsedUrl.pathname;
        let idx = path.lastIndexOf('.');
        let filetype = path.substring(idx + 1).toLowerCase();
        if (filetype === 'json' || filetype === 'jsonld' || formatMap[filetype])
        {
            req._filetype = filetype;
            req.url = path.substring(0, idx) + (req._parsedUrl.search || '');
            res.set('Link', `<https://${req.get('Host')}${req.url}>; rel="canonical"`);
        }
    }
    next();
});

// @org/package middleware
app.use((req, res, next) =>
{
    let url = req.url;
    if (url.startsWith('/bundles/npm/@')) {
        // this causes express to interpret the org/package combination as the package name
        url = url.replace(/^\/bundles\/npm\/@([^/]+)\/([^/]+)/, '/bundles/npm/@$1%2f$2');
        req.url = url;
    }
    next();
});


app.get('/', (req, res) => {
    res.sendStatus(200);
});

function getDomain (req)
{
    return domain || `${req.protocol}://${req.get('Host')}/`;
}

function errorMessage (error)
{
    // mostly made for the errors the jsonld library outputs
    let msg = error.toString();
    if (error.details)
    {
        msg += '\n';
        if (error.details.cause)
            msg += errorMessage(error.details.cause);
        else
            msg += JSON.stringify(error.details);
    }
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

function getContentNegotiation(req, res, jsonldPromise, root)
{
    function errorHandler (e) { handleError(e, res); }

    let formatResponses = {
        'application/ld+json': () => jsonldPromise.then(jsonld => res.type('application/ld+json').send(jsonld)).catch(errorHandler),
    };
    formatResponses['application/json'] = formatResponses['application/ld+json'];

    return formatResponses;
}

function respond(req, res, thingy)
{
    function errorHandler (e) { handleError(e, res); }
    function handleFormat (format) { return thingy.getJsonLd(req.query.output).then(json => JsonLdParser.toRDF(json, {format: format, root: thingy.getUri()})); }

    let conneg = getContentNegotiation(req, res, thingy.getJsonLd(), thingy.getUri());

    // browser-interpretable display of the results
    if (debug)
        conneg['text/html'] = () =>
        {
            if (!req._filetype)
                req._filetype = 'json';
            if (req._filetype === 'json')
                return thingy.getJson().then(data => res.type('json').send(JSON.stringify(data, null, 2))).catch(errorHandler);
            if (req._filetype === 'jsonld')
                return thingy.getJsonLd(req.query.output).then(data => res.type('json').send(JSON.stringify(data, null, 2))).catch(errorHandler);

            let type = formatMap[req._filetype];
            if (!type)
                return res.sendStatus(404);

            handleFormat(type).then(data => res.type('text').send(data)).catch(errorHandler);
        };

    res.format(conneg);
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
    let oldModule = new NpmModule(req.params.package, req.params.version, getDomain(req));
    pkg.getModule(req.params.version).then(module =>
    {
        if (module.version !== req.params.version)
            res.location(module.getUri() + (req._filetype ? '.' + req._filetype : ''))
                    .status(307)
                    .send(`<${oldModule.getUri()}> <https://linkedsoftwaredependencies.org/vocabularies/npm#maxSatisfying> <${module.getUri()}>.`);
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
            return res.redirect(307, module.getUri() + '/scripts/' + encodeURIComponent(req.params.script));

        return module.getJson().then(json =>
        {
            if (!json.scripts || !json.scripts[req.params.script])
                return res.sendStatus(404);

            res.type('text').send(json.scripts[req.params.script]);
        });
    }).catch(e => { console.error(e); res.status(500).send(errorMessage(e)); });
});

app.get('/bundles/npm/:package/:version/:path(*)', (req, res) =>
{
    let pkg = new NpmBundle(req.params.package, getDomain(req), couchDB);
    let oldModule = new NpmModule(req.params.package, req.params.version, getDomain(req));
    pkg.getModule(req.params.version)
        .then(module =>
        {
            if (module.version !== req.params.version)
                return res.location(module.getUri() + '/' + req.params.path + (req._filetype ? '.' + req._filetype : ''))
                    .status(307)
                    .send(`<${oldModule.getUri()}> <https://linkedsoftwaredependencies.org/vocabularies/npm#maxSatisfying> <${module.getUri()}/${req.params.path}>.`);

            return module.getJson().then(json => {
                // In case lsd:importPaths is true we always need to download the tarball to check
                let valid = json['lsd:module'] === true;

                if (!valid) {
                    let paths = json['lsd:importPaths'];
                    let contexts = json['lsd:contexts'];
                    if ((!paths && !contexts) || !json.dist || !json.dist.tarball)
                        return res.sendStatus(404);

                    if (paths) {
                        for (let key in paths) {
                            if (req.params.path.indexOf(paths[key]) >= 0) {
                                valid = true;
                                break;
                            }
                        }
                    } else if (contexts) {
                        // backwards compatability for configs without lsd:importPaths
                        for (let key in contexts) {
                            if (contexts[key] === req.params.path) {
                                valid = true;
                                break;
                            }
                        }
                    }
                }

                if (valid) {
                    let jsonld = module.getTarball().then(data => JSON.parse(Tarball.resolvePath(req.params.path, data)));
                    let conneg = getContentNegotiation(req, res, jsonld, pkg.getUri());
                    res.format(conneg);
                } else {
                    res.sendStatus(404);
                }
            });
    }).catch(e => { console.error(e); res.status(500).send(errorMessage(e)); });
});

app.get('/users/npm/:user', (req, res) =>
{
    let user = new NpmUser(req.params.user, getDomain(req), couchDB);
    respond(req, res, user);
});

app.get('/engines/:engine/', (req, res) =>
{
    let engine = new NodeEngineBundle(req.params.engine, getDomain(req));
    respond(req, res, engine);
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

app.listen(port, () => {
    console.log(`Listening on port ${port}.`);
});
