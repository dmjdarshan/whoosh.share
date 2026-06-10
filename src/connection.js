// Whoosh.share — WebRTC Connection Manager
// Handles peer-to-peer connection setup and management

export class ConnectionManager {
  constructor() {
    this.pc = null; // RTCPeerConnection
    this.dataChannel = null;
    this.eventHandlers = new Map();
    this.iceGatheringComplete = false;
    
    // Same-LAN transfer: gather host candidates only, matching wave-share's serverless model.
    this.config = {
      iceServers: []
    };
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
      handlers.forEach(handler => handler(data));
    }
  }

  // Create WebRTC offer (sender side)
  async createOffer() {
    console.log('[Connection] Creating offer...');

    // Create peer connection
    this.pc = new RTCPeerConnection(this.config);
    this.setupPeerConnectionHandlers();

    // Create data channel
    this.dataChannel = this.pc.createDataChannel('whoosh-transfer', {
      ordered: true,
      maxRetransmits: 3
    });
    this.setupDataChannelHandlers();

    // Create offer
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForICEGathering();

    // Return complete offer with ICE candidates
    return {
      type: this.pc.localDescription.type,
      sdp: this.pc.localDescription.sdp
    };
  }

  // Handle incoming offer and create answer (receiver side)
  async handleOffer(offer) {
    console.log('[Connection] Handling offer...');

    // Create peer connection
    this.pc = new RTCPeerConnection(this.config);
    this.setupPeerConnectionHandlers();

    // Set up data channel handler (receiver waits for channel)
    this.pc.ondatachannel = (event) => {
      console.log('[Connection] Data channel received');
      this.dataChannel = event.channel;
      this.setupDataChannelHandlers();
    };

    // Set remote description (the offer)
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Create answer
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // Wait for ICE gathering
    await this.waitForICEGathering();

    // Return complete answer with ICE candidates
    return {
      type: this.pc.localDescription.type,
      sdp: this.pc.localDescription.sdp
    };
  }

  // Handle incoming answer (sender side)
  async handleAnswer(answer) {
    console.log('[Connection] Handling answer...');

    if (!this.pc) {
      throw new Error('No peer connection exists');
    }

    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
  }

  // Set up peer connection event handlers
  setupPeerConnectionHandlers() {
    this.pc.oniceconnectionstatechange = () => {
      console.log('[Connection] ICE connection state:', this.pc.iceConnectionState);

      switch (this.pc.iceConnectionState) {
        case 'connected':
        case 'completed':
          this.emit('connected');
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
          this.emit('disconnected');
          break;
      }
    };

    this.pc.onconnectionstatechange = () => {
      console.log('[Connection] Connection state:', this.pc.connectionState);

      if (this.pc.connectionState === 'failed') {
        this.emit('error', new Error('Connection failed'));
      }
    };

    this.pc.onicegatheringstatechange = () => {
      console.log('[Connection] ICE gathering state:', this.pc.iceGatheringState);
      
      if (this.pc.iceGatheringState === 'complete') {
        this.iceGatheringComplete = true;
      }
    };
  }

  // Set up data channel event handlers
  setupDataChannelHandlers() {
    this.dataChannel.onopen = () => {
      console.log('[Connection] Data channel opened');
      this.emit('dataChannelOpen');
    };

    this.dataChannel.onclose = () => {
      console.log('[Connection] Data channel closed');
      this.emit('dataChannelClose');
    };

    this.dataChannel.onerror = (error) => {
      console.error('[Connection] Data channel error:', error);
      this.emit('error', error);
    };

    this.dataChannel.onmessage = (event) => {
      this.emit('message', event.data);
    };

    // Set buffer threshold for backpressure handling
    this.dataChannel.bufferedAmountLowThreshold = 512 * 1024; // 512KB

    this.dataChannel.onbufferedamountlow = () => {
      this.emit('bufferLow');
    };
  }

  // Wait for ICE gathering to complete
  waitForICEGathering() {
    return new Promise((resolve, reject) => {
      // If already complete, resolve immediately
      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      // Set timeout (10 seconds)
      const timeout = setTimeout(() => {
        reject(new Error('ICE gathering timeout'));
      }, 10000);

      // Listen for gathering complete
      const checkState = () => {
        if (this.pc.iceGatheringState === 'complete') {
          clearTimeout(timeout);
          resolve();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);
    });
  }

  // Check if connected
  isConnected() {
    return this.dataChannel && this.dataChannel.readyState === 'open';
  }

  // Get data channel for file transfer
  getDataChannel() {
    return this.dataChannel;
  }

  // Send data through data channel
  send(data) {
    if (!this.isConnected()) {
      throw new Error('Data channel not open');
    }
    this.dataChannel.send(data);
  }

  // Close connection
  close() {
    console.log('[Connection] Closing connection...');

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.iceGatheringComplete = false;
  }

  // Get connection stats (for debugging)
  async getStats() {
    if (!this.pc) {
      return null;
    }

    const stats = await this.pc.getStats();
    const result = {};

    stats.forEach((report) => {
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        result.candidatePair = report;
      }
      if (report.type === 'data-channel') {
        result.dataChannel = report;
      }
    });

    return result;
  }
}

