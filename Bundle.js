
class Bundle
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

module.exports = Bundle;