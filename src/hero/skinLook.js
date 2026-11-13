/**
 * CALIMA · skin light for Brea (and near-tier NPC skins): ROUND5-LOOK C-01, C-02, C-03 and C-04's skin rim
 * (character-art, W1 exit, by grant on src/hero/**).
 *
 *   applySkinLook(material, { tier }) -> material      (idempotent; marks material.userData.calSkin = 1)
 *   skinLookUniforms(material) -> { calSkinK, calThinK, calWrap, calEdgeKeep, calLobeK, calDetailK, calSkyK, calWinK, calFlat } | null
 *                                  (shared uniform objects; gates switch terms off with them)
 *   applyClothLook(material, { rim, velvet }) -> material   (C-04 for cloth, hair, leather)
 *   disposeSkinLook()                                    (frees the shared micro-normal tile; also freed with the last skin)
 *
 * A shader patch on the skin's own MeshStandardMaterial: no new draw, no per-frame work. The sun's direct term becomes:
 *   - C-01: a per-channel WRAPPED Lambert, w = (0.35, 0.20, 0.14) (fix round 3: was LOOK's 0.50 / 0.24 / 0.16, which held the
 *     shadow cheek at the top of A-skin-scatter (a), its lit:shadow on the floor of (b) and its chroma at 40 against the key-art
 *     panels' 22; chosen off a live sweep of wrap x fill, D-skin-sweep): past the terminator red light still
 *     arrives, green less, blue hardly, so the shadow side of dark skin stays a warm red-brown with form and the terminator is soft;
 *   - the sun's shadow (the cascade's own factor, recovered as the ratio of the light's colour to its unshadowed colour) is
 *     faded in past N.L 0.25 so the shadow map's normal-bias seam does not print a hard edge along the terminator, and
 *     (fix round 3) part of it is KEPT below that, mix(mix(1, sh, keep), sh, smoothstep(-0.15, 0.25, N.L)), keep 0.6: a face
 *     turned from a back sun under her own nose or brow no longer catches the red wrap as a smear;
 *   - C-04's sun-rim, pow(1 - N.V, 3) x pow(L.-V x 0.5 + 0.5, 2) x sun x shadow x 0.55, inside the same term;
 *   - BACK-TRANSMISSION through the ears from the baked `_CALTHIN` vertex attribute (recipe lib/skin-human.mjs
 *     `bakeThinness`; 1 at <= 5 mm of tissue, 0 at >= 25 mm), tinted (1.0, 0.36, 0.20) x 0.6, seen when the sun is behind;
 *   - C-02: TWO GGX lobes, the second at x0.55 roughness and weight 0.15, under a cavity specular occlusion (AO^2 of the baked
 *     map), and the salt paste's specular x0.3 (its texels are the only ones bright enough to be paste: albedo luminance);
 *   - C-02: a 128^2 tiling micro-pore normal at UV x24 on the face (the `_CALZONE` x weight, x0.35), fading out from 1.5 to 3 m;
 *   - C-03: the cornea (`_CALZONE` y) at roughness 0.04 and the tear line (z) at 0.10, and two analytic SKY-WINDOW lobes on the
 *     cornea in the sky's hue, faded out with the sky's luminance (gone at night): the bright sky round the sun (the catch-light
 *     in the iris) and the horizon sky, Fresnel-weighted (the wet rim along the cornea's outline in profile).
 * Any other light (a point light, a lamp) keeps the stock Lambert. `_CALZONE` w marks the eyes (never paste, never flattened).
 *
 * The fade clone (src/entities/player.js `_collectMaterials`) owns the material's onBeforeCompile; this composes with whatever
 * is there (and with world-sky's CSM/fog wrapper, which composes the same way), and extends the program cache key.
 * R59 c: the emissive hero fill drops to x0.4 here (the scatter carries the shadow side); src/hero/index.js still scales
 * emissiveIntensity by the scene's ambient every frame.
 *
 * Tiers (LOOK §4.4): low = wrap only, one lobe, no transmission, no detail; medium = no detail normal; high, ultra = all.
 */
import { DataTexture, RepeatWrapping, LinearMipmapLinearFilter, LinearFilter, RGBAFormat, UnsignedByteType, Vector3, Vector4 } from 'three';

const TINT = '1.0, 0.36, 0.20';
const FILL = 0.4;

