import { useSyncExternalStore } from 'react';
import { KnowledgeGraph } from './graph.js';
import { seedBase, seedDemoFamily, migrateLegacyKnowledge } from './seed.js';

const storage = typeof window !== 'undefined' ? window.localStorage : undefined;

export const graph = new KnowledgeGraph({ storage, storageKey: 'family-dashboard.kg.v1' });

graph.batch(() => {
  seedBase(graph);
  if (graph.restore()) migrateLegacyKnowledge(graph);
  else seedDemoFamily(graph);
});

/** Resets all conversation-created knowledge back to the example family. */
export function resetKnowledge({ withDemo = true } = {}) {
  graph.reset();
  graph.batch(() => {
    seedBase(graph);
    if (withDemo) seedDemoFamily(graph);
    graph.dirty = true;
  });
}

/** Subscribes a component to graph changes and returns the graph. */
export function useGraph() {
  useSyncExternalStore(graph.subscribe, graph.getVersion, graph.getVersion);
  return graph;
}
