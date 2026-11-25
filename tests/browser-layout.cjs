// Real installed Chrome, isolated offline LeetCode-shaped fixture, no packages.
// Run: node tests/browser-layout.cjs [--measure-only]
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const measureOnly = process.argv.includes('--measure-only');
const browserPath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const artifactDir = path.join(root, '.local-backups', 'layout-' + Date.now());
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

class CDP {
  constructor(socket) {
    this.socket = socket; this.next = 0; this.pending = new Map(); this.listeners = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const item = this.pending.get(message.id);
        if (item) { this.pending.delete(message.id); clearTimeout(item.timer); message.error ? item.reject(new Error(message.error.message)) : item.resolve(message.result); }
      } else for (const listener of this.listeners) listener(message);
    });
  }
  send(method, params = {}) {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('CDP timeout: ' + method)); }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }
  async click(selector) {
    const point = await this.evaluate(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
  }
}

async function main() {
  assert.ok(fs.existsSync(browserPath), 'Set CHROME_PATH to an installed Chromium browser.');
  fs.mkdirSync(artifactDir, { recursive: true });
  const profile = path.join(artifactDir, 'profile');
  const browser = spawn(browserPath, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--disable-extensions', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
  { stdio: 'ignore', windowsHide: true });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; !fs.existsSync(portFile) && i < 100; i++) await wait(100);
    assert.ok(fs.existsSync(portFile), 'Chrome did not start its isolated debugging endpoint.');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    const cdp = new CDP(socket);
    const fixture = '<!doctype html><html><head><meta charset="utf-8"><style>*,::before,::after{box-sizing:border-box}body{margin:0;font:14px/1.5 Arial;background:#111827;color:white}button,select,textarea{font:inherit;margin:0}h1,p{margin:0}main{padding:24px;max-width:650px}</style></head><body><main><a class="text-title-large" href="/problems/two-sum/">1. Two Sum</a><div class="elfjS">Given an array of integers, return two indices whose values sum to a target.</div><p>Offline host fixture. No account or network access.</p></main></body></html>';
    cdp.listeners.push(message => {
      if (message.method !== 'Fetch.requestPaused') return;
      const request = message.params;
      const command = request.resourceType === 'Document' ? cdp.send('Fetch.fulfillRequest', { requestId: request.requestId,
        responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(fixture).toString('base64') }) :
        cdp.send('Fetch.failRequest', { requestId: request.requestId, errorReason: 'BlockedByClient' });
      command.catch(() => {});
    });
    await cdp.send('Page.enable');
    await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    const css = fs.readFileSync(path.join(root, 'chrome-extension/styles.css'), 'utf8');
    const source = fs.readFileSync(path.join(root, 'chrome-extension/content.js'), 'utf8').split('// Initialize when DOM is ready')[0];
    const metrics = [];
    for (const [width, height] of [[1366, 768], [1920, 1080], [1280, 720], [390, 640], [900, 480]]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await cdp.send('Page.navigate', { url: 'https://leetcode.com/problems/two-sum/' });
      await cdp.evaluate('new Promise(resolve => document.readyState === "complete" ? resolve() : window.addEventListener("load",resolve,{once:true}))');
      await cdp.evaluate(`(() => { const style=document.createElement('style');style.textContent=${JSON.stringify(css)};document.head.appendChild(style);window.chrome={runtime:{id:'fixture',onMessage:{addListener(){}},sendMessage:async () => ({success:true,user:{username:'fixture'},messages:[],conversationId:1})}}; })()`);
      await cdp.evaluate(source + '\nextractProblemInfo(); createMentorPanel(); renderPanelAccount({username:"fixture"});');
      await cdp.evaluate(`hintsUsed=3; updateProgress(); addMessageToChat('solution', ${JSON.stringify('## Approach\n\n' + 'Explain the algorithm and its invariants clearly. '.repeat(150) + '\n\n## Solution\n```python\nclass Solution:\n    def twoSum(self, nums, target):\n        # ' + 'long-line-'.repeat(60) + '\n        return [0, 1]\n```\n\n## Complexity\nTime: O(n)\nSpace: O(n)\n\nEND OF RESPONSE')}, true);`);
      await wait(500);
      for (const mode of ['normal', 'expanded', ...(height >= 700 ? ['resized'] : [])]) {
        const expanded = mode === 'expanded';
        if (expanded) await cdp.click('#sb-reading-btn');
        if (mode === 'resized') await cdp.evaluate('toggleReadingMode(); mentorPanel.style.height="480px"; fitPanelToViewport()');
        await wait(500);
        const result = await cdp.evaluate(`(() => {
          const panel=document.getElementById('student-buddy-panel'), chat=document.getElementById('sb-chat'), parent=document.getElementById('sb-content'), input=panel.querySelector('.sb-input-area');
          const rect=el=>({top:el.getBoundingClientRect().top,bottom:el.getBoundingClientRect().bottom,height:el.getBoundingClientRect().height,width:el.getBoundingClientRect().width});
          return {panel:rect(panel),parent:rect(parent),chat:{...rect(chat),clientHeight:chat.clientHeight,scrollHeight:chat.scrollHeight,computedHeight:getComputedStyle(chat).height,flex:getComputedStyle(chat).flex},input:rect(input),actions:rect(panel.querySelector('.sb-actions')),welcome:rect(panel.querySelector('.sb-welcome')),status:rect(document.getElementById('sb-session-status')),loading:rect(document.getElementById('sb-loading')),parentOverflow:getComputedStyle(parent).overflowY};
        })()`);
        metrics.push({ width, height, mode, expanded, ...result });
        if (!measureOnly) {
          assert.ok(result.chat.clientHeight >= (height >= 700 ? mode === 'resized' ? 250 : 300 : 100), `Chat too short: ${JSON.stringify(metrics.at(-1))}`);
          assert.ok(result.chat.bottom <= result.input.top + 1, 'Chat overlaps input');
          assert.ok(result.panel.bottom <= height - 10, 'Panel exceeds viewport');
          assert.equal(result.parentOverflow, 'hidden');
          assert.equal(await cdp.evaluate('getComputedStyle(mentorPanel).display'), 'grid');
          assert.equal(await cdp.evaluate('document.getElementById("sb-reading-btn").getAttribute("aria-pressed")'), String(expanded));
          assert.ok(await cdp.evaluate(`(() => {const p=document.querySelector('.sb-code-block pre');return p.scrollWidth>p.clientWidth && p.scrollHeight===p.clientHeight && getComputedStyle(p).whiteSpace==='pre'})()`), 'Code needs horizontal scrolling, without vertical clipping');
          await cdp.evaluate('scrollToLatest()');
          assert.ok(await cdp.evaluate(`(() => {const c=document.getElementById('sb-chat');return c.scrollHeight-c.clientHeight-c.scrollTop < 2})()`), 'Cannot reach bottom of answer');
          if (mode === 'normal') {
            await cdp.evaluate(`document.getElementById('sb-chat').scrollTop=120`);
            await wait(100);
            assert.equal(await cdp.evaluate('followNewMessages'), false);
            await cdp.evaluate(`addMessageToChat('mentor','New answer while reading earlier context.')`);
            assert.equal(await cdp.evaluate('document.getElementById("sb-chat").scrollTop'), 120, 'New answer moved a reader who scrolled up');
            assert.equal(await cdp.evaluate('document.getElementById("sb-latest-btn").hidden'), false);
            await cdp.click('#sb-latest-btn');
            await wait(100);
            assert.ok(await cdp.evaluate(`(() => {const c=document.getElementById('sb-chat');return c.scrollHeight-c.clientHeight-c.scrollTop < 2})()`), 'Jump did not reach latest answer');
            await cdp.evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedCode=value}}})`);
            await cdp.evaluate(`document.querySelector('.sb-copy-btn').scrollIntoView({block:'center'})`);
            await cdp.click('.sb-copy-btn');
            assert.ok(await cdp.evaluate(`window.copiedCode.includes('    def twoSum')`), 'Code copy lost indentation');
            if (width === 1366) {
              const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
              fs.writeFileSync(path.join(artifactDir, 'code.png'), Buffer.from(shot.data, 'base64'));
              // Exercise Chrome's native resize handle, not just a style assignment.
              const handle = await cdp.evaluate('(() => {const r=mentorPanel.getBoundingClientRect();return {x:r.right-3,y:r.bottom-3}})()');
              await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...handle });
              await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', button: 'left', buttons: 1, x: handle.x, y: handle.y - 40 });
              await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, x: handle.x, y: handle.y - 40 });
              assert.ok(await cdp.evaluate(`mentorPanel.getBoundingClientRect().height < ${result.panel.height} - 20`), 'Native vertical resize did not work');
              await cdp.evaluate(`mentorPanel.style.height=${JSON.stringify(result.panel.height + 'px')}; fitPanelToViewport()`);
            }
            await cdp.click('.sb-secondary-controls summary');
            assert.ok(await cdp.evaluate(`(() => {const c=document.getElementById('sb-chat'), b=document.getElementById('sb-new-btn');return c.clientHeight>=100 && b.getBoundingClientRect().bottom<innerHeight-10})()`), 'Secondary controls clipped');
            await cdp.click('.sb-secondary-controls summary');
            await cdp.click('#sb-toggle-btn');
            assert.equal(await cdp.evaluate('mentorPanel.getBoundingClientRect().height'), 60);
            await cdp.click('#sb-toggle-btn');
            assert.ok(await cdp.evaluate('document.getElementById("sb-chat").clientHeight>=100'));
            await cdp.evaluate('scrollToLatest()');
          }
        }
        if (width === 1366) {
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(path.join(artifactDir, mode + '.png'), Buffer.from(shot.data, 'base64'));
        }
      }
      if (!measureOnly) {
        await cdp.evaluate(`chrome.runtime.sendMessage=async()=>({success:true,conversationId:1,messages:[{role:'user',content:'Saved thought',sequence:1},{role:'assistant',content:'Saved explanation\\n\\nTime: O(n)',sequence:2}]}); restoreConversation()`);
        assert.ok(await cdp.evaluate(`document.getElementById('sb-chat').textContent.includes('Saved explanation')`));
        assert.ok(await cdp.evaluate('document.getElementById("sb-chat").clientHeight>=100'), 'Recovery collapsed chat');
      }
    }
    fs.writeFileSync(path.join(artifactDir, 'measurements.json'), JSON.stringify(metrics, null, 2));
    process.stdout.write(JSON.stringify({ artifacts: path.relative(root, artifactDir), browser: (await cdp.send('Browser.getVersion')).product,
      measurements: metrics.map(row => ({ viewport: `${row.width}x${row.height}`, mode: row.mode, panelHeight: row.panel.height,
        parentHeight: row.parent.height, chatHeight: row.chat.clientHeight, chatScrollHeight: row.chat.scrollHeight,
        computedHeight: row.chat.computedHeight, composerHeight: row.input.height })) }, null, 2) + '\n');
  } finally { socket?.close(); browser.kill(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
