
const _ = require('lodash');
const gh = require('parse-github-url');
const semver = require('semver');
const Module = require('../Module');
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
        return super.getBaseUri() + 'npm/' + encodeURIComponent(this.name) + '/';
    }
    
    getJson ()
    {
        return this.dataAccessor.getVersion(this.name, this.version);
    }
    
    getUri ()
    {
        return this.getBaseUri() + encodeURIComponent(this.version);
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
    
            // TODO: dependencies can also be URLs or even github project names
            let dependencies = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
            for (let key of dependencies)
            {
                if (json[key])
                    json[key] = _.map(json[key], (version, pkg) =>
                    {
                        if (semver.valid(version))
                            return new NpmModule(pkg, version, this.rootUri).getUri();
                        if (version.startsWith('http://'))
                            return { name: pkg, dist: { tarball: version}}; // blank node, only thing we know is this tarball
                        // TODO: should do same repository parsing here as in NpmContext
                        return { name: pkg, repository: version }; // and here we only know the repository
                    });
            }
            if (json['bundledDependencies'])
            {
                const NpmBundle = require('./NpmBundle'); // here to prevent cyclic dependency problem
                json['bundledDependencies'] = json['bundledDependencies'].map(d => new NpmBundle(d, this.rootUri).getUri());
            }
    
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
            
            delete json._id;
            delete json.users;
            delete json._from;
            delete json._npmOperationalInternal;
            delete json.engineStrict;
            
            return json;
        });
    }
}

module.exports = NpmModule;