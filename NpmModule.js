
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
        // TODO: holy duplication batman
        let clone = _.clone(this.json);
        // TODO: could also just keep them in here and use '@container': '@index' context?
        clone.versions = _.map(clone.versions, json => moduleId(json));
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
        clone['@type'] = 'doap:Version';
        clone['@id'] = this.getUri();
        clone['@context'] = {
            '@vocab': 'http://npm.example.org/',
            '@base': this.rootUri,
            'xsd': 'http://www.w3.org/2001/XMLSchema#',
            'doap': 'http://usefulinc.com/ns/doap#',
            'name': 'doap:name',
            'description': 'doap:description',
            'url': '@id',
            //'_id': '@id', // TODO: can't use this since _id is package@version here...
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

module.exports = NpmModule;