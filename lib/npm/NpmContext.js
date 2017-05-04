
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const parseAuthor = require('parse-author');
const spdx = require('spdx-expression-parse');
const correct = require('spdx-correct');

let context = null;

class NpmContext
{
    static updateUnusedValues (jsonld, ignore)
    {
        // TODO: keep in memory
        let context = JSON.parse(fs.readFileSync(path.join(__dirname, '../contexts/npm.jsonld')))['@context'];
        ignore = ignore || [];
        ignore.push('@id', '@context', '@type');
        
        let keys = [];
        for (let key in jsonld)
            if (!context[key] && ignore.indexOf(key) < 0)
                keys.push(NpmContext.recursiveUpdateUnusedValues(key, jsonld[key]));
        if (keys.length === 0)
            return;
        if (keys.length === 1)
            keys = keys[0];
        jsonld['npm:key'] = keys;
    }
    
    static recursiveUpdateUnusedValues (key, value)
    {
        let result = { };
        if (key)
            result['rdfs:label'] = key;
        
        if (_.isObject(value))
        {
            let subKeys = [];
            for (let subKey in value)
                subKeys.push(NpmContext.recursiveUpdateUnusedValues(subKey, value[subKey]));
            if (subKeys.length === 1)
                subKeys = subKeys[0];
            result['npm:value'] = { 'npm:key': subKeys };
        }
        else if (_.isArray(value))
        {
            value = value.map(v => NpmContext.recursiveUpdateUnusedValues(null, v));
            result['npm:value'] = { '@list': value };
        }
        else
            result['npm:value'] = value;
        
        return result;
    }
    
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
    
            json['@id'] = thingy.getUri();
            
            if (json.license)
            {
                if (_.isArray(json.license))
                    json.license = json.license[0];
                if (json.license.type && json.license.url) // deprecated
                    json.license = json.license.url;
                else if (json.license.toUpperCase() === 'UNLICENSED')
                    delete json.license;
                else if (json.license.toUpperCase().startsWith('SEE LICENSE IN '))
                {
                    let id = thingy.getUri() + '/license';
                    let file = json.license.substring('SEE LICENSE IN '.length);
                    json['spdx:licenseInfoFromFiles'] = { '@id': id, 'spdx:name': file };
                    
                    json['dcterms:license'] = { '@id': id, 'rdfs:label': json.license };
                    delete json.license;
                }
                else
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

                    let license = json.license;
                    try { json.license = parseSpdx(spdx(license)); }
                    catch (e)
                    {
                        // only try to correct the license when required
                        try { json.license = parseSpdx(spdx(correct(license))); }
                        catch (e) { json.license = {}} // give up
                    }
                    json.license['spdx:name'] = license;
                    
                    if (json.license && !json.license['@id'])
                        json.license['@id'] = thingy.getUri() + '/license';
                    json['dcterms:license'] = { '@id': json.license['@id'], 'rdfs:label': license };
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
                
                // set up correct person object
                if (_.isString(person))
                    person = parseAuthor(person);
                if (person.email && userMap[person.email])
                    person = userMap[person.email];
                else if (nameIsId)
                {
                    person.id = person.name;
                    delete person.name;
                }
    
                // parse the fields
                if (person.id)
                {
                    person['@id'] = new NpmUser(person.id, thingy.rootUri, thingy.dataAccessor).getUri();
                    delete person.id;
                }
                else if (person.email)
                    person['@id'] = 'mailto:' + person.email;
                if (person.name)
                {
                    person['foaf:name'] = person.name;
                    delete person.name
                }
                if (person.url)
                {
                    person['foaf:homepage'] = person.url;
                    delete person.url;
                }
                
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