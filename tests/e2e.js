const { chromium } = require('playwright');
const fs = require('fs');
const S = process.argv[2];
const app = fs.readFileSync('' + S + '/../app/byggboken.html', 'utf8');
const unit = fs.readFileSync(S + '/unit.js','utf8');
const mock = `<script>
window.__calls = [];
const BUILD1 = {title:"Testhus",description:"Ett litet hus.",steps:[
 {text:"Lägg grundplattan.",parts:[{id:"3031",x:0,y:0,z:0,c:"green"}]},
 {text:"Bygg väggar.",parts:[{id:"3010",x:0,y:1,z:0,r:90,c:"red"},{id:"60592",x:1,y:1,z:3,r:0,c:"white"},{id:"3004",x:0,y:1,z:1,c:"red"},{id:"3004",x:3,y:1,z:1,c:"red"},{id:"3005",x:0,y:1,z:3,c:"red"},{id:"3005",x:3,y:1,z:3,c:"red"},{id:"99999",x:0,y:0,z:0,c:"red"}]},
 {text:"Mer vägg.",parts:[{id:"3004",x:0,y:4,z:0,c:"red"},{id:"3004",x:3,y:4,z:0,c:"red"},{id:"3004",x:0,y:4,z:2,c:"red"},{id:"3004",x:3,y:4,z:2,c:"red"},{id:"3020",x:0,y:9,z:0,r:90,c:"black"}]},
 {text:"Taket.",parts:[{id:"3037",x:0,y:7,z:0,r:180,c:"blue"},{id:"3037",x:0,y:7,z:2,r:0,c:"blue"},{id:"4589",x:1,y:10,z:1,c:"yellow"}]}
]};
const BUILD2 = JSON.parse(JSON.stringify(BUILD1)); BUILD2.steps[1].parts.pop(); BUILD2.steps[2].parts.pop(); BUILD2.steps[3].parts.pop(); BUILD2.steps[3].parts.push({id:"3062b",x:0,y:10,z:1,c:"yellow"});
window.claude = { use: async (n) => {
  if (n === 'sample') { const f = async () => ({text:"x"}); f.limits = async () => ({maxPromptBytes:262144, images:{maxCount:5,maxInputBytes:2e7,mediaTypes:["image/jpeg","image/png"]}});
    f.json = async (p, o) => { window.__calls.push(p.slice(0,80)); if (p.startsWith('You are')) window.__buildImages = (o.images||[]).length; window.__lastPrompt = p; await new Promise(r=>setTimeout(r,200));
      if (p.includes('checker found problems')) return BUILD2;
      if (p.includes('Identify every')) { window.__invImages = (o.images||[]).length; window.__invMulti = p.includes('2 photos of the SAME pile'); } if (p.includes('Identify every')) return {parts:[{id:"3001",c:"red",n:3},{id:"3022",c:"blue",n:2},{id:"3039",c:"white",n:1},{id:"nope",c:"red",n:1}]};
      if (p.includes('pile of LEGO')) { window.__lastImages = (o.images||[]).length; return p.includes('2 photos of the SAME') ? {found:true,spots:[{photo:1,x:0.3,y:0.6,r:0.08,sure:true},{photo:2,x:0.5,y:0.4,r:0.07,sure:true}],hint:"Nere till vänster!"} : {found:false,spots:[],hint:"Fota från ett annat håll."}; }
      o.onText && o.onText({text:'{"id": "a" "id": "b"', delta:''});
      return BUILD1; };
    return f; }
  return null; } };
</script>`;
const html2 = 0;
const html = `<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${mock}${app}<script>${unit}</script></body></html>`;
fs.writeFileSync(S + '/harness.html', html);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const [name, vp, scheme] of [['phone', {width:390,height:844}, 'light'], ['ipad', {width:1024,height:1366}, 'dark']]) {
    const page = await browser.newPage({ viewport: vp, colorScheme: scheme, deviceScaleFactor: 2 });
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
    await page.route('**/three.min.js', r => r.fulfill({ path: S + '/.cache/three.min.js', contentType: 'application/javascript' }));
    await page.route('**/fonts.googleapis.com/**', r => r.abort());
    // Served from a made-up http origin so the app can fetch parts.json next to it.
    // parts.json, the real sets and their shapes are files next to the app.
    await page.route(/\/[\w-]+\.json$/, r => r.fulfill({ path: S + '/../app/' + new URL(r.request().url()).pathname.split('/').pop(), contentType: 'application/json' }));
    await page.route('http://app.test/harness.html', r => r.fulfill({ path: S + '/harness.html', contentType: 'text/html' }));
    await page.goto('http://app.test/harness.html'); await page.waitForFunction(() => LD.parts);
    await page.waitForTimeout(800);
    const unitFails = await page.evaluate(() => window.__unit()); console.log(name, 'unit:', JSON.stringify(unitFails)); if (unitFails.length) process.exitCode = 1;
    console.log(name, 'calls ok');
    await page.screenshot({ path: `${S}/shots/${name}-home.png` });
    await page.click('#t-text'); await page.fill('#prompt', 'ett torn'); await page.screenshot({ path: `${S}/shots/${name}-create.png`, fullPage: true });
    await page.click('#go'); await page.waitForTimeout(150); await page.screenshot({ path: `${S}/shots/${name}-working.png` });
    await page.waitForSelector('#v-view:not([hidden])', { timeout: 5000 }); await page.waitForTimeout(500);
    console.log(name, 'calls:', JSON.stringify(await page.evaluate(() => window.__calls)));
    console.log(name, 'saved build check:', JSON.stringify(await page.evaluate(() => { const b = Store.builds[0]; return { steps: b.steps.length, parts: b.steps.reduce((a,s)=>a+s.parts.length,0), problems: problemList(analyze(b.steps)) }; })));
    await page.screenshot({ path: `${S}/shots/${name}-cover.png` });
    await page.click('#c-start'); await page.waitForTimeout(1500); await page.screenshot({ path: `${S}/shots/${name}-step1.png` });
    await page.click('#v-next'); await page.click('#v-next'); await page.waitForTimeout(2500); await page.screenshot({ path: `${S}/shots/${name}-step3.png` });
    await page.click('#v-parts'); await page.waitForTimeout(300); await page.screenshot({ path: `${S}/shots/${name}-bom.png` });
    await page.click('#sheet', { position: { x: 5, y: 5 } });
    while (await page.isEnabled('#v-next')) await page.click('#v-next'); await page.waitForTimeout(400); await page.screenshot({ path: `${S}/shots/${name}-done.png` });
    await page.click('#d-home'); await page.waitForTimeout(300); await page.screenshot({ path: `${S}/shots/${name}-home2.png` });
    // inventory: photo from above, then a side photo, then count
    await page.click('#t-inv');
    let [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#inv-scan')]);
    await fc.setFiles(S + '/shots/' + name + '-cover.png'); await page.waitForTimeout(200);
    [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#inv-tray .add')]);
    await fc.setFiles(S + '/shots/' + name + '-home.png'); await page.waitForTimeout(200);
    await page.screenshot({ path: `${S}/shots/${name}-inv-tray.png`, fullPage: true });
    await page.click('#inv-scan'); await page.waitForTimeout(900);
    console.log(name, 'inventory images', await page.evaluate(() => [window.__invImages, window.__invMulti, Store.inventory.length, document.querySelector('#inv-tray').hidden]));
    await page.screenshot({ path: `${S}/shots/${name}-inv.png`, fullPage: true });
    await page.click('#v-inv [data-back]');
    // finder: one photo (not found), then another angle (found in both)
    await page.click('#t-find'); await page.waitForTimeout(200);
    [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#f-shoot')]);
    await fc.setFiles(S + '/shots/' + name + '-home.png'); await page.waitForTimeout(800);
    console.log(name, 'finder 1', await page.evaluate(() => [window.__lastImages, document.querySelector('#f-hint').textContent, document.querySelectorAll('.ring').length]));
    [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#f-more')]);
    await fc.setFiles(S + '/shots/' + name + '-cover.png'); await page.waitForTimeout(900);
    console.log(name, 'finder 2', await page.evaluate(() => [window.__lastImages, document.querySelectorAll('.finder-photo').length, [...document.querySelectorAll('.finder-photo')].map((f) => f.querySelectorAll('.ring').length), document.querySelector('#f-more').hidden]));
    await page.screenshot({ path: `${S}/shots/${name}-find.png`, fullPage: true });
    await page.click('#v-find [data-back]');
    // build from two photos
    [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#t-photo')]);
    await fc.setFiles(S + '/shots/' + name + '-cover.png'); await page.waitForTimeout(200);
    [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#c-tray .add')]);
    await fc.setFiles(S + '/shots/' + name + '-home.png'); await page.waitForTimeout(200);
    await page.screenshot({ path: `${S}/shots/${name}-photo-create.png`, fullPage: true });
    await page.click('#go'); await page.waitForSelector('#v-view:not([hidden])', { timeout: 5000 });
    console.log(name, 'photo build images', await page.evaluate(() => [window.__buildImages, window.__lastPrompt.includes('SAME thing from different sides') || window.__calls.length]));
    await page.click('#v-close');
    // real sets: search by number, open, build a few steps; then the sets the inventory can build
    if (!fs.existsSync(S + '/../app/sets-index.json')) console.log(name, 'sets SKIPPED: run node tools/omr-build.js && node tools/omr-thumbs.js first');
    else {
    await page.click('#t-sets'); await page.waitForSelector('#s-list .build-card');
    const total = await page.$$eval('#s-list .build-card', (c) => c.length);
    await page.fill('#s-q', '6611'); await page.waitForTimeout(500);
    const found = await page.$$eval('#s-list .build-card b', (c) => c.map((x) => x.textContent));
    await page.waitForTimeout(800); await page.screenshot({ path: `${S}/shots/${name}-sets.png`, fullPage: true });
    await page.click('#s-list .build-card'); await page.waitForSelector('#v-view:not([hidden])', { timeout: 15000 });
    await page.click('#c-start'); await page.waitForTimeout(800); await page.click('#v-next'); await page.waitForTimeout(1200);
    await page.screenshot({ path: `${S}/shots/${name}-set-step.png` });
    const setInfo = await page.evaluate(() => ({ steps: B.steps.length, callout: document.querySelectorAll('#v-callout button').length, title: B.title, set: B.set }));
    console.log(name, 'sets', total, 'found', JSON.stringify(found), JSON.stringify(setInfo));
    if (!found.length || !setInfo.set || !setInfo.callout) process.exitCode = 1;
    // Hitta bit for a piece only real sets use: described by its LDraw name and size, with a drawing of it.
    const odd = await page.evaluate(() => { const q = B.steps.flatMap((s) => s.parts).find((x) => !CAT[x.id] && !catOf(x.id)); partSheet({ id: q.id, c: q.c }); return q.id; });
    await page.click('#sheet-body .btn.go');
    [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('#f-shoot')]);
    await fc.setFiles(S + '/shots/' + name + '-home.png'); await page.waitForTimeout(900);
    const ask = await page.evaluate(() => [window.__lastImages, /LDraw part/.test(window.__lastPrompt), /drawing of the piece/.test(window.__lastPrompt), document.querySelector('#f-name').textContent]);
    console.log(name, 'find set piece', odd, JSON.stringify(ask));
    if (ask[0] !== 2 || !ask[1] || !ask[2]) process.exitCode = 1;
    await page.click('#v-find [data-back]'); await page.click('#t-sets'); await page.waitForSelector('#s-list .build-card');
    await page.click('#v-sets [data-back]'); await page.click('#t-inv'); await page.click('#inv-sets'); await page.waitForSelector('#s-list .build-card .have');
    console.log(name, 'can build', JSON.stringify(await page.$$eval('#s-list .build-card', (c) => c.slice(0, 3).map((x) => x.querySelector('b').textContent + ': ' + x.querySelector('.have').textContent))));
    await page.click('#v-sets [data-back]');
    }
    const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    const realErrs = errs.filter((e) => !e.includes('net::ERR_FAILED')); console.log(name, 'hscroll', hscroll, 'errors:', JSON.stringify(realErrs)); if (hscroll || realErrs.length) process.exitCode = 1;
    await page.close();
  }
  await browser.close();
})();
