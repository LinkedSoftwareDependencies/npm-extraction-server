
const _ = require('lodash');
const Module = require('./Module');
const NpmContext = require('./NpmContext');
const NodeEngineModule = require('./NodeEngineModule');

class NpmModule extends Module
{
    // TODO: find better way to provide userMap as module
    constructor (name, version, rootUri, userMap, dataAccessor)
    {
        super(rootUri);
        this.name = name;
        this.version = version;
        this.rootUri = rootUri;
        this.userMap = userMap;
        this.dataAccessor = dataAccessor;
    }
    
    getBaseUri ()
    {
        return super.getBaseUri() + 'npm/' + this.name + '/';
    }
    
    getJson ()
    {
        if (this.json)
            return Promise.resolve(this.json);
        
        // TODO: will do duplicate calls to the DB, so caching might be in order
        return this.dataAccessor.getVersion(this.name, this.version).then(json =>
        {
            this.json = json;
            return this.getJson();
        });
    }
    
    getUri ()
    {
        return encodeURI(this.getBaseUri() + this.version);
    }
    
    
    getUserMap ()
    {
        return Promise.resolve(this.userMap);
    }
    
    getJsonLd ()
    {
        return NpmContext.addContext(this).then(json =>
        {
            json['@type'] = 'doap:Version';
    
            let dependencies = ['dependencies', 'devDependencies', 'peerDependencies', 'bundledDependencies', 'optionalDependencies'];
            for (let key of dependencies)
            {
                if (json[key])
                {
                    json['@context'][key] = { '@type': '@id'};
                    json[key] = _.map(json[key], (version, pkg) => new NpmModule(pkg, version, this.rootUri).getUri());
                }
            }
    
            // TODO: can't use this since _id is package@version here...
            delete json['@context']._id;
            json['@id'] = this.getUri();
            
            if (json.engines)
            {
                json.engines = _.map(json.engines, (version, engine) =>
                {
                    if (engine === 'npm')
                        return new NpmModule(engine, json.engines[engine], this.rootUri).getUri();
                    else
                        return new NodeEngineModule(engine, json.engines[engine], this.rootUri).getUri();
                });
            }
            
            return json;
        });
    }
}

module.exports = NpmModule;