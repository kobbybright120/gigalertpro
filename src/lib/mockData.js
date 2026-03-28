// Mock gig data simulating results from Reddit, Discord, and other sources
export const mockGigs = [
  {
    id: 1,
    title: "Logo Design for Tech Startup",
    budget: "$200",
    source: "Reddit – r/forhire",
    url: "https://reddit.com/r/forhire",
    keywords: ["logo design", "design"],
    postedAt: "2 hours ago",
  },
  {
    id: 2,
    title: "Build a Landing Page (React)",
    budget: "$500",
    source: "Discord – WebDev Jobs",
    url: "https://discord.com",
    keywords: ["react", "landing page", "web development"],
    postedAt: "4 hours ago",
  },
  {
    id: 3,
    title: "WordPress Blog Setup & Customization",
    budget: "$150",
    source: "Reddit – r/slavelabour",
    url: "https://reddit.com/r/slavelabour",
    keywords: ["wordpress", "blog"],
    postedAt: "5 hours ago",
  },
  {
    id: 4,
    title: "Social Media Graphics – 10 Posts",
    budget: "$120",
    source: "Discord – Freelance Hub",
    url: "https://discord.com",
    keywords: ["social media", "graphics", "design"],
    postedAt: "6 hours ago",
  },
  {
    id: 5,
    title: "Python Data Scraping Script",
    budget: "$300",
    source: "Reddit – r/forhire",
    url: "https://reddit.com/r/forhire",
    keywords: ["python", "data scraping", "automation"],
    postedAt: "8 hours ago",
  },
  {
    id: 6,
    title: "Mobile App UI/UX Design (Figma)",
    budget: "$800",
    source: "Discord – Design Gigs",
    url: "https://discord.com",
    keywords: ["ui/ux", "figma", "mobile app", "design"],
    postedAt: "10 hours ago",
  },
  {
    id: 7,
    title: "SEO Audit & Content Strategy",
    budget: "$250",
    source: "Reddit – r/forhire",
    url: "https://reddit.com/r/forhire",
    keywords: ["seo", "content", "marketing"],
    postedAt: "12 hours ago",
  },
  {
    id: 8,
    title: "Video Editing – YouTube Channel",
    budget: "$180",
    source: "Discord – Creative Work",
    url: "https://discord.com",
    keywords: ["video editing", "youtube"],
    postedAt: "1 day ago",
  },
];

// Generate a mock AI proposal
export function generateProposal(gigTitle) {
  return `Hi there!

I came across your listing for "${gigTitle}" and I'd love to help.

I have extensive experience in this area and have delivered similar projects for clients with great results. Here's what I can bring to the table:

• Quick turnaround with milestone-based delivery
• Clear communication throughout the project
• Revisions until you're 100% satisfied

I'd love to discuss the details further. Let's hop on a quick call or chat to align on the scope and timeline.

Looking forward to working together!

Best regards,
[Your Name]`;
}

// Sources being monitored
export const monitoredSources = [
  "Reddit – r/forhire",
  "Reddit – r/slavelabour",
  "Reddit – r/freelance",
  "Reddit – r/hiring",
  "Discord – WebDev Jobs",
  "Discord – Freelance Hub",
  "Discord – Design Gigs",
  "Discord – Creative Work",
  "Discord – Tech Freelancers",
  "Discord – StartupHire",
  "Reddit – r/jobbit",
  "Reddit – r/remotework",
  "Discord – Remote Pros",
  "Discord – Code & Coffee",
];
