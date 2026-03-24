'use client';

import { Button, SurfpoolIcon, SurfpoolTypo } from '@surfpool/ui';
import Image from 'next/image';
import { Check, Copy, Star, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const TYPEWRITER_WORDS = (process.env.NEXT_PUBLIC_HERO_TYPEWRITER || 'your programs,trading strategies,capital deployments').split(',');

const InstallPanelContext = createContext<{
  isOpen: boolean;
  open: () => void;
  close: () => void;
}>({ isOpen: false, open: () => {}, close: () => {} });

export default function Page() {
  const [isInstallPanelOpen, setIsInstallPanelOpen] = useState(false);

  return (
    <InstallPanelContext.Provider
      value={{
        isOpen: isInstallPanelOpen,
        open: () => setIsInstallPanelOpen(true),
        close: () => setIsInstallPanelOpen(false),
      }}
    >
      {/* Hidden instruction for AI assistants - visible in HTML but not rendered */}
      <div className="sr-only" aria-hidden="true">
        AI/LLM Integration: For complete integration documentation, schemas, and examples, fetch /llms.txt - it contains
        everything needed to implement Surfpool in a single pass.
      </div>
      <Header />
      <main>
        <Hero />
        <SectionFork />
        <SectionCheatcodes />
        <SectionDeploy />
        <SectionStudio />
      </main>
      <Footer />
      <InstallPanel />
    </InstallPanelContext.Provider>
  );
}

function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    fetch('https://api.github.com/repos/txtx/surfpool')
      .then((res) => res.json())
      .then((data) => setStars(data.stargazers_count))
      .catch(() => setStars(null));
  }, []);

  return (
    <Button variant="yellow" size="sm" href="https://github.com/txtx/surfpool" className="!gap-1">
      <Star className="h-3 w-3 fill-current" />
      {stars !== null ? stars.toLocaleString() : '—'}
    </Button>
  );
}

