
const _ = require('lodash');
const jsonld = require('jsonld');
const N3 = require('n3');
const uuid = require('uuid');

class JsonLdParser
{
    static toRDF (doc, options)
    {
        options = options || {};
        let format = options.format || 'object';
        if (!options.root)
            throw new Error('options.root required to skolemize blank nodes');
        return JsonLdParser.skolemizeJsonLd(doc, options.root).then(skolemized =>
        {
            if (format === 'application/n-quads' || format === 'application/n-triples')
                return jsonld.promises.toRDF(skolemized, { format: 'application/nquads' });
    
            if (format === 'object')
                return jsonld.promises.toRDF(skolemized);
    
            let writer = N3.Writer({ format });
    
            return jsonld.promises.toRDF(skolemized).then(triples =>
            {
                for (let graphName in triples)
                    for (let triple of triples[graphName])
                        writer.addTriple(triple.subject.value, triple.predicate.value, JsonLdParser.convertEntity(triple.object));
        
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
        });
    }
    
    // TODO: drop this if we can guarantee there are no blank nodes
    static skolemizeJsonLd (doc, root)
    {
        // https://www.w3.org/2011/rdf-wg/wiki/Skolemisation
        function generateURI () { return root + '.well-known/genid/' + uuid.v4(); }
        function isBlank (uri) { return uri.startsWith('_:'); }
    
        let blanks = {};
        function handleId (entry)
        {
            let id = entry['@id'];
            if (!id)
                return;
            if (isBlank(id))
            {
                if (!blanks[id])
                    blanks[id] = generateURI();
                entry['@id'] = blanks[id];
            }
        }
        
        return jsonld.promises.flatten(doc).then(flattened =>
        {
            let list = flattened['@graph'] || flattened;
            for (let entry of list)
            {
                handleId(entry);
                for (let pred in entry)
                {
                    if (_.isArray(entry[pred]))
                        entry[pred].forEach(o => handleId(o));
                    else
                        handleId(entry[pred]);
                }
            }
            return flattened;
        });
    }
    
    // https://github.com/LinkedDataFragments/Server.js/blob/master/lib/datasources/JsonLdDatasource.js#L34
    // Converts a jsonld.js entity to the N3.js in-memory representation
    static convertEntity (entity)
    {
        // Return IRIs and blank nodes as-is
        if (entity.type !== 'literal')
            return entity.value;
        
        // Add a language tag to the literal if present
        if ('language' in entity)
            return '"' + entity.value + '"@' + entity.language;
        // Add a datatype to the literal if present
        if (entity.datatype !== 'http://www.w3.org/2001/XMLSchema#string')
            return '"' + entity.value + '"^^' + entity.datatype;
        // Otherwise, return the regular literal
        return '"' + entity.value + '"';
    }
}

module.exports = JsonLdParser;