// Supabase enforces ownership with RLS; no administrator keys are used in the browser.
let carrotClient=null,workspaceRevision=0,workspaceMedia={},workspaceEpoch=0;
let saveGeneration=0,savedGeneration=0,saveTimer=null,savePromise=null,syncBlocked=false;
let syncMessage='Connecting…',syncFailure='';
function emptyWorkspace(){return {horses:[],tasks:[],logs:[],events:[],saved:[],listings:[],savedListings:[]}}
function getCarrotClient(){
 if(!carrotClient){if(!window.supabase||!window.CARTIS_CLOUD?.url||!CARTIS_CLOUD.publishableKey)throw Error('Account service is unavailable. Please try again later.');
 carrotClient=window.supabase.createClient(CARTIS_CLOUD.url,CARTIS_CLOUD.publishableKey,{auth:{detectSessionInUrl:true,flowType:'pkce',storageKey:'cartis-cloud-auth'}})}
 return carrotClient;
}
async function accountDataClient(owner){
 const {data,error}=await getCarrotClient().auth.getSession();
 if(error||!data.session||data.session.user.id!==owner)throw Error('Your session changed. Sign in again.');
 const token=data.session.access_token;
 return window.supabase.createClient(CARTIS_CLOUD.url,CARTIS_CLOUD.publishableKey,{accessToken:async()=>token});
}
function setSyncStatus(message,error=''){
 syncMessage=message;syncFailure=error;
 const label=document.querySelector('.workspace-mode');
 if(label){label.textContent=message;label.setAttribute('role','status');label.classList.toggle('sync-error',!!error)}
 let banner=document.querySelector('#save-error');
 if(!banner){banner=document.createElement('div');banner.id='save-error';banner.className='save-error';document.querySelector('.shell').append(banner)}
 banner.hidden=!error||!cartisSession;
 if(error)banner.innerHTML=`<span>${esc(error)}</span>${syncBlocked?'<button class="btn" onclick="download(db,\'carrot-unsaved-records.json\')">Download my changes</button><button class="btn" onclick="confirmReloadWorkspace()">Load latest</button>':'<button class="btn" onclick="retryWorkspaceSave()">Retry save</button>'}`;
}
function validateWorkspace(payload){
 if(payload?.format!=='cartis-cloud-v1'||!payload.records||!['horses','tasks','logs','events'].every(key=>Array.isArray(payload.records[key]))||!Array.isArray(payload.media))throw Error('Your workspace could not be read. Please contact support.');
 return payload;
}
function clearWorkspaceMemory(){
 if(typeof publicationStates!=='undefined'){publicationStates.clear();publicationErrors.clear();publicationLoading.clear();horseExperience={id:null,mode:'private'};publicSaleRequest++}
 workspaceEpoch++;clearTimeout(saveTimer);saveTimer=null;savePromise=null;saveGeneration=savedGeneration=0;syncBlocked=false;workspaceRevision=0;workspaceMedia={};db=emptyWorkspace();cartisProfile=null;
 document.querySelector('#modal')?.close();if(typeof stopHorseCamera==='function')stopHorseCamera();if(typeof checkinObjectUrls!=='undefined'){for(const url of checkinObjectUrls)URL.revokeObjectURL(url);checkinObjectUrls=[]}if(typeof mediaUrls!=='undefined'){for(const url of mediaUrls)URL.revokeObjectURL(url);mediaUrls=[]}
 if(typeof checkinDB!=='undefined')checkinDB=null;if(typeof videoDB!=='undefined')videoDB=null;
 if(typeof scanDraft!=='undefined')scanDraft=null;
 if(typeof catalogue!=='undefined')catalogue=null;
 setSyncStatus('Connecting…');
}
async function loadAccountWorkspace(user){
 clearWorkspaceMemory();cartisSession={id:user.id,email:user.email,name:user.user_metadata?.name||''};
 const epoch=workspaceEpoch;
 const client=await accountDataClient(user.id);const {data,error}=await client.from('cartis_workspaces').select('revision,payload').eq('user_id',user.id).maybeSingle();
 if(epoch!==workspaceEpoch)return;
 if(error)throw Error('We could not load your stable. Check your connection and try again.');
 if(data){const payload=validateWorkspace(data.payload);db={...emptyWorkspace(),...payload.records};cartisProfile=payload.profile?.complete?{...payload.profile,email:user.email}:null;workspaceRevision=Number(data.revision);
 for(const ref of payload.media){if(['photo','video'].includes(ref.kind)&&typeof ref.path==='string'&&ref.path.startsWith(user.id+'/'))workspaceMedia[ref.kind+'/'+ref.id]=ref.path}
 // Keep the original sample asset layout compatible with previously uploaded workspaces.
 const prefix=portraitExamples.h1.includes('/')?'assets/':'';for(const record of [...db.horses,...db.events,...db.listings])if(/^(assets\/)?horse-(bay|pasture|portrait|sterling)\.jpg$/.test(record.img||''))record.img=prefix+record.img.split('/').pop();
 }
 if(typeof normalizeSaleReferences==='function')normalizeSaleReferences();
 if(typeof discoveryCountry!=='undefined'){discoveryCountry=db.eventLocation?.country||cartisProfile?.country||'United States';discoveryCity=db.eventLocation?.city||'';discoveryType=db.eventLocation?.type||'All'}
 setSyncStatus('All changes saved');
}
function queueWorkspaceSave(){
 if(!cartisSession||!workspaceReady||!cartisProfile?.complete)return false;
 saveGeneration++;setSyncStatus(syncBlocked?'Changes need review':'Saving…',syncBlocked?'Your stable changed on another device. Download your unsaved changes before loading the latest copy.':'');
 clearTimeout(saveTimer);if(!syncBlocked)saveTimer=setTimeout(()=>flushWorkspaceSave().catch(()=>{}),500);
 return true;
}
function mediaReferences(records){const refs=[];for(const log of records.logs)if(log.photoId)refs.push({kind:'photo',id:log.photoId});for(const listing of records.listings)for(const media of listing.media||[])if(media.blobId)refs.push({kind:'video',id:media.blobId});return [...new Map(refs.map(ref=>[ref.kind+'/'+ref.id,ref])).values()]}
async function readMediaBlob(kind,id){const database=kind==='photo'?await openCheckinDB():await openVideoDB();return new Promise((resolve,reject)=>{const r=database.transaction(kind==='photo'?'photos':'files').objectStore(kind==='photo'?'photos':'files').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function flushWorkspaceSave(){
 clearTimeout(saveTimer);saveTimer=null;
 if(syncBlocked)throw Error('Load the latest stable before saving again.');
 if(!cartisSession||!workspaceReady)throw Error('Sign in before saving.');
 if(savePromise){await savePromise;if(saveGeneration>savedGeneration)return flushWorkspaceSave();return}
 if(saveGeneration===savedGeneration)return;
 const owner=cartisSession.id,epoch=workspaceEpoch;
 const run=async()=>{
  const client=await accountDataClient(owner);
  if(epoch!==workspaceEpoch)return;
  while(saveGeneration>savedGeneration){
   const generation=saveGeneration,records=structuredClone(db),profile=structuredClone(cartisProfile),media=[];
   setSyncStatus('Saving…');
   for(const ref of mediaReferences(records)){
    if(epoch!==workspaceEpoch)throw Error('Account changed before saving.');
    const key=ref.kind+'/'+ref.id;let path=workspaceMedia[key];
    if(!path){const blob=await readMediaBlob(ref.kind,ref.id);if(!blob)throw Error('A photo or video could not be found. Keep this page open and retry.');
     path=owner+'/'+ref.kind+'/'+encodeURIComponent(ref.id)+'-'+uid();
     const {error}=await client.storage.from('cartis-private').upload(path,blob,{upsert:false,contentType:blob.type});if(error)throw error;
     if(epoch!==workspaceEpoch)throw Error('Account changed before saving.');workspaceMedia[key]=path;
    }
    media.push({...ref,path});
   }
   if(epoch!==workspaceEpoch)throw Error('Account changed before saving.');
   const payload={format:'cartis-cloud-v1',records,profile,media,savedAt:new Date().toISOString()};
   const {data,error}=await client.rpc('save_cartis_workspace',{expected_revision:workspaceRevision,workspace_payload:payload});
   if(epoch!==workspaceEpoch)return;
   if(error){if(/Cloud copy changed/i.test(error.message))syncBlocked=true;throw error}
   workspaceRevision=Number(data);savedGeneration=generation;
  }
  if(epoch===workspaceEpoch)setSyncStatus('All changes saved');
 };
 const pending=run();savePromise=pending;
 try{await pending}catch(error){if(epoch===workspaceEpoch){setSyncStatus('Changes not saved',syncBlocked?'Your stable changed on another device. Download your changes before loading the latest copy.':'Your latest changes have not been saved. Keep this page open and retry.')}throw error}finally{if(savePromise===pending)savePromise=null}
}
async function persistAsync(){if(!queueWorkspaceSave())throw Error('Finish setting up your stable before saving.');await flushWorkspaceSave()}
async function retryWorkspaceSave(){try{await flushWorkspaceSave();toast('Your stable is saved')}catch(error){toast(syncBlocked?'Another device has updated this stable. Review your unsaved changes.':'Saving failed. Check your connection and retry.')}}
function confirmReloadWorkspace(){openModal('Load the latest stable',`<p class="subtitle">This replaces the changes currently on this page with the latest saved version. Download your changes first if you need to keep them.</p><div class="capture-actions"><button class="btn" onclick="download(db,'carrot-unsaved-records.json')">Download my changes</button><button class="btn primary" onclick="reloadAccountWorkspace()">Load latest</button><button class="btn" onclick="closeModal()">Cancel</button></div>`)}
async function reloadAccountWorkspace(){closeModal();await refreshSignedInWorkspace()}
async function fetchPrivateMedia(kind,id){
 const path=workspaceMedia[kind+'/'+id],owner=cartisSession?.id,epoch=workspaceEpoch;
 if(!owner||!path?.startsWith(owner+'/'))return null;
 const client=await accountDataClient(owner);const {data,error}=await client.storage.from('cartis-private').download(path);
 if(error||epoch!==workspaceEpoch)return null;
 return data;
}
function cloudPanel(){settings()}
window.addEventListener('online',()=>{if(cartisSession&&saveGeneration>savedGeneration&&!syncBlocked)retryWorkspaceSave()});
window.addEventListener('beforeunload',event=>{if(cartisSession&&saveGeneration>savedGeneration){event.preventDefault();event.returnValue=''}});
