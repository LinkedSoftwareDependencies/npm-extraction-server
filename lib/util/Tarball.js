
const request = require('request');
const tar = require('tar-stream');
const zlib = require('zlib');

class Tarball
{
    
    static fileFromUrl (file, url)
    {
        let extract = tar.extract();
        request.get(url).pipe(zlib.createGunzip()).pipe(extract);
    
        return new Promise((resolve) =>
        {
            extract.on('entry', (header, stream, next) =>
            {
                // header is the tar header
                // stream is the content body (might be an empty stream)
                // call next when you are done with this entry
        
                let valid = header.name === file;
                let result = '';
        
                stream.on('end', () =>
                {
                    if (valid)
                    {
                        extract.destroy();
                        resolve(result);
                    }
                    else
                        next();
                });
        
                if (valid)
                    stream.on('data', (data) => result += data);
                else
                    stream.resume() // just auto drain the stream
            });
        });
    }
}

module.exports = Tarball;