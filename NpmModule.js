
const _ = require('lodash');
const NpmContext = require('./NpmContext');

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
        let clone = _.clone(this.json);
        NpmContext.addContext(clone, this.rootUri);
    
        // TODO: can't use this since _id is package@version here...
        delete clone['@context']._id;
        
        return clone;
    }
}

module.exports = NpmModule;