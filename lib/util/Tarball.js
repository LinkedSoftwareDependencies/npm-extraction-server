
const request = require('request');
const tar = require('tar-stream');
const zlib = require('zlib');

class Tarball
{
    static fromUrl (url)
    {
        let extract = tar.extract();
        let gzip = zlib.createGunzip();
        request.get(url).pipe(gzip).pipe(extract);
    
        return new Promise((resolve, reject) =>
        {
            gzip.on('error', (e) => reject(e));

            let result = {};
            extract.on('entry', (header, stream, next) =>
            {
                // header is the tar header
                // stream is the content body (might be an empty stream)
                // call next when you are done with this entry
                
                let buffers = [];
            
                let steps = header.name.split('/');
                
                stream.on('end', () =>
                {
                    if (!header.name.endsWith('/'))
                    {
                        let obj = result;
                        for (let i = 0; i < steps.length; ++i)
                        {
                            let step = steps[i];
                            
                            if (!obj[step])
                                obj[step] = {};
                            
                            if (i === steps.length-1)
                                obj[step] = Buffer.concat(buffers);
                            else
                                obj = obj[step];
                        }
                    }
                    next();
                });
                
                // folder
                if (header.name.endsWith('/'))
                    stream.resume();
                else
                    stream.on('data', data => buffers.push(data));
            });
            extract.on('finish', () => resolve(result));
        });
    }



    static resolvePath (path, data)
    {
        let result = data.package; // root folder is always package
        let steps = path.split('/');
        for (let step of steps)
            result = result[step];
        return result;
    }
}

module.exports = Tarball;