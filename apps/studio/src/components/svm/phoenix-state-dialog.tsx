'use client';

import {
  createPhoenixCollateralLiquidationScenario,
  createPhoenixMaintenanceMarginScenario,
  createPhoenixMarketMoveScenario,
  createPhoenixOraclePriceScenario,
  fetchDynamicRefOptions,
  fetchPhoenixTraderPositions,
  type DynamicRefOption,
  type PhoenixMarketMove,
  type PhoenixTraderPositions,
} from '@/lib/scenarios-api';
import { PublicKey } from '@solana/web3.js';
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
  MarketMove: 'market-move',
  OraclePrice: 'oracle-price',
  CollateralLiquidation: 'collateral-liquidation',
  MaintenanceMargin: 'maintenance-margin',
} as const;

type PhoenixStateMode = (typeof PhoenixStateMode)[keyof typeof PhoenixStateMode];

const PhoenixStateModeLabel: Record<PhoenixStateMode, string> = {
  [PhoenixStateMode.MarketMove]: 'Market price move',
  [PhoenixStateMode.OraclePrice]: 'Oracle price',
  [PhoenixStateMode.CollateralLiquidation]: 'Liquidate traders by collateral',
  [PhoenixStateMode.MaintenanceMargin]: 'Maintenance margin factor',
};

const phoenixStateModes = Object.values(PhoenixStateMode);

const LiquidationDepth = {
  OneLiquidation: 'one-liquidation',
  EveryPosition: 'every-position',
  AfterPriceMove: 'after-price-move',
} as const;

type LiquidationDepth = (typeof LiquidationDepth)[keyof typeof LiquidationDepth];

const LiquidationDepthLabel: Record<LiquidationDepth, string> = {
  [LiquidationDepth.OneLiquidation]: 'One liquidation per trader',
  [LiquidationDepth.EveryPosition]: 'Positions one after another, while it stays liquidatable',
  [LiquidationDepth.AfterPriceMove]: 'Healthy now, liquidatable after a price move',
};

const liquidationDepths = Object.values(LiquidationDepth);

// The backend's ranges: a price is a u32 tick count of at least 1, and a risk factor is at most
// 100% of the initial margin. Phoenix also refuses a maintenance factor above the market's cancel
// order factor, which only the backend can check.
const MAX_MARK_TICKS = 4_294_967_295;
const MAX_RISK_FACTOR_BPS = 10_000;

const isAddress = (value: string) => {
  try {
    new PublicKey(value);
    return true;
  } catch {
    return false;
  }
};

const isWholeNumberInRange = (value: string, min: number, max: number) =>
  /^\d+$/.test(value.trim()) && Number(value) >= min && Number(value) <= max;

type PhoenixUnit = 'percent' | 'usd' | 'raw';

interface UnitChoice {
  unit: PhoenixUnit;
  label: string;
  placeholder: string;
}

const priceUnits: UnitChoice[] = [
  { unit: 'percent', label: '%', placeholder: 'Change from the current mark, for example -10' },
  { unit: 'usd', label: 'USD', placeholder: 'Target price' },
  { unit: 'raw', label: 'Ticks', placeholder: 'Target ticks, at least 1' },
];

// The liquidation goal moves no price, so it takes no amount.
const unitChoices: Record<PhoenixStateMode, UnitChoice[]> = {
  [PhoenixStateMode.MarketMove]: priceUnits,
  [PhoenixStateMode.OraclePrice]: priceUnits,
  [PhoenixStateMode.CollateralLiquidation]: [],
  [PhoenixStateMode.MaintenanceMargin]: [
    { unit: 'percent', label: '%', placeholder: 'Share of initial margin, mainnet markets use 50' },
    { unit: 'raw', label: 'bps', placeholder: 'At most the cancel order factor, mainnet markets use 5000' },
  ],
};

const amountLabel: Partial<Record<PhoenixStateMode, string>> = {
  [PhoenixStateMode.MarketMove]: 'Target price',
  [PhoenixStateMode.OraclePrice]: 'Oracle price',
  [PhoenixStateMode.MaintenanceMargin]: 'Maintenance risk factor',
};

