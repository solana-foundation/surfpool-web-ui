import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ScenarioDetailOverview from './scenario-detail-overview';
import type { ScenarioBentoItem } from './scenarios-bento.types';

const baseItem: ScenarioBentoItem = {
  id: 'sc-1',
  name: 'Test Scenario',
  description: 'A real description',
  created_at: '2025-06-15T00:00:00Z',
  updated_at: '2025-06-16T00:00:00Z',
  steps: [
    { id: 's1', name: 'Step 1', type: 'slot' },
    { id: 's2', name: 'Step 2', type: 'slot' },
  ],
};

const defaultProps = {
  item: baseItem,
  editingDescription: null as string | null,
  onEditDescription: vi.fn(),
  onUpdateScenario: vi.fn(),
};

describe('ScenarioDetailOverview', () => {
  it('renders total step count', () => {
    render(<ScenarioDetailOverview {...defaultProps} />);
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders 0 steps when steps is undefined', () => {
    render(<ScenarioDetailOverview {...defaultProps} item={{ ...baseItem, steps: undefined }} />);
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('renders created date', () => {
    render(<ScenarioDetailOverview {...defaultProps} />);
    expect(screen.getByText(new Date('2025-06-15T00:00:00Z').toLocaleDateString())).toBeInTheDocument();
  });

  it('renders updated date', () => {
    render(<ScenarioDetailOverview {...defaultProps} />);
    expect(screen.getByText(new Date('2025-06-16T00:00:00Z').toLocaleDateString())).toBeInTheDocument();
  });

  it('shows description text when description is real', () => {
    render(<ScenarioDetailOverview {...defaultProps} />);
    expect(screen.getByText('A real description')).toBeInTheDocument();
  });

  it('shows placeholder when description is a sentinel value', () => {
    render(
      <ScenarioDetailOverview {...defaultProps} item={{ ...baseItem, description: 'No description available' }} />
    );
    expect(screen.getByText('Click to add description...')).toBeInTheDocument();
  });

  it('shows placeholder for "Add a description..." sentinel', () => {
    render(<ScenarioDetailOverview {...defaultProps} item={{ ...baseItem, description: 'Add a description...' }} />);
    expect(screen.getByText('Click to add description...')).toBeInTheDocument();
  });

  it('calls onEditDescription when description text is clicked', () => {
    const onEditDescription = vi.fn();
    render(<ScenarioDetailOverview {...defaultProps} onEditDescription={onEditDescription} />);
    fireEvent.click(screen.getByText('A real description'));
    expect(onEditDescription).toHaveBeenCalledWith('sc-1');
  });

  it('renders textarea when editingDescription matches item id', () => {
    render(<ScenarioDetailOverview {...defaultProps} editingDescription="sc-1" />);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });
});
