import { renderWithConfig } from '@/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import AIHeader from './ai-header';

// Polyfill ResizeObserver for headless UI
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
});

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: vi.fn().mockReturnValue({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

// Mock ai-client to avoid actual API calls and localStorage access
vi.mock('@/lib/ai-client', () => ({
  streamAIResponse: vi.fn(),
  getApiKey: vi.fn().mockReturnValue(null),
  setApiKey: vi.fn(),
  AI_PROVIDERS: [
    {
      id: 'ollama',
      name: 'Ollama',
      icon: '/assets/ollama.svg',
      requiresKey: false,
      models: [],
    },
    {
      id: 'groq',
      name: 'Groq',
      icon: '/assets/groq.svg',
      requiresKey: true,
      models: [{ id: 'groq-llama', name: 'Llama 3', description: 'Fast', provider: 'groq' }],
    },
  ],
  DEFAULT_MODEL_ID: 'groq-llama',
  getModelById: vi.fn().mockReturnValue({ id: 'groq-llama', name: 'Llama 3', description: 'Fast', provider: 'groq' }),
  getProviderById: vi.fn().mockReturnValue({ id: 'groq', name: 'Groq', icon: '/assets/groq.svg', requiresKey: true }),
  fetchOllamaStatus: vi.fn().mockResolvedValue({ available: false, models: [] }),
}));

// Mock @headlessui/react to avoid ResizeObserver and React version issues
vi.mock('@headlessui/react', () => ({
  Popover: ({ children, className }: any) => <div className={className}>{children}</div>,
  PopoverButton: ({ children, className, ...props }: any) => (
    <button className={className} {...props}>
      {children}
    </button>
  ),
  PopoverPanel: ({ children }: any) => null, // Panels are hidden by default
  CloseButton: ({ children, as: _as, ...props }: any) => <button {...props}>{children}</button>,
}));

// Mock @surfpool/ui Dialog and Switch to avoid headless UI internals (and its own React copy).
vi.mock('@surfpool/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@surfpool/ui')>();
  return {
    ...actual,
    Dialog: ({ children, open }: any) => (open ? <div data-testid="dialog">{children}</div> : null),
    DialogTitle: ({ children }: any) => <div>{children}</div>,
    DialogBody: ({ children }: any) => <div>{children}</div>,
    DialogActions: ({ children }: any) => <div>{children}</div>,
    Switch: ({ checked, disabled }: any) => <button role="switch" aria-checked={!!checked} disabled={disabled} />,
  };
});

describe('AIHeader', () => {
  it('renders the prompt textarea', () => {
    renderWithConfig(<AIHeader />);
    expect(screen.getByPlaceholderText('Describe a scenario to simulate...')).toBeInTheDocument();
  });

  it('renders all example scenario buttons', () => {
    renderWithConfig(<AIHeader />);
    expect(screen.getByText('Market Crash')).toBeInTheDocument();
    expect(screen.getByText('DEX Arbitrage')).toBeInTheDocument();
    expect(screen.getByText('Liquidation Arbitrage')).toBeInTheDocument();
    expect(screen.getByText('Triangular Arbitrage')).toBeInTheDocument();
    expect(screen.getByText('Fresh Launch')).toBeInTheDocument();
    expect(screen.getByText('Pump Graduation')).toBeInTheDocument();
    expect(screen.getByText('PumpSwap Pool')).toBeInTheDocument();
    expect(screen.getByText('PumpSwap Price Shock')).toBeInTheDocument();
  });

  it('renders example scenarios in a two-row scroller without a native scrollbar', () => {
    renderWithConfig(<AIHeader />);

    const scroller = screen.getByLabelText('Example scenarios');
    expect(scroller).toHaveClass('overflow-x-auto', '[scrollbar-width:none]', '[&::-webkit-scrollbar]:hidden');
    expect(screen.getAllByRole('group', { name: /Example scenarios row/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Scroll example scenarios left' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Scroll example scenarios right' })).toBeInTheDocument();
  });

  it('loads the specialized Pump graduation prompt', () => {
    renderWithConfig(<AIHeader />);

    fireEvent.click(screen.getByText('Pump Graduation'));

    expect((screen.getByPlaceholderText('Describe a scenario to simulate...') as HTMLTextAreaElement).value).toContain(
      'specialized Pump graduation tool'
    );
    expect((screen.getByPlaceholderText('Describe a scenario to simulate...') as HTMLTextAreaElement).value).toContain(
      '<PASTE_TOKEN_MINT_HERE>'
    );
  });

  it('loads an editable PumpSwap price shock prompt for a custom mint', () => {
    renderWithConfig(<AIHeader />);

    fireEvent.click(screen.getByText('PumpSwap Price Shock'));

    const prompt = (screen.getByPlaceholderText('Describe a scenario to simulate...') as HTMLTextAreaElement).value;
    expect(prompt).toContain('<PASTE_TOKEN_MINT_HERE>');
    expect(prompt).toContain('virtualQuoteReserves');
    expect(prompt).toContain('do not build or execute a swap');
  });

  it('renders the model selector button', () => {
    renderWithConfig(<AIHeader />);
    expect(screen.getByLabelText('Select AI model')).toBeInTheDocument();
  });
});
