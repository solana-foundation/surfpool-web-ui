import { getProtocolIcon } from '@/lib/protocol-icons';
import { ArrowRightIcon } from '@heroicons/react/24/solid';
import Image from 'next/image';

interface ScenarioPresetsProps {
  onPumpGraduationSelect: () => void;
  onPumpSwapPriceShockSelect: () => void;
}

export default function ScenarioPresets({ onPumpGraduationSelect, onPumpSwapPriceShockSelect }: ScenarioPresetsProps) {
  return (
    <section aria-labelledby="scenario-presets-heading" className="mx-auto mb-8 max-w-7xl px-6 lg:px-8">
      <div className="mb-3">
        <h2 id="scenario-presets-heading" className="text-sm font-semibold text-zinc-200">
          Scenario presets
        </h2>
        <p className="mt-1 text-sm text-zinc-500">Prepare common protocol states without an AI prompt.</p>
      </div>

      <div className="grid max-w-4xl gap-3 md:grid-cols-2">
        <button
          type="button"
          onClick={onPumpGraduationSelect}
          className="group flex items-center gap-4 rounded-2xl border border-zinc-700/50 bg-zinc-900/60 p-4 text-left shadow-lg shadow-black/10 transition-colors hover:border-pink-500/40 hover:bg-zinc-900"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-zinc-700/70">
            <Image src={getProtocolIcon('pump')} alt="" width={28} height={28} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-zinc-100">Pump graduation</span>
            <span className="mt-1 block text-sm leading-5 text-zinc-500">
              Prepare a live Token-2022 bonding curve one buy before migration.
            </span>
          </span>
          <ArrowRightIcon className="size-4 shrink-0 text-zinc-600 transition-colors group-hover:text-pink-400" />
        </button>

        <button
          type="button"
          onClick={onPumpSwapPriceShockSelect}
          className="group flex items-center gap-4 rounded-2xl border border-zinc-700/50 bg-zinc-900/60 p-4 text-left shadow-lg shadow-black/10 transition-colors hover:border-violet-500/40 hover:bg-zinc-900"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-zinc-800 ring-1 ring-zinc-700/70">
            <Image src={getProtocolIcon('pumpswap')} alt="" width={28} height={28} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-zinc-100">PumpSwap price shock</span>
            <span className="mt-1 block text-sm leading-5 text-zinc-500">
              Shift a migrated coin&apos;s price through virtual quote reserves.
            </span>
          </span>
          <ArrowRightIcon className="size-4 shrink-0 text-zinc-600 transition-colors group-hover:text-violet-400" />
        </button>
      </div>
    </section>
  );
}
