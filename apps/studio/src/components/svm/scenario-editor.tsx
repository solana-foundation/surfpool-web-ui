'use client';

import { useAppConfig } from '@/hooks/use-app-config';
import { getProtocolIcon } from '@/lib/protocol-icons';
import {
  fetchDynamicRefOptions,
  flattenOverrideValues,
  parseScenariosJson,
  scenarioDownloadFile,
  serializeScenarioJson,
  snapshotDownloadContents,
  toScenarioNumber,
  type DynamicRefOption,
  type OverridePayload,
} from '@/lib/scenarios-api';
import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  ForwardIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  PlusIcon,
  StopIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { logger } from '@surfpool/shared';
import { Combobox, ComboboxLabel, ComboboxOption, Select, Switch } from '@surfpool/ui';
import { AnimatePresence, motion } from 'framer-motion';
import { LosslessNumber } from 'lossless-json';
import React, { useEffect, useRef, useState } from 'react';
import { getFieldsFromRawLayout } from './raw-layout-fields';
import { customValueOption, findOptionByTypedValue, resolveTokenSelectorOptions } from './token-selector-options';
import TransactionInspector from './transaction-inspector';

interface Protocol {
  id: string;
  title: string;
  description: string;
  icon_url: string;
  actions: Action[];
  // Set when one brand ships several programs, so the panel asks which one first.
  // `actions` stays flattened across all of them.
  products?: Product[];
}

interface Product {
  id: string;
  title: string;
  description: string;
  actions: Action[];
}

interface Action {
  id: string;
  title: string;
  description: string;
  template?: any; // Full template data including IDL
}

interface Slot {
  id: string;
  height: number;
  actions: {
    overrideId?: string; // Preserve the override ID from backend
    protocolId: string;
    actionId: string;
    protocol: string;
    action: string;
    overrides?: Record<string, unknown>;
    modifiedFields?: string[];
    fetchBeforeUse?: boolean;
    account?: any; // Account address from template (Pubkey or PDA)
    original?: Record<string, unknown>; // Untouched backend override, passed through on save
  }[];
}

interface ScenarioEditorProps {
  scenarioId?: string;
  scenarioName?: string;
  scenarioDescription?: string;
  scenarioTags?: string[];
  initialSteps?: Array<{
    id: string;
    name: string;
    type: string;
    status?: string;
    actions?: Array<{
      overrideId?: string; // Preserve the override ID from backend
      protocolId: string;
      actionId: string;
      protocol: string;
      action: string;
      account?: any; // Preserve account data from backend
      fetchBeforeUse?: boolean; // Preserve fetchBeforeUse flag from backend
      overrides?: Record<string, unknown>; // Preserve the values/overrides from backend
      modifiedFields?: string[]; // Track which fields were modified
      original?: Record<string, unknown>; // Untouched backend override, passed through on save
    }>;
  }>;
}

// Protocols to show in the scenario editor (filter the full list).
// Must match the `protocol` field of each template exactly, including case.
const ENABLED_PROTOCOLS = [
  'Pyth',
  'Raydium',
  'Drift',
  'Pump',
  'PumpSwap',
  // Kamino: one entry per program, since each has its own IDL and program id
  'kamino',
  'kamino-scope',
  'kamino-farms',
  'kamino-swap',
  'kamino-vault',
  'kamino-liquidity',
  // Whirlpool: the Kamino liquidation-arbitrage scenario overrides its pools
  'Whirlpool',
  'Phoenix Eternal',
];

// Kamino ships six programs. Collapse them behind one icon and let the panel
// ask which product first. Order is the order they appear in the picker.
const KAMINO_PRODUCTS: { protocol: string; title: string; description: string }[] = [
  { protocol: 'kamino', title: 'Lend & Borrow', description: 'Reserves, obligations and markets' },
  { protocol: 'kamino-vault', title: 'Earn', description: 'Yield vaults and their allocations' },
  { protocol: 'kamino-liquidity', title: 'Liquidity', description: 'Concentrated liquidity strategies' },
  { protocol: 'kamino-swap', title: 'Swap', description: 'Limit orders' },
  { protocol: 'kamino-scope', title: 'Scope Oracle', description: 'Prices every other product reads' },
  { protocol: 'kamino-farms', title: 'Farms & Rewards', description: 'Emissions and user stakes' },
];

