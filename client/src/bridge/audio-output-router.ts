import type { AudioOutputRoutes } from './audio-outputs';
import {
  currentAudioOutputRoutes,
  listAudioOutputs,
  reportAudioOutputIssue,
  subscribeAudioOutputRoutes,
  supportsAudioOutputRouting,
  usesDefaultAudioOutput,
} from './audio-outputs';

type Sources = Partial<Record<'accompaniment' | 'vocals' | 'microphone', AudioNode>>;
type Output = {
  gain: GainNode;
  destination: MediaStreamAudioDestinationNode;
  audio: HTMLAudioElement;
};

const sourceKinds: (keyof Sources)[] = ['accompaniment', 'vocals', 'microphone'];
async function validateSink(deviceId: string): Promise<void> {
  if (!supportsAudioOutputRouting()) {
    throw new Error('Speaker routing is not supported.');
  }
  const devices = await listAudioOutputs();
  if (!devices.some((device) => device.id === deviceId)) {
    throw new Error('Selected speaker is unavailable.');
  }
}

/** Each explicit sink owns a real browser output, with no default-device fallback. */
export class AudioOutputRouter {
  private outputs: Output[] = [];
  private generation = 0;
  private volume = 1;
  private readonly direct: GainNode;
  private readonly unsubscribe: () => void;
  ready: Promise<void>;

  constructor(
    private readonly context: AudioContext,
    private readonly sources: Sources,
    volume = 1,
  ) {
    this.volume = volume;
    this.direct = context.createGain();
    this.direct.gain.value = volume;
    this.ready = this.configure(currentAudioOutputRoutes());
    this.unsubscribe = subscribeAudioOutputRoutes((routes) => {
      this.ready = this.configure(routes);
    });
  }

  setVolume(value: number): void {
    this.volume = value;
    this.direct.gain.value = value;
    for (const output of this.outputs) {
      output.gain.gain.value = value;
    }
  }

  private clear(): void {
    for (const source of Object.values(this.sources)) {
      source.disconnect();
    }
    this.direct.disconnect();
    for (const output of this.outputs) {
      output.audio.pause();
      output.audio.srcObject = null;
      output.audio.remove();
      output.gain.disconnect();
      for (const track of output.destination.stream.getTracks()) {
        track.stop();
      }
    }
    this.outputs = [];
  }

  private async configure(routes: AudioOutputRoutes): Promise<void> {
    const generation = ++this.generation;
    this.clear();
    if (usesDefaultAudioOutput(routes)) {
      for (const source of Object.values(this.sources)) {
        source.connect(this.direct);
      }
      this.direct.connect(this.context.destination);
      return;
    }
    await Promise.all(
      (routes ?? []).map(async (route) => {
        const nodes = sourceKinds.flatMap((kind) => {
          const node = this.sources[kind];
          return route[kind] && node ? [node] : [];
        });
        if (nodes.length === 0) {
          return;
        }
        const gain = this.context.createGain();
        gain.gain.value = this.volume;
        const destination = this.context.createMediaStreamDestination();
        const audio = new Audio();
        const output = { gain, destination, audio };
        this.outputs.push(output);
        try {
          await validateSink(route.device_id);
          if (generation !== this.generation) {
            return;
          }
          await audio.setSinkId(route.device_id);
          if (generation !== this.generation) {
            return;
          }
          audio.srcObject = destination.stream;
          audio.dataset.outputDevice = route.device_id;
          audio.hidden = true;
          document.body.append(audio);
          await audio.play();
          if (generation !== this.generation) {
            audio.pause();
            return;
          }
          gain.connect(destination);
          for (const node of nodes) {
            node.connect(gain);
          }
        } catch (error) {
          audio.pause();
          audio.srcObject = null;
          audio.remove();
          for (const track of destination.stream.getTracks()) {
            track.stop();
          }
          if (generation === this.generation) {
            reportAudioOutputIssue(route.device_id, error);
          }
        }
      }),
    );
  }

  dispose(): void {
    this.unsubscribe();
    ++this.generation;
    this.clear();
  }
}
