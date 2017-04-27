
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

        if (format === 'object')
            return jsonld.promises.toRDF(doc);

        let writer = N3.Writer({ format });

        return jsonld.promises.toRDF(doc).then(triples =>
        {
            let blanks = {};
            for (let graphName in triples)
                for (let triple of triples[graphName])
                    writer.addTriple(JsonLdParser.convertTriple(triple, options.root, blanks));
    
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
            subject: triple.subject.value,
            predicate: triple.predicate.value,
            object: JsonLdParser.convertEntity(triple.object),
            graph: triple.graph ? triple.graph.value : undefined
        };
        
        // skolemize blank nodes
        for (let key in result)
        {
            if (result[key] && result[key].startsWith('_:'))
            {
                if (!blanks[result[key]])
                    blanks[result[key]] = root + '.well-known/genid/' + uuid.v4();
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