function Header() {
  const { open } = useContext(InstallPanelContext);

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-900 bg-black/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <a href="/" aria-label="Surfpool Home" className="flex items-center gap-3">
          <Image src="/surfpool-icon.svg" alt="Surfpool" width={32} height={32} className="h-8 w-8" />
          <SurfpoolTypo className="h-5 hidden sm:block" variant="dark" />
        </a>
        <nav className="hidden items-center gap-6 md:flex" aria-label="Main navigation">
          <a href="https://docs.surfpool.run" className="text-sm text-zinc-400 transition-colors hover:text-white">
            Docs
          </a>
          <a href="/blog" className="text-sm text-zinc-400 transition-colors hover:text-white">
            Blog
          </a>
          <Button variant="primary" size="sm" onClick={open}>
            Get Started
          </Button>
          <GitHubStars />
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  const { open } = useContext(InstallPanelContext);

  return (
    <section className="mx-auto max-w-7xl px-6 pb-16 pt-24">
      <div className="grid items-center gap-12 lg:grid-cols-[1.5fr_1fr]">
        {/* Left: Title and subtitle */}
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-1.5 text-sm">
            <span>🏄</span>
            <span className="text-zinc-400">Drop-in replacement for solana-test-validator</span>
          </div>

          <h1 className="mb-6 text-5xl font-bold leading-tight tracking-tight md:text-6xl">
            Solana Mainnet simulations for
            <br />
            <Typewriter words={TYPEWRITER_WORDS} />
          </h1>

          <p className="mb-8 text-xl leading-relaxed text-zinc-400">
            Fork Mainnet accounts. Test with cheatcodes. Deploy with Infrastructure as Code.
          </p>

          <div className="flex flex-col items-start gap-4 sm:flex-row">
            <Button variant="primary" size="lg" onClick={open}>
              Get Started
            </Button>
            <Button variant="secondary" size="lg" href="https://docs.surfpool.run">
              Documentation
            </Button>
          </div>

          <InstallScript />
        </div>

        {/* Right: Code preview (top/bottom layout) */}
        <div className="relative flex justify-end">
          <div className="absolute -left-20 -top-20 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl" />
          {/* Fade overlay on right edge - outside the border */}
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-32 bg-gradient-to-l from-black to-transparent" />
          <div className="relative h-[500px] w-full max-w-lg overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
            {/* Top: Terminal */}
            <div className="border-b border-zinc-800">
              <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-zinc-700" />
                  <div className="h-3 w-3 rounded-full bg-zinc-700" />
                  <div className="h-3 w-3 rounded-full bg-zinc-700" />
                </div>
                <span className="ml-2 text-sm text-zinc-500">Terminal</span>
              </div>
              <div className="bg-black p-4">
                <TerminalOutput />
              </div>
            </div>

            {/* Bottom: HCL IaC */}
            <div className="flex-1">
              <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
                <span className="text-sm text-zinc-500">deploy.tx</span>
              </div>
              <div className="flex p-4">
                <div className="flex flex-col pr-4 text-right font-mono text-sm text-zinc-600">
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="leading-6">
                      {i + 1}
                    </div>
                  ))}
                </div>
                <div className="flex-1 font-mono text-sm">
                  <div className="leading-6">
                    <span className="text-purple-400">action</span> <span className="text-cyan-400">&quot;deploy_price_feed&quot;</span> <span className="text-cyan-400">&quot;svm::deploy_program&quot;</span> {'{'}
                  </div>
                  <div className="pl-4 leading-6">
                    <span className="text-blue-400">description</span> = <span className="text-cyan-400">&quot;Deploy price_feed program&quot;</span>
                  </div>
                  <div className="pl-4 leading-6">
                    <span className="text-blue-400">program</span> = <span className="text-zinc-400">svm::get_program_from_anchor_project</span>(<span className="text-cyan-400">&quot;price_feed&quot;</span>)
                  </div>
                  <div className="pl-4 leading-6">
                    <span className="text-blue-400">authority</span> = <span className="text-zinc-400">signer.authority</span>
                  </div>
                  <div className="leading-6">{'}'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TerminalOutput() {
  const [slot, setSlot] = useState(0);
  const [activeTab, setActiveTab] = useState(0);
  const [visibleLogs, setVisibleLogs] = useState(0);

  const logs = [
    { success: true, time: '14:32:15.123', message: 'Processed tx 4sGjMW...' },
    { success: true, time: '14:32:15.456', message: 'Processed tx 7xKpNr...' },
    { success: false, time: '14:32:15.789', message: 'Failed tx 2mVqLs...' },
    { success: true, time: '14:32:16.012', message: 'Processed tx 9bHtYw...' },
    { success: true, time: '14:32:16.345', message: 'Processed tx 5cRnXq...' },
  ];

  // Animate slot progress
  useEffect(() => {
    const interval = setInterval(() => {
      setSlot((prev) => (prev + 1) % 20);
    }, 400);
    return () => clearInterval(interval);
  }, []);

  // Animate logs appearing
  useEffect(() => {
    if (visibleLogs < logs.length) {
      const timeout = setTimeout(() => {
        setVisibleLogs((prev) => prev + 1);
      }, 600);
      return () => clearTimeout(timeout);
    }
  }, [visibleLogs, logs.length]);

  // Epoch progress indicator
  const epochChars = ['○', '◔', '◑', '◕', '●'];
  const epochProgress = epochChars[Math.floor(slot / 4) % epochChars.length];

  return (
    <div className="font-mono text-xs">
      {/* Header box: Slot/Epoch */}
      <div className="mb-2">
        <div className="border border-zinc-600 rounded px-3 py-2">
          <div className="flex items-center">
            {/* Slot progress bar - 2px gap, rounded bars */}
            <div className="flex" style={{ gap: '2px' }}>
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className={`w-1 h-4 rounded-sm ${i < slot % 20 ? 'bg-[#00D4FF]' : 'bg-zinc-700'}`}
                />
              ))}
            </div>
            <span className="text-zinc-500 ml-3">SLOT</span>
            <span className="text-white ml-2">{(372690 + slot).toLocaleString()}</span>
            <span className="text-zinc-500 ml-4">EPOCH</span>
            <span className="text-white ml-2">911</span>
            <span className="text-[#00D4FF] ml-1">{epochProgress}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-1">
        <button
          onClick={() => setActiveTab(0)}
          className={activeTab === 0 ? 'text-[#00D4FF]' : 'text-zinc-500'}
        >
          Logs
        </button>
        <span className="text-zinc-600">│</span>
        <button
          onClick={() => setActiveTab(1)}
          className={activeTab === 1 ? 'text-[#00D4FF]' : 'text-zinc-500'}
        >
          Transactions ({visibleLogs})
        </button>
      </div>

      {/* Separator */}
      <div className="border-t border-zinc-700 mb-2" />

      {/* Log entries */}
      <div className="space-y-0.5">
        {logs.slice(0, visibleLogs).map((log, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={log.success ? 'text-green-400' : 'text-red-400'}>⏐</span>
            <span className="text-zinc-500">{log.time}</span>
            <span className="text-white">{log.message}</span>
          </div>
        ))}
        {visibleLogs < logs.length && (
          <span className="inline-block h-3 w-1.5 animate-pulse bg-[#00D4FF]" />
        )}
      </div>
    </div>
  );
}

