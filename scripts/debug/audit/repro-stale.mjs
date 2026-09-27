// Reproduce: settlement screen shows a sheriff badge that was already announced as lost.
import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.goto('http://127.0.0.1:3907', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  localStorage.setItem('werewolf-llmProviders', JSON.stringify([{ id:'p', name:'M', type:'openai', baseUrl:'http://127.0.0.1:19000', apiKey:'' }]));
  localStorage.setItem('werewolf-llmPresets', JSON.stringify([{ id:'l', name:'M', providerId:'p', modelId:'m' }]));
  const a = JSON.parse(localStorage.getItem('werewolf-actorProfiles-v2')||'[]');
  localStorage.setItem('werewolf-actorProfiles-v2', JSON.stringify(a.map(x=>({...x, llmPresetId:'l'}))));
  localStorage.setItem('werewolf-globalApiConfig', JSON.stringify({enabled:false, narratorActorId:'n1'}));
  const c = JSON.parse(localStorage.getItem('werewolf-uiConfig')||'{}'); c.gameViewMode='2d';
  localStorage.setItem('werewolf-uiConfig', JSON.stringify(c));
  localStorage.setItem('werewolf-debugMode','true');
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: /联机服务器/ }).count(); // noop
const cards = page.locator('button').filter({ hasText: /狼人×/ });
await cards.nth(16).click();   // 12p miracle merchant board
await page.waitForTimeout(300);
await page.getByRole('button', { name: /点燃营火/ }).click();
await page.waitForTimeout(2000);
const t0=Date.now(); let last=0,still=0;
while(Date.now()-t0 < 260000){
  const st = await page.evaluate(()=>({p:localStorage.getItem('werewolf-currentPhase'),n:(JSON.parse(localStorage.getItem('werewolf-currentLogs')||'[]')).length}));
  if(st.n===last) still++; else {still=0;last=st.n;}
  if(still>60){console.log('STAGNANT',JSON.stringify(st));break;}
  if(/GAME_REVIEW|GAME_OVER/.test(String(st.p))){console.log('OVER',JSON.stringify(st));break;}
  await page.waitForTimeout(2000);
}
const out = await page.evaluate(()=>{
  const logs=JSON.parse(localStorage.getItem('werewolf-currentLogs')||'[]');
  const gs=JSON.parse(localStorage.getItem('werewolf-currentGodState')||'{}');
  const settlement = logs.filter(l=>l.phase==='GAME_REVIEW' && l.isSystem).map(l=>l.content).join('\n');
  const badgeLossAnnouncements = logs.filter(l=>/警徽流失|警徽传给/.test(l.content)).map(l=>`T${l.turn}: ${l.content}`);
  return { liveGodStateSheriff: gs.sheriffId, settlement, badgeLossAnnouncements };
});
console.log('FINAL live godState.sheriffId =', out.liveGodStateSheriff);
console.log('Badge announcements:', JSON.stringify(out.badgeLossAnnouncements, null, 1));
console.log('--- settlement text ---');
console.log(out.settlement.split('\n').slice(0, 8).join('\n'));
await browser.close();
