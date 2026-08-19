import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import GenericBento, { type BentoItem } from './generic-bento';

const existingItem: BentoItem = {
  id: 'existing',
  name: 'Existing scenario',
  description: 'Existing scenario description',
};

const createdItem: BentoItem = {
  id: 'created',
  name: 'Created scenario',
  description: 'Created scenario description',
};

function renderItem(item: BentoItem): ReactNode {
  return <div>{item.name}</div>;
}

function renderDetailHeader(item: BentoItem): ReactNode {
  return <div>Header for {item.id}</div>;
}

function renderDetailContent(item: BentoItem): ReactNode {
  return <div>Details for {item.id}</div>;
}

function renderBento(items: BentoItem[], initialSelectedId?: string) {
  return (
    <GenericBento
      items={items}
      renderItem={renderItem}
      renderDetailHeader={renderDetailHeader}
      renderDetailContent={renderDetailContent}
      initialSelectedId={initialSelectedId}
    />
  );
}

describe('GenericBento deep links', () => {
  it('selects an existing item when its id arrives after the initial render', () => {
    const { rerender } = render(renderBento([createdItem]));

    rerender(renderBento([createdItem], createdItem.id));

    expect(screen.getByText(`Details for ${createdItem.id}`)).toBeInTheDocument();
  });

  it('waits for a deep-linked item that is not loaded yet', () => {
    const { rerender } = render(renderBento([existingItem], createdItem.id));

    expect(screen.queryByText(`Details for ${createdItem.id}`)).not.toBeInTheDocument();

    rerender(renderBento([createdItem], createdItem.id));

    expect(screen.getByText(`Details for ${createdItem.id}`)).toBeInTheDocument();
  });
});
