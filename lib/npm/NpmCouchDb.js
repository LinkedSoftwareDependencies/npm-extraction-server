
// TODO: so apparently request is bad mmkay
const request = require('request');
const Cache = require('lru-cache');

class NpmCouchDb
{
    constructor (couchURI)
    {
        this.request = request.defaults({baseUrl: couchURI, forever: true});
        this.cache = new Cache({max: 100});
    }
    
    _promise(url)
    {
        return new Promise((resolve, reject) =>
        {
            if (this.cache.has(url))
                return resolve(this.cache.get(url));
            
            this.request.get(url, (error, response, body) =>
            {
                if (error)
                    return reject(error);
                
                if (response.statusCode >= 400)
                {
                    // TODO: cleaner way to do error handling?
                    let error = new Error(response.statusCode);
                    error.name = 'HTTP';
                    return reject(error);
                }
            
                let json = JSON.parse(body);
                this.cache.set(url, json);
                resolve(json);
            });
        });
    }
    
    all ()
    {
        return this._promise('_all_docs').then(json => json.rows.map(row => row.id).filter(id => !id.startsWith('_design/')));
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