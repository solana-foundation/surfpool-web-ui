'use client';

import { Dialog, DialogActions, DialogBody, DialogTitle } from '@surfpool/ui';
import { Listbox, ListboxOption } from '@surfpool/ui';
import { useAppConfig } from '@/hooks/use-app-config';
import { solanaWebSocketService } from '@/lib/solana-websocket-service';
import { CalendarIcon, PauseIcon, PlayIcon } from '@heroicons/react/24/outline';
import { ArchiveBoxArrowDownIcon } from '@heroicons/react/24/solid';
import { snapshotDownloadContents } from '@/lib/scenarios-api';
import { getTimeUnitInMs, logger } from '@surfpool/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

type TimeTravelMode = 'date' | 'epoch' | 'slot';

export const SlotsGrid: React.FC = () => {
  const { rpcUrl, wsUrl, loading: configLoading, error: configError } = useAppConfig();
  const [isClient, setIsClient] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const circleDiameter = 8;
  const circleRadius = circleDiameter / 2;
  const horizontalSpacing = 6;
  const verticalSpacing = 6;
  const horizontalPadding = 0;
  const verticalPadding = 0;
  const totalRows = 5;
  const canvasGridHeight = totalRows * circleDiameter + (totalRows - 1) * verticalSpacing;
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: canvasGridHeight });
  const [currentRect, setCurrentRect] = useState(0);
  // Store totalCircles in state for use in progress bar
  const [totalCircles, setTotalCircles] = useState(1);
  const totalCirclesRef = useRef(totalCircles);

  // Keep ref in sync with state
  useEffect(() => {
    totalCirclesRef.current = totalCircles;
  }, [totalCircles]);
  const [redRects, setRedRects] = useState<Set<number>>(new Set());
  const [animationProgress, setAnimationProgress] = useState<Map<number, number>>(new Map());
  const rowHeight = circleDiameter + verticalSpacing;
  const DEFAULT_SLOTS_IN_EPOCH = 432_000;
  const ACTIVE_SLOT_COLOR = '#00D4FF';
  const INACTIVE_SLOT_COLOR = '#2F2F32';

  const TRANSITION_DURATION = 300; // milliseconds

  // Epoch state
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [currentSlot, setCurrentSlot] = useState<number>(0);
  const [slotsInEpoch, setSlotsInEpoch] = useState<number>(DEFAULT_SLOTS_IN_EPOCH);
  const [isClockPaused, setIsClockPaused] = useState<boolean>(false);
  const [dimmingPhase, setDimmingPhase] = useState<number>(0);
  const [ignoreSlotEvents, setIgnoreSlotEvents] = useState<boolean>(false);

  // Time travel popup state
  const [showTimeTravel, setShowTimeTravel] = useState<boolean>(false);
  const [timeTravelMode, setTimeTravelMode] = useState<TimeTravelMode>('date');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedEpoch, setSelectedEpoch] = useState<number>(1);
  const [selectedSlot, setSelectedSlot] = useState<number>(0);
  const [selectedTimeUnit, setSelectedTimeUnit] = useState<
    'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'
  >('days');
  const [selectedTimeAmount, setSelectedTimeAmount] = useState<number | null>(null);

  // WebSocket refs
  const subscriptionIdRef = useRef<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  // Update selected epoch when current epoch changes
  useEffect(() => {
    setSelectedEpoch(currentEpoch + 1);
  }, [currentEpoch]);

  // Toggle time travel popup
  const toggleTimeTravel = () => {
    setShowTimeTravel(!showTimeTravel);
  };

  // Update blockchain clock
  const updateBlockchainClock = async () => {
    try {
      let timeTravelConfig: any;

      switch (timeTravelMode) {
        case 'date':
          // Convert relative time to absolute timestamp
          if (selectedTimeAmount === null || selectedTimeAmount === 0) {
            console.error('❌ Please enter a valid time amount');
            return;
          }
          const now = new Date();
          const timeAmountMs = selectedTimeAmount * getTimeUnitInMs(selectedTimeUnit);
          const targetTimestamp = Math.floor(now.getTime() + timeAmountMs); // Keep in milliseconds
          timeTravelConfig = { absoluteTimestamp: targetTimestamp };
          break;
        case 'epoch':
          timeTravelConfig = { absoluteEpoch: selectedEpoch };
          break;
        case 'slot':
          timeTravelConfig = { absoluteSlot: selectedSlot };
          break;
        default:
          console.error('Invalid time travel mode');
          return;
      }

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'surfnet_timeTravel',
          params: [timeTravelConfig],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        logger.log('📡 Time travel response:', data);

        if (data.result) {
          logger.log('✅ Time travel successful:', data.result);

          // Trigger full refresh of slot grid
          logger.log('🔄 Triggering full slot grid refresh after time travel');

          // Reset animation state
          setRedRects(new Set());
          setAnimationProgress(new Map());
          setCurrentRect(0);

          // Fetch fresh epoch data from RPC
          await fetchEpochData();

          // Update local state with the new epoch info
          if (data.result.epoch !== undefined) {
            setCurrentEpoch(data.result.epoch);
          }
          if (data.result.slot_index !== undefined) {
            setCurrentSlot(data.result.slot_index);
          }

          // Notify other components about epoch change
          window.dispatchEvent(new CustomEvent('epochChanged', {
            detail: {
              epoch: data.result.epoch,
              slotIndex: data.result.slot_index
            }
          }));
        } else {
          console.error('❌ Time travel failed:', data.error);
        }
      } else {
        console.error('❌ HTTP error during time travel:', response.status);
      }

      // Always close the popup after attempting the request
      setShowTimeTravel(false);
    } catch (error) {
      console.error('❌ Error during time travel:', error);
      // Close popup even on error
      setShowTimeTravel(false);
    }
  };


  // Export snapshot
  const exportSnapshot = async () => {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'surfnet_exportSnapshot',
        }),
      });

      if (response.ok) {
        const jsonString = snapshotDownloadContents(await response.text());

        if (jsonString) {
          const blob = new Blob([jsonString], { type: 'application/json' });

          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;

          // Generate filename with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          link.download = `surfnet-snapshot-${timestamp}.json`;

          // Trigger download
          document.body.appendChild(link);
          link.click();

          // Cleanup
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          logger.log('✅ Snapshot exported successfully');
        } else {
          console.error('❌ Export snapshot failed: empty or invalid snapshot');
        }
      } else {
        console.error('❌ HTTP error during export:', response.status);
      }
    } catch (error) {
      console.error('❌ Error during export:', error);
    }
  };

  // Toggle clock pause/resume
  const toggleClock = async () => {
    try {
      const method = isClockPaused ? 'surfnet_resumeClock' : 'surfnet_pauseClock';

      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: method,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.result !== undefined) {
          const newPauseState = !isClockPaused;
          setIsClockPaused(newPauseState);

          // Dispatch global event so other components (like header widget) can sync
          window.dispatchEvent(new CustomEvent('clockPauseStateChanged', {
            detail: { isPaused: newPauseState }
          }));

          // If we're pausing, ignore slot events for a short period
          if (!isClockPaused) {
            setIgnoreSlotEvents(true);
            setTimeout(() => {
              setIgnoreSlotEvents(false);
            }, 1000); // Ignore slot events for 1 second after pausing
          }
        }
      }
    } catch (error) {
      console.error('Error toggling clock:', error);
    }
  };

  // Fetch epoch and slot data from RPC
  const fetchEpochData = async () => {
    try {
      // Fetch current epoch info
      const epochResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getEpochInfo',
        }),
      });

      if (epochResponse.ok) {
        const epochData = await epochResponse.json();
        if (epochData.result) {
          setCurrentEpoch(epochData.result.epoch);
          setCurrentSlot(epochData.result.slotIndex);
          setSlotsInEpoch(epochData.result.slotsInEpoch);
        }
      }
    } catch (error) {
      console.error('Error fetching epoch data:', error);
    }
  };

  // Start WebSocket subscription to slot updates
  const startSlotSubscription = useCallback(async () => {
    try {
      logger.log('🔗 Connecting to slot WebSocket:', wsUrl);

      // Connect to WebSocket service
      await solanaWebSocketService.connect(wsUrl);
      logger.log('✅ Slot WebSocket connected');
      setWsConnected(true);

      // Subscribe to slot updates
      subscriptionIdRef.current = await solanaWebSocketService.subscribeToSlots();
      logger.log('✅ Slot subscription confirmed with ID:', subscriptionIdRef.current);
    } catch (error) {
      console.error('❌ Error starting slot subscription:', error);
      setWsConnected(false);
    }
  }, [wsUrl]);

  // Stop WebSocket subscription
  const stopSlotSubscription = useCallback(() => {
    logger.log('🔌 Stopping slot subscription');
    solanaWebSocketService.unsubscribeAll();
    subscriptionIdRef.current = null;
    setWsConnected(false);
    logger.log('🔗 Connection state updated: wsConnected = false');
  }, []);

  // Listen for slot events
  useEffect(() => {
    const handleSlot = (data: any) => {
      if (data?.parent && data?.root) {
        const newSlot = data.parent;

        // Calculate slot index within current epoch
        const slotIndexInEpoch = newSlot % slotsInEpoch;

        // Update current slot with epoch-relative index
        setCurrentSlot(slotIndexInEpoch);

        // Update animation - move to next circle and add current to trail
        setCurrentRect((prev) => {
          const nextRect = (prev + 1) % totalCirclesRef.current;

          // Add the previous circle to trail
          setRedRects((prevRects) => {
            const nextRects = new Set(prevRects);
            nextRects.add(prev);

            // Reset trail if we're at the end
            if (nextRect === 0) {
              return new Set();
            }

            return nextRects;
          });
          return nextRect;
        });
      }
    };

    solanaWebSocketService.on('slot', handleSlot);

    return () => {
      solanaWebSocketService.off('slot', handleSlot);
    };
  }, [slotsInEpoch, isClockPaused, ignoreSlotEvents]);

  // Listen for connection status changes
  useEffect(() => {
    const handleConnected = () => {
      logger.log('🔗 WebSocket connected');
      setWsConnected(true);
    };

    const handleDisconnected = () => {
      logger.log('🔌 WebSocket disconnected');
      setWsConnected(false);
    };

    solanaWebSocketService.on('connected', handleConnected);
    solanaWebSocketService.on('disconnected', handleDisconnected);

    return () => {
      solanaWebSocketService.off('connected', handleConnected);
      solanaWebSocketService.off('disconnected', handleDisconnected);
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const width = entry.contentRect.width;
        setCanvasSize({ width, height: canvasGridHeight });
      }
    });

    observer.observe(container);

    // Also set initial size immediately if container has width
    const initialWidth = container.clientWidth;
    if (initialWidth > 0) {
      setCanvasSize({ width: initialWidth, height: canvasGridHeight });
    }

    // Add window resize listener as well
    const handleWindowResize = () => {
      if (container) {
        const newWidth = container.clientWidth;
        setCanvasSize({ width: newWidth, height: canvasGridHeight });
      }
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', handleWindowResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: ResizeObserver handles canvasGridHeight updates
  }, []);

  // Draw effect: only draws, does not set up interval
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isClient) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const { width, height } = canvasSize;

    if (width === 0 || height === 0) {
      return;
    }

    canvas.width = width;
    canvas.height = height;

    // Enable GPU acceleration
    ctx.imageSmoothingEnabled = false; // Disable anti-aliasing for better performance
    ctx.globalCompositeOperation = 'source-over';

    const totalColumns = Math.floor(
      (width - 2 * horizontalPadding + horizontalSpacing) / (circleDiameter + horizontalSpacing)
    );
    const newTotalCircles = totalColumns * totalRows;
    setTotalCircles(newTotalCircles);

    ctx.clearRect(0, 0, width, height);
    let circleIndex = 0;
    let rowCount = 0;

    for (let y = 0; rowCount < totalRows; y += circleDiameter + verticalSpacing) {
      let colCount = 0;
      for (
        let x = horizontalPadding;
        colCount < totalColumns && x + circleDiameter <= width - horizontalPadding;
        x += circleDiameter + horizontalSpacing
      ) {
        // Get animation progress for this circle
        const progress = animationProgress.get(circleIndex) || 0;

        let fillStyle;

        // Simple green animation - no WebSocket dependency
        const inactiveColor = hexToRgb(INACTIVE_SLOT_COLOR);
        const activeColor = hexToRgb(ACTIVE_SLOT_COLOR);

        if (inactiveColor && activeColor) {
          const r = Math.round(inactiveColor.r + (activeColor.r - inactiveColor.r) * progress);
          const g = Math.round(inactiveColor.g + (activeColor.g - inactiveColor.g) * progress);
          const b = Math.round(inactiveColor.b + (activeColor.b - inactiveColor.b) * progress);

          fillStyle = `rgb(${r}, ${g}, ${b})`;

          // Apply blinking effect when clock is paused
          if (isClockPaused && progress > 0 && dimmingPhase === 0) {
            // Use inactive color when blinking off
            const inactiveColor = hexToRgb(INACTIVE_SLOT_COLOR);
            if (inactiveColor) {
              fillStyle = `rgb(${inactiveColor.r}, ${inactiveColor.g}, ${inactiveColor.b})`;
            }
          }
        } else {
          fillStyle = progress > 0.5 ? ACTIVE_SLOT_COLOR : INACTIVE_SLOT_COLOR;
        }

        ctx.fillStyle = fillStyle;
        ctx.beginPath();
        ctx.arc(x + circleRadius, y + circleRadius, circleRadius, 0, 2 * Math.PI);
        ctx.fill();
        circleIndex++;
        colCount++;
      }
      rowCount++;
    }
  }, [canvasSize, currentRect, redRects, animationProgress, circleRadius, isClient, isClockPaused, dimmingPhase]);

  // Helper function to convert hex to RGB
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  // Set client flag on mount and initialize canvas size
  useEffect(() => {
    setIsClient(true);

    // Initialize animation state after client-side hydration
    setRedRects(new Set([0])); // Start with first dot active
    setAnimationProgress(new Map([[0, 1]])); // Start with first dot fully active
    setCurrentRect(0); // Ensure currentRect is initialized

    // Set up ResizeObserver here since this useEffect is working
    const container = containerRef.current;
    if (container) {
      const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
          const width = entry.contentRect.width;
          setCanvasSize({ width, height: canvasGridHeight });
        }
      });

      observer.observe(container);

      // Add window resize listener as well
      const handleWindowResize = () => {
        if (container) {
          const newWidth = container.clientWidth;
          setCanvasSize({ width: newWidth, height: canvasGridHeight });
        }
      };

      window.addEventListener('resize', handleWindowResize);

      // Set initial canvas size if container is available
      const initialWidth = container.clientWidth;
      if (initialWidth > 0) {
        setCanvasSize({ width: initialWidth, height: canvasGridHeight });
      }

      return () => {
        observer.disconnect();
        window.removeEventListener('resize', handleWindowResize);
      };
    }

    // Fallback: force canvas size after a delay if still 0
    const fallbackTimer = setTimeout(() => {
      if (canvasSize.width === 0 && containerRef.current) {
        const fallbackWidth = containerRef.current.clientWidth || 800; // Default to 800px if still 0
        logger.log('🔄 Fallback: setting canvas width to:', fallbackWidth);
        setCanvasSize({ width: fallbackWidth, height: canvasGridHeight });
      }
    }, 1000); // Wait 1 second

    return () => clearTimeout(fallbackTimer);
  }, [canvasGridHeight, canvasSize.width]);

  // Reset animation when circle count changes (due to resize)
  useEffect(() => {
    if (isClient && totalCircles > 1) {
      setCurrentRect(0);
      setRedRects(new Set([0]));
      setAnimationProgress(new Map([[0, 1]]));
    }
  }, [totalCircles, isClient]);

  // Fetch epoch data on component mount
  useEffect(() => {
    if (isClient) {
      fetchEpochData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: fetchEpochData is stable but not memoized
  }, [isClient]);

  // Start WebSocket subscription once on mount
  useEffect(() => {
    if (isClient && !subscriptionIdRef.current) {
      logger.log('🔗 Starting WebSocket subscription');
      startSlotSubscription();

      return () => {
        stopSlotSubscription();
      };
    }
  }, [isClient, startSlotSubscription, stopSlotSubscription]);

  // Smooth animation effect
  useEffect(() => {
    if (!isClient || totalCircles <= 1) return;

    const animationInterval = setInterval(() => {
      setAnimationProgress((prev) => {
        const next = new Map(prev);

        // Update progress for all circles
        for (let i = 0; i < totalCircles; i++) {
          const isActive = redRects.has(i) || i === currentRect;
          const currentProgress = next.get(i) || 0;

          if (isActive && currentProgress < 1) {
            next.set(i, Math.min(1, currentProgress + 0.1));
          } else if (!isActive && currentProgress > 0) {
            next.set(i, Math.max(0, currentProgress - 0.1));
          }
        }

        return next;
      });
    }, 50); // Update every 50ms for smooth animation

    return () => clearInterval(animationInterval);
  }, [isClient, totalCircles, currentRect, redRects]);

  // Blinking animation when clock is paused
  useEffect(() => {
    if (!isClient || !isClockPaused) return;

    const blinkInterval = setInterval(() => {
      setDimmingPhase((prev) => (prev === 0 ? 1 : 0));
    }, 500); // Blink every 500ms like a typical pause button

    return () => clearInterval(blinkInterval);
  }, [isClient, isClockPaused]);

  // Don't render anything until client-side hydration is complete
  if (!isClient) {
    return (
      <div className="-mt-2 w-full">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-300 uppercase">SLOTS</div>
          <div className="flex gap-2">
            <button
              disabled
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 opacity-50"
            >
              <PauseIcon className="h-4 w-4 text-zinc-300" />
            </button>
            <button
              disabled
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 opacity-50"
            >
              <CalendarIcon className="h-4 w-4 text-zinc-300" />
            </button>
            <button
              onClick={exportSnapshot}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 transition-colors hover:bg-zinc-700"
              title="Export Snapshot"
            >
              <ArchiveBoxArrowDownIcon className="h-4 w-4 text-zinc-300" />
            </button>
          </div>
        </div>
        <div className="overflow-hidden" style={{ height: canvasGridHeight, width: '100%' }}>
          <div className="h-full w-full rounded bg-[#2F2F32]"></div>
        </div>
        <div className="mt-5 mb-2 text-sm font-medium text-zinc-300 uppercase">EPOCH 0</div>
        <div className="-mt-5 mb-2 text-right text-xs text-zinc-500">0.0%</div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: INACTIVE_SLOT_COLOR }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: '0%', background: ACTIVE_SLOT_COLOR }}
          />
        </div>
      </div>
    );
  }

  // Show loading state while config is being fetched
  if (configLoading) {
    return (
      <div className="-mt-2 w-full">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-300 uppercase">SLOTS</div>
          <div className="flex gap-2">
            <button
              disabled
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 opacity-50"
            >
              <PauseIcon className="h-4 w-4 text-zinc-300" />
            </button>
            <button
              disabled
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 opacity-50"
            >
              <CalendarIcon className="h-4 w-4 text-zinc-300" />
            </button>
            <button
              onClick={exportSnapshot}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 transition-colors hover:bg-zinc-700"
              title="Export Snapshot"
            >
              <ArchiveBoxArrowDownIcon className="h-4 w-4 text-zinc-300" />
            </button>
          </div>
        </div>
        <div className="overflow-hidden" style={{ height: canvasGridHeight, width: '100%' }}>
          <div className="flex h-full w-full items-center justify-center rounded bg-[#2F2F32]">
            <div className="text-sm text-zinc-500">Loading configuration...</div>
          </div>
        </div>
        <div className="mt-5 mb-2 text-sm font-medium text-zinc-300 uppercase">EPOCH 0</div>
        <div className="-mt-5 mb-2 text-right text-xs text-zinc-500">0.0%</div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: INACTIVE_SLOT_COLOR }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: '0%', background: ACTIVE_SLOT_COLOR }}
          />
        </div>
      </div>
    );
  }

  // Show error state if config failed to load
  if (configError) {
    return (
      <div className="-mt-2 w-full">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-300 uppercase">SLOTS</div>
          <div className="flex gap-2">
            <button
              disabled
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 opacity-50"
            >
              <PauseIcon className="h-4 w-4 text-zinc-300" />
            </button>
            <button
              disabled
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 opacity-50"
            >
              <CalendarIcon className="h-4 w-4 text-zinc-300" />
            </button>
            <button
              disabled
              className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 opacity-50"
            >
              <ArchiveBoxArrowDownIcon className="h-4 w-4 text-zinc-300" />
            </button>
          </div>
        </div>
        <div className="overflow-hidden" style={{ height: canvasGridHeight, width: '100%' }}>
          <div className="flex h-full w-full items-center justify-center rounded bg-[#2F2F32]">
            <div className="text-sm text-red-500">Failed to load configuration</div>
          </div>
        </div>
        <div className="mt-5 mb-2 text-sm font-medium text-zinc-300 uppercase">EPOCH 0</div>
        <div className="-mt-5 mb-2 text-right text-xs text-zinc-500">0.0%</div>
        <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: INACTIVE_SLOT_COLOR }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: '0%', background: ACTIVE_SLOT_COLOR }}
          />
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="-mt-2 w-full">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-300 uppercase">SLOTS</div>
        <div className="flex gap-2">
          <button
            onClick={toggleClock}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 transition-colors hover:bg-zinc-700"
            title={isClockPaused ? 'Resume clock' : 'Pause clock'}
          >
            {isClockPaused ? (
              <PlayIcon className="h-4 w-4 text-zinc-300" />
            ) : (
              <PauseIcon className="h-4 w-4 text-zinc-300" />
            )}
          </button>
          <button
            onClick={toggleTimeTravel}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 transition-colors hover:bg-zinc-700"
            title="Time/Calendar controls"
          >
            <CalendarIcon className="h-4 w-4 text-zinc-300" />
          </button>
          <button
            onClick={exportSnapshot}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-zinc-600 bg-zinc-800 transition-colors hover:bg-zinc-700"
            title="Export Snapshot"
          >
            <ArchiveBoxArrowDownIcon className="h-4 w-4 text-zinc-300" />
          </button>
        </div>
      </div>
      <div className="overflow-hidden" style={{ height: canvasGridHeight, width: '100%' }}>
        <canvas ref={canvasRef} style={{ background: 'transparent', width: '100%', height: canvasGridHeight }} />
      </div>
      <div className="mt-5 mb-2 text-sm font-medium text-zinc-300 uppercase">EPOCH {currentEpoch}</div>
      <div className="-mt-5 mb-2 text-right text-xs text-zinc-500">
        {((currentSlot / slotsInEpoch) * 100).toFixed(1)}%
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: INACTIVE_SLOT_COLOR }}>
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${(currentSlot / slotsInEpoch) * 100}%`,
            background: ACTIVE_SLOT_COLOR,
          }}
        />
      </div>

      {/* Time Travel Dialog */}
      <Dialog open={showTimeTravel} onClose={() => setShowTimeTravel(false)} size="md">
        <div className="text-center">
          <DialogTitle className="mb-8 text-center tracking-wide uppercase">TIME TRAVEL</DialogTitle>

          {/* Mode Selection */}
          <div className="mb-8 flex justify-center gap-2">
            <button
              onClick={() => setTimeTravelMode('date')}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                timeTravelMode === 'date' ? 'bg-[#00D4FF] text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              DATE
            </button>
            <button
              onClick={() => setTimeTravelMode('epoch')}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                timeTravelMode === 'epoch' ? 'bg-[#00D4FF] text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              EPOCH
            </button>
            <button
              onClick={() => setTimeTravelMode('slot')}
              className={`rounded px-3 py-1 text-sm transition-colors ${
                timeTravelMode === 'slot' ? 'bg-[#00D4FF] text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              SLOT
            </button>
          </div>

          <DialogBody>
            {timeTravelMode === 'date' && (
              <div className="space-y-4">
                <div>
                  <div className="relative">
                    <div className="-ml-8 flex items-center justify-center gap-3">
                      <input
                        type="number"
                        value={selectedTimeAmount || ''}
                        onChange={(e) => setSelectedTimeAmount(parseInt(e.target.value) || null)}
                        className="w-24 [appearance:textfield] border-none bg-transparent text-right text-2xl font-bold text-zinc-300 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                        placeholder="7"
                        autoFocus
                      />
                      <div className="w-25">
                        <Listbox value={selectedTimeUnit} onChange={setSelectedTimeUnit}>
                          <ListboxOption value="seconds">Seconds</ListboxOption>
                          <ListboxOption value="minutes">Minutes</ListboxOption>
                          <ListboxOption value="hours">Hours</ListboxOption>
                          <ListboxOption value="days">Days</ListboxOption>
                          <ListboxOption value="weeks">Weeks</ListboxOption>
                          <ListboxOption value="months">Months</ListboxOption>
                          <ListboxOption value="years">Years</ListboxOption>
                        </Listbox>
                      </div>
                      <span className="text-sm text-zinc-400">from clock</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {timeTravelMode === 'epoch' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-zinc-400">Provide Epoch to set</label>
                  <input
                    type="number"
                    value={selectedEpoch || ''}
                    onChange={(e) => setSelectedEpoch(parseInt(e.target.value) || 0)}
                    className="w-full [appearance:textfield] border-none bg-transparent text-center text-5xl font-bold text-zinc-300 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder={`${currentEpoch + 1}`}
                    autoFocus
                  />
                </div>
              </div>
            )}

            {timeTravelMode === 'slot' && (
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-medium text-zinc-400">Provide Absolute Slot to set</label>
                  <input
                    type="number"
                    value={selectedSlot || ''}
                    onChange={(e) => setSelectedSlot(parseInt(e.target.value) || 0)}
                    className="w-full [appearance:textfield] border-none bg-transparent text-center text-3xl font-bold text-zinc-300 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder={`${currentSlot + currentEpoch * 432000}`}
                    autoFocus
                  />
                </div>
              </div>
            )}
          </DialogBody>

          <DialogActions className="!justify-center">
            <button
              onClick={updateBlockchainClock}
              className="rounded border border-[#E034AE] bg-[#E034AE] px-6 py-2 font-medium text-white transition-colors hover:bg-[#C02A8F]"
              style={{ backgroundColor: '#E034AE', borderColor: '#E034AE' }}
            >
              Jump
            </button>
          </DialogActions>
        </div>
      </Dialog>
    </div>
  );
};
