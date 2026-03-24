import { getProtocolIcon } from '@/lib/protocol-icons';
import type { ScenarioBentoItem } from './scenarios-bento.types';

interface ScenarioCardProps {
  item: ScenarioBentoItem;
  isSelected: boolean;
}

export default function ScenarioCard({ item, isSelected }: ScenarioCardProps) {
  const slots = item.steps || [];

  return (
    <>
      <div
        className={`absolute inset-0 rounded-2xl transition-colors duration-200 ${
          isSelected
            ? 'bg-zinc-300 dark:bg-zinc-800'
            : 'bg-zinc-50 group-hover:bg-zinc-100 dark:bg-zinc-900 dark:group-hover:bg-zinc-800'
        }`}
      />
      <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(theme(borderRadius.2xl)+1px)] border border-zinc-200/40 transition-colors duration-200 group-hover:border-zinc-300/60 dark:border-zinc-700/30 dark:group-hover:border-zinc-600/50">
        {/* Header Section */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div className="min-w-0 flex-1">
            <h3 className="text-md truncate font-semibold text-zinc-950 dark:text-zinc-50">{item.name}</h3>
            {item.description &&
              item.description !== 'null' &&
              item.description !== 'No description available' &&
              item.description !== 'Add a description...' && (
                <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
              )}
          </div>
        </div>

        {/* Footer Section with Timeline */}
        <div
          className="relative mt-auto border-t border-zinc-200/40 bg-zinc-100/50 py-4 dark:border-zinc-700/30 dark:bg-zinc-950/50"
          style={{
            backgroundImage: `radial-gradient(circle, rgba(161, 161, 170, 0.15) 1px, transparent 1px)`,
            backgroundSize: '16px 16px',
          }}
        >
          {/* Timeline ruler line */}
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-px bg-zinc-300 dark:bg-zinc-700" />

          {/* Timeline ticks */}
          <div className="pointer-events-none absolute left-6 right-6 top-0 flex items-start gap-2">
            {slots.map((slot) => (
              <div
                key={`tick-${slot.id}`}
                className="flex flex-shrink-0 items-center justify-center"
                style={{ width: '47px' }}
              >
                <div className="h-3 w-px bg-zinc-300 dark:bg-zinc-700" />
              </div>
            ))}
          </div>

          {/* Timeline slots */}
          <div className="relative px-6 pt-1">
            <div className="flex items-start gap-2 overflow-x-auto">
              {slots.map((slot) => {
                const actions = slot.actions || [];
                const maxVisible = 3;
                const visibleActions = actions.slice(0, maxVisible);
                const remaining = actions.length - maxVisible;

                return (
                  <div
                    key={slot.id}
                    className="flex flex-shrink-0 flex-col items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-50 p-2 shadow-sm dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <div className="flex flex-col gap-1">
                      {actions.length === 0 ? (
                        <div className="flex h-7 w-7 items-center justify-center rounded">
                          <div className="h-4 w-4 rounded border border-dashed border-zinc-400 dark:border-zinc-600" />
                        </div>
                      ) : (
                        visibleActions.map((action, iconIndex) => {
                          const isLast = iconIndex === visibleActions.length - 1 && remaining > 0;
                          return (
                            <div
                              key={`${slot.id}-${action.actionId}-${iconIndex}`}
                              className="relative flex h-7 w-7 items-center justify-center rounded"
                              title={`${action.protocol}: ${action.action}`}
                            >
                              {isLast ? (
                                <div className="flex h-full w-full items-center justify-center rounded bg-zinc-200 dark:bg-zinc-700">
                                  <span className="text-[10px] font-semibold text-zinc-600 dark:text-zinc-400">
                                    +{remaining}
                                  </span>
                                </div>
                              ) : (
                                <img
                                  src={getProtocolIcon(action.protocolId)}
                                  alt={action.protocol}
                                  className="h-5 w-5"
                                />
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 rounded-2xl shadow-lg shadow-zinc-950/[0.03] ring-1 ring-zinc-950/5 transition-shadow duration-200 group-hover:shadow-xl group-hover:shadow-zinc-950/[0.05] dark:shadow-zinc-950/50 dark:ring-zinc-50/10 dark:group-hover:shadow-zinc-950/70" />
    </>
  );
}
