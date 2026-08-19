'use client';

import { Navbar, NavbarItem, NavbarSection } from '@surfpool/ui';
import { logger } from '@surfpool/shared';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { ReactNode, useEffect, useState } from 'react';
import CollapsibleSearch from './collapsible-search';

export interface BentoItem {
  id: string;
  name: string;
  description: string;
  status?: {
    online: boolean;
    status: string;
  };
  metadata?: Record<string, any>;
}

interface GenericBentoProps<T extends BentoItem> {
  items: T[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  emptyState?: ReactNode; // Custom empty state component (overrides emptyMessage)
  renderItem: (item: T, isSelected: boolean) => ReactNode;
  renderDetailHeader: (item: T, onClose?: () => void) => ReactNode;
  renderDetailContent: (item: T, activeTab: string) => ReactNode;
  renderDetailActions?: (item: T, onClose?: () => void) => ReactNode; // Optional custom actions
  tabs?: Array<{
    id: string;
    label: string;
    icon: ReactNode;
  }>;
  defaultTab?: string;
  headerContent?: ReactNode;
  leftActions?: ReactNode; // Content to render on the left side of search
  onSelectionChange?: (item: T | null) => void;
  onItemClick?: (item: T, tab: string) => void; // When an item is clicked
  onTabChange?: (tabId: string) => void;
  onClose?: () => void; // Called when detail pane is closed
  initialSelectedId?: string; // For deep linking
  initialTab?: string; // For deep linking to a specific tab
}

export default function GenericBento<T extends BentoItem>({
  items,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found',
  emptyState,
  renderItem,
  renderDetailHeader,
  renderDetailContent,
  renderDetailActions,
  tabs = [],
  defaultTab = 'overview',
  headerContent,
  leftActions,
  onSelectionChange,
  onItemClick,
  onTabChange,
  onClose,
  initialSelectedId,
  initialTab,
}: GenericBentoProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<T | null>(null);
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper to close detail pane and notify parent
  const handleClose = () => {
    setSelectedItem(null);
    setSelectedItemId(null);
    onClose?.();
  };

  // Auto-select newly created item
  const [previousItemCount, setPreviousItemCount] = useState(items.length);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [lastInitialSelectedId, setLastInitialSelectedId] = useState<string | undefined>(undefined);

  // Track last initialTab to detect changes
  const [lastInitialTab, setLastInitialTab] = useState<string | undefined>(undefined);

  // Reset initialization when initialSelectedId changes to a different non-undefined value
  useEffect(() => {
    const shouldReset = initialSelectedId !== undefined && initialSelectedId !== lastInitialSelectedId;

    if (shouldReset) {
      logger.log('GenericBento: initialSelectedId changed to different ID', lastInitialSelectedId, '->', initialSelectedId, 'tab:', initialTab);
      setHasInitialized(false);
      setLastInitialSelectedId(initialSelectedId);

      // Update tab and expansion state if initialTab is provided
      if (initialTab) {
        logger.log('GenericBento: Setting active tab to', initialTab);
        setActiveTab(initialTab);
        setIsExpanded(initialTab !== defaultTab);
        setLastInitialTab(initialTab);
      } else {
        logger.log('GenericBento: Setting active tab to default', defaultTab);
        setActiveTab(defaultTab);
        setIsExpanded(false);
        setLastInitialTab(undefined);
      }
    }
  }, [initialSelectedId, lastInitialSelectedId, initialTab, defaultTab]);

  // Update tab when initialTab changes (for URL-based tab switching)
  useEffect(() => {
    if (initialTab && initialTab !== lastInitialTab && selectedItem) {
      logger.log('GenericBento: initialTab changed', lastInitialTab, '->', initialTab);
      setActiveTab(initialTab);
      setIsExpanded(initialTab !== defaultTab);
      setLastInitialTab(initialTab);
    }
  }, [initialTab, lastInitialTab, defaultTab, selectedItem]);

  // Initialize with deep-linked item
  useEffect(() => {
    if (!hasInitialized && initialSelectedId) {
      // Only try if we have items loaded
      if (items.length > 0) {
        logger.log('Deep linking: searching for', initialSelectedId, 'in', items.length, 'items');
        logger.log('Deep linking: item IDs:', items.map(i => i.id));
        const itemToSelect = items.find(item => item.id === initialSelectedId);
        if (itemToSelect) {
          logger.log('Deep linking: found item', itemToSelect.id);
          setSelectedItem(itemToSelect);
          setSelectedItemId(initialSelectedId);
          setHasInitialized(true);
        } else {
          console.warn('Deep linking: item not found', initialSelectedId, 'available IDs:', items.map(i => i.id));
        }
      } else {
        logger.log('Deep linking: waiting for items to load, currently', items.length);
      }
      // If items.length is 0, don't mark as initialized yet - wait for items to load
    } else if (!hasInitialized && !initialSelectedId) {
      // No deep linking requested
      setHasInitialized(true);
    }
  }, [initialSelectedId, items, hasInitialized]);

  useEffect(() => {
    // Auto-select newly added item
    if (items.length > previousItemCount) {
      // Find the newest item (last one in the array, assuming it was just added)
      const newestItem = items[items.length - 1];
      if (newestItem) {
        setSelectedItem(newestItem);
      }
    }

    setPreviousItemCount(items.length);
  }, [items.length, previousItemCount]);

  // Separate effect to update selected item when items change
  useEffect(() => {
    if (selectedItemId) {
      logger.log('GenericBento: items changed, checking if selected item still exists:', selectedItemId);

      // Find the item in the current items list to ensure it's up-to-date
      const updatedItem = items.find(item => item.id === selectedItemId);

      // If the item no longer exists in the list, deselect it
      if (!updatedItem) {
        logger.log('GenericBento: selected item no longer exists, deselecting');
        handleClose();
        return;
      }

      logger.log('GenericBento: updating selected item with fresh data');
      // Always update with the latest version from items to ensure fresh data
      setSelectedItem(updatedItem);
    }
  }, [items, selectedItemId]);

  // Notify parent when selection changes
  useEffect(() => {
    logger.log('GenericBento: selectedItem changed to:', selectedItem?.id || 'null');
    onSelectionChange?.(selectedItem);
  }, [selectedItem, onSelectionChange]);

  // Handle Escape key to close detail pane
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedItem) {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem]);

  // Filter items based on search query
  const filteredItems = items.filter((item) => {
    const query = searchQuery.toLowerCase();
    const name = String(item.name).toLowerCase();
    const description = String(item.description).toLowerCase();
    return name.includes(query) || description.includes(query);
  });

  return (
    <div className="flex h-[100vh] flex-col lg:h-[calc(100vh-60px)]">
      {/* Top Section - Grid */}
      <div
        className={`overflow-auto ${
          selectedItem
            ? isExpanded
              ? 'h-[12.5%]' // 1/8 when expanded
              : 'h-1/2' // 1/2 by default
            : 'h-full'
        } transition-all duration-300 ease-in-out`}
        onScroll={(e) => {
          // Emit scroll event for navbar to detect
          const scrollTop = (e.target as HTMLDivElement).scrollTop;
          window.dispatchEvent(new CustomEvent('bentoScroll', { detail: { scrollTop } }));
        }}
      >
        <div className="mx-auto max-w-7xl px-[24px] pt-4 pb-1 sm:px-6 sm:pt-2 lg:px-8">
          {/* Search Field and Header Content - hide when empty */}
          {items.length > 0 && (
            <div className="mb-6 flex items-center justify-between">
              {leftActions && <div>{leftActions}</div>}
              <CollapsibleSearch
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={setSearchQuery}
              />
            </div>
          )}

          {filteredItems.length === 0 ? (
            searchQuery ? (
              <div className="flex h-64 items-center justify-center">
                <p className="text-zinc-500 dark:text-zinc-400">No items match your search</p>
              </div>
            ) : emptyState ? (
              emptyState
            ) : (
              <div className="flex h-64 items-center justify-center">
                <p className="text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
              </div>
            )
          ) : (
            <div className="grid grid-cols-1 gap-x-[20px] gap-y-[20px]">
              {' '}
              {filteredItems.map((item) => {
                const isSelected = selectedItem?.id === item.id;

                return (
                  <div
                    key={String(item.id)}
                    className="group relative cursor-pointer transition-transform duration-200 ease-out hover:scale-[1.02]"
                    onClick={() => {
                      logger.log('GenericBento: item clicked:', item.id);
                      setSelectedItem(item);
                      setActiveTab(defaultTab);
                      // Notify parent about item selection so URL can be updated
                      onItemClick?.(item, defaultTab);
                    }}
                  >
                    {renderItem(item, isSelected)}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section - Detail Pane */}
      {selectedItem && (
        <div
          className={`${
            isExpanded ? 'h-[87.5%]' : 'h-1/2'
          } relative z-20 -mr-5 -ml-5 flex flex-col border-t-2 border-zinc-200 bg-zinc-50 transition-all duration-300 ease-in-out dark:border-zinc-800 dark:bg-zinc-900`}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-6 py-3 gap-3">
            {renderDetailHeader(selectedItem, handleClose)}
            <div className="flex flex-col items-end gap-1.5">
              <button
                onClick={handleClose}
                className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                title="Close details"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
              {renderDetailActions && renderDetailActions(selectedItem, handleClose)}
            </div>
          </div>

          {/* Navbar Navigation */}
          {tabs.length > 0 && (
            <div className="border-b border-zinc-200/40 pl-5 dark:border-zinc-700/30">
              <Navbar>
                <NavbarSection>
                  {tabs.map((tab) => (
                    <NavbarItem
                      key={tab.id}
                      current={activeTab === tab.id}
                      onClick={() => {
                        setActiveTab(tab.id);
                        // Notify parent of tab change
                        onTabChange?.(tab.id);
                        // Expand when clicking on any tab other than the default
                        if (tab.id !== defaultTab) {
                          setIsExpanded(true);
                        } else {
                          setIsExpanded(false);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      {tab.icon && <span className="mr-2">{tab.icon}</span>}
                      {tab.label}
                    </NavbarItem>
                  ))}
                </NavbarSection>
              </Navbar>
            </div>
          )}

          {/* Tab Content */}
          <div className="flex-1 overflow-auto">{renderDetailContent(selectedItem, activeTab)}</div>
        </div>
      )}
    </div>
  );
}
