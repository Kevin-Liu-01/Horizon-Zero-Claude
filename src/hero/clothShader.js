/**
 * CALIMA · the outfit's cloth shading (armory W1; bible §9.2 "grounded stylised
 * PBR"; plan §4.1: one material per set).
 *
 * A set atlas is 1024² over ~1.6 m² of cloth: enough for seams, dye and wear, not
 * for the weave. The ORM atlas's unused R channel says what the texel IS (0 none,
 * 0.33 leather grain, 0.66 wool knit, 1 linen weave); this hook adds, for those
 * texels only:
 *   - a tiling detail normal (one small shared RG/BA tile: weave, grain) that fades
 *     with distance, so a close-up resolves threads and a long shot stays clean
 *   - a little micro-albedo from the same tile (threads catch light)
 *   - a soft cloth rim (fuzz at grazing angles), scaled by the light that is there
 *   - optional per-vertex salt crust (`_salt`, Pan Whites III), broken up by the tile
 * and the optional `_piece` mask (the hat's two hidden meshes, Pan Whites II).
 *
 * The hook sits on `material.userData.vertexHook`, which the Player's fade clone
 * composes (src/entities/player.js `_collectMaterials`). One shared detail texture;
 * `disposeClothDetail()` frees it (HeroRig.dispose).
 */
import * as THREE from 'three';

const TILE = 128;
let detailTex = null;
let users = 0;

function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }

/** RG = weave height slope, BA = grain slope. Deterministic, tiles. */
function buildDetail() {
  const data = new Uint8Array(TILE * TILE * 4);
  const THREADS = 16;                 // threads per tile, both ways
  const weave = new Float32Array(TILE * TILE), grain = new Float32Array(TILE * TILE);
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const u = (x / TILE) * THREADS, v = (y / TILE) * THREADS;
    const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
    const warpOver = ((iu + iv) & 1) === 0;
    const warp = Math.sin(fu * Math.PI), weft = Math.sin(fv * Math.PI);
    const jit = 0.82 + 0.36 * hash(warpOver ? iu : iv, warpOver ? 3 : 7);
    weave[y * TILE + x] = (warpOver ? warp : weft) * (0.55 + 0.45 * (warpOver ? weft : warp)) * jit;
    // grain: a few octaves of wrapped lattice noise
    let g = 0, a = 1, f = 8;
    for (let o = 0; o < 3; o++) {
      const gx = (x / TILE) * f, gy = (y / TILE) * f, ix = Math.floor(gx), iy = Math.floor(gy), rx = gx - ix, ry = gy - iy;
      const sx = rx * rx * (3 - 2 * rx), sy = ry * ry * (3 - 2 * ry);
      const n00 = hash(ix % f, iy % f), n10 = hash((ix + 1) % f, iy % f), n01 = hash(ix % f, (iy + 1) % f), n11 = hash((ix + 1) % f, (iy + 1) % f);
      g += a * ((n00 * (1 - sx) + n10 * sx) * (1 - sy) + (n01 * (1 - sx) + n11 * sx) * sy);
      a *= 0.55; f *= 2;
    }
    grain[y * TILE + x] = g;
  }
  const put = (src, x, y) => src[((y + TILE) % TILE) * TILE + ((x + TILE) % TILE)];
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    const o = (y * TILE + x) * 4;
    data[o] = Math.max(0, Math.min(255, 128 + (put(weave, x - 1, y) - put(weave, x + 1, y)) * 150));
    data[o + 1] = Math.max(0, Math.min(255, 128 + (put(weave, x, y - 1) - put(weave, x, y + 1)) * 150));
    data[o + 2] = Math.max(0, Math.min(255, 128 + (put(grain, x - 1, y) - put(grain, x + 1, y)) * 300));
    data[o + 3] = Math.max(0, Math.min(255, 128 + (put(grain, x, y - 1) - put(grain, x, y + 1)) * 300));
  }
  const t = new THREE.DataTexture(data, TILE, TILE, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.name = 'hero-cloth-detail';
  t.needsUpdate = true;
  return t;
}

