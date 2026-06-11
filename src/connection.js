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

  createCompactSignal(kind, device) {
    if (!this.pc || !this.pc.localDescription) {
      throw new Error('No local description exists');
    }

    const parts = this.extractSignalParts(this.pc.localDescription.sdp);
    const mode = kind === 'answer' ? 'A' : 'O';
    const deviceType = (device && device.type ? device.type[0] : 'l').toLowerCase();
    let deviceName = encodeURIComponent((device && device.name) || 'Nearby device').slice(0, 18);

    if (kind === 'answer') {
      const signal = this.buildCompactSignal(mode, parts);
      console.log('[Connection] Compact signal length:', signal.length);
      return signal;
    }

    let signal = this.buildCompactSignal(mode, parts, deviceType, deviceName);
    if (signal.length > 135) {
      deviceName = '';
      signal = this.buildCompactSignal(mode, parts, deviceType, deviceName);
    }

    console.log('[Connection] Compact signal length:', signal.length);
    return signal;
  }

  buildCompactSignal(mode, parts, deviceType, deviceName) {
    return [
      mode,
      parts.ip,
      parts.port,
      parts.ufrag,
      parts.pwd,
      parts.fingerprint,
      deviceType,
      deviceName
    ].join('|');
  }

  expandCompactSignal(signal) {
    const [mode, ip, port, ufrag, pwd, fingerprint, deviceType, encodedName] = signal.split('|');

    if (!mode || !ip || !port || !ufrag || !pwd || !fingerprint) {
      throw new Error('Invalid compact signal');
    }

    const type = mode === 'A' ? 'answer' : 'offer';
    const setup = mode === 'A' ? 'active' : 'actpass';
    const fingerprintHex = this.base64UrlToHex(fingerprint);
    const sdp = this.buildSdpTemplate({
      type,
      setup,
      ip,
      port,
      ufrag,
      pwd,
      fingerprint: fingerprintHex
    });

    return {
      description: { type, sdp },
      device: {
        id: `${ip}:${port}`,
        name: encodedName ? decodeURIComponent(encodedName) : 'Nearby device',
        type: this.expandDeviceType(deviceType)
      }
    };
  }

  extractSignalParts(sdp) {
    const lines = sdp.split(/\r?\n/);
    const fingerprintLine = lines.find(line => line.startsWith('a=fingerprint:sha-256 '));
    const ufragLine = lines.find(line => line.startsWith('a=ice-ufrag:'));
    const pwdLine = lines.find(line => line.startsWith('a=ice-pwd:'));
    const candidateLine = this.selectCandidateLine(lines);
    const candidate = candidateLine ? candidateLine.substring(12).trim().split(/\s+/) : [];
    const mLine = lines.find(line => line.startsWith('m=application '));

    const ip = candidate[4] || '0.0.0.0';
    const port = candidate[5] || (mLine ? mLine.split(/\s+/)[1] : '9');

    if (!fingerprintLine || !ufragLine || !pwdLine || !ip || !port) {
      throw new Error('Could not compact SDP');
    }

    return {
      ip,
      port,
      ufrag: ufragLine.slice('a=ice-ufrag:'.length),
      pwd: pwdLine.slice('a=ice-pwd:'.length),
      fingerprint: this.hexToBase64Url(fingerprintLine.slice('a=fingerprint:sha-256 '.length))
    };
  }

  selectCandidateLine(lines) {
    const candidates = lines.filter(line => line.startsWith('a=candidate:') && line.includes(' typ host'));
    return candidates.find(line => / 192\.168\.| 10\.| 172\.(1[6-9]|2[0-9]|3[0-1])\./.test(line)) ||
      candidates.find(line => / (\d{1,3}\.){3}\d{1,3} /.test(line) && !line.includes(' 127.')) ||
      candidates[0];
  }

  buildSdpTemplate({ type, setup, ip, port, ufrag, pwd, fingerprint }) {
    const sessionId = type === 'answer' ? '1338' : '1337';
    return [
      'v=0',
      `o=- ${sessionId} 0 IN IP4 ${ip}`,
      's=-',
      't=0 0',
      'a=group:BUNDLE 0',
      'a=extmap-allow-mixed',
      'a=msid-semantic: WMS',
      `m=application ${port} UDP/DTLS/SCTP webrtc-datachannel`,
      `c=IN IP4 ${ip}`,
      `a=candidate:0 1 udp 2122260223 ${ip} ${port} typ host generation 0 network-id 1`,
      'a=end-of-candidates',
      `a=ice-ufrag:${ufrag}`,
      `a=ice-pwd:${pwd}`,
      'a=ice-options:trickle',
      `a=fingerprint:sha-256 ${fingerprint}`,
      `a=setup:${setup}`,
      'a=mid:0',
      'a=sctp-port:5000',
      'a=max-message-size:262144',
      ''
    ].join('\r\n');
  }

  expandDeviceType(type) {
    if (type === 'p') return 'phone';
    if (type === 't') return 'tablet';
    return 'laptop';
  }

  hexToBase64Url(hex) {
    const clean = hex.replace(/:/g, '');
    let binary = '';
    for (let i = 0; i < clean.length; i += 2) {
      binary += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  base64UrlToHex(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4);
    const binary = atob(padded);
    const parts = [];
    for (let i = 0; i < binary.length; i++) {
      parts.push(binary.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase());
    }
    return parts.join(':');
  }

  // Set up peer connection event handlers
  setupPeerConnectionHandlers() {
    this.pc.oniceconnectionstatechange = () => {
      console.log('[Connection] ICE connection state:', this.pc.iceConnectionState);

      switch (this.pc.iceConnectionState) {
        case 'checking':
          this.emit('checking');
          break;
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

      if (this.pc.connectionState === 'connecting') {
        this.emit('connecting');
      }

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
      this.pc.oniceconnectionstatechange = null;
      this.pc.onconnectionstatechange = null;
      this.pc.onicegatheringstatechange = null;
      this.pc.ondatachannel = null;
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
