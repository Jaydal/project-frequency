'use client';

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MotionValue } from 'framer-motion';
import Image from 'next/image';

interface Pickleball3DProps {
  progress: MotionValue<number>;
  mouseX?: MotionValue<number>;
  mouseY?: MotionValue<number>;
  className?: string;
}

// Generate 40 holes evenly distributed on a unit sphere using the golden spiral (Fibonacci sphere)
// with a clear equatorial seam band typical of official 2-piece molded pickleballs
function generatePickleballHoles(count = 40): THREE.Vector3[] {
  const holes: THREE.Vector3[] = [];
  const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle ~2.399963

  for (let i = 0; i < count; i++) {
    let y = 1 - (i / (count - 1)) * 2;
    // Push slightly away from equator to allow for the central mold seam
    if (Math.abs(y) < 0.08) {
      y = (y >= 0 ? 1 : -1) * (0.09 + Math.abs(y) * 0.15);
    }
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = phi * i;
    const x = Math.cos(theta) * radius;
    const z = Math.sin(theta) * radius;
    holes.push(new THREE.Vector3(x, y, z).normalize());
  }
  return holes;
}

const HOLE_VECTORS = generatePickleballHoles(40);

const VERTEX_SHADER = `
varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vViewPosition;

void main() {
  vNormal = normalize(normalMatrix * normal);
  vLocalPosition = position;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewPosition = -mvPosition.xyz;
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec3 uHoles[40];
uniform float uHoleRadius;
uniform vec3 uBaseColor;
uniform vec3 uKeyLightDir;
uniform vec3 uFillLightDir;

varying vec3 vNormal;
varying vec3 vLocalPosition;
varying vec3 vViewPosition;

void main() {
  vec3 p = normalize(vLocalPosition);

  // Find distance to the closest hole center on the unit sphere
  float minD = 999.0;
  for (int i = 0; i < 40; i++) {
    float d = distance(p, uHoles[i]);
    if (d < minD) {
      minD = d;
    }
  }

  // Discard fragments inside the hole aperture
  if (minD < uHoleRadius) {
    discard;
  }

  // Bevel rim shadow around hole edges (gives realistic thickness to molded plastic)
  float edgeDist = minD - uHoleRadius;
  float bevel = smoothstep(0.0, 0.024, edgeDist);
  float holeRimShadow = mix(0.42, 1.0, bevel);

  // Subtle equatorial mold seam line
  float seamDist = abs(p.y);
  float seam = 1.0 - (1.0 - smoothstep(0.003, 0.012, seamDist)) * 0.12;

  // Lighting
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(vViewPosition);

  // Distinguish outer shell from interior wall seen through holes
  bool isFront = gl_FrontFacing;
  if (!isFront) {
    normal = -normal;
  }

  // Key light (crisp studio sun from top-front-right)
  vec3 keyDir = normalize(uKeyLightDir);
  float keyDiff = max(dot(normal, keyDir), 0.0);

  // Fill light (ambient green bounce from lower left)
  vec3 fillDir = normalize(uFillLightDir);
  float fillDiff = max(dot(normal, fillDir), 0.0);

  // Ambient illumination
  float ambient = isFront ? 0.38 : 0.16;

  // Specular sheen (molded matte polyethylene)
  vec3 halfVec = normalize(keyDir + viewDir);
  float spec = isFront ? pow(max(dot(normal, halfVec), 0.0), 28.0) * 0.42 : 0.0;

  // Rim lighting / Fresnel glow
  float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
  vec3 rimGlow = vec3(0.6, 1.0, 0.35) * fresnel * (isFront ? 0.45 : 0.12);

  // Total surface lighting
  float diffuse = (ambient + keyDiff * 0.78 + fillDiff * 0.28) * holeRimShadow * seam;
  if (!isFront) {
    diffuse *= 0.52; // Inner sphere is dark
  }

  vec3 color = uBaseColor * diffuse + vec3(spec) + rimGlow;

  gl_FragColor = vec4(color, 1.0);
}
`;

export function Pickleball3D({ progress, mouseX, mouseY, className }: Pickleball3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 0, 4.6);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    // Custom Shader Material for 100% artifact-free, instant 3D pickleball
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uHoles: { value: HOLE_VECTORS },
        uHoleRadius: { value: 0.088 },
        uBaseColor: { value: new THREE.Color(0x76cc15) }, // Vibrant optic pickleball lime-green
        uKeyLightDir: { value: new THREE.Vector3(3.5, 4.5, 3.0).normalize() },
        uFillLightDir: { value: new THREE.Vector3(-3.0, -2.0, 1.5).normalize() },
      },
      side: THREE.DoubleSide,
      transparent: true,
    });

    const geometry = new THREE.SphereGeometry(1.25, 64, 48);
    const ball = new THREE.Mesh(geometry, material);
    scene.add(ball);

    // Initial resize
    function resize() {
      if (!canvas || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const width = Math.max(rect.width, 100);
      const height = Math.max(rect.height, 100);

      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, true);
    }

    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    let animId: number;
    const startTime = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);

      const elapsed = (performance.now() - startTime) * 0.001;
      const p = progress ? progress.get() : 0;
      const mx = mouseX ? mouseX.get() : 0;
      const my = mouseY ? mouseY.get() : 0;

      // Realistic 3D tumbling in true X, Y, Z space
      ball.rotation.x = p * Math.PI * 4.2 + elapsed * 0.32 + my * 0.0006;
      ball.rotation.y = p * Math.PI * 5.8 + elapsed * 0.48 + mx * 0.0006;
      ball.rotation.z = p * Math.PI * 2.5 + elapsed * 0.18;

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
    };
  }, [progress, mouseX, mouseY]);

  if (webglFailed) {
    return (
      <div className={`relative ${className || ''}`}>
        <Image
          src="/pickleball.webp"
          alt="Pickleball"
          fill
          sizes="(max-width: 768px) 400px, 600px"
          className="object-contain"
          priority
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <canvas ref={canvasRef} className="w-full h-full block pointer-events-none" />
    </div>
  );
}
