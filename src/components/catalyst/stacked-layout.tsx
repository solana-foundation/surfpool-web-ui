'use client';

import * as Headless from '@headlessui/react';
import React, { useState, useEffect } from 'react';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from './navbar';
import { CircleStackIcon, IdentificationIcon } from '@heroicons/react/16/solid';
import { Avatar } from './avatar';
import { Button } from './button';
import { Dialog, DialogActions, DialogDescription, DialogTitle } from './dialog';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from './dropdown';
import { ArrowRightStartOnRectangleIcon } from '@heroicons/react/16/solid';
import { useWorkspaceContext } from '@/contexts/workspace-context';
import { MagnifyingGlassIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/solid';
import { CheckBadgeIcon } from '@heroicons/react/24/solid';
import { ShieldCheckIcon } from '@heroicons/react/24/solid';
import { CommandLineIcon, CloudIcon } from '@heroicons/react/24/solid';
import { PaywallDialog } from './paywall-dialog';

function OpenMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M2 6.75C2 6.33579 2.33579 6 2.75 6H17.25C17.6642 6 18 6.33579 18 6.75C18 7.16421 17.6642 7.5 17.25 7.5H2.75C2.33579 7.5 2 7.16421 2 6.75ZM2 13.25C2 12.8358 2.33579 12.5 2.75 12.5H17.25C17.6642 12.5 18 12.8358 18 13.25C18 13.6642 17.6642 14 17.25 14H2.75C2.33579 14 2 13.6642 2 13.25Z" />
    </svg>
  );
}

function CloseMenuIcon() {
  return (
    <svg data-slot="icon" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}



function MobileSidebar({ open, close, children }: React.PropsWithChildren<{ open: boolean; close: () => void }>) {
  return (
    <Headless.Dialog open={open} onClose={close} className="lg:hidden">
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-black/30 transition data-closed:opacity-0 data-enter:duration-300 data-enter:ease-out data-leave:duration-200 data-leave:ease-in"
      />
      <Headless.DialogPanel
        transition
        className="fixed inset-y-0 w-full max-w-80 p-2 transition duration-300 ease-in-out data-closed:-translate-x-full"
      >
        <div className="flex h-full flex-col items-start rounded-lg bg-zinc-900 shadow-xs ring-1 ring-white/10">
          <div className="-mb-3 px-4 pt-3">
            <Headless.CloseButton as={NavbarItem} aria-label="Close navigation">
              <CloseMenuIcon />
            </Headless.CloseButton>
          </div>
          {children}
        </div>
      </Headless.DialogPanel>
    </Headless.Dialog>
  );
}

export function StackedLayout({
  navbar,
  sidebar,
  children,
  path
}: React.PropsWithChildren<{ navbar: React.ReactNode; sidebar: React.ReactNode, path: string }>) {
  let [showSidebar, setShowSidebar] = useState(false);
  let [showCloudDialog, setShowCloudDialog] = useState(false);
  let [plans, setPlans] = useState<any[]>([]);
  let [loading, setLoading] = useState(false);
  let [stars, setStars] = useState<number>(0);

  // Fetch plans and stars proactively when component mounts
  useEffect(() => {
    setLoading(true);
    console.log('Fetching plans and stars...');
    
    // Fetch plans
    fetch('https://cloud.txtx.run/api/subscriptions/plans?origin=studio')
      .then(res => {
        console.log('Plans response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('Plans data:', data);
        setPlans(data.plans || []);
      })
      .catch(err => {
        console.error('Failed to fetch plans:', err);
      });
    
    // Fetch GitHub stars
    fetch('https://api.github.com/repos/txtx/surfpool')
      .then(res => {
        console.log('GitHub response status:', res.status);
        return res.json();
      })
      .then(data => {
        console.log('GitHub data:', data);
        setStars(data.stargazers_count || 0);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch GitHub stars:', err);
        setLoading(false);
      });
  }, []); // Empty dependency array means this runs once when component mounts

  return (
    <div className="relative isolate flex min-h-svh w-full flex-col bg-zinc-900 lg:bg-zinc-950">
      {/* Sidebar on mobile */}
      <MobileSidebar open={showSidebar} close={() => setShowSidebar(false)}>
        {sidebar}
      </MobileSidebar>

      {/* Navbar */}
      <header className="flex items-center px-4">
        <div className="py-2.5 lg:hidden">
          <NavbarItem onClick={() => setShowSidebar(true)} aria-label="Open navigation">
            <OpenMenuIcon />
          </NavbarItem>
        </div>
        <div className="min-w-0 flex-1">
          <Navbar>
            <img src="/assets/txtx.png" alt="Txtx Logo" className="h-5 lg:h-4 lg:ml-4 ml-auto" />
            <NavbarItem href="/" current={path.endsWith('/')} className="max-lg:hidden">
              <CommandLineIcon/>
              Console
            </NavbarItem>
            <NavbarItem href="/subgraphs" current={path.endsWith('/subgraphs')} className="max-lg:hidden">
              <CircleStackIcon />
              Data Indexing
            </NavbarItem>
            <NavbarSpacer />
            <NavbarItem href="#" onClick={() => setShowCloudDialog(true)} className="max-lg:hidden">
              Cloud
              <CloudIcon />
            </NavbarItem>
          </Navbar>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 flex-col pb-2 lg:px-2">
        <div className="bg-zinc-900 grow p-2 lg:rounded-lg lg:p-2 lg:shadow-xs lg:ring-1 lg:ring-white/10">
          <div className="">{children}</div>
        </div>
      </main>
      
      {/* Paywall Dialog */}
      <PaywallDialog 
        open={showCloudDialog} 
        onClose={() => setShowCloudDialog(false)}
        plans={plans}
        loading={loading}
        stars={stars}
      />
    </div>
  );
}
