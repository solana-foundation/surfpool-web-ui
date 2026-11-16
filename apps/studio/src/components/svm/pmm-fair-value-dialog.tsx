'use client';

import {
  buildPmmFairValueScenario,
  createTemplateScenario,
  fetchScenarioTemplates,
  isValidPmmPrice,
  marketPairLabel,
  PMM_FAIR_VALUE_ADAPTERS,
  type PmmFairValueAdapter,
  type PmmMarketOption,
  type PmmProtocol,
  type ServedTemplate,
} from '@/lib/pmm-fair-value';
import {
  Button,
  Combobox,
  ComboboxDescription,
  ComboboxLabel,
  ComboboxOption,
  Dialog,
  DialogActions,
  DialogDescription,
  DialogTitle,
  Input,
  Listbox,
  ListboxOption,
} from '@surfpool/ui';
import { type ChangeEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { typedAccountOption } from './token-selector-options';

interface PmmFairValueDialogProps {
  open: boolean;
  studioUrl: string;
  rpcUrl: string;
  onClose: () => void;
  onCreated: (scenarioId: string) => void;
}

const renderProtocolOption = (adapter: PmmFairValueAdapter) => (
  <ListboxOption key={adapter.protocol} value={adapter.protocol}>
    {adapter.label}
  </ListboxOption>
);

const displayMarket = (market: PmmMarketOption | null) => market?.label;

const normalizeSearch = (text: string) => text.replace(/\s+/g, '').toLowerCase();

const matchesMarket = (market: PmmMarketOption | null, query: string) => {
  if (!market) return false;
  const search = normalizeSearch(query);
  return normalizeSearch(market.label).includes(search) || normalizeSearch(market.value).includes(search);
};

const renderMarketOption = (market: PmmMarketOption) => (
  <ComboboxOption key={market.value} value={market}>
    <ComboboxLabel>{market.label}</ComboboxLabel>
    <ComboboxDescription>{market.value}</ComboboxDescription>
  </ComboboxOption>
);

export default function PmmFairValueDialog({ open, studioUrl, rpcUrl, onClose, onCreated }: PmmFairValueDialogProps) {
  // STATE
  const [protocol, setProtocol] = useState<PmmProtocol | null>(null);
  const [market, setMarket] = useState('');
  const [price, setPrice] = useState('100');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [templates, setTemplates] = useState<ServedTemplate[] | null>(null);
  const [customMarket, setCustomMarket] = useState<PmmMarketOption | null>(null);

  // REFS
  const marketRequestRef = useRef(0);

  // DERIVED STATE
  const availableAdapters = Object.values(PMM_FAIR_VALUE_ADAPTERS).filter(
    (candidate) => !!templates?.some((template) => template.id === candidate.marketTemplateId)
  );
  const adapter = availableAdapters.find((candidate) => candidate.protocol === protocol) ?? availableAdapters[0];
  const marketOptions = templates === null ? null : (adapter?.markets ?? []);
  const listedMarket = marketOptions?.find((option) => option.value === market);
  const loadedCustomMarket = customMarket?.value === market ? customMarket : undefined;
  const selectedMarket = listedMarket ?? (market === '' ? marketOptions?.[0] : loadedCustomMarket);
  const pickerOptions = loadedCustomMarket ? [...(marketOptions ?? []), loadedCustomMarket] : (marketOptions ?? []);
  const canCreate = !!selectedMarket && isValidPmmPrice(price) && !isCreating;
  const priceLabel = marketPairLabel(selectedMarket);
  const servedError = templates !== null && !adapter ? 'This surfnet serves no PMM fair value templates' : null;
  const visibleError = error ?? servedError;

  // HANDLERS
  const handleClose = () => {
    if (isCreating) return;
    setError(null);
    onClose();
  };

  const handleProtocolSelect = (selectedProtocol: PmmProtocol) => {
    setProtocol(selectedProtocol);
    setMarket('');
    setCustomMarket(null);
    setError(null);
  };

  const typedMarket = (query: string): PmmMarketOption | null => {
    const typed = typedAccountOption(query, pickerOptions);
    return typed ? { label: typed.metadata?.symbol ?? query, value: query } : null;
  };

  const handleMarketSelect = (selectedMarketOption: PmmMarketOption | null) => {
    if (!selectedMarketOption || !adapter) return;
    const address = selectedMarketOption.value;
    const requestId = ++marketRequestRef.current;
    setMarket(address);
    setError(null);
    if (marketOptions?.some((option) => option.value === address) || customMarket?.value === address) return;
    adapter
      .readMarket(rpcUrl, address, marketOptions ?? [])
      .then((read) => {
        if (requestId === marketRequestRef.current) setCustomMarket({ ...read, label: selectedMarketOption.label });
      })
      .catch((readError: unknown) => {
        if (requestId !== marketRequestRef.current) return;
        setError(readError instanceof Error ? readError.message : `Failed to read market ${address}`);
      });
  };

  const handlePriceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPrice(event.target.value);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate || !selectedMarket || !adapter) return;

    setIsCreating(true);
    setError(null);

    try {
      const scenario = buildPmmFairValueScenario(adapter, selectedMarket, price);
      const result = await createTemplateScenario(studioUrl, scenario);
      onCreated(result.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Failed to create ${adapter.label} fair value`);
    } finally {
      setIsCreating(false);
    }
  };

  // EFFECTS
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTemplates(null);

    fetchScenarioTemplates(studioUrl)
      .then((loadedTemplates) => {
        if (!cancelled) setTemplates(loadedTemplates);
      })
      .catch((loadError: unknown) => {
        if (cancelled) return;
        setTemplates([]);
        setError(loadError instanceof Error ? loadError.message : 'Failed to load PMM markets');
      });

    return () => {
      cancelled = true;
    };
  }, [open, studioUrl]);

  return (
    <Dialog open={open} onClose={handleClose} size="xl">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create PMM fair value</DialogTitle>
        <DialogDescription>
          Choose a PMM and market, then set the price of one base token in quote tokens. The scenario moves the
          maker&apos;s quote to that price. No swap is sent.
        </DialogDescription>
        <div className="mt-5 space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-zinc-300">PMM protocol</span>
            <Listbox
              aria-label="PMM protocol"
              placeholder={templates === null ? 'Loading protocols…' : undefined}
              value={adapter?.protocol ?? ''}
              onChange={handleProtocolSelect}
              disabled={isCreating || !availableAdapters.length}
            >
              {availableAdapters.map(renderProtocolOption)}
            </Listbox>
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-zinc-300">Market</span>
            <Combobox<PmmMarketOption | null>
              aria-label="PMM market"
              placeholder={marketOptions === null ? 'Loading markets…' : 'Search by pair or address'}
              options={pickerOptions}
              value={selectedMarket ?? null}
              by="value"
              immediate
              displayValue={displayMarket}
              filter={matchesMarket}
              customOption={typedMarket}
              onChange={handleMarketSelect}
              disabled={isCreating || !marketOptions?.length}
            >
              {renderMarketOption}
            </Combobox>
          </div>
          <div>
            <label htmlFor="pmm-fair-value-price" className="mb-1.5 block text-sm font-medium text-zinc-300">
              {priceLabel}
            </label>
            <Input
              id="pmm-fair-value-price"
              inputMode="decimal"
              placeholder="100.25"
              value={price}
              onChange={handlePriceChange}
              disabled={isCreating}
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Positive decimal. The raw fields are derived from the selected market.
            </p>
          </div>
          {!!visibleError && <p className="text-sm text-red-400">{visibleError}</p>}
        </div>
        <DialogActions>
          <Button type="button" color="dark" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button type="submit" color="pink" disabled={!canCreate}>
            {isCreating ? 'Creating…' : 'Create scenario'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
