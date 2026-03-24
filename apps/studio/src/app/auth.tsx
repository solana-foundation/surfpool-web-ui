import { Divider } from '@surfpool/ui'
import { logger } from '@surfpool/shared'
import { useWorkspaceContext } from '@/contexts/workspace-context'
import type { Metadata } from 'next'
import { useEffect, useState } from 'react'
import CreateAccount from '@/components/auth/create-account'
import CheckPasscode from '@/components/auth/check-passcode'
import CreatePasskey from '@/components/auth/create-passkey'
import SetupWorkspace from '@/components/auth/setup-workspace'
import { AnimatePresence, motion } from 'framer-motion'
import SignIn from '@/components/auth/sign-in'

export const metadata: Metadata = {
  title: 'Sign In',
}

export default function Auth() {
  const { helpers } = useWorkspaceContext() || {}

  const [email, setEmail] = useState('')
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState(1)
  const [hasMounted, setHasMounted] = useState(false)

  useEffect(() => {
    setHasMounted(true)
  }, [])

  const goToStep = (nextStep: number) => {
    setDirection(nextStep > step ? 1 : -1)
    setStep(nextStep)
  }

  const [onboardingState, setOnboardingState] = useState({
    signIn: false,
    createAccount: true,
    emailSubmitted: false,
    passcodeChecked: false,
    passkeyCreated: false,
    workspaceSetup: false,
  })

  const handleSubmitEmail = async (email: string) => {
    await helpers?.sendOtp(email)
    setEmail(email)
    setOnboardingState((prev) => ({ ...prev, emailSubmitted: true }))
    goToStep(1)
  }

  const handleGithubConnect = async () => {
    await helpers?.nhostClient.auth.signIn({
      provider: "github",
    });
  }  

  const handleSignInInstead = async () => {
    logger.log('signInInstead')
    setOnboardingState((prev) => ({ ...prev, signIn: true, createAccount: false }))
    goToStep(0)
  }

  const handleSignUpInstead = async () => {
    logger.log('signUpInstead')
    setOnboardingState((prev) => ({ ...prev, signIn: false, createAccount: true }))
    goToStep(1)
  }

  const handlePasscodeChecked = async (code: string) => {
    await helpers?.checkOtp(email, code)
    setOnboardingState((prev) => ({ ...prev, passcodeChecked: true }))
    goToStep(2)
  }

  const handlePasscodeCheckCanceled = async () => {
    setEmail("")
    setOnboardingState({
      signIn: false,
      createAccount: true,
      emailSubmitted: false,
      passcodeChecked: false,
      passkeyCreated: false,
      workspaceSetup: false,
    })
    goToStep(0)
  }

  const handlePasskeyCreated = async () => {
    setOnboardingState((prev) => ({ ...prev, passkeyCreated: true }))
    goToStep(3)
  }

  const handlePasskeyCreationSkipped = async () => {
    setOnboardingState((prev) => ({ ...prev, passkeyCreated: true }))
    goToStep(3)
  }

  const handleWorkspaceSetup = async () => {
    setOnboardingState((prev) => ({ ...prev, workspaceSetup: true }))
    let event = new CustomEvent('authenticationCompleted');
    window.dispatchEvent(event);
  }

  // Pick component by step
  let currentStepComponent = null
  if (!onboardingState.emailSubmitted) {
    currentStepComponent = (
      <CreateAccount onComplete={handleSubmitEmail} signInInstead={handleSignInInstead} githubConnect={handleGithubConnect} />
    )
  } else if (onboardingState.signIn) {
    currentStepComponent = (
      <SignIn onComplete={handleSignInInstead} signUpInstead={handleSignUpInstead} githubConnect={handleGithubConnect} />
    )
  } else if (!onboardingState.passcodeChecked) {
    currentStepComponent = (
      <CheckPasscode
        onComplete={handlePasscodeChecked}
        onCancel={handlePasscodeCheckCanceled}
      />
    )
  } else if (!onboardingState.passkeyCreated) {
    currentStepComponent = (
      <CreatePasskey
        onComplete={handlePasskeyCreated}
        onSkip={handlePasskeyCreationSkipped}
      />
    )
  } else if (!onboardingState.workspaceSetup) {
    currentStepComponent = (
      <SetupWorkspace onComplete={handleWorkspaceSetup} />
    )
  } else {
    currentStepComponent = <div>&quot;You&apos;re all set!&quot;</div>
  }
  
  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#0D1316' }}>
      <div className="flex flex-1 items-stretch">
        <div className="flex w-full items-center justify-center p-8 md:w-2/5">
          <div className="w-full md:w-[320px]">
            <img
              src="/assets/cloud.png"
              alt="Txtx Logo"
              className="block md:hidden mt-8 mb-14 mx-auto"
              style={{ height: '92px' }}
            />
            <AnimatePresence initial={false}>
              <motion.div
                key={step}
                initial={hasMounted ? { x: direction > 0 ? 300 : -300, opacity: 0 } : false}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: direction > 0 ? -300 : 300, opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                {currentStepComponent}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="hidden flex-1 items-center justify-center md:flex" style={{ backgroundColor: '#0F1518' }}>
          <img
            src="/assets/login.png"
            alt="Login Illustration"
            className="max-w-full object-contain"
            style={{ maxHeight: '80%', maxWidth: '100%' }}
          />
        </div>
      </div>
      <Divider className="" soft />
      <footer className="h-[150px] bg-gray-200 p-4 text-center" style={{ backgroundColor: '#0D1316' }}>
        <div className="flex h-full flex-col items-center justify-center">
          <div className="flex w-full items-start justify-between px-8">
            <div className="flex flex-col items-start">
              <img src="/assets/txtx.png" alt="Txtx Logo" className="mb-2" style={{ width: '64px', height: '64px' }} />
              <p className="text-white" style={{ opacity: 0.5 }}>
                &copy; 2025 Txtx, Inc. All rights reserved.
              </p>
            </div>
            <div className="flex flex-col items-end space-y-2">
              <a href="/terms" className="text-white hover:underline" style={{ opacity: 0.5 }}>
                Terms of Service
              </a>
              <a href="/privacy" className="text-white hover:underline" style={{ opacity: 0.5 }}>
                Privacy Policy
              </a>
              <a href="/contact" className="text-white hover:underline" style={{ opacity: 0.5 }}>
                Contact Us
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
