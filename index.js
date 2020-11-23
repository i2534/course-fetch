const $ = require('cheerio');
const fs = require('fs');
const util = require('util');
const base = require('./base');

const now = new Date(), month = now.getMonth() + 1, day = now.getDate();

const log = fs.createWriteStream(`log-${now.getFullYear()}-${month}-${day}.txt`, { flags: 'a' });
// Or 'w' to truncate the file every time the process starts.
const std = process.stdout;

console.log = function () {
    log.write(util.format.apply(null, arguments) + '\n');
    std.write(util.format.apply(null, arguments) + '\n');
}
console.error = console.log;

const encoding = base.encoding;
const root = '/media/pi/Lan/course', indexFile = 'index.json', stateFile = 'state.txt';
const URLBase = 'https://cache.bdschool.cn', URLMain = URLBase + '/public/bdschool/index/static/migu/w.html?grade=1';

/**
 *      '1': '小学一',
        '2': '小学二',
        '3': '小学三',
        '4': '小学四',
        '5': '小学五',
        '6': '小学六',
        '7': '初一',
        '8': '初二',
        '9': '初三',
        '10': '高一',
        '11': '高二',
        '12': '高三'
 */
const parseRoot = async root => {
    const gs = [];
    const dom = base.parse(root);
    for (let grade = 1; grade <= 12; grade++) {//1->12
        let ts = dom('table[grade=' + grade + ']');
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
    // console.log(grade, week);
    const rows = $('tr', dom);
    const days = [];
    $('td', rows[0]).each((_, td) => {
        days.push($('div:nth-child(1)', td).text().trim());
    });
    //console.log(days);
    const data = [];
    for (let r = 1; r < rows.length; r++) {
        const tds = $('td', rows[r]);
        for (let c = 1; c < tds.length; c++) {
            const match = /(\d{2})月(\d{2})日/.exec(days[c]);
            const m = parseInt(match[1]), d = parseInt(match[2]);
            if (m > month) {
                continue;
            }
            if (m == month && d >= day) {
                continue;
            }
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
                    if (isPlay) {
                        data.push([parseInt(dom.attr('grade')), week, days[c], subject, name, url]);
                    }
                }
            }
        }
    }
    return data;
}

const fetchCourse = async (grade, week, day, subject, name, url, downVideo = true) => {
    console.log(grade, week, day, subject, name, url);
    if (!url || url.length == 0) {
        console.log('URL is empty...');
        return Promise.resolve();
    }
    let dir = root + '/grade-' + grade + '/week-' + week + '/' + day + '/' + subject;
    fs.mkdirSync(dir, { recursive: true });
    try {
        const html = (await base.doGet(url)).text;
        //console.log(html);
        const video = /.*videourl=\"(.+)\".*/gm.exec(html)[1];
        //console.log(video);
        name = base.fixName(name);
        if (downVideo) {
            await base.download(dir + '/' + name + '.mp4', video);
        }
        const dom = base.parse(html);
        const annex = dom('div.course-annex-detail');
        if (annex) {
            dir += '/' + name;
            fs.mkdirSync(dir, { recursive: true });
            const list = $('div.approval_file', annex);
            for (let i = 0; i < list.length; i++) {
                const f = list[i];
                const title = $('div.approval_document_text', f).text().trim();
                if (title.length > 0) {
                    let src = $('a.file_view_list', f).attr('href');
                    if (src.startsWith('/')) {
                        src = URLBase + src;
                    }
                    //console.log(title, src);
                    await base.download(dir + '/' + base.fixName(title), src);
                } else {
                    console.log('Not found file title');
                }
            }
        }
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

const fixCourseware = async () => {
    let data = await loadSource();
    for (const [k, v] of Object.entries(data)) {
        //console.log(k, v);
        if (Array.isArray(v)) {
            for (const o of v) {
                const [grade, week, day, subject, name, url] = o;
                let dir = root + '/grade-' + grade + '/week-' + week + '/' + day + '/' + subject + '/' + fixName(name);
                if (fs.existsSync(dir) && fs.readdirSync(dir).length == 0) {
                    console.log(`${dir} is empty`);
                    await fetchCourse(grade, week, day, subject, name, url, false);
                }
            }
        }
    }
}

main().then(() => {
    console.log('over');
});
//fetchCourse(0, 0, 0, 'A', 'B', 'https://cache.bdschool.cn/public/bdschool/index/static/migu/weike/2782a1d5af12f430289b3d1db5218e1c.html?grade_id=4&subject_id=34', true);

// fixCourseware().then(()=>{
// 	console.log('over');
// });

//download('./tmp/out.dat', 'https://cache.bdschool.cn/index.php?app=interface&mod=Resource&act=download&id=832513');

// loadSource();
