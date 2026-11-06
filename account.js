// Real account access. Browser profile fields never grant database access.
let cartisProfile=null,cartisSession=null,authReady=false,workspaceReady=false,accountFailure='',authSubscription=null,accountLoad=0;
function accountBrand(){return '<a class="brand account-brand" href="#login"><span class="brandmark">♞</span>carrot<span class="branddot">.</span></a>'}
function authRedirect(){return new URL('./',location.href).href}
function accountMessage(message,error=false){const el=$('#account-message');if(el){el.textContent=message;el.classList.toggle('error',error)}}
function renderAccountRoute(){
 if(typeof publicSaleRoute==='function'&&publicSaleRoute())return true;
 let route=location.hash.slice(1).split('/')[0]||'overview';
 if(!authReady||(!workspaceReady&&cartisSession)){
  document.body.classList.add('entry-mode');$('#app').innerHTML=`<section class="entry-layout">${accountBrand()}<div class="entry-card"><h1>${accountFailure?'We couldn’t open your stable':'Opening your stable…'}</h1><p class="subtitle" role="status">${esc(accountFailure||'Connecting securely to your account.')}</p>${accountFailure?'<button class="btn primary spaced" onclick="startCarrot()">Try again</button><button class="btn spaced" onclick="signOutDemo()">Sign out</button>':''}</div></section>`;return true;
 }
 if(!cartisSession&&!['login','signup','forgot'].includes(route)){route='login';history.replaceState(null,'','#login')}
 if(cartisSession&&!cartisProfile?.complete&&!['setup','reset'].includes(route)){route='setup';history.replaceState(null,'','#setup')}
 if(cartisSession&&cartisProfile?.complete&&['login','signup'].includes(route)){route='overview';history.replaceState(null,'','#overview')}
 if(!cartisSession&&route==='reset'){route='login';history.replaceState(null,'','#login')}
 const entry=['login','signup','forgot','setup','reset'].includes(route);document.body.classList.toggle('entry-mode',entry);
 if(entry){document.body.classList.remove('menu-open');$('#app').innerHTML=route==='setup'?profileSetup(false):route==='reset'?resetPasswordPage():accessPage(route);document.title=(route==='signup'?'Create account':route==='setup'?'Create profile':route==='forgot'?'Reset password':'Sign in')+' · Carrot';bindAccountForm(route);return true}
 if(route==='account'){$('#app').innerHTML=profileSetup(true);$('#crumb').textContent='Your profile';document.title='Your profile · Carrot';bindProfileForm(true);return true}
 $('.stable-label').textContent=cartisProfile?.stable||'Your stable';return false;
}
function accessPage(route){const signup=route==='signup',forgot=route==='forgot';return `<section class="entry-layout">${accountBrand()}<div class="entry-card"><h1>${signup?'Create your account':forgot?'Reset your password':'Welcome back'}</h1><p class="subtitle">${signup?'A home for your horses. Start with your account.':forgot?'We’ll email you a link to choose a new password.':'Sign in to your stable.'}</p><form id="access-form" class="entry-form">${signup?'<label class="field">Full name<input name="name" autocomplete="name" required maxlength="100" placeholder="Your name"></label>':''}<label class="field">Email address<input name="email" type="email" autocomplete="email" required maxlength="254" placeholder="you@example.com"></label>${forgot?'':`<label class="field">Password<input name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" ${signup?'minlength="12"':''} maxlength="128" required placeholder="${signup?'At least 12 characters':'Your password'}"></label>`}<button class="btn primary">${signup?'Create account':forgot?'Send reset link':'Sign in'}</button><p id="account-message" class="account-message" role="status"></p></form><p class="entry-switch">${signup?'Already have an account? <a href="#login">Sign in</a>':forgot?'<a href="#login">Back to sign in</a>':'New to Carrot? <a href="#signup">Create an account</a>'}</p>${!signup&&!forgot?'<p class="entry-switch"><a href="#forgot">Forgot password?</a></p>':''}<p class="entry-notice">Your stable is private to your account. ${signup?'Confirm your email before signing in.':''}</p></div></section>`}
function profileSetup(edit){const p=cartisProfile||{};return `<section class="${edit?'account-edit':'entry-layout'}">${edit?'':accountBrand()}<div class="entry-card"><h1>${edit?'Your profile':'Set up your stable'}</h1><p class="subtitle">${edit?'Your details and stable settings.':'A few details, then you can add your first horse.'}</p><form id="profile-form" class="entry-form"><label class="field">Full name<input name="name" autocomplete="name" required maxlength="100" value="${esc(p.name||cartisSession?.name||'')}"></label><label class="field">Email address<input type="email" readonly value="${esc(cartisSession?.email||'')}"></label><label class="field">Your role<select name="role">${['Stable owner','Stable manager','Rider','Trainer','Veterinarian','Other'].map(v=>`<option ${p.role===v?'selected':''}>${v}</option>`).join('')}</select></label><label class="field">Stable name<input name="stable" required maxlength="120" placeholder="Your stable name" value="${esc(p.stable||'')}"></label><div class="profile-location"><label class="field">Country${countrySelect('country',p.country||'United States')}</label><label class="field">City / region<input name="city" required maxlength="120" value="${esc(p.city||'')}"></label></div><p id="account-message" class="account-message" role="status"></p><div class="form-actions">${edit?'<a class="btn" href="#overview">Cancel</a>':''}<button class="btn primary">${edit?'Save profile':'Open my stable'}</button></div></form></div></section>`}
function resetPasswordPage(){return `<section class="entry-layout">${accountBrand()}<div class="entry-card"><h1>Choose a new password</h1><form id="reset-form" class="entry-form"><label class="field">New password<input name="password" type="password" autocomplete="new-password" minlength="12" maxlength="128" required></label><button class="btn primary">Save password</button><p id="account-message" class="account-message" role="status"></p></form></div></section>`}
function bindAccountForm(route){
 if(route==='setup'){bindProfileForm(false);return}
 if(route==='reset'){$('#reset-form').onsubmit=async event=>{event.preventDefault();const button=event.target.querySelector('button');button.disabled=true;try{const {error}=await getCarrotClient().auth.updateUser({password:new FormData(event.target).get('password')});if(error)throw error;location.hash='overview';toast('Password updated')}catch(error){accountMessage(error.message,true)}finally{button.disabled=false}};return}
 $('#access-form').onsubmit=async event=>{
  event.preventDefault();const form=new FormData(event.target),email=String(form.get('email')).trim().toLowerCase(),button=event.target.querySelector('button');button.disabled=true;accountMessage('Please wait…');
  try{
   const client=getCarrotClient();
   if(route==='signup'){
    const {data,error}=await client.auth.signUp({email,password:String(form.get('password')),options:{data:{name:String(form.get('name')).trim()},emailRedirectTo:authRedirect()}});if(error)throw error;
    if(data.session){await acceptAccount(data.session.user);location.hash='setup';render()}else{accountMessage('Check your email to confirm your account, then sign in.');button.textContent='Confirmation email sent'}
   }else if(route==='forgot'){
    const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:authRedirect()+'#reset'});if(error)throw error;accountMessage('If an account exists for this email, you’ll receive a password reset link.');
   }else{
    const {data,error}=await client.auth.signInWithPassword({email,password:String(form.get('password'))});if(error)throw error;await acceptAccount(data.user);location.hash=cartisProfile?.complete?'overview':'setup';render();
   }
  }catch(error){accountMessage(error.message||'We couldn’t complete that request. Please try again.',true)}finally{if(button.isConnected)button.disabled=false}
 };
}
function bindProfileForm(edit){$('#profile-form').onsubmit=async event=>{event.preventDefault();const fields=Object.fromEntries(new FormData(event.target));if(!fields.name.trim()||!fields.stable.trim()||!fields.city.trim())return;const button=event.target.querySelector('button[type="submit"],button.primary');button.disabled=true;cartisProfile={name:fields.name.trim(),email:cartisSession.email,role:fields.role,stable:fields.stable.trim(),country:fields.country,city:fields.city.trim(),complete:true};try{await persistAsync();location.hash='overview';render();if(edit)toast('Profile saved')}catch(error){accountMessage('Your profile could not be saved. Please retry.',true)}finally{if(button.isConnected)button.disabled=false}}}
async function acceptAccount(user){
 if(cartisSession?.id===user.id&&workspaceReady)return;
 const loading=++accountLoad;authReady=true;workspaceReady=false;accountFailure='';cartisSession={id:user.id,email:user.email};render();
 try{await loadAccountWorkspace(user);if(loading!==accountLoad)return;workspaceReady=true;render()}catch(error){if(loading!==accountLoad)return;accountFailure=error.message;workspaceReady=false;render();throw error}
}
async function refreshSignedInWorkspace(){workspaceReady=false;accountFailure='';render();try{const {data,error}=await getCarrotClient().auth.getUser();if(error||!data.user)throw Error('Please sign in again.');await loadAccountWorkspace(data.user);workspaceReady=true;render()}catch(error){accountFailure=error.message;render()}}
async function signOutDemo(force=false){
 if(!force&&saveGeneration>savedGeneration){openModal('Save before signing out',`<p class="subtitle">Your latest changes have not been saved yet.</p><div class="capture-actions"><button class="btn primary" onclick="saveAndSignOut()">Save & sign out</button><button class="btn" onclick="closeModal()">Stay signed in</button></div>`);return}
 const {error}=await getCarrotClient().auth.signOut();if(error)return toast('Sign out failed. Please retry.');accountLoad++;cartisSession=null;workspaceReady=false;clearWorkspaceMemory();authReady=true;closeModal();location.hash='login';render();
}
async function saveAndSignOut(){try{await flushWorkspaceSave();await signOutDemo(true)}catch{toast('Your changes could not be saved. You are still signed in.')}}
async function startCarrot(){
 authReady=false;workspaceReady=false;accountFailure='';render();
 try{
  const client=getCarrotClient();
  if(!authSubscription){authSubscription=client.auth.onAuthStateChange((event,session)=>{setTimeout(async()=>{
   if(event==='SIGNED_OUT'){accountLoad++;cartisSession=null;workspaceReady=false;clearWorkspaceMemory();authReady=true;location.hash='login';render()}
   if(event==='PASSWORD_RECOVERY'){if(session){await acceptAccount(session.user);location.hash='reset';render()}}
   if(event==='SIGNED_IN'&&session&&cartisSession?.id!==session.user.id)acceptAccount(session.user).catch(()=>{});
  },0)}).data.subscription}
  const {data,error}=await client.auth.getUser();authReady=true;
  if(data.user&&!error){await acceptAccount(data.user)}else{cartisSession=null;clearWorkspaceMemory();render()}
 }catch(error){authReady=false;accountFailure=error.message;render()}
}
