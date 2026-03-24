'use client';

import { Avatar } from '@surfpool/ui';
import { Button } from '@surfpool/ui';
import { Dialog, DialogActions, DialogDescription, DialogTitle } from '@surfpool/ui';
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from '@surfpool/ui';
import { Navbar, NavbarItem, NavbarSection, NavbarSpacer } from '@surfpool/ui';
import { Sidebar, SidebarBody, SidebarHeader, SidebarItem, SidebarSection } from '@surfpool/ui';
import { StackedLayout } from '@/components/catalyst/stacked-layout';
import { useWorkspaceContext } from '@/contexts/workspace-context';
import { ArrowRightStartOnRectangleIcon, PlayIcon } from '@heroicons/react/16/solid';
import { CommandLineIcon } from '@heroicons/react/24/solid';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

export function Dashboard({ children }: { children: React.ReactNode }) {
  let workspaceContext = useWorkspaceContext();
  let user = workspaceContext?.data?.user;
  let [isConfirmSignOutOpen, setConfirmSignOutOpen] = useState(false);

  const pathname = usePathname();

  return (
    <StackedLayout
      path={pathname || '/'}
      navbar={
        <Navbar>
          <NavbarSection className="max-lg:hidden"></NavbarSection>
          <NavbarSpacer />
          <NavbarSection>
            <Dropdown>
              <DropdownButton as={NavbarItem}>
                <Avatar src={user?.avatarUrl} square />
              </DropdownButton>
              <DropdownMenu className="min-w-64" anchor="bottom end">
                <DropdownItem href="#" onClick={() => setConfirmSignOutOpen(true)}>
                  <ArrowRightStartOnRectangleIcon />
                  <DropdownLabel>Sign out</DropdownLabel>
                </DropdownItem>
              </DropdownMenu>
              <Dialog open={isConfirmSignOutOpen} onClose={setConfirmSignOutOpen} size="xl">
                <DialogTitle>Sign Out?</DialogTitle>
                <DialogDescription>{"You're about to sign out of your account."}</DialogDescription>
                <DialogActions>
                  <Button color="dark" onClick={() => setConfirmSignOutOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    color="red"
                    onClick={() => {
                      workspaceContext?.helpers.signOut();
                      setConfirmSignOutOpen(false);
                    }}
                  >
                    Sign Out
                  </Button>
                </DialogActions>
              </Dialog>
            </Dropdown>
          </NavbarSection>
        </Navbar>
      }
      sidebar={
        <Sidebar className="!w-full lg:hidden">
          <SidebarHeader></SidebarHeader>
          <SidebarBody className="!w-full">
            <SidebarSection className="!w-full">
              <SidebarItem href="/" current={pathname === '/'} className="!w-full">
                <CommandLineIcon className="h-5 w-5" data-slot="icon" />
                Console
              </SidebarItem>
            </SidebarSection>
          </SidebarBody>
        </Sidebar>
      }
    >
      {children}

      {/* Watch Tutorials Button - Fixed at bottom left, below detail panes */}
      <div className="fixed left-6 bottom-6 z-10">
        <button
          className="flex cursor-pointer items-center gap-2 rounded-[9999px] border border-zinc-700 bg-zinc-800 px-6 py-3 text-white shadow-lg transition-all duration-200 hover:bg-zinc-700 hover:shadow-xl"
          onClick={() => {
            window.open('https://www.youtube.com/playlist?list=PL0FMgRjJMRzO1FdunpMS-aUS4GNkgyr3T', '_blank');
          }}
        >
          <PlayIcon className="h-4 w-4" />
          Watch Surfpool 101
        </button>
      </div>
    </StackedLayout>
  );
}
