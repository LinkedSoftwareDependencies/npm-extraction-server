
const _ = require('lodash');
const request = require('request');
const semver = require('semver');

// TODO: store this as a global value somewhere so the .json files get stored
class NodeEngines
{
    constructor ()
    {
        this.urls = {
            node : { json: 'https://nodejs.org/dist/index.json', root: 'https://nodejs.org/download/release/' },
            iojs : { json: 'https://iojs.org/dist/index.json', root: 'https://iojs.org/download/release/' }
        };
        this.engines = {};
    }
    
    getAll (name)
    {
        if (!this.urls[name])
            throw Promise.reject(new Error('Unsupported engine ' + name));
        
        if (this.engines[name])
            return Promise.resolve(this.engines[name]);
    
        return new Promise((resolve, reject) =>
        {
            request.get(this.urls[name].json, (error, response, body) =>
            {
                if (error)
                    return reject(error);
            
                this.engines[name] = JSON.parse(body);
                resolve(this.engines[name]);
            });
        });
    }
    
    // doesn't support semantic versions
    getModuleJson (name, version)
    {
        return this.getAll(name).then(json =>
        {
            // TODO: could implement binary search should this be too slow
            let result = _.find(json, (entry) => (entry.version === 'v' + version) || (entry.version === version));
            if (!result)
                throw new Error(name + ' ' + version + ' not found.');
    
            return result;
        });
    }
}

module.exports = NodeEngines;