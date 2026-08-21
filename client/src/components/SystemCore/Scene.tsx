// The canvas: renderer, camera, lights, and the model the strips turn inside.
//
// This is the lazy boundary's payload — `three` is reachable only from here
// down, so the library is not fetched until the modal is actually opened.
//
// R3F absorbs most of what the reference implementation's Stage class did by
// hand: it owns the renderer, measures and resizes the canvas, disposes
// geometry on unmount, and runs one loop instead of the reference's two (a
// render loop and a separate simulation loop that both had to be torn down).
// What is left here is the framing pass and the scene's own furniture.

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { useMediaQuery } from '@librechat/client';
import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { MutableRefObject } from 'react';
import type { Module } from './data/schema';
import type { Runtime } from './scene/resolve';
import Orbit from './objects/Orbit';
import Strip from './objects/Strip';
import Scanner from './objects/Scanner';
import Mainframe from './objects/Mainframe';
import Hum from './objects/Hum';
import { LabelFactory, preloadLabelFont } from './scene/labels';
import { MaterialRegistry } from './scene/materials';
import { createToneBus } from './scene/audio';
import { colorOf, gainOf, stripSpec } from './scene/resolve';
import { LIGHTS, STAGE_BACKGROUND } from './scene/palette';
import { SCANNER, FRAME_FILL, FRAME_MARGIN, FRAME_DIRECTION } from './scene/config';

export interface SceneProps {
  modules: Module[];
  runtimeFor: (m: Module) => Runtime;
  parkPhase: (id: string, phase: number) => void;
  selected: string | null;
  onSelect: (id: string | null) => void;
  scannerVisible: boolean;
  /** Bumped to re-run the framing pass. */
  resetToken: number;
}

/**
 * Fits the camera to the stack, once, and again whenever the reset button asks.
 *
 * Framed on the stack — mainframe, strips and their contacts — and NOT on the
 * scanner deck, which is a backdrop 10× wider than the thing worth looking at.
 * The reference fitted the whole model including the deck, which worked while
 * the deck's radius was 3.3 and broke when it was widened to 12: the fitted
 * distance ends up ~4× too far out and FRAME_FILL cannot make that up. Framing
 * on the stack keeps the composition independent of the deck's size.
 */
function Frame({
  stackRef,
  controlsRef,
  resetToken,
}: {
  stackRef: MutableRefObject<THREE.Group | null>;
  controlsRef: MutableRefObject<OrbitControls | null>;
  resetToken: number;
}) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const stack = stackRef.current;
    const controls = controlsRef.current;
    if (!stack || !controls) {
      return;
    }
    // Box3 reads world matrices, which have not been refreshed yet on the first
    // pass after mount.
    stack.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(stack);
    if (box.isEmpty()) {
      return;
    }
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const dist = (sphere.radius / Math.tan((camera.fov * Math.PI) / 360)) * FRAME_MARGIN;
    const dir = new THREE.Vector3(...FRAME_DIRECTION).normalize();
    camera.position.copy(sphere.center).add(dir.multiplyScalar(dist));
    camera.position.multiplyScalar(FRAME_FILL);
    camera.near = Math.max(dist / 100, 0.01);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    controls.target.copy(sphere.center);
    controls.update();
    invalidate();
  }, [camera, invalidate, stackRef, controlsRef, resetToken]);

  return null;
}

/** The selection pulse. Only the picked module's overlays render with these
 *  materials, so this animates its strip and its contact in lockstep. */
function Pulse({ mats, active }: { mats: MaterialRegistry; active: boolean }) {
  useFrame(({ clock }) => {
    if (active) {
      mats.pulse(clock.elapsedTime * 1000);
    }
  });
  return null;
}

