const agent = require('superagent');
const sc = require('superagent-charset');
const $ = require('cheerio');
const fs = require('fs');
const http = require('https');
const exec = require('child_process').execSync;

sc(agent);

const timeout = 300000, retry = 3, encoding = 'utf8';

const header = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36'
};

const doGet = (url, type = 'text') => {
    let o = agent
        .get(url)
        .set(header)
        .buffer(true)
        .maxResponseSize(1000000000)
        .timeout(timeout)
        .retry(retry)
        .responseType(type);
    if (type == 'text') {
        o = o.charset(encoding);
    }
    return o;
}

const parse = html => $.load(html, { decodeEntities: false });

const fixName = name => {
    return name.replace('\n', '').replace('\r', '').replace(/[\/\?\*\\"<>\|]/, '_');
}

const download = (file, url) => {
    console.log(`Download ${url} -> ${file}`);

    //const out = fs.createWriteStream(file);

    //服务器必须支持: Accept-Ranges: bytes
    /* const pipeline = require('util').promisify(require('stream').pipeline);
    return pipeline(doGet(encodeURI(url), 'arraybuffer'), out).then(() => {
        console.log('Done');
    }); */

    /* return new Promise((resolve, reject) => {
        http.get(encodeURI(url), {
            headers: header
        }, res => {
            if (res.statusCode != 200) {
                reject(res.statusCode);
            } else {
                const stream = res.pipe(out);
                stream.on('finish', () => {
                    console.log('Done');
                    resolve();
                });
            }
        }).on('error', reject);
    }); */
    return new Promise((resolve, reject) => {
        try {
            exec(`wget -q -t 3 -O "${file}" -U "${header["User-Agent"]}" "${encodeURI(url)}"`);
            console.log('Done');
            resolve();
        } catch (e) {
            reject(e);
        }
    });
}

module.exports = {
    encoding,
    doGet,
    parse,
    download,
    fixName
}