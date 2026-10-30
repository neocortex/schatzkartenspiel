/**
 * Engine — owns the WebGL renderer, the post-processing chain, the main loop
 * and the active GameScene. Scenes are swapped with a fade to black.
 */

import * as THREE from "three";
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
  TiltShiftEffect,
  HueSaturationEffect,
  BrightnessContrastEffect,
  KernelSize,
} from "postprocessing";
import { Input } from "./Input";

/** Per-scene look settings for the post-processing chain. */
export interface PostSettings {
  bloomIntensity: number;
  bloomThreshold: number;
  tiltShift: boolean;
  tiltFocus: number;
  tiltOffset: number;
  saturation: number;
  contrast: number;
  brightness: number;
  vignette: number;
  exposure: number;
}

export const DEFAULT_POST: PostSettings = {
  bloomIntensity: 0.55,
  bloomThreshold: 0.92,
  tiltShift: true,
  tiltFocus: 1.1,
  tiltOffset: 0.0,
  saturation: 0.0,
  contrast: 0.04,
  brightness: 0.0,
  vignette: 0.45,
  exposure: 1.0,
};

// Reason: `?tm=aces|agx|neutral` lets us A/B the tone curve while tuning the look
const TONE_MAPPING =
  {
    aces: ToneMappingMode.ACES_FILMIC,
    agx: ToneMappingMode.AGX,
    neutral: ToneMappingMode.NEUTRAL,
  }[new URLSearchParams(location.search).get("tm") ?? ""] ?? ToneMappingMode.ACES_FILMIC;

/** Shortest time between drawn frames: faster screens (120 Hz) would otherwise keep the GPU flat out. */
const FRAME_MS = 1000 / 60;
/** A frame may arrive this much early, so timer jitter on a 60 Hz screen doesn't skip it. */
const FRAME_SLACK_MS = 2;

export interface GameScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly post?: Partial<PostSettings>;
  /** Called after the scene became active (fade-in already started). */
  enter?(engine: Engine): void;
  /** Called before the scene is replaced; release GPU resources here. */
  exit?(): void;
  update(dt: number, time: number): void;
}

export class Engine {
  readonly renderer: THREE.WebGLRenderer;
  readonly input = new Input();
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private bloom: BloomEffect;
  private tiltShift: TiltShiftEffect;
  private tiltPass: EffectPass;
  private hueSat: HueSaturationEffect;
  private brightContrast: BrightnessContrastEffect;
  private vignette: VignetteEffect;
  private gradePass: EffectPass;
  private bloomPass: EffectPass;
  private current: GameScene | null = null;
  private timer = new THREE.Timer();
  private elapsed = 0;
  private fadeEl: HTMLElement;
  private switching = false;
  private lastDraw = 0;
  /** Runs every frame before the active scene updates (game flow, UI). */
  onFrame: ((dt: number, time: number) => void) | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      powerPreference: "high-performance",
      antialias: false,
      stencil: false,
      depth: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    container.appendChild(this.renderer.domElement);

    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
      multisampling: 4,
    });
    const placeholderCam = new THREE.PerspectiveCamera();
    this.renderPass = new RenderPass(new THREE.Scene(), placeholderCam);
    this.composer.addPass(this.renderPass);

    this.bloom = new BloomEffect({
      mipmapBlur: true,
      luminanceThreshold: DEFAULT_POST.bloomThreshold,
      luminanceSmoothing: 0.08,
      intensity: DEFAULT_POST.bloomIntensity,
      radius: 0.75,
    });
    this.bloomPass = new EffectPass(placeholderCam, this.bloom);
    this.composer.addPass(this.bloomPass);

    this.tiltShift = new TiltShiftEffect({
      focusArea: DEFAULT_POST.tiltFocus,
      feather: 0.5,
      kernelSize: KernelSize.VERY_SMALL,
      resolutionScale: 0.5,
    });
    this.tiltPass = new EffectPass(placeholderCam, this.tiltShift);
    this.composer.addPass(this.tiltPass);

    this.hueSat = new HueSaturationEffect({ saturation: DEFAULT_POST.saturation });
    this.brightContrast = new BrightnessContrastEffect({ contrast: DEFAULT_POST.contrast });
    this.vignette = new VignetteEffect({ offset: 0.3, darkness: DEFAULT_POST.vignette });
    this.gradePass = new EffectPass(
      placeholderCam,
      new ToneMappingEffect({ mode: TONE_MAPPING }),
      this.hueSat,
      this.brightContrast,
      this.vignette,
    );
    this.composer.addPass(this.gradePass);

    this.fadeEl = document.getElementById("fade")!;
    window.addEventListener("resize", () => this.onResize());
  }

  get time(): number {
    return this.elapsed;
  }

  get scene(): GameScene | null {
    return this.current;
  }

  get isSwitching(): boolean {
    return this.switching;
  }

  /** Swap to a new scene with a fade through black. */
  async setScene(next: GameScene, fadeMs = 600): Promise<void> {
    if (this.switching) return;
    this.switching = true;
    if (this.current) await this.fade(1, fadeMs);
    this.current?.exit?.();
    this.current = next;
    this.applyPost(next.post);
    this.renderPass.mainScene = next.scene;
    this.renderPass.mainCamera = next.camera;
    for (const pass of [this.bloomPass, this.tiltPass, this.gradePass]) pass.mainCamera = next.camera;
    this.onResize();
    next.enter?.(this);
    // Reason: render one frame before fading in so shaders are compiled behind the black screen
    this.composer.render(0);
    await this.fade(0, fadeMs);
    this.switching = false;
  }

  /** Fade the screen to black (1) or back to the scene (0). */
  fade(to: 0 | 1, ms: number): Promise<void> {
    this.fadeEl.style.transition = `opacity ${ms}ms ease`;
    this.fadeEl.style.opacity = String(to);
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  applyPost(overrides: Partial<PostSettings> = {}): void {
    const p = { ...DEFAULT_POST, ...overrides };
    this.bloom.intensity = p.bloomIntensity;
    this.bloom.luminanceMaterial.threshold = p.bloomThreshold;
    this.tiltPass.enabled = p.tiltShift;
    this.tiltShift.focusArea = p.tiltFocus;
    this.tiltShift.offset = p.tiltOffset;
    this.hueSat.saturation = p.saturation;
    this.brightContrast.contrast = p.contrast;
    this.brightContrast.brightness = p.brightness;
    this.vignette.darkness = p.vignette;
    this.renderer.toneMappingExposure = p.exposure;
  }

  start(): void {
    this.timer.connect(document);
    this.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private frame(timestamp: number): void {
    const sinceDraw = timestamp - this.lastDraw;
    if (sinceDraw < FRAME_MS - FRAME_SLACK_MS) return;
    // Reason: stepping by a fixed interval averages 60 fps on any screen; after a long gap start afresh
    this.lastDraw = sinceDraw < 2 * FRAME_MS ? this.lastDraw + FRAME_MS : timestamp;
    this.timer.update(timestamp);
    this.input.beginFrame();
    // Reason: clamp dt so a background tab or a hitch doesn't teleport the player
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.elapsed += dt;
    this.onFrame?.(dt, this.elapsed);
    if (this.current) {
      this.current.update(dt, this.elapsed);
      this.composer.render(dt);
    }
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.current) {
      this.current.camera.aspect = w / h;
      this.current.camera.updateProjectionMatrix();
    }
  }
}
