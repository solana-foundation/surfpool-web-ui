import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import 'pretty-json-custom-element';
import {
  extractProgramData,
  formatHexDump,
  getHexData,
  getHexDataForUpdates,
  hasJsonData,
} from '@/lib/transaction-inspector-utils';
import { DataComparison, DataDisplay } from './transaction-inspector-components';

beforeAll(() => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(cleanup);

const props = {
  address: 'inspected-account',
  getAccountViewMode: () => 'parsed',
  extractProgramData,
  getHexData,
  getHexDataForUpdates,
  hasJsonData,
  isDragOver: {},
  droppedIdl: {},
  handleDragOver: vi.fn(),
  handleDragLeave: vi.fn(),
  handleDrop: vi.fn(),
  registerIdl: vi.fn(),
  toggleAccountViewMode: vi.fn(),
  renderJsonDiff: vi.fn(),
  renderUnifiedJsonDiff: vi.fn(),
  copyToClipboard: vi.fn(),
  copiedStates: {},
};

const payload = '</pretty-json><img src=x onerror="alert(1)"><svg onload="alert(2)"></svg>&lt;tag&gt; & text';
const json = { nested: { message: payload }, count: 7 };
const accountData = [
  ['base64 bytes', [btoa(JSON.stringify(json)), 'base64']],
  ['json field', { json }],
  ['parsed programData', { parsed: { info: { programData: json } } }],
] as const;

for (const component of ['DataDisplay', 'DataComparison']) {
  describe(`${component} account text`, () => {
    const view = (data: unknown, mode = 'parsed') => component === 'DataDisplay'
      ? <DataDisplay {...props} data={data} getAccountViewMode={() => mode} />
      : <DataComparison {...props} beforeData={data} afterData={data} getAccountViewMode={() => mode} />;

    for (const [name, data] of accountData) {
      it(`renders ${name} as exact text, not account-supplied elements`, () => {
        const { container } = render(view(data));
        expect(container.querySelector('img, svg, script, [onerror], [onload]')).toBeNull();
        const pretty = container.querySelector('pretty-json')!;
        expect(pretty).not.toBeNull();
        expect(pretty.childElementCount).toBe(0);
        expect(JSON.parse(pretty.textContent!)).toEqual(json);
        const nested = pretty.shadowRoot!.querySelector('pretty-json')!;
        expect(nested.shadowRoot!.querySelector('.string')!.textContent).toBe(JSON.stringify(payload));
        expect(nested.shadowRoot!.querySelector('img, script, [onerror], [onload]')).toBeNull();
      });
    }

    it('keeps real pretty-json formatting, nested expansion and unchanged rerenders', () => {
      const data = { json: { nested: { value: 'normal <value> & literal &lt;' }, count: 7 } };
      const { container, rerender } = render(view(data));
      const pretty = container.querySelector<HTMLElement>('pretty-json')!;
      expect(pretty.getAttribute('expand')).toBe('2');
      expect(pretty.className).toBe('font-mono text-xs');
      expect(pretty.style.getPropertyValue('--key-color')).toBe('#60a5fa');
      expect(pretty.shadowRoot!.querySelector('.number')!.textContent).toBe('7');
      const nested = pretty.shadowRoot!.querySelector('pretty-json')!;
      expect(nested.shadowRoot!.querySelector('.string')!.textContent).toBe('"normal <value> & literal &lt;"');
      fireEvent.click(nested.shadowRoot!.querySelector('.key')!);
      expect(nested.getAttribute('expand')).toBe('0');
      expect(nested.shadowRoot!.querySelector('.string')).toBeNull();
      rerender(view(data));
      expect(container.querySelector('pretty-json')).toBe(pretty);
      expect(nested.getAttribute('expand')).toBe('0');
      fireEvent.click(nested.shadowRoot!.querySelector('.ellipsis')!);
      expect(nested.shadowRoot!.querySelector('.string')!.textContent).toBe('"normal <value> & literal &lt;"');
    });

    it('updates text when account data changes', () => {
      const { container, rerender } = render(view({ json: { value: 'first' } }));
      rerender(view({ json: { value: '<second> & literal &gt;' } }));
      const pretty = container.querySelector('pretty-json')!;
      expect(JSON.parse(pretty.textContent!)).toEqual({ value: '<second> & literal &gt;' });
      expect(pretty.shadowRoot!.querySelector('.string')!.textContent).toBe('"<second> & literal &gt;"');
    });

    it('does not turn malformed base64 fallback text into markup in hex mode', () => {
      const data = ['<img src=x onerror="alert(1)">', 'base64'];
      const { container } = render(view(data, 'hex'));
      expect(container.querySelector('img, [onerror]')).toBeNull();
      expect(container.textContent).toContain(data[0]);
    });
  });
}

describe('hex account text', () => {
  it('escapes decoded raw bytes at the real DataDisplay hex sink', () => {
    const raw = '<img src=x> &lt;';
    const { container } = render(
      <DataDisplay {...props} data={[btoa(raw), 'base64']} getAccountViewMode={() => 'hex'} />
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.text-gray-400')!.textContent).toBe(`|${raw}|`);
  });

  it.each([
    ['formatter', (raw: string) => formatHexDump(raw)],
    ['base64 bytes', (raw: string) => getHexData([btoa(raw), 'base64'])],
    ['byte array', (raw: string) => getHexData(Array.from(raw, char => char.charCodeAt(0)))],
    ['bytes field', (raw: string) => getHexData({ bytes: Array.from(raw, char => char.charCodeAt(0)) })],
  ])('preserves literal ASCII and styled hex for %s', (_name, format) => {
    const raw = '<b>x</b>&lt;&';
    const root = document.createElement('div');
    root.innerHTML = format(raw);
    expect(root.querySelector('b')).toBeNull();
    expect(root.querySelector('.text-gray-400')!.textContent).toBe(`|${raw}|`);
    expect(root.querySelector('.hex-grid span')!.textContent).toBe('3C');
  });
});
