// CRT screen material: barrel curvature, scanlines, cheap phosphor bloom, flicker, vignette.
export function makeCrtMaterial(THREE, texture) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, time: { value: 0 }, texel: { value: new THREE.Vector2(1 / 1024, 1 / 768) } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `
      precision highp float;
      uniform sampler2D map; uniform float time; uniform vec2 texel; varying vec2 vUv;
      vec2 curve(vec2 uv){ uv = uv * 2.0 - 1.0; uv *= 1.0 + dot(uv.yx, uv.yx) * vec2(0.035, 0.05); return uv * 0.5 + 0.5; }
      void main(){
        vec2 uv = curve(vUv);
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
        vec3 c = texture2D(map, uv).rgb;
        vec3 glow = vec3(0.0);
        for (int i = -2; i <= 2; i++) for (int j = -2; j <= 2; j++) glow += texture2D(map, uv + vec2(float(i), float(j)) * texel * 2.5).rgb;
        c += glow / 25.0 * 0.9;
        float scan = 0.82 + 0.18 * sin(uv.y * 768.0 * 3.14159);
        float flicker = 0.97 + 0.03 * sin(time * 53.0) * sin(time * 7.3);
        float roll = 0.02 * smoothstep(0.0, 1.0, sin(uv.y * 3.0 - time * 0.6));
        vec2 v = vUv * 2.0 - 1.0;
        float vig = 1.0 - 0.35 * dot(v, v);
        gl_FragColor = vec4((c * scan + roll) * flicker * vig + vec3(0.0, 0.012, 0.0), 1.0);
      }`,
  });
}
