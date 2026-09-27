import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
await page.goto('http://127.0.0.1:3907', { waitUntil: 'domcontentloaded' });
// Craft a deterministic scenario: game over state where sheriff died at night
await page.evaluate(() => {
  localStorage.setItem('werewolf-appScreen', JSON.stringify('GAME'));
  localStorage.setItem('werewolf-isReplayMode', JSON.stringify(false));
  localStorage.setItem('werewolf-isTheaterMode', JSON.stringify(false));
  localStorage.setItem('werewolf-currentPhase', JSON.stringify('GAME_REVIEW'));
  localStorage.setItem('werewolf-currentTurn', JSON.stringify('4'));
  localStorage.setItem('werewolf-currentGodState', JSON.stringify({ sheriffId: null }));
  localStorage.setItem('werewolf-currentPlayers', JSON.stringify([]));
  localStorage.setItem('werewolf-currentLogs', JSON.stringify([]));
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
await browser.close();
console.log('done');
