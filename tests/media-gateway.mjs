import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
let handler,reads=0,downloadCount=0,unpublishDuringRead=false;
let publication={state:'published',owner_id:'owner',assets:{approved:{data:'data:image/png;base64,aGVsbG8=',kind:'photo'},video:{path:'owner/video/file',kind:'video'}}};
const client={
 from(){return {select(){return {eq(){return {async maybeSingle(){reads++;return {data:structuredClone(publication)}}}}}}}},
 storage:{from(){return {async download(){downloadCount++;if(unpublishDuringRead)publication.state='unpublished';return {data:new Blob(['video contents'],{type:'video/mp4'})}}}}}
};
let source=fs.readFileSync(new URL('../supabase/functions/listing-media/index.ts',import.meta.url),'utf8').replace(/^import .*;$/m,'').replace('(request: Request)','(request)').replace('let blob: Blob','let blob').replaceAll("Deno.env.get('SUPABASE_URL')!","Deno.env.get('SUPABASE_URL')").replaceAll("Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!","Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')");
vm.runInNewContext(source,{createClient:()=>client,Deno:{env:{get:()=>''},serve:fn=>handler=fn},Response,URL,Blob,Uint8Array,atob,JSON});
const id='00000000-0000-4000-8000-000000000001';const req=(asset,headers={})=>new Request(`https://example.com/?listing=${id}&asset=${asset}`,{headers});
let r=await handler(req('approved'));assert.equal(r.status,200);assert.equal(await r.text(),'hello');assert.match(r.headers.get('Cache-Control'),/no-store/);assert.equal(r.headers.get('Content-Type'),'image/png');
r=await handler(req('not-approved'));assert.equal(r.status,404);assert.equal(downloadCount,0);
r=await handler(req('video',{Range:'bytes=0-4'}));assert.equal(r.status,206);assert.equal(await r.text(),'video');assert.equal(r.headers.get('Content-Range'),'bytes 0-4/14');
publication.state='unpublished';r=await handler(req('approved'));assert.equal(r.status,404);
publication.state='published';unpublishDuringRead=true;r=await handler(req('video'));assert.equal(r.status,404);
console.log('Passed: approved asset only, no-store responses, video byte ranges, unpublish revocation and revoke during download.');
