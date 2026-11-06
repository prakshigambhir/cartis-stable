// Cache only the public app shell; no API requests, account data or uploaded media.
const CACHE='carrot-shell-connected1';
const SHELL=['./','index.html','style.css','minimal.css','account.css','vision.css','connected-sales.css','connected-sales.js','app.js','discovery.js','sales.js','account.js','vision.js','phone.js','cloud.js','cloud-config.js','supabase.js','manifest.webmanifest','event-catalogue.json','cartis-192.png','cartis-512.png','horse-bay.jpg','horse-portrait.jpg','horse-pasture.jpg','horse-sterling.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>(key.startsWith('cartis-shell-')||key.startsWith('carrot-shell-'))&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url),base=new URL('./',self.registration.scope);
 const relative=url.pathname.slice(base.pathname.length);
 if(event.request.method!=='GET'||url.origin!==base.origin||(url.search&&url.search!=='?v=connected1')||!url.pathname.startsWith(base.pathname)||!SHELL.includes(relative||'./'))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)))}return response}).catch(()=>caches.match(event.request,{ignoreSearch:true}).then(response=>response||Response.error())));
});
