// Whoosh.share — UI Manager
// Handles all UI state changes, animations, and user interactions

export class UIManager {
  constructor() {
    this.elements = {};
    this.devices = new Map();
    this.eventHandlers = new Map();
    this.currentState = 'idle';
  }

  init() {
    // Cache DOM elements
    this.elements = {
      radar: document.getElementById('radar'),
      radarCenter: document.getElementById('radarCenter'),
      radarIcon: document.getElementById('radarIcon'),
      radarPulse: document.getElementById('radarPulse'),
      deviceBubbles: document.getElementById('deviceBubbles'),
      statusText: document.getElementById('statusText'),
      statusHint: document.getElementById('statusHint'),
      actionBtn: document.getElementById('actionBtn'),
      deviceInfo: document.getElementById('deviceInfo'),
      bottomSheet: document.getElementById('bottomSheet'),
      bottomSheetBackdrop: document.getElementById('bottomSheetBackdrop'),
      bottomSheetContent: document.getElementById('bottomSheetContent'),
      errorToast: document.getElementById('errorToast'),
      errorToastText: document.getElementById('errorToastText')
    };

    // Set up event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Action button
    this.elements.actionBtn.addEventListener('click', () => {
      if (this.currentState === 'idle') {
        this.emit('startDiscovery');
      } else if (this.currentState === 'listening') {
        this.emit('cancelDiscovery');
      }
    });

    // Bottom sheet backdrop (close on click)
    this.elements.bottomSheetBackdrop.addEventListener('click', () => {
      this.hideBottomSheet();
    });
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

  // State management
  setState(state) {
    this.currentState = state;

    switch (state) {
      case 'idle':
        this.showIdleState();
        break;
      case 'listening':
        this.showListeningState();
        break;
      case 'connected':
        this.showConnectedState();
        break;
      case 'transferring':
        this.showTransferringState();
        break;
    }
  }

  showIdleState() {
    // Update button
    this.elements.actionBtn.textContent = 'Start Discovery';
    this.elements.actionBtn.disabled = false;

    // Update status
    this.elements.statusText.textContent = 'Tap to find nearby devices';
    this.elements.statusHint.style.display = 'none';

    // Hide pulse animation
    this.elements.radarPulse.style.display = 'none';
    this.elements.radarCenter.classList.remove('active');

    // Update radar icon to mic
    this.updateRadarIcon('mic');
  }

  showListeningState() {
    // Update button
    this.elements.actionBtn.textContent = 'Cancel';
    this.elements.actionBtn.disabled = false;

    // Update status
    this.elements.statusText.textContent = 'Listening for devices…';
    this.elements.statusHint.style.display = 'flex';

    // Show pulse animation
    this.elements.radarPulse.style.display = 'block';
    this.elements.radarCenter.classList.add('active');

    // Update radar icon to waveform
    this.updateRadarIcon('waveform');
  }

  showConnectedState() {
    this.elements.statusText.textContent = 'Connected';
    this.elements.radarCenter.classList.add('active');
  }

  showTransferringState() {
    // State is managed by transfer progress updates
  }

  // Device management
  addDevice(device) {
    if (this.devices.has(device.id)) {
      return; // Device already exists
    }

    this.devices.set(device.id, device);

    // Create device bubble
    const bubble = this.createDeviceBubble(device);
    this.elements.deviceBubbles.appendChild(bubble);

    // Position bubble on radar
    this.positionDeviceBubbles();

    // Update status text
    const deviceCount = this.devices.size;
    this.elements.statusText.textContent = 
      deviceCount === 1 ? '1 device nearby' : `${deviceCount} devices nearby`;
  }

  createDeviceBubble(device) {
    const bubble = document.createElement('div');
    bubble.className = 'device-bubble';
    bubble.dataset.deviceId = device.id;

    // Device icon
    const icon = document.createElement('div');
    icon.className = 'device-bubble-icon';
    icon.textContent = this.getDeviceIcon(device.type);
    bubble.appendChild(icon);

    // Device name
    const name = document.createElement('div');
    name.className = 'device-bubble-name';
    name.textContent = device.name;
    bubble.appendChild(name);

    // Click handler
    bubble.addEventListener('click', () => {
      this.emit('deviceSelected', device);
    });

    return bubble;
  }

  positionDeviceBubbles() {
    const bubbles = this.elements.deviceBubbles.querySelectorAll('.device-bubble');
    const total = bubbles.length;
    const radius = 95; // Distance from center (sits on middle ring)

    bubbles.forEach((bubble, index) => {
      const angle = (index / total) * 2 * Math.PI - Math.PI / 2; // Start from top
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      bubble.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
    });
  }

  clearDevices() {
    this.devices.clear();
    this.elements.deviceBubbles.innerHTML = '';
  }

  getDeviceIcon(type) {
    const icons = {
      phone: '📱',
      tablet: '📱',
      laptop: '💻'
    };
    return icons[type] || '💻';
  }

  // Radar icon updates
  updateRadarIcon(type) {
    const icons = {
      mic: `
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      `,
      waveform: `
        <line x1="12" y1="2" x2="12" y2="22"></line>
        <line x1="8" y1="6" x2="8" y2="18"></line>
        <line x1="16" y1="6" x2="16" y2="18"></line>
        <line x1="4" y1="10" x2="4" y2="14"></line>
        <line x1="20" y1="10" x2="20" y2="14"></line>
      `,
      download: `
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      `
    };

    this.elements.radarIcon.innerHTML = icons[type] || icons.mic;
  }

  // Bottom sheet management
  showFilePicker(device) {
    const content = `
      <div style="text-align: center;">
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">
          Sending to
        </p>
        <p style="font-size: 17px; font-weight: 600; margin-bottom: 24px;">
          ${this.getDeviceIcon(device.type)} ${device.name}
        </p>
        
        <div style="border: 2px dashed var(--border); border-radius: var(--radius-md); padding: 48px 24px; margin-bottom: 16px; cursor: pointer; transition: all 0.2s;" id="dropZone">
          <p style="font-size: 15px; color: var(--text-secondary);">
            Drop file here<br>or tap to browse
          </p>
        </div>
        
        <div id="filePreview" style="display: none; background: var(--surface-2); border-radius: var(--radius-md); padding: 16px; margin-bottom: 16px;">
          <p id="fileName" style="font-size: 15px; font-weight: 500; margin-bottom: 4px;"></p>
          <p id="fileSize" style="font-size: 13px; color: var(--text-secondary);"></p>
        </div>
        
        <button class="btn btn-primary" id="sendBtn" disabled>Send →</button>
      </div>
    `;

    this.showBottomSheet(content);

    // Set up file picker
    const dropZone = document.getElementById('dropZone');
    const filePreview = document.getElementById('filePreview');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const sendBtn = document.getElementById('sendBtn');

    let selectedFile = null;

    // Create hidden file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.style.display = 'none';

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = this.formatFileSize(file.size);
        filePreview.style.display = 'block';
        sendBtn.disabled = false;
      }
    });

    dropZone.addEventListener('click', () => {
      fileInput.click();
    });

    // Drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--accent)';
      dropZone.style.backgroundColor = 'var(--accent-light)';
    });

    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.backgroundColor = 'transparent';
    });

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = 'var(--border)';
      dropZone.style.backgroundColor = 'transparent';

      const file = e.dataTransfer.files[0];
      if (file) {
        selectedFile = file;
        fileName.textContent = file.name;
        fileSize.textContent = this.formatFileSize(file.size);
        filePreview.style.display = 'block';
        sendBtn.disabled = false;
      }
    });

    sendBtn.addEventListener('click', () => {
      if (selectedFile) {
        this.emit('filePicked', selectedFile);
      }
    });
  }

  showReceiving(metadata) {
    const content = `
      <div style="text-align: center;">
        <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 16px;">
          Receiving from
        </p>
        <p style="font-size: 17px; font-weight: 600; margin-bottom: 24px;">
          ${metadata.deviceName || 'Unknown Device'}
        </p>
        
        <div style="background: var(--surface-2); border-radius: var(--radius-md); padding: 24px; margin-bottom: 16px;">
          <p style="font-size: 15px; font-weight: 500; margin-bottom: 8px;">${metadata.name}</p>
          <p style="font-size: 13px; color: var(--text-secondary);">${this.formatFileSize(metadata.size)}</p>
        </div>
        
        <div style="width: 100%; height: 6px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin-bottom: 8px;">
          <div id="progressBar" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.3s;"></div>
        </div>
        
        <p id="progressText" style="font-size: 13px; color: var(--text-secondary); font-family: monospace;">
          0 MB / ${this.formatFileSize(metadata.size)} · 0%
        </p>
      </div>
    `;

    this.showBottomSheet(content);
  }

  showSending(file, device) {
    const content = `
      <div style="text-align: center;">
        <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 16px;">
          Sending to
        </p>
        <p style="font-size: 17px; font-weight: 600; margin-bottom: 24px;">
          ${device ? `${this.getDeviceIcon(device.type)} ${device.name}` : 'Nearby device'}
        </p>
        
        <div style="background: var(--surface-2); border-radius: var(--radius-md); padding: 24px; margin-bottom: 16px;">
          <p style="font-size: 15px; font-weight: 500; margin-bottom: 8px;">${file.name}</p>
          <p style="font-size: 13px; color: var(--text-secondary);">${this.formatFileSize(file.size)}</p>
        </div>
        
        <div style="width: 100%; height: 6px; background: var(--surface-2); border-radius: 99px; overflow: hidden; margin-bottom: 8px;">
          <div id="progressBar" style="width: 0%; height: 100%; background: var(--accent); transition: width 0.3s;"></div>
        </div>
        
        <p id="progressText" style="font-size: 13px; color: var(--text-secondary); font-family: monospace;">
          0 B / ${this.formatFileSize(file.size)} · 0%
        </p>

        <button class="btn btn-secondary" id="cancelTransferBtn" style="margin-top: 16px;">Cancel</button>
      </div>
    `;

    this.showBottomSheet(content);

    const cancelTransferBtn = document.getElementById('cancelTransferBtn');
    if (cancelTransferBtn) {
      cancelTransferBtn.addEventListener('click', () => {
        this.emit('cancelTransfer');
      });
    }
  }

  updateTransferProgress(progress) {
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    if (progressBar && progressText) {
      progressBar.style.width = `${progress.percentage}%`;
      
      const transferred = this.formatFileSize(progress.transferred);
      const total = this.formatFileSize(progress.total);
      const speed = progress.speed ? ` · ${this.formatFileSize(progress.speed)}/s` : '';
      const eta = progress.eta ? ` · ${progress.eta}s left` : '';
      
      progressText.textContent = `${transferred} / ${total} · ${Math.round(progress.percentage)}%${speed}${eta}`;
    }
  }

  showTransferComplete(file) {
    const content = `
      <div style="text-align: center;">
        <div style="width: 48px; height: 48px; margin: 0 auto 16px; background: var(--success); border-radius: 50%; display: flex; align-items: center; justify-content: center; animation: checkmark-scale 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        
        <p style="font-size: 17px; font-weight: 600; margin-bottom: 8px;">
          ${file.sent ? 'Sent successfully' : 'Received successfully'}
        </p>
        <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 24px;">
          ${file.name} · ${this.formatFileSize(file.size)}
        </p>
        
        ${file.sent ? `
          <button class="btn btn-primary" id="sendAnotherBtn">Send another</button>
        ` : `
          <button class="btn btn-primary" id="saveBtn">Save to device</button>
        `}
        
        <button class="btn btn-secondary" id="doneBtn" style="margin-top: 8px;">Done</button>
      </div>
      
      <style>
        @keyframes checkmark-scale {
          0% { transform: scale(0); }
          50% { transform: scale(1.15); }
          100% { transform: scale(1); }
        }
      </style>
    `;

    this.showBottomSheet(content);

    // Event handlers
    const sendAnotherBtn = document.getElementById('sendAnotherBtn');
    const saveBtn = document.getElementById('saveBtn');
    const doneBtn = document.getElementById('doneBtn');

    if (sendAnotherBtn) {
      sendAnotherBtn.addEventListener('click', () => {
        // Re-show file picker for the same device
        this.hideBottomSheet();
        // TODO: Need to store current device reference
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.downloadFile(file.blob, file.name);
      });
    }

    if (doneBtn) {
      doneBtn.addEventListener('click', () => {
        this.hideBottomSheet();
      });
    }
  }

  showBottomSheet(content) {
    this.elements.bottomSheetContent.innerHTML = content;
    this.elements.bottomSheet.style.display = 'block';
    this.elements.bottomSheetBackdrop.style.display = 'block';
  }

  hideBottomSheet() {
    this.elements.bottomSheet.style.display = 'none';
    this.elements.bottomSheetBackdrop.style.display = 'none';
  }

  // Error handling
  showError(message) {
    this.elements.errorToastText.textContent = message;
    this.elements.errorToast.style.display = 'block';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.elements.errorToast.style.display = 'none';
    }, 5000);
  }

  // Utility functions
  setDeviceInfo(name) {
    this.elements.deviceInfo.textContent = `Your device: ${name}`;
  }

  setStatus(text) {
    this.elements.statusText.textContent = text;
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

