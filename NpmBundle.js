
const _ = require('lodash');
const semver = require('semver');
const NpmModule = require('./NpmModule');

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
        // TODO: could also just keep them in here and use '@container': '@index' context?
        clone.versions = _.map(clone.versions, json => moduleId(json));
        clone['dist-tags'] = _.fromPairs(_.map(clone['dist-tags'], (version, key) => [key, moduleId(this.json.versions[version])]));
        if (clone.license) // TODO: assert this URL is valid
            clone.license = 'https://opensource.org/licenses/' + clone.license;
        if (clone.repository && clone.repository.url)
        {
            let repository = { '@id': clone.repository.url };
            if (clone.repository.type === 'git')
                repository['@type'] = 'doap:GitRepository';
            else if (clone.repository.type === 'svn')
                repository['@type'] = 'doap:SVNRepository';
            else if (clone.repository.type === 'cvs')
                repository['@type'] = 'doap:CVSRepository';
            // ...
            clone.repository = repository;
        }
        clone['@type'] = 'doap:Project';
        clone['@context'] = {
            '@vocab': 'http://npm.example.org/',
            '@base': this.rootUri,
            'xsd': 'http://www.w3.org/2001/XMLSchema#',
            'doap': 'http://usefulinc.com/ns/doap#',
            'name': 'doap:name',
            'description': 'doap:description',
            'url': '@id',
            '_id': '@id',
            'versions': 'doap:release',
            'version': 'doap:revision',
            'dist': 'doap:file-release',
            'bugs': 'bug-database',
            'maintainers': 'doap:maintainer',
            'license': { '@id': 'doap:license', '@type': '@id'},
            'homepage': { '@id': 'doap:homepage', '@type': '@id' },
            'repository': { '@id': 'doap:repository', '@type': '@id' }
        };
        clone.time = _.fromPairs(_.map(clone.time, (time, key) => [key, { '@value': time, '@type': 'xsd:dateTime'}]));
        
        return clone;
    }
}

module.exports = NpmBundle;