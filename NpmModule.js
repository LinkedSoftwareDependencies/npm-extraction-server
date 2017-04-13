
const _ = require('lodash');

class NpmModule
{
    constructor (json, rootUri)
    {
        this.json = json;
        this.rootUri = rootUri;
    }
    
    getJson ()
    {
        return this.json;
    }
    
    getUri ()
    {
        return this.rootUri + this.json.version;
    }
    
    getJsonLd ()
    {
        let self = this;
    
        let clone = _.clone(this.json);
        clone['@id'] = this.getUri();
        clone['@type'] = 'http://npm.example.org/versionedPackage';
        clone['@context'] = { '@vocab': 'http://npm.example.org/', 'xsd': 'http://www.w3.org/2001/XMLSchema#' };
    
        return clone;
    }
}

module.exports = NpmModule;