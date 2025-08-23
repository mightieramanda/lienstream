import { useQuery } from "@tanstack/react-query";

interface DashboardStats {
  todaysLiens: number;
  airtableSynced: number;
  mailersSent: number;
  activeLeads: number;
}

export function StatusCards() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['/api/dashboard/stats'],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-pulse">
            <div className="flex items-center justify-between">
              <div>
                <div className="h-4 bg-slate-200 rounded w-24 mb-2"></div>
                <div className="h-8 bg-slate-200 rounded w-16"></div>
              </div>
              <div className="w-12 h-12 bg-slate-200 rounded-full"></div>
            </div>
            <div className="flex items-center mt-4">
              <div className="h-4 bg-slate-200 rounded w-12 mr-2"></div>
              <div className="h-4 bg-slate-200 rounded w-20"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <div className="bg-red-50 rounded-xl shadow-sm border border-red-200 p-6">
          <div className="text-red-600">Failed to load dashboard statistics</div>
        </div>
      </div>
    );
  }

  const cards = [
    {
      label: "Today's Liens",
      value: stats.todaysLiens,
      icon: "fas fa-file-medical",
      color: "emerald",
      change: "+12%",
      changeLabel: "vs yesterday"
    },
    {
      label: "Airtable Synced",
      value: stats.airtableSynced,
      icon: "fas fa-sync",
      color: "blue",
      change: stats.airtableSynced > 0 ? "95.7%" : "0%",
      changeLabel: "success rate"
    },
    {
      label: "Mailers Sent",
      value: stats.mailersSent,
      icon: "fas fa-envelope",
      color: "amber",
      change: "$892",
      changeLabel: "total cost"
    },
    {
      label: "Active Leads",
      value: stats.activeLeads,
      icon: "fas fa-phone",
      color: "purple",
      change: "31",
      changeLabel: "with phone #"
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div key={index} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6" data-testid={`card-${card.label.toLowerCase().replace(/\s+/g, '-')}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-slate-500 text-sm font-medium" data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-label`}>
                {card.label}
              </p>
              <p className="text-2xl font-bold text-slate-800 mt-1" data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-value`}>
                {card.value}
              </p>
            </div>
            <div className={`w-12 h-12 bg-${card.color}-100 rounded-full flex items-center justify-center`}>
              <i className={`${card.icon} text-${card.color}-600`}></i>
            </div>
          </div>
          <div className="flex items-center mt-4">
            <span className={`text-${card.color}-600 text-sm font-medium`} data-testid={`text-${card.label.toLowerCase().replace(/\s+/g, '-')}-change`}>
              {card.change}
            </span>
            <span className="text-slate-500 text-sm ml-2">
              {card.changeLabel}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
