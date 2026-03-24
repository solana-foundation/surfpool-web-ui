import { EventEmitter } from 'events';
import { logger } from '@surfpool/shared';

export interface WebSocketMessage {
  type: 'slot' | 'transaction';
  data: any;
}

export interface WebSocketSubscription {
  id: string;
  type: 'slot' | 'transaction';
  unsubscribe: () => void;
}

class SolanaWebSocketService extends EventEmitter {
  private ws: WebSocket | null = null;
  private wsUrl: string | null = null;
  private subscriptions = new Map<string, WebSocketSubscription>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private isConnecting = false;
  private connectionTimeout: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  // Utility method to convert HTTP URL to WebSocket URL
  static convertHttpToWebSocket(httpUrl: string): string {
    if (!httpUrl) return httpUrl;
    
    // If already a WebSocket URL, return as is
    if (httpUrl.startsWith('ws://') || httpUrl.startsWith('wss://')) {
      return httpUrl;
    }
    
    // Convert HTTP to WebSocket
    if (httpUrl.startsWith('http://')) {
      return httpUrl.replace('http://', 'ws://');
    }
    
    if (httpUrl.startsWith('https://')) {
      return httpUrl.replace('https://', 'wss://');
    }
    
    // If no protocol specified, assume HTTP and convert to WebSocket
    if (!httpUrl.includes('://')) {
      return `ws://${httpUrl}`;
    }
    
    return httpUrl;
  }

  connect(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // If already connected, resolve immediately
      if (this.ws?.readyState === WebSocket.OPEN) {
        logger.log('🔗 WebSocket already connected');
        resolve();
        return;
      }

      // If connecting, wait for the existing connection to complete
      if (this.isConnecting) {
        logger.log('⏳ Connection already in progress, waiting for completion...');
        
        // Wait for connection to complete or fail
        const checkConnection = () => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            logger.log('🔗 Existing connection completed successfully');
            resolve();
          } else if (this.ws?.readyState === WebSocket.CLOSED && !this.isConnecting) {
            logger.log('🔌 Existing connection failed, retrying...');
            // Retry the connection after a short delay
            setTimeout(() => {
              this.connect(wsUrl).then(resolve).catch(reject);
            }, 1000);
          } else {
            // Still connecting, check again in 100ms
            setTimeout(checkConnection, 100);
          }
        };
        
