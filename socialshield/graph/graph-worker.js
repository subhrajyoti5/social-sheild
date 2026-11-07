/**
 * SocialShield — Graph Web Worker
 * Offloads BFS traversal and large dataset parsing off the UI main thread.
 */

import { GraphStore } from './graph-store.js';
import { bfs } from './bfs.js';
import { normaliseUsername } from './deduplicate.js';

let workerGraph = new GraphStore();

self.onmessage = function (e) {
  const { type, payload, id } = e.data;

  switch (type) {
    case 'LOAD_GRAPH': {
      const { accounts, relationships } = payload;
      workerGraph.clear();
      for (const a of accounts) workerGraph.addNode(a);
      for (const r of relationships) workerGraph.addEdge(r.from, r.to, r.type, r.source);
      self.postMessage({ id, type: 'LOAD_GRAPH_SUCCESS', payload: workerGraph.getStats() });
      break;
    }

    case 'RUN_BFS': {
      const { startUsername, maxDepth, excludedIds } = payload;
      const excluded = new Set(excludedIds || []);
      const result = bfs(workerGraph, startUsername, {
        maxDepth: maxDepth || 3,
        excludedIds: excluded,
        onProgress: (progress) => {
          self.postMessage({ id, type: 'BFS_PROGRESS', payload: progress });
        }
      });
      self.postMessage({ id, type: 'BFS_COMPLETE', payload: result });
      break;
    }

    case 'CLEAR_GRAPH': {
      workerGraph.clear();
      self.postMessage({ id, type: 'CLEAR_GRAPH_SUCCESS' });
      break;
    }

    default:
      self.postMessage({ id, type: 'ERROR', error: `Unknown worker message type: ${type}` });
  }
};

