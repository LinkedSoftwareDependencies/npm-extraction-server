
class User
{
    constructor (rootUri)
    {
        this.rootUri = rootUri;
    }
    
    getBaseUri ()
    {
        return this.rootUri + 'users/';
    }
}

module.exports = User;