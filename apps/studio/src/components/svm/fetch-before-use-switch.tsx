import { Switch } from '@surfpool/ui';

interface FetchBeforeUseSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export default function FetchBeforeUseSwitch({ checked, onChange, disabled }: FetchBeforeUseSwitchProps) {
  // DERIVED STATE
  const hint = checked
    ? 'Play fetches each account from the upstream datasource before changing it.'
    : 'Play changes each account as it is in the local VM, so state prepared there is kept. An account that is not there is skipped.';

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-300">Fetch before use</span>
        <Switch
          aria-label="Fetch before use"
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          color="purple"
        />
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">{hint}</p>
    </div>
  );
}
