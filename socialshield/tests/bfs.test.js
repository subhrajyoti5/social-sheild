import { GraphStore } from '../graph/graph-store.js';
import { bfs, analyseConnectivity } from '../graph/bfs.js';
import { generateAccountId } from '../graph/deduplicate.js';

export function runBfsTests(test) {
  function createTestGraph() {
    const graph = new GraphStore();
    const users = ['alice', 'bob', 'charlie', 'david', 'eve', 'frank', 'grace'];

    for (const u of users) {
      graph.addNode({
        id: generateAccountId(u),
        username: u,
        profileUrl: `https://www.instagram.com/${u}/`,
        status: 'pending_review'
      });
    }

    // Alice -> Bob (follows)
    // Bob -> Charlie (follows)
    // Charlie -> David (follows)
    // David -> Eve (follows)
    // Alice <-> Frank (mutual)
    // Grace is isolated
    const id = generateAccountId;
    graph.addEdge(id('alice'), id('bob'), 'follows', 'test');
    graph.addEdge(id('bob'), id('charlie'), 'follows', 'test');
    graph.addEdge(id('charlie'), id('david'), 'follows', 'test');
    graph.addEdge(id('david'), id('eve'), 'follows', 'test');
    graph.addEdge(id('alice'), id('frank'), 'mutual', 'test');

    return graph;
  }

  test('BFS traversal traverses connected nodes correctly', (assert) => {
    const graph = createTestGraph();
    const result = bfs(graph, 'alice', { maxDepth: 3 });

    assert.equal(result.success, true);
    assert.equal(result.startAccount.username, 'alice');
    // Degree 1: bob, frank
    // Degree 2: charlie
    // Degree 3: david
    // Total discovered: 4
    assert.equal(result.stats.total, 4);
    assert.equal(result.stats.byDegree[1], 2);
    assert.equal(result.stats.byDegree[2], 1);
    assert.equal(result.stats.byDegree[3], 1);
  });

  test('Three-degree maximum depth strictly limits expansion', (assert) => {
    const graph = createTestGraph();
    // Eve is at degree 4, should NOT be discovered when maxDepth = 3
    const result = bfs(graph, 'alice', { maxDepth: 3 });
    const usernames = result.accounts.map(a => a.username);

    assert.ok(usernames.includes('bob'));
    assert.ok(usernames.includes('charlie'));
    assert.ok(usernames.includes('david'));
    assert.ok(!usernames.includes('eve')); // Degree 4 excluded
  });

  test('Depth limit 1 and 2 work properly', (assert) => {
    const graph = createTestGraph();
    const d1 = bfs(graph, 'alice', { maxDepth: 1 });
    assert.equal(d1.stats.total, 2); // bob, frank

    const d2 = bfs(graph, 'alice', { maxDepth: 2 });
    assert.equal(d2.stats.total, 3); // bob, frank, charlie
  });

  test('Cycle detection avoids infinite loops', (assert) => {
    const graph = new GraphStore();
    const id = generateAccountId;
    for (const u of ['u1', 'u2', 'u3']) {
      graph.addNode({ id: id(u), username: u });
    }
    // Create cycle: u1 -> u2 -> u3 -> u1
    graph.addEdge(id('u1'), id('u2'), 'follows');
    graph.addEdge(id('u2'), id('u3'), 'follows');
    graph.addEdge(id('u3'), id('u1'), 'follows');

    const result = bfs(graph, 'u1', { maxDepth: 3 });
    assert.equal(result.success, true);
    assert.equal(result.stats.total, 2); // u2, u3 (u1 is start, not duplicated)
  });

  test('Relationship direction is properly preserved', (assert) => {
    const graph = new GraphStore();
    const id = generateAccountId;
    graph.addNode({ id: id('source'), username: 'source' });
    graph.addNode({ id: id('target'), username: 'target' });

    graph.addEdge(id('source'), id('target'), 'follows');

    const outNeighbors = graph.getOutNeighbors(id('source'));
    const inNeighbors = graph.getInNeighbors(id('source'));

    assert.equal(outNeighbors.length, 1);
    assert.equal(inNeighbors.length, 0);

    const targetIn = graph.getInNeighbors(id('target'));
    assert.equal(targetIn.length, 1);
    assert.equal(targetIn[0].relationship.type, 'follows');
  });

  test('Missing relationship data reporting', (assert) => {
    const graph = new GraphStore();
    // Search in empty graph
    const emptyResult = bfs(graph, 'nobody', { maxDepth: 3 });
    assert.equal(emptyResult.success, false);
    assert.ok(emptyResult.error.includes('not found'));

    // Node exists but has 0 relationships
    graph.addNode({ id: generateAccountId('isolated'), username: 'isolated' });
    const analysis = analyseConnectivity(graph, 'isolated');
    assert.equal(analysis.totalConnected, 0);
    assert.ok(analysis.missingData.includes('No connections found'));
  });

  test('Exclusion rules skip excluded IDs in BFS', (assert) => {
    const graph = createTestGraph();
    const bobId = generateAccountId('bob');
    const excluded = new Set([bobId]);

    const result = bfs(graph, 'alice', { maxDepth: 3, excludedIds: excluded });
    const usernames = result.accounts.map(a => a.username);

    assert.ok(!usernames.includes('bob'));
    // Since bob is excluded, charlie and david shouldn't be reached through bob
    assert.ok(!usernames.includes('charlie'));
    assert.ok(!usernames.includes('david'));
    assert.ok(usernames.includes('frank')); // reached via direct mutual
  });

  test('Large graph performance: 10,000 nodes BFS completes quickly', (assert) => {
    const graph = new GraphStore();
    const N = 10000;
    const t0 = Date.now();

    // Create 10,000 nodes and linear chain with branches
    for (let i = 0; i < N; i++) {
      graph.addNode({ id: `user_${i}`, username: `user_${i}` });
    }
    // Connect in a tree-like structure from user_0
    for (let i = 1; i <= 50; i++) {
      graph.addEdge('user_0', `user_${i}`, 'follows');
      for (let j = 1; j <= 20; j++) {
        const childId = `user_${50 + (i - 1) * 20 + j}`;
        graph.addEdge(`user_${i}`, childId, 'follows');
      }
    }

    const buildTime = Date.now() - t0;
    assert.ok(buildTime < 2000, `Graph build took ${buildTime}ms`);

    const bfsStart = Date.now();
    const result = bfs(graph, 'user_0', { maxDepth: 3 });
    const bfsTime = Date.now() - bfsStart;

    assert.equal(result.success, true);
    assert.ok(result.stats.total > 1000);
    assert.ok(bfsTime < 500, `BFS took ${bfsTime}ms, expected < 500ms`);
  });
}

