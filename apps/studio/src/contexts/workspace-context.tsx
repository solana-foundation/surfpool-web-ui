'use client';

import { NhostClient, NhostSession, User } from '@nhost/react'
import React, { createContext, useContext, useEffect, useState } from 'react'

export interface WorkspaceContextType {
  data?: {
    user: User;
    session: NhostSession;
  };
  helpers: {
    nhostClient: NhostClient
    signOut: () => void
    sendOtp: (email: string) => void
    checkOtp: (email: string, passcode: string) => void
  }
  expectedRedirect?: string
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null);

export function WorkspaceProvider({
  children,
  nhostClient,
  redirectUrl,
}: React.PropsWithChildren<{ nhostClient: NhostClient; redirectUrl?: string }>) {
  let sessionAvailable = false;
  let data = undefined;
  const user = nhostClient.auth.getUser();
  const session = nhostClient.auth.getSession();
  if (session && user) {
    sessionAvailable = true;
    data = {
      session,
      user,
    };
  }
  const [isAuthenticating, setIsAuthenticating] = useState(!sessionAvailable);

  const signOut = () => {
    nhostClient.auth.signOut();
    localStorage.clear();
    setIsAuthenticating(false);
    setWorkspaceContext((prev) => ({
      helpers: prev.helpers,
      data: undefined,
    }));
  };

  const sendOtp = async (email: string) => {
    await nhostClient.auth.signInEmailOTP(
      email,
    )
  }

  const checkOtp = async (email: string, passcode: string) => {
    await nhostClient.auth.verifyEmailOTP(
      email,
      passcode
    )
  }

  const [workspaceContext, setWorkspaceContext] = useState<WorkspaceContextType>({
    data,
    helpers: {
      nhostClient,
      signOut,
      sendOtp,
      checkOtp,
    },
    expectedRedirect: redirectUrl,
  });

  useEffect(() => {
    const unsubscribe = nhostClient.auth.onAuthStateChanged(async (_, session) => {
      const user = nhostClient.auth.getUser();
      nhostClient.graphql.setAccessToken(nhostClient.auth.getAccessToken());
      const context = {
        user: user!,
        session: session!,
      };
      setIsAuthenticating(false);
      setWorkspaceContext((prev) => (prev ? { ...prev, data: context } : prev));
    });
    return () => {
      unsubscribe();
    };
  }, [nhostClient]);

  return (
    <div>
      <WorkspaceContext.Provider value={workspaceContext}>
        {children}
      </WorkspaceContext.Provider>
    </div>
  );
}

export const useWorkspaceContext = () => useContext(WorkspaceContext);
