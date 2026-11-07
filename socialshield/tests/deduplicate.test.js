import {
  normaliseUsername,
  isValidUsername,
  buildProfileUrl,
  generateAccountId,
  deduplicateAccounts,
  deduplicateRelationships
} from '../graph/deduplicate.js';

export function runDeduplicateTests(test) {
  test('normaliseUsername handles plain username', (assert) => {
    assert.equal(normaliseUsername('john_doe'), 'john_doe');
    assert.equal(normaliseUsername('  john_doe  '), 'john_doe');
    assert.equal(normaliseUsername('JOHN_DOE'), 'john_doe');
  });

  test('normaliseUsername strips leading @', (assert) => {
    assert.equal(normaliseUsername('@john_doe'), 'john_doe');
    assert.equal(normaliseUsername('@@john_doe'), 'john_doe');
  });

  test('normaliseUsername parses instagram profile URLs', (assert) => {
    assert.equal(normaliseUsername('https://www.instagram.com/john_doe/'), 'john_doe');
    assert.equal(normaliseUsername('instagram.com/john_doe'), 'john_doe');
    assert.equal(normaliseUsername('http://instagram.com/john_doe/'), 'john_doe');
  });

  test('normaliseUsername rejects invalid usernames', (assert) => {
    assert.equal(normaliseUsername(''), null);
    assert.equal(normaliseUsername(null), null);
    assert.equal(normaliseUsername('a'.repeat(35)), null); // Instagram max length is 30
    assert.equal(normaliseUsername('john doe'), null); // spaces not allowed
    assert.equal(normaliseUsername('john!doe'), null); // special chars
  });

  test('isValidUsername validates correct handles', (assert) => {
    assert.equal(isValidUsername('valid.user_123'), true);
    assert.equal(isValidUsername('invalid user'), false);
  });

  test('buildProfileUrl builds correct URL', (assert) => {
    assert.equal(buildProfileUrl('john_doe'), 'https://www.instagram.com/john_doe/');
    assert.equal(buildProfileUrl(''), null);
  });

  test('generateAccountId creates consistent hash ID', (assert) => {
    const id1 = generateAccountId('john_doe');
    const id2 = generateAccountId('john_doe');
    const id3 = generateAccountId('jane_doe');
    assert.equal(id1, id2);
    assert.notEqual(id1, id3);
    assert.ok(id1.startsWith('ig_john_doe_'));
  });

  test('deduplicateAccounts merges evidence and removes duplicates', (assert) => {
    const accounts = [
      { username: 'john_doe', source: 'import1', evidence: ['ev1'] },
      { username: '@JOHN_DOE', source: 'import2', evidence: ['ev2'] },
      { username: 'https://instagram.com/john_doe/', source: 'import3', evidence: ['ev3'] },
      { username: 'jane_doe', source: 'import1', evidence: ['ev4'] }
    ];

    const result = deduplicateAccounts(accounts);
    assert.equal(result.accounts.length, 2);
    assert.equal(result.duplicatesRemoved, 2);

    const john = result.accounts.find(a => a.username === 'john_doe');
    assert.ok(john);
    assert.equal(john.evidence.length, 3);
  });

  test('deduplicateRelationships removes duplicate edges', (assert) => {
    const rels = [
      { from: 'u1', to: 'u2', type: 'follows' },
      { from: 'u1', to: 'u2', type: 'follows' },
      { from: 'u1', to: 'u2', type: 'followed_by' },
      { from: 'u2', to: 'u1', type: 'follows' }
    ];

    const result = deduplicateRelationships(rels);
    assert.equal(result.relationships.length, 3);
    assert.equal(result.duplicatesRemoved, 1);
  });
}

