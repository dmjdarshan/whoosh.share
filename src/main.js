// Whoosh.share — Main Entry Point
// Orchestrates the entire application flow

import { UIManager } from './ui.js?v=4';
import { DiscoveryManager } from './discovery.js?v=8';
import { ConnectionManager } from './connection.js?v=6';
import { TransferManager } from './transfer.js?v=3';

class WhooshApp {
  constructor() {
    this.ui = null;
    this.discovery = null;
    this.connection = null;
    this.transfer = null;
    this.wakeLock = null;
    this.state = 'idle'; // idle, listening, connected, transferring
    this.localDevice = null;
    this.currentPeer = null;
    this.role = null; // sender, receiver
    this.isAcceptingOffer = false;
    this.discoveryRunId = 0;
    this.discoveredDeviceIds = new Set();
    this.presenceLoopActive = false;
    this.discoveryTimeout = null;
    this.connectionTimeout = null;
    this.outgoingOffer = null;
    this.cachedDevices = [];
    this.offerPauseUntil = 0;
    this.DISCOVERY_TIMEOUT_MS = 40000;
    this.CONNECTION_TIMEOUT_MS = 40000;
    this.SOUND_ACTIVITY_PAUSE_MS = 7000;
    this.OFFER_RETRY_DELAY_MS = 4000;
    this.OFFER_RETRY_JITTER_MS = 1000;
  }

  async init() {
    console.log('[Whoosh] Initializing app...');

    // Initialize UI manager
    this.ui = new UIManager();
    this.ui.init();

    this.localDevice = this.getLocalDevice();
    this.ui.setDeviceInfo(this.localDevice.name);
    this.cachedDevices = this.loadCachedDevices();

    // Initialize managers (but don't start yet)
    this.discovery = new DiscoveryManager();
    this.connection = new ConnectionManager();
    this.transfer = new TransferManager();

    // Set up event listeners
    this.setupEventListeners();
    this.refreshCachedDevicesPanel();

    // Register service worker
    this.registerServiceWorker();

    console.log('[Whoosh] App initialized');
  }

