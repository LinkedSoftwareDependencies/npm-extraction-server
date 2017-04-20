
const _ = require('lodash');
const EngineModule = require('./EngineModule');
const NodeEngines = require('./NodeEngines');

class NodeEngineModule extends EngineModule
{
    constructor (name, version, rootUri)
    {
        super(rootUri);
        this.name = name;
        this.version = version;
        this.rootUri = rootUri;
        this.engines = new NodeEngines();
    }
    
    getBaseUri ()
    {
        return super.getBaseUri() + this.name + '/';
    }
    
    getUri ()
    {
        return this.getBaseUri() + this.version;
    }
    
    getJson ()
    {
        if (this.json)
            return Promise.resolve(this.json);
        
        return this.engines.getModuleJson(this.name, this.version).then(json =>
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
            clone['owl:sameAs'] = { '@id': this.engines.urls[this.name].root + this.version };
            clone['@context'] = { '@vocab' : 'http://npm.example.org/', 'owl': 'http://www.w3.org/2002/07/owl#' };
            
            return clone;
        });
    }
}

module.exports = NodeEngineModule;