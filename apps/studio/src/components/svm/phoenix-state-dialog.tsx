'use client';

import {
  createPhoenixCollateralScenario,
  createPhoenixDirectMarkScenario,
  createPhoenixMaintenanceMarginScenario,
  fetchDynamicRefOptions,
  type DynamicRefOption,
} from '@/lib/scenarios-api';
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
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { findOptionByTypedValue } from './token-selector-options';

const PhoenixStateMode = {
  Collateral: 'collateral',
  DirectMark: 'direct-mark',
  MaintenanceMargin: 'maintenance-margin',
} as const;

type PhoenixStateMode = (typeof PhoenixStateMode)[keyof typeof PhoenixStateMode];

const PhoenixStateModeLabel: Record<PhoenixStateMode, string> = {
  [PhoenixStateMode.Collateral]: 'Liquidation-risk collateral',
  [PhoenixStateMode.DirectMark]: 'Direct mark-price adjustment',
  [PhoenixStateMode.MaintenanceMargin]: 'Maintenance margin stress',
};

const phoenixStateModes = Object.values(PhoenixStateMode);

// The backend's ranges: a mark is a u32 tick count of at least 1, and Phoenix reads a risk factor
// above 100% as 100%. A factor must also be above the market's backstop factor, which only the
// backend can check.
const MAX_MARK_TICKS = 4_294_967_295;
const MAX_RISK_FACTOR_BPS = 10_000;

