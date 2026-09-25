const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

function start(build, backend) {
  const child = spawn(process.execPath, [path.join(__dirname, 'serve_prod.js')], {
    env: {...process.env, FRONTEND_HOST:'127.0.0.1', FRONTEND_PORT:'0', FRONTEND_BUILD_DIR:build, API_BACKEND:backend},
    stdio:['ignore','pipe','pipe'],
  });
  return { child, ready:new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Server did not start')),5000);
    child.on('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});
    child.stdout.on('data',data=>{
      const match=String(data).match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
      if(match) {clearTimeout(timer);resolve(match[1]);}
    });
  })};
}

test('serves a configured external release, preserves API proxy and handles missing files safely', async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'shield-server-'));
  const build=path.join(directory,'published release');
  await fs.mkdir(path.join(build,'static/js'),{recursive:true});
  await fs.writeFile(path.join(build,'index.html'),'<html><title>SHIELD fixture</title></html>');
  await fs.writeFile(path.join(build,'static/js/main.12345678.js'),'window.fixture=true;');
  const backend=http.createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"status":"fixture-ready"}');});
  backend.listen(0,'127.0.0.1');await once(backend,'listening');
  const {child,ready}=start(build,`http://127.0.0.1:${backend.address().port}`);
  t.after(async()=>{ if(child.exitCode===null) {const exited=once(child,'exit');child.kill('SIGTERM');await exited;} await new Promise(resolve=>backend.close(resolve));await fs.rm(directory,{recursive:true,force:true}); });
  const url=await ready;
  for(const route of ['/','/login','/sager/example?tab=exports']) {
    const response=await fetch(url+route); assert.equal(response.status,200);
    assert.match(response.headers.get('cache-control'),/no-store/);assert.match(await response.text(),/SHIELD fixture/);
  }
  const asset=await fetch(url+'/static/js/main.12345678.js');assert.equal(asset.status,200);assert.match(asset.headers.get('cache-control'),/immutable/);
  const missing=await fetch(url+'/static/js/missing.12345678.js');assert.equal(missing.status,404);assert.doesNotMatch(missing.headers.get('content-type'),/html/);
  assert.deepEqual(await (await fetch(url+'/readyz')).json(),{status:'fixture-ready'});
  await fs.rename(path.join(build,'index.html'),path.join(build,'index.old'));
  const outage=await fetch(url+'/login');assert.equal(outage.status,503);const body=await outage.text();assert.match(body,/midlertidigt utilgængelig/);assert.doesNotMatch(body,/ENOENT|Users\/|shield-server-/);
});

test('fails clearly before listening when the configured release has no index', async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'shield-missing-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const child=spawn(process.execPath,[path.join(__dirname,'serve_prod.js')],{env:{...process.env,FRONTEND_BUILD_DIR:directory,FRONTEND_PORT:'0'},stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.on('data',chunk=>{stderr+=String(chunk);});
  const [code]=await once(child,'exit');assert.equal(code,1);assert.match(stderr,/No readable index.html/);assert.doesNotMatch(stderr,/ENOENT/);
});
