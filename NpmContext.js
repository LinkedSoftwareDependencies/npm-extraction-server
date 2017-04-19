
const _ = require('lodash');

class NpmContext
{
    // adds generic JSON-LD context that is applicable to both npm bundles and modules
    static addContext (thingy)
    {
        return Promise.all([thingy.getJson(), thingy.getUserMap()]).then(([json, userMap]) =>
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
    
            const NpmUser = require('./NpmUser');
            function handlePerson (person, nameIsId)
            {
                if (person.email && userMap[person.email])
                {
                    let mail = person.email;
                    person = { email: mail };
                    if (userMap[mail].id)
                        person['@id'] = new NpmUser(userMap[mail].id, thingy.rootUri, thingy.dataAccessor).getUri();
                    else
                        person['@id'] = 'mailto:' + person.email;
                    if (userMap[mail].name)
                        person['foaf:name'] = userMap[mail].name;
                    if (userMap[mail].url)
                        person['foaf:homepage'] = userMap[mail].url;
                }
                else if (nameIsId)
                {
                    person['@id'] = new NpmUser(person.name, thingy.rootUri, thingy.dataAccessor).getUri();
                    delete person.name;
                }
                else
                    person['@context'] = { 'name': 'foaf:name' };
                return person;
            }
            
            if (json.author)
                json.author = handlePerson(json.author, false);
            if (json.contributors)
                json.contributors = json.contributors.map(c => handlePerson(c, false));
            if (json._npmUser)
                json._npmUser = handlePerson(json._npmUser, true);
            if (json.maintainers)
                json.maintainers = json.maintainers.map(m => handlePerson(m, true));
    
            return json;
        });
    }
}

module.exports = NpmContext;