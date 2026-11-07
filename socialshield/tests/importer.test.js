import { parseCSV, parseCSVLine, detectColumnMapping } from '../importer/csv-importer.js';
import { detectFormat } from '../importer/json-importer.js';
import { parseRelationship, parseInstagramExport } from '../graph/relationship-parser.js';

export function runImporterTests(test) {
  test('parseCSVLine handles standard, spaces, and quoted values', (assert) => {
    assert.deepEqual(parseCSVLine('a,b,c'), ['a', 'b', 'c']);
    assert.deepEqual(parseCSVLine('"hello, world",b,"c"'), ['hello, world', 'b', 'c']);
    assert.deepEqual(parseCSVLine('a,"quote ""inside""",c'), ['a', 'quote "inside"', 'c']);
  });

  test('parseCSV parses multiple rows into objects', (assert) => {
    const csv = 'from,to,type\nalice,bob,follows\ncharlie,david,followed_by';
    const parsed = parseCSV(csv);

    assert.equal(parsed.rows.length, 2);
    assert.equal(parsed.rows[0].from, 'alice');
    assert.equal(parsed.rows[0].to, 'bob');
    assert.equal(parsed.rows[0].type, 'follows');
  });

  test('detectColumnMapping recognizes different headers', (assert) => {
    const m1 = detectColumnMapping(['from', 'to', 'type']);
    assert.equal(m1.from, 'from');
    assert.equal(m1.to, 'to');
    assert.equal(m1.type, 'type');

    const m2 = detectColumnMapping(['source_user', 'target_user']);
    assert.equal(m2.from, 'source_user');
    assert.equal(m2.to, 'target_user');

    const m3 = detectColumnMapping(['username']);
    assert.equal(m3.singleColumn, 'username');
  });

  test('detectFormat detects various JSON schemas', (assert) => {
    assert.equal(detectFormat([{ from: 'a', to: 'b' }]), 'relationship_list');
    assert.equal(detectFormat([{ username: 'a' }]), 'account_list');
    assert.equal(detectFormat({ accounts: [], relationships: [] }), 'socialshield_export');
    assert.equal(detectFormat({ relationships_followers: [] }), 'instagram_export');
    assert.equal(detectFormat({ followers: ['a'], following: ['b'] }), 'follower_following_lists');
    assert.equal(detectFormat({ invalid: true }), 'unknown');
  });

  test('parseRelationship validates and normalises records', (assert) => {
    const valid = parseRelationship({ from: '@User_One', to: 'user_two', type: 'follows' });
    assert.equal(valid.valid, true);
    assert.equal(valid.relationship.fromUsername, 'user_one');
    assert.equal(valid.relationship.toUsername, 'user_two');
    assert.equal(valid.relationship.type, 'follows');

    // Self-relationship should be rejected
    const selfRel = parseRelationship({ from: 'user_one', to: 'user_one' });
    assert.equal(selfRel.valid, false);
    assert.equal(selfRel.error, 'Self-relationship');

    // Invalid usernames
    const invalidUser = parseRelationship({ from: 'invalid user with spaces', to: 'valid' });
    assert.equal(invalidUser.valid, false);
  });

  test('parseInstagramExport parses official Instagram export data', (assert) => {
    const sampleExport = {
      relationships_followers: [
        {
          string_list_data: [
            { href: 'https://www.instagram.com/follower_one', value: 'follower_one' }
          ]
        }
      ],
      relationships_following: [
        {
          string_list_data: [
            { href: 'https://www.instagram.com/following_one', value: 'following_one' }
          ]
        }
      ]
    };

    const parsed = parseInstagramExport(sampleExport, 'my_account');
    assert.equal(parsed.relationships.length, 2);

    const followerRel = parsed.relationships.find(r => r.type === 'followed_by');
    assert.ok(followerRel);
    assert.equal(followerRel.fromUsername, 'follower_one');
    assert.equal(followerRel.toUsername, 'my_account');

    const followingRel = parsed.relationships.find(r => r.type === 'follows');
    assert.ok(followingRel);
    assert.equal(followingRel.fromUsername, 'my_account');
    assert.equal(followingRel.toUsername, 'following_one');
  });
}

