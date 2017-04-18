
const _ = require('lodash');
const NpmUser = require('./NpmUser');

class NpmContext
{
    // adds generic JSON-LD context that is applicable to both npm bundles and modules
    static addContext (thingy)
    {
        return thingy.getJson().then(json =>
        {
            json = _.clone(json); // don't destroy original json
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
    
            json['@context'] = {
                '@vocab'      : 'http://npm.example.org/',
                '@base'       : thingy.getBaseUri(),
                'xsd'         : 'http://www.w3.org/2001/XMLSchema#',
                'doap'        : 'http://usefulinc.com/ns/doap#',
                'name'        : 'doap:name',
                'description' : 'doap:description',
                'url'         : '@id',
                '_id'         : '@id',
                'versions'    : 'doap:release',
                'version'     : 'doap:revision',
                'dist'        : 'doap:file-release',
                'bugs'        : 'doap:bug-database',
                'maintainers' : 'doap:maintainer',
                'contributors': 'doap:developer',
                'license'     : { '@id': 'doap:license', '@type': '@id' },
                'homepage'    : { '@id': 'doap:homepage', '@type': '@id' },
                'repository'  : { '@id': 'doap:repository', '@type': '@id' },
        
                'foaf'  : 'http://xmlns.com/foaf/0.1/',
                'author': 'foaf:maker',
                'email' : 'foaf:mbox',
        
                'dc'      : 'http://purl.org/dc/terms/',
                'keywords': 'dc:subject'
            };
    
            if (json.author) json.author['@context'] = { 'name': 'foaf:name' };
            if (json.contributors) json.contributors.map(c => c['@context'] = { 'name': 'foaf:name' });
            if (json._npmUser)
            {
                json._npmUser['@id'] = new NpmUser(json._npmUser.name, thingy.rootUri, thingy.dataAccessor).getUri();
                delete json._npmUser.name;
            }
            for (let maintainer of (json.maintainers || []))
            {
                maintainer['@id'] = new NpmUser(maintainer.name, thingy.rootUri, thingy.dataAccessor).getUri();
                delete maintainer.name;
            }
    
            return json;
        });
    }
}

module.exports = NpmContext;