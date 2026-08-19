'use client';

import { createPumpGraduationScenario } from '@/lib/scenarios-api';
import { Button, Dialog, DialogActions, DialogDescription, DialogTitle, Input } from '@surfpool/ui';
import { type ChangeEvent, type FormEvent, useState } from 'react';

type PumpGraduationDialogProps = {
  open: boolean;
  studioUrl: string;
  onClose: () => void;
  onCreated: (scenarioId: string) => void;
};

export default function PumpGraduationDialog({ open, studioUrl, onClose, onCreated }: PumpGraduationDialogProps) {
  // STATE
  const [tokenMint, setTokenMint] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const mint = tokenMint.trim();
    if (!mint || isCreating) return;

    setIsCreating(true);
    setError(null);

    try {
      const result = await createPumpGraduationScenario(studioUrl, mint);
      setTokenMint('');
      onCreated(result.id);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to create Pump graduation scenario');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} size="xl">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Create Pump graduation scenario</DialogTitle>
        <DialogDescription>
          Enter a live Token-2022 Pump mint. Surfpool validates its curve and builds one editable preparation slot.
        </DialogDescription>
        <div className="mt-5">
          <Input
            aria-label="Pump token mint"
            placeholder="Token mint ending in pump"
            value={tokenMint}
            onChange={handleMintChange}
            disabled={isCreating}
          />
          {!!error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
        <DialogActions>
          <Button type="button" color="dark" onClick={handleClose} disabled={isCreating}>
            Cancel
          </Button>
          <Button type="submit" color="pink" disabled={!tokenMint.trim() || isCreating}>
            {isCreating ? 'Validating…' : 'Create scenario'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
