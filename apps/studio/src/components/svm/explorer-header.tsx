import TransactionInspector from '@/components/svm/transaction-inspector';
import { useAppConfig } from '@/hooks/use-app-config';
import { S3Credentials, uploadToS3 } from '@/lib/s3-upload';
import { solanaWebSocketService } from '@/lib/solana-websocket-service';
import { CalendarIcon, PauseIcon, PlayIcon } from '@heroicons/react/24/outline';
import { ArchiveBoxArrowDownIcon, CloudArrowUpIcon } from '@heroicons/react/24/solid';
import { CheckoutModal, MoneyMQProvider } from '@moneymq/react';
import { Faucet } from '@surfpool/svm';
import { Dialog, DialogActions, DialogBody, DialogTitle, Listbox, ListboxOption, Switch } from '@surfpool/ui';
import { getTimeUnitInMs, logger } from '@surfpool/shared';
import { parse, stringify } from 'lossless-json';
import { useEffect, useRef, useState } from 'react';
import { LabeledLink } from './labeled-link';

const moneyMQClient = {
  config: {
    endpoint: 'http://localhost:8488',
    // endpoint: 'https://surfnet-sandbox.money.mq',
  },
};

type TimeTravelMode = 'date' | 'epoch' | 'slot';

interface ExplorerHeaderProps {
  initialTransactionSignature?: string;
}

