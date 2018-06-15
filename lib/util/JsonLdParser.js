
const _ = require('lodash');
const crypto = require('crypto');
const fs = require('fs');
const jsonld = require('jsonld');
const N3 = require('n3');
const path = require('path');
const urljoin = require('url-join');
const validUrl = require('valid-url');

// set up proxy for context
let context = JSON.parse(fs.readFileSync(path.join(__dirname, '../contexts/npm.jsonld')));
let nodeDocumentLoader = jsonld.documentLoaders.node();

// TODO: at this point I probably should put this in a non-static class :)
let blankNames = {};

class JsonLdParser
{
    // blank nodes will be skolemized so they are unique for the given document
    // this is based on the root URI, two documents with different root URIs will not have overlapping skolemized blank nodes
    static toRDF (doc, options)
    {
        // make use of already known contexts
        jsonld.documentLoader = (url, callback) =>
        {
            if (url === 'https://linkedsoftwaredependencies.org/contexts/npm.jsonld')
                return callback(null, {contextUrl: null, document: context, documentUrl: url});
            if (doc['lsd:contexts'] && doc['lsd:contexts'][url])
                return callback(null, {contextUrl: null, document: doc['lsd:contexts'][url], documentUrl: url});
            nodeDocumentLoader(url, callback);
        };

        blankNames = {};
        options = options || {};
        let format = options.format || 'object';
        if (!options.root)
            throw new Error('options.root required to skolemize blank nodes');

        if (format === 'object')
            return jsonld.promises.toRDF(doc);

        let writer = N3.Writer({ format });

        return jsonld.promises.toRDF(doc).then(triples =>
        {
            let blanks = {};
            for (let graphName in triples)
                for (let triple of triples[graphName])
                {
                    let result = JsonLdParser.convertTriple(triple, options.root, blanks);
                    if (result)
                        writer.addTriple(result);
                }
    
            return new Promise((resolve, reject) =>
            {
                writer.end((error, result) =>
                {
                    if (error)
                        reject(error);
                    else
                        resolve(result);
                })
            });
        });
    }
    
    static convertTriple(triple, root, blanks)
    {
        let result = {
            subject: JsonLdParser.isValid(triple.subject.value),
            predicate: JsonLdParser.isValid(triple.predicate.value),
            object: JsonLdParser.convertEntity(triple.object),
            graph: triple.graph ? JsonLdParser.isValid(triple.graph.value): undefined
        };
        
        if (!result.subject || !result.predicate || !result.object)
            return;
        if (triple.graph && !result.graph)
            return;
        
        let blankHash;
        
        // skolemize blank nodes
        for (let key in result)
        {
            if (result[key] && result[key].startsWith('_:'))
            {
                if (!blanks[result[key]])
                {
                    if (!blankHash) // only generate name here to reduce extra work
                    {
                        // try to make sure skolemized URIs stay consistent over data changes
                        blankHash = crypto.createHash('md5').update(_.filter(result, v => v && !v.startsWith('_:')).join('')).digest('hex');
                        if (!blankNames[blankHash])
                            blankNames[blankHash] = 0;
                        blankHash += blankNames[blankHash]++;
                    }
                    blanks[result[key]] = urljoin(root, '.well-known/genid/', blankHash);
                }
                result[key] = blanks[result[key]];
            }
        }
        
        return result;
    }
    
    // https://github.com/LinkedDataFragments/Server.js/blob/master/lib/datasources/JsonLdDatasource.js#L34
    // Converts a jsonld.js entity to the N3.js in-memory representation
    static convertEntity (entity)
    {
        // Return IRIs and blank nodes as-is
        if (entity.type !== 'literal')
            return JsonLdParser.isValid(entity.value);
        
        // Add a language tag to the literal if present
        if ('language' in entity)
            return '"' + entity.value + '"@' + entity.language;
        // Add a datatype to the literal if present
        if (entity.datatype !== 'http://www.w3.org/2001/XMLSchema#string')
            return '"' + entity.value + '"^^' + entity.datatype;
        // Otherwise, return the regular literal
        return '"' + entity.value + '"';
    }
    
    static isValid (uri)
    {
        if (uri.startsWith('_:'))
            return uri;
        if (uri.match(/^\w+:\/\/[a-zA-Z0-9._\-\/]*$/))
            return uri;
        if (validUrl.isUri(uri))
            return uri;
        return false;
    }
}

module.exports = JsonLdParser;