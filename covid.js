const $ = require('cheerio');
const fs = require('fs');
const util = require('util');
const base = require('./base');

const now = new Date();

const log = fs.createWriteStream(`covid-${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}.txt`, { flags: 'a' });
const std = process.stdout;

console.log = function () {
    log.write(util.format.apply(null, arguments) + '\n');
    std.write(util.format.apply(null, arguments) + '\n');
}
console.error = console.log;

const encoding = base.encoding, video = 0, ware = 1;
const root = '/media/pi/Lan/course', indexFile = 'covid.json', stateFile = 'covid-state.txt';
const URLBase = 'https://cache.bdschool.cn', URLMain = URLBase + '/public/bdschool/index/static/migu/prev_w.html?grade=1';

const parseRoot = async root => {
    const gs = [];
    const dom = base.parse(root);
    for (let grade = 1; grade <= 12; grade++) {//1->12
        const ts = dom(`table[grade=${grade}]`);
        //console.log(ts.length);
        for (let i = 0; i < ts.length; i++) {
            gs.push(await parseGrade(ts[i]));
        }
    }
    return gs;
}

const parseGrade = async grade => {
    const dom = $(grade);
    const week = parseInt(dom.attr('week_index'));
    if (isNaN(week) || week < 0) {
        return [];
    }
    //console.log(grade, week);
    const rows = $('tr', dom);
    const days = [];
    $('td', rows[0]).each((_, td) => {
        days.push($('div:nth-child(1)', td).text().trim());
    });
    //console.log(week, days);
    const data = [];
    for (let r = 1; r < rows.length; r++) {
        const tds = $('td', rows[r]);
        for (let c = 1; c < tds.length; c++) {
            const td = tds[c];
            const cs = $(td).children();
            if (cs.length > 0) {
                const e = cs.first();
                const subject = e.text().trim();
                const as = e.nextAll('a');

                for (let n = 0; n < as.length; n++) {
                    const a = as[n];
                    const url = $(a).attr('href');
                    const name = $('.conten_table_td_span_title', a).text();
                    const isPlay = $('img', a).hasClass('img_play');
                    const isWare = $('img', a).hasClass('img_download');
                    if (isPlay || isWare) {
                        data.push([parseInt(dom.attr('grade')), week, days[c], subject, name, url, isPlay ? video : ware]);
                    }
                }
            }
        }
    }
    return data;
}

const fetchCourse = async (grade, week, day, subject, name, url, type) => {
    console.log(grade, week, day, subject, name, url, type);
    if (!url || url.length == 0) {
        console.log('URL is empty...');
        return Promise.resolve();
    }
    let dir = root + '/grade-' + grade + '/week-' + week + '/' + day + '/' + subject;
    fs.mkdirSync(dir, { recursive: true });
    try {
        let fn = base.fixName(name), fu = url;
        if (type == video) {
            const html = (await base.doGet(url)).text;
            const video = /.*videourl=\"(.+)\".*/gm.exec(html)[1];
            fn += '.mp4';
            fu = video;
        } else if (type == ware) {
            fn += '.zip';
        }
        await base.download(dir + '/' + fn, fu);
    } catch (e) {
        console.log(e);
    }
}

const loadSource = async () => {
    let data = {};
    if (fs.existsSync(indexFile)) {
        const d = fs.readFileSync(indexFile, encoding);
        data = JSON.parse(d);
    } else {
        try {
            const r = await base.doGet(URLMain);
            const array = await parseRoot(r.text);
            //console.log(array);
            array.forEach(g => {
                g.forEach(d => {
                    const key = d[0] + '-' + d[1] + '-' + d[2];
                    const vals = data[key] || [];
                    vals.push(d);
                    data[key] = vals;
                })
            });
            const v = JSON.stringify(data);
            fs.writeFileSync(indexFile, v, encoding);
        } catch (e) {
            console.log(e);
        }
    }
    return data;
}

const main = async () => {
    let data = await loadSource();
    const set = new Set();
    if (fs.existsSync(stateFile)) {
        const rd = fs.readFileSync(stateFile, encoding).split(/\n/);
        for (const line of rd) {
            set.add(line);
        }
    }
    for (const [k, v] of Object.entries(data)) {
        if (set.has(k)) {
            //console.log(`${k} already down`);
            continue;
        }
        //console.log(k, v);
        if (Array.isArray(v)) {
            for (const o of v) {
                await fetchCourse(...o);
            }
        }
        fs.appendFileSync(stateFile, k + '\n', encoding);
    }
};

main().then(() => {
    console.log('over');
});
// base.doGet(URLMain).then(r => parseRoot(r.text)).then(ret => {
//     console.log(ret);
// }, e => console.log(e));
//loadSource().then(console.log);

//fetchCourse(0, 0, 0, 'A', '测试', 'https://cache.bdschool.cn/public/bdschool/index/static/migu/weike/98d103999c57b2e26b98ab2404d9e12a.html?grade_id=12&subject_id=7', 0);
//fetchCourse(0, 0, 0, 'A', 'B', 'https://cache.bdschool.cn/public/bdschool/index/static/file/20200413_高中三年级_4月13日高三一课一包.zip1', 1);