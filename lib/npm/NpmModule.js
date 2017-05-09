
const _ = require('lodash');
const semver = require('semver');
const Module = require('../Module');
const NpmContext = require('./NpmContext');
const NodeEngineModule = require('./NodeEngineModule');
const Tarball = require('../util/Tarball');

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
            // TODO: better code management
            const NpmBundle = require('./NpmBundle');
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
                            if (output)
                            {
                                let result = { '@id': new NpmModule(pkg, version, this.rootUri).getUri() };
                                let promise = new NpmBundle(pkg, this.rootUri, this.dataAccessor).getModule(version).then(module =>
                                {
                                    result['npm:maxSatisfying'] = module.getUri();
                                }).catch(() => {}); // can still output if the version couldn't be matched
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
            // both are valid
            if (json['bundledDependencies'])
                json['bundledDependencies'] = json['bundledDependencies'].map(d => new NpmBundle(d, this.rootUri).getUri());
            if (json['bundleDependencies'])
                json['bundleDependencies'] = json['bundleDependencies'].map(d => new NpmBundle(d, this.rootUri).getUri());
            
            if (json.engines)
            {
                json.engines = _.map(json.engines, (version, engine) =>
                {
                    // deprecated representation
                    if (_.isArray(json.engines))
                    {
                        engine = version.name;
                        version = version.version;
                    }
                    if (engine === 'npm')
                        return new NpmModule(engine, version, this.rootUri).getUri();
                    else
                        return new NodeEngineModule(engine, version, this.rootUri).getUri();
                });
            }
    
            if (json._nodeVersion)
                json._nodeVersion = new NodeEngineModule('node', json._nodeVersion, this.rootUri).getUri();
            if (json._npmVersion)
                json._npmVersion = new NpmModule('npm', json._npmVersion, this.rootUri).getUri();
            
            if (json.scripts)
            {
                if (!_.isArray(json['@context']))
                    json['@context'] = [json['@context']];
                json['@context'].push({'script': this.rootUri + 'scripts/npm/'});
                for (let script in json.scripts)
                {
                    json['script:' + script] = { '@id': this.getUri() + '/scripts/' + script };
                    if (output)
                        json['script:' + script]['rdfs:label'] = json.scripts[script];
                }
                delete json.scripts;
            }
            
            if (json['pre-commit'] || json['precommit'])
            {
                let str = json['pre-commit'] ? 'pre-commit' : 'precommit';
                let scripts = json[str];
                if (scripts.run)
                    scripts = scripts.run;
                if (_.isString(scripts))
                    scripts = scripts.split(',');
                scripts = scripts.map(s => this.getUri() + '/scripts/' + s.trim());
                json[str] = scripts;
            }
            
            if (json.dist && json.dist.shasum)
                json.dist.shasum = { 'spdx:checksumValue' : json.dist.shasum, 'spdx:algorithm': 'spdx:checksumAlgorithm_sha1' };
            
            if (json['lsd:component'])
            {
                let val = json['lsd:component'];
                if (val === true)
                    val = 'components.jsonld';
                if (!val.startsWith('http://'))
                {
                    if (!json.dist || ! json.dist.tarball)
                        json['lsd:component'] = { 'rdfs:label': val };
                    else
                    {
                        // download tarball
                        // npm tarball files are all in a 'package' folder
                        let promise = Tarball.fileFromUrl('package/' + val)
                            .then(data => json['lsd:component'] = JSON.parse(data))
                            .catch(() => json['lsd:component'] = { 'rdfs:label': val });
                        promises.push(promise);
                    }
                }
            }
            
            delete json._from;
            delete json._npmOperationalInternal;
            delete json.engineStrict;
            delete json._shasum;
    
            NpmContext.updateUnusedValues(json);
            return Promise.all(promises).then(() => json);
        });
    }
}

module.exports = NpmModule;