/**
 * Umami analytics helper for GigAlertPro.
 *
 * Umami exposes `window.umami.track(eventName, eventData)` once the
 * script.js has loaded.  All helpers here are safe to call before the
 * script loads — they silently no-op if umami is not yet available.
 */

function track(eventName, data = {}) {
  try {
    if (typeof window !== "undefined" && window.umami?.track) {
      window.umami.track(eventName, data);
    }
  } catch {
    // never let analytics break the app
  }
}

/* ─── Landing page ─────────────────────────────────────────────────────── */

export function trackScrollDepth(percent) {
  track("scroll_depth", { percent });
}

export function trackHeroCtaClick(label) {
  track("hero_cta_click", { label });
}

export function trackSecondaryCtaClick(label) {
  track("secondary_cta_click", { label });
}

export function trackSectionViewed(section) {
  track("section_viewed", { section });
}

export function trackFaqOpened(question) {
  track("faq_opened", { question });
}

export function trackPricingPlanClicked(plan) {
  track("pricing_plan_clicked", { plan });
}

export function trackLiveDemoStarted() {
  track("live_demo_started");
}

/* ─── Onboarding ───────────────────────────────────────────────────────── */

export function trackOnboardingStepViewed(step) {
  track("onboarding_step_viewed", { step });
}

export function trackOnboardingSkillAdded(skill) {
  track("onboarding_skill_added", { skill });
}

export function trackOnboardingSkillRemoved(skill) {
  track("onboarding_skill_removed", { skill });
}

export function trackOnboardingCompleted(skills) {
  track("onboarding_completed", {
    skill_count: skills.length,
    skills: skills.join(", "),
  });
}

/* ─── Dashboard ─────────────────────────────────────────────────────────── */

export function trackKeywordAdded(keyword) {
  track("keyword_added", { keyword });
}

export function trackKeywordRemoved(keyword) {
  track("keyword_removed", { keyword });
}

export function trackGigCardOpened(gigId, score) {
  track("gig_card_opened", { gig_id: gigId, score });
}

export function trackProposalGenerated(gigId, source) {
  track("proposal_generated", { gig_id: gigId, source });
}

export function trackProposalOutcomeMarked(outcome) {
  track("proposal_outcome_marked", { outcome });
}

export function trackNotificationToggled(enabled) {
  track("notification_toggled", { enabled });
}

export function trackUpgradeClicked(source) {
  track("upgrade_clicked", { source });
}

/* ─── Pricing modal ─────────────────────────────────────────────────────── */

export function trackPricingModalViewed(source) {
  track("pricing_modal_viewed", { source });
}

export function trackPricingModalClosed() {
  track("pricing_modal_closed");
}

export function trackPricingCheckoutStarted(tier, price) {
  track("pricing_checkout_started", { tier, price });
}

/* ─── Page navigation ───────────────────────────────────────────────────── */

export function trackPageViewed(page) {
  track("page_viewed", { page });
}
