
const _ = require('lodash');

class NpmContext
{
    // adds generic JSON-LD context that is applicable to both npm bundles and modules
    static addContext (json, base)
    {
        if (json.license) // TODO: assert this URL is valid
            json.license = 'https://opensource.org/licenses/' + json.license;
        if (json.repository && json.repository.url)
        {
            let repository = { '@id': json.repository.url };
            if (json.repository.type === 'git')
                repository['@type'] = 'doap:GitRepository';
            else if (json.repository.type === 'svn')
                repository['@type'] = 'doap:SVNRepository';
            else if (json.repository.type === 'cvs')
                repository['@type'] = 'doap:CVSRepository';
            // ...
            json.repository = repository;
        }
        json['@type'] = 'doap:Project';
        json['@context'] = {
            '@vocab': 'http://npm.example.org/',
            '@base': base,
            'xsd': 'http://www.w3.org/2001/XMLSchema#',
            'doap': 'http://usefulinc.com/ns/doap#',
            'foaf': 'http://xmlns.com/foaf/0.1/',
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
            'repository': { '@id': 'doap:repository', '@type': '@id' },
            'email': 'foaf:mbox'
        };
        
        let foafContext = { 'name': 'foaf:name' };
        if (json.author) json.author['@context'] = foafContext;
        if (json._npmUser) json._npmUser['@context'] = foafContext;
        if (json.maintainers) json.maintainers.map(m => m['@context'] = foafContext);
    
        return json;
    }
}

module.exports = NpmContext;