const isWholeNumberInRange = (value: string, min: number, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max;

type PhoenixUnit = 'percent' | 'usd' | 'raw';

interface UnitChoice {
  unit: PhoenixUnit;
  label: string;
  placeholder: string;
}

const unitChoices: Record<PhoenixStateMode, UnitChoice[]> = {
  [PhoenixStateMode.Collateral]: [
    { unit: 'usd', label: 'USD', placeholder: 'Signed amount, for example -250.5' },
    { unit: 'raw', label: 'Quote lots', placeholder: 'Signed quote lots' },
  ],
  [PhoenixStateMode.DirectMark]: [
    { unit: 'percent', label: '%', placeholder: 'Change from the current mark, for example -10' },
    { unit: 'usd', label: 'USD', placeholder: 'Target price' },
    { unit: 'raw', label: 'Ticks', placeholder: 'Target ticks, at least 1' },
  ],
  [PhoenixStateMode.MaintenanceMargin]: [
    { unit: 'percent', label: '%', placeholder: 'Share of initial margin, live markets use 50' },
    { unit: 'raw', label: 'bps', placeholder: 'Up to 10000, live markets use 5000' },
  ],
};

const amountLabel: Record<PhoenixStateMode, string> = {
  [PhoenixStateMode.Collateral]: 'Target collateral',
  [PhoenixStateMode.DirectMark]: 'Target mark',
  [PhoenixStateMode.MaintenanceMargin]: 'Maintenance risk factor',
};

const formatUsd = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;

const usdPerTick = (market?: DynamicRefOption) =>
  (market?.tickSize ?? NaN) * 10 ** ((market?.baseLotDecimals ?? NaN) - 6);

// Collateral is PhUSD with 6 decimals and risk factors are bps of initial margin. Raw input passes
// through as typed, so large lot counts stay exact.
const toRawAmount = (mode: PhoenixStateMode, unit: PhoenixUnit, amount: string, market?: DynamicRefOption) => {
  if (unit === 'raw') return amount.trim();
  const value = amount.trim() ? Number(amount) : NaN;
  const raw =
    mode === PhoenixStateMode.Collateral
      ? value * 1e6
      : mode === PhoenixStateMode.MaintenanceMargin
        ? value * 100
        : unit === 'usd'
          ? value / usdPerTick(market)
          : (market?.markTicks ?? NaN) * (1 + value / 100);
  return Number.isSafeInteger(Math.round(raw)) ? String(Math.round(raw)) : null;
};

// The units a market can convert; one without price data takes raw ticks only.
const availableUnits = (mode: PhoenixStateMode, market?: DynamicRefOption) =>
  unitChoices[mode].filter((choice) => toRawAmount(mode, choice.unit, '0', market) !== null);

interface PhoenixStateDialogProps {
  open: boolean;
  studioUrl: string;
  onClose: () => void;
  onCreated: (scenarioId: string) => void;
}

const renderStateModeOption = (stateMode: PhoenixStateMode) => (
  <ListboxOption key={stateMode} value={stateMode}>
    {PhoenixStateModeLabel[stateMode]}
  </ListboxOption>
);

const renderUnitOption = ({ unit, label }: UnitChoice) => (
  <ListboxOption key={unit} value={unit}>
    {label}
  </ListboxOption>
);

const displayMarketSymbol = (marketSymbol: string | null) => marketSymbol ?? undefined;

export default function PhoenixStateDialog({ open, studioUrl, onClose, onCreated }: PhoenixStateDialogProps) {
  // STATE
  const [mode, setMode] = useState<PhoenixStateMode>(PhoenixStateMode.DirectMark);
  const [trader, setTrader] = useState('');
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<PhoenixUnit>('percent');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [marketOptions, setMarketOptions] = useState<DynamicRefOption[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);

  // DERIVED STATE
  const symbolOptions = marketOptions.map((option) => option.value);
  const addressBySymbol = new Map(marketOptions.map((option) => [option.value, option.address]));
  const hasSymbolCatalog = marketOptions.length > 0;
  const isCatalogUnavailable = !isLoadingSymbols && !hasSymbolCatalog;
  const marketSymbol = isLoadingSymbols ? '' : symbol.trim();
  const hasSymbol = !!marketSymbol;
  const isCustomSymbol = hasSymbol && !symbolOptions.includes(marketSymbol);
  const market = marketOptions.find((option) => option.value === marketSymbol);
  const units = availableUnits(mode, market);
  const activeChoice = units.find((choice) => choice.unit === unit) ?? units[0];
  const rawAmount = toRawAmount(mode, activeChoice.unit, amount, market) ?? '';
  const markUsd = (market?.markTicks ?? NaN) * usdPerTick(market);
  const markChange = (Number(rawAmount) / (market?.markTicks ?? NaN) - 1) * 100;
  const hint =
    mode === PhoenixStateMode.DirectMark && !!rawAmount && Number.isFinite(markUsd)
      ? `${formatUsd(markUsd)} → ${formatUsd(Number(rawAmount) * usdPerTick(market))} (${markChange > 0 ? '+' : ''}${Number(markChange.toFixed(1))}%), ${rawAmount} ticks`
      : activeChoice.unit !== 'raw' && !!rawAmount
        ? `Sends ${rawAmount} ${unitChoices[mode].at(-1)?.label.toLowerCase()}`
        : null;
  const hasSignedCollateral = /^-?\d+$/.test(rawAmount);
  const hasTargetTicks = isWholeNumberInRange(rawAmount, 1, MAX_MARK_TICKS);
  const hasRiskFactor = isWholeNumberInRange(rawAmount, 1, MAX_RISK_FACTOR_BPS);
  const canCreate =
    !isCreating &&
    ((mode === PhoenixStateMode.Collateral && !!trader.trim() && hasSignedCollateral) ||
      (mode === PhoenixStateMode.DirectMark && hasSymbol && hasTargetTicks) ||
      (mode === PhoenixStateMode.MaintenanceMargin && hasSymbol && hasRiskFactor));

  // HELPERS
  const matchesMarket = (optionSymbol: string | null, query: string) => {
    if (!optionSymbol) return false;
    const search = query.trim().toLowerCase();
    const address = addressBySymbol.get(optionSymbol)?.toLowerCase();
    return optionSymbol.toLowerCase().includes(search) || !!address?.includes(search);
  };

  const customMarketSymbol = (query: string) =>
    findOptionByTypedValue(
      marketOptions.map((option) => ({ id: option.value, label: option.value, ...option })),
      query
    )
      ? null
      : query;

  const renderMarketOption = (optionSymbol: string) => (
    <ComboboxOption key={optionSymbol} value={optionSymbol}>
      <ComboboxLabel>{optionSymbol}</ComboboxLabel>
      <ComboboxDescription>{addressBySymbol.get(optionSymbol) ?? 'Custom symbol'}</ComboboxDescription>
    </ComboboxOption>
  );

  // HANDLERS
  const handleClose = () => {
    if (isCreating) return;
    setError(null);
    onClose();
  };

  const handleModeChange = (selectedMode: PhoenixStateMode) => {
    setMode(selectedMode);
    setUnit(unitChoices[selectedMode][0].unit);
    setAmount('');
    setError(null);
  };

  const handleUnitChange = (selectedUnit: PhoenixUnit) => {
    setUnit(selectedUnit);
    setError(null);
  };

  const handleTraderChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTrader(event.target.value);
    setError(null);
  };

  const handleSymbolChange = (pickedSymbol: string | null) => {
    if (!pickedSymbol) return;
    const pickedUnits = availableUnits(
      mode,
      marketOptions.find((option) => option.value === pickedSymbol)
    );
    const pickedUnit = (pickedUnits.find((choice) => choice.unit === unit) ?? pickedUnits[0]).unit;
    // The same amount means something else in another unit, so 10% must not become 10 ticks.
    if (pickedUnit !== activeChoice.unit) {
      setUnit(pickedUnit);
      setAmount('');
    }
    setSymbol(pickedSymbol);
    setError(null);
  };

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    // The amount means the unit shown beside it, also the ticks shown while markets load.
    setUnit(activeChoice.unit);
    setAmount(event.target.value);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;

    setIsCreating(true);
    setError(null);

    try {
      const result =
        mode === PhoenixStateMode.Collateral
          ? await createPhoenixCollateralScenario(studioUrl, trader, rawAmount)
          : mode === PhoenixStateMode.DirectMark
            ? await createPhoenixDirectMarkScenario(studioUrl, marketSymbol, rawAmount)
            : await createPhoenixMaintenanceMarginScenario(studioUrl, marketSymbol, rawAmount);
      onCreated(result.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to create Phoenix state scenario');
    } finally {
      setIsCreating(false);
    }
  };

  // EFFECTS
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    setIsLoadingSymbols(true);
    setMarketOptions([]);

    const handleSymbolsLoaded = (options: DynamicRefOption[]) => {
      if (cancelled) return;
      setMarketOptions(options);
      setSymbol((current) => current || (options.find((option) => option.value === 'BTC') ?? options[0])?.value || '');
      setIsLoadingSymbols(false);
    };

    fetchDynamicRefOptions(studioUrl, 'list_phoenix_markets').then(handleSymbolsLoaded);

    return () => {
      cancelled = true;
    };
  }, [open, studioUrl]);

  const amountField = (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-zinc-300">{amountLabel[mode]}</span>
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            aria-label={amountLabel[mode]}
            placeholder={activeChoice.placeholder}
            value={amount}
            onChange={handleAmountChange}
          />
        </div>
        <div className="w-36">
          <Listbox aria-label="Unit" value={activeChoice.unit} onChange={handleUnitChange} disabled={isCreating}>
            {units.map(renderUnitOption)}
          </Listbox>
        </div>
      </div>
      {!!hint && <p className="mt-1.5 text-sm text-zinc-400">{hint}</p>}
    </div>
  );

  return (
    <Dialog open={open} onClose={handleClose} size="xl">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create Phoenix state scenario</DialogTitle>
        <DialogDescription>
          Prepare Phoenix state for bots to trade, arbitrage, or liquidate. Surfpool does not execute their
          transactions.
        </DialogDescription>
        <div className="mt-5 space-y-4">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-zinc-300">State goal</span>
            <Listbox aria-label="State goal" value={mode} onChange={handleModeChange} disabled={isCreating}>
              {phoenixStateModes.map(renderStateModeOption)}
            </Listbox>
          </div>

          {mode === PhoenixStateMode.Collateral ? (
            <>
              <Input
                aria-label="Phoenix Trader account"
                placeholder="Trader account"
                value={trader}
                onChange={handleTraderChange}
              />
              {amountField}
            </>
          ) : (
            <>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-zinc-300">Market</span>
                {/* null, not undefined: Headless UI treats undefined as uncontrolled and warns once markets load. */}
                <Combobox<string | null>
                  aria-label="Phoenix market"
                  placeholder={isLoadingSymbols ? 'Loading markets…' : 'Search or type a symbol or orderbook address'}
                  options={symbolOptions}
                  value={symbol || null}
                  immediate
                  displayValue={displayMarketSymbol}
                  filter={matchesMarket}
                  customOption={customMarketSymbol}
                  onChange={handleSymbolChange}
                  disabled={isCreating || isLoadingSymbols}
                >
                  {renderMarketOption}
                </Combobox>
                {(isCatalogUnavailable || isCustomSymbol) && (
                  <p role="status" className="mt-1.5 text-sm text-zinc-400">
                    {isCatalogUnavailable && 'Markets could not be loaded, so type the exact symbol. '}A symbol Phoenix
                    does not list is skipped at Play.
                  </p>
                )}
              </div>
              {amountField}
            </>
          )}
          {!!error && <p className="text-sm text-red-400">{error}</p>}
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
