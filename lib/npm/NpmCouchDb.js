
const _ = require('lodash');
// TODO: so apparently request is bad mmkay
const request = require('request');
const Cache = require('lru-cache');

class NpmCouchDb
{
    constructor (couchURI)
    {
        this.request = request.defaults({baseUrl: couchURI, forever: true, agentOptions: {maxSockets: 10}});
        this.cache = new Cache({max: 100});
    }
    
    _promise(url)
    {
        if (this.cache.has(url))
            return this.cache.get(url);
        
        let promise = new Promise((resolve, reject) =>
        {
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
                this.cache.set(url, Promise.resolve(json));
                resolve(json);
            });
        });
        this.cache.set(url, promise);
        return promise;
    }
    
    all ()
    {
        return this._promise('_all_docs').then(json => json.rows.map(row => row.id).filter(id => !id.startsWith('_design/')));
    }
    
    getPackage (name)
    {
        let encoded = '';
        // handle org packages, couchDB URLs don't work if the @ is encoded
        if (name[0] === '@')
            encoded = '@' + encodeURIComponent(name.substring(1));
        else
            encoded = encodeURIComponent(name);
        return this._promise(encoded);
    }
    
    getVersion (name, version)
    {
        return this.getPackage(name).then(json =>
        {
            let result = json.versions[version];
            if (json.time && json.time[version])
            {
                result = _.clone(result);
                result.created = json.time[version];
            }
            return result;
        });
    }
    
    getUserPackageList (name)
    {
        return this._promise(`_design/app/_view/byUser?key="${encodeURIComponent(name)}"`).then(data => data.rows.map(row => row.id));
    }
    
    // all changes since the given date (based on npm 'modified' timestamp, so the date is GMT+0)
    // returns (a promise returning) a list of package names
    getChanges (year, month, day)
    {
        return this._promise(`_design/app/_view/analytics?startkey=["latest", ${year}, ${month}, ${day}]&endkey=["latest", ${year}, ${month}, ${day+1}]&group_level=5`)
            .then(data => data.rows.map(row => row.key[4]));
    }
}

module.exports = NpmCouchDb;