/** The shared 128^2 micro-pore normal tile (deterministic; built once, freed with the last skin that uses it). */
let micro = null, microRefs = 0;
function microTile() {
  if (micro) return micro;
  const N = 128, h = new Float32Array(N * N);
  // integer hash -> [0, 1): no Math.random, the same tile every run
  const hash = (x, y, s) => { let n = (x * 374761393 + y * 668265263 + s * 1442695041) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  // pores: one pit per ~6 x 6 texels (0.1 mm a texel on the face), jittered, of varied depth and size
  const C = 6;
  for (let gy = 0; gy < N / C; gy++) for (let gx = 0; gx < N / C; gx++) {
    if (hash(gx, gy, 5) < 0.18) continue;
    const cx = (gx + 0.15 + 0.7 * hash(gx, gy, 1)) * C, cy = (gy + 0.15 + 0.7 * hash(gx, gy, 2)) * C;
    const r = 0.9 + 1.1 * hash(gx, gy, 3), d = 0.55 + 0.45 * hash(gx, gy, 4);
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const px = Math.floor(cx) + x, py = Math.floor(cy) + y;
      const q = ((px - cx) ** 2 + (py - cy) ** 2) / (r * r);
      if (q > 4) continue;
      const i = ((py + N) % N) * N + ((px + N) % N);
      h[i] -= d * Math.exp(-q * 1.6);
    }
  }
  // fine tileable value noise (skin texture between the pores): two octaves on a wrapped lattice
  const vn = (x, y, P, s) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const v = (i, j) => hash(((i % P) + P) % P, ((j % P) + P) % P, s);
    return (v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx) * (1 - sy) + (v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx) * sy;
  };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) h[y * N + x] += 0.22 * (vn(x / 8, y / 8, 16, 7) - 0.5) + 0.12 * (vn(x / 4, y / 4, 32, 9) - 0.5);
  const d = new Uint8Array(N * N * 4), k = 1.6;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h[y * N + (x + 1) % N] - h[y * N + (x + N - 1) % N]) * k, dy = (h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x]) * k;
    const l = Math.hypot(dx, dy, 1), o = (y * N + x) * 4;
    d[o] = Math.round((-dx / l * 0.5 + 0.5) * 255); d[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255); d[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255); d[o + 3] = 255;
  }
  micro = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  micro.wrapS = micro.wrapT = RepeatWrapping;
  micro.magFilter = LinearFilter; micro.minFilter = LinearMipmapLinearFilter; micro.generateMipmaps = true;
  micro.name = 'calSkinMicro';
  micro.needsUpdate = true;
  return micro;
}
export function disposeSkinLook() {
  if (micro) { micro.dispose(); micro = null; }
  microRefs = 0;
}

const PARS_VERTEX = `
attribute float _calthin;
attribute vec4 _calzone;
varying float vCalThin;
varying vec4 vCalZone;`;

const PARS_FRAGMENT = `
varying float vCalThin;
varying vec4 vCalZone;
uniform float calSkinK;
uniform float calThinK;
uniform vec3 calWrap;
uniform float calEdgeKeep;
uniform float calLobeK;
uniform float calSkyK;
uniform float calWinK;
float calPasteG = 0.0;
float calAOG = 1.0;
void RE_Direct_CalSkin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float nl = dot( geometryNormal, directLight.direction );
	vec3 irradiance = saturate( nl ) * directLight.color;
	// LOOK C-02: two lobes (the second x0.55 roughness, weight 0.15), cavity specular occlusion AO^2, the paste's specular x0.3
	vec3 spec = BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	if ( calLobeK > 0.0 ) {
		PhysicalMaterial m2 = material;
		m2.roughness = max( material.roughness * 0.55, 0.0525 );
		spec = mix( spec, BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, m2 ), 0.15 * calLobeK );
	}
	spec *= calAOG * calAOG * mix( 1.0, 0.3, calPasteG );
	reflectedLight.directSpecular += irradiance * spec;
	vec3 diffuseIrr = irradiance;
	#if NUM_DIR_LIGHTS > 0
	if ( calSkinK > 0.0 && dot( directLight.direction, directionalLights[ 0 ].direction ) > 0.9995 ) {
		vec3 c0 = directionalLights[ 0 ].color;
		float l0 = c0.r + c0.g + c0.b;
		float sh = l0 > 1e-5 ? clamp( ( directLight.color.r + directLight.color.g + directLight.color.b ) / l0, 0.0, 1.0 ) : 1.0;
		vec3 w = calWrap * calSkinK;
		vec3 wnl = clamp( ( vec3( nl ) + w ) / ( 1.0 + w ), 0.0, 1.0 );
		// fix round 3: a part of the cast shadow is kept past the terminator too (keep 0.6), so a face turned from a back sun under
		// her own nose or brow does not take the red wrap as a smear; the fade still hides the normal-bias seam on the terminator
		float edge = mix( mix( 1.0, sh, calEdgeKeep ), sh, smoothstep( -0.15, 0.25, nl ) );
		diffuseIrr = c0 * wnl * edge;
		float back = saturate( dot( geometryViewDir, -directLight.direction ) );
		diffuseIrr += c0 * vec3( ${TINT} ) * ( 0.6 * calThinK * vCalThin * back * back ) * saturate( 0.35 - nl * 0.65 );
		// LOOK C-04 calRim (skin 0.55): a sun-rim at grazing view, strongest with the sun behind her, under the sun's own shadow
		float rimV = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
		float rimL = dot( directLight.direction, -geometryViewDir ) * 0.5 + 0.5;
		// (only where the sun grazes: the shadow map's normal bias leaves a face turned from the sun unshadowed, and a rim there
		// lit the whole cheek red in a back light)
		diffuseIrr += c0 * ( 0.55 * calSkinK * sh * rimV * rimV * rimV * rimL * rimL * PI * smoothstep( -0.45, 0.05, nl ) );
	}
	#endif
	reflectedLight.directDiffuse += diffuseIrr * BRDF_Lambert( material.diffuseColor );
}
#undef RE_Direct
#define RE_Direct RE_Direct_CalSkin`;

