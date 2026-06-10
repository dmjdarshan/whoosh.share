// Whoosh.share — Main Entry Point
// Orchestrates the entire application flow

import { UIManager } from './ui.js';
import { DiscoveryManager } from './discovery.js';
import { ConnectionManager } from './connection.js';
import { TransferManager } from './transfer.js';

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
    this.discoveredDeviceIds = new Set();
    this.presenceLoopActive = false;
    this.discoveryTimeout = null;
    this.outgoingOffer = null;
    this.DISCOVERY_TIMEOUT_MS = 40000;
    this.OFFER_RETRY_DELAY_MS = 2500;
    this.OFFER_RETRY_JITTER_MS = 1200;
  }

  async init() {
    console.log('[Whoosh] Initializing app...');

    // Initialize UI manager
    this.ui = new UIManager();
    this.ui.init();

    this.localDevice = this.getLocalDevice();
    this.ui.setDeviceInfo(this.localDevice.name);

    // Initialize managers (but don't start yet)
    this.discovery = new DiscoveryManager();
    this.connection = new ConnectionManager();
    this.transfer = new TransferManager();

    // Set up event listeners
    this.setupEventListeners();

    // Register service worker
    this.registerServiceWorker();

    console.log('[Whoosh] App initialized');
  }

  setupEventListeners() {
    // UI events
    this.ui.on('startBroadcast', () => this.startBroadcast());
    this.ui.on('startListening', () => this.startListening());
    this.ui.on('cancelDiscovery', () => this.stopDiscovery());
    this.ui.on('deviceSelected', (device) => this.handleDeviceSelected(device));
    this.ui.on('filePicked', (file) => this.handleFilePicked(file));
    this.ui.on('cancelTransfer', () => this.cancelTransfer());

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

    this.discovery.on('error', (error) => {
      console.error('[Whoosh] Discovery error:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.stopDiscovery();
    });

    // Connection events
    this.connection.on('connected', () => {
      console.log('[Whoosh] WebRTC connected');
      this.state = 'connected';
      this.stopOfferBroadcast();
      this.clearDiscoveryTimeout();
      this.ui.setState('connected');
      if (this.role === 'sender' && this.currentPeer) {
        this.ui.showFilePicker(this.currentPeer);
      }
      this.releaseWakeLock();
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

      this.role = 'sender';
      this.state = 'listening';
      this.discoveredDeviceIds.clear();
      this.ui.setState('listening');
      this.ui.setStatus('Sending sound to nearby devices...');

      this.outgoingOffer = await this.connection.createOffer();

      this.startDiscoveryTimeout();
      this.startOfferBroadcastLoop();

    } catch (error) {
      console.error('[Whoosh] Failed to start broadcast:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.stopOfferBroadcast();
      this.clearDiscoveryTimeout();
      this.discovery.cleanup();
      this.releaseWakeLock();
    }
  }

  async startListening() {
    console.log('[Whoosh] Starting listener...');

    try {
      await this.startAudioDiscovery();

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
    this.clearDiscoveryTimeout();
    this.discovery.cleanup();
    this.releaseWakeLock();

    this.state = 'idle';
    this.role = null;
    this.outgoingOffer = null;
    this.ui.setState('idle');
    this.ui.clearDevices();
  }

  async broadcastOffer() {
    if (!this.outgoingOffer) {
      return;
    }

    try {
      await this.discovery.sendOffer(this.outgoingOffer, null, this.localDevice);
    } catch (error) {
      console.error('[Whoosh] Failed to broadcast offer:', error);
    }
  }

  startOfferBroadcastLoop() {
    if (this.presenceLoopActive) {
      return;
    }

    this.presenceLoopActive = true;
    this.runOfferBroadcastLoop();
  }

  stopOfferBroadcast() {
    this.presenceLoopActive = false;
  }

  async runOfferBroadcastLoop() {
    while (this.presenceLoopActive && this.state === 'listening') {
      await this.broadcastOffer();

      if (!this.presenceLoopActive || this.state !== 'listening') {
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

  async handleDeviceSelected(device) {
    console.log('[Whoosh] Device selected:', device);
    this.currentPeer = device;
    this.stopOfferBroadcast();
    this.clearDiscoveryTimeout();

    if (device.pendingOffer) {
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
    if ((message.targetId && message.targetId !== this.localDevice.id) ||
        (message.from && message.from.id === this.localDevice.id)) {
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

  async acceptOffer(message) {
    try {
      this.currentPeer = message.from || this.currentPeer;

      const answer = await this.connection.handleOffer(message.offer);

      await this.discovery.sendAnswer(
        answer,
        message.from ? message.from.id : null,
        this.localDevice
      );

      this.ui.setStatus('Connecting...');
    } catch (error) {
      console.error('[Whoosh] Failed to accept offer:', error);
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async handleAnswerReceived(message) {
    if (message.targetId && message.targetId !== this.localDevice.id) {
      return;
    }

    try {
      this.currentPeer = message.from || this.currentPeer;
      this.stopOfferBroadcast();
      this.clearDiscoveryTimeout();
      await this.connection.handleAnswer(message.answer);
    } catch (error) {
      console.error('[Whoosh] Failed to handle answer:', error);
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async handleFilePicked(file) {
    console.log('[Whoosh] File picked:', file.name, file.size);

    if (!this.connection.isConnected()) {
      this.ui.showError('Not connected to device');
      return;
    }

    try {
      this.state = 'transferring';
      this.ui.showSending(file, this.currentPeer);
      await this.transfer.sendFile(file, this.connection.getDataChannel(), this.localDevice);
    } catch (error) {
      console.error('[Whoosh] Failed to send file:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.state = 'connected';
    }
  }

  cancelTransfer() {
    console.log('[Whoosh] Cancelling transfer...');
    this.transfer.cancel();
    this.state = 'connected';
    this.ui.setState('connected');
  }

  handleDisconnection() {
    this.state = 'idle';
    this.currentPeer = null;
    this.role = null;
    this.stopOfferBroadcast();
    this.clearDiscoveryTimeout();
    this.ui.setState('idle');
    this.ui.clearDevices();
    this.releaseWakeLock();
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
