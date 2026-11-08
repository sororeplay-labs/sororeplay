import assert from 'node:assert/strict';
import { replay } from '../src/index.js';
import { fixture, expected } from '../examples/make-fixture.js';
import good from '../examples/credit-handler.js';
import broken from '../examples/broken-handler.js';

const healthy = await replay(fixture, good, expected, { profiles: ['canonical', 'duplicate', 'reverse'] });
assert.equal(healthy.failed, 0);
const defect = await replay(fixture, broken, expected);
assert.equal(defect.results.find(r => r.profile === 'canonical').passed, true);
assert.equal(defect.results.find(r => r.profile === 'duplicate').passed, false);
console.log('SYNTHETIC OFFLINE demo: good handler passes all 3 profiles; deliberately broken handler fails duplicate replay.');
