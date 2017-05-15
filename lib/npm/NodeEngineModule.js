
const _ = require('lodash');
const EngineModule = require('../EngineModule');
const NodeEngines = require('./NodeEngines');

class NodeEngineModule extends EngineModule
{
    constructor (name, version, rootUri)
    {
        super(rootUri);
        this.name = name;
        this.version = version;
        this.rootUri = rootUri;
    }
    
    getBaseUri ()
    {
        return super.getBaseUri() + encodeURIComponent(this.name) + '/';
    }
    
    getUri ()
    {
        return this.getBaseUri() + encodeURIComponent(this.version);
    }
    
    getJson ()
    {
        if (this.json)
            return Promise.resolve(this.json);
        
        return NodeEngines.getModuleJson(this.name, this.version).then(json =>
        {
            this.json = json;
            return json;
        });
    }
    
    getJsonLd ()
    {
        return this.getJson().then(json =>
        {
            let clone = _.clone(json);
            clone['@id'] = this.getUri();
            clone['owl:sameAs'] = { '@id': NodeEngines.urls[this.name].root + encodeURIComponent(this.version) };
            clone['@context'] = {
                'xsd'       : 'http://www.w3.org/2001/XMLSchema#',
                'owl'       : 'http://www.w3.org/2002/07/owl#',
                'dcterms'   : 'http://purl.org/dc/terms/',
                'doap'      : 'http://usefulinc.com/ns/doap#',
                
                'version'   : 'doap:revision',
                'date'      : { '@id': 'dcterms:created', '@type': 'xsd:date' }
            };
            
            return clone;
        });
    }
}

module.exports = NodeEngineModule;