
const _ = require('lodash');
const request = require('request');

let urls = {
    node : { json: 'https://nodejs.org/dist/index.json', root: 'https://nodejs.org/download/release/' },
    iojs : { json: 'https://iojs.org/dist/index.json', root: 'https://iojs.org/download/release/' }
};

class NodeEngines
{
    static getAll (name)
    {
        if (!urls[name])
            throw Promise.reject(new Error('Unsupported engine ' + name));
        
        if (urls[name].data)
            return urls[name].data;
    
        let promise = new Promise((resolve, reject) =>
        {
            request.get(urls[name].json, (error, response, body) =>
            {
                if (error)
                    return reject(error);
    
                urls[name].data = Promise.resolve(JSON.parse(body));
                resolve(urls[name].data);
            });
        });
        urls[name].data = promise;
        return promise;
    }
    
    // doesn't support semantic versions
    static getModuleJson (name, version)
    {
        return NodeEngines.getAll(name).then(json =>
        {
            // TODO: could implement binary search should this be too slow
            let result = _.find(json, (entry) => (entry.version === 'v' + version) || (entry.version === version));
            if (!result)
                throw new Error(name + ' ' + version + ' not found.');
    
            return result;
        });
    }
}

NodeEngines.urls = urls;

module.exports = NodeEngines;