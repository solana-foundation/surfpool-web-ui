import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ScenarioCard from './scenario-card';
import type { ScenarioBentoItem } from './scenarios-bento.types';

const baseItem: ScenarioBentoItem = {
  id: 'sc-1',
  name: 'My Scenario',
  description: 'A cool scenario',
  steps: [
    {
      id: 'step-1',
      name: 'Step 1',
      type: 'slot',
      actions: [
        { protocolId: 'pyth', actionId: 'price', protocol: 'Pyth', action: 'Update Price' },
        { protocolId: 'raydium', actionId: 'swap', protocol: 'Raydium', action: 'Swap' },
      ],
    },
  ],
};

describe('ScenarioCard', () => {
  it('renders the scenario name', () => {
    render(<ScenarioCard item={baseItem} isSelected={false} />);
    expect(screen.getByText('My Scenario')).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<ScenarioCard item={baseItem} isSelected={false} />);
    expect(screen.getByText('A cool scenario')).toBeInTheDocument();
  });

  it('hides description when it equals "No description available"', () => {
    const item = { ...baseItem, description: 'No description available' };
    render(<ScenarioCard item={item} isSelected={false} />);
    expect(screen.queryByText('No description available')).not.toBeInTheDocument();
  });

  it('hides description when it equals "Add a description..."', () => {
    const item = { ...baseItem, description: 'Add a description...' };
    render(<ScenarioCard item={item} isSelected={false} />);
    expect(screen.queryByText('Add a description...')).not.toBeInTheDocument();
  });

  it('hides description when it equals "null"', () => {
    const item = { ...baseItem, description: 'null' };
    render(<ScenarioCard item={item} isSelected={false} />);
    expect(screen.queryByText('null')).not.toBeInTheDocument();
  });

  it('renders protocol icons for actions', () => {
    render(<ScenarioCard item={baseItem} isSelected={false} />);
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('alt', 'Pyth');
    expect(images[1]).toHaveAttribute('alt', 'Raydium');
  });

  it('shows overflow indicator when more than 3 actions in a slot', () => {
    const item: ScenarioBentoItem = {
      ...baseItem,
      steps: [
        {
          id: 'step-1',
          name: 'Step 1',
          type: 'slot',
          actions: [
            { protocolId: 'pyth', actionId: 'a1', protocol: 'Pyth', action: 'A1' },
            { protocolId: 'raydium', actionId: 'a2', protocol: 'Raydium', action: 'A2' },
            { protocolId: 'kamino', actionId: 'a3', protocol: 'Kamino', action: 'A3' },
            { protocolId: 'drift', actionId: 'a4', protocol: 'Drift', action: 'A4' },
          ],
        },
      ],
    };
    render(<ScenarioCard item={item} isSelected={false} />);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('renders empty slot placeholder when step has no actions', () => {
    const item: ScenarioBentoItem = {
      ...baseItem,
      steps: [{ id: 'step-1', name: 'Empty', type: 'slot', actions: [] }],
    };
    render(<ScenarioCard item={item} isSelected={false} />);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('renders with no slots when steps is undefined', () => {
    const item: ScenarioBentoItem = { ...baseItem, steps: undefined };
    const { container } = render(<ScenarioCard item={item} isSelected={false} />);
    expect(screen.getByText('My Scenario')).toBeInTheDocument();
    // No slot elements rendered
    expect(container.querySelectorAll('[title]')).toHaveLength(0);
  });
});
