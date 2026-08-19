'use client';

import { createPumpSwapPriceShockScenario } from '@/lib/scenarios-api';
import { Button, Dialog, DialogActions, DialogDescription, DialogTitle, Input } from '@surfpool/ui';
import { type ChangeEvent, type FormEvent, useState } from 'react';

interface PumpSwapPriceShockDialogProps {
  open: boolean;
  studioUrl: string;
  onClose: () => void;
  onCreated: (scenarioId: string) => void;
}

export default function PumpSwapPriceShockDialog({
  open,
  studioUrl,
  onClose,
  onCreated,
}: PumpSwapPriceShockDialogProps) {
  // STATE
  const [tokenMint, setTokenMint] = useState('');
  const [virtualQuoteReserves, setVirtualQuoteReserves] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // DERIVED STATE
  const normalizedReserves = virtualQuoteReserves.trim();
  const hasValidReserves = /^[1-9]\d*$/.test(normalizedReserves);
  const canCreate = !!tokenMint.trim() && hasValidReserves && !isCreating;

  // HANDLERS
  const handleClose = () => {
    if (isCreating) return;
    setError(null);
    onClose();
  };

  const handleMintChange = (event: ChangeEvent<HTMLInputElement>) => {
    setTokenMint(event.target.value);
    setError(null);
  };

  const handleReservesChange = (event: ChangeEvent<HTMLInputElement>) => {
    setVirtualQuoteReserves(event.target.value);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;

    setIsCreating(true);
    setError(null);

    try {
      const result = await createPumpSwapPriceShockScenario(studioUrl, tokenMint, normalizedReserves);
      setTokenMint('');
      setVirtualQuoteReserves('');
      onCreated(result.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to create PumpSwap price shock scenario');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} size="xl">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create PumpSwap price shock</DialogTitle>
        <DialogDescription>
          Enter a migrated pump.fun mint and a positive raw virtual quote reserve amount. Surfpool validates its
          canonical WSOL pool before creating the scenario.
        </DialogDescription>
        <div className="mt-5 space-y-4">
          <div>
            <label htmlFor="pump-swap-price-shock-mint" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Token mint
            </label>
            <Input
              id="pump-swap-price-shock-mint"
              placeholder="Migrated token mint ending in pump"
              value={tokenMint}
              onChange={handleMintChange}
              disabled={isCreating}
            />
          </div>
          <div>
            <label htmlFor="pump-swap-price-shock-reserves" className="mb-1.5 block text-sm font-medium text-zinc-300">
              Virtual quote reserves
            </label>
            <Input
              id="pump-swap-price-shock-reserves"
              inputMode="numeric"
              placeholder="15000000000000"
              value={virtualQuoteReserves}
              onChange={handleReservesChange}
              disabled={isCreating}
            />
            <p className="mt-1.5 text-xs text-zinc-500">
              Raw WSOL units written to the pool&apos;s virtual quote reserves.
            </p>
          </div>
          {!!error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <DialogActions>
          <Button type="button" color="dark" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button type="submit" color="pink" disabled={!canCreate}>
            {isCreating ? 'Validating…' : 'Create scenario'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
