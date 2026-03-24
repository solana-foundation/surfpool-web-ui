import type { Scenario } from '@/lib/scenarios-data';
import type { ScenarioBentoItem } from './scenarios-bento.types';

interface ScenarioDetailOverviewProps {
  item: ScenarioBentoItem;
  editingDescription: string | null;
  onEditDescription: (id: string | null) => void;
  onUpdateScenario: (id: string, updates: Partial<Scenario>) => void;
}

export default function ScenarioDetailOverview({
  item,
  editingDescription,
  onEditDescription,
  onUpdateScenario,
}: ScenarioDetailOverviewProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 p-8 md:grid-cols-2">
        <div className="space-y-4">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Description
            </h3>
            {editingDescription === item.id ? (
              <textarea
                value={
                  item.description === 'No description available' || item.description === 'Add a description...'
                    ? ''
                    : item.description
                }
                onChange={(e) => onUpdateScenario(item.id, { description: e.target.value })}
                onBlur={() => onEditDescription(null)}
                autoFocus
                rows={3}
                className="w-full rounded-lg border border-zinc-700/50 bg-zinc-800/40 px-3 py-2 text-sm text-zinc-950 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:text-zinc-50"
              />
            ) : (
              <p
                className="group cursor-pointer text-sm text-zinc-950 hover:text-zinc-700 dark:text-zinc-50 dark:hover:text-zinc-300"
                onClick={() => onEditDescription(item.id)}
              >
                {item.description &&
                item.description !== 'null' &&
                item.description !== 'No description available' &&
                item.description !== 'Add a description...'
                  ? item.description
                  : 'Click to add description...'}
              </p>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Total Steps
            </h3>
            <p className="text-sm text-zinc-950 dark:text-zinc-50">{item.steps?.length || 0}</p>
          </div>
          {item.created_at && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Created At
              </h3>
              <p className="text-sm text-zinc-950 dark:text-zinc-50">
                {new Date(item.created_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
        <div className="space-y-4">
          {item.updated_at && (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Last Updated
              </h3>
              <p className="text-sm text-zinc-950 dark:text-zinc-50">
                {new Date(item.updated_at).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
