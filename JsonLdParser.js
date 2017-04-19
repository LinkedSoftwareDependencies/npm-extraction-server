
const jsonld = require('jsonld');
const N3 = require('n3');

class JsonLdParser
{
    static toRDF(doc, options)
    {
        options = options || {};
        let format = options.format || 'object';
        if (format === 'application/n-quads' || format === 'application/n-triples')
            return jsonld.promises.toRDF(doc, {format: 'application/nquads'});
    
        if (format === 'object')
            return jsonld.promises.toRDF(doc);
        
        let writer = N3.Writer({ format });
        
        return jsonld.promises.toRDF(doc).then(triples =>
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
    }
    
    // https://github.com/LinkedDataFragments/Server.js/blob/master/lib/datasources/JsonLdDatasource.js#L34
    // Converts a jsonld.js entity to the N3.js in-memory representation
    static convertEntity(entity) {
        // Return IRIs and blank nodes as-is
        if (entity.type !== 'literal')
            return entity.value;
        else {
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
}

module.exports = JsonLdParser;