function Core({
  modules,
  runtimeFor,
  parkPhase,
  selected,
  onSelect,
  scannerVisible,
  resetToken,
  animate,
}: SceneProps & { animate: boolean }) {
  const stackRef = useRef<THREE.Group | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const camera = useThree((state) => state.camera);
  const maxAnisotropy = useThree((state) => state.gl.capabilities.getMaxAnisotropy());

  // One registry per scene. Materials are shared across modules that look
  // alike, and the dimming pass has to be able to reach every one of them.
  const mats = useMemo(() => new MaterialRegistry(), []);
  const labels = useMemo(() => new LabelFactory(maxAnisotropy), [maxAnisotropy]);
  // Not built at all when the stack is holding still, which silences the
  // mainframe's hum as well as the strips.
  //
  // This is a choice, not a technical limit, and worth saying so. Under reduced
  // motion `frameloop` is "demand", but Orbit invalidates on every controls
  // change and R3F renders once at mount, so a static voice would in fact be
  // handed a correct level and would track zoom perfectly well. It is left silent
  // because a continuous unmutable drone over a deliberately still frame, with no
  // visible motion to account for it, is worse than nothing. Skipping the bus
  // also means no AudioContext for a scene that was never going to use one, and
  // null likewise covers a browser that refuses us one — see createToneBus.
  const bus = useMemo(() => (animate ? createToneBus(camera) : null), [animate, camera]);

  useEffect(() => {
    return () => {
      mats.dispose();
      labels.dispose();
    };
  }, [mats, labels]);

  // Its own effect rather than a line in the one above: the bus can be rebuilt
  // without the materials being rebuilt, and folding it in would mean a change
  // of `animate` disposed the material registry the live scene is still using.
  useEffect(() => {
    if (!bus) {
      return;
    }
    return () => bus.dispose();
  }, [bus]);

  // Band names are rasterised through the theme's UI face. Rather than block
  // the whole scene on the font, the stack renders immediately and labels
  // appear once it resolves — usually the next frame, since the face is already
  // in use by the app around it. Gating matters because the rasteriser caches
  // per string: drawing early would cache the fallback face permanently.
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let alive = true;
    preloadLabelFont().then(() => {
      if (alive) {
        setFontReady(true);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  // Dim the always-on materials while something is picked, so the selected
  // strip and its contact carry the eye.
  useEffect(() => {
    mats.setDimmed(selected != null);
    return () => mats.setDimmed(false);
  }, [mats, selected]);

  const strips = useMemo(
    () =>
      modules.map((m) => {
        const rt = runtimeFor(m);
        const spec = stripSpec(m, rt);
        return {
          spec: fontReady ? spec : { ...spec, label: null },
          initialPhase: rt.phase,
          mats: mats.forModule(colorOf(m), m.appearance.opacity, gainOf(m)),
        };
      }),
    [modules, runtimeFor, mats, fontReady],
  );

  return (
    <>
      <color attach="background" args={[STAGE_BACKGROUND]} />
      <hemisphereLight args={[LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.hemiIntensity]} />
      <directionalLight
        color={LIGHTS.keyColor}
        intensity={LIGHTS.keyIntensity}
        position={[4, 7, 5]}
      />
      <directionalLight
        color={LIGHTS.fillColor}
        intensity={LIGHTS.fillIntensity}
        position={[-5, 3, -4]}
      />

      <group name="digital-system-core">
        <group name="scanner-view" position-y={SCANNER.y} visible={scannerVisible}>
          <Scanner animate={animate} />
        </group>
        {/* The camera frames on this group, so the deck above stays outside it. */}
        <group ref={stackRef} name="stack">
          <Mainframe />
          {/* A sibling of the mainframe rather than a child of it: `mainframe`
              and `stack` are both untransformed, so this sits in exactly the same
              place, and Mainframe stays propless with its claim to no per-frame
              work intact. Mirrors the gate Strip uses for its own voice. */}
          {bus && <Hum bus={bus} />}
          {strips.map((strip) => (
            <Strip
              key={strip.spec.id}
              spec={strip.spec}
              mats={strip.mats}
              labels={labels}
              bus={bus}
              picked={selected === strip.spec.id}
              scannerVisible={scannerVisible}
              animate={animate}
              initialPhase={strip.initialPhase}
              onPhase={parkPhase}
              onPick={onSelect}
            />
          ))}
        </group>
      </group>

      <Orbit controlsRef={controlsRef} damping={animate} />
      <Frame stackRef={stackRef} controlsRef={controlsRef} resetToken={resetToken} />
      <Pulse mats={mats} active={selected != null} />
    </>
  );
}

export default function Scene(props: SceneProps) {
  // Reduced motion renders a static frame rather than a paused animation, which
  // is the convention the shared AnimatedGridPattern and OrbitMark primitives
  // already follow. "demand" means nothing repaints unless something asks, and
  // Orbit asks while the user is dragging.
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const animate = !reducedMotion;

  return (
    <Canvas
      frameloop={animate ? 'always' : 'demand'}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 45, near: 0.01, far: 500, position: [3, 2.2, 4] }}
    >
      <Core {...props} animate={animate} />
    </Canvas>
  );
}
