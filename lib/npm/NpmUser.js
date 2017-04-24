
const User = require('../User');

class NpmUser extends User
{
    constructor (name, rootUri, dataAccessor)
    {
        super(rootUri);
        this.name = name;
        this.dataAccessor = dataAccessor;
        this.rootUri = rootUri;
    }
    
    getBaseUri ()
    {
        return super.getBaseUri() + 'npm/';
    }
    
    getJson ()
    {
        if (this.packages)
            return Promise.resolve(this.packages);
        
        return this.dataAccessor.getUserPackageList(this.name).then(packages =>
        {
            this.packages = packages;
            return this.getJson();
        });
    }
    
    getUri ()
    {
        return this.getBaseUri() + this.name;
    }
    
    getJsonLd ()
    {
        const NpmBundle = require('./NpmBundle'); // moved here to prevent circular dependency problems
        return this.getJson().then(packages =>
        {
            let result = {
                '@context': {
                    'doap'     : 'http://usefulinc.com/ns/doap#',
                    'maintains': { '@reverse': 'doap:maintainer', '@type': '@id' }
                },
                '@id'     : this.getUri()
            };

            result['maintains'] = packages.map(p => new NpmBundle(p, this.rootUri).getUri());

            return result;
        });
    }
}

module.exports = NpmUser;