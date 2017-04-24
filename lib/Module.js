
class Module
{
    constructor (rootUri)
    {
        this.rootUri = rootUri;
    }
    
    getBaseUri ()
    {
        return this.rootUri + 'bundles/';
    }
}

module.exports = Module;