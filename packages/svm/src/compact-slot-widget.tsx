'use client';

import { useEffect, useRef, useState } from 'react';
import { logger } from '@surfpool/shared';

interface CompactSlotWidgetProps {
  className?: string;
  rpcUrl: string;
  wsUrl: string;
  solanaWebSocketService: any; // We'll type this properly later
  /** If true, use direct WebSocket instead of shared service. Use when widget may remount. */
  cleanupOnUnmount?: boolean;
}

const TOTAL_BARS = 30; // 30 bars on desktop
const ACTIVE_SLOT_COLOR = '#00D4FF';
const INACTIVE_SLOT_COLOR = '#2F2F32';
const INACTIVE_SLOT_COLOR_MOBILE_LIGHT = '#18181b'; // zinc-900
const INACTIVE_SLOT_COLOR_MOBILE_DARK = '#18181b'; // zinc-900
const DISCONNECTED_SLOT_COLOR = '#ef4444'; // red-500

export default function CompactSlotWidget({
  className = '',
  rpcUrl,
  wsUrl,
  solanaWebSocketService: externalWsService,
  cleanupOnUnmount = false
}: CompactSlotWidgetProps) {
  const [mounted, setMounted] = useState(false);
  const [slotHeight, setSlotHeight] = useState<number>(0);
  const [epoch, setEpoch] = useState<number>(0);
  const [epochProgress, setEpochProgress] = useState<number>(0);
  const [activeBarIndex, setActiveBarIndex] = useState<number>(0);
  const [slotsInEpoch, setSlotsInEpoch] = useState<number>(432000);
  const [isClockPaused, setIsClockPaused] = useState<boolean>(false);
  const [dimmingPhase, setDimmingPhase] = useState<number>(0);
  const [isDisconnected, setIsDisconnected] = useState<boolean>(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(false);
  const lastSlotReceivedRef = useRef<number>(Date.now());
  const isClockPausedRef = useRef<boolean>(false);
  const slotsInEpochRef = useRef<number>(432000);

  // Direct WebSocket refs for cleanupOnUnmount mode
  const directWsRef = useRef<WebSocket | null>(null);
  const directSubscriptionIdRef = useRef<number | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    isClockPausedRef.current = isClockPaused;
  }, [isClockPaused]);

  useEffect(() => {
    slotsInEpochRef.current = slotsInEpoch;
  }, [slotsInEpoch]);

  // Fetch initial epoch data
  useEffect(() => {
    const fetchEpochData = async () => {
      try {
        const epochResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getEpochInfo',
          }),
        });
        const epochData = await epochResponse.json();
        if (epochData.result) {
          setEpoch(epochData.result.epoch);
          setSlotHeight(epochData.result.slotIndex);
          setSlotsInEpoch(epochData.result.slotsInEpoch);
          const progress = (epochData.result.slotIndex / epochData.result.slotsInEpoch) * 100;
          setEpochProgress(progress);
        }
      } catch (error) {
        console.error('Error fetching epoch info:', error);
      }
    };

    fetchEpochData();
  }, [rpcUrl]);

  // Handle slot data from either direct WS or service
  const handleSlotData = (slotData: any) => {
    if (slotData?.parent !== undefined) {
      const newSlot = slotData.parent;
      const currentSlotsInEpoch = slotsInEpochRef.current;
      const slotIndexInEpoch = newSlot % currentSlotsInEpoch;

      lastSlotReceivedRef.current = Date.now();
      setSlotHeight(slotIndexInEpoch);

      const progress = (slotIndexInEpoch / currentSlotsInEpoch) * 100;
      setEpochProgress(progress);

      const barIndex = slotIndexInEpoch % TOTAL_BARS;
      setActiveBarIndex(barIndex);
    }
  };

  // Direct WebSocket connection for cleanupOnUnmount mode
  useEffect(() => {
    if (!cleanupOnUnmount) return;

    let isMounted = true;
    let reconnectTimeout: NodeJS.Timeout | null = null;

    const connectDirectWebSocket = () => {
      // Close existing connection
      if (directWsRef.current) {
        directWsRef.current.close();
        directWsRef.current = null;
      }

      logger.log('CompactSlotWidget: Direct WS connecting to', wsUrl);
      const ws = new WebSocket(wsUrl);
      directWsRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) {
          ws.close();
          return;
        }
        logger.log('CompactSlotWidget: Direct WS connected');
        setIsDisconnected(false);

        // Subscribe to slots
        const subscribeMsg = {
          jsonrpc: '2.0',
          id: 1,
          method: 'slotSubscribe'
        };
        ws.send(JSON.stringify(subscribeMsg));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle subscription confirmation
          if (data.id === 1 && data.result !== undefined) {
            directSubscriptionIdRef.current = data.result;
            logger.log('CompactSlotWidget: Direct WS subscribed, ID:', data.result);
          }

          // Handle slot notifications
          if (data.method === 'slotNotification' && data.params?.result) {
            const slot = data.params.result?.parent;
            logger.log('CompactSlotWidget: Slot received:', slot);
            handleSlotData(data.params.result);
          }
        } catch (err) {
          console.error('CompactSlotWidget: Direct WS message parse error', err);
        }
      };

      ws.onclose = () => {
        logger.log('CompactSlotWidget: Direct WS closed');
        setIsDisconnected(true);
        directWsRef.current = null;
        directSubscriptionIdRef.current = null;

        // Reconnect after 2 seconds if still mounted
        if (isMounted) {
          reconnectTimeout = setTimeout(connectDirectWebSocket, 2000);
        }
      };

      ws.onerror = (err) => {
        console.error('CompactSlotWidget: Direct WS error', err);
        setIsDisconnected(true);
      };
    };

    connectDirectWebSocket();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (directWsRef.current) {
        logger.log('CompactSlotWidget: Cleaning up direct WS');
        directWsRef.current.close();
        directWsRef.current = null;
      }
    };
  }, [wsUrl, cleanupOnUnmount]);

  // Shared service WebSocket subscription (when not using cleanupOnUnmount)
  useEffect(() => {
    if (cleanupOnUnmount) return;

    let reconnectInterval: NodeJS.Timeout | null = null;
    let isSubscribing = false;
    let isMounted = true;

    const startSlotSubscription = async () => {
      if (isSubscribing || !isMounted) return;

      try {
        isSubscribing = true;
        await externalWsService.connect(wsUrl);
        if (!isMounted) return;

        await externalWsService.subscribeToSlots();
        logger.log('CompactSlotWidget: Service subscribed to slots');
        isSubscribing = false;
      } catch (error) {
        isSubscribing = false;
        console.error('CompactSlotWidget: Service subscription error:', error);
        if (isMounted) {
          setTimeout(startSlotSubscription, 2000);
        }
      }
    };

    // Listen for slot events from shared service
    const handleServiceSlot = (data: any) => {
      handleSlotData(data);
    };

    externalWsService.on('slot', handleServiceSlot);
    startSlotSubscription();

    reconnectInterval = setInterval(() => {
      const timeSinceLastSlot = Date.now() - lastSlotReceivedRef.current;
      if (timeSinceLastSlot > 5000 && isMounted) {
        logger.log('CompactSlotWidget: No slots received for 5s, reconnecting...');
        startSlotSubscription();
      }
    }, 5000);

    return () => {
      isMounted = false;
      if (reconnectInterval) clearInterval(reconnectInterval);
      externalWsService.off('slot', handleServiceSlot);
    };
  }, [wsUrl, cleanupOnUnmount, externalWsService]);


  // Listen for WebSocket connection status (only for shared service mode)
  useEffect(() => {
    if (cleanupOnUnmount) return; // Direct WS mode handles its own connection status

    const handleConnected = () => {
      logger.log('CompactSlotWidget: Service WebSocket connected');
      setIsDisconnected(false);
    };

    const handleDisconnected = () => {
      logger.log('CompactSlotWidget: Service WebSocket disconnected');
      setIsDisconnected(true);
    };

    externalWsService.on('connected', handleConnected);
    externalWsService.on('disconnected', handleDisconnected);

    setIsDisconnected(!externalWsService.isConnected());

    return () => {
      externalWsService.off('connected', handleConnected);
      externalWsService.off('disconnected', handleDisconnected);
    };
  }, [cleanupOnUnmount, externalWsService]);

  // Listen for global pause state changes from other components
  useEffect(() => {
    const handlePauseChange = (event: CustomEvent) => {
      logger.log('CompactSlotWidget: Received pause state change:', event.detail.isPaused);
      setIsClockPaused(event.detail.isPaused);
    };

    window.addEventListener('clockPauseStateChanged', handlePauseChange as EventListener);

    return () => {
      window.removeEventListener('clockPauseStateChanged', handlePauseChange as EventListener);
    };
  }, []);

  // Listen for epoch changes (e.g., from time travel)
  useEffect(() => {
    const handleEpochChange = (event: CustomEvent) => {
      logger.log('CompactSlotWidget: Received epoch change:', event.detail);
      if (event.detail.epoch !== undefined) {
        setEpoch(event.detail.epoch);
      }
      if (event.detail.slotIndex !== undefined) {
        setSlotHeight(event.detail.slotIndex);
        // Recalculate progress with the new slot index
        const progress = (event.detail.slotIndex / slotsInEpochRef.current) * 100;
        setEpochProgress(progress);
      }
    };

    window.addEventListener('epochChanged', handleEpochChange as EventListener);

    return () => {
      window.removeEventListener('epochChanged', handleEpochChange as EventListener);
    };
  }, []);

  // Blinking animation when clock is paused
  useEffect(() => {
    if (!isClockPaused) {
      setDimmingPhase(1); // Reset to visible when not paused
      return;
    }

    const blinkInterval = setInterval(() => {
      setDimmingPhase((prev) => (prev === 0 ? 1 : 0));
    }, 500); // Blink every 500ms

    return () => clearInterval(blinkInterval);
  }, [isClockPaused]);

  // Detect dark mode
  useEffect(() => {
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };

    checkDarkMode();

    // Watch for theme changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  // Hydration fix - set mounted after all hooks
  useEffect(() => {
    setMounted(true);
  }, []);

  // Helper to determine bar color with blinking effect
  const getCircleColor = (index: number, isMobile: boolean = false) => {
    // Fill all bars from 0 to activeBarIndex (inclusive)
    const isActive = index <= activeBarIndex;

    // Determine inactive color based on screen size and theme
    const inactiveColor = isMobile
      ? (isDarkMode ? INACTIVE_SLOT_COLOR_MOBILE_DARK : INACTIVE_SLOT_COLOR_MOBILE_LIGHT)
      : INACTIVE_SLOT_COLOR;

    // If disconnected, show red for filled bars
    if (isDisconnected) {
      return isActive ? DISCONNECTED_SLOT_COLOR : inactiveColor;
    }

    if (!isActive) {
      return inactiveColor;
    }

    // Apply blinking effect when clock is paused
    if (isClockPaused && dimmingPhase === 0) {
      return inactiveColor; // Blink off
    }

    return ACTIVE_SLOT_COLOR;
  };

  // Don't render until mounted (prevents hydration errors)
  if (!mounted) {
    return null;
  }

  return (
    <div
      className={`flex items-center rounded-full border ${
        isDisconnected
          ? 'border-red-500/30 bg-red-900/20'
          : 'border-zinc-200/40 bg-white max-lg:bg-zinc-100 dark:border-zinc-700/30 dark:bg-zinc-900 max-lg:dark:bg-zinc-800'
      } ${className} gap-2 px-3 py-2.5 max-w-[290px] lg:gap-3 lg:px-4 lg:py-2 lg:w-[410px] lg:max-w-none`}
    >
      {/* Mini Slot Grid - 5 bars on mobile, 30 bars on desktop */}
      <div className="flex gap-0.5">
        {/* Mobile: 5 bars */}
        {Array.from({ length: 5 }).map((_, col) => {
          const mobileActiveIndex = activeBarIndex % 5;
          const isActive = col <= mobileActiveIndex;
          const inactiveColor = isDarkMode ? INACTIVE_SLOT_COLOR_MOBILE_DARK : INACTIVE_SLOT_COLOR_MOBILE_LIGHT;
          let color = inactiveColor;
          if (isDisconnected) {
            color = isActive ? DISCONNECTED_SLOT_COLOR : inactiveColor;
          } else if (isActive) {
            color = (isClockPaused && dimmingPhase === 0) ? inactiveColor : ACTIVE_SLOT_COLOR;
          }
          return (
            <div
              key={`bar-mobile-${col}`}
              className="h-[18px] w-1.5 rounded-sm lg:hidden"
              style={{ backgroundColor: color }}
            />
          );
        })}
        {/* Desktop: 30 bars */}
        {Array.from({ length: 30 }).map((_, col) => {
          const color = getCircleColor(col);
          return (
            <div
              key={`bar-desktop-${col}`}
              className="hidden h-[14px] w-1 rounded-sm lg:block"
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>

      {/* Slot Height */}
      <div className="flex items-center gap-1.5">
        <span
          className={`text-[11px] font-medium tracking-wide uppercase lg:text-[10px] ${
            isDisconnected ? 'text-red-300' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          Slot
        </span>
        <span
          className={`font-mono text-sm font-semibold lg:text-xs ${
            isDisconnected ? 'text-red-300' : 'text-zinc-950 dark:text-zinc-50'
          }`}
        >
          {slotHeight.toLocaleString()}
        </span>
      </div>

      {/* Separator */}
      <div className={`h-4 w-px lg:h-3 ${isDisconnected ? 'bg-red-500/30' : 'bg-zinc-200/60 dark:bg-zinc-700/60'}`} />

      {/* Epoch with circular progress */}
      <div className="flex items-center gap-2">
        <span
          className={`hidden text-[10px] font-medium tracking-wide uppercase lg:block ${
            isDisconnected ? 'text-red-300' : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          Epoch
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className={`font-mono text-sm font-semibold lg:text-xs ${
              isDisconnected ? 'text-red-300' : 'text-zinc-950 dark:text-zinc-50'
            }`}
          >
            {epoch}
          </span>
          {/* Circular progress indicator */}
          <div className="relative flex h-5 w-5 items-center justify-center lg:h-4 lg:w-4">
            <svg className="h-5 w-5 -rotate-90 transform lg:h-4 lg:w-4">
              {/* Background circle */}
              <circle
                cx="10"
                cy="10"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                className="text-zinc-200 dark:text-zinc-700 lg:hidden"
              />
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                className="text-zinc-200 dark:text-zinc-700 max-lg:hidden"
              />
              {/* Progress circle */}
              <circle
                cx="10"
                cy="10"
                r="7"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 7}`}
                strokeDashoffset={`${2 * Math.PI * 7 * (1 - epochProgress / 100)}`}
                style={{ stroke: isDisconnected ? DISCONNECTED_SLOT_COLOR : ACTIVE_SLOT_COLOR }}
                className="transition-all duration-300 lg:hidden"
                strokeLinecap="round"
              />
              <circle
                cx="8"
                cy="8"
                r="6"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 6}`}
                strokeDashoffset={`${2 * Math.PI * 6 * (1 - epochProgress / 100)}`}
                style={{ stroke: isDisconnected ? DISCONNECTED_SLOT_COLOR : ACTIVE_SLOT_COLOR }}
                className="transition-all duration-300 max-lg:hidden"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