export default function ScenarioEditor({
  scenarioId = 'default',
  scenarioName = 'Scenario',
  scenarioDescription = 'Scenario created from editor',
  scenarioTags,
  initialSteps,
}: ScenarioEditorProps) {
  const { rpcUrl, studioUrl } = useAppConfig();
  const [mode, setMode] = useState<'read' | 'edit' | 'play'>('read');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionSearchQuery, setActionSearchQuery] = useState('');
  const [selectedProtocol, setSelectedProtocol] = useState<Protocol | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [accountData, setAccountData] = useState<Record<string, any>>({});
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());
  // Which entry of an array field the user is editing, keyed by the array's path. Templates declare
  // one example index (Scope declares `prices.0.*`), but the entry you actually want differs per
  // asset - SOL is 3 on the Main Market, USDC 13 - so the index has to be selectable.
  const [arrayEntryIndex, setArrayEntryIndex] = useState<Record<string, string>>({});
  const [fetchBeforeUse, setFetchBeforeUse] = useState(false);
  const [loadingAccountData, setLoadingAccountData] = useState(false);
  const [showProtocolPanel, setShowProtocolPanel] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>('');
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [hasAnimated, setHasAnimated] = useState<Set<string>>(new Set());
  const initializedRef = useRef(false);
  const accountRequestRef = useRef(0);
  const [currentPlaybackSlot, setCurrentPlaybackSlot] = useState<number>(0);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [editingAction, setEditingAction] = useState<{ slotId: string; actionIndex: number } | null>(null);

  const [dynamicOptions, setDynamicOptions] = useState<Record<string, DynamicRefOption[]>>({});
  const isFirstSlotsChangeRef = useRef(true);

  useEffect(() => {
    const properties = (selectedAction?.template?.properties ?? []) as any[];
    const sources = Array.from(
      new Set(
        properties
          .filter((prop) => prop && typeof prop !== 'string' && prop.type === 'dynamic_ref' && prop.source)
          .map((prop) => prop.source as string)
      )
    );
    if (sources.length === 0) {
      return;
    }

    let cancelled = false;
    const handleOptionsLoaded = (optionLists: DynamicRefOption[][]) => {
      if (cancelled) return;
      setDynamicOptions(Object.fromEntries(sources.map((source, index) => [source, optionLists[index]])));
    };
    Promise.all(sources.map((source) => fetchDynamicRefOptions(studioUrl, source))).then(handleOptionsLoaded);

    return () => {
      cancelled = true;
    };
  }, [selectedAction, studioUrl]);

  // Reset first slots change flag when scenario changes
  React.useEffect(() => {
    isFirstSlotsChangeRef.current = true;
  }, [scenarioId]);

  // Load scenario from initialSteps (backend data) - always prioritize fresh data
  React.useEffect(() => {
    if (initializedRef.current || typeof window === 'undefined') return;

    logger.log('ScenarioEditor: Loading scenario', scenarioId, 'initialSteps:', initialSteps);

    // Always prefer initialSteps from backend over localStorage cache
    if (initialSteps && initialSteps.length > 0) {
      logger.log('Converting initialSteps to slots:', initialSteps);
      const convertedSlots: Slot[] = initialSteps.map((step, index) => ({
        id: step.id,
        height: index,
        actions: step.actions || [],
      }));

      logger.log(
        'Converted slots with actions:',
        convertedSlots.map((s) => ({
          id: s.id,
          actions: s.actions.map((a) => ({
            actionId: a.actionId,
            overrides: a.overrides,
            modifiedFields: a.modifiedFields,
          })),
        }))
      );

      setSlots(convertedSlots);
      setHasAnimated(new Set(convertedSlots.map((s) => s.id)));
      setSelectedSlotId(convertedSlots[0]?.id || '');

      // Update localStorage with fresh data
      const savedScenarios = localStorage.getItem('scenarios');
      const scenarios: Record<string, unknown> = savedScenarios
        ? (parseScenariosJson(savedScenarios) as Record<string, unknown>)
        : {};
      scenarios[scenarioId] = {
        slots: convertedSlots,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('scenarios', serializeScenarioJson(scenarios));
    } else {
      // No initialSteps - try localStorage as fallback
      const savedScenarios = localStorage.getItem('scenarios');
      if (savedScenarios) {
        try {
          const scenarios = parseScenariosJson(savedScenarios) as Record<string, any>;
          const scenario = scenarios[scenarioId];
          if (scenario?.slots && scenario.slots.length > 0) {
            logger.log('Loading from localStorage (no initialSteps):', scenario.slots);
            setSlots(scenario.slots);
            setHasAnimated(new Set(scenario.slots.map((s: Slot) => s.id)));
            setSelectedSlotId(scenario.slots[0]?.id || '');
            initializedRef.current = true;
            return;
          }
        } catch (error) {
          console.error('Error loading scenario from localStorage:', error);
        }
      }

      // No data at all, create empty slot
      logger.log('No data found, creating empty slot');
      const emptySlot = { id: '1', height: 0, actions: [] };
      setSlots([emptySlot]);
      setHasAnimated(new Set(['1']));
      setSelectedSlotId('1');
    }

    initializedRef.current = true;
  }, [scenarioId, initialSteps]);

  // Save slots to localStorage whenever they change (but not on initial load)
  React.useEffect(() => {
    if (!initializedRef.current || typeof window === 'undefined' || slots.length === 0) return;

    logger.log('Saving slots to localStorage:', slots);

    const savedScenarios = localStorage.getItem('scenarios');
    let scenarios: Record<string, unknown> = {};

    if (savedScenarios) {
      try {
        scenarios = parseScenariosJson(savedScenarios) as Record<string, unknown>;
      } catch (error) {
        console.error('Error parsing scenarios:', error);
      }
    }

    scenarios[scenarioId] = {
      slots,
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem('scenarios', serializeScenarioJson(scenarios));

    // Only dispatch event and sync with backend after the first change (skip on initial load into editor)
    if (!isFirstSlotsChangeRef.current) {
      // Sync with backend using PATCH endpoint
      const syncWithBackend = async () => {
        try {
          // Convert slots to overrides format for backend
          const overrides = slots.flatMap((slot) =>
            slot.actions.map((action) => {
              // The backend expects flat dot-notation values ("price_message.price": 123);
              // fields edited in the UI live nested and are reachable via modifiedFields
              const flatValues = flattenOverrideValues(action.overrides, action.modifiedFields);

              const original = (action.original ?? {}) as Partial<OverridePayload>;
              const override: OverridePayload = {
                // Fields the UI does not edit (enabled, future backend additions)
                // come from the loaded override and survive the full-replace PATCH
                ...original,
                // Use existing overrideId if available, otherwise generate one
                id: action.overrideId || `${action.actionId}_${slot.height}`,
                templateId: action.actionId, // actionId IS the templateId
                values: flatValues,
                scenarioRelativeSlot: slot.height, // 0-indexed to match backend
                label: action.action,
                enabled: original.enabled ?? true,
                fetchBeforeUse: action.fetchBeforeUse || false,
              };

              // Only include account if it exists, don't send default values
              if (action.account) {
                override.account = action.account;
              }

              return override;
            })
          );

          const patchData = {
            id: scenarioId,
            name: scenarioName,
            description: scenarioDescription,
            overrides: overrides,
            tags: scenarioTags ?? [],
          };

          logger.log('🔍 PATCH request data:', JSON.stringify(patchData, null, 2));

          const response = await fetch(`${studioUrl}/v1/scenarios/${scenarioId}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
            },
            body: serializeScenarioJson(patchData),
          });

          if (!response.ok) {
            const errorText = await response.text();
            console.error('Failed to sync scenario with backend:', response.status, errorText);
          } else {
            logger.log('Scenario synced with backend successfully');
          }
        } catch (error) {
          console.error('Error syncing scenario with backend:', error);
          if (error instanceof Error) {
            console.error('Error message:', error.message);
            console.error('Error stack:', error.stack);
          }
        }
      };

      syncWithBackend();
      window.dispatchEvent(new Event('scenarioUpdated'));
    } else {
      isFirstSlotsChangeRef.current = false;
    }
  }, [slots, scenarioId, scenarioName, scenarioDescription, scenarioTags, studioUrl]);

  // Handle ESC key to exit Edit mode
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode === 'edit') {
        if (showProtocolPanel) {
          // If protocol panel is open, just close it and stop propagation
          e.stopPropagation();
          setShowProtocolPanel(false);
          setSelectedProduct(null);
          setSelectedAction(null);
          setEditingAction(null);
          setModifiedFields(new Set());
          setArrayEntryIndex({});
          setFetchBeforeUse(false);
        } else {
          // Check if the selected slot has more than 1 override
          const selectedSlot = slots.find((s) => s.id === selectedSlotId);
          if (selectedSlot && selectedSlot.actions.length > 1) {
            // If slot has multiple overrides, just exit edit mode but keep slot expanded
            setMode('read');
          } else {
            // Otherwise, exit edit mode and collapse slot
            setMode('read');
            setSelectedSlotId('');
          }
        }
      }
    };

    // Use capture phase to handle before generic-bento's handler
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [mode, showProtocolPanel, slots, selectedSlotId]);

  // Fetch protocols dynamically from API
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [protocolsLoading, setProtocolsLoading] = useState(true);

  useEffect(() => {
    const fetchProtocols = async () => {
      try {
        const response = await fetch(`${studioUrl}/v1/scenarios/templates`);
        if (!response.ok) {
          throw new Error('Failed to fetch protocols');
        }
        const templates = await response.json();

        // Group templates by protocol
        const protocolGroups: Record<string, any[]> = {};
        templates.forEach((template: any) => {
          const protocolName = template.protocol || 'Unknown';
          // Only include enabled protocols
          if (!ENABLED_PROTOCOLS.includes(protocolName)) {
            return;
          }
          if (!protocolGroups[protocolName]) {
            protocolGroups[protocolName] = [];
          }
          protocolGroups[protocolName].push(template);
        });

        const toActions = (templates: any[]): Action[] =>
          templates.map((template: any) => ({
            id: template.id,
            title: template.name,
            description: template.description,
            template: template, // Store full template data including IDL
          }));

        // Transform into Protocol objects, skipping the Kamino programs so they
        // can be merged into a single entry below.
        const transformedProtocols: Protocol[] = Object.entries(protocolGroups)
          .filter(([protocolName]) => !KAMINO_PRODUCTS.some((p) => p.protocol === protocolName))
          .map(([protocolName, templates]) => {
            const protocolId = protocolName.toLowerCase().replace(/\s+/g, '-');

            return {
              id: protocolId,
              title: protocolName,
              description: `${protocolName} protocol actions`,
              icon_url: '', // No icon URL in API response
              actions: toActions(templates),
            };
          });

        const kaminoProducts: Product[] = KAMINO_PRODUCTS.filter(
          (p) => (protocolGroups[p.protocol]?.length ?? 0) > 0
        ).map((p) => ({
          id: p.protocol,
          title: p.title,
          description: p.description,
          actions: toActions(protocolGroups[p.protocol]),
        }));

        if (kaminoProducts.length > 0) {
          transformedProtocols.push({
            id: 'kamino',
            title: 'Kamino',
            description: 'Lending, yield, liquidity and prices',
            icon_url: '',
            // Flattened so lookups by actionId keep working regardless of product.
            actions: kaminoProducts.flatMap((p) => p.actions),
            products: kaminoProducts,
          });
        }

        setProtocols(transformedProtocols);
        setProtocolsLoading(false);
      } catch (error) {
        console.error('Error fetching protocols:', error);
        setProtocols([]);
        setProtocolsLoading(false);
      }
    };

    fetchProtocols();
  }, [studioUrl]);

  const filteredProtocols = protocols.filter((protocol) => {
    const query = searchQuery.toLowerCase();
    return (
      protocol.title.toLowerCase().includes(query) ||
      protocol.description.toLowerCase().includes(query) ||
      protocol.products?.some((product) => product.title.toLowerCase().includes(query)) ||
      protocol.actions.some(
        (action) => action.title.toLowerCase().includes(query) || action.description.toLowerCase().includes(query)
      )
    );
  });

  // Helper function to extract fields from IDL using accountType
  const getFieldsFromIDL = (template: any) => {
    if (!template?.idl || !template?.accountType) return getFieldsFromRawLayout(template);

    // First, try to find the account in the accounts array
    if (template.idl.accounts && Array.isArray(template.idl.accounts)) {
      const account = template.idl.accounts.find((acc: any) => acc.name === template.accountType);

      if (account?.type?.fields) {
        return account.type.fields;
      }
    }

    // Second, try to find in the types array using accountType
    if (template.idl.types && Array.isArray(template.idl.types)) {
      const typeDefinition = template.idl.types.find(
        (type: any) => type.name === template.accountType && type.type?.kind === 'struct'
      );

      if (typeDefinition?.type?.fields) {
        return typeDefinition.type.fields;
      }
    }

    // Fallback: find any struct type (old behavior)
    if (template.idl.types) {
      const structType = template.idl.types.find((type: any) => type.type?.kind === 'struct');

      if (structType?.type?.fields) {
        return structType.type.fields;
      }
    }

    return getFieldsFromRawLayout(template);
  };

  // Helper function to look up a type definition in the IDL
  const lookupTypeDefinition = (typeName: string, idl: any): any => {
    if (!idl?.types) return null;

    const typeDefinition = idl.types.find((type: any) => type.name === typeName);

    return typeDefinition;
  };

  // Helper function to get field type information
  const getFieldTypeInfo = (
    field: any,
    idl: any
  ): { type: string; isNested: boolean; nestedFields?: any[]; elementType?: any } => {
    const fieldType = field.type;

    logger.log('🔍 getFieldTypeInfo for field:', field.name, 'fieldType:', fieldType);

    // Simple types (string primitives like "u64", "i64", "bool", etc.)
    if (typeof fieldType === 'string') {
      return { type: fieldType, isNested: false };
    }

    if (fieldType?.array || fieldType?.vec) {
      const isArrayType = Boolean(fieldType.array);
      const raw = isArrayType ? fieldType.array : fieldType.vec;

      const element = Array.isArray(raw) ? raw[0] : raw;
      const elementName =
        typeof element === 'string'
          ? element
          : typeof element?.defined === 'string'
            ? element.defined
            : (element?.defined?.name ?? 'unknown');
      return {
        type: `${isArrayType ? 'array' : 'vec'}<${elementName}>`,
        isNested: false,
        elementType: element,
      };
    }

    // Option type
    if (fieldType?.option) {
      const innerType = typeof fieldType.option === 'string' ? fieldType.option : 'unknown';
      return { type: `option<${innerType}>`, isNested: false };
    }

    // Defined type (reference to another struct)
    // Handle both {defined: "TypeName"} and {defined: {name: "TypeName"}}
    if (fieldType?.defined) {
      let typeName;
      if (typeof fieldType.defined === 'string') {
        typeName = fieldType.defined;
      } else if (fieldType.defined?.name) {
        typeName = fieldType.defined.name;
      }

      logger.log('🔍 Defined type found:', typeName);

      if (typeName) {
        const typeDefinition = lookupTypeDefinition(typeName, idl);
        logger.log('🔍 Type definition lookup result:', typeDefinition);

        if (typeDefinition?.type?.kind === 'struct' && typeDefinition.type.fields) {
          logger.log('✅ Found nested struct with', typeDefinition.type.fields.length, 'fields');
          return {
            type: typeName,
            isNested: true,
            nestedFields: typeDefinition.type.fields,
          };
        }

        return { type: typeName, isNested: false };
      }
    }

    // Unknown/complex type
    return { type: 'object', isNested: false };
  };

  // Helper to convert flat dot-notation object to nested object
  // e.g., {"price_message.price": 123} -> {price_message: {price: 123}}
  const flatToNested = (flat: Record<string, unknown>): Record<string, any> => {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(flat)) {
      const keys = key.split('.');
      let current = result;
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      current[keys[keys.length - 1]] = value;
    }
    return result;
  };

  // Register IDL and fetch account data when an action is selected
  const handleActionSelect = async (action: Action, accountPubkey?: string) => {
    const requestId = ++accountRequestRef.current;
    setSelectedAction(action);
    setAccountData({});
    setModifiedFields(new Set()); // Clear modified fields when loading new action
    setArrayEntryIndex({});
    setFetchBeforeUse(false); // Reset fetch before use toggle

    if (!action.template?.idl || !action.template?.address) {
      console.warn('Action template missing IDL or address');
      setLoadingAccountData(false);
      return;
    }

    setLoadingAccountData(true);

    try {
      // Step 1: Register the IDL using slot 1
      logger.log('📝 Registering IDL for', action.template.address);

      // Extract address string
      let addressString;
      if (typeof action.template.address === 'string') {
        addressString = action.template.address;
      } else if (action.template.address && typeof action.template.address === 'object') {
        addressString =
          action.template.address.pubkey || action.template.address.address || action.template.address.value;
      }
      if (accountPubkey) addressString = accountPubkey;

      // Step 1: Fetch account info, parsed as JSON when the template edits account fields
      logger.log('🔍 Fetching account info for address:', addressString);

      // A template whose properties all carry value_type (the Phoenix market templates) edits no
      // field of the account, so its decoded data would only be sent back as override values.
      // An empty slice still forks the account in for Play, without decoding it.
      const properties = action.template.properties ?? [];
      const inputsOnly =
        properties.length > 0 && properties.every((prop: any) => typeof prop !== 'string' && prop.value_type != null);

      const getAccountInfoRequest = {
        jsonrpc: '2.0',
        id: 2,
        method: 'getAccountInfo',
        params: [
          addressString,
          inputsOnly
            ? { commitment: 'confirmed', encoding: 'base64', dataSlice: { offset: 0, length: 0 } }
            : { commitment: 'confirmed', encoding: 'jsonParsed' },
        ],
      };

      logger.log('📤 getAccountInfo request:', JSON.stringify(getAccountInfoRequest, null, 2));

      const accountInfoResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getAccountInfoRequest),
      });

      const accountInfoData = await accountInfoResponse.json();
      logger.log('✅ Account info received:', accountInfoData);
      if (requestId !== accountRequestRef.current) return;

      if (accountInfoData.result?.value?.data?.parsed) {
        // Populate accountData with the parsed data
        const parsed = accountInfoData.result.value.data.parsed;
        logger.log('📊 Parsed account data:', parsed);
        setAccountData(parsed);
      }

      setLoadingAccountData(false);
    } catch (error) {
      console.error('Error loading account data:', error);
      if (requestId === accountRequestRef.current) setLoadingAccountData(false);
    }
  };

  // Filter actions in protocol panel, narrowed to the chosen product when there is one
  const filteredActions =
    (selectedProduct ?? selectedProtocol)?.actions.filter((action) => {
      const query = actionSearchQuery.toLowerCase();
      return action.title.toLowerCase().includes(query) || action.description.toLowerCase().includes(query);
    }) || [];

  const addSlot = () => {
    const newSlot: Slot = {
      id: String(Date.now()),
      height: slots.length,
      actions: [],
    };
    setSlots((prevSlots) => [...prevSlots, newSlot]);
    setTimeout(() => {
      setSelectedSlotId(newSlot.id);
      setHasAnimated((prev) => new Set([...prev, newSlot.id]));
    }, 0);
  };

  const deleteSlot = (slotId: string) => {
    if (slots.length === 1) return;

    // Find the index of the slot being deleted
    const deletedIndex = slots.findIndex((slot) => slot.id === slotId);

    const updatedSlots = slots.filter((slot) => slot.id !== slotId);
    const reindexedSlots = updatedSlots.map((slot, idx) => ({
      ...slot,
      height: idx,
    }));
    setSlots(reindexedSlots);

    if (selectedSlotId === slotId && reindexedSlots.length > 0) {
      // Select the previous slot, or the first slot if deleting the first slot
      const newSelectedIndex = Math.max(0, deletedIndex - 1);
      setSelectedSlotId(reindexedSlots[newSelectedIndex].id);
    }
  };

  const insertSlotAt = (index: number) => {
    const newSlot: Slot = {
      id: String(Date.now()),
      height: index,
      actions: [],
    };

    setSlots((prevSlots) => {
      const updatedSlots = [...prevSlots.slice(0, index), newSlot, ...prevSlots.slice(index)];
      return updatedSlots.map((slot, idx) => ({
        ...slot,
        height: idx,
      }));
    });

    setTimeout(() => {
      setMode('edit');
      setSelectedSlotId(newSlot.id);
      setHasAnimated((prev) => new Set([...prev, newSlot.id]));
      logger.log('New slot created and selected:', newSlot.id);
    }, 0);
  };

  const addActionToSlot = (slotId: string, protocol: Protocol, action: Action) => {
    setSlots(
      slots.map((slot) => {
        if (slot.id === slotId) {
          return {
            ...slot,
            actions: [
              ...slot.actions,
              {
                protocolId: protocol.id,
                actionId: action.id,
                protocol: protocol.title,
                action: action.title,
                overrides: accountData,
                modifiedFields: Array.from(modifiedFields),
                fetchBeforeUse: fetchBeforeUse,
                account: action.template?.address,
              },
            ],
          };
        }
        return slot;
      })
    );
  };

  const deleteActionFromSlot = (slotId: string, actionIndex: number) => {
    setSlots(
      slots.map((slot) => {
        if (slot.id === slotId) {
          return {
            ...slot,
            actions: slot.actions.filter((_, index) => index !== actionIndex),
          };
        }
        return slot;
      })
    );
  };

  const updateActionInSlot = (slotId: string, actionIndex: number, protocol: Protocol, action: Action) => {
    setSlots(
      slots.map((slot) => {
        if (slot.id === slotId) {
          return {
            ...slot,
            actions: slot.actions.map((existingAction, index) =>
              index === actionIndex
                ? {
                    protocolId: protocol.id,
                    actionId: action.id,
                    protocol: protocol.title,
                    action: action.title,
                    overrides: accountData,
                    modifiedFields: Array.from(modifiedFields),
                    fetchBeforeUse: fetchBeforeUse,
                    // A saved override keeps the plain address it was created for (such as a Phoenix
                    // Trader). A derived (PDA) address is rebuilt from the template, so edited seed
                    // fields such as a token or fee tier pick the new account.
                    account:
                      existingAction.actionId === action.id && existingAction.account?.pubkey
                        ? existingAction.account
                        : action.template?.address,
                  }
                : existingAction
            ),
          };
        }
        return slot;
      })
    );
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMouseX(e.clientX - rect.left);
  };

  const handleMouseLeave = () => {
    setMouseX(null);
  };

  const handleStepForward = async () => {
    if (currentPlaybackSlot < slots.length - 1) {
      setIsExecuting(false);

      try {
        // Get current absolute slot from getEpochInfo
        const epochResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getEpochInfo',
          }),
        });

        if (epochResponse.ok) {
          const epochData = await epochResponse.json();
          if (epochData.result) {
            const currentAbsoluteSlot = epochData.result.absoluteSlot;
            const nextSlot = currentAbsoluteSlot + 1;

            logger.log('⏭️ Stepping forward from slot', currentAbsoluteSlot, 'to', nextSlot);

            // Call surfnet_timeTravel with next absolute slot
            const timeTravelResponse = await fetch(rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'surfnet_timeTravel',
                params: [{ absoluteSlot: nextSlot }],
              }),
            });

            if (timeTravelResponse.ok) {
              const timeTravelData = await timeTravelResponse.json();
              logger.log('✅ Time travel successful:', timeTravelData.result);
            } else {
              console.error('❌ Time travel failed:', timeTravelResponse.status);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error stepping forward:', error);
      }

      setCurrentPlaybackSlot((prev) => prev + 1);
      // Start executing next slot after a brief delay
      setTimeout(() => setIsExecuting(true), 100);
    }
  };

  const handlePlay = async () => {
    // Build scenario structure for RPC
    const overrides = slots.flatMap((slot) =>
      slot.actions.map((action) => {
        // The backend expects flat dot-notation values ("price_message.price": 123);
        // fields edited in the UI live nested and are reachable via modifiedFields
        const flatValues = flattenOverrideValues(action.overrides, action.modifiedFields);

        const original = (action.original ?? {}) as Partial<OverridePayload>;
        const override: OverridePayload = {
          // Fields the UI does not edit (enabled, future backend additions)
          // come from the loaded override and pass through unchanged
          ...original,
          // Use existing overrideId if available, otherwise generate one
          id: action.overrideId || `${action.actionId}_${slot.height}`,
          templateId: action.actionId, // actionId IS the templateId
          values: flatValues,
          scenarioRelativeSlot: slot.height, // 0-indexed to match backend
          label: action.action,
          enabled: original.enabled ?? true,
          fetchBeforeUse: action.fetchBeforeUse || false,
        };

        // Only include account if it exists, don't send default values
        if (action.account) {
          override.account = action.account;
        }

        return override;
      })
    );

    const scenario = {
      id: scenarioId,
      name: scenarioName,
      description: scenarioDescription,
      overrides,
      tags: [],
    };

    // IMPORTANT: Pause the clock BEFORE registering the scenario to prevent race conditions
    // Otherwise, clock ticks between registration and pause can apply overrides prematurely
    try {
      const pauseResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'surfnet_pauseClock',
        }),
      });

      if (pauseResponse.ok) {
        window.dispatchEvent(
          new CustomEvent('clockPauseStateChanged', {
            detail: { isPaused: true },
          })
        );
        logger.log('🎬 Clock paused before scenario registration');
      }
    } catch (error) {
      console.error('Error pausing clock:', error);
    }

    // Register scenario with surfnet (clock is now paused, no race condition)
    try {
      logger.log('📤 Registering scenario:', scenario);
      const registerResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeScenarioJson({
          jsonrpc: '2.0',
          id: 1,
          method: 'surfnet_registerScenario',
          params: [scenario],
        }),
      });

      if (registerResponse.ok) {
        const registerData = await registerResponse.json();
        logger.log('✅ Scenario registered:', registerData);
      } else {
        console.error('❌ Failed to register scenario:', await registerResponse.text());
      }
    } catch (error) {
      console.error('❌ Error registering scenario:', error);
    }

    setCurrentPlaybackSlot(0);
    setIsExecuting(true);
    setMode('play');
  };

  const handleStop = () => {
    setMode('read');
    setIsExecuting(false);
    setCurrentPlaybackSlot(0);
  };

  const handleComplete = async () => {
    // Resume the clock when completing scenario playback
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'surfnet_resumeClock',
        }),
      });

      if (response.ok) {
        // Dispatch event so header widget and other components sync
        window.dispatchEvent(
          new CustomEvent('clockPauseStateChanged', {
            detail: { isPaused: false },
          })
        );
        logger.log('▶️ Clock resumed after scenario completion');
      }
    } catch (error) {
      console.error('Error resuming clock:', error);
    }

    setMode('read');
    setIsExecuting(false);
    setCurrentPlaybackSlot(0);
  };

  const exportSnapshot = async () => {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'surfnet_exportSnapshot',
        }),
      });

      if (response.ok) {
        const jsonString = snapshotDownloadContents(await response.text());

        if (jsonString) {
          const blob = new Blob([jsonString], { type: 'application/json' });

          // Create download link
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;

          // Generate filename with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          link.download = `surfnet-snapshot-${timestamp}.json`;

          // Trigger download
          document.body.appendChild(link);
          link.click();

          // Cleanup
          document.body.removeChild(link);
          URL.revokeObjectURL(url);

          logger.log('✅ Snapshot exported successfully');
        } else {
          console.error('❌ Export snapshot failed: empty or invalid snapshot');
        }
      } else {
        console.error('❌ HTTP error during export:', response.status);
      }
    } catch (error) {
      console.error('❌ Error exporting snapshot:', error);
    }
  };

  const downloadScenario = async () => {
    setDownloadError(null);
    try {
      const response = await fetch(`${studioUrl}/v1/scenarios`);
      if (!response.ok) {
        logger.log('Scenario download failed with HTTP', response.status);
        setDownloadError('Download failed');
        return;
      }

      const file = scenarioDownloadFile(await response.text(), scenarioId);
      if (!file) {
        setDownloadError('Download failed — scenario not found on the surfnet');
        return;
      }

      const url = URL.createObjectURL(new Blob([file.contents], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      logger.log('✅ Scenario downloaded:', file.filename);
    } catch (error) {
      logger.log('Scenario download failed:', error);
      setDownloadError('Download failed');
    }
  };

  return (
    <div className="relative flex h-full">
      {/* Main Stage - Scrollable */}
      <div
        className={`${mode === 'play' ? 'flex-1' : 'w-full'} overflow-auto bg-zinc-950`}
        style={{
          backgroundImage: `radial-gradient(circle, rgba(255, 255, 255, 0.12) 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => {
          if (mode === 'edit') {
            setMode('read');
            setSelectedSlotId('');
            setShowProtocolPanel(false);
            setSelectedProduct(null);
            setEditingAction(null);
            setFetchBeforeUse(false);
          }
        }}
      >
        {/* Vertical cursor line - Edit mode only */}
        {mode === 'edit' && mouseX !== null && (
          <div
            className="pointer-events-none absolute bottom-0 top-0 z-10 w-px bg-yellow-500/30"
            style={{ left: `${mouseX}px` }}
          />
        )}

        {/* Timeline */}
        <div
          className={`relative flex min-h-full items-start pb-64 pt-12 ${mode === 'play' ? 'justify-center' : 'justify-start pl-12'}`}
        >
          <div className={mode === 'play' ? 'relative min-h-[600px]' : 'flex items-start gap-12'}>
            <AnimatePresence mode="popLayout">
              {slots.map((slot, index) => {
                // In play mode, determine slot visibility and state
                const isCurrentSlot = mode === 'play' && index === currentPlaybackSlot;
                const isPreviousSlot = mode === 'play' && index === currentPlaybackSlot - 1;
                const isNextSlot = mode === 'play' && index === currentPlaybackSlot + 1;
                const shouldExpand =
                  (selectedSlotId === slot.id && mode === 'edit') ||
                  isCurrentSlot ||
                  (selectedSlotId === slot.id && slot.actions.length > 1);

                // In play mode, only show previous, current, and next slots
                if (mode === 'play' && !isPreviousSlot && !isCurrentSlot && !isNextSlot) {
                  return null;
                }

                // Calculate position for play mode carousel
                let playModePosition = 0;
                if (mode === 'play') {
                  if (isPreviousSlot) playModePosition = -400; // Previous slot offset to the left
                  if (isCurrentSlot) playModePosition = 0; // Current slot centered
                  if (isNextSlot) playModePosition = 400; // Next slot offset to the right
                }

                return (
                  <motion.div
                    key={slot.id}
                    className="group/slot-wrapper flex"
                    style={mode === 'play' ? { position: 'absolute', left: '50%' } : {}}
                    initial={
                      mode === 'play' && !hasAnimated.has(slot.id) ? { x: 400 - (shouldExpand ? 150 : 40) } : false
                    }
                    animate={mode === 'play' ? { x: playModePosition - (shouldExpand ? 150 : 40) } : { x: 0 }}
                    transition={{
                      x: { duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
                    }}
                  >
                    <motion.div
                      layout={mode !== 'play'}
                      initial={
                        hasAnimated.has(slot.id)
                          ? false
                          : mode === 'play' && (isCurrentSlot || isNextSlot)
                            ? { opacity: 0, scale: 0.85 }
                            : { opacity: 0, scale: 0.9 }
                      }
                      animate={{
                        opacity: isPreviousSlot || isNextSlot ? 0.3 : 1,
                        scale: isPreviousSlot || isNextSlot ? 0.85 : 1,
                        filter: isPreviousSlot || isNextSlot ? 'blur(2px)' : 'blur(0px)',
                      }}
                      exit={{ opacity: 0, scale: 0.85 }}
                      transition={{
                        layout: { type: 'spring', stiffness: 350, damping: 30 },
                        opacity: { duration: 0.5, ease: 'easeInOut' },
                        scale: { duration: 0.5, ease: 'easeInOut' },
                        filter: { duration: 0.5 },
                      }}
                      className="flex flex-col gap-3"
                    >
                      {/* Slot Height Label */}
                      <div className="flex items-center justify-center">
                        <span className="font-mono text-sm text-zinc-400">
                          {slots.length < 5 ? `Slot ${slot.height + 1}` : `${slot.height + 1}`}
                        </span>
                      </div>

                      {/* Slot Card */}
                      <motion.div
                        className="group relative flex-shrink-0"
                        animate={{
                          width: shouldExpand ? 300 : 80,
                        }}
                        transition={{
                          width: { duration: 0.35, ease: 'easeInOut' },
                        }}
                      >
                        <div
                          className={`cursor-pointer overflow-hidden rounded-lg border-2 p-6 transition-all ${
                            // Play mode styling - current slot
                            mode === 'play' && isCurrentSlot
                              ? 'min-h-[450px] border-green-500 bg-green-500/10 shadow-lg shadow-green-500/20'
                              : // Play mode styling - previous/next slots (dimmed)
                                mode === 'play' && (isPreviousSlot || isNextSlot)
                                ? 'min-h-[280px] border-zinc-700 bg-zinc-900'
                                : // Edit mode styling
                                  selectedSlotId === slot.id && mode === 'edit'
                                  ? 'min-h-[450px] border-yellow-500 bg-zinc-900 shadow-lg shadow-yellow-500/20'
                                  : // Default styling
                                    'min-h-[280px] border-zinc-700 bg-zinc-900 hover:border-zinc-600'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (mode === 'read') {
                              setMode('edit');
                            }
                            if (mode !== 'play') {
                              setSelectedSlotId(slot.id);
                            }
                          }}
                        >
                          <AnimatePresence mode="wait">
                            <motion.div
                              key={shouldExpand ? 'expanded' : 'collapsed'}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.2, delay: shouldExpand ? 0.2 : 0 }}
                            >
                              {shouldExpand ? (
                                <>
                                  {/* Actions in this slot - Expanded View */}
                                  {slot.actions.length === 0 ? (
                                    <div className="flex items-center gap-3 rounded-md border border-dashed border-zinc-700 bg-zinc-800/30 p-3">
                                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-dashed border-zinc-700"></div>
                                      <div className="flex-1">
                                        <div className="text-sm text-zinc-500">No overrides yet</div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="space-y-2">
                                      {slot.actions.map((action, actionIndex) => {
                                        const iconSrc = getProtocolIcon(action.protocolId);

                                        return (
                                          <div
                                            key={`${action.protocolId}-${action.actionId}-${actionIndex}`}
                                            className="relative flex cursor-pointer items-center gap-3 rounded-md border border-zinc-700 bg-zinc-800 p-3 transition-colors hover:border-yellow-500 hover:bg-zinc-700"
                                            onClick={async () => {
                                              if (mode === 'edit' && selectedSlotId === slot.id) {
                                                setEditingAction({ slotId: slot.id, actionIndex });

                                                // Load the action's protocol and set it as selected
                                                const protocol = protocols.find((p) => p.id === action.protocolId);
                                                if (protocol) {
                                                  setSelectedProtocol(protocol);
                                                  // Reopen straight into the product owning this override
                                                  setSelectedProduct(
                                                    protocol.products?.find((prod) =>
                                                      prod.actions.some((a) => a.id === action.actionId)
                                                    ) ?? null
                                                  );

                                                  // Find the specific action within the protocol
                                                  const foundAction = protocol.actions.find(
                                                    (a) => a.id === action.actionId
                                                  );
                                                  if (foundAction) {
                                                    setSelectedAction(foundAction);
                                                    // Fetch account data for this action
                                                    const loading = handleActionSelect(
                                                      foundAction,
                                                      action.account?.pubkey
                                                    );
                                                    const requestId = accountRequestRef.current;
                                                    await loading;
                                                    if (requestId !== accountRequestRef.current) return;

                                                    // Restore the overrides and modified fields after loading default data
                                                    // Start with overrides data
                                                    let restoredData: Record<string, unknown> = {};

                                                    if (action.overrides && Object.keys(action.overrides).length > 0) {
                                                      // Check if overrides are in flat dot-notation format
                                                      const keys = Object.keys(action.overrides);
                                                      const isFlat = keys.some((k) => k.includes('.'));

                                                      if (isFlat) {
                                                        // Convert flat to nested for the form
                                                        restoredData = flatToNested(action.overrides);
                                                        logger.log(
                                                          'Converting flat overrides to nested:',
                                                          action.overrides,
                                                          '->',
                                                          restoredData
                                                        );
                                                      } else {
                                                        restoredData = { ...action.overrides };
                                                      }
                                                    }

                                                    // Extract constant_ref values from saved PDA seeds
                                                    // This restores "PDA Configuration" values when editing an existing override
                                                    if (
                                                      action.account?.pda?.seeds &&
                                                      foundAction.template?.address?.pda?.seeds
                                                    ) {
                                                      const savedSeeds = action.account.pda.seeds;
                                                      const templateSeeds = foundAction.template.address.pda.seeds;
                                                      // Get properties in new unified format
                                                      const templateProperties = foundAction.template?.properties || [];
                                                      const constants = foundAction.template?.constants || {};

                                                      // Helper to find constant_ref property by path
                                                      // Note: Backend serializes PropertyKind as "type" field
                                                      const findConstantRefProp = (path: string) => {
                                                        return templateProperties.find(
                                                          (prop: any) =>
                                                            typeof prop !== 'string' &&
                                                            prop.path === path &&
                                                            prop.type === 'constant_ref'
                                                        );
                                                      };

                                                      logger.log('🔍 Restoring constant_ref values from PDA seeds');
                                                      logger.log('  savedSeeds:', JSON.stringify(savedSeeds));
                                                      logger.log('  templateSeeds:', JSON.stringify(templateSeeds));

                                                      // Match template seeds to saved seeds by index position
                                                      // This preserves the exact positional relationship
                                                      logger.log('  Matching seeds by position:');

                                                      const matchSeedsByPosition = (
                                                        tSeeds: any[],
                                                        sSeeds: any[],
                                                        prefix: string = ''
                                                      ) => {
                                                        tSeeds.forEach((templateSeed: any, index: number) => {
                                                          const savedSeed = sSeeds[index];
                                                          if (!savedSeed) return;

                                                          // If template has propertyRef at this position, get the pubkey from saved
                                                          if (templateSeed.propertyRef) {
                                                            const propName = templateSeed.propertyRef;
                                                            let savedPubkey: string | null = null;

                                                            if (savedSeed.pubkey) {
                                                              savedPubkey = savedSeed.pubkey;
                                                            }

                                                            if (savedPubkey) {
                                                              const constantRefProp = findConstantRefProp(propName);

                                                              if (
                                                                constantRefProp &&
                                                                constantRefProp.constant &&
                                                                constants[constantRefProp.constant]
                                                              ) {
                                                                const constantDef = constants[constantRefProp.constant];
                                                                const matchingOption = constantDef.options?.find(
                                                                  (opt: any) => opt.value === savedPubkey
                                                                );

                                                                if (matchingOption) {
                                                                  logger.log(
                                                                    `    ${prefix}[${index}] ${propName} = ${savedPubkey} (${matchingOption.label || matchingOption.id})`
                                                                  );
                                                                } else {
                                                                  logger.log(
                                                                    `    ${prefix}[${index}] ${propName} = ${savedPubkey} (not in constants)`
                                                                  );
                                                                }
                                                              } else {
                                                                logger.log(
                                                                  `    ${prefix}[${index}] ${propName} = ${savedPubkey} (no constant_ref)`
                                                                );
                                                              }

                                                              restoredData[propName] = savedPubkey;
                                                            }
                                                          }

                                                          // Handle u16BeRef template seeds - match to u16Be saved seeds
                                                          if (templateSeed.u16BeRef) {
                                                            const propName = templateSeed.u16BeRef;
                                                            // u16Be is the saved value (number)
                                                            if (savedSeed.u16Be !== undefined) {
                                                              const savedValue = String(savedSeed.u16Be);
                                                              const constantRefProp = findConstantRefProp(propName);

                                                              if (
                                                                constantRefProp &&
                                                                constantRefProp.constant &&
                                                                constants[constantRefProp.constant]
                                                              ) {
                                                                const constantDef = constants[constantRefProp.constant];
                                                                const matchingOption = constantDef.options?.find(
                                                                  (opt: any) => opt.value === savedValue
                                                                );

                                                                if (matchingOption) {
                                                                  logger.log(
                                                                    `    ${prefix}[${index}] ${propName} = ${savedValue} (${matchingOption.label || matchingOption.id})`
                                                                  );
                                                                } else {
                                                                  logger.log(
                                                                    `    ${prefix}[${index}] ${propName} = ${savedValue} (not in constants)`
                                                                  );
                                                                }
                                                              } else {
                                                                logger.log(
                                                                  `    ${prefix}[${index}] ${propName} = ${savedValue} (no constant_ref)`
                                                                );
                                                              }

                                                              restoredData[propName] = savedValue;
                                                            }
                                                          }

                                                          // Handle bytes32Ref template seeds - match to bytes saved seeds (Pyth feed IDs)
                                                          if (templateSeed.bytes32Ref) {
                                                            const propName = templateSeed.bytes32Ref;
                                                            let hexValue: string | null = null;

                                                            // Case 1: savedSeed.bytes is an array of numbers (original format)
                                                            if (savedSeed.bytes && Array.isArray(savedSeed.bytes)) {
                                                              hexValue =
                                                                '0x' +
                                                                savedSeed.bytes
                                                                  .map((b: number) => b.toString(16).padStart(2, '0'))
                                                                  .join('');
                                                            }
                                                            // Case 2: savedSeed.bytes32Ref contains the hex value directly (LLM format)
                                                            else if (
                                                              savedSeed.bytes32Ref &&
                                                              typeof savedSeed.bytes32Ref === 'string' &&
                                                              savedSeed.bytes32Ref.startsWith('0x')
                                                            ) {
                                                              hexValue = savedSeed.bytes32Ref;
                                                            }

                                                            if (hexValue) {
                                                              const constantRefProp = findConstantRefProp(propName);

                                                              if (
                                                                constantRefProp &&
                                                                constantRefProp.constant &&
                                                                constants[constantRefProp.constant]
                                                              ) {
                                                                const constantDef = constants[constantRefProp.constant];
                                                                const matchingOption = constantDef.options?.find(
                                                                  (opt: any) =>
                                                                    opt.value.toLowerCase() === hexValue!.toLowerCase()
                                                                );

                                                                if (matchingOption) {
                                                                  logger.log(
                                                                    `    ${prefix}[${index}] ${propName} = ${hexValue} (${matchingOption.label || matchingOption.id})`
                                                                  );
                                                                } else {
                                                                  logger.log(
                                                                    `    ${prefix}[${index}] ${propName} = ${hexValue} (not in constants)`
                                                                  );
                                                                }
                                                              } else {
                                                                logger.log(
                                                                  `    ${prefix}[${index}] ${propName} = ${hexValue} (no constant_ref)`
                                                                );
                                                              }

                                                              restoredData[propName] = hexValue;
                                                            }
                                                          }

                                                          // Recursively handle nested derivedPda
                                                          if (
                                                            templateSeed.derivedPda?.seeds &&
                                                            savedSeed.derivedPda?.seeds
                                                          ) {
                                                            matchSeedsByPosition(
                                                              templateSeed.derivedPda.seeds,
                                                              savedSeed.derivedPda.seeds,
                                                              `${prefix}[${index}].derivedPda`
                                                            );
                                                          }
                                                        });
                                                      };

                                                      matchSeedsByPosition(templateSeeds, savedSeeds);
                                                    }

                                                    setAccountData(restoredData);

                                                    // Combine action.modifiedFields with any restored constant_ref fields
                                                    const allModifiedFields = new Set(action.modifiedFields || []);
                                                    // Add all keys from restoredData that came from PDA seeds
                                                    Object.keys(restoredData).forEach((key) => {
                                                      if (restoredData[key] !== undefined && restoredData[key] !== '') {
                                                        allModifiedFields.add(key);
                                                      }
                                                    });
                                                    setModifiedFields(allModifiedFields);
                                                    if (action.fetchBeforeUse !== undefined) {
                                                      setFetchBeforeUse(action.fetchBeforeUse);
                                                    }
                                                  }
                                                }

                                                setShowProtocolPanel(true);
                                              }
                                            }}
                                          >
                                            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-zinc-900 p-1">
                                              <img src={iconSrc} alt={action.protocol} className="h-8 w-8" />
                                            </div>
                                            <div className="flex-1">
                                              <div className="text-sm font-medium text-zinc-100">{action.action}</div>
                                              <div className="text-xs text-zinc-400">{action.protocol}</div>
                                            </div>
                                            {/* Delete button - only in edit mode when slot is selected */}
                                            {mode === 'edit' && selectedSlotId === slot.id && (
                                              <button
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  deleteActionFromSlot(slot.id, actionIndex);
                                                }}
                                                className="absolute bottom-2 right-2 text-zinc-500 transition-colors hover:text-zinc-300"
                                                title="Delete action"
                                              >
                                                <TrashIcon className="h-4 w-4" />
                                              </button>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <>
                                  {/* Actions in this slot - Collapsed Icon View */}
                                  {slot.actions.length === 0 ? (
                                    <div className="flex flex-col items-center gap-2 pt-2">
                                      <div className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-zinc-700 bg-zinc-800/30"></div>
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-2 pt-2">
                                      {slot.actions.map((action, actionIndex) => {
                                        const iconSrc = getProtocolIcon(action.protocolId);

                                        return (
                                          <div
                                            key={`${action.protocolId}-${action.actionId}-${actionIndex}`}
                                            className="flex h-12 w-12 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 p-1"
                                            title={`${action.protocol}: ${action.action}`}
                                          >
                                            <img src={iconSrc} alt={action.protocol} className="h-8 w-8" />
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </>
                              )}
                            </motion.div>
                          </AnimatePresence>
                        </div>

                        {/* Delete Button - only shown when slot is selected and in Edit mode */}
                        {mode === 'edit' && slots.length > 1 && selectedSlotId === slot.id && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSlot(slot.id);
                            }}
                            className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-all hover:scale-110 hover:bg-red-600"
                            title="Delete slot"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </motion.div>
                    </motion.div>

                    {/* Gap with insert button - shown when hovering the slot before OR the gap itself, only in Edit mode */}
                    {mode === 'edit' && (
                      <div className="group/insert relative" style={{ width: '48px' }}>
                        {/* Vertical line - shorter and positioned lower */}
                        <div
                          className="absolute left-1/2 w-0.5 -translate-x-1/2 bg-pink-500 opacity-0 transition-opacity group-hover/insert:opacity-100 group-hover/slot-wrapper:opacity-100"
                          style={{ top: '120px', height: '140px' }}
                        />

                        {/* Plus button - centered on the line */}
                        <button
                          onClick={() => insertSlotAt(index + 1)}
                          className="absolute z-10 flex h-8 w-8 items-center justify-center rounded-full bg-pink-500 text-white opacity-0 shadow-lg transition-all hover:scale-110 hover:bg-pink-600 group-hover/insert:opacity-100 group-hover/slot-wrapper:opacity-100"
                          style={{ top: '170px', left: '50%', transform: 'translateX(-50%)' }}
                          title="Insert slot here"
                        >
                          <PlusIcon className="h-5 w-5" />
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Centered Toolbox - Fixed Position */}
      <AnimatePresence mode="wait">
        {mode === 'edit' && (
          <motion.div
            key="edit-toolbox"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-none fixed left-1/2 z-50 w-[1120px] -translate-x-1/2"
            style={{ bottom: '16px' }}
          >
            <div className="pointer-events-auto flex flex-col gap-4">
              {/* Search Field and Protocol Icons - Animated */}
              <motion.div
                initial={false}
                animate={{
                  opacity: showProtocolPanel ? 0 : 1,
                  y: showProtocolPanel ? 20 : 0,
                }}
                transition={{ duration: 0.15, ease: 'easeInOut' }}
                className={showProtocolPanel ? 'pointer-events-none' : ''}
              >
                {/* Search Field */}
                <div className="mx-auto mb-4 w-[300px]">
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-5">
                      <MagnifyingGlassIcon className="h-6 w-6 text-zinc-400" aria-hidden="true" />
                    </div>
                    <input
                      type="text"
                      placeholder="Search protocols..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="relative block h-12 w-full rounded-full border border-zinc-700/50 bg-zinc-900/40 pl-14 pr-5 text-base text-zinc-100 shadow-lg backdrop-blur-2xl transition-all placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    />
                  </div>
                </div>

                {/* Protocol Icons Grid - Single Row */}
                <div className="flex justify-center gap-6">
                  {protocolsLoading ? (
                    <div className="text-sm text-zinc-500">Loading protocols...</div>
                  ) : filteredProtocols.length === 0 ? (
                    <div className="text-sm text-zinc-500">No protocols found</div>
                  ) : (
                    filteredProtocols.map((protocol) => {
                      const iconSrc = getProtocolIcon(protocol.id, protocol.icon_url);

                      return (
                        <div
                          key={protocol.id}
                          className="group cursor-pointer"
                          onClick={() => {
                            setSelectedProtocol(protocol);
                            setSelectedProduct(null);
                            // With products, the panel asks which one before showing overrides
                            if (protocol.products?.length) {
                              setSelectedAction(null);
                            } else if (protocol.actions.length > 0) {
                              handleActionSelect(protocol.actions[0]);
                            } else {
                              setSelectedAction(null);
                            }
                            setShowProtocolPanel(true);
                          }}
                        >
                          <div className="flex flex-col items-center gap-2">
                            <div className="flex h-16 w-16 items-center justify-center transition-all group-hover:scale-110">
                              <img src={iconSrc} alt={protocol.title} className="h-16 w-16" />
                            </div>
                            <span className="text-center text-xs font-medium text-zinc-400 transition-colors group-hover:text-zinc-100">
                              {protocol.title}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </motion.div>

              {/* Protocol Panel - Animated */}
              <motion.div
                initial={false}
                animate={{
                  opacity: showProtocolPanel ? 1 : 0,
                  y: showProtocolPanel ? 0 : 20,
                }}
                transition={{ duration: 0.15, ease: 'easeInOut' }}
                className={!showProtocolPanel ? 'pointer-events-none' : ''}
                style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
              >
                {selectedProtocol && (
                  <div className="h-[60vh] w-full overflow-hidden rounded-2xl border border-zinc-700/50 bg-zinc-900/40 shadow-2xl backdrop-blur-2xl">
                    <div className="flex h-full flex-col">
                      {/* Header */}
                      <div className="flex items-center justify-between border-b border-zinc-700/50 p-6 shadow-lg">
                        <div className="flex items-center gap-4">
                          {selectedProduct && (
                            <button
                              onClick={() => {
                                setSelectedProduct(null);
                                setSelectedAction(null);
                                setActionSearchQuery('');
                                setModifiedFields(new Set());
                                setArrayEntryIndex({});
                                setFetchBeforeUse(false);
                              }}
                              title="Back to Kamino products"
                              className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                            >
                              <ArrowUturnLeftIcon className="h-4 w-4" />
                            </button>
                          )}
                          <img
                            src={getProtocolIcon(selectedProtocol.id, selectedProtocol.icon_url)}
                            alt={selectedProtocol.title}
                            className="h-12 w-12"
                          />
                          <div>
                            <h3 className="text-xl font-semibold text-zinc-100">
                              {selectedProtocol.title}
                              {selectedProduct && <span className="text-zinc-500"> / {selectedProduct.title}</span>}
                            </h3>
                            <p className="text-sm text-zinc-400">
                              {selectedProduct?.description ?? selectedProtocol.description}
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setShowProtocolPanel(false);
                            setSelectedProduct(null);
                            setSelectedAction(null);
                            setEditingAction(null);
                            setModifiedFields(new Set());
                            setArrayEntryIndex({});
                            setFetchBeforeUse(false);
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
                        >
                          ✕
                        </button>
                      </div>

                      {/* Product picker, shown before the overrides of a multi-program protocol */}
                      {selectedProtocol.products && !selectedProduct ? (
                        <div className="flex-1 overflow-y-auto p-6">
                          <p className="mb-4 text-sm text-zinc-400">
                            Pick a product to see the accounts you can override.
                          </p>
                          <div className="grid grid-cols-3 gap-4">
                            {selectedProtocol.products.map((product) => (
                              <button
                                key={product.id}
                                onClick={() => {
                                  setSelectedProduct(product);
                                  setActionSearchQuery('');
                                  if (product.actions.length > 0) {
                                    handleActionSelect(product.actions[0]);
                                  } else {
                                    setSelectedAction(null);
                                  }
                                }}
                                className="rounded-lg border border-zinc-700/50 bg-zinc-800/40 p-4 text-left transition-all hover:border-yellow-500 hover:bg-zinc-800"
                              >
                                <div className="text-base font-semibold text-zinc-100">{product.title}</div>
                                <div className="mt-1 text-sm text-zinc-400">{product.description}</div>
                                <div className="mt-3 text-xs text-zinc-500">
                                  {product.actions.length} override{product.actions.length === 1 ? '' : 's'}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        /* Two Column Layout */
                        <div className="flex flex-1 overflow-hidden">
                          {/* Left Column - Actions List */}
                          <div className="w-[400px] flex-shrink-0 overflow-y-auto border-r border-zinc-700/50 p-6">
                            {/* Search Field */}
                            <div className="relative mb-4">
                              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                                <MagnifyingGlassIcon className="h-5 w-5 text-zinc-400" aria-hidden="true" />
                              </div>
                              <input
                                type="text"
                                placeholder="Search overrides..."
                                value={actionSearchQuery}
                                onChange={(e) => setActionSearchQuery(e.target.value)}
                                className="block h-10 w-full rounded-lg border border-zinc-700/50 bg-zinc-800/40 pl-11 pr-4 text-sm text-zinc-100 transition-all placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                              />
                            </div>
                            <div className="space-y-2">
                              {filteredActions.map((action) => (
                                <div
                                  key={action.id}
                                  className={`cursor-pointer rounded-lg border p-4 transition-all ${
                                    selectedAction?.id === action.id
                                      ? 'border-yellow-500 bg-zinc-800/80'
                                      : 'border-zinc-700/50 bg-zinc-800/30 hover:border-zinc-600 hover:bg-zinc-800/50'
                                  }`}
                                  onClick={() => handleActionSelect(action)}
                                >
                                  <h5 className="font-semibold text-zinc-100">{action.title}</h5>
                                  <p className="mt-1 text-xs text-zinc-400">{action.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Right Column - Account Data Editor */}
                          <div className="flex flex-1 flex-col overflow-y-auto p-6">
                            {selectedAction ? (
                              <>
                                <div className="mb-4">
                                  <div className="flex items-center justify-between">
                                    <h4 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                                      Account Data
                                    </h4>
                                    <div className="flex items-center gap-3">
                                      <label className="text-sm text-zinc-400">Fetch before use</label>
                                      <Switch checked={fetchBeforeUse} onChange={setFetchBeforeUse} color="purple" />
                                    </div>
                                  </div>
                                  <p className="mt-2 text-xs text-zinc-500">
                                    Fetch account data just before transaction execution. Useful for price feeds, oracle
                                    updates, and dynamic balances.
                                  </p>
                                </div>
                                {loadingAccountData ? (
                                  <div className="flex flex-1 items-center justify-center">
                                    <div className="flex flex-col items-center gap-3">
                                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-700 border-t-yellow-500" />
                                      <p className="text-sm text-zinc-500">Loading account data...</p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="mb-6 flex-1 space-y-4">
                                    {(() => {
                                      const fields = [...getFieldsFromIDL(selectedAction.template)];
                                      // value_type lets a property without an IDL field still render an input
                                      for (const prop of selectedAction.template?.properties ?? []) {
                                        if (typeof prop === 'string' || prop.value_type == null) continue;
                                        const index = fields.findIndex((field: any) => field.name === prop.path);
                                        const field = { ...fields[index], name: prop.path, type: prop.value_type };
                                        if (index === -1) fields.push(field);
                                        else fields[index] = field;
                                      }

                                      logger.log('🔍 Fields extracted from IDL:', fields);
                                      logger.log('🔍 Account type:', selectedAction.template?.accountType);
                                      logger.log('🔍 Properties:', selectedAction.template?.properties);

                                      if (fields.length === 0) {
                                        return <p className="text-zinc-500">No editable fields available</p>;
                                      }

                                      // Get the list of properties from the template (new unified format)
                                      // Properties are now objects with { path, kind, label, description, constant }
                                      const rawProperties = selectedAction.template?.properties || [];
                                      // Extract just the paths for backward compatibility with field filtering
                                      const editableProperties = rawProperties.map((prop: any) =>
                                        typeof prop === 'string' ? prop : prop.path
                                      );
                                      logger.log('🔍 Editable properties:', editableProperties);
                                      editableProperties.forEach((prop: string) => {
                                        logger.log('  📌', prop);
                                      });

                                      // Get constants from template
                                      const constants = selectedAction.template?.constants || {};
                                      logger.log('🔍 Properties (raw):', rawProperties);
                                      logger.log('🔍 Constants:', constants);

                                      // Helper to check if a field is a constant_ref
                                      // Note: Backend serializes PropertyKind as "type" field (not "kind")
                                      const getConstantRefInfo = (
                                        fieldPath: string
                                      ): {
                                        isConstantRef: boolean;
                                        constantDef?: any;
                                        label?: string;
                                        description?: string;
                                      } => {
                                        // Find the property by path in the new unified format
                                        const prop = rawProperties.find(
                                          (p: any) => (typeof p === 'string' ? p : p.path) === fieldPath
                                        );
                                        // Check prop.type (serialized from Rust's PropertyKind via #[serde(rename = "type")])
                                        if (
                                          prop &&
                                          typeof prop !== 'string' &&
                                          prop.type === 'constant_ref' &&
                                          prop.constant &&
                                          constants[prop.constant]
                                        ) {
                                          return {
                                            isConstantRef: true,
                                            constantDef: constants[prop.constant],
                                            label: prop.label,
                                            description: prop.description,
                                          };
                                        }
                                        return { isConstantRef: false };
                                      };

                                      // Helper to get property metadata (label, description)
                                      const getPropertyMeta = (
                                        fieldPath: string
                                      ): { label?: string; description?: string } => {
                                        const prop = rawProperties.find(
                                          (p: any) => (typeof p === 'string' ? p : p.path) === fieldPath
                                        );
                                        if (prop && typeof prop !== 'string') {
                                          return { label: prop.label, description: prop.description };
                                        }
                                        return {};
                                      };

                                      // Get the value from accountData using the path
                                      const getValue = (path: string) => {
                                        const keys = path.split('.');
                                        let value: any = accountData;
                                        for (const key of keys) {
                                          value = value?.[key];
                                        }

                                        // Handle undefined/null
                                        if (value === undefined || value === null) {
                                          return '';
                                        }

                                        if (value instanceof LosslessNumber) {
                                          return value.toString();
                                        }

                                        // Convert objects/arrays to JSON string for display,
                                        // keeping any nested u64 as its exact digits.
                                        if (typeof value === 'object') {
                                          return serializeScenarioJson(value);
                                        }

                                        return value;
                                      };

                                      // Set the value in accountData using the path
                                      const setValue = (path: string, newValue: any) => {
                                        const keys = path.split('.');
                                        const newData = { ...accountData };
                                        let current: any = newData;

                                        for (let i = 0; i < keys.length - 1; i++) {
                                          if (!current[keys[i]]) {
                                            current[keys[i]] = {};
                                          }
                                          current = current[keys[i]];
                                        }

                                        current[keys[keys.length - 1]] = newValue;
                                        setAccountData(newData);

                                        // Mark this field as modified
                                        setModifiedFields((prev) => new Set(prev).add(path));
                                      };

                                      // Helper to check if a property is a constant_ref (rendered separately as Combobox)
                                      const isConstantRefProperty = (fieldPath: string): boolean => {
                                        const prop = rawProperties.find(
                                          (p: any) => (typeof p === 'string' ? p : p.path) === fieldPath
                                        );
                                        return (
                                          prop &&
                                          typeof prop !== 'string' &&
                                          (prop.type === 'constant_ref' || prop.type === 'dynamic_ref')
                                        );
                                      };

                                      // Helper to check if a field or any of its children should be rendered
                                      // A declared path names one example entry of an array. Compare with
                                      // numeric segments wildcarded so choosing a different entry stays
                                      // editable - otherwise picking SOL (index 3) would render nothing,
                                      // because only `prices.0.*` is declared.
                                      const withoutIndices = (path: string) => path.replace(/\.\d+(?=\.|$)/g, '.#');
                                      const editablePatterns = new Set(
                                        editableProperties.map((prop: string) => withoutIndices(prop))
                                      );

                                      const shouldRenderField = (fieldPath: string): boolean => {
                                        // Skip constant_ref properties - they're rendered as Comboboxes in PDA Configuration
                                        if (isConstantRefProperty(fieldPath)) {
                                          return false;
                                        }

                                        if (editableProperties.length === 0) {
                                          // If no properties specified, show all fields
                                          return true;
                                        }

                                        // Check if this exact path is in properties
                                        if (editableProperties.includes(fieldPath)) {
                                          return true;
                                        }

                                        const pattern = withoutIndices(fieldPath);
                                        if (editablePatterns.has(pattern)) {
                                          return true;
                                        }

                                        // Check if any property starts with this path (has children)
                                        return editableProperties.some(
                                          (prop: string) =>
                                            prop.startsWith(fieldPath + '.') ||
                                            withoutIndices(prop).startsWith(pattern + '.')
                                        );
                                      };

                                      const isFieldEditable = (fieldPath: string): boolean => {
                                        if (editableProperties.length === 0) {
                                          return true;
                                        }
                                        return (
                                          editableProperties.includes(fieldPath) ||
                                          editablePatterns.has(withoutIndices(fieldPath))
                                        );
                                      };

                                      // Recursive function to render fields
                                      const renderField = (
                                        field: any,
                                        path: string,
                                        depth: number = 0
                                      ): React.ReactNode => {
                                        const typeInfo = getFieldTypeInfo(field, selectedAction.template?.idl);
                                        const fieldPath = path ? `${path}.${field.name}` : field.name;

                                        logger.log(
                                          '🔍 Rendering field:',
                                          fieldPath,
                                          'type:',
                                          typeInfo.type,
                                          'isNested:',
                                          typeInfo.isNested,
                                          'shouldRender:',
                                          shouldRenderField(fieldPath),
                                          'isEditable:',
                                          isFieldEditable(fieldPath)
                                        );

                                        // Skip this field if it's not in the editable properties and has no children that are
                                        if (!shouldRenderField(fieldPath)) {
                                          logger.log('❌ Skipping field:', fieldPath);
                                          return null;
                                        }

                                        if (typeInfo.elementType !== undefined && !isFieldEditable(fieldPath)) {
                                          const declaredIndices: string[] = Array.from(
                                            new Set<string>(
                                              editableProperties
                                                .filter((prop: string) => prop.startsWith(fieldPath + '.'))
                                                .map((prop: string) => prop.slice(fieldPath.length + 1).split('.')[0])
                                                .filter((segment: string) => /^\d+$/.test(segment))
                                            )
                                          );

                                          const indexFromValues: string | undefined = [
                                            ...modifiedFields,
                                            ...Object.keys(accountData),
                                          ]
                                            .filter((prop: string) => prop.startsWith(fieldPath + '.'))
                                            .map((prop: string) => prop.slice(fieldPath.length + 1).split('.')[0])
                                            .find((segment: string) => /^\d+$/.test(segment));

                                          const activeIndex =
                                            arrayEntryIndex[fieldPath] ?? indexFromValues ?? declaredIndices[0] ?? '0';
                                          const indexChildren = [
                                            renderField(
                                              { name: activeIndex, type: typeInfo.elementType },
                                              fieldPath,
                                              depth + 1
                                            ),
                                          ].filter(Boolean);

                                          if (indexChildren.length === 0) {
                                            return null;
                                          }

                                          return (
                                            <div key={fieldPath} className="space-y-2">
                                              <div
                                                className="rounded-lg border border-zinc-600/50 bg-zinc-800/20 p-3"
                                                style={{ marginLeft: `${depth * 12}px` }}
                                              >
                                                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-zinc-200">
                                                  {String(field.name)}
                                                  <span className="text-xs font-normal text-zinc-500">
                                                    ({String(typeInfo.type)})
                                                  </span>
                                                  <span className="ml-auto flex items-center gap-1 text-xs font-normal text-zinc-400">
                                                    entry
                                                    <input
                                                      type="number"
                                                      min={0}
                                                      value={activeIndex}
                                                      onChange={(e) =>
                                                        setArrayEntryIndex((prev) => ({
                                                          ...prev,
                                                          [fieldPath]: e.target.value.replace(/[^0-9]/g, '') || '0',
                                                        }))
                                                      }
                                                      className="w-20 rounded border border-zinc-600/50 bg-zinc-900/60 px-2 py-1 text-right text-zinc-200 focus:border-yellow-500 focus:outline-none"
                                                    />
                                                  </span>
                                                </label>
                                                <div className="space-y-3 pl-3">{indexChildren}</div>
                                              </div>
                                            </div>
                                          );
                                        }

                                        // Nested struct - render recursively
                                        if (typeInfo.isNested && typeInfo.nestedFields) {
                                          logger.log(
                                            '🔍 Nested struct:',
                                            fieldPath,
                                            'has',
                                            typeInfo.nestedFields.length,
                                            'nested fields'
                                          );
                                          logger.log(
                                            '🔍 Nested fields:',
                                            typeInfo.nestedFields.map((f: any) => f.name)
                                          );

                                          const childFields = typeInfo.nestedFields
                                            .map((nestedField: any) => renderField(nestedField, fieldPath, depth + 1))
                                            .filter(Boolean); // Remove null entries

                                          logger.log('🔍 After filtering, childFields count:', childFields.length);

                                          // Only render the struct if it has visible children
                                          if (childFields.length === 0) {
                                            logger.log('❌ No visible children for nested struct:', fieldPath);
                                            return null;
                                          }

                                          return (
                                            <div key={fieldPath} className="space-y-2">
                                              <div
                                                className="rounded-lg border border-zinc-600/50 bg-zinc-800/20 p-3"
                                                style={{ marginLeft: `${depth * 12}px` }}
                                              >
                                                <label className="mb-2 block text-sm font-semibold text-zinc-200">
                                                  {String(field.name)}
                                                  <span className="ml-2 text-xs font-normal text-zinc-500">
                                                    ({String(typeInfo.type)})
                                                  </span>
                                                </label>
                                                <div className="space-y-3 pl-3">{childFields}</div>
                                              </div>
                                            </div>
                                          );
                                        }

                                        // Regular field - only render if it's editable
                                        if (!isFieldEditable(fieldPath)) {
                                          return null;
                                        }

                                        // Regular field - render input based on type
                                        const typeString = String(typeInfo.type);
                                        const isPhoenixCollateral =
                                          selectedAction.template?.id === 'phoenix-trader-collateral-stress' &&
                                          fieldPath === 'traderState.quoteLotCollateral';
                                        const inputType =
                                          !isPhoenixCollateral &&
                                          (typeString.startsWith('i') || typeString.startsWith('u'))
                                            ? 'number'
                                            : typeString === 'bool'
                                              ? 'checkbox'
                                              : 'text';

                                        // Check if this field has been explicitly modified by the user
                                        const isModified = modifiedFields.has(fieldPath);

                                        // Determine field state: OVERRIDE > STREAMED > CACHED
                                        const fieldState = isModified
                                          ? 'override'
                                          : fetchBeforeUse
                                            ? 'streamed'
                                            : 'cached';

                                        // Function to reset/clear the field
                                        const resetField = () => {
                                          const keys = fieldPath.split('.');
                                          const newData = { ...accountData };
                                          let current = newData;

                                          for (let i = 0; i < keys.length - 1; i++) {
                                            if (!current[keys[i]]) return;
                                            current = current[keys[i]];
                                          }

                                          delete current[keys[keys.length - 1]];
                                          setAccountData(newData);

                                          // Remove from modified fields
                                          setModifiedFields((prev) => {
                                            const newSet = new Set(prev);
                                            newSet.delete(fieldPath);
                                            return newSet;
                                          });
                                        };

                                        // Get label and description from property metadata
                                        const propertyMeta = getPropertyMeta(fieldPath);
                                        const displayLabel = propertyMeta.label || String(field.name);
                                        const displayDescription = propertyMeta.description;

                                        return (
                                          <div
                                            key={fieldPath}
                                            className="space-y-2"
                                            style={{ marginLeft: `${depth * 12}px` }}
                                          >
                                            <div className="flex items-start justify-between">
                                              <div className="flex-1">
                                                <label className="block text-sm font-medium text-zinc-300">
                                                  {displayLabel}
                                                  <span className="ml-2 text-xs text-zinc-500">({typeString})</span>
                                                </label>
                                                {displayDescription && (
                                                  <p className="mt-0.5 text-xs text-zinc-500">{displayDescription}</p>
                                                )}
                                              </div>
                                              <div className="ml-2 flex items-center gap-2">
                                                {fieldState === 'override' && (
                                                  <>
                                                    <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-500">
                                                      OVERRIDE VALUE
                                                    </span>
                                                    <button
                                                      onClick={resetField}
                                                      className="flex items-center gap-1 rounded px-2 py-1 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-200"
                                                      title="Reset to default"
                                                    >
                                                      <ArrowUturnLeftIcon className="h-3 w-3" />
                                                      Reset
                                                    </button>
                                                  </>
                                                )}
                                                {fieldState === 'streamed' && (
                                                  <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-xs font-medium text-purple-500">
                                                    FETCH BEFORE USE
                                                  </span>
                                                )}
                                                {fieldState === 'cached' && (
                                                  <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-xs font-medium text-zinc-500">
                                                    USE CACHED VALUE
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                            {inputType === 'checkbox' ? (
                                              <input
                                                type="checkbox"
                                                checked={!!getValue(fieldPath)}
                                                onChange={(e) => setValue(fieldPath, e.target.checked)}
                                                className="h-4 w-4 rounded border-zinc-700/50 bg-zinc-800/40 text-yellow-500 focus:ring-1 focus:ring-zinc-500"
                                              />
                                            ) : (
                                              <input
                                                type={inputType}
                                                // Scrolling over a focused number input silently changes its value
                                                onWheel={
                                                  inputType === 'number' ? (e) => e.currentTarget.blur() : undefined
                                                }
                                                value={getValue(fieldPath)}
                                                onChange={(e) => {
                                                  let newValue: any = e.target.value;

                                                  // Parse based on type
                                                  if (inputType === 'number') {
                                                    newValue = toScenarioNumber(e.target.value);
                                                  } else if (
                                                    typeString.includes('array') ||
                                                    typeString.includes('vec') ||
                                                    typeString === 'object'
                                                  ) {
                                                    // Parse complex types losslessly so a nested u64 is not rounded.
                                                    try {
                                                      newValue = e.target.value
                                                        ? parseScenariosJson(e.target.value)
                                                        : e.target.value;
                                                    } catch {
                                                      // Keep as string if not valid JSON
                                                      newValue = e.target.value;
                                                    }
                                                  }

                                                  setValue(fieldPath, newValue);
                                                }}
                                                placeholder={`Enter ${String(field.name)}...`}
                                                className={`block w-full rounded-lg border px-4 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 ${
                                                  fieldState === 'override'
                                                    ? 'border-yellow-500 bg-yellow-500/5 focus:border-yellow-400 focus:ring-yellow-500/50'
                                                    : fieldState === 'streamed'
                                                      ? 'border-purple-500 bg-purple-500/5 focus:border-purple-400 focus:ring-purple-500/50'
                                                      : 'border-zinc-500 bg-zinc-500/5 focus:border-zinc-400 focus:ring-zinc-500/50'
                                                }`}
                                              />
                                            )}
                                          </div>
                                        );
                                      };

                                      // Render constant_ref properties as comboboxes or selects
                                      const renderConstantRefFields = () => {
                                        // Filter for constant_ref properties from the new unified format
                                        // Note: Backend serializes PropertyKind as "type" field
                                        const constantRefProps = rawProperties
                                          .filter((prop: any) => {
                                            if (typeof prop === 'string') return false;
                                            if (prop.type === 'constant_ref')
                                              return prop.constant && constants[prop.constant];
                                            if (prop.type === 'dynamic_ref') return Boolean(prop.source);
                                            return false;
                                          })
                                          .map((prop: any) => ({
                                            // Map to the old format for compatibility with existing rendering logic.
                                            // dynamic_ref resolves its options live; constant_ref reads the static catalog.
                                            name: prop.path,
                                            type: prop.type,
                                            constantDef:
                                              prop.type === 'dynamic_ref'
                                                ? {
                                                    label: prop.label ?? prop.path,
                                                    description: prop.description,
                                                    options: (dynamicOptions[prop.source] ?? []).map((option) => ({
                                                      id: option.value,
                                                      label: option.value,
                                                      value: option.value,
                                                      address: option.address,
                                                      description: option.address,
                                                      metadata: { symbol: option.value },
                                                    })),
                                                  }
                                                : constants[prop.constant],
                                            label: prop.label,
                                            description: prop.description,
                                          }));

                                        if (constantRefProps.length === 0) return null;

                                        // Token selector component using Catalyst Combobox
                                        const TokenSelector = ({
                                          constantDef,
                                          fieldPath,
                                          currentValue,
                                          isModified,
                                          takesCustomValues,
                                        }: {
                                          constantDef: any;
                                          fieldPath: string;
                                          currentValue: string | number | undefined;
                                          isModified: boolean;
                                          takesCustomValues: boolean;
                                        }) => {
                                          const { options, selectedOption } = resolveTokenSelectorOptions(
                                            constantDef.options,
                                            currentValue
                                          );
                                          // A typed value that names a catalog option (its value, symbol, label or
                                          // address) picks that option; anything else is kept as a custom value.
                                          const customOptionFor = (query: string) =>
                                            findOptionByTypedValue(options, query) ? null : customValueOption(query);

                                          return (
                                            <Combobox
                                              value={selectedOption}
                                              onChange={(option: any) => {
                                                if (option) {
                                                  setValue(fieldPath, option.value);
                                                }
                                              }}
                                              options={options}
                                              displayValue={(option: any) => {
                                                if (!option) return '';
                                                // Display symbol from metadata if available
                                                const symbol = option.metadata?.symbol || option.id?.toUpperCase();
                                                return symbol;
                                              }}
                                              filter={(option: any, query: string) => {
                                                const q = query.toLowerCase();
                                                const symbol = (
                                                  option.metadata?.symbol ||
                                                  option.id ||
                                                  ''
                                                ).toLowerCase();
                                                const label = (option.label || '').toLowerCase();
                                                const description = (option.description || '').toLowerCase();
                                                const value = String(option.value ?? '').toLowerCase();
                                                return (
                                                  symbol.includes(q) ||
                                                  label.includes(q) ||
                                                  description.includes(q) ||
                                                  value.includes(q)
                                                );
                                              }}
                                              customOption={takesCustomValues ? customOptionFor : undefined}
                                              immediate={takesCustomValues}
                                              placeholder={`Search ${constantDef.label.toLowerCase()}...`}
                                              aria-label={constantDef.label}
                                              className={isModified ? '[&_[data-slot=control]]:border-yellow-500' : ''}
                                            >
                                              {(option: any) => (
                                                <ComboboxOption key={option.id} value={option}>
                                                  <div className="flex items-center gap-3">
                                                    {/* Token logo if available */}
                                                    {option.metadata?.logo_uri && (
                                                      <img
                                                        src={option.metadata.logo_uri}
                                                        alt={option.metadata?.symbol || option.id}
                                                        className="h-5 w-5 rounded-full"
                                                        onError={(e) => {
                                                          // Hide broken images
                                                          (e.target as HTMLImageElement).style.display = 'none';
                                                        }}
                                                      />
                                                    )}
                                                    <ComboboxLabel>
                                                      <span className="font-medium">
                                                        {option.metadata?.symbol || option.id?.toUpperCase()}
                                                      </span>
                                                      {option.description && (
                                                        <span className="ml-2 text-zinc-400">{option.description}</span>
                                                      )}
                                                    </ComboboxLabel>
                                                  </div>
                                                </ComboboxOption>
                                              )}
                                            </Combobox>
                                          );
                                        };

                                        return (
                                          <div className="mb-6 space-y-4 rounded-lg border border-zinc-600/50 bg-zinc-800/20 p-4">
                                            <h5 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
                                              PDA Configuration
                                            </h5>
                                            {constantRefProps.map((prop: any) => {
                                              const constantDef = prop.constantDef;
                                              const fieldPath = prop.name;
                                              const rawValue = getValue(fieldPath);
                                              // Convert to string for comparison (handles numbers like config_index)
                                              const currentValue = rawValue != null ? String(rawValue) : '';
                                              const isModified = modifiedFields.has(fieldPath);

                                              // A live list (today only Phoenix markets) is always searchable and takes custom values;
                                              // static catalogs keep the plain select below 20 options.
                                              const isLiveList = prop.type === 'dynamic_ref';
                                              const useCombobox = isLiveList || constantDef.options.length > 20;
                                              const { options, selectedOption } = resolveTokenSelectorOptions(
                                                constantDef.options,
                                                currentValue
                                              );

                                              return (
                                                <div key={fieldPath} className="space-y-2">
                                                  <div className="flex items-center justify-between">
                                                    <label className="block text-sm font-medium text-zinc-300">
                                                      {constantDef.label}
                                                      {isModified && (
                                                        <span className="ml-2 rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-medium text-yellow-500">
                                                          SELECTED
                                                        </span>
                                                      )}
                                                    </label>
                                                  </div>
                                                  {constantDef.description && (
                                                    <p className="text-xs text-zinc-500">{constantDef.description}</p>
                                                  )}

                                                  {useCombobox ? (
                                                    <TokenSelector
                                                      constantDef={constantDef}
                                                      fieldPath={fieldPath}
                                                      currentValue={currentValue}
                                                      isModified={isModified}
                                                      takesCustomValues={isLiveList}
                                                    />
                                                  ) : (
                                                    <Select
                                                      value={String(selectedOption?.value ?? '')}
                                                      onChange={(e) => {
                                                        setValue(fieldPath, e.target.value);
                                                      }}
                                                      className={
                                                        isModified ? '!border-yellow-500 !bg-yellow-500/5' : ''
                                                      }
                                                    >
                                                      <option value="">
                                                        Select {constantDef.label.toLowerCase()}...
                                                      </option>
                                                      {options.map((option) => (
                                                        <option key={option.id} value={option.value}>
                                                          {option.metadata?.symbol ?? option.label}
                                                        </option>
                                                      ))}
                                                    </Select>
                                                  )}

                                                  {/* Show selected token details */}
                                                  {currentValue &&
                                                    (() => {
                                                      // Use case-insensitive comparison for hex values (like Pyth feed IDs)
                                                      const selectedOption = constantDef.options.find((opt: any) =>
                                                        currentValue.startsWith('0x')
                                                          ? opt.value?.toLowerCase() === currentValue.toLowerCase()
                                                          : opt.value === currentValue
                                                      );
                                                      if (!selectedOption) return null;

                                                      return (
                                                        <div className="mt-2 flex items-center gap-2 rounded-md bg-zinc-800/50 px-3 py-2">
                                                          {selectedOption.metadata?.logo_uri && (
                                                            <img
                                                              src={selectedOption.metadata.logo_uri}
                                                              alt={selectedOption.metadata?.symbol || selectedOption.id}
                                                              className="h-6 w-6 rounded-full"
                                                              onError={(e) => {
                                                                (e.target as HTMLImageElement).style.display = 'none';
                                                              }}
                                                            />
                                                          )}
                                                          <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                              <span className="font-medium text-zinc-200">
                                                                {selectedOption.metadata?.symbol ||
                                                                  selectedOption.id?.toUpperCase()}
                                                              </span>
                                                              {selectedOption.metadata?.decimals !== undefined && (
                                                                <span className="text-xs text-zinc-500">
                                                                  ({selectedOption.metadata.decimals} decimals)
                                                                </span>
                                                              )}
                                                            </div>
                                                            <div className="truncate font-mono text-xs text-zinc-500">
                                                              {selectedOption.address ?? selectedOption.value}
                                                            </div>
                                                          </div>
                                                        </div>
                                                      );
                                                    })()}
                                                </div>
                                              );
                                            })}
                                          </div>
                                        );
                                      };

                                      return (
                                        <>
                                          {renderConstantRefFields()}
                                          {fields.map((field: any) => renderField(field, '', 0))}
                                        </>
                                      );
                                    })()}
                                  </div>
                                )}

                                {/* Add/Update Action Button - Right Aligned */}
                                {!loadingAccountData && (
                                  <div className="flex justify-end">
                                    <button
                                      onClick={() => {
                                        if (selectedSlotId && selectedProtocol && selectedAction) {
                                          if (editingAction) {
                                            // Update existing action
                                            updateActionInSlot(
                                              editingAction.slotId,
                                              editingAction.actionIndex,
                                              selectedProtocol,
                                              selectedAction
                                            );
                                            setEditingAction(null);
                                          } else {
                                            // Add new action
                                            addActionToSlot(selectedSlotId, selectedProtocol, selectedAction);
                                          }
                                          setShowProtocolPanel(false);
                                          setSelectedProduct(null);
                                          setSelectedAction(null);
                                          setAccountData({});
                                          setModifiedFields(new Set());
                                          setArrayEntryIndex({});
                                          setFetchBeforeUse(false);
                                        }
                                      }}
                                      disabled={!selectedSlotId || !selectedAction}
                                      className="w-[300px] rounded-lg bg-yellow-500 px-6 py-3 font-semibold text-zinc-900 transition-all hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {editingAction
                                        ? 'Update Action'
                                        : selectedSlotId
                                          ? 'Add to Selected Slot'
                                          : 'Select a slot first'}
                                    </button>
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="flex h-full items-center justify-center text-zinc-500">
                                Select an override to edit account data
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Player Controller - Fixed Position (Read and Play modes) */}
        {(mode === 'read' || mode === 'play') && (
          <motion.div
            key="player-controller"
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="pointer-events-none fixed left-1/2 z-50 w-[800px] -translate-x-1/2"
            style={{ bottom: '116px' }}
          >
            <div className="pointer-events-auto relative rounded-full border border-zinc-700/50 bg-zinc-900/40 shadow-2xl backdrop-blur-2xl">
              {!!downloadError && (
                <div className="absolute inset-x-0 bottom-1 text-center text-xs text-red-400">{downloadError}</div>
              )}
              <div className="flex items-center justify-between px-8 py-6">
                {/* Timeline/Progress */}
                <div className="flex flex-1 flex-col gap-1">
                  {/* Slot Labels */}
                  <div className="relative flex items-start px-5" style={{ height: '20px' }}>
                    {slots.map((slot, index) => {
                      // Calculate position: 12.5% offset + (index * 75% / (slots.length - 1))
                      const totalSlots = slots.length;
                      const position = totalSlots > 1 ? 12.5 + (index / (totalSlots - 1)) * 75 : 50; // Single slot: centered at 50%
                      const isExecuted = mode === 'play' && index <= currentPlaybackSlot;
                      return (
                        <div
                          key={`label-${slot.id}`}
                          className="absolute flex flex-col items-center gap-0.5"
                          style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                        >
                          <span
                            className={`whitespace-nowrap font-mono text-[10px] uppercase tracking-wide transition-colors ${
                              isExecuted ? 'text-green-500' : 'text-zinc-400'
                            }`}
                          >
                            {slots.length < 5 ? `SLOT ${index + 1}` : `${index + 1}`}
                          </span>
                          {/* Small triangle tick pointing down */}
                          <div
                            className={`h-0 w-0 border-l-[3px] border-r-[3px] border-t-[3px] border-l-transparent border-r-transparent transition-colors ${
                              isExecuted ? 'border-t-green-500' : 'border-t-zinc-400'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Progress Bar */}
                  <div className="relative h-2 w-full rounded-full bg-zinc-800">
                    {/* Background segments */}
                    <div className="absolute inset-0 flex overflow-hidden rounded-full">
                      {/* Start dashed segment (12.5%) */}
                      <div
                        className="h-2"
                        style={{
                          width: '12.5%',
                          backgroundImage:
                            'repeating-linear-gradient(to right, #3f3f46 0px, #3f3f46 4px, transparent 4px, transparent 8px)',
                        }}
                      />

                      {/* Solid middle segments */}
                      {slots.length === 1 ? (
                        // Single slot: one 75% solid segment
                        <div className="h-2 bg-zinc-700" style={{ width: '75%' }} />
                      ) : (
                        // Multiple slots: divide 75% among (slots.length - 1) segments
                        Array.from({ length: slots.length - 1 }).map((_, index) => (
                          <div
                            key={`segment-${index}`}
                            className="h-2 bg-zinc-700"
                            style={{ width: `${75 / (slots.length - 1)}%` }}
                          />
                        ))
                      )}

                      {/* End dashed segment (12.5%) */}
                      <div
                        className="h-2"
                        style={{
                          width: '12.5%',
                          backgroundImage:
                            'repeating-linear-gradient(to right, #3f3f46 0px, #3f3f46 4px, transparent 4px, transparent 8px)',
                        }}
                      />
                    </div>

                    {/* Pink progress overlay (ready state) - shows when in play mode */}
                    {mode === 'play' && (
                      <div
                        className="absolute left-0 top-0 h-2 overflow-hidden rounded-full"
                        style={{ width: '12.5%' }}
                      >
                        <div
                          className="h-2 w-full"
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(to right, #ec4899 0px, #ec4899 4px, transparent 4px, transparent 8px)',
                          }}
                        />
                      </div>
                    )}

                    {/* Green progress overlay (execution state) */}
                    {mode === 'play' &&
                      (() => {
                        // For the last slot, extend to 100% and include the final dashed segment
                        const isLastSlot = currentPlaybackSlot === slots.length - 1;

                        let greenProgress;
                        if (slots.length === 1) {
                          // Single slot: always show full progress (100%)
                          greenProgress = 100;
                        } else if (currentPlaybackSlot === 0) {
                          // First slot of multiple: full first dashed (12.5%) + half of first solid segment
                          greenProgress = 12.5 + 37.5 / (slots.length - 1);
                        } else if (isLastSlot) {
                          // Last slot: full progress
                          greenProgress = 100;
                        } else {
                          // Middle slots: calculate position
                          greenProgress = 12.5 + (currentPlaybackSlot + 0.5) * (75 / (slots.length - 1));
                        }

                        return (
                          <>
                            {/* Green dashed segment - always 12.5% of full bar */}
                            <div
                              className="absolute left-0 top-0 h-2 transition-all duration-300"
                              style={{
                                width: '12.5%',
                                backgroundImage:
                                  'repeating-linear-gradient(to right, #10b981 0px, #10b981 4px, transparent 4px, transparent 8px)',
                              }}
                            />

                            {/* Green solid segment - from 12.5% to greenProgress (or 87.5% if last slot) */}
                            {greenProgress > 12.5 && (
                              <div
                                className="absolute top-0 h-2 bg-green-500 transition-all duration-300"
                                style={{
                                  left: '12.5%',
                                  width: isLastSlot ? `${87.5 - 12.5}%` : `${greenProgress - 12.5}%`,
                                }}
                              />
                            )}

                            {/* Last green dashed segment - only for last slot */}
                            {isLastSlot && (
                              <div
                                className="absolute top-0 h-2"
                                style={{
                                  right: 0,
                                  width: '12.5%',
                                  backgroundImage:
                                    'repeating-linear-gradient(to right, #10b981 0px, #10b981 4px, transparent 4px, transparent 8px)',
                                }}
                              />
                            )}
                          </>
                        );
                      })()}

                    {/* Spinning wheel at end of green progress - not shown for last slot or single slot */}
                    {mode === 'play' &&
                      isExecuting &&
                      currentPlaybackSlot < slots.length - 1 &&
                      slots.length > 1 &&
                      (() => {
                        const greenProgress =
                          currentPlaybackSlot === 0
                            ? 12.5 + 37.5 / (slots.length - 1) // Full first dashed + half of first solid segment
                            : 12.5 + (currentPlaybackSlot + 0.5) * (75 / (slots.length - 1));

                        return (
                          <div
                            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
                            style={{ left: `${greenProgress}%` }}
                          >
                            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-500">
                              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            </div>
                          </div>
                        );
                      })()}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3 pl-8">
                  {mode === 'read' ? (
                    <>
                      <button
                        onClick={handlePlay}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-pink-500 text-white transition-all hover:scale-110 hover:bg-pink-400"
                        title="Play scenario"
                      >
                        <PlayIcon className="h-6 w-6" />
                      </button>
                      <button
                        onClick={downloadScenario}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-zinc-100 transition-all hover:scale-110 hover:bg-zinc-600"
                        title="Download scenario"
                      >
                        <ArrowDownTrayIcon className="h-5 w-5" />
                      </button>
                    </>
                  ) : currentPlaybackSlot >= slots.length - 1 ? (
                    <>
                      {/* Playback complete - show checkmark and download */}
                      <button
                        onClick={handleComplete}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white transition-all hover:scale-110 hover:bg-green-400"
                        title="Complete - back to read mode"
                      >
                        <CheckIcon className="h-6 w-6" />
                      </button>
                      <button
                        onClick={exportSnapshot}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-700 text-zinc-100 transition-all hover:scale-110 hover:bg-zinc-600"
                        title="Export snapshot"
                      >
                        <ArrowDownTrayIcon className="h-5 w-5" />
                      </button>
                    </>
                  ) : (
                    <>
                      {/* Playback in progress - show step forward and stop */}
                      <button
                        onClick={handleStepForward}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500 text-white transition-all hover:scale-110 hover:bg-green-400"
                        title="Step forward"
                      >
                        <ForwardIcon className="h-6 w-6" />
                      </button>
                      <button
                        onClick={handleStop}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white transition-all hover:scale-110 hover:bg-zinc-900"
                        title="Stop scenario"
                      >
                        <StopIcon className="h-5 w-5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Inspector Pane - Right Side (Play mode only) */}
      {mode === 'play' && (
        <div className="w-[500px] flex-shrink-0 overflow-auto border-l border-zinc-700 bg-zinc-900 px-4 pt-4">
          <TransactionInspector autoStart={true} compact={true} fetchHistorical={false} />
        </div>
      )}
    </div>
  );
}