  setupEventListeners() {
    // UI events
    this.ui.on('startBroadcast', () => this.startBroadcast());
    this.ui.on('startListening', () => this.startListening());
    this.ui.on('cancelSession', () => this.endSession());
    this.ui.on('deviceSelected', (device) => this.handleDeviceSelected(device));
    this.ui.on('filesPicked', (files) => this.handleFilesPicked(files));
    this.ui.on('cancelTransfer', () => this.cancelTransfer());
    this.ui.on('sendAnother', () => this.sendAnother());
    this.ui.on('done', () => this.endSession());
    this.ui.on('cachedDeviceSelected', (deviceId) => this.handleCachedDeviceSelected(deviceId));
    this.ui.on('clearCachedDevices', () => this.clearCachedDevices());

    // Discovery events
    this.discovery.on('deviceFound', (device) => {
      console.log('[Whoosh] Device found:', device);
      if (device.id === this.localDevice.id) {
        return;
      }
      this.discoveredDeviceIds.add(device.id);
      this.stopOfferBroadcast();
      this.clearDiscoveryTimeout();
      this.ui.addDevice(device);
    });

    this.discovery.on('offerReceived', (message) => {
      console.log('[Whoosh] Offer received');
      this.handleOfferReceived(message);
    });

    this.discovery.on('answerReceived', (message) => {
      console.log('[Whoosh] Answer received');
      this.handleAnswerReceived(message);
    });

    this.discovery.on('soundDetected', ({ rms, sinceTransmitMs }) => {
      this.handleSoundDetected(rms, sinceTransmitMs);
    });

    this.discovery.on('error', (error) => {
      console.error('[Whoosh] Discovery error:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.stopDiscovery();
    });

    // Connection events
    this.connection.on('connected', () => {
      console.log('[Whoosh] WebRTC connected');
      this.stopOfferBroadcast();
      this.clearDiscoveryTimeout();
      this.startConnectionTimeout();
      this.ui.setStatus('Connecting...');

      if (this.connection.isConnected()) {
        this.finishWebRtcConnection();
      }
    });

    this.connection.on('checking', () => {
      this.handleConnectionAttempt();
    });

    this.connection.on('connecting', () => {
      this.handleConnectionAttempt();
    });

    this.connection.on('disconnected', () => {
      console.log('[Whoosh] WebRTC disconnected');
      this.handleDisconnection();
    });

    this.connection.on('error', (error) => {
      console.error('[Whoosh] Connection error:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.handleDisconnection();
    });

    this.connection.on('message', (message) => {
      this.transfer.handleIncomingMessage(message);
    });

    this.connection.on('dataChannelOpen', () => {
      console.log('[Whoosh] Data channel open');
      this.finishWebRtcConnection();
    });

    // Transfer events
    this.transfer.on('progress', (progress) => {
      this.ui.updateTransferProgress(progress);
    });

    this.transfer.on('complete', (file) => {
      console.log('[Whoosh] Transfer complete:', file.name);
      this.ui.showTransferComplete(file);
      this.state = 'connected';
    });

    this.transfer.on('receiving', (metadata) => {
      console.log('[Whoosh] Receiving file:', metadata.name);
      this.ui.showReceiving(metadata);
      this.state = 'transferring';
    });

    this.transfer.on('error', (error) => {
      console.error('[Whoosh] Transfer error:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.state = 'connected';
    });
  }

  async startBroadcast() {
    console.log('[Whoosh] Starting broadcast...');

    try {
      await this.startAudioDiscovery();
      const runId = ++this.discoveryRunId;

      this.role = 'sender';
      this.state = 'listening';
      this.discoveredDeviceIds.clear();
      this.ui.setState('listening');
      this.ui.setStatus('Sending sound to nearby devices...');

      await this.connection.createOffer();
      this.outgoingOffer = this.connection.createCompactSignal('offer', this.localDevice);

      this.startDiscoveryTimeout();
      this.startOfferBroadcastLoop(runId);

    } catch (error) {
      console.error('[Whoosh] Failed to start broadcast:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.stopOfferBroadcast();
      this.discoveryRunId++;
      this.clearDiscoveryTimeout();
      this.discovery.cleanup();
      this.releaseWakeLock();
    }
  }

  async startListening() {
    console.log('[Whoosh] Starting listener...');

    try {
      await this.startAudioDiscovery();
      ++this.discoveryRunId;

      this.role = 'receiver';
      this.state = 'listening';
      this.discoveredDeviceIds.clear();
      this.ui.setState('listening');
      this.ui.setStatus('Ready to receive...');

      this.startDiscoveryTimeout();
    } catch (error) {
      console.error('[Whoosh] Failed to start listener:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.clearDiscoveryTimeout();
      this.discovery.cleanup();
      this.releaseWakeLock();
    }
  }

  async startAudioDiscovery() {
    await this.requestWakeLock();
    await this.discovery.init();
    await this.discovery.startListening();
  }

  async stopDiscovery() {
    console.log('[Whoosh] Stopping discovery...');

    this.stopOfferBroadcast();
    this.discoveryRunId++;
    this.clearDiscoveryTimeout();
    this.clearConnectionTimeout();
    this.discovery.cleanup();
    this.connection.close();
    this.releaseWakeLock();

    this.state = 'idle';
    this.role = null;
    this.currentPeer = null;
    this.isAcceptingOffer = false;
    this.outgoingOffer = null;
    this.offerPauseUntil = 0;
    this.ui.setState('idle');
    this.ui.clearDevices();
    this.refreshCachedDevicesPanel();
  }

  endSession() {
    console.log('[Whoosh] Ending session...');
    this.transfer.cancel();
    this.stopDiscovery();
    this.ui.hideBottomSheet();
  }

  async broadcastOffer() {
    if (!this.outgoingOffer) {
      return;
    }

    try {
      await this.discovery.sendCompactSignal(this.outgoingOffer);
    } catch (error) {
      console.error('[Whoosh] Failed to broadcast offer:', error);
    }
  }

  startOfferBroadcastLoop(runId) {
    if (this.presenceLoopActive) {
      return;
    }

    this.presenceLoopActive = true;
    this.runOfferBroadcastLoop(runId);
  }

  stopOfferBroadcast() {
    this.presenceLoopActive = false;
  }

  async runOfferBroadcastLoop(runId) {
    while (this.presenceLoopActive && this.state === 'listening' && runId === this.discoveryRunId) {
      const pauseMs = this.offerPauseUntil - Date.now();
      if (pauseMs > 0) {
        await this.sleep(pauseMs);
        continue;
      }

      await this.broadcastOffer();

      if (!this.presenceLoopActive || this.state !== 'listening' || runId !== this.discoveryRunId) {
        break;
      }

      await this.sleep(this.getOfferRetryDelay());
    }
  }

  startDiscoveryTimeout() {
    this.clearDiscoveryTimeout();

    this.discoveryTimeout = setTimeout(() => {
      if (this.state !== 'listening' || this.discoveredDeviceIds.size > 0) {
        return;
      }

      this.stopDiscovery();
      this.ui.showError('No nearby devices found. Try again when both devices are ready.');
    }, this.DISCOVERY_TIMEOUT_MS);
  }

  clearDiscoveryTimeout() {
    if (this.discoveryTimeout) {
      clearTimeout(this.discoveryTimeout);
      this.discoveryTimeout = null;
    }
  }

  startConnectionTimeout() {
    this.clearConnectionTimeout();

    this.connectionTimeout = setTimeout(() => {
      if (this.state === 'connected' || this.state === 'idle') {
        return;
      }

      this.ui.showError("Couldn't connect. Try again with both devices close together.");
      this.stopDiscovery();
    }, this.CONNECTION_TIMEOUT_MS);
  }

  clearConnectionTimeout() {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  async handleDeviceSelected(device) {
    console.log('[Whoosh] Device selected:', device);
    this.currentPeer = device;
    this.stopOfferBroadcast();
    this.clearDiscoveryTimeout();

    if (device.pendingOffer) {
      if (this.isAcceptingOffer) {
        return;
      }

      await this.acceptOffer(device.pendingOffer);
      return;
    }

    // Show file picker
    this.ui.showFilePicker(device);

    // Create WebRTC offer
    try {
      const offer = await this.connection.createOffer();
      
      // Send offer via audio
      await this.discovery.sendOffer(offer, device.id, this.localDevice);
      
      this.ui.setStatus('Connecting...');
    } catch (error) {
      console.error('[Whoosh] Failed to create offer:', error);
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async handleOfferReceived(message) {
    if (message.compact) {
      await this.handleCompactOfferReceived(message.compact);
      return;
    }

    if ((message.targetId && message.targetId !== this.localDevice.id) ||
        (message.from && message.from.id === this.localDevice.id)) {
      console.log('[Whoosh] Ignoring own offer');
      return;
    }

    try {
      const peer = message.from || {
        id: `offer-${Date.now()}`,
        name: 'Nearby device',
        type: 'laptop'
      };

      this.currentPeer = peer;
      this.discoveredDeviceIds.add(peer.id);
      this.clearDiscoveryTimeout();
      this.ui.addDevice({
        ...peer,
        pendingOffer: message
      });
      this.ui.setStatus('Device found. Tap it to connect.');
    } catch (error) {
      console.error('[Whoosh] Failed to show offer:', error);
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async handleCompactOfferReceived(signal) {
    if (this.role !== 'receiver') {
      console.log('[Whoosh] Ignoring compact offer while not receiving');
      return;
    }

    try {
      const compact = this.connection.expandCompactSignal(signal);
      const peer = compact.device;

      this.currentPeer = peer;
      this.discoveredDeviceIds.add(peer.id);
      this.clearDiscoveryTimeout();
      this.ui.addDevice({
        ...peer,
        pendingOffer: {
          compact: signal,
          offer: compact.description,
          from: peer
        }
      });
      this.ui.setStatus('Device found. Tap it to connect.');
    } catch (error) {
      console.error('[Whoosh] Failed to handle compact offer:', error);
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async acceptOffer(message) {
    try {
      const runId = this.discoveryRunId;
      this.isAcceptingOffer = true;
      this.currentPeer = message.from || this.currentPeer;
      this.ui.clearDevices();
      this.ui.setStatus('Replying with sound...');
      this.discovery.stopListening();

      const offer = message.compact
        ? this.connection.expandCompactSignal(message.compact).description
        : message.offer;
      const answer = await this.connection.handleOffer(offer);
      const compactAnswer = this.connection.createCompactSignal('answer', this.localDevice);

      await this.sleep(800);
      await this.sendAnswerRetries(compactAnswer, runId);

      if (runId !== this.discoveryRunId || !this.isAcceptingOffer) {
        return;
      }

      this.ui.setStatus('Connecting...');
      this.startConnectionTimeout();
    } catch (error) {
      console.error('[Whoosh] Failed to accept offer:', error);
      this.isAcceptingOffer = false;
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async sendAnswerRetries(compactAnswer, runId) {
    const attempts = 4;

    for (let attempt = 0; attempt < attempts; attempt++) {
      if (runId !== this.discoveryRunId || !this.isAcceptingOffer) {
        return;
      }

      await this.discovery.sendCompactSignal(compactAnswer, { reliable: true });

      if (runId !== this.discoveryRunId || !this.isAcceptingOffer) {
        return;
      }

      if (attempt < attempts - 1) {
        await this.sleep(2500);
      }
    }
  }

  async handleAnswerReceived(message) {
    if (message.compact) {
      if (this.role !== 'sender') {
        console.log('[Whoosh] Ignoring compact answer while not sending');
        return;
      }

      try {
        const compact = this.connection.expandCompactSignal(message.compact);
        this.currentPeer = compact.device || this.currentPeer;
        this.stopOfferBroadcast();
        this.offerPauseUntil = 0;
        this.clearDiscoveryTimeout();
        this.startConnectionTimeout();
        await this.connection.handleAnswer(compact.description);
      } catch (error) {
        console.error('[Whoosh] Failed to handle compact answer:', error);
        this.ui.showError(this.getHumanReadableError(error));
      }
      return;
    }

    if ((message.targetId && message.targetId !== this.localDevice.id) ||
        (message.from && message.from.id === this.localDevice.id)) {
      console.log('[Whoosh] Ignoring answer not meant for this device');
      return;
    }

    try {
      this.currentPeer = message.from || this.currentPeer;
      this.stopOfferBroadcast();
      this.offerPauseUntil = 0;
      this.clearDiscoveryTimeout();
      this.startConnectionTimeout();
      await this.connection.handleAnswer(message.answer);
    } catch (error) {
      console.error('[Whoosh] Failed to handle answer:', error);
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async handleFilesPicked(files) {
    const selectedFiles = Array.from(files || []);
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    console.log('[Whoosh] Files picked:', selectedFiles.length, totalSize);

    if (!this.connection.isConnected()) {
      this.ui.showError('Not connected to device');
      return;
    }

    if (selectedFiles.length === 0) {
      return;
    }

    try {
      this.state = 'transferring';
      this.ui.setState('transferring');
      this.ui.showSending({
        name: selectedFiles.length === 1 ? selectedFiles[0].name : `${selectedFiles.length} files`,
        size: totalSize,
        totalFiles: selectedFiles.length
      }, this.currentPeer);
      await this.transfer.sendFiles(selectedFiles, this.connection.getDataChannel(), this.localDevice);
    } catch (error) {
      console.error('[Whoosh] Failed to send file:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.state = 'connected';
    }
  }

  cancelTransfer() {
    console.log('[Whoosh] Cancelling transfer...');
    this.transfer.cancel();
    this.endSession();
  }

  sendAnother() {
    if (!this.connection.isConnected()) {
      this.ui.showError('Connection ended. Start sending again.');
      this.endSession();
      return;
    }

    if (this.role !== 'sender' || !this.currentPeer) {
      this.ui.setState('connected');
      return;
    }

    this.state = 'connected';
    this.ui.showFilePicker(this.currentPeer);
  }

  handleDisconnection() {
    this.state = 'idle';
    this.currentPeer = null;
    this.role = null;
    this.isAcceptingOffer = false;
    this.discoveryRunId++;
    this.stopOfferBroadcast();
    this.offerPauseUntil = 0;
    this.clearDiscoveryTimeout();
    this.clearConnectionTimeout();
    this.ui.setState('idle');
    this.ui.clearDevices();
    this.refreshCachedDevicesPanel();
    this.releaseWakeLock();
  }

  finishWebRtcConnection() {
    if (this.state === 'connected') {
      return;
    }

    this.state = 'connected';
    this.isAcceptingOffer = false;
    this.stopOfferBroadcast();
    this.offerPauseUntil = 0;
    this.clearDiscoveryTimeout();
    this.clearConnectionTimeout();
    this.ui.setState('connected');
    this.rememberDevice(this.currentPeer);

    if (this.role === 'sender' && this.currentPeer) {
      this.ui.showFilePicker(this.currentPeer);
    }

    this.releaseWakeLock();
  }

  handleCachedDeviceSelected(deviceId) {
    const device = this.cachedDevices.find((item) => item.id === deviceId);
    if (!device) {
      return;
    }

    if (this.connection.isConnected() && this.currentPeer && this.currentPeer.id === device.id && this.role === 'sender') {
      this.ui.hideSidePanel();
      this.ui.showFilePicker(this.currentPeer);
      return;
    }

    this.ui.showError('Start sending again to reconnect. Saved devices are local history, not reusable sessions.');
  }

  rememberDevice(device) {
    if (!device || !device.id) {
      return;
    }

    const savedDevice = {
      id: device.id,
      name: device.name || 'Nearby device',
      type: device.type || 'laptop',
      lastSeen: Date.now()
    };

    this.cachedDevices = [
      savedDevice,
      ...this.cachedDevices.filter((item) => item.id !== savedDevice.id)
    ].slice(0, 8);

    localStorage.setItem('whoosh-recent-devices', JSON.stringify(this.cachedDevices));
    this.refreshCachedDevicesPanel();
  }

  loadCachedDevices() {
    try {
      const raw = localStorage.getItem('whoosh-recent-devices');
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      return [];
    }
  }

  clearCachedDevices() {
    this.cachedDevices = [];
    localStorage.removeItem('whoosh-recent-devices');
    this.refreshCachedDevicesPanel();
  }

  refreshCachedDevicesPanel() {
    const activeDeviceId = this.connection && this.connection.isConnected() && this.currentPeer
      ? this.currentPeer.id
      : null;
    this.ui.setCachedDevices(this.cachedDevices, activeDeviceId);
  }

  // Wake Lock API
  async requestWakeLock() {
    if ('wakeLock' in navigator) {
      try {
        this.wakeLock = await navigator.wakeLock.request('screen');
        console.log('[Whoosh] Wake lock acquired');

        this.wakeLock.addEventListener('release', () => {
          console.log('[Whoosh] Wake lock released');
        });
      } catch (error) {
        console.warn('[Whoosh] Wake lock failed:', error);
      }
    }
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release();
      this.wakeLock = null;
    }
  }

  // Service Worker registration
  async registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.register('./sw.js');
        console.log('[Whoosh] Service Worker registered:', registration);
      } catch (error) {
        console.warn('[Whoosh] Service Worker registration failed:', error);
      }
    }
  }

  // Utility functions
  getLocalDevice() {
    return {
      id: this.getStoredDeviceId(),
      name: this.getStoredDeviceName(),
      type: this.getDeviceType()
    };
  }

  getStoredDeviceId() {
    const key = 'whoosh-device-id';
    let id = localStorage.getItem(key);

    if (!id) {
      id = this.generateDeviceId();
      localStorage.setItem(key, id);
    }

    return id;
  }

  getStoredDeviceName() {
    const key = 'whoosh-device-name';
    let name = localStorage.getItem(key);

    if (!name) {
      name = this.getDeviceName();
      localStorage.setItem(key, name);
    }

    return name;
  }

  getDeviceName() {
    const platform = navigator.platform || 'Unknown';
    const userAgent = navigator.userAgent;

    if (platform.includes('Mac')) {
      return `${this.getRandomName()}'s Mac`;
    } else if (platform.includes('Win')) {
      return `${this.getRandomName()}'s PC`;
    } else if (platform.includes('Linux')) {
      return `${this.getRandomName()}'s Linux`;
    } else if (userAgent.includes('iPhone')) {
      return `${this.getRandomName()}'s iPhone`;
    } else if (userAgent.includes('iPad')) {
      return `${this.getRandomName()}'s iPad`;
    } else if (userAgent.includes('Android')) {
      return `${this.getRandomName()}'s Android`;
    }

    return `${this.getRandomName()}'s Device`;
  }

  getDeviceType() {
    const userAgent = navigator.userAgent;

    if (userAgent.includes('iPhone') || userAgent.includes('Android')) {
      return 'phone';
    } else if (userAgent.includes('iPad')) {
      return 'tablet';
    } else {
      return 'laptop';
    }
  }

  getRandomName() {
    const adjectives = ['Swift', 'Bright', 'Quick', 'Bold', 'Calm', 'Wise', 'Brave', 'Cool'];
    const nouns = ['Falcon', 'Tiger', 'Eagle', 'Wolf', 'Bear', 'Fox', 'Hawk', 'Lion'];
    
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    
    return `${adj} ${noun}`;
  }

  generateDeviceId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getOfferRetryDelay() {
    return this.OFFER_RETRY_DELAY_MS + Math.floor(Math.random() * this.OFFER_RETRY_JITTER_MS);
  }

  handleConnectionAttempt() {
    if (this.role !== 'sender' || this.state !== 'listening') {
      return;
    }

    if (this.presenceLoopActive) {
      console.log('[Whoosh] Receiver started connecting; stopping offer broadcasts');
    }

    this.stopOfferBroadcast();
    this.clearDiscoveryTimeout();
    this.startConnectionTimeout();
    this.ui.setStatus('Receiver found. Listening for reply...');
  }

  handleSoundDetected(rms, sinceTransmitMs) {
    if (this.role !== 'sender' || this.state !== 'listening' || !this.presenceLoopActive) {
      return;
    }

    if (sinceTransmitMs < 1500) {
      return;
    }

    this.offerPauseUntil = Math.max(
      this.offerPauseUntil,
      Date.now() + this.SOUND_ACTIVITY_PAUSE_MS
    );

    this.ui.setStatus('Heard a reply. Listening...');
    console.log('[Whoosh] Sound detected while sending; pausing offers', rms);
  }

  getHumanReadableError(error) {
    const errorMessage = error.message || error.toString();

    // Map technical errors to human-readable messages
    if (errorMessage.includes('permission') || errorMessage.includes('NotAllowedError')) {
      return 'Whoosh needs microphone access to find nearby devices. Please allow it in your browser settings.';
    }

    if (errorMessage.includes('ICE') || errorMessage.includes('connection')) {
      return "Couldn't connect — make sure both devices are on the same WiFi and volume is up.";
    }

    if (errorMessage.includes('audio') || errorMessage.includes('AudioContext')) {
      return 'Audio not available. Make sure your device has a working speaker and microphone.';
    }

    // Generic fallback
    return 'Something went wrong. Please try again.';
  }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const app = new WhooshApp();
    app.init();
  });
} else {
  const app = new WhooshApp();
  app.init();
}
