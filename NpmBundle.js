
const _ = require('lodash');
const semver = require('semver');
const NpmModule = require('./NpmModule');
const NpmContext = require('./NpmContext');

class NpmBundle
{
    constructor (json, rootUri)
    {
        // TODO: verify structure?
        this.json = json;
        this.rootUri = rootUri;
    }
    
    getJson ()
    {
        return this.json;
    }
    
    getUri ()
    {
        return this.rootUri + this.json._id;
    }
    
    getModule (version)
    {
        version = semver.maxSatisfying(Object.keys(this.json.versions), version);
        if (version === null)
            return version;
        return new NpmModule(this.json.versions[version], this.getUri() + '/');
    }
    
    getJsonLd ()
    {
        let moduleId = (moduleJson) => { return { '@id': (new NpmModule(moduleJson, this.getUri() + '/')).getUri() } };
        
        let clone = _.clone(this.json);
        
        NpmContext.addContext(clone, this.rootUri);
        clone['@type'] = 'doap:Project';
        
        // TODO: could also just keep them in here and use '@container': '@index' context?
        clone.versions = _.map(clone.versions, json => moduleId(json));
        clone['dist-tags'] = _.fromPairs(_.map(clone['dist-tags'], (version, key) => [key, moduleId(this.json.versions[version])]));
        clone.time = _.fromPairs(_.map(clone.time, (time, key) => [key, { '@value': time, '@type': 'xsd:dateTime'}]));
        
        return clone;
    }
}

module.exports = NpmBundle;