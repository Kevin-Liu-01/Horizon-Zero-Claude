/**
 * CALIMA · skin light for Brea (and near-tier NPC skins): ROUND5-LOOK C-01 (character-art, W1 exit, by grant on src/hero/**).
 *
 *   applySkinLook(material, { tier }) -> material      (idempotent; marks material.userData.calSkin = 1)
 *   skinLookUniforms(material) -> { calSkinK, calThinK } | null   (shared uniform objects; gates switch terms off with them)
 *
 * A shader patch on the skin's own MeshStandardMaterial: no new draw, no new map, no per-frame work. The sun's direct term
 * becomes:
 *   - a per-channel WRAPPED Lambert, w = (0.50, 0.24, 0.16): past the terminator red light still arrives, green less, blue
 *     hardly, so the shadow side of dark skin stays a warm red-brown with form and the terminator is soft;
 *   - the sun's shadow (the cascade's own factor, recovered as the ratio of the light's colour to its unshadowed colour) is
 *     kept separate and faded in only past N.L 0.25, mix(1, shadow, smoothstep(-0.15, 0.25, N.L)), so the shadow map's
 *     normal-bias seam does not print a hard edge along the terminator; cast shadows (the nose's, the wrap hem's) stay;
 *   - LOOK C-04's sun-rim, pow(1 - N.V, 3) x pow(L.-V x 0.5 + 0.5, 2) x sun x shadow x 0.55, inside the same term;
 *   - BACK-TRANSMISSION through thin parts (ear, nostril wing, lids) from the baked `_CALTHIN` vertex attribute (recipe
 *     lib/skin-human.mjs `bakeThinness`; 1 at <= 5 mm of tissue, 0 at >= 25 mm), tinted (1.0, 0.36, 0.20) x 0.6, seen when
 *     the sun is behind the skin.
 * Any other light (a point light, a lamp) keeps the stock Lambert. The specular is the stock GGX on the shadowed light.
 *
 * The fade clone (src/entities/player.js `_collectMaterials`) owns the material's onBeforeCompile; this composes with whatever
 * is there (and with world-sky's CSM/fog wrapper, which composes the same way), and extends the program cache key.
 * R59 c: the emissive hero fill drops to x0.6 here (the scatter now carries the shadow side); src/hero/index.js still scales
 * emissiveIntensity by the scene's ambient every frame.
 */
const WRAP = '0.50, 0.24, 0.16';
const TINT = '1.0, 0.36, 0.20';

const PARS_VERTEX = `
attribute float _calthin;
varying float vCalThin;`;

const PARS_FRAGMENT = `
varying float vCalThin;
uniform float calSkinK;
uniform float calThinK;
void RE_Direct_CalSkin( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float nl = dot( geometryNormal, directLight.direction );
	vec3 irradiance = saturate( nl ) * directLight.color;
	reflectedLight.directSpecular += irradiance * BRDF_GGX( directLight.direction, geometryViewDir, geometryNormal, material );
	vec3 diffuseIrr = irradiance;
	#if NUM_DIR_LIGHTS > 0
	if ( calSkinK > 0.0 && dot( directLight.direction, directionalLights[ 0 ].direction ) > 0.9995 ) {
		vec3 c0 = directionalLights[ 0 ].color;
		float l0 = c0.r + c0.g + c0.b;
		float sh = l0 > 1e-5 ? clamp( ( directLight.color.r + directLight.color.g + directLight.color.b ) / l0, 0.0, 1.0 ) : 1.0;
		vec3 w = vec3( ${WRAP} ) * calSkinK;
		vec3 wnl = clamp( ( vec3( nl ) + w ) / ( 1.0 + w ), 0.0, 1.0 );
		float edge = mix( 1.0, sh, smoothstep( -0.15, 0.25, nl ) );
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

/** Patch a skin material once. `tier`: 'low' gets the wrap without transmission (LOOK C-01). */
export function applySkinLook(material, { tier = 'high' } = {}) {
  if (!material || material.userData.calSkin === 1) return material;
  const calSkinK = { value: 1 }, calThinK = { value: tier === 'low' ? 0 : 1 };
  const prev = typeof material.onBeforeCompile === 'function' ? material.onBeforeCompile : null;
  const prevKey = typeof material.customProgramCacheKey === 'function' ? material.customProgramCacheKey.bind(material) : null;
  material.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    shader.uniforms.calSkinK = calSkinK;
    shader.uniforms.calThinK = calThinK;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${PARS_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvCalThin = _calthin;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>${PARS_FRAGMENT}`);
  };
  material.customProgramCacheKey = () => `${prevKey ? prevKey() : ''}|calSkin`;
  material.userData.calSkin = 1;
  material.userData.calSkinU = { calSkinK, calThinK };
  // R59 c / LOOK C-01: the hero fill drops to x0.6 once the scatter carries the shadow side
  if (material.emissive) material.emissive.multiplyScalar(0.6);
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
