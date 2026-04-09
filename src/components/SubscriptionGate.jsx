import { useState, useEffect, useRef } from "react";
import { useProfile } from "../lib/useSupabase";
import OnboardingFlow from "./OnboardingFlow";
import UpgradeModal from "./UpgradeModal";
import UpgradeBanner from "./UpgradeBanner";
import WelcomeModal from "./WelcomeModal";
import { LockedDashboardContext } from "../context/LockedDashboardContext";
import { PAYMENTS_ENABLED } from "../../payments.config.js";

const DISABLE_AUTH =
  import.meta.env.VITE_DISABLE_AUTH === "true" ||
  !import.meta.env.VITE_SUPABASE_URL ||
  (import.meta.env.VITE_SUPABASE_URL || "").includes("placeholder") ||
  !import.meta.env.VITE_SUPABASE_ANON_KEY;

const ACTIVE_STATUSES = ["active"];
const PAID_PLANS = ["basic", "pro", "agency"];
const POLL_TIMEOUT = 60_000;
const POLL_INTERVAL = 3_000;

export default function SubscriptionGate({ children }) {
  const { profile, loading, refetch } = useProfile();
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [onboardingGigCount, setOnboardingGigCount] = useState(0);

  // Detect ?checkout=success in URL — start polling profile until active
  const isCheckoutReturn =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("checkout") === "success";
  const [polling, setPolling] = useState(isCheckoutReturn);
  const pollRef = useRef(null);
  const pollStart = useRef(null);

  useEffect(() => {
    if (pollStart.current === null) pollStart.current = Date.now();
  }, []);

  useEffect(() => {
    if (!isCheckoutReturn || !PAYMENTS_ENABLED || DISABLE_AUTH) return;

    const tick = async () => {
      await refetch();
      if (Date.now() - pollStart.current > POLL_TIMEOUT) {
        clearInterval(pollRef.current);
        setPolling(false);
      }
    };

    pollRef.current = setInterval(tick, POLL_INTERVAL);
    tick();
    return () => clearInterval(pollRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Once the profile becomes active, stop polling, clear URL param, show welcome
  useEffect(() => {
    if (
      polling &&
      profile?.subscription_status &&
      ACTIVE_STATUSES.includes(profile.subscription_status)
    ) {
      clearInterval(pollRef.current);
      setPolling(false);
      setShowWelcome(true);
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("checkout");
        window.history.replaceState({}, "", url.toString());
      } catch {
        /* ignore */
      }
    }
  }, [profile, polling]);

  // Determine if onboarding should show (first-time user)
  useEffect(() => {
    if (loading) return;
    if (!PAYMENTS_ENABLED || DISABLE_AUTH) {
      // Demo mode: check localStorage
      const done = localStorage.getItem("gigalertpro_onboarding_completed");
      if (!done) setShowOnboarding(true);
      return;
    }
    if (profile && profile.onboarding_completed === false) {
      setShowOnboarding(true);
    }
  }, [profile, loading]);

  // Handler when onboarding completes
  function handleOnboardingComplete(skills, gigCount) {
    setOnboardingGigCount(gigCount);
    setShowOnboarding(false);
    // Force refetch to get updated keywords & onboarding flag
    refetch();
  }

  if (!PAYMENTS_ENABLED) {
    // Even without payments, show onboarding for first-time users
    if (showOnboarding) {
      return <OnboardingFlow onComplete={handleOnboardingComplete} />;
    }
    return children;
  }

  if (DISABLE_AUTH) {
    if (showOnboarding) {
      return <OnboardingFlow onComplete={handleOnboardingComplete} />;
    }
    return children;
  }

  // Show onboarding flow for first-time users
  if (showOnboarding && !polling) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />;
  }

  // Returned from checkout — show "Activating" spinner while polling
  if (polling) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#020617] gap-5">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#00F0B5] border-t-transparent" />
        <div className="text-center">
          <p className="text-white font-bold text-lg">
            Activating your subscription…
          </p>
          <p className="text-gray-500 text-sm mt-1">
            This usually takes a few seconds. Please wait.
          </p>
        </div>
      </div>
    );
  }

  // Still loading profile
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#020617]">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#00F0B5] border-t-transparent" />
      </div>
    );
  }

  // Active subscription — allow full access
  const status = profile?.subscription_status;
  const plan = profile?.plan;
  const hasPaidPlan = plan && PAID_PLANS.includes(plan);
  const isActive = status && ACTIVE_STATUSES.includes(status);

  if (isActive && hasPaidPlan) {
    return (
      <>
        {showWelcome && (
          <WelcomeModal plan={plan} onClose={() => setShowWelcome(false)} />
        )}
        {children}
      </>
    );
  }

  // Free / no plan — show locked dashboard (NOT a full blur wall)
  // The LockedDashboardWrapper passes context to children
  return (
    <>
      <UpgradeBanner
        gigCount={onboardingGigCount}
        onUpgrade={() => setShowUpgradeModal(true)}
      />
      <LockedDashboardContext.Provider
        value={{
          isLocked: true,
          onUpgrade: () => setShowUpgradeModal(true),
          onSeePlans: () => setShowUpgradeModal(true),
          gigCount: onboardingGigCount,
        }}
      >
        {children}
      </LockedDashboardContext.Provider>
      <UpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        gigCount={onboardingGigCount}
      />
    </>
  );
}
