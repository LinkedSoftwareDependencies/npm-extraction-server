
const request = require('request');

class NpmCouchDb
{
    constructor (couchURI)
    {
        this.request = request.defaults({baseUrl: couchURI});
    }
    
    _promise(url, dataFunc)
    {
        return new Promise((resolve, reject) =>
        {
            this.request.get(url, (error, response, body) =>
            {
                if (error)
                    return reject(error);
            
                resolve(dataFunc(JSON.parse(body)));
            });
        });
    }
    
    all ()
    {
        return this._promise('_all_docs', data => data.rows.map(row => row.id));
    }
    
    getPackage (name)
    {
        return this._promise(name, data => data);
    }
    
    getUserPackageList (name)
    {
        return this._promise(`_design/app/_view/byUser?key="${name}"`, data => data.rows.map(row => row.id));
    }
}

module.exports = NpmCouchDb;