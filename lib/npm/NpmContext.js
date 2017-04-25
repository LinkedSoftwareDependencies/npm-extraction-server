
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const parseAuthor = require('parse-author');

let context = null;

class NpmContext
{
    // adds generic JSON-LD context that is applicable to both npm bundles and modules
    static addContext (thingy)
    {
        return Promise.all([thingy.getJson(), thingy.getUserMap()]).then(([json, userMap]) =>
        {
            json = _.clone(json); // don't destroy original json
            // TODO: also possible: { "license" : "(ISC OR GPL-3.0)" } OR { "license" : "SEE LICENSE IN <filename>" } OR (deprecated: object with type/url tags) OR { "license": "UNLICENSED"}
            if (json.license) // TODO: assert this URL is valid
                json.license = 'https://opensource.org/licenses/' + json.license;
            // TODO: repository can also be a string
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
    
            // TODO: context object for nice URI generation?
            //json['@context'] = [thingy.rootUri + 'contexts/npm'];
            // TODO: copying the full context for now to prevent problems during triple generation. Nicer solution needed (use proxy for the context URI? context URI in config?)
            if (!context)
                context = JSON.parse(fs.readFileSync(path.join(__dirname, '../contexts/npm.jsonld'), { encoding: 'utf8' }))['@context'];
            json['@context'] = [context];
    
            const NpmUser = require('./NpmUser');
            function handlePerson (person, nameIsId)
            {
                if (!person)
                    return null;
                if (_.isString(person))
                    person = parseAuthor(person);
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
            {
                // TODO: clean up JSON to remove these problems immediately?
                // contributors can also be a single object (legacy?)
                if (!_.isArray(json.contributors))
                    json.contributors = [json.contributors];
                json.contributors = json.contributors.map(c => handlePerson(c, false));
            }
            if (json._npmUser)
                json._npmUser = handlePerson(json._npmUser, true);
            if (json.maintainers && _.isArray(json.maintainers)) // no guarantee what this is if it is not an array
                json.maintainers = json.maintainers.map(m => handlePerson(m, true));
    
            return json;
        });
    }
}

module.exports = NpmContext;