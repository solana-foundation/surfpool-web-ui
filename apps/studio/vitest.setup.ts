import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Mock navigator.clipboard for component tests that use copy functionality
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
  },
  writable: true,
});
