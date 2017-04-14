
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
        
        // TODO: making URIs is dangerous (also requires some URI hacking)
        let dependencies = ['dependencies', 'devDependencies', 'peerDependencies', 'bundledDependencies', 'optionalDependencies'];
        for (let key of dependencies)
            if (json[key])
                json[key] = _.map(json[key], (version, pkg) => base.substring(0, base.lastIndexOf('/') + 1) + pkg + '/' + version);
        
        json['@context'] = {
            '@vocab': 'http://npm.example.org/',
            '@base': base,
            'xsd': 'http://www.w3.org/2001/XMLSchema#',
            'doap': 'http://usefulinc.com/ns/doap#',
            'name': 'doap:name',
            'description': 'doap:description',
            'url': '@id',
            '_id': '@id',
            'versions': 'doap:release',
            'version': 'doap:revision',
            'dist': 'doap:file-release',
            'bugs': 'doap:bug-database',
            'maintainers': 'doap:maintainer',
            'license': { '@id': 'doap:license', '@type': '@id'},
            'homepage': { '@id': 'doap:homepage', '@type': '@id' },
            'repository': { '@id': 'doap:repository', '@type': '@id' },
    
            'foaf': 'http://xmlns.com/foaf/0.1/',
            'author': 'foaf:maker',
            'email': 'foaf:mbox',
            
            'dc': 'http://purl.org/dc/terms/',
            'keywords': 'dc:subject'
        };
        
        let foafContext = { 'name': 'foaf:name' };
        if (json.author) json.author['@context'] = foafContext;
        if (json._npmUser) json._npmUser['@context'] = foafContext;
        if (json.maintainers) json.maintainers.map(m => m['@context'] = foafContext);
    
        return json;
    }
}

module.exports = NpmContext;