
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
                {
                    for (let pkg in json[key])
                    {
                        let version = json[key][pkg];
                        if (semver.validRange(version))
                        {
                            if (output)
                            {
                                // TODO: optimize this so actual version can be used
                                let result = { '@id': new NpmModule(pkg, version, this.rootUri).getUri() };
                                // let promise = new NpmBundle(pkg, this.rootUri, this.dataAccessor).getModule(version).then(module =>
                                // {
                                //     result['npm:maxSatisfying'] = module.getUri();
                                // }).catch(() => {}); // can still output if the version couldn't be matched
                                // promises.push(promise);
                                result.bundle = new NpmBundle(pkg, this.rootUri).getUri();
                                json[key][pkg] = result;
                            }
                            else
                                json[key][pkg] = new NpmModule(pkg, version, this.rootUri).getUri();
                        }
                        else if (version.startsWith('http://') || version.startsWith('https://'))
                            json[key][pkg] = { name: pkg, dist: { tarball: version } }; // blank node, only thing we know is this tarball
                        else
                        {
                            let repo = NpmContext.handleRepository(version);
                            json[key][pkg] = { name: pkg, repository: { '@id': repo.url, '@type': 'doap:GitRepository' } }; // and here we only know the repository
                        }
                    }
                }
            }
            // both are valid
            if (json['bundledDependencies'])
                json['bundledDependencies'] = json['bundledDependencies'].map(d => new NpmBundle(d, this.rootUri).getUri());
            if (json['bundleDependencies'])
                json['bundleDependencies'] = json['bundleDependencies'].map(d => new NpmBundle(d, this.rootUri).getUri());
            
            if (json.engines)
            {
                for (let engine in json.engines)
                {
                    let version = json.engines[engine];
                    // deprecated representation
                    if (_.isArray(json.engines))
                    {
                        engine = version.name;
                        version = version.version;
                    }
                    if (engine === 'npm')
                        json.engines[engine] = new NpmModule(engine, version, this.rootUri).getUri();
                    else
                        json.engines[engine] = new NodeEngineModule(engine, version, this.rootUri).getUri();
                }
            }
    
            if (json._nodeVersion)
                json._nodeVersion = new NodeEngineModule('node', json._nodeVersion, this.rootUri).getUri();
            if (json._npmVersion)
                json._npmVersion = new NpmModule('npm', json._npmVersion, this.rootUri).getUri();
            
            if (json.scripts)
            {
                // this is safer than using an actual prefix since this is less restrictive on the characters allowed
                let prefix = this.rootUri + 'scripts/npm/';
                for (let script in json.scripts)
                {
                    json[prefix + encodeURIComponent(script)] = { '@id': this.getUri() + '/scripts/' + encodeURIComponent(script) };
                    if (output)
                        json[prefix + encodeURIComponent(script)]['rdfs:label'] = json.scripts[script];
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
                scripts = scripts.map(s => this.getUri() + '/scripts/' + encodeURIComponent(s.trim()));
                json[str] = scripts;
            }
            
            if (json.dist && json.dist.shasum)
                json.dist.shasum = { 'spdx:checksumValue' : json.dist.shasum, 'spdx:algorithm': { '@id': 'spdx:checksumAlgorithm_sha1' } };
            
            if (json['lsd:component'])
            {
                let val = json['lsd:component'];
                if (val === true)
                    val = 'components.jsonld';
                if (!val.startsWith('http://') && !val.startsWith('https://'))
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
            
            // link back to parent, remove last slash
            json.bundle = this.getBaseUri().slice(0, -1);
            
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