const ExplorerHeader = ({ initialTransactionSignature }: ExplorerHeaderProps) => {
  const { rpcUrl, wsUrl, rpcDatasourceUrl, loading: configLoading, error: configError, refetch } = useAppConfig();
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [isClockPaused, setIsClockPaused] = useState<boolean>(false);
  const [showTimeTravel, setShowTimeTravel] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [transferLocalState, setTransferLocalState] = useState(true);
  const [publishLandingPage, setPublishLandingPage] = useState(false);
  const [selectedPricingTier, setSelectedPricingTier] = useState<'lite' | 'pro' | 'max'>('pro');
  const [subdomain, setSubdomain] = useState('');
  const [isCheckingSubdomain, setIsCheckingSubdomain] = useState(false);
  const [subdomainAvailable, setSubdomainAvailable] = useState<boolean | null>(null);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subdomainInputRef = useRef<HTMLInputElement>(null);
  const [timeTravelMode, setTimeTravelMode] = useState<TimeTravelMode>('date');
  const [selectedEpoch, setSelectedEpoch] = useState<number>(0);
  const [selectedSlot, setSelectedSlot] = useState<number>(0);
  const [selectedTimeUnit, setSelectedTimeUnit] = useState<
    'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years'
  >('days');
  const [selectedTimeAmount, setSelectedTimeAmount] = useState<number>(7);
  const [currentEpoch, setCurrentEpoch] = useState<number>(0);
  const [currentSlot, setCurrentSlot] = useState<number>(0);
  const [slotsInEpoch, setSlotsInEpoch] = useState<number>(432000);
  const [showCheckout, setShowCheckout] = useState(false);
  const [surfnetPayload, setSurfnetPayload] = useState<any>(null);

  // Landing page editor state
  const [landingPageOrg, setLandingPageOrg] = useState('');
  const [landingPageName, setLandingPageName] = useState('');
  const [landingPageMarkdown, setLandingPageMarkdown] = useState<string | null>(null);
  const [landingPageMarkdownFileName, setLandingPageMarkdownFileName] = useState<string | null>(null);
  const [landingPagePrimaryColor, setLandingPagePrimaryColor] = useState('#ec4899');
  const [landingPageHeaderImage, setLandingPageHeaderImage] = useState<string | null>(null);
  const [landingPageAvatar, setLandingPageAvatar] = useState<string | null>(null);
  const headerImageInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const [isDraggingMarkdown, setIsDraggingMarkdown] = useState(false);

  // Publish progress state
  type PublishPhase = 'config' | 'uploading' | 'importing' | 'completed' | 'error';
  const [publishPhase, setPublishPhase] = useState<PublishPhase>('config');
  const [uploadProgress, setUploadProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [importProgress, setImportProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string>('surfnet-export.json');
  const [snapshotId, setSnapshotId] = useState<string | null>(null);
  const [typewriterText, setTypewriterText] = useState('');
  const [showVisitButton, setShowVisitButton] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  const snapshotWsRef = useRef<WebSocket | null>(null);

  // Typewriter effect for published URL
  useEffect(() => {
    if (publishPhase === 'completed' && publishedUrl) {
      setTypewriterText('');
      setShowVisitButton(false);
      let index = 0;
      const interval = setInterval(() => {
        if (index < publishedUrl.length) {
          setTypewriterText(publishedUrl.slice(0, index + 1));
          index++;
        } else {
          clearInterval(interval);
          setTimeout(() => setShowVisitButton(true), 200);
        }
      }, 15);
      return () => clearInterval(interval);
    }
  }, [publishPhase, publishedUrl]);

  // Format bytes to human readable format
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Reset publish state when dialog closes
  const resetPublishState = () => {
    setPublishPhase('config');
    setUploadProgress(null);
    setImportProgress(null);
    setPublishError(null);
    setPublishedUrl(null);
    setUploadFileName('surfnet-export.json');
    setSnapshotId(null);
    setTypewriterText('');
    setShowVisitButton(false);
    setUrlCopied(false);
    if (snapshotWsRef.current) {
      snapshotWsRef.current.close();
      snapshotWsRef.current = null;
    }
  };

  // Track WebSocket connection status
  useEffect(() => {
    const handleConnected = () => {
      logger.log('ExplorerHeader: WebSocket connected, refreshing config...');
      setWsConnected(true);
      // Refresh config when WebSocket connects
      if (refetch) {
        refetch();
      }
    };

    const handleDisconnected = () => {
      logger.log('ExplorerHeader: WebSocket disconnected, refreshing config...');
      setWsConnected(false);
      // Refresh config when WebSocket disconnects
      if (refetch) {
        refetch();
      }
    };

    // Listen for WebSocket connection events
    solanaWebSocketService.on('connected', handleConnected);
    solanaWebSocketService.on('disconnected', handleDisconnected);

    // Check initial connection status
    setWsConnected(solanaWebSocketService.isConnected());

    return () => {
      solanaWebSocketService.off('connected', handleConnected);
      solanaWebSocketService.off('disconnected', handleDisconnected);
    };
  }, [refetch]);

  // Listen for global pause state changes
  useEffect(() => {
    const handlePauseChange = (event: CustomEvent) => {
      setIsClockPaused(event.detail.isPaused);
    };

    window.addEventListener('clockPauseStateChanged', handlePauseChange as EventListener);

    return () => {
      window.removeEventListener('clockPauseStateChanged', handlePauseChange as EventListener);
    };
  }, []);

  // Fetch epoch data on mount
  useEffect(() => {
    const fetchEpochData = async () => {
      try {
        const response = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getEpochInfo',
          }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.result) {
            setCurrentEpoch(data.result.epoch);
            setCurrentSlot(data.result.slotIndex);
            setSlotsInEpoch(data.result.slotsInEpoch);
          }
        }
      } catch (error) {
        console.error('Error fetching epoch data:', error);
      }
    };
    if (rpcUrl) fetchEpochData();
  }, [rpcUrl]);

  // Listen for epoch changes (from time travel or slot updates)
  useEffect(() => {
    const handleEpochChange = (event: CustomEvent) => {
      if (event.detail.epoch !== undefined) {
        setCurrentEpoch(event.detail.epoch);
      }
      if (event.detail.slotIndex !== undefined) {
        setCurrentSlot(event.detail.slotIndex);
      }
    };

    window.addEventListener('epochChanged', handleEpochChange as EventListener);

    return () => {
      window.removeEventListener('epochChanged', handleEpochChange as EventListener);
    };
  }, []);

  // Listen for slot updates from WebSocket
  useEffect(() => {
    const handleSlot = (data: any) => {
      if (data?.parent) {
        const newSlot = data.parent;
        const slotIndexInEpoch = newSlot % slotsInEpoch;
        setCurrentSlot(slotIndexInEpoch);
      }
    };

    solanaWebSocketService.on('slot', handleSlot);

    return () => {
      solanaWebSocketService.off('slot', handleSlot);
    };
  }, [slotsInEpoch]);

  // Auto-focus subdomain input when publish dialog opens
  useEffect(() => {
    if (showPublishDialog && subdomainInputRef.current) {
      setTimeout(() => subdomainInputRef.current?.focus(), 100);
    }
  }, [showPublishDialog]);

  // Cleanup subdomain check timeout on unmount
  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, []);

  // Check subdomain availability (mock for now - would hit real API)
  const checkSubdomainAvailability = async (value: string) => {
    if (!value || value.length < 3) {
      setSubdomainAvailable(null);
      return;
    }

    setIsCheckingSubdomain(true);
    try {
      // TODO: Replace with actual API call to check subdomain availability
      // For now, simulate a check with a delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Mock: subdomains starting with 'test' are taken
      setSubdomainAvailable(!value.startsWith('test'));
    } catch (error) {
      console.error('Error checking subdomain:', error);
      setSubdomainAvailable(null);
    } finally {
      setIsCheckingSubdomain(false);
    }
  };

  // Handle subdomain input change with debounce
  const handleSubdomainChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    setSubdomain(value);

    // Clear existing timeout
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current);
    }

    // Reset availability state while typing
    setSubdomainAvailable(null);

    // Show loading indicator immediately if valid length
    if (value.length >= 3) {
      setIsCheckingSubdomain(true);
      // Set new timeout to check after 1 second
      checkTimeoutRef.current = setTimeout(() => {
        checkSubdomainAvailability(value);
      }, 1000);
    } else {
      setIsCheckingSubdomain(false);
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

          // Dispatch global event so other components can sync
          window.dispatchEvent(
            new CustomEvent('clockPauseStateChanged', {
              detail: { isPaused: newPauseState },
            })
          );
        }
      }
    } catch (error) {
      console.error('Error toggling clock:', error);
    }
  };

  // Fetch snapshot data from the surfnet
  const fetchSnapshot = async (): Promise<unknown | null> => {
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
        const rawText = await response.text();
        // Use lossless-json to preserve large integer precision
        const data = parse(rawText) as { result?: { value?: unknown }; error?: { message: string } };
        logger.log('📸 Export snapshot response received');
        return data.result?.value || null;
      }
      return null;
    } catch (error) {
      console.error('❌ Error fetching snapshot:', error);
      return null;
    }
  };

  // Export full network data from the surfnet
  const exportNetwork = async (): Promise<any | null> => {
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
          params: [{ scope: 'network' }],
        }),
      });

      if (response.ok) {
        const rawText = await response.text();
        // Use lossless-json to parse without losing precision on large integers
        // Then extract just the result.value field and stringify it back
        const rpcResponse = parse(rawText) as { result?: { value?: unknown }; error?: { message: string } };

        if (rpcResponse.error) {
          console.error('❌ RPC error:', rpcResponse.error.message);
          return null;
        }

        if (!rpcResponse.result?.value) {
          console.error('❌ No result.value in RPC response');
          return null;
        }

        // Stringify just the result.value portion, preserving number precision
        const result = stringify(rpcResponse.result.value);
        logger.log('🌐 Extracted snapshot data, length:', result?.length);
        return result || null;
      }
      return null;
    } catch (error) {
      console.error('❌ Error exporting network:', error);
      return null;
    }
  };

  // Export snapshot to file
  const exportSnapshot = async () => {
    const snapshotData = await fetchSnapshot();
    if (snapshotData) {
      // Use lossless-json stringify to preserve large integer precision
      const jsonString = stringify(snapshotData, null, 2);
      const blob = new Blob([jsonString || ''], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      link.download = `surfnet-snapshot-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      logger.log('✅ Snapshot exported successfully');
    }
  };


  // Handle time travel
  const handleTimeTravel = async () => {
    try {
      let timeTravelConfig: any;

      switch (timeTravelMode) {
        case 'date':
          if (selectedTimeAmount === null || selectedTimeAmount === 0) {
            console.error('Please enter a valid time amount');
            return;
          }
          const now = new Date();
          const timeAmountMs = selectedTimeAmount * getTimeUnitInMs(selectedTimeUnit);
          const targetTimestamp = Math.floor(now.getTime() + timeAmountMs);
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
        if (data.result) {
          logger.log('✅ Time travel successful:', data.result);
          // Dispatch event so other components can update
          window.dispatchEvent(
            new CustomEvent('epochChanged', {
              detail: {
                epoch: data.result.epoch,
                slotIndex: data.result.slot_index,
              },
            })
          );
          setShowTimeTravel(false);
        }
      }
    } catch (error) {
      console.error('❌ Error during time travel:', error);
    }
  };

  return (
    <div className="mt-8 grid w-full grid-cols-1 gap-8 px-6 lg:grid-cols-[1fr_450px] lg:px-4">
      {/* Left Column on lg / Full width on sm+md */}
      <div className="flex w-full flex-col gap-8">
        {/* Transactions - always here */}
        <TransactionInspector
          autoStart={true}
          fetchHistorical={true}
          initialTransactionSignature={initialTransactionSignature}
        />

        {/* Faucet + Controls row on md / Faucet alone then Controls on sm */}
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[350px_1fr] md:gap-8 lg:hidden">
          {/* Faucet */}
          <div className="w-full md:order-1">
            <Faucet rpcUrl={rpcUrl} primaryColor="#27272A" innerOverlay="dark" />
          </div>

          {/* Controls + URLs - on md shown next to faucet, on sm shown below */}
          <div className="flex w-full flex-col gap-4 md:order-2">
            {/* Control Buttons */}
            <div className="grid w-full grid-cols-4 gap-2">
              <button
                onClick={toggleClock}
                className="flex flex-col items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 py-4 transition-colors hover:bg-zinc-700"
                title={isClockPaused ? 'Resume clock' : 'Pause clock'}
              >
                {isClockPaused ? (
                  <PlayIcon className="h-8 w-8 text-zinc-300" />
                ) : (
                  <PauseIcon className="h-8 w-8 text-zinc-300" />
                )}
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">
                  {isClockPaused ? 'Resume' : 'Pause Clock'}
                </span>
              </button>

              <button
                onClick={() => setShowTimeTravel(true)}
                className="flex flex-col items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 py-4 transition-colors hover:bg-zinc-700"
                title="Time Travel"
              >
                <CalendarIcon className="h-8 w-8 text-zinc-300" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">Time Travel</span>
              </button>

              <button
                onClick={exportSnapshot}
                className="flex flex-col items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 py-4 transition-colors hover:bg-zinc-700"
                title="Export Snapshot"
              >
                <ArchiveBoxArrowDownIcon className="h-8 w-8 text-zinc-300" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">Export State</span>
              </button>

              {/* Publish button temporarily hidden
              <button
                onClick={() => setShowPublishDialog(true)}
                className="flex flex-col items-center gap-2 rounded-lg border border-[#00D4FF] bg-[#00D4FF] py-4 transition-colors hover:brightness-110"
                title="Publish"
              >
                <CloudArrowUpIcon className="h-8 w-8 text-white" />
                <span className="text-[10px] font-medium uppercase tracking-wide text-white">Publish</span>
              </button>
              */}
            </div>

            {/* SURFNET URLs */}
            <div className="mt-4 flex w-full flex-col gap-0">
              <h2 className="text-sm font-medium uppercase tracking-wide text-white">SURFNET</h2>
              <div className="w-full">
                <LabeledLink
                  endpoint={{ name: 'RPC URL', url: rpcUrl }}
                  status={configError ? 'error' : configLoading ? 'loading' : 'connected'}
                  className="rounded-t-md"
                />
              </div>
              <div className="w-full">
                <LabeledLink
                  endpoint={{ name: 'WS URL', url: wsUrl }}
                  status={configError ? 'error' : wsConnected ? 'connected' : 'error'}
                  pulsing={wsConnected}
                />
              </div>
              <div className="w-full">
                <LabeledLink
                  endpoint={{ name: 'SOURCE', url: rpcDatasourceUrl }}
                  status={configError ? 'error' : configLoading ? 'loading' : 'connected'}
                  className="rounded-b-md"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column - only on lg */}
      <div className="hidden w-full flex-col gap-4 lg:flex">
        {/* Faucet */}
        <Faucet rpcUrl={rpcUrl} primaryColor="#27272A" innerOverlay="dark" />

        {/* Control Buttons */}
        <div className="mt-8 grid w-full grid-cols-3 gap-2">
          <button
            onClick={toggleClock}
            className="flex flex-col items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 py-4 transition-colors hover:bg-zinc-700"
            title={isClockPaused ? 'Resume clock' : 'Pause clock'}
          >
            {isClockPaused ? (
              <PlayIcon className="h-8 w-8 text-zinc-300" />
            ) : (
              <PauseIcon className="h-8 w-8 text-zinc-300" />
            )}
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">
              {isClockPaused ? 'Resume' : 'Pause Clock'}
            </span>
          </button>

          <button
            onClick={() => setShowTimeTravel(true)}
            className="flex flex-col items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 py-4 transition-colors hover:bg-zinc-700"
            title="Time Travel"
          >
            <CalendarIcon className="h-8 w-8 text-zinc-300" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">Time Travel</span>
          </button>

          <button
            onClick={exportSnapshot}
            className="flex flex-col items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 py-4 transition-colors hover:bg-zinc-700"
            title="Export Snapshot"
          >
            <ArchiveBoxArrowDownIcon className="h-8 w-8 text-zinc-300" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-300">Export State</span>
          </button>

          {/* <button
            onClick={() => setShowPublishDialog(true)}
            className="flex flex-col items-center gap-2 rounded-lg py-4 transition-colors hover:brightness-110"
            style={{ backgroundColor: brandBlue, border: `1px solid ${brandBlue}` }}
            title="Publish"
          >
            <CloudArrowUpIcon className="h-8 w-8 text-black" />
            <span className="text-[10px] font-medium uppercase tracking-wide text-black">Publish</span>
          </button> */}
        </div>

        {/* SURFNET URLs */}
        <div className="mt-4 flex w-full flex-col gap-0">
          <h2 className="text-sm font-medium uppercase tracking-wide text-white">SURFNET</h2>
          <div className="w-full">
            <LabeledLink
              endpoint={{ name: 'RPC URL', url: rpcUrl }}
              status={configError ? 'error' : configLoading ? 'loading' : 'connected'}
              className="rounded-t-md"
            />
          </div>
          <div className="w-full">
            <LabeledLink
              endpoint={{ name: 'WS URL', url: wsUrl }}
              status={configError ? 'error' : wsConnected ? 'connected' : 'error'}
              pulsing={wsConnected}
            />
          </div>
          <div className="w-full">
            <LabeledLink
              endpoint={{ name: 'SOURCE', url: rpcDatasourceUrl }}
              status={configError ? 'error' : configLoading ? 'loading' : 'connected'}
              className="rounded-b-md"
            />
          </div>
        </div>
      </div>

      {/* Time Travel Dialog */}
      <Dialog open={showTimeTravel} onClose={() => setShowTimeTravel(false)} size="md">
        <div className="text-center">
          <DialogTitle className="mb-8 text-center uppercase tracking-wide">TIME TRAVEL</DialogTitle>

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
                        onChange={(e) => setSelectedTimeAmount(parseInt(e.target.value))}
                        className="w-24 border-none bg-transparent text-right text-2xl font-bold text-zinc-300 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                    className="w-full border-none bg-transparent text-center text-5xl font-bold text-zinc-300 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
                    className="w-full border-none bg-transparent text-center text-3xl font-bold text-zinc-300 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    placeholder={`${currentSlot + currentEpoch * slotsInEpoch}`}
                    autoFocus
                  />
                </div>
              </div>
            )}
          </DialogBody>

          <DialogActions className="!justify-center">
            <button
              onClick={handleTimeTravel}
              className="rounded border border-[#E034AE] bg-[#E034AE] px-6 py-2 font-medium text-white transition-colors hover:bg-[#C02A8F]"
            >
              Jump
            </button>
          </DialogActions>
        </div>
      </Dialog>

      {/* Animation keyframes for dialog transitions */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateX(16px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>

      {/* Publish Dialog */}
      <Dialog
        open={showPublishDialog}
        onClose={() => {
          setShowPublishDialog(false);
          resetPublishState();
        }}
        size="md"
        className="transition-all duration-300 ease-in-out"
      >
        <DialogBody className="transition-all duration-300 ease-in-out">
          {/* Progress UI for uploading/importing/completed/error phases */}
          {publishPhase !== 'config' && (
            <div className="flex flex-col items-center justify-center py-2">
              {/* Uploading Phase */}
              {publishPhase === 'uploading' && (
                <div className="w-full max-w-sm">
                  {/* File info card */}
                  <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#00D4FF]/20">
                        <CloudArrowUpIcon className="h-5 w-5 text-[#00D4FF]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-white">{uploadFileName}</div>
                        {uploadProgress && (
                          <div className="mt-1 text-xs text-zinc-400">{formatBytes(uploadProgress.total)}</div>
                        )}
                      </div>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-[#00D4FF]"></div>
                    </div>

                    {/* Progress bar */}
                    {uploadProgress && (
                      <div className="mt-4">
                        <div className="mb-2 flex justify-between text-xs">
                          <span className="text-zinc-400">Uploading to S3...</span>
                          <span className="font-medium text-[#00D4FF]">
                            {Math.round((uploadProgress.loaded / uploadProgress.total) * 100)}%
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-700">
                          <div
                            className="h-full bg-gradient-to-r from-[#00D4FF] to-[#00D4FF]/70 transition-all duration-300"
                            style={{ width: `${(uploadProgress.loaded / uploadProgress.total) * 100}%` }}
                          />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-zinc-500">
                          <span>{formatBytes(uploadProgress.loaded)}</span>
                          <span>{formatBytes(uploadProgress.total)}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status steps */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                        <svg
                          className="h-3.5 w-3.5 text-green-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-zinc-400">Payment confirmed</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                        <svg
                          className="h-3.5 w-3.5 text-green-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-zinc-400">Network snapshot exported</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-[#00D4FF]"></div>
                      <span className="text-white">Uploading to cloud storage</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-700">
                        <div className="h-2 w-2 rounded-full bg-zinc-500"></div>
                      </div>
                      <span className="text-zinc-500">Import into cloud surfnet</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Importing Phase */}
              {publishPhase === 'importing' && (
                <div className="w-full max-w-sm">
                  {/* Import progress card */}
                  <div className="mb-6 rounded-xl border border-zinc-700 bg-zinc-800/50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-purple-500/20">
                        <ArchiveBoxArrowDownIcon className="h-5 w-5 text-purple-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white">Importing Snapshot</div>
                        {snapshotId && (
                          <div className="mt-1 truncate font-mono text-xs text-zinc-500">{snapshotId}</div>
                        )}
                      </div>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-600 border-t-purple-500"></div>
                    </div>

                    {/* Accounts progress */}
                    {importProgress && (
                      <div className="mt-4">
                        <div className="mb-2 flex justify-between text-xs">
                          <span className="text-zinc-400">Loading accounts...</span>
                          <span className="font-medium text-purple-400">
                            {importProgress.total > 0
                              ? Math.round((importProgress.loaded / importProgress.total) * 100)
                              : 0}
                            %
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-700">
                          <div
                            className="h-full bg-gradient-to-r from-purple-600 to-purple-400 transition-all duration-300"
                            style={{
                              width: `${importProgress.total > 0 ? (importProgress.loaded / importProgress.total) * 100 : 0}%`,
                            }}
                          />
                        </div>
                        <div className="mt-2 flex justify-between text-xs text-zinc-500">
                          <span>{importProgress.loaded.toLocaleString()} accounts</span>
                          <span>{importProgress.total.toLocaleString()} total</span>
                        </div>
                      </div>
                    )}

                    {/* Waiting for progress indicator */}
                    {!importProgress && (
                      <div className="mt-4">
                        <div className="mb-2 text-xs text-zinc-400">Connecting to cloud surfnet...</div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-zinc-700">
                          <div className="h-full w-1/3 animate-pulse bg-purple-500/50"></div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Status steps */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                        <svg
                          className="h-3.5 w-3.5 text-green-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-zinc-400">Payment confirmed</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                        <svg
                          className="h-3.5 w-3.5 text-green-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-zinc-400">Network snapshot exported</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500/20">
                        <svg
                          className="h-3.5 w-3.5 text-green-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={3}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-zinc-400">Uploaded to cloud storage</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-600 border-t-purple-500"></div>
                      <span className="text-white">Importing into cloud surfnet</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed Phase */}
              {publishPhase === 'completed' && (
                <div className="w-full max-w-sm">
                  {/* Large centered checkmark */}
                  <div className="mb-6 flex justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500">
                      <svg
                        className="h-8 w-8 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  </div>

                  {/* Steps completed */}
                  <div className="mb-6 space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <svg
                        className="h-3.5 w-3.5 text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-zinc-400">Payment confirmed</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <svg
                        className="h-3.5 w-3.5 text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-zinc-400">Network snapshot exported</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <svg
                        className="h-3.5 w-3.5 text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-zinc-400">Uploaded to cloud storage</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <svg
                        className="h-3.5 w-3.5 text-green-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={3}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-zinc-400">Imported into cloud surfnet</span>
                    </div>
                  </div>

                  {/* URL + Visit unified component */}
                  {publishedUrl && (
                    <div className="overflow-hidden rounded-lg border border-zinc-700 bg-zinc-800">
                      <div className="flex items-center">
                        <div className="flex flex-1 items-center justify-center px-4 py-3">
                          <span className="font-mono text-xs text-green-400">{typewriterText}</span>
                          <span className="animate-pulse text-xs text-green-400">|</span>
                        </div>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(publishedUrl);
                            setUrlCopied(true);
                            setTimeout(() => setUrlCopied(false), 2000);
                          }}
                          className={`flex items-center rounded-r-lg bg-green-600 px-4 py-3 text-white transition-all duration-300 hover:bg-green-500 ${
                            showVisitButton ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          {urlCopied ? (
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2.5}
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                              />
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error Phase */}
              {publishPhase === 'error' && (
                <div className="w-full max-w-sm">
                  {/* Error card */}
                  <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-red-500/20">
                        <svg
                          className="h-5 w-5 text-red-400"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-white">Publication Failed</div>
                        {publishError && <div className="mt-1 text-xs text-red-300">{publishError}</div>}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setShowPublishDialog(false);
                        resetPublishState();
                      }}
                      className="flex-1 rounded-lg bg-zinc-700 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-600"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        setPublishPhase('config');
                        setPublishError(null);
                      }}
                      className="flex-1 rounded-lg bg-[#00D4FF] px-4 py-3 text-sm font-medium text-black hover:brightness-110"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Config Phase - Original UI */}
          {publishPhase === 'config' && (
            <>
              {/* Toggle Options */}
              <div className="flex justify-center">
                <div className="flex w-[368px] items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-white">Transfer Local State</div>
                    <div className="text-sm text-zinc-400">Include accounts and deployed programs</div>
                  </div>
                  <Switch checked={transferLocalState} onChange={setTransferLocalState} color="cyan" />
                </div>
              </div>

              {/* Pricing Tier Segmented Control */}
              <div className="mt-6 flex justify-center">
                <div className="grid w-[368px] grid-cols-3 gap-2 rounded-xl bg-zinc-800 p-1">
                  <button
                    onClick={() => {
                      setSelectedPricingTier('lite');
                      setPublishLandingPage(false);
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 transition-all duration-200 ${
                      selectedPricingTier === 'lite' ? 'bg-[#00D4FF] text-black' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold">Lite</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold transition-all duration-200 ${
                        selectedPricingTier === 'lite' ? 'bg-white text-[#00D4FF]' : 'bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      $3.99
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPricingTier('pro');
                      setPublishLandingPage(false);
                      setTimeout(() => subdomainInputRef.current?.focus(), 0);
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 transition-all duration-200 ${
                      selectedPricingTier === 'pro' ? 'bg-[#00D4FF] text-black' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold">Pro</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold transition-all duration-200 ${
                        selectedPricingTier === 'pro' ? 'bg-white text-[#00D4FF]' : 'bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      $9.99
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setSelectedPricingTier('max');
                      setPublishLandingPage(true);
                      setTimeout(() => subdomainInputRef.current?.focus(), 0);
                    }}
                    className={`flex flex-col items-center gap-1.5 rounded-lg px-3 py-3 transition-all duration-200 ${
                      selectedPricingTier === 'max' ? 'bg-[#00D4FF] text-black' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span className="font-semibold">Max</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-bold transition-all duration-200 ${
                        selectedPricingTier === 'max' ? 'bg-white text-[#00D4FF]' : 'bg-zinc-700 text-zinc-300'
                      }`}
                    >
                      $99.99
                    </span>
                  </button>
                </div>
              </div>

              {/* Transaction Volume */}
              <div className="mt-6 flex justify-center">
                <div className="flex w-[368px] items-center justify-between gap-4">
                  <div className="text-sm font-medium text-white">Transaction volume</div>
                  <div className="rounded bg-white px-1.5 py-0.5 text-sm font-bold text-zinc-900">
                    {selectedPricingTier === 'lite' ? '50' : selectedPricingTier === 'pro' ? '500' : '5,000'}
                  </div>
                </div>
              </div>

              {/* Visibility */}
              <div className="mt-4 flex justify-center">
                <div className="flex w-[368px] items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-white">Visibility</div>
                    <div className="text-sm text-zinc-400">Accessible to anyone with the link</div>
                  </div>
                  <div className="rounded bg-white px-1.5 py-0.5 text-sm font-bold text-zinc-900">PUBLIC</div>
                </div>
              </div>

              {/* Custom URL - hidden for Lite tier */}
              {selectedPricingTier !== 'lite' && (
                <div className="mt-4 flex flex-col items-center">
                  <div className="flex w-[368px] items-center justify-between gap-4">
                    <div className="text-sm font-medium text-white">Custom URL</div>
                    <div className="flex items-center gap-0.5 rounded-md bg-zinc-800 py-1">
                      <input
                        ref={subdomainInputRef}
                        type="text"
                        value={subdomain}
                        onChange={handleSubdomainChange}
                        placeholder="my-surfnet"
                        maxLength={20}
                        className="w-24 bg-transparent text-right text-sm font-medium text-white placeholder-zinc-600 focus:outline-none"
                      />
                      <span className="text-sm text-white">.surfnet.dev</span>
                      <div className="ml-1 flex h-5 w-5 items-center justify-center">
                        {isCheckingSubdomain && (
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-600 border-t-[#00D4FF]"></div>
                        )}
                        {!isCheckingSubdomain && subdomainAvailable === true && (
                          <svg
                            className="h-5 w-5 text-green-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {!isCheckingSubdomain && subdomainAvailable === false && (
                          <svg
                            className="h-5 w-5 text-red-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isCheckingSubdomain && subdomainAvailable === false && subdomain.length >= 3 && (
                    <p className="mt-1 w-[368px] text-right text-sm text-red-400">This subdomain is already taken</p>
                  )}
                  {subdomain.length > 0 && subdomain.length < 3 && (
                    <p className="mt-1 w-[368px] text-right text-xs text-zinc-500">Min 3 characters</p>
                  )}
                </div>
              )}

              {/* Landing Page Preview (Max tier only) */}
              <div
                className="grid transition-all duration-300 ease-in-out"
                style={{
                  gridTemplateRows: selectedPricingTier === 'max' ? '1fr' : '0fr',
                }}
              >
                <div className="overflow-hidden">
                  <div
                    className="mx-auto mt-6 w-[368px] overflow-hidden rounded-xl border border-zinc-700"
                    style={{ backgroundColor: '#0a0a0a' }}
                  >
                    {/* Header Image Placeholder */}
                    <div
                      className={`relative h-24 cursor-pointer transition-colors ${
                        landingPageHeaderImage
                          ? ''
                          : 'border-b border-dashed border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800'
                      }`}
                      onClick={() => headerImageInputRef.current?.click()}
                    >
                      <input
                        ref={headerImageInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              setLandingPageHeaderImage(event.target?.result as string);
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                      {landingPageHeaderImage ? (
                        <img src={landingPageHeaderImage} alt="Header" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center text-zinc-500">
                          <svg className="mb-1 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="text-xs">Header image</span>
                          <span className="text-[10px] text-zinc-600">1500 × 500</span>
                        </div>
                      )}
                    </div>

                    {/* Avatar, Name, and Content */}
                    <div className="relative px-4 pb-4">
                      {/* Avatar */}
                      <div
                        className={`-mt-8 mb-3 h-16 w-16 cursor-pointer overflow-hidden rounded-full border-2 transition-colors ${
                          landingPageAvatar
                            ? 'border-zinc-900'
                            : 'border-dashed border-zinc-700 bg-zinc-800 hover:bg-zinc-700'
                        }`}
                        onClick={() => avatarInputRef.current?.click()}
                      >
                        <input
                          ref={avatarInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                setLandingPageAvatar(event.target?.result as string);
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        {landingPageAvatar ? (
                          <img src={landingPageAvatar} alt="Avatar" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center text-zinc-500">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            <span className="text-[8px]">400×400</span>
                          </div>
                        )}
                      </div>

                      {/* Org Input */}
                      <input
                        type="text"
                        value={landingPageOrg}
                        onChange={(e) => setLandingPageOrg(e.target.value)}
                        placeholder="Org"
                        className="mb-1 w-full bg-transparent text-xs text-zinc-400 placeholder-zinc-600 focus:outline-none"
                      />

                      {/* Name Input */}
                      <input
                        type="text"
                        value={landingPageName}
                        onChange={(e) => setLandingPageName(e.target.value)}
                        placeholder="Surfnet Name"
                        className="mb-3 w-full bg-transparent text-lg font-bold text-white placeholder-zinc-600 focus:outline-none"
                      />

                      {/* Markdown Drop Zone */}
                      <div
                        className={`relative cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
                          isDraggingMarkdown
                            ? 'border-[#00D4FF] bg-[#00D4FF]/10'
                            : landingPageMarkdown
                              ? 'border-zinc-600 bg-zinc-800/50'
                              : 'border-zinc-700 hover:border-zinc-600'
                        }`}
                        onClick={() => markdownInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsDraggingMarkdown(true);
                        }}
                        onDragLeave={() => setIsDraggingMarkdown(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsDraggingMarkdown(false);
                          const file = e.dataTransfer.files?.[0];
                          if (file && (file.name.endsWith('.md') || file.type === 'text/markdown')) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              setLandingPageMarkdown(event.target?.result as string);
                              setLandingPageMarkdownFileName(file.name);
                            };
                            reader.readAsText(file);
                          }
                        }}
                      >
                        <input
                          ref={markdownInputRef}
                          type="file"
                          accept=".md,text/markdown"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const reader = new FileReader();
                              reader.onload = (event) => {
                                setLandingPageMarkdown(event.target?.result as string);
                                setLandingPageMarkdownFileName(file.name);
                              };
                              reader.readAsText(file);
                            }
                          }}
                        />
                        {landingPageMarkdown ? (
                          <div className="flex items-center justify-center gap-2 text-sm text-zinc-300">
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            <span>{landingPageMarkdownFileName}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setLandingPageMarkdown(null);
                                setLandingPageMarkdownFileName(null);
                              }}
                              className="ml-2 text-zinc-500 hover:text-zinc-300"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <div className="text-zinc-500">
                            <svg className="mx-auto mb-1 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={1.5}
                                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                              />
                            </svg>
                            <span className="text-xs">Drop markdown file or click to upload</span>
                          </div>
                        )}
                      </div>

                      {/* Primary Color Picker */}
                      <div className="mt-3 flex items-center gap-3">
                        <span className="text-xs text-zinc-500">Primary color</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={landingPagePrimaryColor}
                            onChange={(e) => setLandingPagePrimaryColor(e.target.value)}
                            className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent"
                          />
                          <span className="font-mono text-xs text-zinc-400">{landingPagePrimaryColor}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <button
                  onClick={() => {
                    // Create the request payload (network data will be exported after payment)
                    const payload = {
                      surfnet: {
                        subdomain: subdomain,
                        transfer_local_state: transferLocalState,
                        include_landing_page: publishLandingPage,
                        pricing_tier: selectedPricingTier,
                        source_rpc_url: rpcUrl,
                        datasource_rpc_url: rpcDatasourceUrl,
                        // Landing page customization (only for Max tier)
                        ...(selectedPricingTier === 'max' && {
                          landing_page: {
                            org: landingPageOrg,
                            name: landingPageName,
                            markdown: landingPageMarkdown,
                            primary_color: landingPagePrimaryColor,
                            header_image: landingPageHeaderImage,
                            avatar: landingPageAvatar,
                          },
                        }),
                      },
                    };

                    setSurfnetPayload(payload);
                    setShowCheckout(true);
                  }}
                  disabled={
                    selectedPricingTier === 'lite' ? false : !subdomain || subdomain.length < 3 || !subdomainAvailable
                  }
                  className={`flex w-full items-center justify-center gap-2 rounded-xl px-6 py-4 text-lg font-semibold transition-colors ${
                    selectedPricingTier === 'lite' || (subdomain && subdomain.length >= 3 && subdomainAvailable)
                      ? 'bg-[#00D4FF] text-black hover:brightness-110'
                      : 'cursor-not-allowed bg-zinc-700 text-zinc-500'
                  }`}
                >
                  <CloudArrowUpIcon className="h-6 w-6" />
                  Create Cloud Surfnet
                </button>
              </div>
            </>
          )}
        </DialogBody>
      </Dialog>

      {/* Checkout Modal */}
      <MoneyMQProvider client={moneyMQClient}>
        <CheckoutModal
          visible={showCheckout}
          onClose={() => setShowCheckout(false)}
          amount={selectedPricingTier === 'lite' ? 3.99 : selectedPricingTier === 'pro' ? 9.99 : 99.99}
          currency="USDC"
          recipient="9aUn5swQzUTRanaaTwmszxiv89cvFwUCjEBv1vZCoT1u"
          lineItems={[
            {
              product: {
                id: selectedPricingTier === 'lite' ? 'surfnet-lite' : `surfnet-${selectedPricingTier}`,
                name: `Surfnet ${selectedPricingTier === 'lite' ? 'Lite' : selectedPricingTier === 'pro' ? 'Pro' : 'Max'}`,
                description: `${selectedPricingTier === 'lite' ? '50' : selectedPricingTier === 'pro' ? '500' : '5,000'} transactions`,
              },
              price: {
                id: `price-${selectedPricingTier}`,
                unit_amount: selectedPricingTier === 'lite' ? 399 : selectedPricingTier === 'pro' ? 999 : 9999,
                currency: 'USDC',
              },
              quantity: 1,
            },
          ]}
          onSuccess={async (receipt: any) => {
            logger.log('Payment confirmed, full receipt:', receipt);
            logger.log('Receipt keys:', Object.keys(receipt || {}));
            logger.log('Receipt.attachments:', receipt?.attachments);
            logger.log('Receipt.getProcessorData:', receipt?.getProcessorData?.());
            logger.log('Receipt.data:', receipt?.data);
            logger.log('Receipt.metadata:', receipt?.metadata);

            // Close checkout and show uploading phase
            setShowCheckout(false);
            setPublishPhase('uploading');

            // Extract processor data from receipt.claims.attachments
            // New structure: attachments[actorId][key] = data
            // e.g., attachments["cloud-api-svc"]["surfnet"] = { service, status, snapshot, surfnet }
            const attachments = receipt?.claims?.attachments || {};

            // Find the surfnet data from any actor (usually "cloud-api-svc")
            let processorData: any = {};
            for (const actorId of Object.keys(attachments)) {
              const actorData = attachments[actorId];
              if (actorData?.surfnet) {
                processorData = actorData.surfnet;
                break;
              }
            }

            // S3 credentials are under 'snapshot' key
            const credentials = processorData?.snapshot as S3Credentials | undefined;

            // Surfnet info is under 'surfnet' key
            const surfnetInfo = processorData?.surfnet as
              | {
                  rpcUrl?: string;
                  subdomain?: string;
                  domain?: string;
                  networkId?: string;
                }
              | undefined;

            logger.log('Extracted processorData:', processorData);
            logger.log('Extracted credentials:', credentials);
            logger.log('Extracted surfnetInfo:', surfnetInfo);

            if (!credentials || !credentials.bucket) {
              console.error('❌ No S3 credentials received from payment');
              console.error('Receipt structure:', JSON.stringify(receipt, null, 2));
              setPublishPhase('error');
              setPublishError('No upload credentials received from payment. Check console for receipt details.');
              return;
            }

            const now = new Date();
            const expiresAtDate = credentials.expiresAt ? new Date(credentials.expiresAt) : null;
            const timeUntilExpiry = expiresAtDate ? (expiresAtDate.getTime() - now.getTime()) / 1000 : null;

            logger.log('📦 Received S3 credentials:', {
              bucket: credentials.bucket,
              keyPrefix: credentials.keyPrefix,
              expiresAt: credentials.expiresAt,
              currentTime: now.toISOString(),
              timeUntilExpirySeconds: timeUntilExpiry,
              isExpired: timeUntilExpiry !== null && timeUntilExpiry <= 0,
            });

            if (timeUntilExpiry !== null && timeUntilExpiry <= 0) {
              console.error('❌ S3 credentials are already expired!');
              setPublishPhase('error');
              setPublishError('Upload credentials have expired. Please try again.');
              return;
            }

            // Export the network data using the surfnet_exportNetwork cheatcode
            logger.log('🌐 Exporting network data...');
            const dataString = await exportNetwork();

            if (!dataString || dataString.length === 0) {
              console.error('❌ Export returned empty data');
              setPublishPhase('error');
              setPublishError('Failed to export network data - empty response');
              return;
            }

            // Calculate upload size for progress
            const dataSize = dataString.length;
            setUploadProgress({ loaded: 0, total: dataSize });

            logger.log(
              '✅ Network data exported, size:',
              dataSize,
              'bytes, first 200 chars:',
              dataString.substring(0, 200)
            );

            // Upload the network data to S3 using the temporary credentials
            const uploadResult = await uploadToS3(credentials, dataString, 'surfnet-export.json');

            if (!uploadResult.success) {
              console.error('❌ Failed to upload to S3:', uploadResult.error);
              setPublishPhase('error');
              setPublishError(uploadResult.error || 'Failed to upload to cloud');
              return;
            }

            // Update progress to complete
            setUploadProgress({ loaded: dataSize, total: dataSize });
            logger.log('✅ Network data uploaded to S3:', uploadResult.url);

            // Switch to importing phase and connect to WebSocket
            setPublishPhase('importing');
            setImportProgress(null); // Will be set once we receive first progress update

            // Connect to WebSocket for snapshot import updates
            const snapshotWsUrl = wsUrl || 'ws://localhost:8899';
            try {
              const ws = new WebSocket(snapshotWsUrl);
              snapshotWsRef.current = ws;

              ws.onopen = () => {
                logger.log('🔌 WebSocket connected, subscribing to snapshot import...');
                // Send snapshotSubscribe request
                ws.send(
                  JSON.stringify({
                    jsonrpc: '2.0',
                    id: 1,
                    method: 'snapshotSubscribe',
                    params: [uploadResult.url],
                  })
                );
              };

              ws.onmessage = (event) => {
                try {
                  const data = JSON.parse(event.data);
                  logger.log('📨 WebSocket message:', data);

                  // Handle subscription confirmation
                  if (data.id === 1 && data.result !== undefined) {
                    logger.log('✅ Snapshot subscription confirmed, id:', data.result);
                    return;
                  }

                  // Handle snapshot notifications
                  if (data.method === 'snapshotNotification' && data.params?.result) {
                    const notification = data.params.result;
                    logger.log('📊 Snapshot import progress:', notification);

                    // Capture snapshot ID if present
                    if (notification.snapshot_id || notification.snapshotId) {
                      setSnapshotId(notification.snapshot_id || notification.snapshotId);
                    }

                    setImportProgress({
                      loaded: notification.accounts_loaded || notification.accountsLoaded || 0,
                      total: notification.total_accounts || notification.totalAccounts || 0,
                    });

                    // Check for completion or error
                    if (notification.status === 'Completed') {
                      logger.log('✅ Snapshot import completed!');
                      ws.close();
                      setPublishPhase('completed');

                      // Build the published URL from surfnet info or fallback to subdomain
                      const surfnetUrl = surfnetInfo?.subdomain
                        ? `https://${surfnetInfo.subdomain}.surfnet.dev`
                        : selectedPricingTier === 'lite'
                          ? `https://${credentials.keyPrefix.split('/')[1]}.surfnet.dev`
                          : `https://${subdomain}.surfnet.dev`;
                      setPublishedUrl(surfnetUrl);
                    } else if (notification.status === 'Failed') {
                      console.error('❌ Snapshot import failed:', notification.error);
                      ws.close();
                      setPublishPhase('error');
                      setPublishError(notification.error || 'Snapshot import failed');
                    }
                  }
                } catch (e) {
                  console.error('Failed to parse WebSocket message:', e);
                }
              };

              ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                // Don't immediately fail - the import might still work
              };

              ws.onclose = () => {
                logger.log('🔌 WebSocket closed');
                snapshotWsRef.current = null;
              };
            } catch (error) {
              console.error('Failed to connect to WebSocket:', error);
              // If WebSocket fails, still show success since upload worked
              setPublishPhase('completed');
              const surfnetUrl = surfnetInfo?.subdomain
                ? `https://${surfnetInfo.subdomain}.surfnet.dev`
                : selectedPricingTier === 'lite'
                  ? `https://${credentials.keyPrefix.split('/')[1]}.surfnet.dev`
                  : `https://${subdomain}.surfnet.dev`;
              setPublishedUrl(surfnetUrl);
            }
          }}
          onError={(error) => {
            console.error('Payment failed:', error);
          }}
          accentColor="#ec4899"
        />
      </MoneyMQProvider>
    </div>
  );
};

export default ExplorerHeader;
