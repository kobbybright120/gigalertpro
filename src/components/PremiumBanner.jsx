import { Crown } from "lucide-react";

export default function PremiumBanner() {
  return (
    <div className="bg-gradient-to-r from-[#00F0B5]/10 to-[#00D4FF]/10 border border-[#00F0B5]/20 rounded-xl p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Crown className="w-6 h-6 text-yellow-400" />
        <div>
          <p className="font-semibold text-white">Upgrade to Premium</p>
          <p className="text-sm text-gray-400">
            Unlimited alerts, AI proposals & priority scanning – $5/month
          </p>
        </div>
      </div>
      <button className="px-5 py-2 bg-[#00F0B5] text-[#020617] font-semibold text-sm rounded-lg hover:bg-[#00dba5] transition-colors shrink-0">
        Upgrade Now
      </button>
    </div>
  );
}
