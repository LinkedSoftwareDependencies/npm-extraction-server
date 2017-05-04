
const _ = require('lodash');
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
    
    getJsonLd (output)
    {
        return NpmContext.addContext(this).then(json =>
        {
            json['@type'] = 'doap:Version';
    
            let dependencies = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
            let promises = [];
            for (let key of dependencies)
            {
                if (json[key])
                    json[key] = _.map(json[key], (version, pkg) =>
                    {
                        if (semver.validRange(version))
                        {
                            // TODO: better code management
                            const NpmBundle = require('./NpmBundle');
                            if (output)
                            {
                                let result = { '@id': new NpmModule(pkg, version, this.rootUri).getUri() };
                                let promise = new NpmBundle(pkg, this.rootUri, this.dataAccessor).getModule(version).then(module =>
                                {
                                    result['npm:maxSatisfying'] = module.getUri();
                                });
                                promises.push(promise);
                                return result;
                            }
                            else
                                return new NpmModule(pkg, version, this.rootUri).getUri();
                        }
                        if (version.startsWith('http://'))
                            return { name: pkg, dist: { tarball: version}}; // blank node, only thing we know is this tarball
                        let repo = NpmContext.handleRepository(version);
                        return { name: pkg, repository: { '@id': repo.url, '@type': 'doap:GitRepository' } }; // and here we only know the repository
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
            
            if (json.scripts)
            {
                if (!_.isArray(json['@context']))
                    json['@context'] = [json['@context']];
                json['@context'].push({'script': this.rootUri + 'scripts/npm/'});
                for (let script in json.scripts)
                    json['script:' + script] = this.getUri() + '/scripts/' + script;
                delete json.scripts;
            }
    
            if (json.dist && json.dist.shasum)
                json.dist.shasum = { 'spdx:checksumValue' : json.dist.shasum, 'spdx:algorithm': 'spdx:checksumAlgorithm_sha1' };
            
            delete json._id;
            delete json._from;
            delete json._npmOperationalInternal;
            delete json.engineStrict;
            delete json._shasum;
            
            // safety measures to prevent duplicate @id values
            delete json.url;
            delete json.tarball;
            
            return Promise.all(promises).then(() => json);
        });
    }
}

module.exports = NpmModule;