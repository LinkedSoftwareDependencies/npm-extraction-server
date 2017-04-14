
class NpmUser
{
    // TODO: move "data accessor" into constructor
    constructor (name, packages, rootUri)
    {
        this.name = name;
        this.packages = packages;
        this.rootUri = rootUri;
    }
    
    getJson ()
    {
        return this.packages;
    }
    
    getUri ()
    {
        return this.rootUri + this.name;
    }
    
    getJsonLd ()
    {
        let result = {
            '@context': {
                'doap': 'http://usefulinc.com/ns/doap#',
                'maintains': { '@reverse': 'doap:maintainer', '@type': '@id' }
            },
            '@id': this.getUri() };
        
        // TODO: don't do this
        let pkgRootUri = this.rootUri.substring(0, this.rootUri.lastIndexOf('/',this.rootUri.length-2)+1) + 'npm/';
        
        result['maintains'] = this.packages.map(p => pkgRootUri + p);
        
        return result;
    }
}

module.exports = NpmUser;