        checkConnection();
        return;
      }

      // If WebSocket exists but is in a bad state, clean it up
      if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
        logger.log('🧹 Cleaning up existing WebSocket connection');
        this.ws.close();
        this.ws = null;
      }

      logger.log('🔗 Attempting to connect to:', wsUrl);
      logger.log('🔗 WebSocket URL type:', typeof wsUrl);
      logger.log('🔗 WebSocket URL length:', wsUrl?.length);
      
      // Validate WebSocket URL format
      if (!wsUrl || typeof wsUrl !== 'string') {
        reject(new Error('Invalid WebSocket URL: URL must be a non-empty string'));
        return;
      }
      
      if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
        console.warn('⚠️ WebSocket URL does not start with ws:// or wss://:', wsUrl);
      }
      
      this.isConnecting = true;
      this.wsUrl = wsUrl;

      try {
        logger.log('🔗 Creating WebSocket connection...');
        this.ws = new WebSocket(wsUrl);
        
        this.connectionTimeout = setTimeout(() => {
          this.isConnecting = false;
          console.error('⏰ Connection timeout after 10 seconds');
          reject(new Error('Connection timeout after 10 seconds'));
        }, 10000);

        this.ws.onopen = () => {
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          logger.log('🔗 WebSocket connected successfully');
          this.emit('connected');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (error) {
            console.error('❌ Failed to parse WebSocket message:', error);
          }
        };

        this.ws.onerror = (error) => {
          this.isConnecting = false;
          console.error('❌ WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        };

        this.ws.onclose = (event) => {
          this.isConnecting = false;
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }
          logger.log('🔌 WebSocket closed:', event.code, event.reason);
          this.emit('disconnected', event);
          
          // Attempt reconnection if not manually closed
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            logger.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            setTimeout(() => {
              this.connect(wsUrl).catch(console.error);
            }, this.reconnectDelay * this.reconnectAttempts);
          }
        };

      } catch (error) {
        this.isConnecting = false;
        console.error('❌ Failed to create WebSocket:', error);
        reject(error);
      }
    });
  }

  private handleMessage(data: any) {
    
    // Handle slot subscription messages
    if (data.method === 'slotNotification') {
      this.emit('slot', data.params?.result);
      return;
    }

    // Handle transaction log subscription messages
    if (data.method === 'logsNotification') {
      this.emit('transaction', data.params?.result);
      return;
    }

    // Handle subscription confirmations
    if (data.result !== undefined || data.error !== undefined) {
      this.emit('subscription', data);
    }
  }

  subscribeToSlots(): Promise<string> {
    return this.subscribe('slot', {
      jsonrpc: '2.0',
      id: 1,
      method: 'slotSubscribe'
    });
  }

  subscribeToTransactions(filter?: { account?: string; program?: string }): Promise<string> {
    // Generate a unique ID for this subscription
    const subscriptionId = Date.now();
    
    let message: any;
    
    if (filter?.account || filter?.program) {
      // Filtered subscription
      const mentions = [];
      if (filter.account) mentions.push(filter.account);
      if (filter.program) mentions.push(filter.program);

      message = {
        jsonrpc: '2.0',
        id: subscriptionId,
        method: 'logsSubscribe',
        params: [
          {
            mentions: mentions
          },
          {
            commitment: 'processed'
          }
        ]
      };
    } else {
      // Subscribe to all logs (no filter)
      message = {
        jsonrpc: '2.0',
        id: subscriptionId,
        method: 'logsSubscribe',
        params: [
          'all',
          {
            commitment: 'processed'
          }
        ]
      };
    }

    return this.subscribe('transaction', message);
  }

  private subscribe(type: 'slot' | 'transaction', message: any): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      try {
        logger.log(`📤 Sending ${type} subscription message:`, message);
        this.ws.send(JSON.stringify(message));
        
        // Wait for subscription confirmation
        const onSubscription = (data: any) => {
          logger.log(`📥 Received subscription response for ${type}:`, data);
          
          // Check for successful subscription response
          if (data.id === message.id) {
            if (data.result !== undefined) {
              this.removeListener('subscription', onSubscription);
              
              const subscriptionId = data.result;
              logger.log(`✅ ${type} subscription confirmed with ID:`, subscriptionId);
              
              // Store subscription info with actual server ID
              this.subscriptions.set(subscriptionId, {
                id: subscriptionId,
                type,
                unsubscribe: () => this.unsubscribe(subscriptionId, type)
              });
              
              resolve(subscriptionId);
            } else if (data.error) {
              this.removeListener('subscription', onSubscription);
              console.error(`❌ ${type} subscription error:`, data.error);
              reject(new Error(`${type} subscription failed: ${data.error.message || 'Unknown error'}`));
            }
          }
        };

        this.on('subscription', onSubscription);

        // Timeout after 10 seconds (increased from 5)
        setTimeout(() => {
          this.removeListener('subscription', onSubscription);
          console.warn(`⏰ ${type} subscription timeout - no response received`);
          reject(new Error(`${type} subscription timeout`));
        }, 10000);

      } catch (error) {
        console.error(`❌ Failed to send ${type} subscription:`, error);
        reject(error);
      }
    });
  }

  private unsubscribe(subscriptionId: string, type: 'slot' | 'transaction') {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const method = type === 'slot' ? 'slotUnsubscribe' : 'logsUnsubscribe';
    
    try {
      this.ws.send(JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params: [subscriptionId]
      }));
    } catch (error) {
      console.error('❌ Failed to unsubscribe:', error);
    }
  }

  unsubscribeAll() {
    this.subscriptions.forEach((subscription) => {
      subscription.unsubscribe();
    });
    this.subscriptions.clear();
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Manual disconnect');
      this.ws = null;
    }
    this.subscriptions.clear();
    this.isConnecting = false;
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  getConnectionStatus(): 'connecting' | 'connected' | 'disconnected' {
    if (this.isConnecting) return 'connecting';
    if (this.isConnected()) return 'connected';
    return 'disconnected';
  }

  isConnectionInProgress(): boolean {
    return this.isConnecting;
  }

  getWebSocketState(): number | null {
    return this.ws?.readyState ?? null;
  }

  waitForConnection(timeout: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const timeoutId = setTimeout(() => {
        reject(new Error('Connection wait timeout'));
      }, timeout);

      const checkConnection = () => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          clearTimeout(timeoutId);
          resolve();
        } else if (this.ws?.readyState === WebSocket.CLOSED && !this.isConnecting) {
          clearTimeout(timeoutId);
          reject(new Error('Connection failed'));
        } else {
          setTimeout(checkConnection, 100);
        }
      };

      checkConnection();
    });
  }
}

// Export singleton instance
export const solanaWebSocketService = new SolanaWebSocketService();

// Export the class for static method access
export { SolanaWebSocketService }; 