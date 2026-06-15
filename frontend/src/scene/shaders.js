export const SONAR_VERTEX_SHADER = `
  attribute vec3 instColor;
  attribute float instAlpha;
  attribute float instSize;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vDepth;
  void main() {
    vColor = instColor;
    vAlpha = instAlpha;
    vec3 pos = position * instSize;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(pos, 1.0);
    vDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

export const SONAR_FRAGMENT_SHADER = `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vDepth;
  void main() {
    vec2 c = gl_PointCoord - vec2(0.5);
    float d = length(c);
    if (d > 0.5) discard;
    float glow = smoothstep(0.5, 0.0, d);
    vec3 col = vColor * (0.7 + 0.6 * glow);
    float a = vAlpha * glow * 0.9;
    gl_FragColor = vec4(col, a);
  }
`;

export const GRID_VERTEX_SHADER = `
  varying vec3 vPos;
  varying vec3 vNormalW;
  void main() {
    vPos = position;
    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

export const GRID_FRAGMENT_SHADER = `
  uniform vec3 uBeamColor;
  uniform float uAlpha;
  varying vec3 vPos;
  varying vec3 vNormalW;
  void main() {
    float edgeX = smoothstep(0.48, 0.5, abs(vPos.x));
    float edgeY = smoothstep(0.48, 0.5, abs(vPos.y));
    float edgeZ = smoothstep(0.48, 0.5, abs(vPos.z));
    float wire = max(max(edgeX, edgeY), edgeZ);
    if (wire < 0.02) discard;
    float f = max(0.0, dot(vNormalW, normalize(vec3(0.3, 0.8, 0.5))));
    vec3 col = uBeamColor * (0.35 + 0.65 * f);
    gl_FragColor = vec4(col, uAlpha * (0.4 + 0.6 * wire));
  }
`;
