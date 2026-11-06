// Explicit, private cross-device snapshots. Local edits are never uploaded silently.
let cloudClientPromise=null,cloudBusy=false,cloudRevision=null,cloudOwner=null;
function cloudConfigured(){return !!(window.CARTIS_CLOUD?.url&&window.CARTIS_CLOUD?.publishableKey)}
async function cloudClient(){
 if(!cloudConfigured())throw Error('Cloud storage has not been connected yet.');
 if(!cloudClientPromise)cloudClientPromise=(async()=>{
  if(!window.supabase)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='supabase.js';script.onload=resolve;script.onerror=()=>reject(Error('Could not load cloud access.'));document.head.append(script)});
  return window.supabase.createClient(CARTIS_CLOUD.url,CARTIS_CLOUD.publishableKey,{auth:{detectSessionInUrl:true,flowType:'pkce',storageKey:'cartis-cloud-auth'}});
 })().catch(error=>{cloudClientPromise=null;throw error});
 return cloudClientPromise;
}
function cloudStatus(text){const el=$('#cloud-status');if(el)el.textContent=text}
async function cloudPanel(){
 openModal('Cloud & devices',`<p class="subtitle">Save a private copy of this browser’s workspace, then load it on another device. Transfers are manual; local edits are not automatically synced.</p><div id="cloud-body" class="spaced"></div><p id="cloud-status" class="subtitle spaced" role="status"></p>`);
 if(!cloudConfigured()){$('#cloud-body').innerHTML='<div class="note">Supabase is prepared but not connected. No records have been uploaded. Connect the database project before using cloud storage.</div>';return}
 try{const client=await cloudClient();const {data,error}=await client.auth.getUser();
 if(error||!data.user){cloudOwner=null;cloudRevision=null;$('#cloud-body').innerHTML=`<form id="cloud-email-form" class="entry-form"><label class="field">Email address<input name="email" type="email" autocomplete="email" required></label><button class="btn primary">Email sign-in link</button></form><p class="subtitle spaced">Open the link in this same browser and device. Cloud access requires verified email; your local demo profile does not grant access to cloud records.</p>`;
 $('#cloud-email-form').onsubmit=async event=>{event.preventDefault();if(cloudBusy)return;cloudBusy=true;const button=event.target.querySelector('button');button.disabled=true;const email=new FormData(event.target).get('email').trim();try{const result=await client.auth.signInWithOtp({email,options:{emailRedirectTo:new URL('./',location.href).href}});if(result.error)throw result.error;cloudStatus('Check your email. Open the sign-in link in this browser, then return to Cloud & devices.')}catch(error){cloudStatus(error.message)}finally{cloudBusy=false;button.disabled=false}};return}
 if(cloudOwner?.id!==data.user.id){cloudRevision=null;try{const base=JSON.parse(localStorage.getItem('cartis-cloud-base'));if(base?.owner===data.user.id&&Number.isSafeInteger(base.revision))cloudRevision=base.revision}catch{}}cloudOwner=data.user;const {data:row,error:readError}=await client.from('cartis_workspaces').select('revision,updated_at').eq('user_id',cloudOwner.id).maybeSingle();if(readError)throw readError;
 // Reading metadata does not grant permission to replace an existing cloud workspace.
 if(!row)cloudRevision=0;
 $('#cloud-body').innerHTML=`<p class="subtitle">Signed in as ${esc(cloudOwner.email)}</p><div class="note">${row?'Cloud copy saved '+esc(new Date(row.updated_at).toLocaleString())+'.':'No cloud copy yet.'} Upload includes horse profiles, care records, plans, listings, photos and videos stored on this device. Example records are included if still present.</div><div class="capture-actions"><button class="btn primary" onclick="uploadCloudWorkspace()">Upload this workspace</button>${row?'<button class="btn" onclick="confirmCloudRestore()">Load cloud copy</button>':''}<button class="btn" onclick="cloudSignOut()">Sign out of cloud</button></div>`;
 }catch(error){cloudStatus(error.message||'Cloud access is unavailable.')}
}
async function cloudSignOut(){if(cloudBusy)return;const client=await cloudClient();const {error}=await client.auth.signOut();if(error)return cloudStatus(error.message);cloudOwner=null;cloudRevision=null;await cloudPanel()}
function checkCloudPayload(payload){if(payload?.format!=='cartis-cloud-v1'||!payload.records||!['horses','tasks','logs','events'].every(key=>Array.isArray(payload.records[key]))||!Array.isArray(payload.media)||!payload.profile?.complete)throw Error('This cloud copy is not a valid Carrot workspace.');return payload}
async function readLocalMedia(database,store,key){return new Promise((resolve,reject)=>{const request=database.transaction(store).objectStore(store).get(key);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
function cloudMediaRefs(records){const refs=[];for(const log of records.logs||[])if(log.photoId)refs.push({kind:'photo',id:log.photoId});for(const listing of records.listings||[])for(const media of listing.media||[])if(media.blobId)refs.push({kind:'video',id:media.blobId});return [...new Map(refs.map(ref=>[ref.kind+'/'+ref.id,ref])).values()]}
async function uploadCloudWorkspace(){
 if(cloudBusy)return;if(!cartisProfile?.complete)return cloudStatus('Complete your local profile first.');
 if(cloudRevision===null)return cloudStatus('A cloud copy already exists. Load it before editing and uploading, so another device’s changes are not overwritten. Download a local backup first if you have local changes to keep.');
 cloudBusy=true;const uploaded=[];try{
 const client=await cloudClient();const {data,error}=await client.auth.getUser();if(error||!data.user||data.user.id!==cloudOwner?.id)throw Error('Sign in to cloud storage again.');
 const records=structuredClone(db),profile=structuredClone(cartisProfile),snapshot=uid(),media=[];
 for(const ref of cloudMediaRefs(records)){
  cloudStatus('Uploading '+ref.kind+'…');const database=ref.kind==='photo'?await openCheckinDB():await openVideoDB();const blob=await readLocalMedia(database,ref.kind==='photo'?'photos':'files',ref.id);
  if(!blob)throw Error('A referenced '+ref.kind+' is missing from this browser. Nothing was saved to the database.');
  const path=data.user.id+'/'+snapshot+'/'+ref.kind+'/'+encodeURIComponent(ref.id);const result=await client.storage.from('cartis-private').upload(path,blob,{contentType:blob.type,upsert:false});if(result.error)throw result.error;uploaded.push(path);media.push({...ref,path});
 }
 const payload={format:'cartis-cloud-v1',records,profile,media,savedAt:new Date().toISOString()};checkCloudPayload(payload);
 cloudStatus('Saving records…');const result=await client.rpc('save_cartis_workspace',{expected_revision:cloudRevision,workspace_payload:payload});if(result.error)throw result.error;
 cloudRevision=Number(result.data);rememberCloudRevision(cloudOwner.id,cloudRevision);await cloudPanel();cloudStatus('Workspace uploaded. Load this cloud copy on your phone. Later edits stay local until you upload again.');
 }catch(error){if(uploaded.length){const client=await cloudClient();await client.storage.from('cartis-private').remove(uploaded)}cloudStatus(error.message||'Upload failed; your local workspace is unchanged.')}finally{cloudBusy=false}
}
function confirmCloudRestore(){if(cloudBusy)return;$('#cloud-body').innerHTML=`<div class="note">Loading the cloud copy replaces the records and profile in this browser. Download your current records before continuing if you want to keep them.</div><div class="capture-actions"><button class="btn" onclick="download(db,'cartis-before-cloud-load.json')">Download current records</button><button class="btn primary" onclick="restoreCloudWorkspace()">Replace with cloud copy</button><button class="btn" onclick="cloudPanel()">Cancel</button></div>`}
async function restoreCloudWorkspace(){
 if(cloudBusy)return;cloudBusy=true;try{
 const client=await cloudClient();const {data:user,error:authError}=await client.auth.getUser();if(authError||!user.user||user.user.id!==cloudOwner?.id)throw Error('Sign in again.');
 const {data:row,error}=await client.from('cartis_workspaces').select('payload,revision').eq('user_id',user.user.id).single();if(error)throw error;
 const payload=checkCloudPayload(row.payload),blobs=[];
 for(const ref of payload.media){if(!['photo','video'].includes(ref.kind)||!ref.path.startsWith(user.user.id+'/'))throw Error('Invalid media reference.');cloudStatus('Loading '+ref.kind+'…');const result=await client.storage.from('cartis-private').download(ref.path);if(result.error)throw result.error;blobs.push({...ref,blob:result.data})}
 // Restore media under fresh keys so a partial failure cannot overwrite current records' media.
 const restored=structuredClone(payload.records);const samplePrefix=portraitExamples.h1.includes('/')?'assets/':'';for(const record of [...restored.horses,...restored.events,...(restored.listings||[])])if(/^(assets\/)?horse-(bay|pasture|portrait|sterling)\.jpg$/.test(record.img||''))record.img=samplePrefix+record.img.split('/').pop();
 for(const ref of blobs){const newId=uid(),database=ref.kind==='photo'?await openCheckinDB():await openVideoDB();await new Promise((resolve,reject)=>{const tx=database.transaction(ref.kind==='photo'?'photos':'files','readwrite');tx.objectStore(ref.kind==='photo'?'photos':'files').put(ref.blob,newId);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});if(ref.kind==='photo'){for(const log of restored.logs)if(log.photoId===ref.id)log.photoId=newId}else{for(const listing of restored.listings||[])for(const media of listing.media||[])if(media.blobId===ref.id)media.blobId=newId}}
 const previousRecords=localStorage.getItem('equora-v1'),previousProfile=localStorage.getItem('cartis-profile');const profile={...payload.profile,email:user.user.email};
 try{localStorage.setItem('equora-v1',JSON.stringify(restored));localStorage.setItem('cartis-profile',JSON.stringify(profile))}catch(error){if(previousRecords!==null)localStorage.setItem('equora-v1',previousRecords);else localStorage.removeItem('equora-v1');if(previousProfile!==null)localStorage.setItem('cartis-profile',previousProfile);else localStorage.removeItem('cartis-profile');throw error}
 db=restored;cartisProfile=profile;saveDemoSession({email:profile.email,name:profile.name});cloudRevision=Number(row.revision);rememberCloudRevision(cloudOwner.id,cloudRevision);closeModal();location.hash='overview';render();toast('Cloud copy loaded. Changes stay local until you upload again.');
 }catch(error){cloudStatus(error.message||'The cloud copy could not load.')}finally{cloudBusy=false}
}
const cloudLink=document.createElement('button');cloudLink.textContent='Cloud & devices';cloudLink.className='phone-help';cloudLink.onclick=cloudPanel;document.querySelector('.account-links').append(cloudLink);

if(new URLSearchParams(location.search).has('code')&&cloudConfigured())queueMicrotask(()=>cloudPanel());

function rememberCloudRevision(owner,revision){try{localStorage.setItem('cartis-cloud-base',JSON.stringify({owner,revision}))}catch{}}
