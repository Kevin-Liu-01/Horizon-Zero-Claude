/**
 * The app's own three.js instance for page-context look gates (Vite rewrites
 * this bare import to the same pre-bundled module the game uses, so render
 * targets and materials made here are the renderer's own classes).
 */
export * from 'three';