/** Install the hook on an outfit's (source) material, once. `rep`: tiles per atlas uv. Returns the piece uniform. */
export function installCloth(material, { rep = 48, pieces = false, salt = false } = {}) {
  if (material.userData.clothU) return material.userData.clothU;
  if (!detailTex) detailTex = buildDetail();
  users++;
  const U = {
    uDetail: { value: detailTex }, uDetailRep: { value: rep }, uSalt: { value: new THREE.Color(0xedeae2) },
    uHidePiece: { value: 0 },
  };
  // not enumerable: Material.clone() JSON-copies userData, and this holds a Texture
  Object.defineProperty(material.userData, 'clothU', { value: U, enumerable: false, writable: true, configurable: true });
  const key = `hero-cloth${pieces ? '-p' : ''}${salt ? '-s' : ''}`;
  material.userData.cacheKey = key;
  material.userData.vertexHook = (shader) => {
    Object.assign(shader.uniforms, U);
    let v = shader.vertexShader;
    let head = '#include <common>\nvarying vec3 vClothView;';
    if (salt) head += '\nattribute float _salt;\nvarying float vSaltV;';
    if (pieces) head += '\nattribute float _piece;\nuniform float uHidePiece;';
    v = v.replace('#include <common>', head);
    let begin = '#include <begin_vertex>';
    if (salt) begin += '\n  vSaltV = _salt;';
    if (pieces) begin += '\n  if ( ( int( _piece + 0.5 ) & int( uHidePiece + 0.5 ) ) != 0 ) transformed = vec3( 0.0 );';
    v = v.replace('#include <begin_vertex>', begin);
    v = v.replace('#include <project_vertex>', '#include <project_vertex>\n  vClothView = -mvPosition.xyz;');
    shader.vertexShader = v;
    let f = shader.fragmentShader;
    f = f.replace('#include <common>', `#include <common>
uniform sampler2D uDetail; uniform float uDetailRep; uniform vec3 uSalt;
varying vec3 vClothView;${salt ? '\nvarying float vSaltV;' : ''}
float clothK = 0.0; float clothCav = 0.0; float saltK = 0.0;`);
    // what the texel is (ORM.r), the tile, and the normal
    f = f.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  {
    float cls = texture2D( roughnessMap, vRoughnessMapUv ).r;
    float dist = length( vClothView );
    float fadeD = 1.0 - smoothstep( 2.2, 7.5, dist );
    vec4 tile = texture2D( uDetail, vNormalMapUv * uDetailRep );
    vec4 tileG = texture2D( uDetail, vNormalMapUv * uDetailRep * 0.61 );
    float weaveW = smoothstep( 0.45, 0.8, cls );
    float grainW = smoothstep( 0.12, 0.3, cls ) * ( 1.0 - weaveW );
    vec2 d = ( tile.rg - 0.5 ) * 2.0 * weaveW * 0.95 + ( tileG.ba - 0.5 ) * 2.0 * grainW * 0.14;
    d *= fadeD;
    clothCav = ( d.x + d.y ) * 0.5;
    clothK = max( weaveW, grainW * 0.35 ) ;
    normal = normalize( normal + tbn[ 0 ] * d.x + tbn[ 1 ] * d.y );${salt ? `
    float noiseS = tileG.b * 0.6 + tile.a * 0.4;
    saltK = smoothstep( 0.46, 0.60, vSaltV + ( noiseS - 0.5 ) * 0.42 );
    normal = normalize( normal + ( tbn[ 0 ] * ( tileG.b - 0.5 ) + tbn[ 1 ] * ( tileG.a - 0.5 ) ) * saltK * 1.6 );` : ''}
  }`);
    f = f.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix( roughnessFactor, 0.97, saltK );`);
    // threads catch the light, salt dries white; applied where the albedo is final
    f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  diffuseColor.rgb *= 1.0 + clothCav * 0.55;
  diffuseColor.rgb = mix( diffuseColor.rgb, uSalt, saltK * 0.92 );`);
    // the rim: cloth is fuzz at grazing angles, as bright as the light on it
    f = f.replace('#include <opaque_fragment>', `{
    float nv = saturate( dot( normal, normalize( vClothView ) ) );
    float rim = pow( 1.0 - nv, 3.2 ) * clothK;
    vec3 lit = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
    outgoingLight += lit * rim * 0.55;
  }
#include <opaque_fragment>`);
    shader.fragmentShader = f;
  };
  material.onBeforeCompile = material.userData.vertexHook;
  material.customProgramCacheKey = () => key;
  material.needsUpdate = true;
  return U;
}

/** Free the tile (HeroRig.dispose: nothing on her uses it any more). */
export function disposeClothDetail() {
  if (detailTex) { detailTex.dispose(); detailTex = null; }
  users = 0;
}
