
const semver = require('semver');
const EngineBundle = require('./EngineBundle');
const NodeEngines = require('./NodeEngines');
const NodeEngineModule = require('./NodeEngineModule');

class NodeEngineBundle extends EngineBundle
{
    constructor (name, rootUri)
    {
        super(rootUri);
        this.name = name;
        this.rootUri = rootUri;
        this.engines = new NodeEngines();
    }
    
    getUri ()
    {
        return this.getBaseUri() + this.name + '/';
    }
    
    // TODO: lots of similarity between all these classes, maybe some stuff can be re-used somewhere
    getJson ()
    {
        if (this.json)
            return Promise.resolve(this.json);
        
        return this.engines.getAll(this.name).then(json =>
        {
            this.json = json;
            return json;
        })
    }
    
    getModule (version)
    {
        return this.getJson().then(json =>
        {
            // take into account that node versions start with a 'v'
            let parsedVersion = semver.maxSatisfying(json.map(entry => entry.version.substring(1)), version);
            if (!parsedVersion)
                throw new Error('Unable to resolve version ' + version + ' for engine ' + this.name);
            return new NodeEngineModule(this.name, 'v' + parsedVersion, this.rootUri);
        });
    }
}

module.exports = NodeEngineBundle;