const PhoenixStateModeHint: Record<PhoenixStateMode, string> = {
  [PhoenixStateMode.MarketMove]: 'Moves the oracle readings, maker liquidity and the order book to the new price.',
  [PhoenixStateMode.OraclePrice]:
    'Moves only the oracle price. The order book and makers keep their old prices, so trades fill against the old book.',
  [PhoenixStateMode.CollateralLiquidation]:
    "Sets each trader's effective collateral so a keeper can liquidate it now, or cancels its orders and keeps it healthy until a price move one slot later.",
  [PhoenixStateMode.MaintenanceMargin]: 'Changes the share of initial margin a position must keep before liquidation.',
};

const formatUsd = (value: number) => `$${value.toLocaleString('en-US', { maximumFractionDigits: 6 })}`;

const usdPerTick = (market?: DynamicRefOption) =>
  (market?.tickSize ?? NaN) * 10 ** ((market?.baseLotDecimals ?? NaN) - 6);

// Risk factors are bps of initial margin. Raw input passes through as typed, so large tick counts
// stay exact.
const toRawAmount = (mode: PhoenixStateMode, unit: PhoenixUnit, amount: string, market?: DynamicRefOption) => {
  if (unit === 'raw') return amount.trim();
  const value = amount.trim() ? Number(amount) : NaN;
  const raw =
    mode === PhoenixStateMode.MaintenanceMargin
      ? value * 100
      : unit === 'usd'
        ? value / usdPerTick(market)
        : (market?.markTicks ?? NaN) * (1 + value / 100);
  return Number.isSafeInteger(Math.round(raw)) ? String(Math.round(raw)) : null;
};

// The units a market can convert; one without price data takes raw ticks only.
const availableUnits = (mode: PhoenixStateMode, market?: DynamicRefOption) =>
  unitChoices[mode].filter((choice) => toRawAmount(mode, choice.unit, '0', market) !== null);

const parseAddresses = (text: string) => [...new Set(text.split(/[\s,]+/).filter(Boolean))];

// Puts the effective collateral midway between the backstop margin and the maintenance or high-risk margin. After a
// price move the range starts no lower than where the trader is still healthy before the move, and the collateral set
// a slot earlier leaves out what the move changes.
const liquidationCollateral = ({ margin, marginAfterMoves }: PhoenixTraderPositions, depth: LiquidationDepth) => {
  const m = depth === LiquidationDepth.AfterPriceMove ? marginAfterMoves : margin;
  if (!m) throw new Error('Surfpool returned no margin after the price move.');
  const pair = BigInt(depth === LiquidationDepth.EveryPosition ? m.highRiskMargin : m.maintenanceMargin);
  const healthyBefore =
    BigInt(m.effectiveCollateral) - BigInt(margin.effectiveCollateral) + BigInt(margin.maintenanceMargin) + BigInt(1);
  const isAfterPriceMove = depth === LiquidationDepth.AfterPriceMove;
  const from =
    isAfterPriceMove && healthyBefore > BigInt(m.backstopMargin) && healthyBefore < pair
      ? healthyBefore
      : BigInt(m.backstopMargin);
  return String(BigInt(margin.effectiveCollateral) - BigInt(m.effectiveCollateral) + (from + pair) / BigInt(2));
};

const staysHealthy = ({ margin: m }: PhoenixTraderPositions, collateral: string) =>
  BigInt(collateral) > BigInt(m.maintenanceMargin);

const cushion = (m: PhoenixTraderPositions['margin']) => BigInt(m.effectiveCollateral) - BigInt(m.maintenanceMargin);

// A move that leaves the trader as far from liquidation, or further, can never make it cross.
const isHelpedByMove = ({ margin, marginAfterMoves }: PhoenixTraderPositions) =>
  !!marginAfterMoves && cushion(marginAfterMoves) >= cushion(margin);