// after the base map: the paste flag (read off the true albedo), then the gate-only flat-albedo override (A-skin-spec)
const MAP_FRAGMENT = `
	calPasteG = smoothstep( 0.30, 0.48, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) ) * ( 1.0 - vCalZone.w );
	diffuseColor.rgb = mix( diffuseColor.rgb, calFlat.rgb, calFlat.a * ( 1.0 - vCalZone.w ) );`;
// the cornea and the tear line (C-03)
const ROUGH_FRAGMENT = `
	roughnessFactor = mix( roughnessFactor, 0.04, vCalZone.y );
	roughnessFactor = mix( roughnessFactor, 0.10, vCalZone.z );`;
// the micro-pore normal (C-02): face only, fading out from 1.5 to 3 m
const NORMAL_FRAGMENT = `
	#ifdef USE_NORMALMAP_TANGENTSPACE
	{
		float calDet = calDetailK * vCalZone.x * ( 1.0 - smoothstep( 1.5, 3.0, length( vViewPosition ) ) );
		if ( calDet > 0.001 ) {
			vec3 mn = texture2D( calMicro, vNormalMapUv * 24.0 ).xyz * 2.0 - 1.0;
			normal = normalize( normal + tbn * vec3( mn.xy * calDet, 0.0 ) );
		}
	}
	#endif`;
const PARS_FRAGMENT_EARLY = `
uniform float calDetailK;
uniform sampler2D calMicro;
uniform vec4 calFlat;`;
// the baked AO for the cavity specular occlusion, read before the lights run
const AO_EARLY = `
	#ifdef USE_AOMAP
	calAOG = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	#endif`;
// C-03: the sky lobes on the cornea, after the lights (an indirect specular term). The window's radiance is the sky's HUE at a fixed
// brightness, faded out with the sky's luminance (so it is gone at night, whatever the moon does): (A) the bright sky round the sun,
// raised to >= 15 deg, a broad glossy reflection: the catch-light in the iris; (B) the sky over the horizon, Fresnel-weighted: a faint
// sky in the eye face-on and a wet rim along the cornea's outline in profile
const SKY_FRAGMENT = `
	#if NUM_HEMI_LIGHTS > 0 && NUM_DIR_LIGHTS > 0
	if ( vCalZone.y > 0.01 && calSkyK + calWinK > 0.0 ) {
		vec3 calR = inverseTransformDirection( reflect( - geometryViewDir, geometryNormal ), viewMatrix );
		vec3 calSky = hemisphereLights[ 0 ].skyColor;
		float calSL = dot( calSky, vec3( 0.2126, 0.7152, 0.0722 ) );
		vec3 calHue = calSky / max( calSL, 1e-4 ) * smoothstep( 0.015, 0.06, calSL );
		float calNV = saturate( dot( geometryNormal, geometryViewDir ) );
		float calF = 0.025 + 0.975 * pow( 1.0 - calNV, 5.0 );
		float calBand = smoothstep( -0.08, 0.06, calR.y ) * ( 1.0 - smoothstep( 0.55, 0.9, calR.y ) );
		vec3 calSun = inverseTransformDirection( directionalLights[ 0 ].direction, viewMatrix );
		calSun.y = max( calSun.y, 0.26 ); calSun = normalize( calSun );
		float calWin = smoothstep( 0.90, 0.975, dot( calR, calSun ) );
		reflectedLight.indirectSpecular += min( calHue * ( calSkyK * calF * calBand + calWinK * calWin * ( 0.04 + calF ) ), vec3( 1.6 ) ) * vCalZone.y;
	}
	#endif`;

