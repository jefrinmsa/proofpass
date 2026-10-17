import { chromium } from '@playwright/test';
import { copyFile } from 'node:fs/promises';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 640 },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<style>body{margin:0;background:#edf0f2;font:28px Arial;color:#142b3e}main{margin:30px;padding:35px;border:2px solid #142b3e;background:white}h1{font-size:36px;margin:0 0 10px}small{font-size:20px;color:#a02323}p{margin:25px 0}footer{font-size:20px;border-top:1px solid #ccd;padding-top:20px}</style><main><small>SYNTHETIC TEST CARD — NOT A REAL COLLEGE ID</small><h1>ProofPass Demonstration College</h1><p>Student: Sample Student One</p><p>ROLL NO: CSE2026001</p><p>EXPIRY: 2027-06-30</p><p>Department: Computer Science</p><footer>Educational fixture. Enrollment is checked against the sample roster and local test mailbox.</footer></main>`,
  );
  await page.screenshot({ path: 'fixtures/student-card.png' });
  for (const app of ['demo-a', 'demo-b'])
    await copyFile('fixtures/student-card.png', `apps/${app}/public/student-card.png`);
} finally {
  await browser.close();
}
