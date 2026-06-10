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
  }

  async init() {
    console.log('[Whoosh] Initializing app...');

    // Initialize UI manager
    this.ui = new UIManager();
    this.ui.init();

    // Set device name
    const deviceName = this.getDeviceName();
    this.ui.setDeviceInfo(deviceName);

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
    this.ui.on('startDiscovery', () => this.startDiscovery());
    this.ui.on('cancelDiscovery', () => this.stopDiscovery());
    this.ui.on('deviceSelected', (device) => this.handleDeviceSelected(device));
    this.ui.on('filePicked', (file) => this.handleFilePicked(file));
    this.ui.on('cancelTransfer', () => this.cancelTransfer());

    // Discovery events
    this.discovery.on('deviceFound', (device) => {
      console.log('[Whoosh] Device found:', device);
      this.ui.addDevice(device);
    });

    this.discovery.on('offerReceived', (offer) => {
      console.log('[Whoosh] Offer received');
      this.handleOfferReceived(offer);
    });

    this.discovery.on('answerReceived', (answer) => {
      console.log('[Whoosh] Answer received');
      this.handleAnswerReceived(answer);
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
      this.ui.setState('connected');
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

  async startDiscovery() {
    console.log('[Whoosh] Starting discovery...');

    try {
      // Request wake lock to keep screen on
      await this.requestWakeLock();

      // Initialize discovery (will request mic permission)
      await this.discovery.init();

      // Start listening for devices
      await this.discovery.startListening();

      // Update UI
      this.state = 'listening';
      this.ui.setState('listening');

      // Start broadcasting our presence
      await this.broadcastPresence();

    } catch (error) {
      console.error('[Whoosh] Failed to start discovery:', error);
      this.ui.showError(this.getHumanReadableError(error));
      this.releaseWakeLock();
    }
  }

  async stopDiscovery() {
    console.log('[Whoosh] Stopping discovery...');

    this.discovery.stopListening();
    this.releaseWakeLock();

    this.state = 'idle';
    this.ui.setState('idle');
    this.ui.clearDevices();
  }

  async broadcastPresence() {
    // Broadcast our device info periodically
    const deviceInfo = {
      id: this.generateDeviceId(),
      name: this.getDeviceName(),
      type: this.getDeviceType()
    };

    try {
      await this.discovery.broadcast(deviceInfo);
    } catch (error) {
      console.error('[Whoosh] Failed to broadcast presence:', error);
    }
  }

  async handleDeviceSelected(device) {
    console.log('[Whoosh] Device selected:', device);

    // Show file picker
    this.ui.showFilePicker(device);

    // Create WebRTC offer
    try {
      const offer = await this.connection.createOffer();
      
      // Send offer via audio
      await this.discovery.sendOffer(offer, device.id);
      
      this.ui.setStatus('Connecting...');
    } catch (error) {
      console.error('[Whoosh] Failed to create offer:', error);
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async handleOfferReceived(offer) {
    try {
      // Create answer
      const answer = await this.connection.handleOffer(offer);
      
      // Send answer via audio
      await this.discovery.sendAnswer(answer);
      
      this.ui.setStatus('Connecting...');
    } catch (error) {
      console.error('[Whoosh] Failed to handle offer:', error);
      this.ui.showError(this.getHumanReadableError(error));
    }
  }

  async handleAnswerReceived(answer) {
    try {
      await this.connection.handleAnswer(answer);
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
      await this.transfer.sendFile(file, this.connection.getDataChannel());
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


