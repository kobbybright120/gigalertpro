import { Bell } from "lucide-react";

export default function UpgradeBanner({ gigCount = 0, onUpgrade }) {
  if (gigCount <= 0) return null;

  return (
    <div className="sticky top-0 z-30 bg-gradient-to-r from-[#00F0B5]/[0.08] to-[#00D4FF]/[0.06] border-b border-[#00F0B5]/15 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-sm text-white font-medium text-center sm:text-left">
          <Bell className="w-4 h-4 inline-block text-[#00F0B5] mr-1.5 -mt-0.5" />
          <span className="text-[#00F0B5] font-bold">
            {gigCount} freelance gigs
          </span>{" "}
          match your skills across communities and job boards. You're only
          seeing 1.{" "}
          <span className="text-gray-400">Unlock all from $12/month.</span>
        </p>
        <button
          onClick={onUpgrade}
          className="shrink-0 px-5 py-2 bg-[#00F0B5] text-[#020617] text-sm font-bold rounded-xl hover:bg-[#00dba5] hover:shadow-[0_0_16px_rgba(0,240,181,0.2)] transition-all duration-200"
        >
          Unlock All Gigs
        </button>
      </div>
    </div>
  );
}
