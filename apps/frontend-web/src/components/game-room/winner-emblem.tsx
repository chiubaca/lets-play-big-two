import { useMemo, useRef, useSyncExternalStore } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Lightformer, useGLTF } from "@react-three/drei";
import { logoGoldGeometry } from "./logo-gold-geometry";
import {
  BufferAttribute,
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  NoToneMapping,
  SRGBColorSpace,
  type Group,
  type PointLight,
} from "three";

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function goldFaceTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 256;
  const context = canvas.getContext("2d")!;
  const gold = context.createLinearGradient(0, 0, 0, canvas.height);
  gold.addColorStop(0, "#fffac0");
  gold.addColorStop(0.3, "#fff785");
  gold.addColorStop(0.5, "#ffd43b");
  gold.addColorStop(0.68, "#9b4d08");
  gold.addColorStop(0.84, "#ffc32c");
  gold.addColorStop(1, "#ffeb72");
  context.fillStyle = gold;
  context.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function GoldSpade({ reducedMotion, logo }: { reducedMotion: boolean; logo: boolean }) {
  const { scene } = useGLTF("/models/gold-spade-2.glb");
  const group = useRef<Group>(null);
  const model = useMemo(() => {
    if (!logo) return scene;
    const copy = scene.clone(true);
    copy.scale.z = 1.8;
    const faceTexture = goldFaceTexture();
    copy.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) {
        object.material = object.material.clone();
        object.material.metalness = 0.72;
        object.material.roughness = 0.2;
        if (object.material.name === "Emblem Gold") {
          object.geometry = logoGoldGeometry(object.geometry);
          const positions = object.geometry.getAttribute("position");
          const uvs = new Float32Array(positions.count * 2);
          for (let index = 0; index < positions.count; index++) {
            uvs[index * 2] = (positions.getX(index) + 5.65) / 11.35;
            uvs[index * 2 + 1] = (positions.getY(index) + 5.5) / 10.9;
          }
          object.geometry.setAttribute("uv", new BufferAttribute(uvs, 2));
          object.material.color.set("#ffffff");
          object.material.map = faceTexture;
          object.material.emissive.set("#ffffff");
          object.material.emissiveMap = faceTexture;
          object.material.emissiveIntensity = 0.45;
          const bevel = object.material.clone();
          bevel.map = null;
          bevel.emissiveIntensity = 0;
          bevel.color.set("#ffda73");
          bevel.metalness = 0.9;
          bevel.roughness = 0.13;
          object.material = [object.material, bevel];
        }
      }
    });
    return copy;
  }, [scene, logo]);

  useFrame(({ clock }) => {
    if (!group.current || reducedMotion) return;
    const time = clock.getElapsedTime();
    group.current.rotation.y = (logo ? -0.12 : 0) + Math.sin(time * 0.65) * (logo ? 0.12 : 0.22);
    group.current.position.y = Math.sin(time * 0.9) * 0.035;
  });

  return (
    <group
      ref={group}
      scale={logo ? 0.3 : 0.22}
      rotation={[logo ? 0.26 : 0.14, 0, 0]}
      dispose={null}
    >
      <primitive object={model} />
    </group>
  );
}

function GoldGlint({ reducedMotion }: { reducedMotion: boolean }) {
  const light = useRef<PointLight>(null);

  useFrame(({ clock }) => {
    if (!light.current || reducedMotion) return;
    light.current.position.x = Math.sin(clock.getElapsedTime() * 0.8) * 3;
  });

  return (
    <pointLight ref={light} position={[-2, 2, 1.5]} intensity={22} color="#fff2ba" distance={6} />
  );
}

export default function WinnerEmblem({ logo = false }: { logo?: boolean }) {
  const reducedMotion = useSyncExternalStore(
    subscribeToMotion,
    () => window.matchMedia(MOTION_QUERY).matches,
    () => true,
  );

  return (
    <Canvas
      camera={{ position: [0, 0, logo ? 5.5 : 5], fov: 35 }}
      dpr={[1, 1.5]}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{ alpha: true, antialias: true, ...(logo ? { toneMapping: NoToneMapping } : {}) }}
      fallback={
        <img
          className="winner-emblem-fallback"
          src={logo ? "/title-logo.png" : "/models/gold-spade-2.png"}
          alt=""
        />
      }
    >
      <ambientLight intensity={logo ? 0.7 : 0.35} />
      <directionalLight position={[-3, 4, 5]} intensity={logo ? 1.5 : 3} color="#fff0cf" />
      <directionalLight position={[3, -2, 3]} intensity={logo ? 0.8 : 2} color="#ffd089" />
      {logo && <GoldGlint reducedMotion={reducedMotion} />}
      <Environment resolution={128} frames={1} environmentIntensity={logo ? 1.2 : 1}>
        {logo && (
          <Lightformer position={[0, 1, 5]} target={[0, 0, 0]} scale={[10, 5, 1]} intensity={2.5} />
        )}
        <Lightformer position={[-3, 2, 4]} scale={[3, 7, 1]} intensity={4} />
        <Lightformer position={[4, 0, 3]} scale={[2, 6, 1]} intensity={3} />
        <Lightformer position={[0, -4, 3]} scale={[6, 1, 1]} intensity={2} color="#ffd089" />
      </Environment>
      <GoldSpade reducedMotion={reducedMotion} logo={logo} />
    </Canvas>
  );
}
