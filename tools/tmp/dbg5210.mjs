import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless:'new', args:['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  const oe = console.error.bind(console);
  console.error = (...a) => {
    const e = a.find(x => x && x.stack);
    oe(...a.map(x => (x && x.stack) ? ('STACK ' + x.stack) : x));
  };
});
p.on('console', m => console.log('['+m.type()+'] '+m.text().slice(0,1600)));
await p.goto('http://localhost:5210/?shot=1', { waitUntil:'domcontentloaded', timeout:30000 });
await new Promise(r=>setTimeout(r,20000));
const st = await p.evaluate(()=>({ready:window.__READY__, hasCtx:!!window.__CTX__, label:(document.getElementById('load-label')||{}).textContent}));
console.log(JSON.stringify(st));
await b.close();
