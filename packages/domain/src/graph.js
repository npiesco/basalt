export function buildGraphData({ notes = [], backlinks = [] } = {}) {
  const nodeMap = new Map();
  for (const note of notes) {
    if (!note?.noteId) continue;
    const id = note.noteId;
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        label: note.title ?? note.noteId,
      });
    }
  }

  const edgeMap = new Map();
  for (const backlink of backlinks) {
    const source = backlink?.sourceNoteId;
    const target = backlink?.targetNoteId;
    if (!nodeMap.has(source) || !nodeMap.has(target)) continue;

    const edgeId = `${source}->${target}`;
    if (!edgeMap.has(edgeId)) {
      edgeMap.set(edgeId, {
        id: edgeId,
        source,
        target,
        weight: 1,
      });
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}