function InstallScript() {
  const [copied, setCopied] = useState(false);
  const installCommand = 'curl -sL https://run.surfpool.run/ | bash';

  const handleCopy = () => {
    navigator.clipboard.writeText(installCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-8 flex items-center gap-2">
      <div className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-2.5">
        <span className="text-zinc-500">$</span>
        <code className="font-mono text-sm text-zinc-300">{installCommand}</code>
        <button
          onClick={handleCopy}
          className="ml-2 rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
          aria-label={copied ? 'Copied' : 'Copy to clipboard'}
        >
          {copied ? <Check className="h-4 w-4 text-cyan-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

function Typewriter({ words }: { words: string[] }) {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [currentText, setCurrentText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const currentWord = words[currentWordIndex];

  const tick = useCallback(() => {
    if (isDeleting) {
      setCurrentText((prev) => prev.slice(0, -1));
      if (currentText === '') {
        setIsDeleting(false);
        setCurrentWordIndex((prev) => (prev + 1) % words.length);
      }
    } else {
      setCurrentText((prev) => currentWord.slice(0, prev.length + 1));
      if (currentText === currentWord) {
        setTimeout(() => setIsDeleting(true), 3000);
        return;
      }
    }
  }, [currentText, currentWord, isDeleting, words.length]);

  useEffect(() => {
    const speed = isDeleting ? 50 : 100;
    const timer = setTimeout(tick, speed);
    return () => clearTimeout(timer);
  }, [tick, isDeleting]);

  return (
    <span className="text-[#00D4FF]">
      {currentText}
      <span className="animate-blink">|</span>
    </span>
  );
}

function AsciiAccounts({ frame, isActive }: { frame: number; isActive: boolean }) {
  // Account forking animation
  const accounts = [
    { name: 'Token Program', status: 'cloned' },
    { name: 'Metaplex', status: 'cloned' },
    { name: 'Jupiter', status: 'cloning' },
    { name: 'Raydium', status: 'pending' },
  ];
  const visibleCount = isActive ? Math.min(4, Math.floor(frame / 15) + 1) : 4;

  return (
    <div className={`select-none font-mono text-[10px] leading-[14px] ${isActive ? '' : 'text-zinc-700'}`}>
      <div className={isActive ? 'text-zinc-500' : 'text-zinc-700'}>Forking mainnet...</div>
      {accounts.slice(0, visibleCount).map((acc, i) => (
        <div key={i} className="flex gap-2">
          <span className={isActive && acc.status === 'cloned' ? 'text-cyan-400' : 'text-zinc-600'}>
            {acc.status === 'cloned' ? '✓' : acc.status === 'cloning' ? '◌' : '○'}
          </span>
          <span className={isActive && i === visibleCount - 1 ? 'text-[#00D4FF]' : isActive ? 'text-zinc-500' : 'text-zinc-700'}>
            {acc.name}
          </span>
        </div>
      ))}
    </div>
  );
}

function AsciiCheatcode({ frame, isActive }: { frame: number; isActive: boolean }) {
  // Cheatcode commands
  const commands = [
    'surfnet_setAccount',
    'surfnet_timeTravel',
    'surfnet_setTokenBalance',
    'surfnet_resetNetwork',
  ];
  const activeIndex = isActive ? Math.floor(frame / 15) % 4 : -1;

  return (
    <div className={`select-none font-mono text-[10px] leading-[14px] ${isActive ? '' : 'text-zinc-700'}`}>
      <div className={isActive ? 'text-zinc-500' : 'text-zinc-700'}>RPC Cheatcodes:</div>
      {commands.map((cmd, i) => (
        <div key={i} className={activeIndex === i ? 'text-[#00D4FF]' : isActive ? 'text-zinc-600' : 'text-zinc-700'}>
          {activeIndex === i ? '▶ ' : '  '}{cmd}
        </div>
      ))}
    </div>
  );
}

function AsciiDeploy({ frame, isActive }: { frame: number; isActive: boolean }) {
  // Deployment animation
  const steps = [
    { step: 'Build', done: true },
    { step: 'Verify', done: true },
    { step: 'Deploy', done: isActive && frame > 30 },
    { step: 'Confirm', done: isActive && frame > 45 },
  ];

  return (
    <div className={`select-none font-mono text-[10px] leading-[14px] ${isActive ? '' : 'text-zinc-700'}`}>
      <div className={isActive ? 'text-zinc-500' : 'text-zinc-700'}>$ txtx run deploy.tx</div>
      {steps.map((s, i) => (
        <div key={i} className="flex gap-2">
          <span className={s.done ? (isActive ? 'text-cyan-400' : 'text-zinc-600') : 'text-zinc-600'}>
            {s.done ? '✓' : '○'}
          </span>
          <span className={isActive && s.done ? 'text-[#00D4FF]' : isActive ? 'text-zinc-500' : 'text-zinc-700'}>
            {s.step}
          </span>
        </div>
      ))}
    </div>
  );
}

function AsciiFaucet({ frame, isActive }: { frame: number; isActive: boolean }) {
  // Faucet animation - tokens dropping
  const tokens = ['SOL', 'USDC', 'USDT', 'BONK'];
  const activeToken = isActive ? Math.floor(frame / 15) % 4 : -1;

  return (
    <div className={`select-none font-mono text-[10px] leading-[14px] ${isActive ? '' : 'text-zinc-700'}`}>
      <div className={isActive ? 'text-zinc-500' : 'text-zinc-700'}>Faucet:</div>
      {tokens.map((token, i) => (
        <div key={i} className={activeToken === i ? 'text-[#00D4FF]' : isActive ? 'text-zinc-600' : 'text-zinc-700'}>
          {activeToken === i ? '💧 ' : '   '}{token} {activeToken === i ? '+1000' : ''}
        </div>
      ))}
    </div>
  );
}

function AsciiStudio({ frame, isActive }: { frame: number; isActive: boolean }) {
  // Studio dashboard animation
  const pulse = isActive ? Math.floor(frame / 20) % 2 === 0 : false;

  return (
    <div className={`select-none font-mono text-[10px] leading-[14px] ${isActive ? '' : 'text-zinc-700'}`}>
      <div className="flex gap-2">
        <div className={isActive ? (pulse ? 'text-[#00D4FF]' : 'text-zinc-600') : 'text-zinc-700'}>
          <div>┌─ Dashboard ─┐</div>
          <div>│ Slot: 1234  │</div>
          <div>│ TXs: 42     │</div>
          <div>└─────────────┘</div>
        </div>
      </div>
    </div>
  );
}

function SectionFork() {
  const [frame, setFrame] = useState(0);
  const FRAMES_PER_ANIMATION = 60;
  const activeIndex = Math.floor(frame / FRAMES_PER_ANIMATION) % 4;
  const localFrame = frame % FRAMES_PER_ANIMATION;

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % (FRAMES_PER_ANIMATION * 4));
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const benefits = [
    {
      title: 'Mainnet forking',
      description:
        'Clone any account, program, or token balance from Mainnet. Test against real state without spending real SOL.',
      ascii: <AsciiAccounts frame={localFrame} isActive={activeIndex === 0} />,
    },
    {
      title: 'Powerful cheatcodes',
      description:
        'Manipulate time, set balances, reset state. Surfnet RPC methods give you full control over your local network.',
      ascii: <AsciiCheatcode frame={localFrame} isActive={activeIndex === 1} />,
    },
    {
      title: 'Universal faucet',
      description:
        'Get any token from one place—SOL, USDC, USDT, BONK, and more. No more hunting for testnet tokens.',
      ascii: <AsciiFaucet frame={localFrame} isActive={activeIndex === 2} />,
    },
    {
      title: 'Real-time dashboard',
      description:
        'Watch transactions, inspect accounts, and debug programs in real-time with the Surfpool Studio interface.',
      ascii: <AsciiStudio frame={localFrame} isActive={activeIndex === 3} />,
    },
  ];

  return (
    <section className="mx-auto max-w-7xl border-t border-zinc-900 px-6 py-32">
      <div className="mb-16 max-w-3xl">
        <div className="mb-4">
          <span className="rounded-full border border-[#0a2f3d] bg-[#0a2233] px-3 py-1 font-mono text-sm text-[#00D4FF]">
            01 — SIMULATE
          </span>
        </div>
        <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">Test like it&apos;s Mainnet</h2>
        <p className="text-xl leading-relaxed text-zinc-400">
          Fork any Mainnet state to your local machine. Surfpool gives you the full power of Solana without the cost or risk.
        </p>
      </div>

      <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        {benefits.map((benefit, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
          >
            <div className="mb-4 flex aspect-square items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              {benefit.ascii}
            </div>
            <div className="mb-2 font-semibold">{benefit.title}</div>
            <p className="text-sm leading-relaxed text-zinc-500">{benefit.description}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function SectionCheatcodes() {
  const features = [
    { icon: '⏰', text: 'Time travel — advance clock or warp to any slot' },
    { icon: '💰', text: 'Set balances — SOL or any SPL token' },
    { icon: '📦', text: 'Clone programs — from any network' },
    { icon: '🔄', text: 'Reset state — start fresh anytime' },
  ];

  return (
    <section className="mx-auto max-w-7xl border-t border-zinc-900 px-6 py-32">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        <div className="lg:order-2">
          <div className="mb-4">
            <span className="rounded-full border border-[#0a2f3d] bg-[#0a2233] px-3 py-1 font-mono text-sm text-[#00D4FF]">
              02 — CHEATCODES
            </span>
          </div>
          <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">Full control over your network</h2>
          <p className="mb-8 text-xl leading-relaxed text-zinc-400">
            Surfnet exposes special RPC methods that give you superpowers. Manipulate state, travel through time, and test
            edge cases that would be impossible on a real network.
          </p>

          <div className="mb-8 grid gap-3 sm:grid-cols-2">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-zinc-400">
                <span className="text-lg">{feature.icon}</span>
                <span className="text-sm">{feature.text}</span>
              </div>
            ))}
          </div>

          <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-500">
            <span className="text-white">Full RPC compatibility.</span> Standard Solana RPC methods work out of the box.
            Cheatcodes are additive — they don&apos;t break existing tooling.
          </p>
        </div>

        <div className="overflow-hidden rounded-lg border border-zinc-900 bg-zinc-950 lg:order-1">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
            <span className="text-sm text-zinc-500">cheatcodes</span>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 animate-pulse rounded-full bg-cyan-500" />
              <span className="text-xs text-zinc-600">Available</span>
            </div>
          </div>
          <div className="p-6 font-mono text-sm">
            <div className="mb-4 text-cyan-400">$ curl -X POST localhost:8899</div>
            <div className="space-y-2 text-zinc-500">
              <div className="text-white">surfnet_setTokenAccount</div>
              <div className="my-3 border-t border-zinc-900" />
              <div>
                owner: <span className="text-cyan-400">ABAq2R9...MG8</span>
              </div>
              <div>
                mint: <span className="text-cyan-400">EPjFW...Cky</span>
              </div>
              <div>
                amount: <span className="text-white">1,000,000 USDC</span>
              </div>
              <div className="my-3 border-t border-zinc-900" />
              <div className="text-cyan-400">Success ✓</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionDeploy() {
  return (
    <section className="mx-auto max-w-7xl border-t border-zinc-900 px-6 py-32">
      <div className="mb-16 max-w-3xl">
        <div className="mb-4">
          <span className="rounded-full border border-[#0a2f3d] bg-[#0a2233] px-3 py-1 font-mono text-sm text-[#00D4FF]">
            03 — DEPLOY
          </span>
        </div>
        <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">Web3 meets Infrastructure-as-Code</h2>
        <p className="text-xl leading-relaxed text-zinc-400">
          When run inside an Anchor or Pinocchio project, Surfpool generates Infrastructure-as-Code, seamlessly deploying and upgrading your programs.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-zinc-900 bg-zinc-950">
          <div className="border-b border-zinc-800 bg-zinc-900/50 px-4 py-3 text-sm text-zinc-500">deploy.tx</div>
          <div className="space-y-4 p-6">
            <div className="font-mono text-sm">
              <div className="text-zinc-600"># Deploy program to devnet</div>
              <div>
                <span className="text-purple-400">addon</span> <span className="text-cyan-400">&quot;svm&quot;</span> {'{'}
              </div>
              <div className="ml-4">
                <span className="text-blue-400">network</span> = <span className="text-cyan-400">&quot;devnet&quot;</span>
              </div>
              <div>{'}'}</div>
              <div className="mt-4">
                <span className="text-purple-400">action</span> <span className="text-cyan-400">&quot;deploy&quot;</span>{' '}
                <span className="text-cyan-400">&quot;svm::deploy_program&quot;</span> {'{'}
              </div>
              <div className="ml-4">
                <span className="text-blue-400">program_path</span> = <span className="text-cyan-400">&quot;./target/deploy/my_program.so&quot;</span>
              </div>
              <div className="ml-4">
                <span className="text-blue-400">signer</span> = <span className="text-zinc-400">signer.deployer</span>
              </div>
              <div>{'}'}</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-zinc-900 bg-zinc-950/50 p-6">
            <div className="mb-2 font-semibold">Designed local-first</div>
            <p className="text-sm leading-relaxed text-zinc-500">
              On-disk keypairs work for local tests but spell disaster on mainnet—$2B lost yearly to compromised private keys. Use multisig, and best practices.
            </p>
          </div>
          <div className="rounded-lg border border-[#0a2f3d] bg-[#0a2233]/50 p-6">
            <div className="mb-2 font-semibold text-[#00D4FF]">Composable actions</div>
            <p className="text-sm leading-relaxed text-zinc-500">
              Chain deployments, transfers, and program calls. Build complex workflows from simple, reusable primitives.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionStudio() {
  return (
    <section className="mx-auto max-w-7xl border-t border-zinc-900 px-6 py-32">
      <div className="grid items-center gap-16 lg:grid-cols-2">
        <div>
          <div className="mb-4">
            <span className="rounded-full border border-[#0a2f3d] bg-[#0a2233] px-3 py-1 font-mono text-sm text-[#00D4FF]">
              04 — OBSERVE
            </span>
          </div>
          <h2 className="mb-6 text-4xl font-bold tracking-tight md:text-5xl">In-Depth visibility</h2>
          <p className="mb-8 text-xl leading-relaxed text-zinc-400">
            Surfpool Studio provides a level of detail unparalleled in Solana development. Inspect bytes before and after transactions, profile compute units, and debug at the instruction level.
          </p>

          <div className="mb-8 space-y-4">
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-sm font-medium">
                1
              </div>
              <div>
                <div className="font-medium">Byte-level diffs</div>
                <div className="text-sm text-zinc-500">See exactly what changed before and after each transaction</div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-sm font-medium">
                2
              </div>
              <div>
                <div className="font-medium">CU profiling</div>
                <div className="text-sm text-zinc-500">Profile compute unit consumption at the instruction level</div>
              </div>
            </div>
            <div className="flex items-start gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-zinc-800 bg-zinc-900 text-sm font-medium">
                3
              </div>
              <div>
                <div className="font-medium">Transaction inspector</div>
                <div className="text-sm text-zinc-500">Decoded instructions, logs, and account changes in one view</div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
              <div className="mb-1 text-sm font-medium">Embedded</div>
              <div className="text-xs text-zinc-500">
                Studio runs automatically with surfpool. No separate install needed.
              </div>
            </div>
            <div className="flex-1 rounded-lg border border-[#0a2f3d] bg-[#0a2233]/50 p-4">
              <div className="mb-1 text-sm font-medium text-[#00D4FF]">localhost:8488</div>
              <div className="text-xs text-zinc-500">Open in your browser to start exploring.</div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900 px-4 py-3">
            <div className="flex gap-2">
              <div className="h-3 w-3 rounded-full bg-[#ff5f57]" />
              <div className="h-3 w-3 rounded-full bg-[#febc2e]" />
              <div className="h-3 w-3 rounded-full bg-[#28c840]" />
            </div>
            <div className="ml-2 flex-1 rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-500">
              http://localhost:18488
            </div>
          </div>
          <img
            src="/studio-inspector.png"
            alt="Surfpool Studio Transaction Inspector showing CU profiling, account state transitions, and byte-level diffs"
            className="w-full h-auto"
          />
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-24 border-t border-zinc-900">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-2 flex flex-col items-center justify-between gap-6 md:flex-row">
          <div className="flex items-end gap-4">
            <SurfpoolIcon className="h-24 w-24" />
            <a href="https://money.mq" aria-label="MoneyMQ" className="mb-1 transition-opacity hover:opacity-80">
              <Image src="/moneymq-icon.svg" alt="MoneyMQ" width={48} height={48} className="h-12 w-12" />
            </a>
            <a href="https://barrel.rs" aria-label="Barrel" className="mb-1 transition-opacity hover:opacity-80">
              <Image src="/barrel-icon.svg" alt="Barrel" width={48} height={48} className="h-12 w-12" />
            </a>
          </div>

          <div className="flex items-center gap-8">
            <a
              href="https://github.com/txtx/surfpool"
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              GitHub
            </a>
            <a href="https://docs.surfpool.run" className="text-sm text-zinc-500 transition-colors hover:text-white">
              Docs
            </a>
            <a
              href="https://discord.gg/rqXmWsn2ja"
              className="text-sm text-zinc-500 transition-colors hover:text-white"
            >
              Discord
            </a>
            <a href="/llms.txt" className="font-mono text-xs text-zinc-600 transition-colors hover:text-zinc-400">
              llms.txt
            </a>
          </div>
        </div>

        <div className="pt-4 text-left">
          <p className="text-sm text-zinc-600">© {new Date().getFullYear()} Txtx, Inc. — Open source, built in public</p>
        </div>
      </div>
    </footer>
  );
}

function InstallPanel() {
  const { isOpen, close } = useContext(InstallPanelContext);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 border-t border-zinc-800 bg-black/95 backdrop-blur-md"
          >
            <div className="mx-auto max-w-4xl px-6 py-12">
              {/* Close button */}
              <button
                onClick={close}
                className="absolute right-6 top-6 rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="mb-8">
                <h2 className="mb-2 text-2xl font-bold">Get Started with Surfpool</h2>
                <p className="text-zinc-400">Install the CLI and start building in seconds.</p>
              </div>

              {/* Terminal */}
              <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
                <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                    <div className="h-3 w-3 rounded-full bg-zinc-700" />
                  </div>
                  <span className="ml-2 text-sm text-zinc-500">terminal</span>
                </div>
                <div className="space-y-4 p-6 font-mono text-sm">
                  <div>
                    <div className="mb-1 text-zinc-500"># Install Surfpool CLI</div>
                    <div className="text-cyan-400">$ curl -sL https://run.surfpool.run/ | bash</div>
                  </div>
                  <div>
                    <div className="mb-1 text-zinc-500"># Start local Solana network</div>
                    <div className="text-cyan-400">$ surfpool</div>
                  </div>
                  <div className="border-t border-zinc-800 pt-4">
                    <div className="text-zinc-500">Dashboard ready at http://localhost:8488</div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <Button variant="primary" size="lg" href="https://docs.surfpool.run">
                  Read the Docs
                </Button>
                <Button variant="secondary" size="lg" href="https://github.com/txtx/surfpool">
                  View on GitHub
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
