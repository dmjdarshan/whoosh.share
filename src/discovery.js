// Whoosh.share — Discovery Manager
// Handles audio-based device discovery using ggwave WASM

export class DiscoveryManager {
  constructor() {
    this.eventHandlers = new Map();
    this.audioContext = null;
    this.ggwave = null;
    this.ggwaveInstance = null;
    this.isListening = false;
    this.micStream = null;
    this.audioWorkletNode = null;
    this.audioSource = null;
    this.currentAudioSource = null;
    this.protocol = null;
    this.chunkBuffers = new Map();
    this.CHUNK_PAYLOAD_SIZE = 90;
    this.isTransmitting = false;
    this.lastSoundDetectedAt = 0;
    this.lastTransmitEndedAt = 0;
  }

  // Event emitter pattern
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  emit(event, data) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  // Initialize ggwave and audio context
  async init() {
    console.log("[Discovery] Initializing...");

    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access not available. Please use HTTPS or access via http://localhost:8000 (not http://[::]:8000)');
      }

      // Request microphone permission
      this.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
        },
      });

      console.log("[Discovery] Microphone access granted");

      // Create audio context (must be after user gesture on iOS)
      this.audioContext = new (
        window.AudioContext || window.webkitAudioContext
      )({
        sampleRate: 48000,
      });

      // Load ggwave WASM module
      await this.loadGGWave();

      console.log("[Discovery] Initialization complete");
    } catch (error) {
      console.error("[Discovery] Initialization failed:", error);
      throw error;
    }
  }

  // Load ggwave WASM module
  async loadGGWave() {
    console.log("[Discovery] Loading ggwave WASM...");

    try {
      // Load the ggwave script (it now exposes window.ggwave_factory)
      await this.loadScript("./lib/ggwave/ggwave.js");

      // Wait for the script to fully initialize
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Check if ggwave_factory is available
      if (typeof window.ggwave_factory !== "function") {
        throw new Error("ggwave_factory not found - check lib/ggwave/ggwave.js");
      }

      // Initialize ggwave
      this.ggwave = await window.ggwave_factory();

      // Initialize this ggwave build with its current single-parameter API.
      const sampleRate = this.audioContext.sampleRate;
      const params = this.ggwave.getDefaultParameters();
      params.sampleRate = sampleRate;
      params.sampleRateInp = sampleRate;
      params.sampleRateOut = sampleRate;
      params.samplesPerFrame = 1024;
      params.sampleFormatInp = this.ggwave.SampleFormat.GGWAVE_SAMPLE_FORMAT_I8;
      params.sampleFormatOut = this.ggwave.SampleFormat.GGWAVE_SAMPLE_FORMAT_I8;
      params.operatingMode = this.ggwave.GGWAVE_OPERATING_MODE_RX_AND_TX;

      this.ggwaveInstance = this.ggwave.init(params);
      // wave-share notes that ultrasonic transmission is unreliable on many devices.
      // Use audible fastest for the MVP path; once the flow is stable we can add
      // an ultrasonic preference with audible fallback.
      this.protocol = this.ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_FASTEST;
      this.reliableProtocol = this.ggwave.ProtocolId.GGWAVE_PROTOCOL_AUDIBLE_NORMAL;

      console.log("[Discovery] ggwave WASM loaded and initialized successfully");
      console.log("[Discovery] Sample rate:", sampleRate);
      return;
    } catch (error) {
      console.error("[Discovery] Failed to load ggwave:", error);
      throw new Error(
        "ggwave library failed to load. Please ensure lib/ggwave/ggwave.js is present and valid."
      );
    }
  }

  // Helper to load external script
  loadScript(src) {
    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // Start listening for audio transmissions
  async startListening() {
    if (this.isListening) {
      return;
    }

    console.log("[Discovery] Starting to listen...");

    try {
      // Create audio source from microphone
      const source = this.audioContext.createMediaStreamSource(this.micStream);

      // Create script processor for audio analysis
      // Note: ScriptProcessor is deprecated but still widely supported
      // For production, consider using AudioWorklet
      const bufferSize = 4096;
      const processor = this.audioContext.createScriptProcessor(
        bufferSize,
        1,
        1,
      );

      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        this.processAudioInput(inputData);
      };

      // Connect audio graph
      source.connect(processor);
      processor.connect(this.audioContext.destination);

      this.audioSource = source;
      this.audioWorkletNode = processor;
      this.isListening = true;

      console.log("[Discovery] Listening started");
    } catch (error) {
      console.error("[Discovery] Failed to start listening:", error);
      throw error;
    }
  }

  // Process incoming audio data
  processAudioInput(samples) {
    if (!this.ggwave || this.ggwaveInstance === null || this.isTransmitting) {
      return;
    }

    try {
      this.detectSoundActivity(samples);

      const pcmSamples = this.floatToInt8(samples);
      const decodedBytes = this.ggwave.decode(this.ggwaveInstance, pcmSamples);

      if (decodedBytes && decodedBytes.length > 0) {
        const decoded = new TextDecoder().decode(decodedBytes);
        console.log("[Discovery] Decoded data:", decoded.length, "chars");

        this.handleDecodedText(decoded);
      }
    } catch (error) {
      // Ignore decoding errors (ambient noise, etc.)
      // Only log if it's not a parsing error
      if (!(error instanceof SyntaxError)) {
        console.warn("[Discovery] Decode error:", error);
      }
    }
  }

  detectSoundActivity(samples) {
    let sum = 0;

    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }

    const rms = Math.sqrt(sum / samples.length);
    const now = Date.now();

    if (rms > 0.025 && now - this.lastSoundDetectedAt > 1000) {
      this.lastSoundDetectedAt = now;
      this.emit("soundDetected", {
        rms,
        sinceTransmitMs: this.lastTransmitEndedAt ? now - this.lastTransmitEndedAt : Infinity
      });
    }
  }

  // Stop listening
  stopListening() {
    console.log("[Discovery] Stopping listening...");

    if (this.audioWorkletNode) {
      this.audioWorkletNode.disconnect();
      this.audioWorkletNode = null;
    }

    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }

    this.isListening = false;
  }

  // Broadcast device presence
  async broadcast(deviceInfo) {
    console.log("[Discovery] Broadcasting device:", deviceInfo);

    const message = {
      type: "device",
      device: deviceInfo,
    };

    await this.transmit(message);
  }

  // Send WebRTC offer via audio
  async sendOffer(offer, targetDeviceId, fromDevice) {
    console.log("[Discovery] Sending offer to:", targetDeviceId);

    const message = {
      type: "offer",
      offer: offer,
      targetId: targetDeviceId,
      from: fromDevice,
    };

    await this.transmitLarge(message);
  }

  async sendCompactSignal(signal, options = {}) {
    console.log("[Discovery] Sending compact signal");
    await this.transmitText(signal, options);
  }

  // Send WebRTC answer via audio
  async sendAnswer(answer, targetDeviceId, fromDevice) {
    console.log("[Discovery] Sending answer");

    const message = {
      type: "answer",
      answer: answer,
      targetId: targetDeviceId,
      from: fromDevice,
    };

    await this.transmitLarge(message);
  }

  // Transmit data via audio
  async transmit(data) {
    await this.transmitText(JSON.stringify(data));
  }

  async transmitLarge(data) {
    const json = JSON.stringify(data);

    if (json.length <= 120) {
      await this.transmitText(json);
      return;
    }

    const messageId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const total = Math.ceil(json.length / this.CHUNK_PAYLOAD_SIZE);

    console.log("[Discovery] Transmitting chunked payload:", json.length, "bytes in", total, "chunks");

    for (let index = 0; index < total; index++) {
      const chunk = json.slice(
        index * this.CHUNK_PAYLOAD_SIZE,
        (index + 1) * this.CHUNK_PAYLOAD_SIZE
      );
      await this.transmitText(`C|${messageId}|${index}|${total}|${chunk}`);
    }
  }

  async transmitText(text, options = {}) {
    if (!this.ggwave || this.ggwaveInstance === null || !this.audioContext) {
      throw new Error("ggwave not initialized");
    }

    try {
      console.log("[Discovery] Transmitting:", text.length, "bytes");
      this.isTransmitting = true;

      const volume = 50; // Volume level (0-100)
      const protocol = options.reliable ? this.reliableProtocol : this.protocol;
      const audioSamples = this.ggwave.encode(
        this.ggwaveInstance,
        text,
        protocol,
        volume,
      );

      // Play audio through speakers
      await this.playAudio(audioSamples);

      console.log("[Discovery] Transmission complete");
    } catch (error) {
      console.error("[Discovery] Transmission failed:", error);
      throw error;
    } finally {
      this.isTransmitting = false;
      this.lastTransmitEndedAt = Date.now();
    }
  }

  handleDecodedText(text) {
    if (text.startsWith("C|")) {
      this.handleChunk(text);
      return;
    }

    if (text.startsWith("O|")) {
      this.emit("offerReceived", { compact: text });
      return;
    }

    if (text.startsWith("A|")) {
      this.emit("answerReceived", { compact: text });
      return;
    }

    const data = JSON.parse(text);

    if (data.type === "device") {
      this.emit("deviceFound", data.device);
    } else if (data.type === "offer") {
      this.emit("offerReceived", data);
    } else if (data.type === "answer") {
      this.emit("answerReceived", data);
    }
  }

  handleChunk(text) {
    const first = text.indexOf("|");
    const second = text.indexOf("|", first + 1);
    const third = text.indexOf("|", second + 1);
    const fourth = text.indexOf("|", third + 1);

    if (first === -1 || second === -1 || third === -1 || fourth === -1) {
      return;
    }

    const id = text.slice(first + 1, second);
    const index = Number(text.slice(second + 1, third));
    const total = Number(text.slice(third + 1, fourth));
    const payload = text.slice(fourth + 1);

    if (!Number.isInteger(index) || !Number.isInteger(total) || total <= 0) {
      return;
    }

    let buffer = this.chunkBuffers.get(id);
    if (!buffer) {
      buffer = {
        chunks: new Array(total),
        received: 0,
        updatedAt: Date.now()
      };
      this.chunkBuffers.set(id, buffer);
    }

    if (!buffer.chunks[index]) {
      buffer.chunks[index] = payload;
      buffer.received++;
      buffer.updatedAt = Date.now();
      console.log("[Discovery] Received chunk", index + 1, "of", total);
    }

    if (buffer.received === total) {
      this.chunkBuffers.delete(id);
      const assembled = buffer.chunks.join("");
      console.log("[Discovery] Reassembled chunked payload:", assembled.length, "bytes");
      this.handleDecodedText(assembled);
    }
  }

  // Play audio samples through speakers
  async playAudio(samples) {
    return new Promise((resolve, reject) => {
      try {
        // Create audio buffer
        const buffer = this.audioContext.createBuffer(
          1, // mono
          samples.length,
          this.audioContext.sampleRate,
        );

        // ggwave emits signed PCM bytes for this build; Web Audio expects -1..1 floats.
        const channel = buffer.getChannelData(0);
        for (let i = 0; i < samples.length; i++) {
          channel[i] = samples[i] / 128;
        }

        // Create buffer source
        const source = this.audioContext.createBufferSource();
        this.currentAudioSource = source;
        source.buffer = buffer;
        source.connect(this.audioContext.destination);

        // Play
        source.onended = () => {
          if (this.currentAudioSource === source) {
            this.currentAudioSource = null;
          }
          resolve();
        };
        source.start(0);
      } catch (error) {
        reject(error);
      }
    });
  }

  stopPlayback() {
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
      } catch (error) {
        // Source may already have ended.
      }
      this.currentAudioSource = null;
    }

    this.isTransmitting = false;
  }

  floatToInt8(samples) {
    const pcmSamples = new Int8Array(samples.length);

    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      pcmSamples[i] = Math.round(sample * 127);
    }

    return pcmSamples;
  }

  // Clean up resources
  cleanup() {
    console.log("[Discovery] Cleaning up...");

    this.stopPlayback();
    this.stopListening();
    this.chunkBuffers.clear();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.ggwave && this.ggwave.free && this.ggwaveInstance !== null) {
      this.ggwave.free(this.ggwaveInstance);
      this.ggwaveInstance = null;
    }

    this.ggwave = null;
  }
}
