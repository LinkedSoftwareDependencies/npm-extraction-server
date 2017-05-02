
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const parseAuthor = require('parse-author');
const spdx = require('spdx-expression-parse');

let context = null;

class NpmContext
{
    static handleRepository (url)
    {
        // only git-like repositories are supported like this
        if (url.indexOf('://') >= 0)
            return { type: 'git', url };
    
        let type = 'git';
        if (url.startsWith('gist:'))
            type = 'gist';
        else if (url.startsWith('bitbucket:'))
            type = 'bitbucket';
        else if (url.startsWith('gitlab:'))
            type = 'gitlab';
        
        if (type === 'git')
            url = 'https://github.com/' + url;
        else if (type === 'gist')
            url = 'https://gist.github.com/' + url;
        else if (type === 'bitbucket')
            url = 'https://bitbucket.org/' + url;
        else if (type === 'gitlab')
            url = 'https://gitlab.org/' + url;
        
        return { type: 'git', url };
    }
    
    // adds generic JSON-LD context that is applicable to both npm bundles and modules
    static addContext (thingy)
    {
        return Promise.all([thingy.getJson(), thingy.getUserMap()]).then(([json, userMap]) =>
        {
            json = _.cloneDeep(json); // don't destroy original json
            if (json.license)
            {
                if (json.license.type && json.license.url) // deprecated
                    json.license = json.license.url;
                else if (json.license.toUpperCase() === 'UNLICENSED')
                    delete json.license;
                else if (json.license.toUpperCase().startsWith('SEE LICENSE IN '))
                {
                    json['spdx:licenseInfoFromFiles'] = 'file://' + json.license.substring('SEE LICENSE IN'.length);
                    delete json.license;
                }
                else
                {
                    try
                    {
                        function parseSpdx (license)
                        {
                            let result = {};
                            if (license.license)
                                result['@id'] = 'https://spdx.org/licenses/' + license.license + '.html';
                            if (license.exception)
                                result['spdx:licenseException'] = 'https://spdx.org/licenses/' + license.exception + '.html';
                            // you can not have a conjunction/disjunction combined with the above
                            if (license.conjunction || license.disjunction)
                            {
                                let left = parseSpdx(license.left);
                                let right = parseSpdx(license.right);
                                result['@type'] = license.conjunction ? 'spdx:ConjunctiveLicenseSet' : 'spdx:ConjunctiveLicenseSet';
                                result.member = [left, right];
                            }
                            return result
                        }
    
                        json.license = parseSpdx(spdx(json.license));
                    }
                    catch (e)
                    {
                        json['spdx:licenseInfoFromFiles'] = json.license;
                        delete json.license;
                    }
                }
            }
            if (_.isString(json.repository))
                json.repository = NpmContext.handleRepository(json.repository);
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
    
            // TODO: fixed URI when it is up
            json['@context'] = [thingy.rootUri + 'contexts/npm'];
    
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