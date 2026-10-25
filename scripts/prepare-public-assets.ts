import { prepareAssets } from './public-assets';
const app = process.argv[2];
if (app !== 'demo-a' && app !== 'demo-b') throw new Error('Specify demo-a or demo-b');
await prepareAssets(app, process.env.ARTIFACT_BASE_URL);
console.log('Verified public proving and OCR assets; copied sample card.');
