
const request = require('request');

class NpmCouchDb
{
    constructor (couchURI)
    {
        this.request = request.defaults({baseUrl: couchURI});
    }
    
    all ()
    {
        // TODO: generic promise creator?
        // TODO: streaming?
        return new Promise((resolve, reject) =>
        {
            this.request.get('_all_docs', (error, response, body) =>
            {
                if (error)
                    return reject(error);
    
                // TODO: check if JSON parsing is necessary
                resolve(JSON.parse(body).rows.map(row => row.id)); // TODO: id or key?
            });
        });
    }
    
    getPackage (name)
    {
        return new Promise((resolve, reject) =>
        {
            this.request.get(name, (error, response, body) =>
            {
                if (error)
                    return reject(error);
                
                resolve(JSON.parse(body));
            });
        });
    }
}

module.exports = NpmCouchDb;