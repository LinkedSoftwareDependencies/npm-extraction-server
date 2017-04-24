
class EngineBundle
{
    constructor (rootUri)
    {
        this.rootUri = rootUri;
    }
    
    getBaseUri ()
    {
        return this.rootUri + 'engines/';
    }
}

module.exports = EngineBundle;