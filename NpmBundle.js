
const _ = require('lodash');
const semver = require('semver');
const Bundle = require('./Bundle');
const NpmModule = require('./NpmModule');
const NpmContext = require('./NpmContext');

class NpmBundle extends Bundle
{
    constructor (name, rootUri, dataAccessor)
    {
        super(rootUri);
        this.name = name;
        this.rootUri = rootUri;
        this.dataAccessor = dataAccessor;
    }
    
    getBaseUri ()
    {
        return super.getBaseUri() + 'npm/';
    }
    
    getJson ()
    {
        if (this.json)
            return new Promise(resolve => resolve(this.json));
        
        return this.dataAccessor.getPackage(this.name).then(json =>
        {
            this.json = json;
            return this.getJson();
        });
    }
    
    getUri ()
    {
        return this.getBaseUri() + this.name;
    }
    
    getModule (version)
    {
        return this.getJson().then(json =>
        {
            let parsedVersion = semver.maxSatisfying(Object.keys(json.versions), version);
            if (!parsedVersion)
                throw new Error('Unable to resolve version ' + version + ' for bundle ' + this.name);
            return new NpmModule(this.name, parsedVersion, this.rootUri, this.dataAccessor);
        });
    }
    
    getJsonLd ()
    {
        return NpmContext.addContext(this).then(json =>
        {
            let moduleId = (version) => { return { '@id': new NpmModule(this.name, version, this.rootUri, this.dataAccessor).getUri() } };
            
            json['@type'] = 'doap:Project';
            
            // TODO: could also just keep them in here and use '@container': '@index' context?
            json.versions = _.map(json.versions, (json, version) => moduleId(version));
            json['dist-tags'] = _.fromPairs(_.map(json['dist-tags'], (version, key) => [key, moduleId(version)]));
            json.time = _.fromPairs(_.map(json.time, (time, key) => [key, { '@value': time, '@type': 'xsd:dateTime'}]));
            
            return json;
        });
    }
}

module.exports = NpmBundle;