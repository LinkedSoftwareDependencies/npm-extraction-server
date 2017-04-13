
const _ = require('lodash');
const semver = require('semver');
const NpmPackageVersion = require('./NpmPackageVersion');

// TODO: Bundle
class NpmPackage
{
    constructor (json, rootUri)
    {
        // TODO: verify structure?
        this.json = json;
        this.rootUri = rootUri;
    }
    
    getJson ()
    {
        return this.json;
    }
    
    getUri ()
    {
        return this.rootUri + this.json.name;
    }
    
    getVersion (version)
    {
        version = semver.maxSatisfying(Object.keys(this.json.versions), version);
        if (version === null)
            return version;
        return new NpmPackageVersion(this.json.versions[version], this.getUri() + '/');
    }
    
    getJsonLd ()
    {
        let self = this;
        function versionId (versionJson)
        {
            return { '@id': (new NpmPackageVersion(versionJson, self.getUri() + '/')).getUri() }
        }
        
        let clone = _.clone(this.json);
        clone.versions = { '@list': _.map(clone.versions, json => versionId(json)) };
        clone['dist-tags'] = _.fromPairs(_.map(clone['dist-tags'], (version, key) => [key, versionId(this.json.versions[version])]));
        clone['@id'] = this.getUri();
        clone['@type'] = 'http://npm.example.org/package';
        clone['@context'] = { '@vocab': 'http://npm.example.org/', 'xsd': 'http://www.w3.org/2001/XMLSchema#' };
        clone.time = _.fromPairs(_.map(clone.time, (time, key) => [key, { '@value': time, '@type': 'xsd:dateTime'}]));
        
        return clone;
    }
}

module.exports = NpmPackage;