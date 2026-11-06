// Phase 1: one private horse identity; explicit, server-enforced publication.
const sharingFields=[['sire','Sire'],['dam','Dam'],['history','Background & ownership history'],['role','Discipline / current use'],['training','Training plan'],['medical','Medical history text'],['withdrawal','Medication & withdrawal text']];
let horseExperience={id:null,mode:'private'},publicationStates=new Map(),publicationLoading=new Set(),publicationErrors=new Map(),publicSaleRequest=0;
function normalizeSaleReferences(){
 for(const h of db.horses)for(const m of h.media||[])if(!m.id)m.id=uid();
 for(const l of db.listings){for(const m of l.media||[])if(!m.id)m.id=uid();if(!l.sharing)l.sharing={fields:[],media:[],logs:[],tasks:[]}}
}
function saleDisplayRecord(l){const h=saleHorse(l);return h?{...l,name:h.name,breed:h.breed,age:h.age,sex:h.sex,role:h.role}:l}
function linkedSale(hid){return db.listings.find(l=>!l.sample&&l.sourceHorseId===hid)}
function saleHorse(l){return db.horses.find(h=>h.id===l.sourceHorseId)}
function setHorseExperience(id,mode){horseExperience={id,mode};render()}
function experienceToggle(id){return `<div class="experience-toggle" role="group" aria-label="Horse profile experience"><button class="${horseExperience.mode==='private'?'selected':''}" aria-pressed="${horseExperience.mode==='private'}" onclick="setHorseExperience('${id}','private')">Private</button><button class="${horseExperience.mode==='sales'?'selected':''}" aria-pressed="${horseExperience.mode==='sales'}" onclick="setHorseExperience('${id}','sales')">Sales & Auction</button></div>`}
const originalPrivateProfile=profile;
profile=function(id){
 if(!db.horses.some(h=>h.id===id))return originalPrivateProfile(id);
 if(horseExperience.id!==id)horseExperience={id,mode:'private'};
 if(horseExperience.mode==='sales')return horseSalesExperience(id);
 const content=originalPrivateProfile(id);const marker='<div class="detail-hero">';
 return content.replace(marker,experienceToggle(id)+`<p class="experience-caption">Private to your account</p>`+marker);
};
const previousPrepareAuction=prepareAuction;
prepareAuction=function(hid,lid){
 const existing=lid?db.listings.find(l=>l.id===lid):null;
 const id=hid||existing?.sourceHorseId;
 if(id&&db.horses.some(h=>h.id===id)){
  horseExperience={id,mode:'sales'};if($('#modal').open)closeModal();location.hash='horse/'+id;render();
  if(!linkedSale(id))createLinkedDraft(id);return;
 }
 if(existing){linkLegacyListing(existing.id);return}
 chooseAuctionHorse();
};
chooseAuctionHorse=function(){
 if(!db.horses.length)return openModal('Add a horse first','<p class="subtitle">A sale draft starts with a horse in your private stable.</p><div class="form-actions"><button class="btn primary" onclick="closeModal();addHorse()">Add a horse</button></div>');
 openModal('Choose a horse',`<p class="subtitle">Prepare a linked draft. Nothing becomes public until you review and publish it.</p><label class="field spaced">Horse<select id="auction-horse">${horseOptions()}</select></label><div class="form-actions"><button class="btn primary" onclick="prepareAuction(document.querySelector('#auction-horse').value)">Open Sales & Auction</button></div>`);
};
async function createLinkedDraft(id){
 if(linkedSale(id))return;
 const l={id:uid(),sourceHorseId:id,sample:false,media:[],sharing:{fields:[],media:[],logs:[],tasks:[]},saleType:'Private sale',country:cartisProfile?.country||'United States',city:cartisProfile?.city||'',currency:'USD',amount:0,description:'',disclosures:''};
 db.listings.push(l);try{await persistAsync();toast('Private sale draft saved');render()}catch{toast('Draft is on this page but has not saved. Use Retry save.');render()}
}
function linkLegacyListing(id){openModal('Link the existing draft',`<p class="subtitle">This preserves your draft and media. Horse identity will come from the selected private profile. All sharing permissions start unchecked.</p><label class="field spaced">Horse<select id="legacy-horse">${horseOptions()}</select></label><div class="form-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveLegacyLink('${id}')">Link draft</button></div>`)}
async function saveLegacyLink(id){
 const l=db.listings.find(l=>l.id===id),hid=$('#legacy-horse').value;
 if(!l||!db.horses.some(h=>h.id===hid))return;
 if(linkedSale(hid)&&linkedSale(hid).id!==id)return toast('That horse already has a linked draft. Choose another horse.');
 l.sourceHorseId=hid;l.sharing={fields:[],media:[],logs:[],tasks:[]};normalizeSaleReferences();
 try{await persistAsync();closeModal();horseExperience={id:hid,mode:'sales'};location.hash='horse/'+hid;render()}catch{toast('Link has not saved. Retry saving before continuing.')}
}
function saleMediaOptions(h,l){
 const items=[];
 if(/^data:image\/(jpeg|png|webp);base64,/.test(h.portrait||''))items.push({id:'portrait',kind:'photo',url:h.portrait,label:'Identification photo'});
 for(const m of h.media||[])items.push({...m,id:'horse:'+m.id,kind:'photo'});
 for(const m of l.media||[])if(!m.removed)items.push({...m,id:'sale:'+m.id});
 for(const log of db.logs)if(log.horse===h.id&&log.photoId)items.push({id:'checkin:'+log.id,photoId:log.photoId,kind:'photo',label:'Photo check-in · '+log.date});
 return items;
}
function selectedBox(group,id,label,detail,sharing){return `<label class="sharing-option"><input type="checkbox" name="${group}" value="${esc(id)}" ${(sharing[group]||[]).includes(id)?'checked':''}><span><b>${esc(label)}</b>${detail?`<small>${esc(detail)}</small>`:''}</span></label>`}
function publicationBadge(id){const p=publicationStates.get(id);return tag(p?.state==='published'?'Published':p?.state==='unpublished'?'Unpublished':'Private draft',p?.state==='published'?'':'amber')}
async function loadPublication(id,force=false){
 if(publicationLoading.has(id)||(!force&&publicationStates.has(id)))return;
 const owner=cartisSession?.id,epoch=workspaceEpoch;if(!owner)return;
 publicationLoading.add(id);publicationErrors.delete(id);
 try{
  const client=await accountDataClient(owner);
  const result=await client.from('carrot_sale_publications').select('id,state,revision,updated_at,approved_refs').eq('id',id).maybeSingle();
  if(result.error)throw result.error;
  const audit=await client.from('carrot_publication_audit').select('action,revision,created_at').eq('listing_id',id).order('id',{ascending:false}).limit(12);
  if(audit.error)throw audit.error;
  if(epoch!==workspaceEpoch)return;
  publicationStates.set(id,{...(result.data||{state:'draft',revision:0}),audit:audit.data||[]});
 }catch{if(epoch===workspaceEpoch)publicationErrors.set(id,'Publishing is unavailable. Your draft remains private. Check the connection or backend setup.');}
 finally{publicationLoading.delete(id);if(epoch===workspaceEpoch&&location.hash==='#horse/'+saleHorse(db.listings.find(l=>l.id===id)||{})?.id)render()}
}
function horseSalesExperience(id){
 const h=horse(id),l=linkedSale(id);
 const top=heading(esc(h.name),'Prepare a buyer presentation from selected parts of their story.','<a class="btn" href="#marketplace">All sale drafts</a>')+experienceToggle(id);
 if(!l)return top+`<section class="empty-sale"><h2>Their next chapter starts here</h2><p class="subtitle">Keep one horse profile. Choose what buyers can see, review it, then publish.</p><button class="btn primary spaced" onclick="createLinkedDraft('${id}')">Create private sale draft</button></section>`;
 normalizeSaleReferences();if(!publicationStates.has(l.id)&&!publicationLoading.has(l.id)&&!publicationErrors.has(l.id))queueMicrotask(()=>loadPublication(l.id));
 const s=l.sharing,p=publicationStates.get(l.id),media=saleMediaOptions(h,l);
 return top+`<div class="sale-state-row">${publicationBadge(l.id)}<span class="subtitle">Horse ID · ${esc(id)}</span><button class="link" onclick="loadPublication('${l.id}',true)">Refresh status</button></div>
 ${publicationErrors.has(l.id)?`<p class="sale-error" role="alert">${esc(publicationErrors.get(l.id))}</p>`:''}
 ${p?.state==='published'?`<div class="publication-notice"><div><b>Your approved presentation is public</b><p class="subtitle">Draft edits stay private until you publish an update. Remove live access immediately with Unpublish.</p></div><a class="btn" href="#sale/${l.id}">View public page</a><button class="btn" onclick="confirmUnpublish('${l.id}')">Unpublish</button></div>`:''}
 <form id="connected-sale-form" onsubmit="saveConnectedDraft(event,'${l.id}')" onchange="readDraftForm(db.listings.find(l=>l.id==='${l.id}'));persist()"><div class="connected-sale-layout"><section><h2>Listing details</h2><p class="subtitle">Name, breed, age and sex use this horse’s current identity. These are included when you publish.</p><div class="identity-strip">${esc(h.name)} · ${esc(h.breed)} · ${esc(h.age)} years · ${esc(h.sex)}</div><div class="form-grid spaced">
 <label class="field">Sale type<select name="saleType">${['Private sale','Auction'].map(v=>`<option ${l.saleType===v?'selected':''}>${v}</option>`).join('')}</select></label>
 <label class="field">Trading from${countrySelect('country',l.country)}</label>${field('City / region *','city',l.city)}<label class="field">Bred in${countrySelect('bredIn',l.bredIn,true,'Not specified')}</label>
 <label class="field">Currency<select name="currency">${['USD','GBP','EUR','CAD','AUD','INR','AED'].map(v=>`<option ${l.currency===v?'selected':''}>${v}</option>`).join('')}</select></label>${field('Asking / reserve price','amount',l.amount||0,'number')}${field('Auction closing date','closeDate',l.closeDate,'date')}${field('Buyer-facing description','description',l.description,'textarea',true)}${field('Seller disclosures','disclosures',l.disclosures,'textarea',true)}
 </div><div class="sale-form-actions"><button class="btn primary" type="submit">Save private draft</button><button class="btn" type="button" onclick="previewConnectedDraft('${l.id}')">Preview buyer page</button></div><p id="sale-save-message" class="subtitle" role="status"></p>
 <div class="section-title section-gap"><h2>Photos & videos</h2></div><p class="subtitle">Media stays private until selected in the sharing checklist. Save draft changes before opening media tools.</p><a class="btn spaced" href="#listing/${l.id}">Manage listing media</a>
 ${p?.audit?.length?`<details class="publication-history"><summary>Publication history</summary>${p.audit.map(a=>`<p class="subtitle">${esc(a.action)} · revision ${a.revision} · ${esc(new Date(a.created_at).toLocaleString())}</p>`).join('')}</details>`:''}
 </section><aside class="sharing-panel"><h2>Choose what to share</h2><p class="subtitle">Everything below is private unless you select it. Whole selected text records will be visible; review them for personal details.</p>
 <fieldset><legend>Pedigree, history & health</legend>${sharingFields.map(([k,label])=>selectedBox('fields',k,label,h[k]?String(h[k]).slice(0,180):'Not recorded',s)).join('')}</fieldset>
 <fieldset><legend>Approved photos & videos</legend>${media.length?media.map(m=>selectedBox('media',m.id,m.label||'Horse media',m.kind==='video'?'Video':'Photo',s)).join(''):'<p class="subtitle">No media yet. Use the existing private photo or listing media tools.</p>'}</fieldset>
 <fieldset><legend>Observations</legend>${db.logs.filter(x=>x.horse===id).map(x=>selectedBox('logs',x.id,x.date+' · '+x.type,x.notes?.slice(0,160),s)).join('')||'<p class="subtitle">No observations recorded.</p>'}</fieldset>
 <fieldset><legend>Care records</legend>${db.tasks.filter(x=>x.horse===id).map(x=>selectedBox('tasks',x.id,x.title,x.date+' · '+(x.done?'Marked complete':'Planned'),s)).join('')||'<p class="subtitle">No care records recorded.</p>'}</fieldset>
 <p class="field-hint">No veterinary verification is available. Owner-entered records remain labelled as such.</p>
 <button class="btn primary" type="button" ${!p||publicationLoading.has(l.id)?'disabled':''} onclick="confirmPublish('${l.id}')">${p?.state==='published'?'Review & publish update':'Review & publish'}</button>
 </aside></div></form>`;
}
function readDraftForm(l){
 const form=$('#connected-sale-form');if(!form)return;
 const data=new FormData(form);for(const k of ['saleType','country','city','bredIn','currency','amount','closeDate','description','disclosures'])l[k]=String(data.get(k)||'');
 l.sharing=Object.fromEntries(['fields','media','logs','tasks'].map(k=>[k,data.getAll(k).map(String)]));normalizeSaleReferences();
}
async function saveConnectedDraft(event,id){
 event?.preventDefault();const l=db.listings.find(x=>x.id===id);if(!l)return false;readDraftForm(l);
 const button=$('#connected-sale-form button[type=submit]');if(button)button.disabled=true;
 try{await persistAsync();if($('#sale-save-message'))$('#sale-save-message').textContent='Private draft saved. Published version unchanged.';return true}
 catch{toast('Draft has not saved. Keep this page open and retry.');return false}finally{if(button?.isConnected)button.disabled=false}
}
function draftPresentation(l){
 const h=saleHorse(l),s=l.sharing||{};if(!h)return null;
 const d={id:l.id,horseId:h.id,name:h.name,breed:h.breed,age:h.age,sex:h.sex,records:[],media:[],verification:'Seller-entered information. No veterinary certification or fitness-for-purchase assessment.'};
 for(const k of ['description','country','city','bredIn','saleType','amount','currency','closeDate','disclosures'])d[k]=l[k];
 for(const [k] of sharingFields)if((s.fields||[]).includes(k))d[k]=h[k];
 for(const x of db.logs)if(x.horse===h.id&&(s.logs||[]).includes(x.id))d.records.push({id:x.id,kind:'Observation',date:x.date,type:x.type,notes:x.notes,verification:'Owner-entered; not veterinarian verified'});
 for(const x of db.tasks)if(x.horse===h.id&&(s.tasks||[]).includes(x.id))d.records.push({id:x.id,kind:'Care record',date:x.date,type:x.type,title:x.title,done:x.done,verification:'Owner-entered; completion is not veterinary verification'});
 d.media=saleMediaOptions(h,l).filter(m=>(s.media||[]).includes(m.id));return d;
}
function buyerPresentation(d,preview=false){
 const details=[['Breed',d.breed],['Age / sex',[d.age+' years',d.sex].join(' · ')],['Trading from',[d.city,d.country].filter(Boolean).join(', ')],['Bred in',d.bredIn],['Sale type',d.saleType],['Price',price(d)],['Auction closes',d.saleType==='Auction'?d.closeDate:''],['Sire',d.sire],['Dam',d.dam],['Discipline',d.role]].filter(x=>x[1]);
 return `<article class="buyer-presentation">${preview?'<div class="preview-label">Buyer preview · not published by previewing</div>':''}<h1>${esc(d.name)}</h1><p class="subtitle">${esc(d.breed)} · ${esc(d.age)} years · ${esc(d.sex)}</p><div class="buyer-facts">${details.map(([k,v])=>`<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>${d.description?`<h2>About this horse</h2><p class="sale-prose">${esc(d.description)}</p>`:''}
 ${[['history','Background'],['training','Training'],['medical','Selected medical history'],['withdrawal','Selected medication record'],['disclosures','Seller disclosures']].filter(([k])=>d[k]).map(([k,label])=>`<section><h2>${label}</h2><p class="sale-prose">${esc(d[k])}</p></section>`).join('')}
 <section><h2>Seller-approved photos & videos</h2><div class="sale-media buyer-media">${(d.media||[]).map((m,i)=>{
  const url=m.protected?`${CARTIS_CLOUD.url}/functions/v1/listing-media?listing=${encodeURIComponent(d.id)}&asset=${encodeURIComponent(m.id)}`:m.url;
  if(m.protected)return m.kind==='video'?`<figure><video controls preload="none" src="${esc(url)}" aria-label="${esc(m.label)}"></video><figcaption>${esc(m.label)}</figcaption></figure>`:`<figure><img src="${esc(url)}" alt="${esc(m.label)}" loading="lazy"><figcaption>${esc(m.label)}</figcaption></figure>`;
  if(preview&&m.photoId)return `<figure><img data-checkin="${esc(m.photoId)}" alt="${esc(m.label)}"><figcaption>${esc(m.label)}</figcaption></figure>`;
  return mediaHtml({...m,url},i);
 }).join('')||'<p class="subtitle">No visual material has been approved for this listing.</p>'}</div></section>
 <section><h2>Selected records</h2>${(d.records||[]).map(r=>`<div class="record"><h3>${esc(r.date)} · ${esc(r.type)}</h3><p class="sale-prose">${esc(r.notes||r.title)}</p>${r.kind==='Care record'?`<p class="subtitle">${r.done?'Marked complete by owner':'Planned care'}</p>`:''}<p class="field-hint">${esc(r.verification)}</p></div>`).join('')||'<p class="subtitle">No private care records have been approved for sharing.</p>'}</section>
 <p class="note">${esc(d.verification)} No bidding, payment or purchase eligibility assessment is provided here.</p></article>`;
}
function previewConnectedDraft(id){const l=db.listings.find(x=>x.id===id);readDraftForm(l);const d=draftPresentation(l);if(!d)return;openModal('Buyer preview',buyerPresentation(d,true));hydrateVideos();hydrateCheckinPhotos()}
async function confirmPublish(id){
 if(!await saveConnectedDraft(null,id))return;
 const l=db.listings.find(x=>x.id===id),h=saleHorse(l),p=publicationStates.get(id);
 if(!p)return toast('Refresh publication status before publishing.');
 if(!l.city?.trim()||!l.country)return toast('Add the seller country and city first.');
 if(l.saleType==='Auction'&&(!l.closeDate||l.closeDate<todayLA()))return toast('Choose an auction closing date today or later.');
 const d=draftPresentation(l);openModal(p.state==='published'?'Publish updated presentation':'Publish this horse listing',buyerPresentation(d,true)+`<div class="publish-consent"><label class="confirm-identity"><input id="publish-consent" type="checkbox">I approve this presentation of ${esc(h.name)} and every selected record/media item for public access through a shareable link.</label><p class="field-hint">Unpublishing stops future access through Carrot. Copies already downloaded by buyers cannot be recalled. Public material is not veterinarian verified.</p><div class="form-actions"><button class="btn" onclick="closeModal()">Keep private draft</button><button class="btn primary" id="publish-listing" onclick="publishConnectedListing('${id}')">Confirm & publish</button></div><p id="publication-message" role="status"></p></div>`);hydrateVideos();hydrateCheckinPhotos();
}
async function publishConnectedListing(id){
 if(!$('#publish-consent')?.checked)return toast('Approve the selected presentation before publishing.');
 const owner=cartisSession?.id,epoch=workspaceEpoch,p=publicationStates.get(id),button=$('#publish-listing');button.disabled=true;
 try{
  const client=await accountDataClient(owner);const {data,error}=await client.rpc('publish_carrot_listing',{listing_id:id,expected_workspace_revision:workspaceRevision,expected_publication_revision:p.revision});
  if(error)throw error;if(epoch!==workspaceEpoch)return;publicationStates.set(id,{...p,...data});closeModal();await loadPublication(id,true);render();toast('Approved presentation published');
 }catch(error){if(epoch===workspaceEpoch&&$('#publication-message'))$('#publication-message').textContent=error.message||'Publishing failed. Draft remains private; refresh status and retry.'}finally{if(button.isConnected)button.disabled=false}
}
function confirmUnpublish(id){openModal('Remove public access',`<p class="subtitle">The buyer page and its protected media will become unavailable. Your horse profile and private draft remain. Previously downloaded copies cannot be recalled.</p><div class="form-actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="unpublishConnectedListing('${id}',this)">Unpublish listing</button></div><p id="publication-message" role="status"></p>`)}
async function unpublishConnectedListing(id,button){
 const owner=cartisSession?.id,epoch=workspaceEpoch,p=publicationStates.get(id);button.disabled=true;
 try{const client=await accountDataClient(owner);const {data,error}=await client.rpc('unpublish_carrot_listing',{listing_id:id,expected_publication_revision:p.revision});if(error)throw error;if(epoch!==workspaceEpoch)return;publicationStates.set(id,{...p,...data});closeModal();await loadPublication(id,true);render();toast('Public access removed')}
 catch(error){if(epoch===workspaceEpoch&&$('#publication-message'))$('#publication-message').textContent=error.message||'Unpublishing failed. Retry; public access may still be active.'}finally{if(button.isConnected)button.disabled=false}
}
function publicSaleRoute(){
 const [route,id]=location.hash.slice(1).split('/');if(route!=='sale')return false;
 document.body.classList.add('entry-mode');document.title='Horse listing · Carrot';
 $('#app').innerHTML=`<section class="public-sale-shell">${accountBrand()}<p role="status">Loading approved presentation…</p></section>`;
 const request=++publicSaleRequest;loadPublicSale(id,request);return true;
}
async function loadPublicSale(id,request){
 let content;
 try{
  if(!/^[0-9a-f-]{36}$/i.test(id||''))throw Error('unavailable');
  const response=await fetch(CARTIS_CLOUD.url+'/rest/v1/rpc/get_carrot_listing',{method:'POST',headers:{apikey:CARTIS_CLOUD.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({listing_id:id}),cache:'no-store',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('network');const d=await response.json();
  content=d?buyerPresentation(d):'<h1>Listing unavailable</h1><p class="subtitle">This listing is private, has been unpublished, or does not exist.</p>';
 }catch{content='<h1>Unable to load listing</h1><p class="subtitle">The listing may be unavailable. Check your connection and try again.</p><button class="btn spaced" onclick="render()">Retry</button>'}
 if(request!==publicSaleRequest||location.hash!=='#sale/'+id)return;
 $('#app').innerHTML=`<section class="public-sale-shell">${accountBrand()}${content}<p class="entry-switch"><a href="${cartisSession?'#marketplace':'#login'}">${cartisSession?'Back to your workspace':'Sign in to Carrot'}</a></p></section>`;
}
// Existing catalogue stays owner-only. Resolve identity from the horse rather than copied fields.
const originalMarketplace=marketplace;
marketplace=function(){
 return originalMarketplace().replace('Find a horse or manage your listings.','Manage your private drafts and published presentations.').replace(/<div class="note">This catalogue[\s\S]*?<\/div>/,'<div class="note">Your private sale workspace. Open a linked horse profile to select buyer material and publish a shareable presentation. Bidding and payments are not connected.</div>');
};
const originalListingDetail=listingDetail;
listingDetail=function(id){
 const l=db.listings.find(x=>x.id===id);if(!l||l.sample)return originalListingDetail(id);
 const h=saleHorse(l);
 const banner=h?`<div class="publication-notice"><p class="subtitle">Listing media is private until approved in the linked horse profile.</p><button class="btn" onclick="horseExperience={id:'${h.id}',mode:'sales'};location.hash='horse/${h.id}';render()">Sharing & publication</button></div>`:`<div class="publication-notice"><p class="subtitle">Legacy draft · private. Link it to a horse before publishing.</p><button class="btn" onclick="linkLegacyListing('${id}')">Link horse profile</button></div>`;
 return banner+originalListingDetail(id);
};
const originalDownloadSale=downloadSale;
downloadSale=function(id){const l=db.listings.find(x=>x.id===id);if(!saleHorse(l))return toast('Link this draft to a horse before exporting a buyer presentation.');download(draftPresentation(l),'carrot-approved-sale-'+id+'.json')};
