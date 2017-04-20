
const request = require('request');

class NpmCouchDb
{
    constructor (couchURI)
    {
        this.request = request.defaults({baseUrl: couchURI});
    }
    
    _promise(url)
    {
        return new Promise((resolve, reject) =>
        {
            this.request.get(url, (error, response, body) =>
            {
                if (error)
                    return reject(error);
            
                resolve(JSON.parse(body));
            });
        });
    }
    
    all ()
    {
        return this._promise('_all_docs', data => data.rows.map(row => row.id));
    }
    
    getPackage (name)
    {
        return this._promise(encodeURIComponent(name));
    }
    
    getVersion (name, version)
    {
        return this.getPackage(name).then(json => json.versions[version]);
    }
    
    getUserPackageList (name)
    {
        return this._promise(`_design/app/_view/byUser?key="${encodeURIComponent(name)}"`).then(data => data.rows.map(row => row.id));
    }
}

module.exports = NpmCouchDb;