
const _ = require('lodash');
const semver = require('semver');
const parseAuthor = require('parse-author');
const Bundle = require('../Bundle');
const NpmModule = require('./NpmModule');
const NpmContext = require('./NpmContext');

class NpmBundle extends Bundle
{
    constructor (name, rootUri, dataAccessor)
    {
        super(rootUri);
        this.name = name;
        this.rootUri = rootUri;
        this.dataAccessor = dataAccessor;
    }
    
    getBaseUri ()
    {
        return super.getBaseUri() + 'npm/';
    }
    
    getJson ()
    {
        return this.dataAccessor.getPackage(this.name);
    }
    
    getUri ()
    {
        return this.getBaseUri() + encodeURIComponent(this.name);
    }
    
    getModule (version)
    {
        return Promise.all([this.getJson(), this.getUserMap()]).then(([json, userMap]) =>
        {
            // exact match
            if (json.versions[version])
                return new NpmModule(this.name, version, this.rootUri, userMap, this.dataAccessor);
            
            let parsedVersion = semver.maxSatisfying(Object.keys(json.versions), version);
            if (!parsedVersion)
            {
                // parse version fist so you don't get an infinite loop if tagname === version number (no that totally didn't happen, why do you ask)
                if (json['dist-tags'] && json['dist-tags'][version])
                    return this.getModule(json['dist-tags'][version]);
                throw new Error('Unable to resolve version ' + version + ' for bundle ' + this.name);
            }
            return new NpmModule(this.name, parsedVersion, this.rootUri, userMap, this.dataAccessor);
        });
    }
    
    getUserMap ()
    {
        if (this.userMap)
            return Promise.resolve(this.userMap);
        
        function handleUser (user, map, isNpmName)
        {
            if (!user)
                return;
            if (_.isString(user))
                user = parseAuthor(user);
            
            let mail = user.email;
            if (!mail)
                return;
            if (!map[mail])
                map[mail] = {};
            if (user.url)
                map[mail].url = user.url;
            if (user.web) // maintainers use web instead of url?
                map[mail].url = user.web;
            if (user.name)
            {
                if (isNpmName)
                    map[mail].id = user.name;
                else
                    map[mail].name = user.name;
            }
        }
        
        function handleVersion (version, map)
        {
            if (version.author)
                handleUser(version.author, map, false);
            if (version._npmUser)
                handleUser(version._npmUser, map, true);
            // contributors can also be a single object (legacy?)
            if (version.contributors && !_.isArray(version.contributors))
                version.contributors = [version.contributors];
            (version.contributors || []).forEach(val => handleUser(val, map, false));
            // maintainers is set by npm but can be overridden by user?
            if (version.maintainers && _.isArray(version.maintainers))
                version.maintainers.forEach(val => handleUser(val, map, true));
        }
        
        // iterate through all versions to map as many e-mail addresses to npm usernames as possible (and hopefully also cover non-npm identities)
        return this.getJson().then(json =>
        {
            let map = {};
            for (let version in json.versions)
                handleVersion(json.versions[version], map);
            handleVersion(json, map);
            this.userMap = map;
            return map;
        });
    }
    
    getJsonLd (output)
    {
        return NpmContext.addContext(this, output).then(json =>
        {
            let moduleId = (version) => { return new NpmModule(this.name, version, this.rootUri).getUri() };
            
            if (json.name)
                json['owl:sameAs'] = 'https://www.npmjs.com/package/' + json.name;
    
            if (!_.isArray(json['@context']))
                json['@context'] = [json['@context']];
            json['@type'] = 'doap:Project';
            
            for (let version in json.versions)
                json.versions[version] = moduleId(version);
            json['dist-tags'] = _.fromPairs(_.map(json['dist-tags'], (version, key) => [key, moduleId(version)]));
            
            if (json.time)
            {
                if (json.time.created)
                    json.created = { '@value': json.time.created, '@type': 'xsd:dateTime' };
                if (json.time.modified)
                    json.modified = { '@value': json.time.modified, '@type': 'xsd:dateTime' };
            }
            
            delete json.time;
            delete json.readmeFilename;
            delete json._rev;
            delete json.users;
            
            // do dist-tags last since that introduces a graph object!
            let context = json['@context'];
            let tags = json['dist-tags'];
            delete json['@context'];
            delete json['dist-tags'];
            json = {'@context': context, '@graph': [json]};
            for (let tag in tags)
                json['@graph'].push({ '@id': tags[tag], 'npm:dist-tag': tag});
    
            NpmContext.updateUnusedValues(json);
            return json;
        });
    }
}

module.exports = NpmBundle;