// Each market moves against the side holding more maintenance margin there, down on a tie.
const marketMoves = (
  traders: PhoenixTraderPositions[],
  marketBySymbol: Map<string, DynamicRefOption>,
  percent: number
) => {
  const longMinusShort = new Map<string, bigint>();
  for (const { symbol, side, maintenanceMarginQuoteLots } of traders.flatMap(({ positions }) => positions)) {
    const margin = BigInt(maintenanceMarginQuoteLots);
    longMinusShort.set(symbol, (longMinusShort.get(symbol) ?? BigInt(0)) + (side === 'long' ? margin : -margin));
  }
  return [...longMinusShort].map(([symbol, weight]): PhoenixMarketMove => {
    const markTicks = marketBySymbol.get(symbol)?.markTicks;
    if (!markTicks) throw new Error(`No mark price is loaded for ${symbol}.`);
    const factor = weight >= BigInt(0) ? 1 - percent / 100 : 1 + percent / 100;
    return { symbol, targetTicks: String(Math.max(1, Math.round(markTicks * factor))) };
  });
};

interface PhoenixStateDialogProps {
  open: boolean;
  studioUrl: string;
  rpcUrl: string;
  onClose: () => void;
  onCreated: (scenarioId: string) => void;
}

const renderStateModeOption = (stateMode: PhoenixStateMode) => (
  <ListboxOption key={stateMode} value={stateMode}>
    {PhoenixStateModeLabel[stateMode]}
  </ListboxOption>
);

const renderLiquidationDepthOption = (depth: LiquidationDepth) => (
  <ListboxOption key={depth} value={depth}>
    {LiquidationDepthLabel[depth]}
  </ListboxOption>
);

const renderUnitOption = ({ unit, label }: UnitChoice) => (
  <ListboxOption key={unit} value={unit}>
    {label}
  </ListboxOption>
);

const displayMarketSymbol = (marketSymbol: string | null) => marketSymbol ?? undefined;