/** Patch a skin material once. `tier` (LOOK §4.4): 'low' wrap only, one lobe, no transmission or detail; 'medium' no detail. */
export function applySkinLook(material, { tier = 'high' } = {}) {
  if (!material || material.userData.calSkin === 1) return material;
  const low = tier === 'low', medium = tier === 'medium';
  const U = {
    calSkinK: { value: 1 }, calThinK: { value: low ? 0 : 1 },
    calWrap: { value: new Vector3(0.35, 0.20, 0.14) }, calEdgeKeep: { value: 0.6 },
    calLobeK: { value: low ? 0 : 1 }, calDetailK: { value: low || medium ? 0 : 0.35 }, calSkyK: { value: 3.0 }, calWinK: { value: 30 },
    calFlat: { value: new Vector4(0.2, 0.2, 0.2, 0) }, calMicro: { value: microTile() },
  };
  microRefs++;
  const prev = typeof material.onBeforeCompile === 'function' ? material.onBeforeCompile : null;
  const prevKey = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey.bind(material) : null;
  material.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${PARS_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCalThin = _calthin;\n\tvCalZone = _calzone;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${PARS_FRAGMENT_EARLY}`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>${PARS_FRAGMENT}`)
      .replace('#include <map_fragment>', `#include <map_fragment>${MAP_FRAGMENT}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>${ROUGH_FRAGMENT}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${NORMAL_FRAGMENT}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n\ttotalEmissiveRadiance = mix( totalEmissiveRadiance, emissive * calFlat.rgb, calFlat.a * ( 1.0 - vCalZone.w ) );`)
      .replace('#include <lights_fragment_begin>', `${AO_EARLY}\n#include <lights_fragment_begin>`)
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>${SKY_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|calSkin3`;
  material.userData.calSkin = 1;
  material.userData.calSkinU = U;
  // R59 c / LOOK C-01: the hero fill drops once the scatter carries the shadow side (x0.4; fix round 3, was x0.6, off the live sweep)
  if (material.emissive) material.emissive.multiplyScalar(FILL);
  const onDispose = () => {
    material.removeEventListener('dispose', onDispose);
    if (--microRefs <= 0) disposeSkinLook();
  };
  material.addEventListener('dispose', onDispose);
  material.needsUpdate = true;
  return material;
}

export function skinLookUniforms(material) {
  return material?.userData?.calSkinU ?? null;
}

/**
 * LOOK C-04 for cloth and hair (Brea's wrap + hair material here; armory's `clothShader.js` and the NPC kit include the same
 * chunk): the sun-rim `pow(1 - N.V, 3) x pow(L.-V x 0.5 + 0.5, 2) x sun x shadow x kRim` (wrap and hair 0.45, cloth 0.40,
 * leather 0.30) and, with `velvet`, a dyed cloth's velvet edge `albedo x 1.6 x pow(1 - N.V, 4) x wrapped N.L` (in place of
 * MeshPhysicalMaterial's sheen). Both ride the sun's own direct term, so they inherit its shadow. Idempotent; marks
 * material.userData.calCloth = 1.
 */
const CLOTH_FRAGMENT = (kRim, velvet) => `
uniform float calRimK;
void RE_Direct_CalCloth( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	#if NUM_DIR_LIGHTS > 0
	if ( calRimK > 0.0 && dot( directLight.direction, directionalLights[ 0 ].direction ) > 0.9995 ) {
		float nl = dot( geometryNormal, directLight.direction );
		float rimV = 1.0 - saturate( dot( geometryNormal, geometryViewDir ) );
		float rimL = dot( directLight.direction, -geometryViewDir ) * 0.5 + 0.5;
		reflectedLight.directDiffuse += directLight.color * ( ${kRim.toFixed(2)} * calRimK * rimV * rimV * rimV * rimL * rimL * smoothstep( -0.45, 0.05, nl ) ) * material.diffuseColor;
		${velvet ? 'reflectedLight.directDiffuse += directLight.color * ( 1.6 * calRimK * rimV * rimV * rimV * rimV * saturate( ( nl + 0.5 ) / 1.5 ) ) * BRDF_Lambert( material.diffuseColor );' : ''}
	}
	#endif
}
#undef RE_Direct
#define RE_Direct RE_Direct_CalCloth`;

export function applyClothLook(material, { rim = 0.45, velvet = true } = {}) {
  if (!material || material.userData.calCloth === 1) return material;
  const calRimK = { value: 1 };
  const prev = typeof material.onBeforeCompile === 'function' ? material.onBeforeCompile : null;
  const prevKey = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey.bind(material) : null;
  material.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    shader.uniforms.calRimK = calRimK;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>${CLOTH_FRAGMENT(rim, velvet)}`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|calCloth${rim}${velvet ? 'v' : ''}`;
  material.userData.calCloth = 1;
  material.userData.calClothU = { calRimK };
  material.needsUpdate = true;
  return material;
}
