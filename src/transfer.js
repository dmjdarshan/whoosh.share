// Whoosh.share — File Transfer Manager
// Handles file chunking, sending, receiving, and progress tracking

export class TransferManager {
  constructor() {
    this.eventHandlers = new Map();
    this.currentTransfer = null;
    this.receivingFile = null;
    this.receivingBatch = null;
    this.CHUNK_SIZE = 512 * 1024; // 512KB chunks
    this.cancelled = false;
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

  // Send file through data channel
  async sendFile(file, dataChannel, senderDevice = null) {
    await this.sendFiles([file], dataChannel, senderDevice);
  }

  async sendFiles(files, dataChannel, senderDevice = null) {
    if (!files.length) {
      return;
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const batchId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    console.log('[Transfer] Starting batch send:', files.length, totalSize);

    this.cancelled = false;
    this.currentTransfer = {
      files,
      dataChannel,
      startTime: Date.now(),
      transferred: 0,
      total: totalSize
    };

    try {
      for (let index = 0; index < files.length; index++) {
        await this.sendOneFile(files[index], dataChannel, senderDevice, {
          batchId,
          fileIndex: index,
          totalFiles: files.length
        });
      }

      if (this.cancelled) {
        throw new Error('Transfer cancelled');
      }

      console.log('[Transfer] Batch send complete');
      this.emit('complete', {
        name: files.length === 1 ? files[0].name : `${files.length} files`,
        size: totalSize,
        sent: true,
        files: files.map((file) => ({ name: file.name, size: file.size }))
      });
    } catch (error) {
      console.error('[Transfer] Send error:', error);
      this.emit('error', error);
    } finally {
      this.currentTransfer = null;
    }
  }

  async sendOneFile(file, dataChannel, senderDevice = null, batch = null) {
    console.log('[Transfer] Starting file send:', file.name, file.size);

    try {
      // Send file metadata first
      const metadata = {
        type: 'metadata',
        name: file.name,
        size: file.size,
        mimeType: file.type,
        deviceName: senderDevice ? senderDevice.name : undefined,
        deviceType: senderDevice ? senderDevice.type : undefined,
        batchId: batch ? batch.batchId : undefined,
        fileIndex: batch ? batch.fileIndex : 0,
        totalFiles: batch ? batch.totalFiles : 1
      };
      dataChannel.send(JSON.stringify(metadata));

      // Read file as array buffer
      const buffer = await file.arrayBuffer();

      // Send file in chunks
      let offset = 0;
      const totalChunks = Math.ceil(buffer.byteLength / this.CHUNK_SIZE);
      let chunkIndex = 0;

      while (offset < buffer.byteLength && !this.cancelled) {
        // Check buffer and wait if needed (backpressure handling)
        if (dataChannel.bufferedAmount > this.CHUNK_SIZE * 4) {
          await this.waitForBufferDrain(dataChannel);
        }

        // Get chunk
        const chunk = buffer.slice(offset, offset + this.CHUNK_SIZE);
        
        // Send chunk
        dataChannel.send(chunk);

        // Update progress
        offset += chunk.byteLength;
        chunkIndex++;
        this.currentTransfer.transferred += chunk.byteLength;

        // Emit progress event
        this.emitProgress();

        // Small delay to prevent overwhelming the channel
        if (chunkIndex % 10 === 0) {
          await this.sleep(10);
        }
      }

      if (this.cancelled) {
        throw new Error('Transfer cancelled');
      }

      // Send completion marker
      const completion = {
        type: 'complete',
        name: file.name,
        size: file.size,
        batchId: batch ? batch.batchId : undefined,
        fileIndex: batch ? batch.fileIndex : 0,
        totalFiles: batch ? batch.totalFiles : 1
      };
      dataChannel.send(JSON.stringify(completion));

      console.log('[Transfer] File send complete');
    } catch (error) {
      throw error;
    }
  }

  // Set up receiver for incoming file
  setupReceiver(dataChannel) {
    console.log('[Transfer] Setting up receiver...');

    dataChannel.onmessage = async (event) => {
      await this.handleIncomingMessage(event.data);
    };
  }

  async handleIncomingMessage(data) {
    try {
      if (typeof data === 'string') {
        await this.handleControlMessage(JSON.parse(data));
        return;
      }

      this.handleChunk(data);
    } catch (error) {
      console.error('[Transfer] Receive error:', error);
      this.emit('error', error);
    }
  }

  async handleControlMessage(message) {
    if (message.type === 'metadata') {
      console.log('[Transfer] Receiving file:', message.name, message.size);

      this.receivingFile = {
        name: message.name,
        size: message.size,
        mimeType: message.mimeType,
        chunks: [],
        received: 0,
        startTime: Date.now(),
        batchId: message.batchId,
        fileIndex: message.fileIndex || 0,
        totalFiles: message.totalFiles || 1
      };

      if (this.receivingFile.totalFiles > 1 && (!this.receivingBatch || this.receivingBatch.id !== this.receivingFile.batchId)) {
        this.receivingBatch = {
          id: this.receivingFile.batchId,
          total: this.receivingFile.totalFiles,
          files: [],
          size: 0
        };
      }

      this.emit('receiving', {
        name: message.name,
        size: message.size,
        mimeType: message.mimeType,
        deviceName: message.deviceName,
        deviceType: message.deviceType,
        fileIndex: this.receivingFile.fileIndex,
        totalFiles: this.receivingFile.totalFiles
      });
    } else if (message.type === 'complete') {
      console.log('[Transfer] File receive complete');
      await this.finalizeReceivedFile();
    }
  }

  handleChunk(chunk) {
    if (!this.receivingFile) {
      return;
    }

    this.receivingFile.chunks.push(chunk);
    this.receivingFile.received += chunk.byteLength || chunk.size || 0;
    this.emitReceiveProgress();
  }

  // Finalize received file
  async finalizeReceivedFile() {
    if (!this.receivingFile) {
      return;
    }

    try {
      // Combine all chunks into a single blob
      const blob = new Blob(this.receivingFile.chunks, { 
        type: this.receivingFile.mimeType 
      });

      console.log('[Transfer] File assembled:', blob.size, 'bytes');

      if (this.receivingFile.totalFiles > 1) {
        const receivedFile = {
          name: this.receivingFile.name,
          size: this.receivingFile.size,
          blob
        };

        this.receivingBatch.files[this.receivingFile.fileIndex] = receivedFile;
        this.receivingBatch.size += this.receivingFile.size;

        if (this.receivingBatch.files.filter(Boolean).length === this.receivingBatch.total) {
          this.emit('complete', {
            name: `${this.receivingBatch.total} files`,
            size: this.receivingBatch.size,
            files: this.receivingBatch.files,
            sent: false
          });
          this.receivingBatch = null;
        }
      } else {
        this.emit('complete', {
          name: this.receivingFile.name,
          size: this.receivingFile.size,
          blob: blob,
          sent: false
        });
      }

    } catch (error) {
      console.error('[Transfer] Finalize error:', error);
      this.emit('error', error);
    } finally {
      this.receivingFile = null;
    }
  }

  // Emit progress for sending
  emitProgress() {
    if (!this.currentTransfer) {
      return;
    }

    const elapsed = (Date.now() - this.currentTransfer.startTime) / 1000; // seconds
    const speed = elapsed > 0 ? this.currentTransfer.transferred / elapsed : 0;
    const remaining = this.currentTransfer.total - this.currentTransfer.transferred;
    const eta = speed > 0 ? Math.round(remaining / speed) : 0;

    this.emit('progress', {
      transferred: this.currentTransfer.transferred,
      total: this.currentTransfer.total,
      percentage: this.currentTransfer.total === 0
        ? 100
        : (this.currentTransfer.transferred / this.currentTransfer.total) * 100,
      speed: speed,
      eta: eta
    });
  }

  // Emit progress for receiving
  emitReceiveProgress() {
    if (!this.receivingFile) {
      return;
    }

    const elapsed = (Date.now() - this.receivingFile.startTime) / 1000;
    const speed = elapsed > 0 ? this.receivingFile.received / elapsed : 0;
    const remaining = this.receivingFile.size - this.receivingFile.received;
    const eta = speed > 0 ? Math.round(remaining / speed) : 0;

    this.emit('progress', {
      transferred: this.receivingFile.received,
      total: this.receivingFile.size,
      percentage: this.receivingFile.size === 0
        ? 100
        : (this.receivingFile.received / this.receivingFile.size) * 100,
      speed: speed,
      eta: eta
    });
  }

  // Wait for data channel buffer to drain
  waitForBufferDrain(dataChannel) {
    return new Promise((resolve) => {
      const checkBuffer = () => {
        if (dataChannel.bufferedAmount < this.CHUNK_SIZE * 2) {
          resolve();
        } else {
          setTimeout(checkBuffer, 50);
        }
      };
      checkBuffer();
    });
  }

  // Cancel current transfer
  cancel() {
    console.log('[Transfer] Cancelling transfer...');
    this.cancelled = true;
    this.currentTransfer = null;
    this.receivingFile = null;
    this.receivingBatch = null;
  }

  // Utility: sleep
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get current transfer status
  getStatus() {
    if (this.currentTransfer) {
      return {
        type: 'sending',
        file: this.currentTransfer.file.name,
        progress: this.currentTransfer.total === 0
          ? 100
          : (this.currentTransfer.transferred / this.currentTransfer.total) * 100
      };
    }

    if (this.receivingFile) {
      return {
        type: 'receiving',
        file: this.receivingFile.name,
        progress: this.receivingFile.size === 0
          ? 100
          : (this.receivingFile.received / this.receivingFile.size) * 100
      };
    }

    return null;
  }
}
