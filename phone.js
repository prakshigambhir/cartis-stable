// Installation is offered only when the browser supports it.
let cartisInstallPrompt=null;
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();cartisInstallPrompt=event});
window.addEventListener('appinstalled',()=>{cartisInstallPrompt=null;toast('Carrot added to your device')});
if('serviceWorker' in navigator&&window.isSecureContext){window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}))}
function phoneHelp(){openModal('Carrot on your phone',`<p class="subtitle">Open the published Carrot link on your phone, then add it to your home screen.</p><div class="note spaced">iPhone: open in Safari, tap Share, then Add to Home Screen.<br><br>Android: open in Chrome, tap the menu, then Install app or Add to Home screen.</div>${cartisInstallPrompt?'<button class="btn primary spaced" onclick="installCarrot()">Install Carrot</button>':''}<p class="subtitle spaced">Camera access needs HTTPS and your permission. The local preview address only works on this computer. Sign in with the same account to access your saved stable on another device.</p>`)}
async function installCarrot(){if(!cartisInstallPrompt)return;const prompt=cartisInstallPrompt;cartisInstallPrompt=null;await prompt.prompt();await prompt.userChoice;closeModal()}
const phoneLink=document.createElement('button');phoneLink.textContent='Use on your phone';phoneLink.className='phone-help';phoneLink.onclick=phoneHelp;document.querySelector('.account-links').append(phoneLink);
