import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button, TouchTarget } from './button';

describe('Button', () => {
  it('renders as a button element by default', () => {
    render(<Button>Click me</Button>);
    const button = screen.getByRole('button', { name: /click me/i });
    expect(button).toBeInTheDocument();
  });

  it('renders as a link when href is provided', () => {
    render(<Button href="/test">Go somewhere</Button>);
    const link = screen.getByRole('link', { name: /go somewhere/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/test');
  });

  it('applies primary variant classes by default', () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-[#0a2233]');
    expect(button.className).toContain('text-[#00D4FF]');
  });

  it('applies secondary variant classes', () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-transparent');
    expect(button.className).toContain('text-[#9FA3A4]');
  });

  it('applies ghost variant classes', () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('bg-[#ffffff]');
  });

  it('applies yellow variant classes', () => {
    render(<Button variant="yellow">Yellow</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('text-[#FFB615]');
  });

  it('applies size classes', () => {
    render(<Button size="xl">XL Button</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('p-5');
  });

  it('uses alternate sizing for ghost variant', () => {
    render(<Button variant="ghost" size="lg">Ghost LG</Button>);
    const button = screen.getByRole('button');
    // ghost/white uses ghostWhiteSizes which has different padding
    expect(button.className).toContain('px-5');
  });

  it('applies custom className', () => {
    render(<Button className="my-custom-class">Custom</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('my-custom-class');
  });

  it('includes base styles', () => {
    render(<Button>Styled</Button>);
    const button = screen.getByRole('button');
    expect(button.className).toContain('inline-flex');
    expect(button.className).toContain('font-mono');
    expect(button.className).toContain('uppercase');
  });
});

describe('TouchTarget', () => {
  it('renders children and hidden hit area span', () => {
    render(<TouchTarget>Content</TouchTarget>);
    expect(screen.getByText('Content')).toBeInTheDocument();
    // The hit area span is aria-hidden
    const hiddenSpan = document.querySelector('[aria-hidden="true"]');
    expect(hiddenSpan).toBeInTheDocument();
  });
});
