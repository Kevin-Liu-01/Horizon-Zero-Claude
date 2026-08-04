import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const file = process.argv[2];
const doc = await io.read(file);
const root = doc.getRoot();

console.log(`\n===== ${file} =====`);

// Node hierarchy (depth-limited)
function walk(node, depth, maxDepth = 6) {
  if (depth > maxDepth) return;
  const mesh = node.getMesh() ? ' [MESH]' : '';
  const skin = node.getSkin() ? ' [SKIN]' : '';
  const t = node.getTranslation().map((v) => v.toFixed(2));
  console.log(`${'  '.repeat(depth)}${node.getName() || '(unnamed)'}${mesh}${skin} t=(${t})`);
  for (const child of node.listChildren()) walk(child, depth + 1, maxDepth);
}
for (const scene of root.listScenes()) {
  for (const node of scene.listChildren()) walk(node, 0);
}

// Skins / joints
for (const skin of root.listSkins()) {
  const joints = skin.listJoints().map((j) => j.getName());
  console.log(`\nSKIN "${skin.getName()}": ${joints.length} joints`);
  console.log(joints.join(', '));
}