export default function PhoenixStateDialog({ open, studioUrl, rpcUrl, onClose, onCreated }: PhoenixStateDialogProps) {
  // STATE
  const [mode, setMode] = useState<PhoenixStateMode>(PhoenixStateMode.MarketMove);
  const [trader, setTrader] = useState('');
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('');
  const [depth, setDepth] = useState<LiquidationDepth>(LiquidationDepth.OneLiquidation);
  const [movePercent, setMovePercent] = useState('2');
  const [unit, setUnit] = useState<PhoenixUnit>('percent');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [marketOptions, setMarketOptions] = useState<DynamicRefOption[]>([]);
  const [isLoadingSymbols, setIsLoadingSymbols] = useState(true);

  // DERIVED STATE
  const symbolOptions = marketOptions.map((option) => option.value);
  const marketBySymbol = new Map(marketOptions.map((option) => [option.value, option]));
  const hasSymbolCatalog = marketOptions.length > 0;
  const isCatalogUnavailable = !isLoadingSymbols && !hasSymbolCatalog;
  const marketSymbol = isLoadingSymbols ? '' : symbol.trim();
  const hasSymbol = !!marketSymbol;
  const isCustomSymbol = hasSymbol && !symbolOptions.includes(marketSymbol);
  const market = marketBySymbol.get(marketSymbol);
  const units = availableUnits(mode, market);
  const activeChoice = units.find((choice) => choice.unit === unit) ?? units[0];
  const rawAmount = activeChoice ? (toRawAmount(mode, activeChoice.unit, amount, market) ?? '') : '';
  const markUsd = (market?.markTicks ?? NaN) * usdPerTick(market);
  const markChange = (Number(rawAmount) / (market?.markTicks ?? NaN) - 1) * 100;
  const isPriceMode = mode === PhoenixStateMode.MarketMove || mode === PhoenixStateMode.OraclePrice;
  const hint =
    isPriceMode && !!rawAmount && Number.isFinite(markUsd)
      ? `${formatUsd(markUsd)} → ${formatUsd(Number(rawAmount) * usdPerTick(market))} (${markChange > 0 ? '+' : ''}${Number(markChange.toFixed(1))}%), ${rawAmount} ticks`
      : !!activeChoice && activeChoice.unit !== 'raw' && !!rawAmount
        ? `Sends ${rawAmount} ${unitChoices[mode].at(-1)?.label.toLowerCase()}`
        : null;
  const hasTargetTicks = isWholeNumberInRange(rawAmount, 1, MAX_MARK_TICKS);
  // Phoenix refuses a maintenance factor at or below the market's backstop factor.
  const backstopBps = mode === PhoenixStateMode.MaintenanceMargin ? market?.backstopRiskFactorBps : undefined;
  const isAtOrBelowBackstop = backstopBps !== undefined && !!rawAmount && Number(rawAmount) <= backstopBps;
  const hasRiskFactor = isWholeNumberInRange(rawAmount, 1, MAX_RISK_FACTOR_BPS) && !isAtOrBelowBackstop;
  const traderAddresses = parseAddresses(trader);
  const invalidTraderAddresses = traderAddresses.filter((address) => !isAddress(address));
  const isCollateralLiquidation = mode === PhoenixStateMode.CollateralLiquidation;
  const isAfterPriceMove = isCollateralLiquidation && depth === LiquidationDepth.AfterPriceMove;
  // A move of 100% or more would leave no positive price.
  const isMovePercentInRange = Number(movePercent) > 0 && Number(movePercent) < 100;
  const isMoveReady = isMovePercentInRange && !isLoadingSymbols;
  const canCreate =
    !isCreating &&
    ((isCollateralLiquidation &&
      !!traderAddresses.length &&
      !invalidTraderAddresses.length &&
      (!isAfterPriceMove || isMoveReady)) ||
      (hasSymbol &&
        ((isPriceMode && hasTargetTicks) || (mode === PhoenixStateMode.MaintenanceMargin && hasRiskFactor))));

  // HELPERS
  const matchesMarket = (optionSymbol: string | null, query: string) => {
    if (!optionSymbol) return false;
    const search = query.trim().toLowerCase();
    const address = marketBySymbol.get(optionSymbol)?.address?.toLowerCase();
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
      <ComboboxDescription>{marketBySymbol.get(optionSymbol)?.address ?? 'Custom symbol'}</ComboboxDescription>
    </ComboboxOption>
  );

  const createCollateralLiquidationScenario = async () => {
    const load = (moves?: PhoenixMarketMove[]) =>
      Promise.all(traderAddresses.map((address) => fetchPhoenixTraderPositions(studioUrl, rpcUrl, address, moves)));
    const moves = isAfterPriceMove ? marketMoves(await load(), marketBySymbol, Number(movePercent)) : undefined;
    const traders = await load(moves);
    const unprepared = traders.flatMap(({ trader: address, positions, refusal }) => {
      if (refusal) return [refusal];
      return positions.length ? [] : [`${address} holds no open Phoenix positions`];
    });
    if (unprepared.length) throw new Error(`${unprepared.join('; ')}.`);
    const prepared = traders.map((plan) => ({ ...plan, collateral: liquidationCollateral(plan, depth) }));
    const helped = prepared.filter((plan) => isAfterPriceMove && isHelpedByMove(plan));
    if (helped.length) {
      throw new Error(`The move does not push ${helped.map((plan) => plan.trader).join(', ')} toward liquidation.`);
    }
    const unhealthy = prepared.filter((plan) => isAfterPriceMove && !staysHealthy(plan, plan.collateral));
    if (unhealthy.length) {
      throw new Error(`${unhealthy.map((plan) => plan.trader).join(', ')} would not stay healthy until the move.`);
    }
    return createPhoenixCollateralLiquidationScenario(studioUrl, prepared, moves);
  };

  // HANDLERS
  const handleClose = () => {
    if (isCreating) return;
    setError(null);
    onClose();
  };

  const handleModeChange = (selectedMode: PhoenixStateMode) => {
    setMode(selectedMode);
    setUnit(unitChoices[selectedMode][0]?.unit ?? 'raw');
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

  const handleDepthChange = (selectedDepth: LiquidationDepth) => {
    setDepth(selectedDepth);
    setError(null);
  };

  const handleMovePercentChange = (event: ChangeEvent<HTMLInputElement>) => {
    setMovePercent(event.target.value);
    setError(null);
  };

  const handleSymbolChange = (pickedSymbol: string | null) => {
    if (!pickedSymbol) return;
    const pickedUnits = availableUnits(mode, marketBySymbol.get(pickedSymbol));
    const pickedUnit = (pickedUnits.find((choice) => choice.unit === unit) ?? pickedUnits[0])?.unit;
    const isUnitChange = !!pickedUnit && pickedUnit !== activeChoice?.unit;
    const isOtherMarket = !!marketSymbol && pickedSymbol !== marketSymbol;
    // The same amount means something else in another unit, so 10% must not become 10 ticks, and a USD or
    // tick amount names another price on another market; only a % carries over.
    if (isUnitChange) setUnit(pickedUnit);
    if (isUnitChange || (isOtherMarket && pickedUnit !== 'percent')) setAmount('');
    setSymbol(pickedSymbol);
    setError(null);
  };

  const handleAmountChange = (event: ChangeEvent<HTMLInputElement>) => {
    // The amount means the unit shown beside it, also the ticks shown while markets load.
    if (activeChoice) setUnit(activeChoice.unit);
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
        mode === PhoenixStateMode.MarketMove
          ? await createPhoenixMarketMoveScenario(studioUrl, marketSymbol, rawAmount)
          : mode === PhoenixStateMode.OraclePrice
            ? await createPhoenixOraclePriceScenario(studioUrl, marketSymbol, rawAmount)
            : isCollateralLiquidation
              ? await createCollateralLiquidationScenario()
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

    fetchDynamicRefOptions(studioUrl, rpcUrl, 'list_phoenix_markets').then(handleSymbolsLoaded);

    return () => {
      cancelled = true;
    };
  }, [open, studioUrl, rpcUrl]);

  const amountField = activeChoice ? (
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
      {isAtOrBelowBackstop && (
        <p role="status" className="mt-1.5 text-sm text-red-400">
          Must be above the backstop factor ({backstopBps} bps).
        </p>
      )}
    </div>
  ) : null;

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
            <p className="mt-1.5 text-sm text-zinc-400">{PhoenixStateModeHint[mode]}</p>
          </div>

          {isCollateralLiquidation && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-zinc-300">Trader accounts</span>
              <Input
                aria-label="Phoenix Trader accounts"
                placeholder="Addresses of Phoenix Trader accounts, separated by commas or spaces"
                value={trader}
                onChange={handleTraderChange}
                spellCheck={false}
                autoComplete="off"
              />
              {!!invalidTraderAddresses.length && (
                <p role="status" className="mt-1.5 text-sm text-red-400">
                  Not a valid Solana address: {invalidTraderAddresses.join(', ')}
                </p>
              )}
            </div>
          )}
          {!isCollateralLiquidation && (
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
          )}
          {isCollateralLiquidation && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-zinc-300">Liquidation depth</span>
              <Listbox aria-label="Liquidation depth" value={depth} onChange={handleDepthChange} disabled={isCreating}>
                {liquidationDepths.map(renderLiquidationDepthOption)}
              </Listbox>
            </div>
          )}
          {isAfterPriceMove && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-zinc-300">Price move (%)</span>
              <Input
                aria-label="Price move"
                value={movePercent}
                onChange={handleMovePercentChange}
                inputMode="decimal"
              />
              <p className="mt-1.5 text-sm text-zinc-400">
                Each market moves against the positions held there by this percent: down for longs, up for shorts, and
                against the side with more margin when both are held.
              </p>
              {!!movePercent.trim() && !isMovePercentInRange && (
                <p role="status" className="mt-1.5 text-sm text-red-400">
                  Enter a percent above 0 and below 100.
                </p>
              )}
            </div>
          )}
          {amountField}
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
