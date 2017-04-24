
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
            let parsedVersion = semver.maxSatisfying(Object.keys(json.versions), version);
            if (!parsedVersion)
                throw new Error('Unable to resolve version ' + version + ' for bundle ' + this.name);
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
    
    getJsonLd ()
    {
        return NpmContext.addContext(this).then(json =>
        {
            let moduleId = (version) => { return { '@id': new NpmModule(this.name, version, this.rootUri).getUri() } };
    
            if (!_.isArray(json['@context']))
                json['@context'] = [json['@context']];
            json['@context'].push({ '@base' : this.getBaseUri(), '_id': '@id' });
            json['@type'] = 'doap:Project';
            
            // TODO: could also just keep them in here and use '@container': '@index' context?
            json.versions = _.map(json.versions, (json, version) => moduleId(version));
            json['dist-tags'] = _.fromPairs(_.map(json['dist-tags'], (version, key) => [key, moduleId(version)]));
            json.time = _.fromPairs(_.map(json.time, (time, key) => [key, { '@value': time, '@type': 'xsd:dateTime'}]));
            
            return json;
        });
    }
}

module.exports = NpmBundle;