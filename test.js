import assert from 'node:assert';
import {
  isInstagramUrl,
  extractShortcode,
  isInstagramPostUrl,
  shortcodeToMediaId,
  parseNetscapeCookies,
} from './src/instagram.js';

// Test 1: URL validation and shortcode extraction
assert.strictEqual(isInstagramUrl('https://www.instagram.com/p/DF7-mQ_y_tq/'), true);
assert.strictEqual(isInstagramUrl('https://example.com/p/123/'), false);
assert.strictEqual(extractShortcode('https://www.instagram.com/p/DF7-mQ_y_tq/'), 'DF7-mQ_y_tq');
assert.strictEqual(extractShortcode('https://www.instagram.com/reel/C1234567890/'), 'C1234567890');
assert.strictEqual(isInstagramPostUrl('https://www.instagram.com/p/DF7-mQ_y_tq/'), true);
assert.strictEqual(isInstagramPostUrl('https://www.instagram.com/explore/'), false);

// Test 2: Base64 shortcode to numeric mediaId conversion
// Single char 'B' (index 1) -> 1
assert.strictEqual(shortcodeToMediaId('B'), '1');
// 'BA' (1 * 64 + 0) -> 64
assert.strictEqual(shortcodeToMediaId('BA'), '64');
// 'BBA' (1 * 4096 + 1 * 64 + 0) -> 4160
assert.strictEqual(shortcodeToMediaId('BBA'), '4160');

// Test 3: Cookie parsing
const netscapeMock = `# Netscape HTTP Cookie File
.instagram.com\tTRUE\t/\tTRUE\t1790000000\tsessionid\t123456%3Aabcd
.instagram.com\tTRUE\t/\tTRUE\t1790000000\tcsrftoken\ttoken_xyz
`;
const parsed = parseNetscapeCookies(netscapeMock);
assert(parsed.includes('sessionid=123456%3Aabcd'), 'Must contain sessionid');
assert(parsed.includes('csrftoken=token_xyz'), 'Must contain csrftoken');

console.log('All tests passed successfully.');
