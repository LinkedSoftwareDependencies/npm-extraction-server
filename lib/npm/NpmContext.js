
const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const parseAuthor = require('parse-author');
const spdx = require('spdx-expression-parse');
const correct = require('spdx-correct');

let context = null;

class NpmContext
{
    static mergeContexts (contexts)
    {
        if (!_.isArray(contexts))
            return contexts;
        
        let result = {};
        for (let context of contexts)
        {
            // TODO: keep in memory
            if (_.isString(context) && context.endsWith('contexts/npm'))
                context = JSON.parse(fs.readFileSync(path.join(__dirname, '../contexts/npm.jsonld')))['@context'];
            _.assign(result, context);
        }
        return result;
    }
    
    static isMapped (tag, context)
    {
        if (tag[0] === '@')
            return true;
        
        if (context[tag])
            return true;
        
        let idx = tag.indexOf(':');
        if (idx < 0)
            return false;
        
        return context[tag.substring(0, idx)];
    }
    
    static updateUnusedValues (jsonld)
    {
        // TODO: keep in memory
        let context = NpmContext.mergeContexts(jsonld['@context']);
        
        if (jsonld['@graph'])
            jsonld = jsonld['@graph'];
        if (!_.isArray(jsonld))
            jsonld = [jsonld];
        
        for (let entry of jsonld)
        {
            let keys = [];
            for (let key in entry)
                if (!NpmContext.isMapped(key, context))
                    keys.push(NpmContext.recursiveUpdateUnusedValues(key, entry[key]));
            if (keys.length === 0)
                return;
            if (keys.length === 1)
                keys = keys[0];
            entry['npm:key'] = keys;
        }
    }
    
    static recursiveUpdateUnusedValues (key, value)
    {
        let result = { };
        if (key)
            result['rdfs:label'] = key;
    
        if (_.isArray(value))
        {
            value = value.map(v => NpmContext.recursiveUpdateUnusedValues(null, v));
            result['npm:value'] = { '@list': value };
        }
        else if (_.isObject(value))
        {
            let subKeys = [];
            for (let subKey in value)
                subKeys.push(NpmContext.recursiveUpdateUnusedValues(subKey, value[subKey]));
            if (subKeys.length === 1)
                subKeys = subKeys[0];
            result['npm:value'] = { 'npm:key': subKeys };
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
    static addContext (thingy, output)
    {
        return Promise.all([thingy.getJson(), thingy.getUserMap()]).then(([json, userMap]) =>
        {
            json = _.cloneDeep(json); // don't destroy original json
    
            json['@id'] = thingy.getUri();
            
            if (json.readme)
            {
                if (output)
                    json.readme = { '@id': thingy.getUri() + '/README', 'rdfs:label': json.readme };
                else
                    json.readme = thingy.getUri() + '/README';
            }
    
            // safety measures to prevent duplicate @id values
            delete json.url;
            delete json.tarball;
    
            // --------------- CONTEXT -----------------
    
            // TODO: fixed URI when it is up
            json['@context'] = [thingy.rootUri + 'contexts/npm'];
            
            // --------------- LICENSE ------------------
            
            if (json.license)
            {
                if (_.isArray(json.license))
                    json.license = json.license[0];
    
                if (json.license.type && !json.license.url) // deprecated
                    json.license = json.license.type;
                
                if (json.license.url) // deprecated
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
    
            // --------------- USERS --------------------
            
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